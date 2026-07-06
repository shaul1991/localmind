import assert from "node:assert";
import { describe, it } from "node:test";
import type { Config } from "../config.js";
import { BackendError, type BackendRunOptions } from "./types.js";
import { createGeminiBackend } from "./gemini.js";

/** 테스트용 최소 config — Gemini 어댑터가 읽는 필드만 채운다. */
function cfg(overrides: Partial<Config> = {}): Config {
  return {
    geminiApiKey: "test-key",
    geminiBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    geminiDefaultModel: "gemini-3.5-flash",
    ...overrides,
  } as unknown as Config;
}

/** SSE 문자열을 body로 갖는 Response를 돌려주는 fake fetch. 요청은 captured에 기록. */
function fakeFetch(
  sse: string,
  status = 200,
  captured?: { url?: string; init?: RequestInit },
): typeof fetch {
  return (async (url: any, init: any) => {
    if (captured) {
      captured.url = String(url);
      captured.init = init;
    }
    return new Response(sse, {
      status,
      headers: { "content-type": "text/event-stream" },
    });
  }) as unknown as typeof fetch;
}

function opts(over: Partial<BackendRunOptions> = {}): BackendRunOptions {
  return {
    model: "gemini-3.5-flash",
    prompt: "안녕",
    signal: new AbortController().signal,
    ...over,
  };
}

/** async generator를 끝까지 소진해 yield된 델타와 최종 결과를 모은다. */
async function drain(gen: AsyncGenerator<string, any, void>) {
  const deltas: string[] = [];
  let next = await gen.next();
  while (!next.done) {
    deltas.push(next.value);
    next = await gen.next();
  }
  return { deltas, result: next.value };
}

// 표준 OpenAI 호환 스트리밍 SSE (Google OpenAI 호환 엔드포인트가 emit하는 형식, T1).
const OK_SSE = [
  `data: {"id":"x","object":"chat.completion.chunk","model":"gemini-3.5-flash","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}`,
  `data: {"id":"x","choices":[{"index":0,"delta":{"content":"안녕"},"finish_reason":null}]}`,
  `data: {"id":"x","choices":[{"index":0,"delta":{"content":"하세요"},"finish_reason":null}]}`,
  `data: {"id":"x","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}`,
  `data: {"id":"x","choices":[],"usage":{"prompt_tokens":12,"completion_tokens":5,"total_tokens":17}}`,
  `data: [DONE]`,
  ``,
].join("\n\n");

describe("gemini 백엔드 — OpenAI 호환 어댑터", () => {
  it("AC-4: 텍스트를 조각 단위로 순차 스트리밍한다(2+ 델타)", async () => {
    const be = createGeminiBackend(cfg(), { fetch: fakeFetch(OK_SSE) });
    const { deltas, result } = await drain(be.run(opts()));
    assert.ok(deltas.length >= 2, `델타 2+ 기대, 실제 ${deltas.length}`);
    assert.strictEqual(result.text, "안녕하세요");
  });

  it("AC-5: usage(입력·출력 토큰)를 0보다 큰 정수로 집계한다", async () => {
    const be = createGeminiBackend(cfg(), { fetch: fakeFetch(OK_SSE) });
    const { result } = await drain(be.run(opts()));
    assert.strictEqual(result.usage.inputTokens, 12);
    assert.strictEqual(result.usage.outputTokens, 5);
  });

  it("finish_reason을 OpenAI 종료 사유로 전달한다", async () => {
    const be = createGeminiBackend(cfg(), { fetch: fakeFetch(OK_SSE) });
    const { result } = await drain(be.run(opts()));
    assert.strictEqual(result.finishReason, "stop");
  });

  it("stateless — sessionId를 반환하지 않는다(멀티턴은 full-history)", async () => {
    const be = createGeminiBackend(cfg(), { fetch: fakeFetch(OK_SSE) });
    const { result } = await drain(be.run(opts()));
    assert.strictEqual(result.sessionId, undefined);
  });

  it("FR-1/FR-3: 올바른 URL·Bearer 인증·OpenAI messages 본문으로 요청한다", async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    const be = createGeminiBackend(cfg(), { fetch: fakeFetch(OK_SSE, 200, captured) });
    await drain(be.run(opts({ system: "너는 도우미다", prompt: "안녕" })));

    assert.strictEqual(
      captured.url,
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    );
    const headers = new Headers(captured.init!.headers as any);
    assert.strictEqual(headers.get("authorization"), "Bearer test-key");
    const body = JSON.parse(captured.init!.body as string);
    assert.strictEqual(body.model, "gemini-3.5-flash");
    assert.strictEqual(body.stream, true);
    assert.strictEqual(body.stream_options?.include_usage, true);
    // system → system 메시지, prompt → user 메시지
    assert.deepStrictEqual(body.messages, [
      { role: "system", content: "너는 도우미다" },
      { role: "user", content: "안녕" },
    ]);
  });

  it("FR-3: system이 없으면 user 메시지만 보낸다", async () => {
    const captured: { url?: string; init?: RequestInit } = {};
    const be = createGeminiBackend(cfg(), { fetch: fakeFetch(OK_SSE, 200, captured) });
    await drain(be.run(opts({ prompt: "안녕" })));
    const body = JSON.parse(captured.init!.body as string);
    assert.deepStrictEqual(body.messages, [{ role: "user", content: "안녕" }]);
  });

  it("AC-8: 키가 없으면 fetch 호출 없이 평이한 오류를 던진다", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return new Response("");
    }) as unknown as typeof fetch;
    const be = createGeminiBackend(cfg({ geminiApiKey: null } as Partial<Config>), {
      fetch: fetchImpl,
    });
    await assert.rejects(() => drain(be.run(opts())), (e: unknown) => {
      assert.ok(e instanceof BackendError);
      assert.match(e.message, /GEMINI_API_KEY|키/);
      return true;
    });
    assert.strictEqual(called, false, "키 없으면 네트워크 호출 안 함");
  });

  it("AC-9: 429(무료 한도)를 BackendError로 분류하고 한도 안내를 준다", async () => {
    const errBody = JSON.stringify({ error: { message: "quota exceeded", code: 429 } });
    const be = createGeminiBackend(cfg(), { fetch: fakeFetch(errBody, 429) });
    await assert.rejects(() => drain(be.run(opts())), (e: unknown) => {
      assert.ok(e instanceof BackendError);
      assert.strictEqual(e.status, 429);
      assert.match(e.message, /한도|quota|요청/i);
      return true;
    });
  });

  it("AC-9: 401/403(인증)을 BackendError로 분류한다", async () => {
    const be = createGeminiBackend(cfg(), {
      fetch: fakeFetch(JSON.stringify({ error: { message: "invalid key" } }), 403),
    });
    await assert.rejects(() => drain(be.run(opts())), (e: unknown) => {
      assert.ok(e instanceof BackendError);
      assert.strictEqual(e.status, 403);
      assert.match(e.message, /인증|키|권한/);
      return true;
    });
  });

  it("AC-9/FR-7: 401(인증)을 BackendError로 분류한다", async () => {
    const be = createGeminiBackend(cfg(), {
      fetch: fakeFetch(JSON.stringify({ error: { message: "bad key" } }), 401),
    });
    await assert.rejects(() => drain(be.run(opts())), (e: unknown) => {
      assert.ok(e instanceof BackendError);
      assert.strictEqual(e.status, 401);
      assert.strictEqual(e.code, "gemini_auth");
      return true;
    });
  });

  it("FR-7: 5xx(서버 오류)를 BackendError로 분류한다", async () => {
    const be = createGeminiBackend(cfg(), { fetch: fakeFetch("upstream boom", 500) });
    await assert.rejects(() => drain(be.run(opts())), (e: unknown) => {
      assert.ok(e instanceof BackendError);
      assert.strictEqual(e.status, 500);
      assert.strictEqual(e.code, "gemini_error");
      return true;
    });
  });

  it("FR-7: 네트워크 실패를 BackendError(gemini_network)로 래핑한다", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const be = createGeminiBackend(cfg(), { fetch: fetchImpl });
    await assert.rejects(() => drain(be.run(opts())), (e: unknown) => {
      assert.ok(e instanceof BackendError);
      assert.strictEqual(e.code, "gemini_network");
      return true;
    });
  });

  it("취소(abort)는 BackendError로 래핑하지 않고 그대로 전파한다(라우트가 취소 처리)", async () => {
    const ac = new AbortController();
    ac.abort();
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    const fetchImpl = (async () => {
      throw abortErr;
    }) as unknown as typeof fetch;
    const be = createGeminiBackend(cfg(), { fetch: fetchImpl });
    await assert.rejects(
      () => drain(be.run(opts({ signal: ac.signal }))),
      (e: unknown) => {
        assert.ok(!(e instanceof BackendError), "abort는 raw로 전파돼야 함");
        assert.strictEqual((e as Error).name, "AbortError");
        return true;
      },
    );
  });

  it("name은 gemini다", () => {
    const be = createGeminiBackend(cfg(), { fetch: fakeFetch(OK_SSE) });
    assert.strictEqual(be.name, "gemini");
  });
});
