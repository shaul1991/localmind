import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SMOKE = path.join(ROOT, "scripts", "smoke-mcp.ts");

function runSmoke({
  mode = "ok",
  labels = ["fixture"],
  expectedLabels,
  fullFlow = false,
  allowTestEntry = true,
  workingDirectory = ROOT,
} = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-smoke-mcp-"));
  const server = path.join(tmp, "fixture-mcp.mjs");
  const callLog = path.join(tmp, "calls.jsonl");
  const userHome = path.join(tmp, "user-home");
  const userNotes = path.join(tmp, "user-notes");
  const userState = path.join(tmp, "user-state");
  fs.mkdirSync(userHome, { recursive: true });
  fs.mkdirSync(userNotes, { recursive: true });
  fs.mkdirSync(userState, { recursive: true });
  const mcpUrl = pathToFileURL(path.join(ROOT, "node_modules", "@modelcontextprotocol", "sdk", "dist", "esm", "server", "mcp.js")).href;
  const stdioUrl = pathToFileURL(path.join(ROOT, "node_modules", "@modelcontextprotocol", "sdk", "dist", "esm", "server", "stdio.js")).href;
  fs.writeFileSync(server, [
    `import fs from "node:fs";`,
    `import { McpServer } from ${JSON.stringify(mcpUrl)};`,
    `import { StdioServerTransport } from ${JSON.stringify(stdioUrl)};`,
    `const log = (event) => fs.appendFileSync(process.env.FIXTURE_CALL_LOG, JSON.stringify({ event, notes: process.env.NOTES_DIR, index: process.env.BRAIN_INDEX, queryLog: process.env.QUERY_LOG, home: process.env.HOME }) + "\\n");`,
    `log("start");`,
    `const server = new McpServer({ name: "fixture", version: "0.0.0" });`,
    `const text = (value, isError = false) => ({ content: [{ type: "text", text: value }], isError });`,
    `server.registerTool("whoami", { inputSchema: {} }, async () => { log("whoami"); return ${JSON.stringify(mode)} === "whoami-error" ? text("합성 whoami 실패", true) : text("deployment: localmind\\nnotes folder labels:\\n" + ${JSON.stringify(labels)}.map((label) => "  - " + label).join("\\n")); });`,
    `server.registerTool("capture_note", { inputSchema: {} }, async () => { log("capture_note"); return ${JSON.stringify(mode)} === "capture-error" ? text("합성 capture 실패", true) : text("status: durable\\nsource: fixture/captured.md\\nindexing: confirmed"); });`,
    `server.registerTool("search_notes", { inputSchema: {} }, async () => { log("search_notes"); return ${JSON.stringify(mode)} === "search-error" ? text("합성 search 실패", true) : text("(1.000) [fixture/captured.md]\\nlocalmind isolated full smoke synthetic marker"); });`,
    `server.registerTool("brief", { inputSchema: {} }, async () => { log("brief"); return ${JSON.stringify(mode)} === "brief-error" ? text("합성 brief 실패", true) : text("관련 결정 노트가 없습니다"); });`,
    `await server.connect(new StdioServerTransport());`,
  ].join("\n"));
  try {
    const result = spawnSync("node", ["--import", path.join(ROOT, "node_modules", "tsx", "dist", "esm", "index.mjs"), SMOKE], {
      cwd: workingDirectory === "fixture" ? tmp : workingDirectory,
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: userHome,
        NOTES_DIR: `user=${userNotes}`,
        BRAIN_INDEX: path.join(userState, "index.json"),
        QUERY_LOG: path.join(userState, "query-log.jsonl"),
        EMBEDDINGS_KEY: "fixture-key",
        LOCALMIND_SMOKE_MCP_ENTRY_FOR_TEST: server,
        FIXTURE_CALL_LOG: callLog,
        ...(allowTestEntry ? { LOCALMIND_SMOKE_ALLOW_TEST_ENTRY: "1" } : {}),
        ...(expectedLabels === undefined ? {} : { LOCALMIND_SMOKE_EXPECTED_LABELS: expectedLabels }),
        ...(fullFlow ? { LOCALMIND_SMOKE_FULL_FLOW: "1" } : {}),
      },
    });
    const events = fs.existsSync(callLog)
      ? fs.readFileSync(callLog, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))
      : [];
    const isolated = events.find((event) => event.event === "start");
    const isolatedPaths = isolated ? [isolated.home, isolated.notes?.replace(/^[^=]+=/, ""), isolated.index, isolated.queryLog] : [];
    return {
      ...result,
      events,
      userNotesFiles: fs.readdirSync(userNotes),
      userNotes,
      userIndex: path.join(userState, "index.json"),
      userQueryLog: path.join(userState, "query-log.jsonl"),
      isolated,
      isolatedCleaned: isolatedPaths.every((entry) => !entry || !fs.existsSync(entry)),
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

describe("smoke:mcp identity 계약", () => {
  it("기대 label을 지정하지 않은 일반 smoke는 기존처럼 whoami 성공만 확인한다", () => {
    const r = runSmoke();
    assert.equal(r.status, 0, r.stderr);
  });

  it("opt-in 기대 공개 label 집합이 정확히 같으면 통과한다", () => {
    const r = runSmoke({ labels: ["alpha", "beta"], expectedLabels: "alpha,beta" });
    assert.equal(r.status, 0, r.stderr);
  });

  it("opt-in 기대 공개 label 집합이 다르면 실패한다", () => {
    const r = runSmoke({ labels: ["alpha", "gamma"], expectedLabels: "alpha,beta" });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /라벨|label/);
  });

  it("whoami가 isError를 반환하면 내용과 무관하게 실패한다", () => {
    const r = runSmoke({ mode: "whoami-error", labels: ["alpha", "beta"], expectedLabels: "alpha,beta" });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /whoami/);
  });

  it("test entry는 별도 allow flag 없이는 무시한다", () => {
    const r = runSmoke({ allowTestEntry: false, workingDirectory: "fixture" });
    assert.notEqual(r.status, 0, "fixture가 아니라 존재하지 않는 production 상대 경로를 시도해야 함");
    assert.deepEqual(r.events, [], "fixture entry가 실행되면 안 됨");
  });
});

describe("smoke:mcp isolated full-flow", () => {
  it("tools/list→whoami→capture→search(source 확인)→brief 순서로 통과하고 격리 경로를 정리한다", () => {
    const r = runSmoke({ fullFlow: true });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(r.events.map((event) => event.event), ["start", "whoami", "capture_note", "search_notes", "brief"]);
    assert.match(r.stdout, /tools\/list[\s\S]*whoami[\s\S]*capture_note[\s\S]*search_notes[\s\S]*brief/);
    assert.ok(!r.isolated.notes.includes(r.userNotes), "child NOTES_DIR는 사용자 설정을 강제 override");
    assert.notEqual(r.isolated.index, r.userIndex, "child BRAIN_INDEX는 사용자 설정을 강제 override");
    assert.notEqual(r.isolated.queryLog, r.userQueryLog, "child QUERY_LOG는 사용자 설정을 강제 override");
    assert.equal(r.isolatedCleaned, true, "성공 뒤 격리 HOME·notes·index·query-log를 모두 정리");
    assert.deepEqual(r.userNotesFiles, [], "사용자 notes에는 synthetic 파일을 만들면 안 됨");
  });

  for (const [mode, expectedOrder] of [
    ["capture-error", ["start", "whoami", "capture_note"]],
    ["search-error", ["start", "whoami", "capture_note", "search_notes"]],
    ["brief-error", ["start", "whoami", "capture_note", "search_notes", "brief"]],
  ]) {
    it(`${mode}를 명시 실패로 전파하고 항상 cleanup한다`, () => {
      const r = runSmoke({ fullFlow: true, mode });
      assert.notEqual(r.status, 0);
      assert.deepEqual(r.events.map((event) => event.event), expectedOrder);
      assert.equal(r.isolatedCleaned, true);
      assert.deepEqual(r.userNotesFiles, []);
    });
  }
});
