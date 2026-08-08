import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "lm-remote-preflight-"));
process.env.HOME = TMP;
process.env.NOTES_DIR = path.join(TMP, "notes");
process.env.BRAIN_INDEX = path.join(TMP, ".brain-index.json");
process.env.QUERY_LOG = path.join(TMP, "query-log.jsonl");
process.env.LOCALMIND_DEPLOYMENT_ID = "home-main";
process.env.MCP_AUTH_TOKEN = "fixture-secret-never-print";
fs.mkdirSync(process.env.NOTES_DIR, { recursive: true });

let handle: import("./mcp-http.js").ServeHttpHandle;
let endpoint = "";
let runRemotePreflight: typeof import("./remote-preflight.js").runRemotePreflight;
const TOKEN = "fixture-secret-never-print";
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

before(async () => {
  ({ runRemotePreflight } = await import("./remote-preflight.js"));
  const { serveHttp } = await import("./mcp-http.js");
  handle = await serveHttp({ host: "127.0.0.1", port: 0, path: "/mcp", token: TOKEN });
  endpoint = `http://127.0.0.1:${handle.port}/mcp`;
});

after(async () => {
  await handle?.close();
  fs.rmSync(TMP, { recursive: true, force: true });
});

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

function reset(): string {
  fs.rmSync(path.join(TMP, ".claude.json"), { force: true });
  const project = fs.mkdtempSync(path.join(TMP, "project-"));
  return project;
}

const httpEntry = () => ({
  type: "http",
  url: endpoint,
  headers: { Authorization: "Bearer ${MCP_AUTH_TOKEN}" },
});

test("Claude Code 설정·정본 identity의 상태를 읽기 전용으로 판정하고 secret을 출력하지 않는다", async () => {
  process.env.LOCALMIND_TEST_URL = endpoint;
  process.env.AWS_SECRET_ACCESS_KEY = "do-not-send";
  const cases: Array<{
    name: string;
    setup: (project: string) => void;
    expectedCode: string;
    ok: boolean;
    expectedId?: string;
    env?: NodeJS.ProcessEnv;
  }> = [
    { name: "없음", setup: () => {}, expectedCode: "NO_CONFIG", ok: false },
    {
      name: "user-stdio",
      setup: () => writeJson(path.join(TMP, ".claude.json"), { mcpServers: { localmind: { type: "stdio", command: "node" } } }),
      expectedCode: "NOT_HTTP",
      ok: false,
    },
    {
      name: "local-http",
      setup: (project) => writeJson(path.join(TMP, ".claude.json"), { projects: { [project]: { mcpServers: { localmind: httpEntry() } } } }),
      expectedCode: "UNSAFE_SCOPE",
      ok: false,
    },
    {
      name: "user-http",
      setup: () => writeJson(path.join(TMP, ".claude.json"), { mcpServers: { localmind: httpEntry() } }),
      expectedCode: "OK",
      ok: true,
    },
    {
      name: "둘 다",
      setup: (project) => writeJson(path.join(TMP, ".claude.json"), {
        mcpServers: { localmind: { type: "stdio", command: "node" } },
        projects: { [project]: { mcpServers: { localmind: httpEntry() } } },
      }),
      expectedCode: "MULTIPLE_CONFIGS",
      ok: false,
    },
    {
      name: "wrong identity",
      setup: () => writeJson(path.join(TMP, ".claude.json"), { mcpServers: { localmind: httpEntry() } }),
      expectedCode: "WRONG_IDENTITY",
      ok: false,
      expectedId: "another-brain",
    },
    {
      name: "auth 실패",
      setup: () => writeJson(path.join(TMP, ".claude.json"), { mcpServers: { localmind: httpEntry() } }),
      expectedCode: "CONNECTION_FAILED",
      ok: false,
      env: { ...process.env, MCP_AUTH_TOKEN: "wrong-secret" },
    },
    {
      name: "허용하지 않은 secret 환경변수",
      setup: () => writeJson(path.join(TMP, ".claude.json"), {
        mcpServers: { localmind: { type: "http", url: endpoint, headers: { Authorization: "Bearer ${AWS_SECRET_ACCESS_KEY}" } } },
      }),
      expectedCode: "CONFIG_INVALID",
      ok: false,
    },
  ];

  for (const c of cases) {
    const project = reset();
    c.setup(project);
    const result = await runRemotePreflight({
      home: TMP,
      projectDir: project,
      expectedDeploymentId: c.expectedId ?? "home-main",
      env: c.env ?? process.env,
    });
    assert.equal(result.ok, c.ok, c.name);
    assert.equal(result.code, c.expectedCode, c.name);
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, new RegExp(TOKEN), `${c.name}: token 미노출`);
    assert.doesNotMatch(serialized, /\/(?:Users|home|root|tmp)\//, `${c.name}: 절대경로 미노출`);
    if (c.name === "wrong identity") assert.equal(result.deploymentId, undefined, "원격의 신뢰하지 않는 id 미출력");
  }
});

test("기대 deployment id가 공개 안전 형식이 아니면 네트워크 전에 거부한다", async () => {
  const project = reset();
  writeJson(path.join(TMP, ".claude.json"), { mcpServers: { localmind: httpEntry() } });

  const result = await runRemotePreflight({ home: TMP, projectDir: project, expectedDeploymentId: "/tmp/private", env: process.env });

  assert.equal(result.code, "CONFIG_INVALID");
  assert.equal(result.deploymentId, undefined);
});

test("한 scope 설정을 읽을 수 없으면 다른 유효 user 설정이 있어도 fail closed 한다", async () => {
  process.env.LOCALMIND_TEST_URL = endpoint;
  const project = reset();
  fs.writeFileSync(path.join(project, ".mcp.json"), "{ broken");
  writeJson(path.join(TMP, ".claude.json"), { mcpServers: { localmind: httpEntry() } });

  const result = await runRemotePreflight({ home: TMP, projectDir: project, expectedDeploymentId: "home-main", env: process.env });

  assert.equal(result.ok, false);
  assert.equal(result.code, "CONFIG_INVALID");
});

test("scope 구조와 인증 헤더가 불완전하면 네트워크 전에 fail closed 한다", async () => {
  const malformedEntries = [
    { project: { mcpServers: { localmind: null } }, user: { mcpServers: { localmind: httpEntry() } } },
    { project: undefined, user: { projects: { [path.join(TMP, "project")]: "broken" }, mcpServers: { localmind: httpEntry() } } },
    { project: undefined, user: { mcpServers: { localmind: { type: "http", url: endpoint } } } },
    { project: undefined, user: { mcpServers: { localmind: { type: "http", url: endpoint, headers: null } } } },
    { project: undefined, user: { mcpServers: { localmind: { type: "http", url: endpoint, headers: { Authorization: `Bearer ${TOKEN}` } } } } },
  ];

  for (const item of malformedEntries) {
    const project = reset();
    if (item.project) writeJson(path.join(project, ".mcp.json"), item.project);
    const user = structuredClone(item.user);
    if (user.projects) user.projects = { [project]: "broken" };
    writeJson(path.join(TMP, ".claude.json"), user);
    const result = await runRemotePreflight({ home: TMP, projectDir: project, expectedDeploymentId: "home-main", env: process.env });
    assert.equal(result.code, "CONFIG_INVALID");
  }
});

test("응답하지 않는 endpoint는 제한 시간 안에 실패한다", async () => {
  const hanging = createServer(() => {});
  await new Promise<void>((resolve) => hanging.listen(0, "127.0.0.1", resolve));
  const address = hanging.address();
  if (!address || typeof address === "string") throw new Error("fixture address unavailable");
  const project = reset();
  writeJson(path.join(TMP, ".claude.json"), { mcpServers: { localmind: { ...httpEntry(), url: `http://127.0.0.1:${address.port}/mcp` } } });

  try {
    const started = Date.now();
    const result = await runRemotePreflight({ home: TMP, projectDir: project, expectedDeploymentId: "home-main", env: process.env, timeoutMs: 25 });
    assert.equal(result.code, "CONNECTION_FAILED");
    assert.ok(Date.now() - started < 1000);
  } finally {
    hanging.closeAllConnections();
    await new Promise<void>((resolve) => hanging.close(() => resolve()));
  }
});

test("remote-check CLI는 설정을 바꾸지 않고 확인 결과만 공개 안전하게 출력한다", async () => {
  process.env.LOCALMIND_TEST_URL = endpoint;
  const project = reset();
  const configFile = path.join(TMP, ".claude.json");
  writeJson(configFile, { mcpServers: { localmind: httpEntry() } });
  const before = fs.readFileSync(configFile, "utf8");

  const output = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn("node", ["--import", path.join(REPO, "node_modules/tsx/dist/esm/index.mjs"), path.join(REPO, "scripts/remote-check.ts"), "home-main"], {
      cwd: project,
      env: { ...process.env, HOME: TMP, QUERY_LOG: path.join(TMP, "isolated-cli-query-log.jsonl") },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });

  assert.equal(output.code, 0, output.stderr);
  assert.match(output.stdout, /정본 identity를 확인/);
  assert.equal(fs.readFileSync(configFile, "utf8"), before, "설정 파일 불변");
  assert.doesNotMatch(output.stdout + output.stderr, new RegExp(TOKEN));
  assert.doesNotMatch(output.stdout + output.stderr, /\/(?:Users|home|root|tmp)\//);
});
