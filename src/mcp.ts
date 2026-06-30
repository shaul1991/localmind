#!/usr/bin/env node
/**
 * localmind MCP 서버 (stdio).
 *
 * MCP 호스트(Claude Desktop / Claude Code / Cursor / Codex 등)에게 localmind의
 * 능력을 "도구"로 노출한다(로컬 서브프로세스). 도구 정의는 ./mcp-server 공유.
 *
 * 순수 HTTP 클라이언트라 localmind 스택만 떠 있으면 동작한다.
 * stdout은 MCP 프로토콜 전용이므로 로그는 stderr로만 쓴다.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer, configSummary } from "./mcp-server.js";
import { watchNotes } from "./brain.js";

async function main() {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`[localmind-mcp] ready (${configSummary()})\n`);

  const watcher = watchNotes();

  const shutdown = () => {
    watcher.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  process.stderr.write(`[localmind-mcp] fatal: ${e}\n`);
  process.exit(1);
});
