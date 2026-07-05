import express, { type NextFunction, type Request, type Response } from "express";
import type { Config } from "./config.js";
import { Router as BackendRouter } from "./backends/router.js";
import { createChatHandler } from "./routes/chat.js";
import { createMessagesHandler } from "./routes/messages.js";
import { createModelsHandler } from "./routes/models.js";
import { SessionStore } from "./session.js";
import { log } from "./util/log.js";

/**
 * API 키 검증 (config.apiKey가 설정된 경우에만).
 * OpenAI식 `Authorization: Bearer <key>` 와 Anthropic식 `x-api-key: <key>` 둘 다 허용.
 */
export function authMiddleware(config: Config) {
  return function (req: Request, res: Response, next: NextFunction): void {
    if (!config.apiKey) return next();
    const bearer = (req.header("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const xApiKey = (req.header("x-api-key") || "").trim();
    if (bearer !== config.apiKey && xApiKey !== config.apiKey) {
      res.status(401).json({
        error: { message: "유효하지 않은 API 키입니다.", type: "authentication_error" },
      });
      return;
    }
    next();
  };
}

/**
 * Host 헤더 검증 (DNS rebinding 차단). config.allowedHosts가 null이면(=LOCALMIND_ALLOWED_HOSTS="*")
 * 통과시킨다. 그 외에는 Host의 호스트 부분(포트 제거)이 허용 목록에 없으면 403.
 * /health는 이 미들웨어보다 먼저 등록돼 예외(상태 조회는 어떤 Host로도 허용 — AC-4).
 */
export function hostGuardMiddleware(config: Config) {
  const allowed = config.allowedHosts;
  return function (req: Request, res: Response, next: NextFunction): void {
    if (allowed === null) return next();
    // 포트 제거 + 소문자화: "localhost:8787"→"localhost", "[::1]:8787"→"[::1]".
    // 호스트명은 대소문자 무시(RFC 3986/7230) — 정당한 구성(대문자 별칭·클라이언트)이
    // 오차단되지 않도록. allowedHosts도 소문자로 정규화돼 있다(config.parseAllowedHosts).
    const host = (req.headers.host ?? "").replace(/:\d+$/, "").toLowerCase();
    if (!allowed.includes(host)) {
      res.status(403).json({
        error: {
          message:
            "허용되지 않은 Host 헤더입니다(로컬 전용 서버). 리버스 프록시 등 특수 구성이면 " +
            "LOCALMIND_ALLOWED_HOSTS에 호스트명을 추가하세요.",
          type: "forbidden",
        },
      });
      return;
    }
    next();
  };
}

export function createServer(config: Config) {
  const app = express();
  const backendRouter = new BackendRouter(config);
  const sessions = new SessionStore(config.sessionMax, config.sessionTtlMs);

  app.use(express.json({ limit: "32mb" }));

  // 헬스체크 (인증·Host 검증 불필요) — hostGuard보다 먼저 등록해 예외 처리(AC-4).
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", defaultBackend: config.defaultBackend });
  });

  // Host 헤더 검증 — auth보다 앞(인터페이스 관문). /health는 위에서 이미 등록돼 제외.
  app.use(hostGuardMiddleware(config));

  const auth = authMiddleware(config);

  // OpenAI 호환 엔드포인트
  app.post("/v1/chat/completions", auth, createChatHandler(backendRouter, config, sessions));
  app.get("/v1/models", auth, createModelsHandler(config));

  // Anthropic 호환 엔드포인트
  app.post("/v1/messages", auth, createMessagesHandler(backendRouter, config, sessions));

  // 잘못된 JSON 등 파싱 에러
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    log.error("unhandled error:", err);
    if (res.headersSent) return;
    res.status(400).json({
      error: {
        message: err instanceof Error ? err.message : "요청 처리 중 오류",
        type: "invalid_request_error",
      },
    });
  });

  return app;
}
