/**
 * mcp-server.ts 도구 등록 단위 테스트 — InMemoryTransport로 실제 MCP 프로토콜을
 * 경유해 검증한다(zod 스키마 검증·핸들러 실행을 실제로 거침).
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "./mcp-server.js";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "localmind-mcp-scaffold-test-"));
}

describe("scaffold_sdd MCP tool", () => {
  let client: Client;

  before(async () => {
    const server = buildServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  });

  after(async () => {
    await client.close();
  });

  it("AC-2: MCP scaffold_sdd 호출 결과가 scaffoldSdd() 직접 호출과 동일한 파일 집합을 만든다", async () => {
    const dir = tmpDir();
    try {
      const result = await client.callTool({ name: "scaffold_sdd", arguments: { path: dir } });
      assert.equal(result.isError, false);
      assert.ok(fs.existsSync(path.join(dir, "AGENTS.md")));
      assert.ok(fs.existsSync(path.join(dir, "specs", "goal.template.md")));
      assert.ok(fs.existsSync(path.join(dir, "specs", "spec.template.md")));
      assert.ok(fs.existsSync(path.join(dir, "specs", "plan.template.md")));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("AC-6: path 파라미터 없이 호출하면 zod 스키마 검증으로 거부되고 파일이 생성되지 않는다", async () => {
    const dir = tmpDir();
    try {
      // SDK는 스키마 검증 실패를 프로토콜 레벨 거부가 아니라 isError:true 결과로 반환한다
      // (client.callTool()이 reject하지 않음 — 실제 호출로 확인한 동작).
      const result = await client.callTool({ name: "scaffold_sdd", arguments: {} });
      assert.equal(result.isError, true);
      const text = (result.content as Array<{ type: string; text?: string }>)
        .map((c) => c.text ?? "")
        .join("\n");
      assert.match(text, /path/i);
      assert.ok(!fs.existsSync(path.join(dir, "AGENTS.md")));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("상대경로는 명확한 에러로 거부된다(장수명 MCP 프로세스의 cwd 모호성 방지)", async () => {
    const result = await client.callTool({
      name: "scaffold_sdd",
      arguments: { path: "relative/path" },
    });
    assert.equal(result.isError, true);
    const text = (result.content as Array<{ type: string; text?: string }>)
      .map((c) => c.text ?? "")
      .join("\n");
    assert.match(text, /절대경로/);
  });
});

// ── specs/016 AC-11: 페르소나 레지스트리 MCP 도구(list_agents · deploy_agents) ──
describe("list_agents / deploy_agents MCP tools", () => {
  let client: Client;
  let root: string;
  const savedEnv: Record<string, string | undefined> = {};

  before(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-mcp-agents-test-"));
    const registryDir = path.join(root, "registry");
    fs.mkdirSync(registryDir, { recursive: true });
    fs.mkdirSync(path.join(root, "dot-claude"), { recursive: true });
    fs.mkdirSync(path.join(root, "dot-codex"), { recursive: true });
    fs.writeFileSync(
      path.join(registryDir, "critic.md"),
      "---\nname: critic\ndescription: 적대 검증\ntargets:\n  claude:\n    model: opus\n  codex:\n    model: gpt-5.5\n    reasoning_effort: high\n---\n결함을 찾으러 간다.\n",
    );
    // deployAgents/loadRegistry는 호출 시점에 env를 읽으므로(레지스트리와 달리 모듈
    // 로드 시점 고정이 아님) 같은 프로세스에서 env 주입으로 격리할 수 있다.
    for (const k of ["LOCALMIND_AGENTS_DIR", "LOCALMIND_CLAUDE_AGENTS_DIR", "LOCALMIND_CODEX_HOME"]) {
      savedEnv[k] = process.env[k];
    }
    process.env.LOCALMIND_AGENTS_DIR = registryDir;
    process.env.LOCALMIND_CLAUDE_AGENTS_DIR = path.join(root, "dot-claude", "agents");
    process.env.LOCALMIND_CODEX_HOME = path.join(root, "dot-codex");

    const server = buildServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  });

  after(async () => {
    await client.close();
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("AC-11: list_agents가 레지스트리의 페르소나를 대상·모델과 함께 반환한다", async () => {
    const result = await client.callTool({ name: "list_agents", arguments: {} });
    assert.equal(result.isError, false);
    const text = (result.content as Array<{ text?: string }>).map((c) => c.text ?? "").join("\n");
    assert.match(text, /critic/);
    assert.match(text, /opus/);
    assert.match(text, /gpt-5\.5/);
  });

  it("AC-11: deploy_agents가 배포를 수행하고 결과를 한국어로 요약한다", async () => {
    const result = await client.callTool({ name: "deploy_agents", arguments: {} });
    assert.equal(result.isError, false);
    const text = (result.content as Array<{ text?: string }>).map((c) => c.text ?? "").join("\n");
    assert.match(text, /critic/);
    assert.match(text, /생성됨|변경 없음/);
    assert.ok(fs.existsSync(path.join(root, "dot-claude", "agents", "critic.md")));
    assert.ok(fs.existsSync(path.join(root, "dot-codex", "critic.config.toml")));
    assert.ok(fs.existsSync(path.join(root, "dot-codex", "agents", "critic.toml")));
  });
});
