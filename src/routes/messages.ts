import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import type { Config } from "../config.js";
import type { Router } from "../backends/router.js";
import { BackendError } from "../backends/types.js";
import { contentToText, flattenAnthropic } from "../transform.js";
import { extractExplicitId, prepareSession, type SessionStore } from "../session.js";
import { log } from "../util/log.js";
import type {
  AnthropicMessageResponse,
  AnthropicMessagesRequest,
} from "../types-anthropic.js";

function newId(): string {
  return `msg_${randomBytes(18).toString("hex")}`;
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

    // 세션 영속화: 이전 대화면 CLI 세션을 resume하고 새 턴만 전송.
    const sess = prepareSession({
      messages: body.messages,
      norm: (m) => ({ role: m.role, text: contentToText(m.content).trim() }),
      backend: backend.name,
      explicitId: extractExplicitId(req.header("x-cli2port-session"), body as Record<string, unknown>),
      config,
      store: sessions,
    });

    // resume 시엔 system이 세션에 이미 있으므로 다시 보내지 않는다.
    const { system, prompt } = flattenAnthropic(
      sess.resumeId ? undefined : body.system,
      sess.sendMessages,
    );
    const stream = body.stream === true;

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
      const gen = backend.run({ model, system, prompt, resumeId: sess.resumeId, signal: ac.signal });

      if (stream) {
        res.status(200);
        res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders?.();

        // 1) message_start (input_tokens는 아직 모르므로 0, 최종 usage는 message_delta에서 보정)
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
