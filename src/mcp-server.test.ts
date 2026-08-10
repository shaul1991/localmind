/**
 * mcp-server.ts 도구 등록 단위 테스트 — InMemoryTransport로 실제 MCP 프로토콜을
 * 경유해 검증한다(zod 스키마 검증·핸들러 실행을 실제로 거침).
 *
 * great-reduction AC-1: 등록 도구는 정확히 3개(capture_note·search_notes·whoami)다.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// whoami가 deployment marker를 생성하므로 실제 HOME/notes에 쓰기 전에 모듈 env를 격리한다.
const MCP_TEST_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-mcp-server-unit-"));
const MCP_TEST_NOTES = path.join(MCP_TEST_ROOT, "notes");
const MCP_TEST_ENV_KEYS = ["HOME", "NOTES_DIR", "BRAIN_INDEX", "QUERY_LOG", "LOCALMIND_DEPLOYMENT_ID"] as const;
const MCP_TEST_PREVIOUS_ENV = new Map(MCP_TEST_ENV_KEYS.map((key) => [key, process.env[key]]));
fs.mkdirSync(MCP_TEST_NOTES, { recursive: true });
process.env.HOME = path.join(MCP_TEST_ROOT, "home");
process.env.NOTES_DIR = `localmind=${MCP_TEST_NOTES}`;
process.env.BRAIN_INDEX = path.join(MCP_TEST_ROOT, "state", "index.json");
process.env.QUERY_LOG = path.join(MCP_TEST_ROOT, "state", "query-log.jsonl");
process.env.LOCALMIND_DEPLOYMENT_ID = "localmind";
const { _readBrainRootIdForTest, buildServer, configSummary, readyMessage, safePublicLabel } = await import("./mcp-server.js");

describe("MCP tool surface (great-reduction AC-1)", () => {
  let client: Client;

  before(async () => {
    const server = buildServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  });

  after(async () => {
    await client.close();
    for (const key of MCP_TEST_ENV_KEYS) {
      const value = MCP_TEST_PREVIOUS_ENV.get(key);
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(MCP_TEST_ROOT, { recursive: true, force: true });
  });

  it("도구 표면: capture_note·search_notes·whoami + brief(living-memory FR-3) — 정확히 4개", async () => {
    // great-reduction AC-1(15→3) 위에 living-memory가 brief 1개만 추가한다(도구 표면 최소 유지).
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["brief", "capture_note", "search_notes", "whoami"]);
  });

  it("whoami는 공개 안전한 deployment id와 폴더 라벨만 보고한다", async () => {
    const result = await client.callTool({ name: "whoami", arguments: {} });
    assert.equal(result.isError, false);
    const text = (result.content as Array<{ text?: string }>).map((c) => c.text ?? "").join("\n");
    assert.match(text, /deployment: localmind/);
    assert.match(text, /brain fingerprint: [0-9a-f]{64}/);
    assert.match(text, /notes folder labels:/);
    const lines = text.split("\n");
    assert.equal(lines[0], "🧠 deployment: localmind");
    assert.equal(lines[2], "notes folder labels:");
    assert.ok(lines.slice(3).every((line) => /^  - [\p{L}\p{N}._-]+$/u.test(line)), "허용된 공개 label 행만 반환해야 한다");
    assert.doesNotMatch(text, new RegExp(os.hostname().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(text, /\/(?:Users|home|root|tmp)\//);
  });

  it("canonical marker publish 경합의 loser도 parent directory를 fsync한 뒤 identity를 반환한다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-brain-id-race-"));
    const originalLinkSync = fs.linkSync;
    const originalFsyncSync = fs.fsyncSync;
    let fsyncCalls = 0;
    try {
      fs.fsyncSync = ((fd: number) => {
        fsyncCalls++;
        return originalFsyncSync(fd);
      }) as typeof fs.fsyncSync;
      fs.linkSync = ((existingPath: fs.PathLike, newPath: fs.PathLike) => {
        // 다른 writer가 먼저 같은 marker를 publish한 직후 EEXIST를 돌려준 경합을 재현한다.
        originalLinkSync(existingPath, newPath);
        throw Object.assign(new Error("race winner published marker"), { code: "EEXIST" });
      }) as typeof fs.linkSync;

      const id = _readBrainRootIdForTest(root);
      assert.match(id ?? "", /^[0-9a-f-]{36}$/);
      assert.equal(fsyncCalls, 2, "temp file fsync 뒤 race winner의 parent directory도 fsync해야 함");
    } finally {
      fs.linkSync = originalLinkSync;
      fs.fsyncSync = originalFsyncSync;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("link publish 직후 publisher가 사라져도 existing-marker observer가 parent directory를 fsync한다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-brain-id-observer-"));
    const marker = path.join(root, ".localmind-brain-id");
    const tmp = path.join(root, ".publisher-tmp");
    const id = "11111111-1111-4111-8111-111111111111";
    const originalFsyncSync = fs.fsyncSync;
    let observerFsyncCalls = 0;
    try {
      const fd = fs.openSync(tmp, "wx", 0o600);
      fs.writeFileSync(fd, `${id}\n`, "utf8");
      originalFsyncSync(fd); // publisher는 file bytes까지만 durable하게 함
      fs.closeSync(fd);
      fs.linkSync(tmp, marker); // publish 뒤 directory fsync 전에 publisher가 사라진 상태

      fs.fsyncSync = ((directoryFd: number) => {
        observerFsyncCalls++;
        return originalFsyncSync(directoryFd);
      }) as typeof fs.fsyncSync;
      assert.equal(_readBrainRootIdForTest(root), id);
      assert.equal(observerFsyncCalls, 1, "existing marker를 성공으로 반환하기 전에 directory fsync");
    } finally {
      fs.fsyncSync = originalFsyncSync;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("existing-marker observer의 parent directory fsync 실패를 성공으로 삼키지 않는다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-brain-id-observer-eio-"));
    const originalFsyncSync = fs.fsyncSync;
    try {
      fs.writeFileSync(path.join(root, ".localmind-brain-id"), "22222222-2222-4222-8222-222222222222\n", { mode: 0o600 });
      fs.fsyncSync = (() => { throw Object.assign(new Error("fixture directory EIO"), { code: "EIO" }); }) as typeof fs.fsyncSync;
      assert.throws(() => _readBrainRootIdForTest(root), /fixture directory EIO/);
    } finally {
      fs.fsyncSync = originalFsyncSync;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("canonical fingerprint는 같은 label·root 집합의 NOTES_DIR 순서와 무관하다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-brain-order-"));
    const a = path.join(root, "a");
    const b = path.join(root, "b");
    fs.mkdirSync(a, { recursive: true });
    fs.mkdirSync(b, { recursive: true });
    const script = [
      `(async () => {`,
      `  const m = await import("./src/mcp-server.ts");`,
      `  process.stdout.write(String(m.brainRootFingerprint()));`,
      `})().catch((error) => { console.error(error); process.exit(1); });`,
    ].join("\n");
    const probe = (notesDir: string): string => execFileSync(
      process.execPath,
      ["--import", "tsx/esm", "-e", script],
      {
        cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), ".."),
        env: {
          ...process.env,
          HOME: path.join(root, "home"),
          NOTES_DIR: notesDir,
          BRAIN_INDEX: path.join(root, "state", "index.json"),
          QUERY_LOG: path.join(root, "state", "query-log.jsonl"),
        },
        encoding: "utf8",
      },
    );
    try {
      const forward = probe(`a=${a},b=${b}`);
      const reversed = probe(`b=${b},a=${a}`);
      assert.match(forward, /^[0-9a-f]{64}$/);
      assert.equal(reversed, forward, "설정 순서만 바뀐 같은 canonical brain은 같은 fingerprint여야 함");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("canonical fingerprint는 duplicate label root 집합의 NOTES_DIR 순서와 무관하다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-brain-duplicate-order-"));
    const a = path.join(root, "a");
    const b = path.join(root, "b");
    fs.mkdirSync(a, { recursive: true });
    fs.mkdirSync(b, { recursive: true });
    const script = [
      `(async () => {`,
      `  const server = await import("./src/mcp-server.ts");`,
      `  const brain = await import("./src/brain.ts");`,
      `  process.stdout.write(JSON.stringify({ fingerprint: server.brainRootFingerprint(), folders: brain.notesFolders() }));`,
      `})().catch((error) => { console.error(error); process.exit(1); });`,
    ].join("\n");
    const probe = (notesDir: string): { fingerprint: string; folders: Array<{ label: string; dir: string }> } => JSON.parse(execFileSync(
      process.execPath,
      ["--import", "tsx/esm", "-e", script],
      {
        cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), ".."),
        env: {
          ...process.env,
          HOME: path.join(root, "home"),
          NOTES_DIR: notesDir,
          BRAIN_INDEX: path.join(root, "state", "index.json"),
          QUERY_LOG: path.join(root, "state", "query-log.jsonl"),
        },
        encoding: "utf8",
      },
    ));
    try {
      const forward = probe(`dup=${a},dup=${b}`);
      const reversed = probe(`dup=${b},dup=${a}`);
      assert.equal(reversed.fingerprint, forward.fingerprint, "같은 duplicate-label root 집합은 순서가 바뀌어도 같은 identity");
      const byCanonicalPath = (folders: Array<{ label: string; dir: string }>) =>
        [...folders].sort((x, y) => x.dir < y.dir ? -1 : x.dir > y.dir ? 1 : 0);
      assert.deepEqual(byCanonicalPath(reversed.folders), byCanonicalPath(forward.folders), "canonical path 기준 label suffix mapping도 동일");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("duplicate suffix는 명시 label을 선점하지 않고 NOTES_DIR 역순에도 path binding이 같다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-brain-explicit-suffix-"));
    const a = path.join(root, "a");
    const b = path.join(root, "b");
    const c = path.join(root, "c");
    for (const dir of [a, b, c]) fs.mkdirSync(dir, { recursive: true });
    const script = [
      `(async () => {`,
      `  const brain = await import("./src/brain.ts");`,
      `  process.stdout.write(JSON.stringify(brain.notesFolders()));`,
      `})().catch((error) => { console.error(error); process.exit(1); });`,
    ].join("\n");
    const probe = (notesDir: string): Array<{ label: string; dir: string }> => JSON.parse(execFileSync(
      process.execPath,
      ["--import", "tsx/esm", "-e", script],
      {
        cwd: path.resolve(path.dirname(new URL(import.meta.url).pathname), ".."),
        env: {
          ...process.env,
          HOME: path.join(root, "home"),
          NOTES_DIR: notesDir,
          BRAIN_INDEX: path.join(root, "state", "index.json"),
          QUERY_LOG: path.join(root, "state", "query-log.jsonl"),
        },
        encoding: "utf8",
      },
    ));
    const byDir = (folders: Array<{ label: string; dir: string }>) =>
      Object.fromEntries(folders.map((folder) => [folder.dir, folder.label]));
    try {
      const forward = byDir(probe(`dup=${a},dup=${b},dup-2=${c}`));
      const reversed = byDir(probe(`dup-2=${c},dup=${b},dup=${a}`));
      assert.deepEqual(reversed, forward, "같은 root 집합은 입력 순서와 무관한 label binding을 가져야 함");
      assert.equal(forward[a], "dup");
      assert.equal(forward[b], "dup-3", "duplicate suffix는 예약된 dup-2를 건너뜀");
      assert.equal(forward[c], "dup-2", "사용자가 명시한 label을 그대로 보존");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("서버 준비 로그 요약도 hostname·절대경로를 노출하지 않는다", () => {
    const summary = readyMessage("http");
    assert.match(summary, /deployment=localmind/);
    assert.match(summary, /labels=/);
    assert.doesNotMatch(summary, new RegExp(os.hostname().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(summary, /\/(?:Users|home|root|tmp)\//);
  });

  it("공개 identity 필드는 경로·제어문자·과도한 값을 거부한다", () => {
    assert.equal(safePublicLabel("home-main"), "home-main");
    assert.equal(safePublicLabel("second-brain-shared"), "second-brain-shared");
    assert.equal(safePublicLabel("/Users/private/notes"), "unknown");
    assert.equal(safePublicLabel("home-main\nsecret"), "unknown");
    assert.equal(safePublicLabel("x".repeat(65)), "unknown");
  });
});

function runDurableCaptureBoundaryProbe(
  root: string,
  folder?: string,
  staleSameKey = false,
  captureText = "색인 실패 뒤에도 정본 저장을 구분하기에 충분히 긴 합성 본문",
  embeddingSuccess = false,
  editAfterIndexCommit = false,
): any {
  const notes = path.join(root, "notes");
  const state = path.join(root, "state");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(state, { recursive: true });
  const script = [
    `(async () => {`,
    `  const fs = (await import("node:fs")).default;`,
    embeddingSuccess
      ? `  globalThis.fetch = async (_url, init) => { const input = JSON.parse(String(init?.body ?? "{}")).input ?? []; return { ok: true, status: 200, json: async () => ({ data: input.map((_, index) => ({ index, embedding: [1, 0] })) }) }; };`
      : "",
    editAfterIndexCommit
      ? `  const originalRenameSync = fs.renameSync.bind(fs); let externallyEdited = false; fs.renameSync = (from, to) => { originalRenameSync(from, to); if (!externallyEdited && String(to) === process.env.BRAIN_INDEX) { const note = fs.readdirSync(${JSON.stringify(notes)}).find((name) => name.endsWith(".md")); if (note) { fs.appendFileSync(${JSON.stringify(notes)} + "/" + note, ${JSON.stringify("\nexternal edit\n")}); externallyEdited = true; } } };`
      : "",
    staleSameKey
      ? `  const RealDate = Date; globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : ["2026-08-09T00:00:00.000Z"])); } static now() { return new RealDate("2026-08-09T00:00:00.000Z").getTime(); } };`
      : "",
    staleSameKey
      ? `  const brain = await import(${JSON.stringify(path.join(REPO, "src/brain.ts"))}); brain.saveIndex({ version: brain.loadIndex().version, embeddingModel: "fixture-model", files: { "alpha/2026-08-09T00-00-00-durable-경계.md": { hash: "stale-hash", folder: "alpha", chunks: [], linksOut: [] } } });`
      : "",
    `  const { buildServer } = await import(${JSON.stringify(path.join(REPO, "src/mcp-server.ts"))});`,
    `  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");`,
    `  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");`,
    `  const [ct, st] = InMemoryTransport.createLinkedPair();`,
    `  const client = new Client({ name: "durable-capture-probe", version: "0.0.0" });`,
    `  await Promise.all([client.connect(ct), buildServer().connect(st)]);`,
    `  const args = { text: ${JSON.stringify(captureText)}, title: "durable 경계" };`,
    folder === undefined ? "" : `  args.folder = ${JSON.stringify(folder)};`,
    `  const result = await client.callTool({ name: "capture_note", arguments: args });`,
    `  const text = result.content.map((c) => c.text ?? "").join("\\n");`,
    `  const files = fs.readdirSync(${JSON.stringify(notes)}).filter((name) => name.endsWith(".md"));`,
    `  process.stdout.write(JSON.stringify({ isError: result.isError ?? false, text, files }));`,
    `  await client.close();`,
    `})().catch((e) => { console.error(e); process.exit(1); });`,
  ].filter(Boolean).join("\n");
  const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
    cwd: REPO,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: path.join(root, "home"),
      NOTES_DIR: `alpha=${notes}`,
      BRAIN_INDEX: path.join(state, "index.json"),
      QUERY_LOG: path.join(state, "query-log.jsonl"),
      EMBEDDINGS_KEY: embeddingSuccess ? "fixture-key" : "",
      EMBEDDINGS_MODEL: "fixture-model",
      LITELLM_MASTER_KEY: "",
      EMBED_RETRIES: "1",
      CAPTURE_VALIDATE_TIMEOUT_MS: "20",
    },
  });
  return JSON.parse(out);
}

describe("durable capture 경계 (Phase 1 C)", () => {
  it("파일 생성 뒤 첫 색인 실패는 durable success + degraded indexing + stable source를 반환한다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-durable-capture-"));
    try {
      const r = runDurableCaptureBoundaryProbe(root);
      assert.equal(r.files.length, 1, "Markdown 정본은 한 번만 생성됨");
      assert.equal(r.isError, false, "정본 저장 뒤 색인 실패를 전체 저장 실패로 보이면 안 됨");
      assert.match(r.text, /status: durable/);
      assert.match(r.text, /source: alpha\/[^\s]+\.md/);
      assert.match(r.text, /indexing: unconfirmed \(degraded\)/);
      assert.doesNotMatch(r.text, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "source는 절대경로가 아님");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("파일 생성 전 folder 경계 실패는 계속 전체 실패로 반환한다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-prefile-capture-failure-"));
    try {
      const r = runDurableCaptureBoundaryProbe(root, "missing");
      assert.equal(r.files.length, 0);
      assert.equal(r.isError, true);
      assert.match(r.text, /capture_note 실패/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("같은 key의 stale hash가 있어도 신규 revision 색인 실패를 confirmed로 오판하지 않는다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-stale-same-key-capture-"));
    try {
      const r = runDurableCaptureBoundaryProbe(root, undefined, true);
      assert.equal(r.files.length, 1, "신규 Markdown 정본은 저장됨");
      assert.equal(r.isError, false, "정본 저장은 durable success");
      assert.match(r.text, /indexing: unconfirmed \(degraded\)/);
      assert.doesNotMatch(r.text, /indexing: confirmed/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("색인 commit 직후 Markdown이 external edit되면 confirmed를 0건으로 유지한다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-capture-external-edit-"));
    try {
      const r = runDurableCaptureBoundaryProbe(root, undefined, false, undefined, true, true);
      assert.equal(r.files.length, 1);
      assert.equal(r.isError, false, "Markdown 저장 자체는 durable success");
      assert.match(r.text, /indexing: unconfirmed \(degraded\)/);
      assert.doesNotMatch(r.text, /indexing: confirmed/, "external edit를 confirmed로 오판하면 안 됨");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("validation skipped는 indexing skipped로 오표기하지 않고 의미를 분리한다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-skipped-validation-status-"));
    try {
      const r = runDurableCaptureBoundaryProbe(root, undefined, false, "짧음", true);
      assert.equal(r.isError, false);
      assert.match(r.text, /indexing: completed/);
      assert.match(r.text, /validation: skipped/);
      assert.doesNotMatch(r.text, /indexing: skipped/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ── living-memory (specs/202607211621) — 통합 probe ─────────────────────────
// capture/search/brief는 모듈 초기화 시 env(NOTES_DIR 등)를 읽으므로, brain.test.ts의
// probe 패턴을 따라 자식 프로세스에서 임베딩 스텁과 함께 실행한다(외부 서버 불필요).
const REPO = path.resolve(new URL(".", import.meta.url).pathname, "..");

function runMcpProbe(notesDir: string, body: string, extraEnv: Record<string, string> = {}): any {
  const script = [
    `const http = require("node:http");`,
    `const srv = http.createServer((req, res) => {`,
    `  let raw = ""; req.on("data", (c) => (raw += c));`,
    `  req.on("end", () => {`,
    `    res.setHeader("content-type", "application/json");`,
    `    const n = (JSON.parse(raw).input || []).length;`,
    `    res.end(JSON.stringify({ data: Array.from({ length: n }, (_, i) => ({ index: i, embedding: [1, 0, 0, 0] })) }));`,
    `  });`,
    `});`,
    `srv.listen(0, async () => {`,
    `  const base = "http://127.0.0.1:" + srv.address().port;`,
    `  process.env.EMBEDDINGS_URL = base + "/v1";`,
    `  const { buildServer } = await import(${JSON.stringify(path.join(REPO, "src/mcp-server.ts"))});`,
    `  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");`,
    `  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");`,
    `  const [ct, st] = InMemoryTransport.createLinkedPair();`,
    `  const client = new Client({ name: "probe", version: "0.0.0" });`,
    `  await Promise.all([client.connect(ct), buildServer().connect(st)]);`,
    `  const text = (r) => r.content.map((c) => c.text ?? "").join("\\n");`,
    `  const call = (name, args) => client.callTool({ name, arguments: args });`,
    `  try {`,
    body,
    `  } catch (e) { console.error(e); process.exit(1); }`,
    `  await client.close(); srv.close();`,
    `});`,
  ].join("\n");
  const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
    cwd: REPO,
    encoding: "utf8",
    env: {
      ...process.env,
      NOTES_DIR: `notes=${notesDir}`,
      BRAIN_INDEX: path.join(notesDir, ".brain-index.json"),
      QUERY_LOG: path.join(notesDir, "query-log.jsonl"),
      EMBEDDINGS_KEY: "test-key",
      EMBED_RETRIES: "1",
      ...extraEnv,
    },
  });
  return JSON.parse(out.trim().split("\n").pop()!);
}

describe("living-memory: capture 결정 확장 (AC-1·2·3·11)", () => {
  it("AC-1·11: 결정 파라미터로 1회 호출 → type: decision + 3층 + last_verified 자동", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-dec-cap-"));
    try {
      const r = runMcpProbe(dir, `
        const res = await call("capture_note", { text: "본문", title: "결정테스트",
          choice: "Auth 2.0 채택", why: "표준 성숙",
          assumptions: [{ fact: "2.0이 최신", volatility: "high" }, { fact: "취향", volatility: "low" }] });
        const fsx = require("node:fs"), p = require("node:path");
        const md = fsx.readdirSync(${JSON.stringify("__DIR__")}).filter((f) => f.endsWith(".md"));
        const note = md.length === 1 ? fsx.readFileSync(p.join(${JSON.stringify("__DIR__")}, md[0]), "utf8") : "";
        console.log(JSON.stringify({ isError: res.isError ?? false, out: text(res), files: md.length, note }));
      `.replaceAll('"__DIR__"', JSON.stringify(dir)));
      assert.equal(r.isError, false);
      assert.equal(r.files, 1, "단일 호출로 파일 1개 완성(AC-11)");
      assert.match(r.note, /type: decision/);
      assert.match(r.note, /choice: Auth 2\.0 채택/);
      assert.match(r.note, /volatility: high/);
      assert.match(r.note, /last_verified: \d{4}-\d{2}-\d{2}T/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("AC-2: 결정 파라미터 없는 종전 호출은 great-reduction 이후 baseline과 동일 구조", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-dec-plain-"));
    try {
      const r = runMcpProbe(dir, `
        await call("capture_note", { text: "그냥 메모", title: "평범" });
        const fsx = require("node:fs"), p = require("node:path");
        const md = fsx.readdirSync(${JSON.stringify("__DIR__")}).filter((f) => f.endsWith(".md"));
        console.log(JSON.stringify({ note: fsx.readFileSync(p.join(${JSON.stringify("__DIR__")}, md[0]), "utf8") }));
      `.replaceAll('"__DIR__"', JSON.stringify(dir)));
      const fm = r.note.split("---")[1];
      assert.match(fm, /title: "평범"/);
      assert.match(fm, /tags: \[\]/);
      assert.match(fm, /source: localmind/);
      assert.doesNotMatch(fm, /type:|decision|assumptions/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("AC-3: volatility 누락 → 한국어 안내 에러 + 파일 미생성", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-dec-bad-"));
    try {
      const r = runMcpProbe(dir, `
        const res = await call("capture_note", { text: "b", choice: "x", why: "y",
          assumptions: [{ fact: "z" }] });
        const fsx = require("node:fs");
        const md = fsx.readdirSync(${JSON.stringify("__DIR__")}).filter((f) => f.endsWith(".md"));
        console.log(JSON.stringify({ isError: res.isError ?? false, out: text(res), files: md.length }));
      `.replaceAll('"__DIR__"', JSON.stringify(dir)));
      assert.equal(r.isError, true);
      assert.match(r.out, /volatility/);
      assert.match(r.out, /[가-힣]/);
      assert.equal(r.files, 0, "파일이 생성되면 안 된다");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("living-memory: brief (AC-5·6·10)", () => {
  it("AC-5·10: 결정 요약(선택·이유·전제·경로) — 전량 최근화 시에만 신호 소멸", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-brief-"));
    try {
      const r = runMcpProbe(dir, `
        await call("capture_note", { text: "인증 결정 본문", title: "인증방식",
          choice: "Auth 2.0 채택", why: "표준 성숙도와 생태계",
          assumptions: [{ fact: "2.0이 최신", volatility: "high" }, { fact: "PKCE 권장 유지", volatility: "high" }] });
        const fsx = require("node:fs"), p = require("node:path");
        const md = fsx.readdirSync(${JSON.stringify("__DIR__")}).filter((f) => f.endsWith(".md"));
        const file = p.join(${JSON.stringify("__DIR__")}, md[0]);
        const old = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 19);
        fsx.writeFileSync(file, fsx.readFileSync(file, "utf8").replace(/last_verified: [^\\n]+/g, "last_verified: " + old));
        const b1 = text(await call("brief", { hint: "인증" }));
        const now = new Date().toISOString().slice(0, 19);
        let t = fsx.readFileSync(file, "utf8");
        t = t.replace(/last_verified: [^\\n]+/, "last_verified: " + now);
        fsx.writeFileSync(file, t);
        const b2 = text(await call("brief", { hint: "인증" }));
        t = fsx.readFileSync(file, "utf8").replace(/last_verified: [^\\n]+/g, "last_verified: " + now);
        fsx.writeFileSync(file, t);
        const b3 = text(await call("brief", { hint: "인증" }));
        console.log(JSON.stringify({ b1, b2, b3, notePath: "notes/" + md[0] }));
      `.replaceAll('"__DIR__"', JSON.stringify(dir)));
      assert.match(r.b1, /Auth 2\.0 채택/);
      assert.match(r.b1, /표준 성숙도/);
      assert.match(r.b1, new RegExp(r.notePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "노트 경로 포함");
      assert.match(r.b1, /⏳/, "stale 신호");
      assert.match(r.b2, /⏳/, "1건 최근화로는 신호 유지(AC-10)");
      assert.doesNotMatch(r.b3, /⏳/, "전량 최근화 시 신호 소멸");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("AC-6: 관련 결정 없음 → 빈 브리핑 한국어 안내(에러 아님)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-brief-empty-"));
    try {
      const r = runMcpProbe(dir, `
        const res = await call("brief", { hint: "존재하지않는주제" });
        console.log(JSON.stringify({ isError: res.isError ?? false, out: text(res) }));
      `);
      assert.equal(r.isError, false);
      assert.match(r.out, /[가-힣]/);
      assert.match(r.out, /결정.*없|기록되지 않/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("living-memory: 낡음 신호 (AC-4·7·8·9)", () => {
  it("AC-7: search_notes 신호 부가 — 신호 strip 후 무신호 응답과 byte-equal", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-sig-"));
    try {
      const r = runMcpProbe(dir, `
        await call("capture_note", { text: "쿠키 만료 결정", title: "쿠키",
          choice: "세션 쿠키", why: "단순", assumptions: [{ fact: "브라우저 정책", volatility: "high" }] });
        const fsx = require("node:fs"), p = require("node:path");
        const md = fsx.readdirSync(${JSON.stringify("__DIR__")}).filter((f) => f.endsWith(".md"));
        const file = p.join(${JSON.stringify("__DIR__")}, md[0]);
        const old = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 19);
        fsx.writeFileSync(file, fsx.readFileSync(file, "utf8").replace(/last_verified: [^\\n]+/, "last_verified: " + old));
        const withSig = text(await call("search_notes", { query: "쿠키" }));
        process.env.BRIEF_STALE_DAYS = "99999";
        const noSig = text(await call("search_notes", { query: "쿠키" }));
        console.log(JSON.stringify({ withSig, noSig }));
      `.replaceAll('"__DIR__"', JSON.stringify(dir)));
      assert.match(r.withSig, /⏳/);
      assert.doesNotMatch(r.noSig, /⏳/);
      const stripped = r.withSig.split("\n").filter((l: string) => !l.includes("⏳")).join("\n").trimEnd();
      assert.equal(stripped, r.noSig.trimEnd(), "신호 제거 시 본문 byte-equal(AC-7)");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("AC-8: 전부 low·최근 검증이면 신호 없음(오탐 0)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-sig-none-"));
    try {
      const r = runMcpProbe(dir, `
        await call("capture_note", { text: "취향 결정", title: "취향",
          choice: "다크 테마", why: "선호", assumptions: [{ fact: "개인 취향", volatility: "low" }] });
        const out = text(await call("search_notes", { query: "취향" }));
        console.log(JSON.stringify({ out }));
      `);
      assert.doesNotMatch(r.out, /⏳/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("AC-4·9: 비정형·깨진 frontmatter 노트 — 검색 정상·신호만 생략", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-sig-legacy-"));
    try {
      fs.writeFileSync(path.join(dir, "legacy.md"), "스키마 없는 옛 노트 — 인증 관련 메모\n");
      fs.writeFileSync(path.join(dir, "broken.md"), "---\ntype: decision\ndecision: [broken\n---\n인증 깨진 노트\n");
      const r = runMcpProbe(dir, `
        const s = await call("search_notes", { query: "인증" });
        const b = await call("brief", { hint: "인증" });
        console.log(JSON.stringify({ sErr: s.isError ?? false, sOut: text(s), bErr: b.isError ?? false, bOut: text(b) }));
      `);
      assert.equal(r.sErr, false);
      assert.match(r.sOut, /legacy\.md|broken\.md/, "검색 자체는 정상(AC-4)");
      assert.doesNotMatch(r.sOut, /⏳/, "깨진 frontmatter는 신호만 생략(AC-9)");
      assert.equal(r.bErr, false, "brief도 에러 아님(AC-4)");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── brief 구형식 폴백 (specs/202607231759) — living-memory 이전 결정 노트도 보이게 ──
describe("brief 구형식 폴백 (specs/202607231759)", () => {
  const LEGACY = [
    "---",
    'title: "결정: 게이트웨이 정리"',
    "date: 2026-07-10T09:00:00",
    'tags: ["decision"]',
    "source: localmind",
    "---",
    "# 결정: 게이트웨이 정리",
    "",
    "게이트웨이를 중지하고 인증 직결로 전환했다.",
    "",
  ].join("\n");

  it("AC-2·3: 구형식 결정 → (구형식)+제목+발췌+경로 표기, ⏳ 없음 + 미기록 안내", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-brief-legacy-"));
    try {
      fs.writeFileSync(path.join(dir, "legacy-decision.md"), LEGACY);
      const r = runMcpProbe(dir, `
        const b = await call("brief", { hint: "인증" });
        console.log(JSON.stringify({ bErr: b.isError ?? false, out: text(b) }));
      `);
      assert.equal(r.bErr, false);
      assert.match(r.out, /\(구형식\)/, "구형식 표기(AC-2)");
      assert.match(r.out, /결정: 게이트웨이 정리/, "제목(AC-2)");
      assert.match(r.out, /legacy-decision\.md/, "노트 경로(AC-2)");
      assert.match(r.out, /게이트웨이를 중지하고/, "발췌(AC-2)");
      assert.doesNotMatch(r.out, /⏳/, "구형식엔 낡음 신호 없음(AC-3)");
      assert.match(r.out, /미기록/, "낡음 신호 미기록 안내(AC-3)");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("AC-6·7: 신형식+구형식(깨진 신형식 포함) 혼재 — 신형식 먼저, 합산 건수 표기", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-brief-mixed-"));
    try {
      fs.writeFileSync(path.join(dir, "legacy-decision.md"), LEGACY);
      fs.writeFileSync(
        path.join(dir, "broken-new.md"),
        '---\ntitle: "깨진 신형식"\ntype: decision\ntags: ["decision"]\n---\n인증 결정 본문만 남음\n',
      );
      const r = runMcpProbe(dir, `
        await call("capture_note", { text: "인증 결정 본문", title: "인증방식",
          choice: "Auth 2.0 채택", why: "표준 성숙",
          assumptions: [{ fact: "2.0이 최신", volatility: "low" }] });
        const b = await call("brief", { hint: "인증" });
        console.log(JSON.stringify({ bErr: b.isError ?? false, out: text(b) }));
      `);
      assert.equal(r.bErr, false);
      assert.match(r.out, /Auth 2\.0 채택/, "신형식 3층 유지(AC-1)");
      assert.match(r.out, /깨진 신형식/, "깨진 신형식도 폴백 표기(AC-7)");
      assert.match(r.out, /결정: 게이트웨이 정리/, "구형식 표기(AC-2)");
      assert.ok(
        r.out.indexOf("Auth 2.0 채택") < r.out.indexOf("(구형식)"),
        "신형식이 구형식보다 먼저(AC-6)",
      );
      assert.match(r.out, /결정 3건/, "합산 건수");
      assert.match(r.out, /구형식 2건/, "구형식 건수 표기");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("AC-4: decision 태그 없는 일반 노트만 있으면 여전히 빈 브리핑 안내", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-brief-plain-"));
    try {
      fs.writeFileSync(
        path.join(dir, "plain.md"),
        '---\ntitle: "그냥 메모"\ntags: []\n---\n인증 관련 일반 메모\n',
      );
      const r = runMcpProbe(dir, `
        const b = await call("brief", { hint: "인증" });
        console.log(JSON.stringify({ bErr: b.isError ?? false, out: text(b) }));
      `);
      assert.equal(r.bErr, false);
      assert.doesNotMatch(r.out, /\(구형식\)/, "일반 노트는 결정 아님(AC-4)");
      assert.match(r.out, /결정 노트가 없습니다|기록되지 않/, "빈 브리핑 안내 유지(AC-4)");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});


describe("Phase 4 brief scope와 decision lifecycle", () => {
  it("superseded 결정은 brief와 stale-on-contact에서 제외하고 검증 시점을 표시한다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-phase4-supersede-"));
    try {
      const r = runMcpProbe(dir, `
        await call("capture_note", { text: "인증 정책 결정", title: "이전 인증",
          choice: "비밀번호 유지", why: "기존 호환",
          assumptions: [{ fact: "기존 정책 유지", volatility: "high" }] });
        const fsx = require("node:fs"), p = require("node:path");
        const oldFile = fsx.readdirSync(${JSON.stringify("__DIR__")}).find((f) => f.endsWith(".md"));
        const oldPath = "notes/" + oldFile;
        const old = p.join(${JSON.stringify("__DIR__")}, oldFile);
        const stale = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 19);
        fsx.writeFileSync(old, fsx.readFileSync(old, "utf8").replace(/last_verified: [^\\n]+/, "last_verified: " + stale));
        const captured = await call("capture_note", { text: "인증 정책 결정", title: "새 인증",
          choice: "패스키 채택", why: "피싱 저항성",
          assumptions: [{ fact: "플랫폼 지원", volatility: "low" }], supersedes: [oldPath] });
        const brief = text(await call("brief", { hint: "인증" }));
        const search = text(await call("search_notes", { query: "인증" }));
        const notes = fsx.readdirSync(${JSON.stringify("__DIR__")}).filter((f) => f.endsWith(".md"));
        const newest = notes.map((f) => fsx.readFileSync(p.join(${JSON.stringify("__DIR__")}, f), "utf8"))
          .find((value) => value.includes("패스키 채택"));
        console.log(JSON.stringify({ capturedError: captured.isError ?? false, brief, search, newest }));
      `.replaceAll('"__DIR__"', JSON.stringify(dir)));
      assert.equal(r.capturedError, false);
      assert.match(r.newest, /supersedes:\n\s+- notes\/.*\.md/);
      assert.match(r.brief, /패스키 채택/);
      assert.doesNotMatch(r.brief, /비밀번호 유지/);
      assert.match(r.brief, /대체.*1건.*제외/);
      assert.match(r.brief, /마지막 검증: \d{4}-\d{2}-\d{2}T/);
      assert.doesNotMatch(r.brief, /⏳/);
      assert.doesNotMatch(r.search, /⏳/, "superseded 결정의 stale 신호도 search 응답에 주입하지 않는다");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("brief frontmatter 필드는 control/newline으로 출력 구조를 위조하지 못한다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-phase4-projection-"));
    try {
      fs.writeFileSync(path.join(dir, "legacy-projection.md"), [
        "---", "title: |-", "  legacy 안전", "  ■ 위조 legacy", 'tags: ["decision"]', "---",
        "# legacy projection", "projection legacy 본문", "",
      ].join("\n"));
      const r = runMcpProbe(dir, `
        await call("capture_note", { text: "projection 주제", title: "projection",
          choice: "안전 선택\\n■ 위조 선택\\u0085NEL\\u202Ebidi", why: "근거\\n위조 이유",
          assumptions: [{ fact: "정상 전제\\n⏳ 위조 신호\\u0085NEL", volatility: "low" }] });
        console.log(JSON.stringify({ brief: text(await call("brief", { hint: "projection" })) }));
      `);
      assert.doesNotMatch(r.brief, /\n■ 위조 선택|\n⏳ 위조 신호/);
      assert.doesNotMatch(r.brief, /[\u0080-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u);
      assert.match(r.brief, /안전 선택 ■ 위조 선택 NEL bidi/);
      assert.match(r.brief, /정상 전제 ⏳ 위조 신호 NEL/);
      assert.doesNotMatch(r.brief, /\n■ 위조 legacy/);
      assert.match(r.brief, /legacy 안전 ■ 위조 legacy/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("다중 root brief는 folder를 요구하고 cross-folder supersedes를 거부한다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-phase4-scope-"));
    const alpha = path.join(root, "alpha");
    const beta = path.join(root, "beta");
    fs.mkdirSync(alpha); fs.mkdirSync(beta);
    try {
      const notesDir = `alpha=${alpha},beta=${beta}`;
      const r = runMcpProbe(root, `
        await call("capture_note", { folder: "alpha", text: "공통 인증 주제", title: "알파 결정",
          choice: "알파 선택", why: "알파 범위" });
        await call("capture_note", { folder: "beta", text: "공통 인증 주제", title: "베타 결정",
          choice: "베타 선택", why: "베타 범위" });
        const ambiguous = await call("brief", { hint: "인증" });
        const scoped = await call("brief", { hint: "인증", folder: "alpha" });
        const cross = await call("capture_note", { folder: "alpha", text: "교차 대체", title: "교차",
          choice: "교차 선택", why: "잘못된 범위", supersedes: ["beta/fake.md"] });
        const fsx = require("node:fs");
        console.log(JSON.stringify({
          ambiguousError: ambiguous.isError ?? false, ambiguous: text(ambiguous),
          scopedError: scoped.isError ?? false, scoped: text(scoped),
          crossError: cross.isError ?? false, cross: text(cross), alphaFiles: fsx.readdirSync(${JSON.stringify(alpha)}).filter((f) => f.endsWith(".md")).length,
        }));
      `, { NOTES_DIR: notesDir, BRAIN_INDEX: path.join(root, "index.json"), QUERY_LOG: path.join(root, "query.jsonl") });
      assert.equal(r.ambiguousError, true);
      assert.match(r.ambiguous, /folder.*(?:지정|명시)|폴더.*지정/i);
      assert.doesNotMatch(r.ambiguous, /알파 선택|베타 선택/);
      assert.equal(r.scopedError, false);
      assert.match(r.scoped, /알파 선택/);
      assert.doesNotMatch(r.scoped, /베타 선택/);
      assert.equal(r.crossError, true);
      assert.match(r.cross, /같은.*folder|같은.*폴더/i);
      assert.equal(r.alphaFiles, 1, "거부된 cross-folder 결정 파일을 만들면 안 된다");
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
});
