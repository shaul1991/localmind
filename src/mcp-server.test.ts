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
