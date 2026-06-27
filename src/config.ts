/**
 * 환경변수에서 설정을 읽어온다. 모든 값은 합리적인 기본값을 가진다.
 */

export type BackendName = "claude" | "codex";

/**
 * 세션 영속화 모드.
 *  - off:      항상 stateless (매 요청 전체 히스토리 전송)
 *  - explicit: 명시적 세션 id(헤더/필드)가 있을 때만 CLI 세션 resume
 *  - auto:     명시 id + 메시지 prefix 자동 매칭으로 투명하게 resume
 */
export type SessionMode = "off" | "explicit" | "auto";

export interface Config {
  port: number;
  host: string;
  apiKey: string | null;
  defaultBackend: BackendName;
  claudeDefaultModel: string;
  codexDefaultModel: string;
  claudeBin: string;
  codexBin: string;
  requestTimeoutMs: number;
  logLevel: "debug" | "info" | "warn" | "error";
  sessionMode: SessionMode;
  sessionTtlMs: number;
  sessionMax: number;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v.trim() === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v.trim() === "" ? fallback : v;
}

export function loadConfig(): Config {
  const defaultBackend = str("DEFAULT_BACKEND", "claude");
  const logLevel = str("LOG_LEVEL", "info");
  const sessionMode = str("SESSION_MODE", "auto");
  return {
    port: num("PORT", 8787),
    host: str("HOST", "127.0.0.1"),
    apiKey: process.env.CLI2PORT_API_KEY?.trim() || null,
    defaultBackend: defaultBackend === "codex" ? "codex" : "claude",
    claudeDefaultModel: str("CLAUDE_DEFAULT_MODEL", "sonnet"),
    codexDefaultModel: str("CODEX_DEFAULT_MODEL", "gpt-5.5"),
    claudeBin: str("CLAUDE_BIN", "claude"),
    codexBin: str("CODEX_BIN", "codex"),
    requestTimeoutMs: num("REQUEST_TIMEOUT_MS", 300_000),
    logLevel: (["debug", "info", "warn", "error"].includes(logLevel)
      ? logLevel
      : "info") as Config["logLevel"],
    sessionMode: (["off", "explicit", "auto"].includes(sessionMode)
      ? sessionMode
      : "auto") as SessionMode,
    sessionTtlMs: num("SESSION_TTL_MS", 3_600_000),
    sessionMax: num("SESSION_MAX", 1000),
  };
}
