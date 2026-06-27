import { randomBytes, randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { Config } from "../config.js";
import type { Router } from "../backends/router.js";
import { BackendError, type BackendResult } from "../backends/types.js";
import { contentToText, flattenMessages } from "../transform.js";
import { extractExplicitId, prepareSession, type SessionStore } from "../session.js";
import {
  buildToolSystemPrompt,
  normalizeOpenAIChoice,
  normalizeOpenAITools,
  parseToolCalls,
  type ParsedToolCall,
} from "../tools.js";
import { log } from "../util/log.js";
import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ToolCall,
} from "../types.js";

function newId(): string {
  return `chatcmpl-${randomUUID().replace(/-/g, "")}`;
}

/** ParsedToolCall[] → OpenAI tool_calls(인자는 JSON 문자열). */
function toOpenAIToolCalls(calls: ParsedToolCall[]): ToolCall[] {
  return calls.map((c) => ({
    id: `call_${randomBytes(12).toString("hex")}`,
    type: "function" as const,
    function: { name: c.name, arguments: JSON.stringify(c.arguments ?? {}) },
  }));
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function makeChunk(
  id: string,
  created: number,
  model: string,
  delta: { role?: "assistant"; content?: string },
  finish_reason: string | null,
): ChatCompletionChunk {
  return {
    id,
    object: "chat.completion.chunk",
    created,
    model,
    choices: [{ index: 0, delta, finish_reason }],
  };
}

function sse(res: Response, data: unknown): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/** 종료 청크 + (옵션)usage 청크 + [DONE]를 쓰고 스트림을 닫는다. */
function finishStream(
  res: Response,
  id: string,
  created: number,
  model: string,
  finishReason: string,
  result: BackendResult,
  includeUsage: boolean,
): void {
  sse(res, makeChunk(id, created, model, {}, finishReason));
  if (includeUsage) {
    const usageChunk: ChatCompletionChunk = {
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [],
      usage: {
        prompt_tokens: result.usage.inputTokens,
        completion_tokens: result.usage.outputTokens,
        total_tokens: result.usage.inputTokens + result.usage.outputTokens,
      },
    };
    sse(res, usageChunk);
  }
  res.write("data: [DONE]\n\n");
  res.end();
}

function setSseHeaders(res: Response): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
}

export function createChatHandler(router: Router, config: Config, sessions: SessionStore) {
  return async function chatHandler(req: Request, res: Response): Promise<void> {
    const body = req.body as ChatCompletionRequest;

    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      res.status(400).json({
        error: { message: "messages 배열이 필요합니다.", type: "invalid_request_error" },
      });
      return;
    }

    const { backend, model } = router.resolve(body.model);

    // 세션 영속화: 이전 대화면 CLI 세션을 resume하고 새 턴만 전송.
    const sess = prepareSession({
      messages: body.messages,
      norm: (m) => ({ role: m.role, text: contentToText(m.content).trim() }),
      backend: backend.name,
      explicitId: extractExplicitId(req.header("x-cli2port-session"), body as Record<string, unknown>),
      config,
      store: sessions,
    });

    // OpenAI는 system이 메시지 배열에 포함 → fresh면 자동 추출, resume면 새 턴엔 없음.
    const { system, prompt } = flattenMessages(sess.sendMessages);
    const stream = body.stream === true;
    const includeUsage =
      stream && (body as any).stream_options?.include_usage === true;

    // 함수 호출(A2 프롬프트 방식): tools가 있으면 지시문을 system에 주입.
    // resume 시엔 세션 system에 이미 들어있으므로 새로 넣지 않는다.
    const toolDefs = normalizeOpenAITools(body.tools);
    const toolChoice = normalizeOpenAIChoice((body as any).tool_choice);
    const toolsOn = toolDefs.length > 0 && toolChoice !== "none";
    let runSystem = system;
    if (toolsOn && !sess.resumeId) {
      const toolPrompt = buildToolSystemPrompt(toolDefs, toolChoice);
      runSystem = system ? `${system}\n\n${toolPrompt}` : toolPrompt;
    }

    // 요청 취소/타임아웃 → AbortController
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), config.requestTimeoutMs);
    timeout.unref?.();
    // 주의: req('close')는 본문을 다 읽으면 바로 발생하므로 쓰면 안 된다.
    // 응답이 끝나기 전에 연결이 닫히면(클라이언트 중단) 그때만 abort.
    res.on("close", () => {
      if (!res.writableEnded) ac.abort();
    });

    const id = newId();
    const created = nowSec();

    log.info(
      `chat: backend=${backend.name} model=${model} stream=${stream} msgs=${body.messages.length}` +
        (sess.resumeId ? ` resume=${sess.resumeId.slice(0, 8)}` : ""),
    );

    try {
      const gen = backend.run({
        model,
        system: runSystem,
        prompt,
        resumeId: sess.resumeId,
        signal: ac.signal,
      });

      // ── 함수 호출 모드 ───────────────────────────────────────
      // 도구 호출 여부는 전체 출력을 봐야 알 수 있어 버퍼링한 뒤 결정한다.
      if (toolsOn) {
        let next = await gen.next();
        while (!next.done) next = await gen.next();
        const result = next.value;
        sess.commit(result.sessionId, result.text);

        const parsed = parseToolCalls(result.text);
        const toolCalls = parsed ? toOpenAIToolCalls(parsed) : null;
        const finishReason = toolCalls ? "tool_calls" : "stop";
        const outModel = result.model || model;

        if (stream) {
          setSseHeaders(res);
          sse(res, makeChunk(id, created, outModel, { role: "assistant" }, null));
          if (toolCalls) {
            sse(res, {
              id,
              object: "chat.completion.chunk",
              created,
              model: outModel,
              choices: [
                {
                  index: 0,
                  delta: {
                    tool_calls: toolCalls.map((tc, i) => ({ index: i, ...tc })),
                  },
                  finish_reason: null,
                },
              ],
            } satisfies ChatCompletionChunk);
          } else if (result.text) {
            sse(res, makeChunk(id, created, outModel, { content: result.text }, null));
          }
          finishStream(res, id, created, outModel, finishReason, result, includeUsage);
        } else {
          const response: ChatCompletionResponse = {
            id,
            object: "chat.completion",
            created,
            model: outModel,
            choices: [
              {
                index: 0,
                message: toolCalls
                  ? { role: "assistant", content: null, tool_calls: toolCalls }
                  : { role: "assistant", content: result.text },
                finish_reason: finishReason,
              },
            ],
            usage: {
              prompt_tokens: result.usage.inputTokens,
              completion_tokens: result.usage.outputTokens,
              total_tokens: result.usage.inputTokens + result.usage.outputTokens,
            },
          };
          res.status(200).json(response);
        }
        return;
      }

      // ── 일반 모드 ────────────────────────────────────────────
      if (stream) {
        setSseHeaders(res);

        // 첫 청크: role 알림
        sse(res, makeChunk(id, created, model, { role: "assistant" }, null));

        let next = await gen.next();
        while (!next.done) {
          sse(res, makeChunk(id, created, model, { content: next.value }, null));
          next = await gen.next();
        }
        const result = next.value;
        sess.commit(result.sessionId, result.text);

        finishStream(res, id, created, result.model || model, result.finishReason, result, includeUsage);
      } else {
        // 비스트리밍: 제너레이터를 끝까지 소진하고 최종 결과 사용
        let next = await gen.next();
        while (!next.done) next = await gen.next();
        const result = next.value;
        sess.commit(result.sessionId, result.text);

        const response: ChatCompletionResponse = {
          id,
          object: "chat.completion",
          created,
          model: result.model || model,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: result.text },
              finish_reason: result.finishReason,
            },
          ],
          usage: {
            prompt_tokens: result.usage.inputTokens,
            completion_tokens: result.usage.outputTokens,
            total_tokens: result.usage.inputTokens + result.usage.outputTokens,
          },
        };
        res.status(200).json(response);
      }
    } catch (err) {
      clearTimeout(timeout);
      const aborted = ac.signal.aborted;
      const status = err instanceof BackendError ? err.status : 500;
      const message =
        aborted && !(err instanceof BackendError)
          ? "요청이 취소되었거나 타임아웃되었습니다."
          : err instanceof Error
            ? err.message
            : String(err);
      const code = err instanceof BackendError ? err.code : "internal_error";

      log.error(`chat error (${code}):`, message);

      if (res.headersSent) {
        // 스트리밍 도중 오류 → 에러 이벤트 후 종료
        try {
          sse(res, { error: { message, type: code } });
          res.write("data: [DONE]\n\n");
        } catch {
          /* noop */
        }
        res.end();
      } else {
        res.status(status).json({ error: { message, type: code } });
      }
      return;
    } finally {
      clearTimeout(timeout);
    }
  };
}
