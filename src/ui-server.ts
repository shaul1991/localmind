/**
 * specs/034 — 모니터링 UI 서버(호스트 사이드, 127.0.0.1 전용).
 * 도커 스택(:8787)과 분리된 이유: 상태 정본(노트·인덱스·.env·에이전트 레지스트리·git)이
 * 전부 호스트에 있고 컨테이너에는 마운트되지 않는다(plan 개정 이력 2026-07-06).
 * 진입점: make ui → scripts/ui.sh(NOTES_DIR 등 .env 해석·export — specs/019 규칙) → 이 파일.
 * 기존 서버의 인증(authMiddleware)·Host 가드(hostGuardMiddleware)를 그대로 재사용한다.
 */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import { loadConfig, type Config } from "./config.js";
import { authMiddleware, hostGuardMiddleware } from "./server.js";
import { createUiRouter, type UiDeps } from "./routes/ui.js";
import { notesFolders, brainIndexPath } from "./brain.js";
import { log, setLogLevel } from "./util/log.js";

export type { UiDeps } from "./routes/ui.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

/** 실환경 기본값 — 전부 기존 정본 규칙에서 계산(재유도 금지). */
export function defaultUiDeps(): UiDeps {
  const projectDir = path.resolve(MODULE_DIR, "..");
  return {
    projectDir,
    envFile: path.join(projectDir, ".env"),
    folders: notesFolders().map((f) => ({ label: f.label, dir: f.dir })),
    indexPath: brainIndexPath(),
    queryLogPath:
      process.env.QUERY_LOG ?? path.join(process.env.HOME ?? ".", ".localmind", "query-log.jsonl"),
    services: [
      { name: "gateway", url: "http://127.0.0.1:8787/v1/models" },
      { name: "embeddings", url: "http://127.0.0.1:4000/health/liveliness" },
      { name: "memory", url: `http://127.0.0.1:${process.env.OPENMEMORY_PORT || "8767"}/docs` },
    ],
    publicDir: path.join(projectDir, "public", "ui"),
  };
}

export function createUiApp(config: Config, deps: UiDeps = defaultUiDeps()) {
  const app = express();

  // 헬스체크(인증·Host 검증 불필요 — 기존 서버와 동일 예외)
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", role: "monitoring-ui" });
  });

  app.use(hostGuardMiddleware(config));

  // 정적 UI — 자산에는 데이터·시크릿이 없고(KeyGate가 클라이언트에서 키를 받아 API 호출),
  // 상태 데이터는 전부 아래 인증된 /ui/api 뒤에 있다.
  app.get("/", (_req, res) => res.redirect("/ui/"));
  app.use("/ui/api", authMiddleware(config), createUiRouter(deps));
  app.use("/ui", express.static(deps.publicDir));

  return app;
}

function main(): void {
  const config = loadConfig();
  setLogLevel(config.logLevel);
  // `make ui`는 미지정 변수를 빈 문자열로 넘긴다 — 빈 값은 미설정으로 취급(||).
  const host = process.env.UI_HOST || "127.0.0.1";
  const port = Number(process.env.UI_PORT || 8788);
  const app = createUiApp(config);
  const server = app.listen(port, host, () => {
    log.info(`localmind 모니터링 UI: http://${host}:${port}/ui`);
    log.info(`  auth: ${config.apiKey ? "enabled (LOCALMIND_API_KEY)" : "disabled (open)"}`);
  });
  const shutdown = (sig: string) => {
    log.info(`received ${sig}, shutting down...`);
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

// 엔트리로 실행될 때만 listen(테스트는 createUiApp만 사용)
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
