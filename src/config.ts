/**
 * 환경변수에서 설정을 읽어온다. 모든 값은 합리적인 기본값을 가진다.
 */

export type BackendName = "claude" | "codex" | "gemini";

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
  /** Gemini API 키(OpenAI 호환 엔드포인트용). 없으면 Gemini 요청만 오류. */
  geminiApiKey: string | null;
  /** Gemini 기본 모델(요청 model이 비었을 때). 무료 티어는 flash 계열. */
  geminiDefaultModel: string;
  /** Gemini OpenAI 호환 base URL(끝의 /chat/completions는 어댑터가 붙임). */
  geminiBaseUrl: string;
  claudeBin: string;
  codexBin: string;
  requestTimeoutMs: number;
  logLevel: "debug" | "info" | "warn" | "error";
  sessionMode: SessionMode;
  sessionTtlMs: number;
  sessionMax: number;
  /**
   * Host 헤더 허용 목록(DNS rebinding 차단). null이면 검증 끔(LOCALMIND_ALLOWED_HOSTS="*").
   * 기본 목록 + LOCALMIND_ALLOWED_HOSTS(콤마) 추가분. 포트는 비교 시 제거된다.
   */
  allowedHosts: string[] | null;
}

/**
 * Host 허용 목록을 구성한다. LOCALMIND_ALLOWED_HOSTS는 기본 목록에 **추가**된다(교체 아님) —
 * 사용자가 컨테이너 서비스명(localmind)을 빠뜨려 내부 litellm 호출이 차단되는 footgun 방지.
 * "*" 단독이면 null(검증 끔 — 리버스 프록시 등 고급 구성용).
 */
function parseAllowedHosts(): string[] | null {
  const DEFAULTS = ["localhost", "127.0.0.1", "[::1]", "localmind", "host.docker.internal"];
  const raw = process.env.LOCALMIND_ALLOWED_HOSTS?.trim() ?? "";
  if (raw === "*") return null;
  const extra = raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  // 대소문자 무시 비교를 위해 소문자로 정규화(호스트명은 case-insensitive).
  return [...DEFAULTS, ...extra].map((h) => h.toLowerCase());
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
    apiKey: process.env.LOCALMIND_API_KEY?.trim() || null,
    defaultBackend: defaultBackend === "codex" ? "codex" : "claude",
    claudeDefaultModel: str("CLAUDE_DEFAULT_MODEL", "sonnet"),
    codexDefaultModel: str("CODEX_DEFAULT_MODEL", "gpt-5.5"),
    geminiApiKey: process.env.GEMINI_API_KEY?.trim() || null,
    // 무료 flash 정확 ID는 라이브 확인 대상(specs/035 Open question). 현세대 stable 기본값.
    geminiDefaultModel: str("GEMINI_DEFAULT_MODEL", "gemini-3.5-flash"),
    geminiBaseUrl: str(
      "GEMINI_BASE_URL",
      "https://generativelanguage.googleapis.com/v1beta/openai",
    ),
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
    allowedHosts: parseAllowedHosts(),
  };
}
