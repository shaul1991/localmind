/**
 * 환경변수에서 설정을 읽어온다. 모든 값은 합리적인 기본값을 가진다.
 */

export type BackendName = "claude" | "codex";

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
  };
}
