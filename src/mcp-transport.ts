/**
 * specs/045 — MCP 전송(transport) 선택 헬퍼 (순수·부작용 없음).
 *
 * mcp.ts 진입점이 이걸로 stdio(기본)와 http를 고른다. 자동 실행(main)이 없는 모듈이라
 * 단위 테스트에서 안전하게 import할 수 있다(AC-3·4·7).
 */
export type TransportMode = "stdio" | "http";

/** `MCP_TRANSPORT`로 전송 방식을 고른다. 미설정·미지 값은 stdio(안전한 기본 — 하위호환, FR-4).
 *  http는 명시적으로 `http`일 때만. */
export function resolveTransportMode(env: NodeJS.ProcessEnv = process.env): TransportMode {
  const raw = (env.MCP_TRANSPORT ?? "").trim().toLowerCase();
  return raw === "http" ? "http" : "stdio";
}

export interface HttpConfig {
  /** 바인드 호스트. 기본 비공개(127.0.0.1) — 네트워크 노출은 명시적 opt-in만(FR-3, AC-7). */
  host: string;
  /** 바인드 포트. 기본 8789(8787 스택·4000 litellm·8788 UI 모두 회피). */
  port: number;
  /** MCP 엔드포인트 경로. 기본 /mcp. */
  path: string;
  /** Bearer 인증 토큰. 비어 있으면 http 기동 거부(FR-2, AC-3). */
  token: string;
}

/** http 모드 설정을 env에서 읽는다. 기본값은 사설 우선(127.0.0.1)·8789·/mcp. */
export function httpConfigFromEnv(env: NodeJS.ProcessEnv = process.env): HttpConfig {
  const rawPort = Number(env.MCP_HTTP_PORT ?? 8789);
  return {
    host: env.MCP_HTTP_HOST?.trim() || "127.0.0.1",
    port: Number.isInteger(rawPort) && rawPort > 0 ? rawPort : 8789,
    path: env.MCP_HTTP_PATH?.trim() || "/mcp",
    token: env.MCP_AUTH_TOKEN ?? "",
  };
}
