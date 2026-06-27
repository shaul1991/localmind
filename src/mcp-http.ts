#!/usr/bin/env node
/**
 * localmind MCP 서버 (원격 HTTP/SSE).
 *
 * URL 하나로 팀/원격 클라이언트가 접속한다:
 *   - POST /mcp        Streamable HTTP (현대 표준 — Claude Code/Cursor/ChatGPT 원격 connector)
 *   - GET  /sse + POST /messages   레거시 SSE (구형 클라이언트 호환)
 *   - GET  /health     헬스체크
 *
 * 네트워크 노출이므로 Bearer 인증을 강제한다(MCP_HTTP_TOKEN). 토큰 없이 띄우려면
 * MCP_HTTP_ALLOW_NOAUTH=1 을 명시해야 한다(localhost 테스트 전용).
 *
 * 도구 정의는 stdio와 동일(./mcp-server). 인스턴스 식별은 MCP_INSTANCE.
 */
import express, { type Request, type Response, type NextFunction } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { buildServer, configSummary, INSTANCE } from "./mcp-server.js";

const PORT = Number(process.env.MCP_HTTP_PORT ?? 8788);
const HOST = process.env.MCP_HTTP_HOST ?? "0.0.0.0";
const TOKEN = process.env.MCP_HTTP_TOKEN?.trim();

if (!TOKEN && process.env.MCP_HTTP_ALLOW_NOAUTH !== "1") {
  process.stderr.write(
    "[localmind-mcp-http] MCP_HTTP_TOKEN 미설정 — 네트워크 노출 시 누구나 당신 CLI 구독/메모리를 쓸 수 있습니다.\n" +
      "  토큰을 설정하거나, localhost 테스트면 MCP_HTTP_ALLOW_NOAUTH=1 을 명시하세요.\n",
  );
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: "8mb" }));

function unauthorized(res: Response): void {
  res.status(401).json({ jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" }, id: null });
}
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!TOKEN) return next();
  if ((req.headers["authorization"] || "") === `Bearer ${TOKEN}`) return next();
  unauthorized(res);
}

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, instance: INSTANCE });
});

// ── Streamable HTTP (stateless: 요청마다 server+transport 새로) ──────
app.post("/mcp", requireAuth, async (req: Request, res: Response) => {
  try {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: String(e) }, id: null });
    }
  }
});
// stateless 모드에선 GET(알림 스트림)/DELETE(세션 종료) 미지원
app.get("/mcp", requireAuth, (_req: Request, res: Response) => {
  res.status(405).json({ jsonrpc: "2.0", error: { code: -32000, message: "Method Not Allowed" }, id: null });
});
app.delete("/mcp", requireAuth, (_req: Request, res: Response) => res.status(405).end());

// ── 레거시 SSE (stateful: 세션별 transport 보관) ────────────────────
const sseTransports: Record<string, SSEServerTransport> = {};
app.get("/sse", requireAuth, async (_req: Request, res: Response) => {
  const transport = new SSEServerTransport("/messages", res);
  sseTransports[transport.sessionId] = transport;
  res.on("close", () => {
    delete sseTransports[transport.sessionId];
  });
  const server = buildServer();
  await server.connect(transport);
});
app.post("/messages", requireAuth, async (req: Request, res: Response) => {
  const sid = String(req.query.sessionId ?? "");
  const transport = sseTransports[sid];
  if (!transport) {
    res.status(400).send("No transport for sessionId");
    return;
  }
  await transport.handlePostMessage(req, res, req.body);
});

app.listen(PORT, HOST, () => {
  process.stderr.write(
    `[localmind-mcp-http] listening on ${HOST}:${PORT}  auth=${TOKEN ? "on" : "OFF"}  (${configSummary()})\n` +
      `  Streamable HTTP: http://<host>:${PORT}/mcp   SSE: http://<host>:${PORT}/sse\n`,
  );
});
