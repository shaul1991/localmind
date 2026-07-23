/**
 * localmind MCP 서버를 공식 MCP 클라이언트 SDK로 검증한다.
 *   npm run smoke:mcp
 * 전제: 없음(stdio 자체 기동) — 도구 표면 4개(whoami·capture_note·search_notes·brief)를 확인한다.
 * (brief 호출 자체는 임베딩이 필요해 여기서 하지 않는다 — 무전제 유지. 동작 검증은 테스트 스위트.)
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function textOf(res: any): string {
  const c = res?.content?.[0];
  return c && c.type === "text" ? c.text : JSON.stringify(res);
}
function ok(label: string) {
  console.log(`\x1b[32m✓\x1b[0m ${label}`);
}

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/mcp.js"],
    env: { ...process.env } as Record<string, string>,
  });
  const client = new Client({ name: "smoke-mcp", version: "0.1.0" });
  await client.connect(transport);

  const tools = await client.listTools();
  const names = tools.tools.map((t) => t.name).sort();
  ok(`tools/list → ${names.join(", ")}`);
  const expected = ["brief", "capture_note", "search_notes", "whoami"];
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(`도구 표면이 다릅니다 — 기대 ${expected.join(",")} / 실제 ${names.join(",")}`);
  }

  const w = await client.callTool({ name: "whoami", arguments: {} });
  ok(`whoami → ${JSON.stringify(textOf(w).slice(0, 80))}`);

  await client.close();
  console.log("\n\x1b[32mMCP 도구 표면 통과\x1b[0m");
}

main().catch((e) => {
  console.error("\x1b[31m✗ 실패\x1b[0m", e);
  process.exit(1);
});
