/**
 * server.ts Host 헤더 검증 미들웨어 단위 테스트 (specs/011 트랙 A).
 * 임베딩 서버 불필요 — 임시 포트에 listen 후 http.request로 Host 헤더를 변조해 검증.
 * (fetch는 Host를 금지 헤더로 취급해 설정 불가 → node:http 사용.)
 * 실행: npm test
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { loadConfig } from "./config.js";
import { createServer } from "./server.js";

// 주어진 env로 config를 만들고 앱을 임시 포트에 띄운다.
async function startWith(env: Record<string, string | undefined>): Promise<{ port: number; close: () => Promise<void> }> {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]!; }
  const config = loadConfig();
  for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]!; }
  const app = createServer(config);
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  return { port, close: () => new Promise<void>((r) => server.close(() => r())) };
}

// Host 헤더를 변조한 요청. status code를 반환.
function reqHost(port: number, hostHeader: string, urlPath = "/v1/models"): Promise<number> {
  return new Promise((resolve) => {
    const isPost = urlPath.startsWith("/v1/chat") || urlPath.startsWith("/v1/messages");
    const r = http.request(
      { host: "127.0.0.1", port, path: urlPath, method: isPost ? "POST" : "GET", headers: { host: hostHeader, "content-type": "application/json" } },
      (res) => { res.resume(); res.on("end", () => resolve(res.statusCode ?? 0)); },
    );
    r.on("error", () => resolve(0));
    r.end(isPost ? "{}" : undefined);
  });
}

describe("Host 헤더 검증 (기본 설정)", () => {
  let srv: { port: number; close: () => Promise<void> };
  before(async () => { srv = await startWith({ LOCALMIND_ALLOWED_HOSTS: undefined }); });
  after(async () => { await srv.close(); });

  it("AC-1: 위조 Host(evil)는 403", async () => {
    assert.equal(await reqHost(srv.port, "evil.example.com"), 403);
  });
  it("AC-2: localhost:8787은 통과(403 아님)", async () => {
    assert.notEqual(await reqHost(srv.port, "localhost:8787"), 403);
  });
  it("AC-2: 컨테이너 내부 localmind:8787은 통과(403 아님)", async () => {
    assert.notEqual(await reqHost(srv.port, "localmind:8787"), 403);
  });
  it("AC-2: 127.0.0.1은 통과(403 아님)", async () => {
    assert.notEqual(await reqHost(srv.port, "127.0.0.1"), 403);
  });
  it("AC-4: /health는 임의 Host라도 200", async () => {
    assert.equal(await reqHost(srv.port, "evil.example.com", "/health"), 200);
  });
  it("회귀: Host 매칭은 대소문자를 구분하지 않는다(self-review #1)", async () => {
    assert.notEqual(await reqHost(srv.port, "LOCALHOST"), 403);
    assert.notEqual(await reqHost(srv.port, "Localhost:8787"), 403);
  });
});

describe("Host 허용 목록 구성 (LOCALMIND_ALLOWED_HOSTS)", () => {
  it("AC-3: 추가 방식 — 지정 호스트와 기본 목록 둘 다 통과, evil은 403", async () => {
    const srv = await startWith({ LOCALMIND_ALLOWED_HOSTS: "myproxy.local" });
    try {
      assert.notEqual(await reqHost(srv.port, "myproxy.local"), 403, "지정 호스트 통과");
      assert.notEqual(await reqHost(srv.port, "localhost"), 403, "기본 목록 유지");
      assert.equal(await reqHost(srv.port, "evil.example.com"), 403, "미허용은 차단");
    } finally { await srv.close(); }
  });
  it("AC-3: '*'는 검증을 끈다(모든 Host 통과)", async () => {
    const srv = await startWith({ LOCALMIND_ALLOWED_HOSTS: "*" });
    try {
      assert.notEqual(await reqHost(srv.port, "evil.example.com"), 403);
    } finally { await srv.close(); }
  });
  it("회귀: 대문자로 지정한 허용 호스트도 소문자 클라이언트 Host와 매칭(self-review #1)", async () => {
    const srv = await startWith({ LOCALMIND_ALLOWED_HOSTS: "MyProxy.Local" });
    try {
      assert.notEqual(await reqHost(srv.port, "myproxy.local"), 403);
    } finally { await srv.close(); }
  });
});
