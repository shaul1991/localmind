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
import { resolveTransportMode, httpConfigFromEnv } from "./mcp-transport.js";

async function main() {
  // specs/045 — 전송 선택. 미설정/미지/stdio → 기존 stdio 경로(하위호환 100%, FR-4).
  if (resolveTransportMode() === "http") {
    // http 모드에서만 express·전송 모듈을 로드(stdio 경로에 무게를 더하지 않는다).
    const { serveHttp } = await import("./mcp-http.js");
    const cfg = httpConfigFromEnv();
    const handle = await serveHttp(cfg); // 토큰 공백이면 throw → 아래 catch가 non-zero 종료(AC-3)
    process.stderr.write(
      `[localmind-mcp] http ready on ${cfg.host}:${handle.port}${cfg.path} (${configSummary()})\n`,
    );
    const shutdown = () => {
      handle.close().finally(() => process.exit(0));
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    return;
  }

  // 기본: stdio(로컬 서브프로세스) — 기존 동작 그대로.
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
