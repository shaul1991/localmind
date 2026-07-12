/**
 * specs/045 AC-4·AC-7 — 전송 선택·기본 바인딩 단위 테스트(순수, 부작용 없음).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTransportMode, httpConfigFromEnv } from "./mcp-transport.js";

test("AC-4: MCP_TRANSPORT 미설정/미지/stdio → stdio (하위호환)", () => {
  assert.equal(resolveTransportMode({}), "stdio");
  assert.equal(resolveTransportMode({ MCP_TRANSPORT: "stdio" }), "stdio");
  assert.equal(resolveTransportMode({ MCP_TRANSPORT: "STDIO" }), "stdio");
  assert.equal(resolveTransportMode({ MCP_TRANSPORT: "  stdio  " }), "stdio");
  assert.equal(resolveTransportMode({ MCP_TRANSPORT: "weird-value" }), "stdio"); // 미지 값 → 안전 기본
});

test("AC-4: MCP_TRANSPORT=http(대소문자 무관) → http", () => {
  assert.equal(resolveTransportMode({ MCP_TRANSPORT: "http" }), "http");
  assert.equal(resolveTransportMode({ MCP_TRANSPORT: "HTTP" }), "http");
  assert.equal(resolveTransportMode({ MCP_TRANSPORT: " http " }), "http");
});

test("AC-7: 기본 바인딩은 비공개(127.0.0.1)·8789·/mcp, 토큰 없음", () => {
  const c = httpConfigFromEnv({});
  assert.equal(c.host, "127.0.0.1"); // 기본은 loopback — 외부 인터페이스 미개방
  assert.equal(c.port, 8789); // 8787 스택·4000 litellm·8788 UI 회피
  assert.equal(c.path, "/mcp");
  assert.equal(c.token, "");
});

test("AC-7: 네트워크 노출은 명시적 opt-in만", () => {
  assert.equal(httpConfigFromEnv({ MCP_HTTP_HOST: "0.0.0.0" }).host, "0.0.0.0");
  assert.equal(httpConfigFromEnv({ MCP_HTTP_PORT: "9000" }).port, 9000);
  assert.equal(httpConfigFromEnv({ MCP_HTTP_PATH: "/brain" }).path, "/brain");
  // 잘못된 포트는 안전 기본으로
  assert.equal(httpConfigFromEnv({ MCP_HTTP_PORT: "not-a-number" }).port, 8789);
});
