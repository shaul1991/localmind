/**
 * cli-gateway MCP 서버를 공식 MCP 클라이언트 SDK로 검증한다.
 *   npm run smoke:mcp
 * 전제: 게이트웨이+메모리 스택이 떠 있어야 한다(ask=8787, memory=8767).
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
  ok(`tools/list → ${tools.tools.map((t) => t.name).join(", ")}`);

  const a = await client.callTool({
    name: "ask",
    arguments: { prompt: "Reply with exactly: MCP OK", model: "sonnet" },
  });
  ok(`ask → ${JSON.stringify(textOf(a).slice(0, 60))}`);

  const r = await client.callTool({
    name: "remember",
    arguments: { text: "내 노트북은 16인치 맥북 프로이고 색은 스페이스그레이다." },
  });
  ok(`remember → ${JSON.stringify(textOf(r).slice(0, 70))}`);

  const rc = await client.callTool({
    name: "recall",
    arguments: { query: "내 컴퓨터 기종", limit: 3 },
  });
  ok(`recall → ${JSON.stringify(textOf(rc).slice(0, 80))}`);

  await client.close();
  console.log("\n\x1b[32m모든 MCP 도구 통과\x1b[0m");
}

main().catch((e) => {
  console.error("\x1b[31m✗ 실패\x1b[0m", e);
  process.exit(1);
});
