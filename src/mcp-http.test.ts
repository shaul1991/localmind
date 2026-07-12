/**
 * specs/045 AC-1·2·3·5 — HTTP 전송 모드 통합 테스트.
 *
 * env(NOTES_DIR 등)를 brain import 전에 설정한다(node --test는 파일당 별도 프로세스라 격리).
 * 실제 HTTP 요청으로 검증하며, 도구를 "호출"하지 않으므로(초기화·tools/list·라우팅만) 임베딩
 * 게이트웨이가 없어도 된다.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lm-mcp-http-"));
process.env.HOME = TMP;
process.env.NOTES_DIR = path.join(TMP, "notes");
fs.mkdirSync(process.env.NOTES_DIR, { recursive: true });
process.env.BRAIN_INDEX = path.join(TMP, ".brain-index.json");
process.env.QUERY_LOG = path.join(TMP, "query-log.jsonl");

const TOKEN = "test-secret-token-abc123";

let serveHttp: typeof import("./mcp-http.js").serveHttp;
let buildServer: typeof import("./mcp-server.js").buildServer;
let ClientCtor: typeof import("@modelcontextprotocol/sdk/client/index.js").Client;
let HttpClientTransport: typeof import("@modelcontextprotocol/sdk/client/streamableHttp.js").StreamableHTTPClientTransport;
let InMemory: typeof import("@modelcontextprotocol/sdk/inMemory.js").InMemoryTransport;

let handle: import("./mcp-http.js").ServeHttpHandle;
let baseUrl: string;

before(async () => {
  ({ serveHttp } = await import("./mcp-http.js"));
  ({ buildServer } = await import("./mcp-server.js"));
  ({ Client: ClientCtor } = await import("@modelcontextprotocol/sdk/client/index.js"));
  ({ StreamableHTTPClientTransport: HttpClientTransport } = await import(
    "@modelcontextprotocol/sdk/client/streamableHttp.js"
  ));
  ({ InMemoryTransport: InMemory } = await import("@modelcontextprotocol/sdk/inMemory.js"));
  handle = await serveHttp({ host: "127.0.0.1", port: 0, path: "/mcp", token: TOKEN });
  baseUrl = `http://127.0.0.1:${handle.port}/mcp`;
});

after(async () => {
  await handle?.close();
  fs.rmSync(TMP, { recursive: true, force: true });
});

const initBody = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "raw", version: "0" } },
};
const jsonHeaders = { "content-type": "application/json", accept: "application/json, text/event-stream" };

/** buildServer가 등록한 도구 전체(코드 정본)를 in-memory 클라이언트로 확인 — 개수 하드코딩 금지. */
async function referenceToolNames(): Promise<string[]> {
  const server = buildServer();
  const [clientT, serverT] = InMemory.createLinkedPair();
  await server.connect(serverT);
  const client = new ClientCtor({ name: "ref", version: "0" });
  await client.connect(clientT);
  const { tools } = await client.listTools();
  await client.close();
  return tools.map((t) => t.name).sort();
}

test("AC-1: http tools/list가 buildServer 등록 도구 전체를 그대로 반환(개수 하드코딩 없이)", async () => {
  const ref = await referenceToolNames();
  assert.ok(ref.length >= 10, `참조 도구가 비정상적으로 적음(${ref.length})`); // sanity(현재 15)
  const client = new ClientCtor({ name: "t", version: "0" });
  const transport = new HttpClientTransport(new URL(baseUrl), {
    requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
  });
  await client.connect(transport); // initialize 핸드셰이크 + 세션 획득(세션 재사용 경로 검증 포함)
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    ref,
    "HTTP가 노출한 도구 집합이 buildServer 정본과 일치해야 한다",
  );
  await client.close();
});

test("AC-2: 토큰 없음/틀린 토큰 → 401, 도구 접근 불가", async () => {
  const noAuth = await fetch(baseUrl, { method: "POST", headers: jsonHeaders, body: JSON.stringify(initBody) });
  assert.equal(noAuth.status, 401);
  const badAuth = await fetch(baseUrl, {
    method: "POST",
    headers: { ...jsonHeaders, authorization: "Bearer wrong-token" },
    body: JSON.stringify(initBody),
  });
  assert.equal(badAuth.status, 401);
});

test("AC-5: 미지 세션 → 404, 세션 없는 비-initialize → 400", async () => {
  const auth = { ...jsonHeaders, authorization: `Bearer ${TOKEN}` };
  const toolsListBody = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  // 존재하지 않는 세션 id
  const unknown = await fetch(baseUrl, {
    method: "POST",
    headers: { ...auth, "mcp-session-id": "does-not-exist" },
    body: toolsListBody,
  });
  assert.equal(unknown.status, 404);
  // 세션 id 없이 비-initialize 요청
  const noSession = await fetch(baseUrl, { method: "POST", headers: auth, body: toolsListBody });
  assert.equal(noSession.status, 400);
});

test("AC-3: 토큰이 비어 있으면 serveHttp가 throw하고 포트를 열지 않는다", async () => {
  await assert.rejects(() => serveHttp({ host: "127.0.0.1", port: 0, path: "/mcp", token: "" }));
  await assert.rejects(() => serveHttp({ host: "127.0.0.1", port: 0, path: "/mcp", token: "   " }));
});

// FR-2/프라이버시 — 미인증 요청이 body 파서에 닿아 스택트레이스·절대경로를 노출하지 않아야 한다
// (self-review 중대 결함 회귀 방지: 인증을 파싱보다 앞에 둔다).
const NO_LEAK = (text: string) => {
  assert.ok(!/\/(Users|home|root|node_modules)\//.test(text), `응답에 절대경로/모듈경로가 새면 안 됨: ${text.slice(0, 120)}`);
  assert.ok(!/SyntaxError|\bat\s+\w+.*\(/.test(text), `스택트레이스가 새면 안 됨: ${text.slice(0, 120)}`);
};

test("보안: 미인증 + 깨진 JSON → 401(파서보다 인증 먼저, 스택/절대경로 미노출)", async () => {
  const res = await fetch(baseUrl, { method: "POST", headers: jsonHeaders, body: "{broken-json" });
  assert.equal(res.status, 401); // 인증이 파싱보다 앞 → 파서에 닿기 전에 401
  NO_LEAK(await res.text());
});

test("보안: 인증 + 깨진 JSON → 400 표준 JSON-RPC(스택/절대경로 미노출)", async () => {
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { ...jsonHeaders, authorization: `Bearer ${TOKEN}` },
    body: "{broken-json",
  });
  assert.equal(res.status, 400);
  const text = await res.text();
  NO_LEAK(text);
  const j = JSON.parse(text);
  assert.equal(j.jsonrpc, "2.0");
  assert.ok(j.error, "JSON-RPC error 객체가 있어야 한다");
});

test("보안: 인증 + 100kb 초과 본문 → 413(status 보존, 누출 없음)", async () => {
  const big = "x".repeat(200 * 1024); // express.json 기본 한도(100kb) 초과
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { ...jsonHeaders, authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list", params: { pad: big } }),
  });
  assert.equal(res.status, 413); // 400으로 뭉개지지 않고 원 status를 보존
  NO_LEAK(await res.text());
});
