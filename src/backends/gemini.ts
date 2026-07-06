import type { Config } from "../config.js";
import { log } from "../util/log.js";
import { type Backend, type BackendResult, type BackendRunOptions, BackendError } from "./types.js";

/**
 * Gemini 백엔드 — Google의 **OpenAI 호환 엔드포인트**(`/v1beta/openai/chat/completions`)로
 * HTTP 스트리밍한다. CLI 어댑터(claude/codex)와 달리 프로세스가 아니라 fetch를 쓴다.
 *
 * 연동 근거(T1, ai.google.dev 2026-07-06): base=`.../v1beta/openai/`, Bearer 인증,
 * `stream:true`+`stream_options.include_usage:true`로 스트리밍+usage, 응답은 표준 OpenAI
 * SSE 형식(chat.completion.chunk). 호환 레이어는 beta.
 *
 * Gemini API는 stateless이므로 sessionId는 반환하지 않는다 — 멀티턴 연속성은 localmind가
 * flattenMessages로 전체 히스토리를 prompt에 실어 보내는 것으로 달성한다(specs/035).
 */

interface GeminiDeps {
  /** 테스트에서 fake fetch를 주입한다(포트별 Fake, 헌법 §8). 기본은 전역 fetch. */
  fetch?: typeof fetch;
}

/** HTTP 상태로 사용자 이해 가능한 BackendError를 만든다. */
function classifyError(status: number, bodyText: string): BackendError {
  let detail = bodyText;
  try {
    const j = JSON.parse(bodyText);
    detail = j?.error?.message ?? bodyText;
  } catch {
    /* 본문이 JSON이 아니면 원문 사용 */
  }
  if (status === 401 || status === 403) {
    return new BackendError(
      `Gemini 인증 실패 — API 키가 유효하지 않거나 권한이 없습니다. .env의 GEMINI_API_KEY를 확인하세요. (${detail})`,
      "gemini_auth",
      status,
    );
  }
  if (status === 429) {
    return new BackendError(
      `Gemini 요청 한도를 초과했습니다(무료 티어 한도일 수 있음). 잠시 후 다시 시도하세요. (${detail})`,
      "gemini_rate_limit",
      429,
    );
  }
  return new BackendError(`Gemini 오류 (HTTP ${status}): ${detail}`, "gemini_error", status);
}

async function safeText(resp: Response): Promise<string> {
  try {
    return await resp.text();
  } catch {
    return "";
  }
}

/**
 * fetch 스트리밍 본문(ReadableStream)에서 SSE 이벤트의 data 페이로드를 하나씩 yield한다.
 * 표준 SSE: 이벤트는 빈 줄(\n\n)로 구분, data 필드는 여러 `data:` 줄이면 \n으로 이어붙인다.
 */
async function* parseSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<string, void, void> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const emit = (block: string): string | null => {
    const dataLines = block
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).replace(/^ /, ""));
    return dataLines.length ? dataLines.join("\n") : null;
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const data = emit(block);
        if (data !== null) yield data;
      }
    }
    const tail = emit(buffer);
    if (tail !== null) yield tail;
  } finally {
    reader.releaseLock();
  }
}

export function createGeminiBackend(config: Config, deps: GeminiDeps = {}): Backend {
  const doFetch = deps.fetch ?? fetch;
  return {
    name: "gemini",
    async *run(opts: BackendRunOptions): AsyncGenerator<string, BackendResult, void> {
      const apiKey = config.geminiApiKey;
      if (!apiKey) {
        throw new BackendError(
          "Gemini API 키가 설정되지 않았습니다. .env의 GEMINI_API_KEY를 설정하세요.",
          "gemini_no_key",
          400,
        );
      }

      const base = (config.geminiBaseUrl || "").replace(/\/$/, "");
      const messages: { role: string; content: string }[] = [];
      if (opts.system && opts.system.trim()) {
        messages.push({ role: "system", content: opts.system });
      }
      messages.push({ role: "user", content: opts.prompt });

      const body = {
        model: opts.model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
      };

      let resp: Response;
      try {
        resp = await doFetch(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(body),
          signal: opts.signal,
        });
      } catch (e) {
        // 취소/타임아웃(abort)은 라우트가 "취소되었거나 타임아웃" 메시지로 처리하도록 그대로
        // 전파한다(claude/codex와 동작 일치). 그 외만 네트워크 오류로 래핑.
        if (opts.signal.aborted) throw e;
        throw new BackendError(
          `Gemini 요청을 보내지 못했습니다: ${(e as Error).message}`,
          "gemini_network",
          502,
        );
      }

      if (!resp.ok) {
        throw classifyError(resp.status, await safeText(resp));
      }
      if (!resp.body) {
        throw new BackendError("Gemini 응답 본문이 비어 있습니다.", "gemini_empty", 502);
      }

      let finalText = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let finishReason = "stop";
      let model = opts.model;

      for await (const data of parseSse(resp.body)) {
        if (data === "[DONE]") break;
        let obj: Record<string, any>;
        try {
          obj = JSON.parse(data);
        } catch {
          continue; // keep-alive 코멘트 등 비-JSON은 건너뛴다
        }
        if (typeof obj.model === "string") model = obj.model;
        const choice = obj.choices?.[0];
        if (choice) {
          const content = choice.delta?.content;
          if (typeof content === "string" && content) {
            finalText += content;
            yield content;
          }
          if (choice.finish_reason) finishReason = String(choice.finish_reason);
        }
        // include_usage → 마지막에 choices가 빈 usage 청크가 온다.
        if (obj.usage) {
          if (obj.usage.prompt_tokens != null) inputTokens = obj.usage.prompt_tokens;
          if (obj.usage.completion_tokens != null) outputTokens = obj.usage.completion_tokens;
        }
      }

      log.debug(`gemini done: ${outputTokens} out tokens, finish=${finishReason}`);

      return {
        text: finalText,
        usage: { inputTokens, outputTokens },
        finishReason,
        model,
        sessionId: undefined,
      };
    },
  };
}
