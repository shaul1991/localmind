/**
 * Decision 도메인 — 순수 함수만(IO 없음). specs/202607211621-living-memory.
 *
 * 결정 3층(vision §4): 선택(choice, 불변)·이유(why, 불변)·전제(assumptions, 유통기한).
 * 전제는 volatility(high|low)와 last_verified(ISO)를 가진다 — 낡음 판정의 재료.
 * 노트 frontmatter로 직렬화한다(노트 파일 1개 = 결정 1개, 별도 저장소 없음).
 */
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export interface AssumptionInput {
  fact: string;
  volatility: "high" | "low";
}

export interface Assumption extends AssumptionInput {
  last_verified: string; // ISO — 캡처 시 자동, 이후 노트 파일 직접 편집으로 갱신(FR-5)
}

export interface DecisionInput {
  choice: string;
  why: string;
  assumptions?: AssumptionInput[];
}

export interface Decision {
  choice: string;
  why: string;
  assumptions: Assumption[];
}

/** 결정 입력 검증 — 문제 없으면 null, 있으면 평이한 한국어 안내(AC-3).
 *  결정 파라미터가 하나라도 오면 choice·why는 필수다(3층 세트). */
export function validateDecisionInput(input: {
  choice?: string;
  why?: string;
  assumptions?: Array<{ fact?: string; volatility?: string }>;
}): string | null {
  if (!input.choice?.trim() || !input.why?.trim()) {
    return "결정 캡처에는 choice(무엇을 골랐나)와 why(왜 골랐나)가 모두 필요해요. 두 값을 함께 보내주세요.";
  }
  for (const [i, a] of (input.assumptions ?? []).entries()) {
    if (!a.fact?.trim()) {
      return `assumptions[${i}]에 fact(전제 내용)가 비어 있어요. 전제가 없다면 assumptions를 생략해도 됩니다.`;
    }
    if (a.volatility !== "high" && a.volatility !== "low") {
      return `assumptions[${i}] "${a.fact}"에 volatility가 필요해요 — 시간이 지나면 바뀔 수 있는 사실이면 "high", 잘 안 바뀌면 "low"로 적어주세요.`;
    }
  }
  return null;
}

/** 결정 frontmatter 추가 라인(AC-1) — 각 전제의 last_verified는 캡처 시각으로 자동 스탬프. */
export function buildDecisionFrontmatterLines(input: DecisionInput, capturedIso: string): string[] {
  const decision: Decision = {
    choice: input.choice,
    why: input.why,
    assumptions: (input.assumptions ?? []).map((a) => ({ ...a, last_verified: capturedIso })),
  };
  // yaml.stringify로 안전 직렬화(인용·개행 이스케이프) — 마지막 개행만 제거해 라인 배열로.
  const block = stringifyYaml({ type: "decision", decision }).trimEnd();
  return block.split("\n");
}

/** 노트 전문에서 결정을 파싱한다 — 결정 아님/깨진 frontmatter는 null(신호 계산은 조용히
 *  생략된다, AC-9). 절대 throw하지 않는다. */
export function parseNoteDecision(noteText: string): Decision | null {
  try {
    if (!noteText.startsWith("---")) return null;
    const end = noteText.indexOf("\n---", 3);
    if (end < 0) return null;
    const fm = parseYaml(noteText.slice(3, end + 1));
    if (!fm || typeof fm !== "object" || fm.type !== "decision") return null;
    const d = fm.decision;
    if (!d || typeof d.choice !== "string" || typeof d.why !== "string") return null;
    const assumptions = Array.isArray(d.assumptions) ? d.assumptions : [];
    return {
      choice: d.choice,
      why: d.why,
      assumptions: assumptions
        .filter((a: unknown): a is Record<string, unknown> => !!a && typeof a === "object")
        .map((a: Record<string, unknown>) => ({
          fact: String(a.fact ?? ""),
          volatility: a.volatility === "high" ? ("high" as const) : ("low" as const),
          last_verified: String(a.last_verified ?? ""),
        })),
    };
  } catch {
    return null;
  }
}

// ── 구형식 폴백 (specs/202607231759) ─────────────────────────────

export interface LegacyDecisionNote {
  title: string;
  excerpt: string;
}

/** 구형식 결정 노트의 관대한 폴백(specs/202607231759). living-memory 이전의 결정 노트
 *  (frontmatter tags에 "decision")와 3층이 깨진 type: decision 노트를 제목+발췌로 환원한다 —
 *  구조를 강요하지 않고 과거 결정이 brief에 보이게 하는 게 목적(볼트 실측: 구형식 82건 중
 *  `## 선택` 절 보유는 12건뿐이라 구조 복원 대신 발췌). 신형식으로 파싱되는 노트는 null
 *  (정본 경로 parseNoteDecision이 처리). 판정 불가·깨진 노트도 null(AC-9 계승). */
export function parseLegacyDecisionNote(noteText: string): LegacyDecisionNote | null {
  try {
    if (!noteText.startsWith("---")) return null;
    const end = noteText.indexOf("\n---", 3);
    if (end < 0) return null;
    const fm = parseYaml(noteText.slice(3, end + 1)) as Record<string, unknown> | null;
    if (!fm || typeof fm !== "object") return null;
    if (parseNoteDecision(noteText)) return null;
    const tags = Array.isArray(fm.tags) ? fm.tags : [];
    if (!tags.includes("decision") && fm.type !== "decision") return null;
    const bodyLineEnd = noteText.indexOf("\n", end + 1);
    const body = bodyLineEnd < 0 ? "" : noteText.slice(bodyLineEnd + 1);
    // 본문에 내장된 두 번째 frontmatter 블록(과거 이중 frontmatter 관례)은 발췌에서 제거.
    // 수평선(---) 오탐 방지: 블록 첫 줄이 yaml key 꼴일 때만 제거한다.
    const cleaned = body.replace(/(^|\n)---\n(?=[A-Za-z_][\w-]*:)[\s\S]*?\n---(?=\n|$)/g, "\n");
    const headings = cleaned.split("\n").filter((l) => /^#/.test(l.trim()));
    const title =
      typeof fm.title === "string" && fm.title.trim()
        ? fm.title.trim()
        : (headings[0]?.replace(/^#+\s*/, "").trim() ?? "");
    const excerpt = cleaned
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l !== "---")
      .join(" ")
      .replace(/\s+/g, " ")
      .slice(0, 160);
    return { title, excerpt };
  } catch {
    return null;
  }
}

export interface StaleAssumption {
  fact: string;
  daysSince: number;
}

/** 낡음 판정(AC-7·8·10): volatility high이고 last_verified가 임계(일)를 지난 전제만.
 *  last_verified를 못 읽으면 stale로 본다(보수 — 미검증은 미검증으로 표시). */
export function staleAssumptions(d: Decision, now: Date, thresholdDays: number): StaleAssumption[] {
  const out: StaleAssumption[] = [];
  for (const a of d.assumptions) {
    if (a.volatility !== "high") continue;
    const t = Date.parse(a.last_verified);
    const daysSince = Number.isFinite(t) ? Math.floor((now.getTime() - t) / 86400_000) : Infinity;
    if (daysSince > thresholdDays) out.push({ fact: a.fact, daysSince });
  }
  return out;
}

/** 비차단 한 줄 신호(FR-4) — 노트 경로 포함(호스트 AI가 재검증 갱신 시 편집 대상 특정). */
export function staleSignalLine(notePath: string, stale: StaleAssumption[]): string {
  const maxDays = Math.max(...stale.map((s) => s.daysSince));
  const days = Number.isFinite(maxDays) ? `${maxDays}일` : "오래(기록 불명)";
  return `⏳ 재검증 권장: [${notePath}] 휘발성 높은 전제 ${stale.length}건이 마지막 검증 후 ${days} 경과 — 최신 사실 확인 뒤 노트의 last_verified를 갱신해 주세요.`;
}

/** 신호 임계(일) — env BRIEF_STALE_DAYS, 기본 30. 양의 정수만 유효(OQ-C1 재보정 대상). */
export function staleThresholdDays(envValue: string | undefined): number {
  const n = Number(envValue);
  return Number.isInteger(n) && n > 0 ? n : 30;
}
