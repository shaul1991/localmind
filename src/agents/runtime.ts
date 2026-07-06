/**
 * 페르소나 런타임 위임 (specs/017 FR-1) — 레지스트리의 페르소나를 해석하고, 그 지침·
 * 모델로 게이트웨이 호출을 대신한다. brain의 세 지점(사서 합성·크리틱 검증·큐레이터
 * 태깅)과 분석가 리포트가 재사용한다.
 *
 * 불변식: 이 모듈은 brain.ts를 import하지 않는다 — 게이트웨이 설정(LOCALMIND_URL·
 * LOCALMIND_API_KEY)은 자체적으로 env에서 읽는다. brain의 private 상수를 꺼내오려고
 * import하면 brain→runtime→brain 순환이 생긴다(specs/017 plan 불변식).
 */
import { loadRegistry, type Persona } from "./registry.js";
import { detectBackend } from "../backends/router.js";

export type GatewayBackend = "claude" | "codex";

// env는 호출 시점에 읽는다 — 장수명 프로세스·테스트(자식 프로세스 env 주입) 모두에서
// 모듈 로드 순서에 얽매이지 않게.
function gatewayUrl(): string {
  return (process.env.LOCALMIND_URL ?? "http://localhost:8787").replace(/\/$/, "");
}
function gatewayKey(): string | undefined {
  return process.env.LOCALMIND_API_KEY?.trim() || undefined;
}

/** 모델 문자열이 게이트웨이에서 어느 백엔드로 라우팅되는지(판별 불가 시 null).
 *  페르소나 교차리뷰(specs/016)는 claude↔codex 독립성이 대상이라 gemini는 여기서 제외한다
 *  (gemini는 API/MCP 백엔드일 뿐 페르소나 교차 대상 아님 — specs/035 Non-goal). */
export function modelBackend(model: string): GatewayBackend | null {
  const b = detectBackend(model);
  return b === "claude" || b === "codex" ? b : null;
}

export interface TargetPick {
  backend: GatewayBackend;
  model: string;
}

/** 페르소나의 대상들을 게이트웨이 라우팅 기준 백엔드로 정규화한다.
 *  대상 라벨(claude/codex)이 아니라 **모델명이 실제로 라우팅되는 백엔드**가 기준 —
 *  사용자가 targets.claude에 gpt 계열을 적어도 교차 판정이 어긋나지 않는다. */
function candidates(p: Persona): TargetPick[] {
  const out: TargetPick[] = [];
  if (p.targets.claude) {
    out.push({ backend: modelBackend(p.targets.claude.model) ?? "claude", model: p.targets.claude.model });
  }
  if (p.targets.codex) {
    out.push({ backend: modelBackend(p.targets.codex.model) ?? "codex", model: p.targets.codex.model });
  }
  return out;
}

/** prefer 백엔드 우선으로 대상 하나를 고른다. 없으면 나머지 대상, 그것도 없으면 null. */
export function pickTarget(p: Persona, prefer?: GatewayBackend): TargetPick | null {
  const c = candidates(p);
  if (!c.length) return null;
  if (prefer) return c.find((t) => t.backend === prefer) ?? c[0];
  return c[0];
}

/** avoid와 **다른 백엔드**의 대상만 고른다(교차 검증용, specs/017 FR-3).
 *  avoid를 판별할 수 없으면(null) 교차를 보장할 수 없으므로 null — 동종 검증으로
 *  위장하지 않는다. */
export function pickCrossTarget(p: Persona, avoid: GatewayBackend | null): TargetPick | null {
  if (!avoid) return null;
  return candidates(p).find((t) => t.backend !== avoid) ?? null;
}

/** 레지스트리에서 이름으로 페르소나를 해석한다 — 매 호출 재읽기(핫리로드).
 *  부재·정의 문제·레지스트리 없음 모두 null(호출부가 무음 폴백, FR-1). */
export function resolvePersona(name: string): Persona | null {
  try {
    return loadRegistry().personas.find((p) => p.name === name) ?? null;
  } catch {
    return null;
  }
}

export interface PersonaChatOptions {
  user: string;
  /** 페르소나 본문 **앞**에 붙는 런타임 강제 규칙 — 항상 페르소나보다 이긴다. */
  systemPrefix?: string;
  /** 대상 직접 지정(교차 판정 결과 등). 없으면 prefer로 고른다. */
  target?: TargetPick;
  prefer?: GatewayBackend;
  timeoutMs: number;
}
export interface PersonaChatResult {
  text: string;
  backend: GatewayBackend;
  model: string;
}

/** 페르소나의 지침·모델로 게이트웨이에 1회 질의한다.
 *  실패·시간 초과·빈 응답은 모두 null — 호출부가 "생략"으로 처리한다(FR-4).
 *  위임 실패가 본래 기능을 막지 않는 것이 이 모듈의 계약이다. */
export async function personaChat(p: Persona, opts: PersonaChatOptions): Promise<PersonaChatResult | null> {
  const target = opts.target ?? pickTarget(p, opts.prefer);
  if (!target) return null;
  const system = [opts.systemPrefix?.trim(), p.prompt].filter(Boolean).join("\n\n");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = gatewayKey();
  if (key) headers.Authorization = `Bearer ${key}`;
  try {
    const res = await fetch(`${gatewayUrl()}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: target.model,
        stream: false,
        messages: [
          { role: "system", content: system },
          { role: "user", content: opts.user },
        ],
      }),
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
    if (!res.ok) return null;
    const j: any = await res.json();
    const text = j?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) return null;
    return { text, backend: target.backend, model: target.model };
  } catch {
    return null;
  }
}

export interface Verdict {
  ok: boolean;
  issues: string[];
}

/** 크리틱 응답에서 판정 JSON을 관대하게 추출한다 — 코드펜스·전후 텍스트 허용.
 *  해석 불가는 null(호출부가 "생략" 처리 — 답변을 볼모로 잡지 않는다, FR-4). */
export function parseVerdict(text: string): Verdict | null {
  const tryParse = (s: string): Verdict | null => {
    try {
      const v = JSON.parse(s);
      if (typeof v?.ok !== "boolean") return null;
      const issues = Array.isArray(v.issues) ? v.issues.filter((i: unknown) => typeof i === "string") : [];
      return { ok: v.ok, issues };
    } catch {
      return null;
    }
  };
  const direct = tryParse(text.trim());
  if (direct) return direct;
  // 본문·코드펜스 속 JSON 오브젝트 — 중첩 괄호를 위해 greedy(첫 { ~ 끝 })를 먼저,
  // 그다음 non-greedy 후보들을 시도한다.
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    const v = tryParse(text.slice(first, last + 1));
    if (v) return v;
  }
  for (const m of text.matchAll(/\{[\s\S]*?\}/g)) {
    const v = tryParse(m[0]);
    if (v) return v;
  }
  return null;
}
