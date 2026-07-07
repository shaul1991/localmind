/**
 * specs/039 — 웹 설정 페이지 '연결 상태' 테스트.
 * 실행: npm test (node:test). 픽스처: 임시 home + config 파일.
 * AC 매핑: AC-1,2(desktop ok/missing) · AC-3(unknown) · AC-4(인증) · AC-5(gemini) ·
 *   AC-7(GET only) · AC-8(시크릿 미노출).
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  classifyMcpConfig,
  classifyPresence,
  claudeDesktopConfigPath,
  readConnections,
} from "./connection-status.js";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { createUiRouter, type UiDeps } from "./routes/ui.js";

describe("classifyMcpConfig — localmind 등록 판정", () => {
  it("localmind 항목 있으면 ok (AC-1)", () => {
    assert.equal(classifyMcpConfig({ kind: "parsed", data: { mcpServers: { localmind: {} } } }), "ok");
  });
  it("파일은 있으나 localmind 없으면 missing (AC-2)", () => {
    assert.equal(classifyMcpConfig({ kind: "parsed", data: { mcpServers: { other: {} } } }), "missing");
  });
  it("mcpServers 자체가 없으면 missing", () => {
    assert.equal(classifyMcpConfig({ kind: "parsed", data: {} }), "missing");
  });
  it("mcpServers가 배열(손상)이면 missing", () => {
    assert.equal(classifyMcpConfig({ kind: "parsed", data: { mcpServers: ["x"] } }), "missing");
  });
  it("파일 없음 → unknown (AC-3)", () => {
    assert.equal(classifyMcpConfig({ kind: "missing" }), "unknown");
  });
  it("파싱 실패 → unknown (AC-3)", () => {
    assert.equal(classifyMcpConfig({ kind: "unreadable" }), "unknown");
  });
  it("top-level이 객체가 아니면(배열·문자열 손상) unknown — 틀린 '안됨'보다 정직한 '확인 불가'", () => {
    assert.equal(classifyMcpConfig({ kind: "parsed", data: ["x"] }), "unknown");
    assert.equal(classifyMcpConfig({ kind: "parsed", data: "oops" }), "unknown");
    assert.equal(classifyMcpConfig({ kind: "parsed", data: null }), "unknown");
  });
});

describe("classifyPresence — 존재 여부만", () => {
  it("값 있으면 ok", () => assert.equal(classifyPresence("sk-abc"), "ok"));
  it("빈 문자열 missing", () => assert.equal(classifyPresence(""), "missing"));
  it("공백만 missing", () => assert.equal(classifyPresence("   "), "missing"));
  it("undefined missing", () => assert.equal(classifyPresence(undefined), "missing"));
});

describe("claudeDesktopConfigPath — OS별 경로", () => {
  it("macOS", () => {
    assert.ok(claudeDesktopConfigPath("/Users/x", "darwin").includes("Library/Application Support/Claude"));
  });
  it("linux", () => {
    const p = claudeDesktopConfigPath("/home/x", "linux");
    assert.ok(p.includes(".config") && p.includes("Claude"));
  });
  it("win32", () => {
    assert.ok(claudeDesktopConfigPath("C:\\Users\\x", "win32").includes("Claude"));
  });
});

describe("readConnections — 파일·환경 조립(우아한 저하·시크릿 미노출)", () => {
  let tmp: string;
  const write = (p: string, s: string) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, s);
  };

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lm-conn-"));
  });
  after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("전부 설정된 상태 → ok들 + 시크릿 원문 미노출 (AC-4,5,8)", () => {
    const home = path.join(tmp, "home-full");
    const envFile = path.join(tmp, "full.env");
    const SECRET = "oauth-super-secret-token-xyz";
    write(envFile, `CLAUDE_CODE_OAUTH_TOKEN=${SECRET}\nGEMINI_API_KEY=gm-secret-123\n`);
    write(claudeDesktopConfigPath(home, "darwin"), JSON.stringify({ mcpServers: { localmind: {} } }));
    write(path.join(home, ".claude.json"), JSON.stringify({ mcpServers: { localmind: {} } }));
    fs.mkdirSync(path.join(home, ".codex"), { recursive: true });
    const notes = path.join(tmp, "notes");
    fs.mkdirSync(notes, { recursive: true });

    const c = readConnections({
      envFile,
      folders: [{ label: "n", dir: notes }],
      homedir: home,
      platform: "darwin",
      codexHome: path.join(home, ".codex"),
    });
    assert.equal(c.claudeAuth, "ok");
    assert.equal(c.gemini, "ok");
    assert.equal(c.claudeCodeMcp, "ok");
    assert.equal(c.claudeDesktopMcp, "ok");
    assert.equal(c.codex, "ok");
    assert.equal(c.notesDir, "ok");
    // AC-8: 응답 직렬화에 시크릿 원문이 절대 없어야 한다.
    const json = JSON.stringify(c);
    assert.ok(!json.includes(SECRET), "시크릿 토큰이 응답에 노출됨");
    assert.ok(!json.includes("gm-secret-123"), "Gemini 키가 응답에 노출됨");
  });

  it("아무것도 없는 상태 → 인증/백엔드 missing, MCP config 파일 없음 → unknown (AC-3)", () => {
    const home = path.join(tmp, "home-empty");
    fs.mkdirSync(home, { recursive: true });
    const envFile = path.join(tmp, "empty.env");
    write(envFile, "CLAUDE_CODE_OAUTH_TOKEN=\nGEMINI_API_KEY=\n");

    const c = readConnections({
      envFile,
      folders: [{ label: "n", dir: path.join(tmp, "does-not-exist") }],
      homedir: home,
      platform: "darwin",
      codexHome: path.join(home, ".codex-none"),
    });
    assert.equal(c.claudeAuth, "missing");
    assert.equal(c.gemini, "missing");
    assert.equal(c.codex, "missing");
    assert.equal(c.notesDir, "missing");
    // config 파일이 없으므로 연결 여부를 알 수 없음 → unknown (틀린 "안됨" 금지)
    assert.equal(c.claudeCodeMcp, "unknown");
    assert.equal(c.claudeDesktopMcp, "unknown");
  });

  it(".env 파일 자체가 없어도 예외 없이 missing (FR-6)", () => {
    const c = readConnections({
      envFile: path.join(tmp, "nonexistent.env"),
      folders: [],
      homedir: path.join(tmp, "home-empty"),
      platform: "darwin",
      codexHome: path.join(tmp, "no-codex"),
    });
    assert.equal(c.claudeAuth, "missing");
  });
});

describe("UI 라우터 — 읽기 전용 불변 (AC-7)", () => {
  it("등록된 모든 라우트가 GET (쓰기 메서드 0)", () => {
    const deps = {
      projectDir: "/x",
      envFile: "/x/.env",
      folders: [],
      indexPath: "/x/.brain-index.json",
      queryLogPath: "/x/log",
      services: [],
      publicDir: "/x/public",
    } as unknown as UiDeps;
    const router = createUiRouter(deps);
    const methods = new Set<string>();
    for (const layer of (router as unknown as { stack: Array<{ route?: { methods: Record<string, boolean> } }> }).stack) {
      if (layer.route) for (const m of Object.keys(layer.route.methods)) methods.add(m);
    }
    methods.delete("_all");
    assert.deepEqual([...methods].sort(), ["get"], `GET 외 메서드 발견: ${[...methods]}`);
  });
});

describe("GET /connections — HTTP 통합 (200·스키마·시크릿 미노출, AC-8 HTTP층)", () => {
  let tmp: string;
  let server: http.Server;
  let base: string;
  const SECRET = "http-oauth-secret-abcdef123";

  before(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lm-conn-http-"));
    const envFile = path.join(tmp, ".env");
    fs.writeFileSync(envFile, `CLAUDE_CODE_OAUTH_TOKEN=${SECRET}\n`);
    const deps = {
      projectDir: tmp,
      envFile,
      folders: [],
      indexPath: path.join(tmp, ".brain-index.json"),
      queryLogPath: path.join(tmp, "log"),
      services: [],
      publicDir: tmp,
    } as unknown as UiDeps;
    const app = express();
    app.use("/", createUiRouter(deps));
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => {
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("200 + 6개 상태 키가 enum 값 + 응답에 시크릿 원문 없음", async () => {
    const res = await fetch(`${base}/connections`);
    assert.equal(res.status, 200);
    const raw = await res.text();
    assert.ok(!raw.includes(SECRET), "HTTP 응답에 시크릿 토큰이 노출됨");
    const body = JSON.parse(raw);
    for (const k of ["claudeAuth", "claudeCodeMcp", "claudeDesktopMcp", "gemini", "codex", "notesDir"]) {
      assert.ok(["ok", "missing", "unknown"].includes(body[k]), `${k} 상태값이 enum이 아님: ${body[k]}`);
    }
  });
});
