/**
 * 원격 MCP(HTTP/SSE) 서버 스모크: 인증, tools/list, whoami 호출.
 *   MCP_HTTP_URL(기본 http://127.0.0.1:8788/mcp), MCP_HTTP_TOKEN 사용.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const ENDPOINT = process.env.MCP_HTTP_URL ?? "http://127.0.0.1:8788/mcp";
const TOKEN = process.env.MCP_HTTP_TOKEN ?? "";

async function connect(token: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), {
    requestInit: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
  });
  const client = new Client({ name: "smoke", version: "0.0.0" });
  await client.connect(transport);
  return client;
}

async function main(): Promise<void> {
  // 1) 잘못된 토큰 → 거부되어야 함
  try {
    await connect("wrong-token");
    console.log("✗ 인증: 잘못된 토큰인데 연결됨 (실패)");
  } catch {
    console.log("✓ 인증: 잘못된 토큰 거부됨");
  }

  // 2) 올바른 토큰 → tools/list + whoami
  const client = await connect(TOKEN);
  const tools = await client.listTools();
  console.log("✓ tools:", tools.tools.map((t) => t.name).join(", "));

  const who = await client.callTool({ name: "whoami", arguments: {} });
  const text = (who.content as any[])?.[0]?.text ?? "";
  console.log("✓ whoami:\n" + text.split("\n").map((l: string) => "    " + l).join("\n"));

  await client.close();
  console.log("=== DONE ===");
}

main().catch((e) => {
  console.error("smoke 실패:", e.message);
  process.exit(1);
});
