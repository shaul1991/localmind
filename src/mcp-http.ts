/**
 * specs/045 — MCP HTTP(Streamable HTTP) 전송 모드.
 *
 * 항상 켜진 홈서버가 단일 두뇌를 서비스하고, 다른 기기(맥 Claude Code)가 Tailscale 사설 URL로
 * 이 엔드포인트에 붙는다. 기본 stdio 경로(src/mcp.ts)는 그대로이며 이 모듈은 http 모드에서만
 * dynamic import된다.
 *
 * 보안: Bearer 토큰을 강제하고(토큰 없으면 기동 거부), 기본 바인딩은 비공개(127.0.0.1)다.
 * 도구 정의(buildServer)와 노트 워처(watchNotes)는 프로세스당 1회, 세션은 SDK 표준 세션맵.
 *
 * SDK API(설치본 v1.29.0 + 공식문서 T1로 확인, 2026-07-12):
 * - StreamableHTTPServerTransport({ sessionIdGenerator }) — stateful 세션.
 * - transport.handleRequest(req, res, req.body).
 * - stateful 표준 응답: 미지 세션→404, 세션 없는 비-initialize→400(아래서 라우팅 단계에 명시).
 */
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { AddressInfo } from "node:net";
import express, { type Request, type Response, type NextFunction, type ErrorRequestHandler } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { buildServer } from "./mcp-server.js";
import { watchNotes } from "./brain.js";
import type { HttpConfig } from "./mcp-transport.js";

export interface ServeHttpHandle {
  /** 실제 바인딩된 포트(테스트에서 port:0을 쓰면 OS가 고른 포트). */
  port: number;
  /** 워처·세션·서버를 정리하고 포트를 닫는다. */
  close: () => Promise<void>;
}

function jsonRpcError(res: Response, status: number, code: number, message: string): void {
  res.status(status).json({ jsonrpc: "2.0", error: { code, message }, id: null });
}

/** Bearer 토큰 검증 미들웨어(상수시간 비교). 헤더 없음/불일치 → 401(FR-2, AC-2). */
function makeBearerAuth(token: string) {
  const expected = Buffer.from(token, "utf8");
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.headers.authorization ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(Array.isArray(header) ? header[0] : header);
    const provided = match ? Buffer.from(match[1], "utf8") : Buffer.alloc(0);
    // 길이 가드 후 timingSafeEqual(길이 노출은 고정 길이 토큰이라 무해, 표준 관행).
    const ok = provided.length === expected.length && timingSafeEqual(provided, expected);
    if (!ok) {
      jsonRpcError(res, 401, -32001, "인증 실패: 유효한 Bearer 토큰이 필요합니다.");
      return;
    }
    next();
  };
}

/**
 * http 모드 MCP 서버를 띄운다. 토큰이 비어 있으면 포트를 열기 전에 throw한다(FR-2, AC-3 —
 * 호출자 src/mcp.ts가 non-zero로 종료). 반환된 handle.close()로 정리한다.
 */
export async function serveHttp(cfg: HttpConfig): Promise<ServeHttpHandle> {
  if (!cfg.token || !cfg.token.trim()) {
    throw new Error(
      "http 모드에는 인증 토큰이 필요합니다 — 환경변수 MCP_AUTH_TOKEN을 설정하세요('make mcp-serve-http'가 없으면 토큰을 생성해 안내합니다).",
    );
  }

  const app = express();
  // 순서가 보안의 핵심: 인증을 **먼저**, JSON 파싱은 그다음. 미인증 요청이 body 파서에 닿으면
  // 깨진 JSON에 대해 Express 기본 오류 핸들러가 스택트레이스(절대경로)를 인증 전에 노출한다(045
  // self-review 중대 결함). 인증 통과분만 파싱하고, 파싱 실패는 아래 오류 핸들러가 스택 없는
  // 표준 JSON-RPC 400으로 응답한다.
  app.use(cfg.path, makeBearerAuth(cfg.token));
  app.use(cfg.path, express.json());

  // 프로세스당 세션맵. 정상 종료(DELETE)·onclose에 축소된다. 유기 세션 방지용 상한(단일 사용자
  // 전제라 넉넉히) — 초과 시 가장 오래된 세션을 닫아 회수한다.
  const MAX_SESSIONS = 256;
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const handle = async (req: Request, res: Response): Promise<void> => {
    try {
      const raw = req.headers["mcp-session-id"];
      const sessionId = Array.isArray(raw) ? raw[0] : raw;

      if (sessionId) {
        const existing = transports.get(sessionId);
        if (!existing) {
          // 미지·만료 세션 → 404(AC-5, SDK stateful 표준과 동일 의미)
          jsonRpcError(res, 404, -32001, "세션을 찾을 수 없습니다(만료되었거나 잘못된 세션 ID).");
          return;
        }
        await existing.handleRequest(req, res, req.body);
        return;
      }

      // 세션 ID 없음 — initialize 요청만 새 세션을 생성한다.
      if (!isInitializeRequest(req.body)) {
        // 세션 없는 비-initialize → 400(AC-5, SDK stateful 표준과 동일 의미)
        jsonRpcError(res, 400, -32000, "세션 ID가 없고 initialize 요청도 아닙니다.");
        return;
      }

      // 유기 세션 상한 — 초과 시 가장 오래된 세션을 닫아 회수(메모리 누적 방지).
      if (transports.size >= MAX_SESSIONS) {
        const oldest = transports.keys().next().value as string | undefined;
        if (oldest) {
          const stale = transports.get(oldest);
          transports.delete(oldest);
          void stale?.close().catch(() => {});
        }
      }
      const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id: string) => {
          transports.set(id, transport);
        },
      });
      transport.onclose = () => {
        const id = transport.sessionId;
        if (id) transports.delete(id);
      };
      // 세션마다 buildServer()로 도구를 노출(도구 정의는 무변경 공유). watchNotes는 프로세스당 1회.
      const server = buildServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (e) {
      // 비밀·경로를 노출하지 않는 일반 오류(진단은 stderr).
      process.stderr.write(`[localmind-mcp-http] 요청 처리 오류: ${(e as Error).message}\n`);
      if (!res.headersSent) jsonRpcError(res, 500, -32603, "내부 오류가 발생했습니다.");
    }
  };

  app.post(cfg.path, handle);
  app.get(cfg.path, handle);
  app.delete(cfg.path, handle);

  // JSON 파싱 실패(깨진 본문) 등 미들웨어/라우트 오류를 스택·절대경로 노출 없이 표준 JSON-RPC
  // 오류로 응답한다(인증 통과 후에만 파싱하므로 미인증에는 401이 먼저 난다).
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next): void => {
    if (res.headersSent) return;
    const e = err as { message?: string; status?: number; statusCode?: number };
    process.stderr.write(`[localmind-mcp-http] 요청 오류: ${e?.message ?? String(err)}\n`);
    // 원 오류의 HTTP status를 보존한다(예: 본문 과대 → 413). 스택·절대경로는 노출하지 않는다.
    const status = typeof e?.status === "number" ? e.status : typeof e?.statusCode === "number" ? e.statusCode : 400;
    const message =
      status === 413 ? "요청 본문이 너무 큽니다." : "요청 본문을 파싱할 수 없거나 처리 중 오류가 발생했습니다.";
    jsonRpcError(res, status, -32700, message);
  };
  app.use(errorHandler);

  const watcher = watchNotes(); // 파일 변경 재인덱싱 — 프로세스당 1회(FR-5)
  const httpServer = app.listen(cfg.port, cfg.host);
  await new Promise<void>((resolve, reject) => {
    httpServer.once("listening", () => resolve());
    httpServer.once("error", reject);
  });
  const addr = httpServer.address() as AddressInfo | null;
  const boundPort = addr ? addr.port : cfg.port;

  return {
    port: boundPort,
    async close() {
      watcher.close();
      for (const t of transports.values()) {
        try {
          await t.close();
        } catch {
          /* 정리 중 오류는 무시 */
        }
      }
      transports.clear();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}
