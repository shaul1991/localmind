/**
 * specs/046 — 웹 설치 위저드 순수 함수 단위 테스트.
 * 보안·거부·미노출(AC-3·AC-4·AC-7)은 실제 docker·claude·네트워크 없이 결정론적으로 검증한다
 * (spawn·fs를 주입/spy로 격리). 실행기: node --test (package.json scripts.test 글롭 scripts/*.test.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  COMMANDS,
  SECRET_KEYS,
  BIND_HOST,
  resolveCommand,
  hostAllowed,
  maskSecret,
  resolveSecretKey,
  buildSecretResponse,
  parseMcpList,
  writeEnvVar,
  runCommand,
} from "./install-wizard.mjs";

// ── AC-3: 임의·파괴 명령 거부 (고정 화이트리스트만) ─────────────────────────
test("AC-3: resolveCommand는 화이트리스트 id만 허용하고 나머지는 null", () => {
  // 허용(고정 목록)
  assert.ok(resolveCommand("up"));
  assert.ok(resolveCommand("mcp-install"));
  assert.ok(resolveCommand("doctor"));
  // 파괴적·비화이트리스트 → null
  for (const bad of ["down", "clean", "purge", "trash-empty", "reindex", "rm -rf", "", "../up", "UP"]) {
    assert.equal(resolveCommand(bad), null, `${JSON.stringify(bad)}는 거부돼야 함`);
  }
  // 비문자열 입력도 안전하게 null
  for (const bad of [null, undefined, 42, {}, ["up"], { id: "up" }]) {
    assert.equal(resolveCommand(bad), null);
  }
});

test("AC-3: 화이트리스트 밖 id는 spawn을 호출하지 않는다(spy)", async () => {
  let spawnCalls = 0;
  const spawnFn = () => {
    spawnCalls++;
    throw new Error("화이트리스트 밖 명령인데 spawn이 호출됨");
  };
  const res = await runCommand("clean", { spawnFn, onData: () => {} });
  assert.equal(spawnCalls, 0, "거부된 명령은 spawn을 부르면 안 됨");
  assert.equal(res.rejected, true);
  assert.equal(res.ok, false);
});

test("AC-3: 화이트리스트 id는 spawn을 호출하고 종료코드를 전달한다(fake spawn)", async () => {
  const events = {};
  const fakeChild = {
    stdout: { on: (ev, cb) => { events[`out:${ev}`] = cb; } },
    stderr: { on: (ev, cb) => { events[`err:${ev}`] = cb; } },
    on: (ev, cb) => { events[ev] = cb; },
  };
  let spawnedWith = null;
  const spawnFn = (cmd, args) => { spawnedWith = { cmd, args }; return fakeChild; };
  const chunks = [];
  const p = runCommand("up", { spawnFn, onData: (d) => chunks.push(d) });
  // 스트리밍 시뮬레이션
  events["out:data"](Buffer.from("준비 중... 1/120\n"));
  events["err:data"](Buffer.from("build log\n"));
  events["close"](0);
  const res = await p;
  assert.equal(spawnedWith.cmd, "bash");
  assert.match(spawnedWith.args[0], /scripts\/up\.sh$/);
  assert.equal(res.ok, true);
  assert.equal(res.code, 0);
  assert.deepEqual(chunks, ["준비 중... 1/120\n", "build log\n"]);
});

// ── AC-7: 보안 바인딩(Host 검증·루프백) ─────────────────────────────────────
test("AC-7: hostAllowed는 루프백 Host만 허용", () => {
  for (const ok of [
    "127.0.0.1", "127.0.0.1:8799", "localhost", "localhost:8799",
    "LOCALHOST:8799", "[::1]", "[::1]:8799",
  ]) {
    assert.equal(hostAllowed(ok), true, `${ok} 허용돼야 함`);
  }
  for (const bad of [
    "evil.com", "attacker.com:8799", "192.168.1.5:8799", "10.0.0.2",
    "localmind.example.com", "127.0.0.1.evil.com", "", null, undefined, 42,
    "0.0.0.0:8799", "example.com:127.0.0.1",
  ]) {
    assert.equal(hostAllowed(bad), false, `${JSON.stringify(bad)} 거부돼야 함`);
  }
});

test("AC-7: 서버 바인딩 호스트는 127.0.0.1 고정", () => {
  assert.equal(BIND_HOST, "127.0.0.1");
});

// ── AC-4: 토큰 서버측 기록·미노출 ───────────────────────────────────────────
test("AC-4: maskSecret은 원문을 반환하지 않고 끝 4자 힌트만", () => {
  const secret = "sk-ant-oat01-abcdef_SECRET_TAIL9999";
  const m = maskSecret("CLAUDE_CODE_OAUTH_TOKEN", secret);
  assert.equal(m.set, true);
  assert.ok(!m.hint.includes(secret), "힌트에 원문이 없어야 함");
  assert.ok(!JSON.stringify(m).includes("SECRET_TAIL"), "직렬화 결과에 원문 조각 없어야 함");
  assert.match(m.hint, /9999$/); // 끝 4자만
  // 빈 값
  assert.equal(maskSecret("X", "").set, false);
  // 짧은 값은 힌트를 노출하지 않음
  assert.equal(maskSecret("X", "abc").hint, "");
});

test("AC-4: resolveSecretKey는 알려진 항목만 env 이름으로", () => {
  assert.equal(resolveSecretKey("claude"), "CLAUDE_CODE_OAUTH_TOKEN");
  assert.equal(resolveSecretKey("gemini"), "GEMINI_API_KEY");
  for (const bad of ["PATH", "LITELLM_MASTER_KEY", "../x", "", null, 1]) {
    assert.equal(resolveSecretKey(bad), null);
  }
});

test("AC-4: buildSecretResponse 응답 body에 원문이 절대 실리지 않는다", () => {
  const secret = "AIzaSy_RAWKEYVALUE_9999";
  const r = buildSecretResponse("gemini", secret);
  assert.equal(r.status, 200);
  assert.equal(r.envName, "GEMINI_API_KEY");
  const serialized = JSON.stringify(r.body);
  assert.ok(!serialized.includes(secret), "응답 body 직렬화에 원문 금지");
  assert.ok(!serialized.includes("RAWKEYVALUE"), "원문 조각도 금지");
  assert.equal(r.body.set, true);
  // 미등록 키는 400 + 기록 안내 없음
  assert.equal(buildSecretResponse("unknown", "x").status, 400);
});

test("AC-4: writeEnvVar는 격리 .env에 기록하고 원문을 응답에 두지 않으며 chmod 600", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wizard-env-"));
  const envPath = path.join(dir, ".env");
  fs.writeFileSync(envPath, "# comment\nEXISTING=1\nGEMINI_API_KEY=old\n");
  const ret = writeEnvVar(envPath, "GEMINI_API_KEY", "NEWSECRET123");
  assert.equal(ret, true);
  const content = fs.readFileSync(envPath, "utf8");
  assert.match(content, /^GEMINI_API_KEY=NEWSECRET123$/m, "값이 교체돼야 함");
  assert.ok(!/GEMINI_API_KEY=old/.test(content), "옛 값은 남지 않아야 함");
  assert.match(content, /# comment/, "주석 보존");
  assert.match(content, /EXISTING=1/, "다른 키 보존");
  // 새 키 append
  writeEnvVar(envPath, "CLAUDE_CODE_OAUTH_TOKEN", "sk-ant-XYZ");
  assert.match(fs.readFileSync(envPath, "utf8"), /^CLAUDE_CODE_OAUTH_TOKEN=sk-ant-XYZ$/m);
  // 권한 600 (POSIX)
  if (process.platform !== "win32") {
    assert.equal(fs.statSync(envPath).mode & 0o777, 0o600);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── AC-5(일부): MCP 등록 폴링 파싱 ──────────────────────────────────────────
test("AC-5: parseMcpList는 localmind 등록을 정확히 감지(localmind-remote 오탐 없음)", () => {
  const registered = `Checking MCP server health…

localmind: node /path/dist/mcp.js - ✔ Connected
claude.ai Notion: https://mcp.notion.com/mcp - ! Needs authentication`;
  assert.equal(parseMcpList(registered), true);

  // localmind-remote만 있고 localmind 없음 → false (오탐 금지)
  const onlyRemote = `localmind-remote: http://100.84.174.125:8789/mcp (HTTP) - ✔ Connected`;
  assert.equal(parseMcpList(onlyRemote), false);

  assert.equal(parseMcpList(""), false);
  assert.equal(parseMcpList("other: x - ✔ Connected"), false);
  assert.equal(parseMcpList(null), false);
});

// ── HTTP 경계 통합(실제 docker·claude 없이 결정론적) ─────────────────────────
import http from "node:http";
import { createServer } from "./install-wizard.mjs";

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

// undici fetch는 Host 헤더 오버라이드를 금지하므로, 위조 Host는 raw http.request로 보낸다.
function rawGet(port, hostHeader, urlPath = "/") {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: urlPath, method: "GET", headers: { host: hostHeader } },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

test("통합 AC-7: 위조 Host 헤더는 403으로 거부된다", async () => {
  const server = createServer();
  const port = await listen(server);
  try {
    const forged = await rawGet(port, "evil.com");
    assert.equal(forged.status, 403);
    assert.match(forged.body, /허용되지 않은/);
    // 정상 루프백 Host는 통과(200)
    const ok = await rawGet(port, `127.0.0.1:${port}`);
    assert.equal(ok.status, 200);
  } finally {
    server.close();
  }
});

test("통합 AC-3: POST /api/run에 파괴 id는 400·rejected이고 실행되지 않는다", async () => {
  const server = createServer();
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "clean" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.rejected, true);
  } finally {
    server.close();
  }
});

test("통합 AC-4(보안): 값 개행 인젝션은 거부되고 .env가 변조되지 않는다", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wizard-inj-"));
  const envPath = path.join(dir, ".env");
  fs.writeFileSync(envPath, "LITELLM_MASTER_KEY=original_secret\n");
  const prev = process.env.LOCALMIND_ENV_FILE;
  process.env.LOCALMIND_ENV_FILE = envPath;
  const server = createServer();
  const port = await listen(server);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/secret`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "gemini", value: "harmless\nLITELLM_MASTER_KEY=ATTACKER" }),
    });
    assert.equal(res.status, 400, "개행 든 값은 400으로 거부돼야 함");
    const env = fs.readFileSync(envPath, "utf8");
    assert.ok(!env.includes("ATTACKER"), "공격자 라인이 주입되면 안 됨");
    assert.match(env, /LITELLM_MASTER_KEY=original_secret/, "기존 키는 그대로여야 함");
    assert.ok(!/GEMINI_API_KEY/.test(env), "거부됐으므로 기록도 없어야 함");
  } finally {
    server.close();
    if (prev === undefined) delete process.env.LOCALMIND_ENV_FILE;
    else process.env.LOCALMIND_ENV_FILE = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("통합(견고성): 한도 초과 바디는 핸들러를 행 걸지 않고 즉시 응답한다", async () => {
  const server = createServer();
  const port = await listen(server);
  try {
    const big = "x".repeat(200 * 1024); // 64KB 한도 초과
    const res = await fetch(`http://127.0.0.1:${port}/api/run`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "up", pad: big }),
    });
    // 400(거부) 응답이 3초 안에 돌아오면 됨 — 행 걸리면 fetch가 타임아웃/리셋
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test("단위(보안): writeEnvVar는 개행 든 값을 거부(throw)한다", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wizard-we-"));
  const envPath = path.join(dir, ".env");
  fs.writeFileSync(envPath, "A=1\n");
  assert.throws(() => writeEnvVar(envPath, "GEMINI_API_KEY", "x\nB=2"), /줄바꿈/);
  assert.match(fs.readFileSync(envPath, "utf8"), /^A=1$/m);
  assert.ok(!/B=2/.test(fs.readFileSync(envPath, "utf8")));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("통합 AC-4: POST /api/secret은 원문을 응답에 싣지 않고 격리 .env에 기록한다", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wizard-int-"));
  const envPath = path.join(dir, ".env");
  const prev = process.env.LOCALMIND_ENV_FILE;
  process.env.LOCALMIND_ENV_FILE = envPath;
  const server = createServer();
  const port = await listen(server);
  const secret = "AIzaSy_INTEG_RAW_7777";
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/secret`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: "gemini", value: secret }),
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(!text.includes(secret), "응답에 원문 금지");
    assert.ok(!text.includes("INTEG_RAW"), "원문 조각도 금지");
    const parsed = JSON.parse(text);
    assert.equal(parsed.set, true);
    assert.match(parsed.hint, /7777$/);
    // 서버측 .env에는 기록됨
    assert.match(fs.readFileSync(envPath, "utf8"), /^GEMINI_API_KEY=AIzaSy_INTEG_RAW_7777$/m);
  } finally {
    server.close();
    if (prev === undefined) delete process.env.LOCALMIND_ENV_FILE;
    else process.env.LOCALMIND_ENV_FILE = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── 화이트리스트/비밀 키 상수 무결성 ────────────────────────────────────────
test("COMMANDS는 파괴적 명령을 포함하지 않는다", () => {
  const ids = Object.keys(COMMANDS);
  for (const danger of ["down", "clean", "purge", "trash-empty", "reindex"]) {
    assert.ok(!ids.includes(danger), `${danger}는 화이트리스트에 없어야 함`);
  }
  // 등록된 스크립트는 실제 파일명 형태여야
  for (const c of Object.values(COMMANDS)) {
    assert.match(c.script, /^[a-z-]+\.sh$/);
  }
  assert.deepEqual(Object.keys(SECRET_KEYS).sort(), ["claude", "gemini"]);
});
