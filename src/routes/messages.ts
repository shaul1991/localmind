import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import type { Config } from "../config.js";
import type { Router } from "../backends/router.js";
import { BackendError } from "../backends/types.js";
import { contentToText, flattenAnthropic } from "../transform.js";
import { extractExplicitId, prepareSession, toolsSignature, type SessionStore } from "../session.js";
import {
  buildToolSystemPrompt,
  normalizeAnthropicChoice,
  normalizeAnthropicTools,
  parseToolCalls,
  type ParsedToolCall,
} from "../tools.js";
import { log } from "../util/log.js";
import type {
  AnthropicMessageResponse,
  AnthropicMessagesRequest,
  AnthropicToolUseBlock,
} from "../types-anthropic.js";

function newId(): string {
  return `msg_${randomBytes(18).toString("hex")}`;
}

function newToolId(): string {
  return `toolu_${randomBytes(18).toString("hex")}`;
}

/** ParsedToolCall[] → Anthropic tool_use 블록(input은 객체). */
function toToolUseBlocks(calls: ParsedToolCall[]): AnthropicToolUseBlock[] {
  return calls.map((c) => ({
    type: "tool_use" as const,
    id: newToolId(),
    name: c.name,
    input: c.arguments ?? {},
  }));
}

/** OpenAI 스타일 finish_reason → Anthropic stop_reason 역매핑. */
function toStopReason(finish: string): string {
  switch (finish) {
    case "length":
      return "max_tokens";
    case "tool_calls":
      return "tool_use";
    case "stop":
    default:
      return "end_turn";
  }
}

/** Anthropic SSE는 `event: <타입>` 라인을 동반한다. */
function sseEvent(res: Response, type: string, data: unknown): void {
  res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...(data as object) })}\n\n`);
}

function setSseHeaders(res: Response): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
}

function emitMessageStart(res: Response, id: string, model: string): void {
  sseEvent(res, "message_start", {
    message: {
      id,
      type: "message",
      role: "assistant",
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  });
}

export function createMessagesHandler(router: Router, config: Config, sessions: SessionStore) {
  return async function messagesHandler(req: Request, res: Response): Promise<void> {
    const body = req.body as AnthropicMessagesRequest;

    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      res.status(400).json({
        type: "error",
        error: { type: "invalid_request_error", message: "messages 배열이 필요합니다." },
      });
      return;
    }

    const { backend, model } = router.resolve(body.model);

    // 함수 호출(A2 프롬프트 방식) 정의는 세션 준비보다 먼저 파싱한다 — tools 서명이
    // 세션 생성 시점과 다르면 resume하지 않아야 하기 때문(specs/013 FR-3).
    const toolDefs = normalizeAnthropicTools(body.tools);
    const toolChoice = normalizeAnthropicChoice(body.tool_choice);
    const toolsOn = toolDefs.length > 0 && toolChoice !== "none";

    // 세션 영속화: 이전 대화면 CLI 세션을 resume하고 새 턴만 전송.
    const sess = prepareSession({
      messages: body.messages,
      norm: (m) => ({ role: m.role, text: contentToText(m.content).trim() }),
      backend: backend.name,
      explicitId: extractExplicitId(req.header("x-localmind-session"), body as Record<string, unknown>),
      config,
      store: sessions,
      toolsSig: toolsOn ? toolsSignature(toolDefs, toolChoice) : undefined,
    });

    // resume 시엔 system이 세션에 이미 있으므로 다시 보내지 않는다.
    const { system, prompt } = flattenAnthropic(
      sess.resumeId ? undefined : body.system,
      sess.sendMessages,
    );
    const stream = body.stream === true;

    // tools 지시문을 system에 주입. resume이면 세션 system에 이미 들어있고, tools가
    // 달라진 경우는 위의 서명 검사로 fresh가 되므로 여기서 항상 최신 지시문이 들어간다.
    let runSystem = system;
    if (toolsOn && !sess.resumeId) {
      const toolPrompt = buildToolSystemPrompt(toolDefs, toolChoice);
      runSystem = system ? `${system}\n\n${toolPrompt}` : toolPrompt;
    }

    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), config.requestTimeoutMs);
    timeout.unref?.();
    res.on("close", () => {
      if (!res.writableEnded) ac.abort();
    });

    const id = newId();
    log.info(
      `messages: backend=${backend.name} model=${model} stream=${stream} msgs=${body.messages.length}` +
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
        const toolUses = parsed ? toToolUseBlocks(parsed) : null;
        const stopReason = toolUses ? "tool_use" : "end_turn";
        const outModel = result.model || model;
        const usage = {
          input_tokens: result.usage.inputTokens,
          output_tokens: result.usage.outputTokens,
        };

        if (stream) {
          setSseHeaders(res);
          emitMessageStart(res, id, outModel);
          if (toolUses) {
            toolUses.forEach((tu, i) => {
              sseEvent(res, "content_block_start", {
                index: i,
                content_block: { type: "tool_use", id: tu.id, name: tu.name, input: {} },
              });
              sseEvent(res, "content_block_delta", {
                index: i,
                delta: { type: "input_json_delta", partial_json: JSON.stringify(tu.input) },
              });
              sseEvent(res, "content_block_stop", { index: i });
            });
          } else {
            sseEvent(res, "content_block_start", { index: 0, content_block: { type: "text", text: "" } });
            sseEvent(res, "content_block_delta", {
              index: 0,
              delta: { type: "text_delta", text: result.text },
            });
            sseEvent(res, "content_block_stop", { index: 0 });
          }
          sseEvent(res, "message_delta", {
            delta: { stop_reason: stopReason, stop_sequence: null },
            usage,
          });
          sseEvent(res, "message_stop", {});
          res.end();
        } else {
          const response: AnthropicMessageResponse = {
            id,
            type: "message",
            role: "assistant",
            model: outModel,
            content: toolUses ?? [{ type: "text", text: result.text }],
            stop_reason: stopReason,
            stop_sequence: null,
            usage,
          };
          res.status(200).json(response);
        }
        return;
      }

      // ── 일반 모드 ────────────────────────────────────────────
      if (stream) {
        setSseHeaders(res);

        // 1) message_start (input_tokens는 아직 모르므로 0, 최종 usage는 message_delta에서 보정)
        emitMessageStart(res, id, model);
        // 2) content_block_start + ping
        sseEvent(res, "content_block_start", {
          index: 0,
          content_block: { type: "text", text: "" },
        });
        sseEvent(res, "ping", {});

        // 3) content_block_delta 반복
        let next = await gen.next();
        while (!next.done) {
          sseEvent(res, "content_block_delta", {
            index: 0,
            delta: { type: "text_delta", text: next.value },
          });
          next = await gen.next();
        }
        const result = next.value;
        sess.commit(result.sessionId, result.text);

        // 4) content_block_stop → message_delta(stop_reason + usage) → message_stop
        sseEvent(res, "content_block_stop", { index: 0 });
        sseEvent(res, "message_delta", {
          delta: { stop_reason: toStopReason(result.finishReason), stop_sequence: null },
          usage: {
            input_tokens: result.usage.inputTokens,
            output_tokens: result.usage.outputTokens,
          },
        });
        sseEvent(res, "message_stop", {});
        res.end();
      } else {
        let next = await gen.next();
        while (!next.done) next = await gen.next();
        const result = next.value;
        sess.commit(result.sessionId, result.text);

        const response: AnthropicMessageResponse = {
          id,
          type: "message",
          role: "assistant",
          model: result.model || model,
          content: [{ type: "text", text: result.text }],
          stop_reason: toStopReason(result.finishReason),
          stop_sequence: null,
          usage: {
            input_tokens: result.usage.inputTokens,
            output_tokens: result.usage.outputTokens,
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
      const type = err instanceof BackendError ? err.code : "api_error";

      log.error(`messages error (${type}):`, message);

      if (res.headersSent) {
        try {
          sseEvent(res, "error", { error: { type, message } });
        } catch {
          /* noop */
        }
        res.end();
      } else {
        res.status(status).json({ type: "error", error: { type, message } });
      }
      return;
    } finally {
      clearTimeout(timeout);
    }
  };
}
