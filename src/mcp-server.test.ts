/**
 * mcp-server.ts 도구 등록 단위 테스트 — InMemoryTransport로 실제 MCP 프로토콜을
 * 경유해 검증한다(zod 스키마 검증·핸들러 실행을 실제로 거침).
 *
 * great-reduction AC-1: 등록 도구는 정확히 3개(capture_note·search_notes·whoami)다.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "./mcp-server.js";

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
  });

  it("AC-1: 등록 도구가 정확히 capture_note·search_notes·whoami 3개다", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["capture_note", "search_notes", "whoami"]);
  });

  it("whoami가 노트 폴더를 보고하고 게이트웨이·메모리 서비스는 언급하지 않는다", async () => {
    const result = await client.callTool({ name: "whoami", arguments: {} });
    assert.equal(result.isError, false);
    const text = (result.content as Array<{ text?: string }>).map((c) => c.text ?? "").join("\n");
    assert.match(text, /notes folders/);
    assert.doesNotMatch(text, /gateway|8787|8767|memory:/);
  });
});
