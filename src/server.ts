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
function authMiddleware(config: Config) {
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

export function createServer(config: Config) {
  const app = express();
  const backendRouter = new BackendRouter(config);
  const sessions = new SessionStore(config.sessionMax, config.sessionTtlMs);

  app.use(express.json({ limit: "32mb" }));

  // 헬스체크 (인증 불필요)
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", defaultBackend: config.defaultBackend });
  });

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
