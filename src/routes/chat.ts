import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { Config } from "../config.js";
import type { Router } from "../backends/router.js";
import { BackendError } from "../backends/types.js";
import { flattenMessages } from "../transform.js";
import { log } from "../util/log.js";
import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
} from "../types.js";

function newId(): string {
  return `chatcmpl-${randomUUID().replace(/-/g, "")}`;
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

export function createChatHandler(router: Router, config: Config) {
  return async function chatHandler(req: Request, res: Response): Promise<void> {
    const body = req.body as ChatCompletionRequest;

    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
      res.status(400).json({
        error: { message: "messages 배열이 필요합니다.", type: "invalid_request_error" },
      });
      return;
    }

    const { backend, model } = router.resolve(body.model);
    const { system, prompt } = flattenMessages(body.messages);
    const stream = body.stream === true;
    const includeUsage =
      stream && (body as any).stream_options?.include_usage === true;

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
      `chat: backend=${backend.name} model=${model} stream=${stream} msgs=${body.messages.length}`,
    );

    try {
      const gen = backend.run({ model, system, prompt, signal: ac.signal });

      if (stream) {
        res.status(200);
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders?.();

        // 첫 청크: role 알림
        sse(res, makeChunk(id, created, model, { role: "assistant" }, null));

        let result;
        let next = await gen.next();
        while (!next.done) {
          sse(res, makeChunk(id, created, model, { content: next.value }, null));
          next = await gen.next();
        }
        result = next.value;

        // 종료 청크
        sse(res, makeChunk(id, created, result.model || model, {}, result.finishReason));

        if (includeUsage) {
          const usageChunk: ChatCompletionChunk = {
            id,
            object: "chat.completion.chunk",
            created,
            model: result.model || model,
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
      } else {
        // 비스트리밍: 제너레이터를 끝까지 소진하고 최종 결과 사용
        let next = await gen.next();
        while (!next.done) next = await gen.next();
        const result = next.value;

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
