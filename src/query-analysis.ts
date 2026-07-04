/**
 * 쿼리 로그 집계·분석 — 순수 모듈 (specs/004 계산부를 specs/017에서 추출).
 *
 * 로그 레코드 타입의 단일 정본이자, CLI 리포트(scripts/query-report.ts)와 리포트
 * 노트(scripts/brain-report.ts)가 공유하는 계산 레이어다. 출력(렌더)은 각 진입점의
 * 몫 — 이 모듈은 콘솔에 아무것도 쓰지 않는다.
 *
 * 집계 창(days)·최소 표본(minSamples)은 파라미터다: CLI는 30일/20건(기존 출력 유지),
 * 리포트 노트는 7일/10건(specs/017 plan).
 */
import fs from "node:fs";

export interface QueryLogRecord {
  ts: string;
  tool: "search_notes" | "ask_brain" | "capture_note";
  query: string;
  hitCount: number;
  success: boolean;
  folder?: string | null;
  captureValidation?: string | null;
  sources?: string[];
  /** specs/017 — ask_brain 검증 결과. env로 끈 호출·미구성(페르소나 없음)은 필드 없음. */
  verify?: "pass" | "warn" | "skipped";
  /** specs/017 — 합성에 쓴 모델(관측: 응답은 무음이어도 로그로 감사). */
  model?: string;
  /** specs/017 — 합성에 개입한 페르소나 이름(사서 개입 시 "librarian"). */
  persona?: string;
  /** specs/025 — 반환 결과의 최상위 코사인 스코어(히트 없으면 null, 구형 로그엔 필드 없음). */
  topScore?: number | null;
}

// 한국어 조사·불용어 간이 제거(형태소 분석 없이 — 데이터가 부족을 증명하면 재론).
const STOPWORDS = new Set(["이", "가", "을", "를", "의", "에", "은", "는", "와", "과", "로", "으로", "에서", "한", "그", "및"]);

export function keywords(q: string): string[] {
  return q
    .split(/\s+/)
    .map((w) => w.replace(/[^\w가-힣]/g, ""))
    .map((w) => w.replace(/(이|가|을|를|의|은|는|에서|으로|로|에)$/u, (m, _p, offset) => (offset >= 2 ? "" : m)))
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

/** JSONL 로그를 읽는다. 파일 없음은 null, 손상 라인은 건너뛴다. */
export function readRecords(logPath: string): QueryLogRecord[] | null {
  let raw: string;
  try {
    raw = fs.readFileSync(logPath, "utf8");
  } catch {
    return null;
  }
  const out: QueryLogRecord[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const r = JSON.parse(t) as QueryLogRecord;
      if (r && typeof r.ts === "string" && typeof r.query === "string") out.push(r);
    } catch {
      /* 손상 라인 — 건너뜀(분석은 계속) */
    }
  }
  return out;
}

export interface AnalysisOptions {
  days: number;
  minSamples: number;
  now?: number;
}

export interface QueryAnalysis {
  days: number;
  minSamples: number;
  /** 창 내 검색·질의(ask/search) 건수 */
  searches: number;
  failed: number;
  /** 반올림 % — searches가 0이면 0 */
  successRate: number;
  topFailures: [string, number][];
  gapWords: string[];
  captures: number;
  capturesUnconfirmed: number;
  /** specs/017 — 검증 결과 통계(verify 필드가 있는 레코드만) */
  verifyStats: { pass: number; warn: number; skipped: number };
  suggestions: string[];
  /** searches < minSamples */
  insufficient: boolean;
  /** specs/025 — 성공 레코드 중 topScore 보유분의 분포(소프트 실패 관측 기준선).
   *  분위는 정렬 후 결정적 인덱스(round((n-1)·p)) — 보간 없음. count 0이면 나머지는 0. */
  scoreStats: { count: number; min: number; p25: number; median: number; max: number };
  /** specs/025 — 성공 레코드인데 topScore가 없는(구형 로그) 수 — 하위호환 가시화. */
  scoredMissing: number;
}

export function analyze(records: QueryLogRecord[], opts: AnalysisOptions): QueryAnalysis {
  const now = opts.now ?? Date.now();
  const cutoff = now - opts.days * 86400_000;
  const recent = records.filter((r) => {
    const t = Date.parse(r.ts);
    return Number.isFinite(t) && t >= cutoff;
  });
  const rs = recent.filter((r) => r.tool !== "capture_note");
  const captures = recent.filter((r) => r.tool === "capture_note");
  const failed = rs.filter((r) => !r.success || r.hitCount === 0);
  const successRate = rs.length ? Math.round(((rs.length - failed.length) / rs.length) * 100) : 0;

  const freq = new Map<string, number>();
  for (const r of failed) for (const k of keywords(r.query)) freq.set(k, (freq.get(k) ?? 0) + 1);
  const topFailures = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  const gapWords = [...new Set(failed.filter((r) => !r.sources?.length).flatMap((r) => keywords(r.query)))].slice(0, 10);
  const capturesUnconfirmed = captures.filter((r) => r.captureValidation === "unconfirmed").length;

  const verifyStats = { pass: 0, warn: 0, skipped: 0 };
  for (const r of rs) if (r.verify) verifyStats[r.verify]++;

  // specs/025 — 스코어 분포: 성공 레코드(search_notes+ask_brain — 같은 코사인 스케일) 중
  // topScore 보유분만. 레거시(미기록) 성공분은 scoredMissing으로 따로 센다(투명성).
  // 모집단은 기존 실패 판정(!success || hitCount===0)의 여집합과 정합하게(교차 리뷰) —
  // 비정상 라인(success:true + hitCount:0)이 분포에 섞이지 않는다.
  const succeeded = rs.filter((r) => r.success && r.hitCount > 0);
  const scores = succeeded
    .filter((r) => typeof r.topScore === "number")
    .map((r) => r.topScore as number)
    .sort((a, b) => a - b);
  const q = (pq: number) => (scores.length ? scores[Math.min(scores.length - 1, Math.round((scores.length - 1) * pq))] : 0);
  const scoreStats = {
    count: scores.length,
    min: scores.length ? scores[0] : 0,
    p25: q(0.25),
    median: q(0.5),
    max: scores.length ? scores[scores.length - 1] : 0,
  };
  const scoredMissing = succeeded.length - scores.length;

  // 개선 제안(휴리스틱) — CLI 기존 문구를 그대로 보존한다(출력 회귀 금지).
  const suggestions: string[] = [];
  if (rs.length > 0 && failed.length / rs.length > 0.5) {
    suggestions.push("실패율이 50%를 넘어요 — 청크 크기 축소(BRAIN_CHUNK_SIZE=1000)를 시도해 보세요.");
  }
  if (gapWords.length >= 3) {
    suggestions.push(`자주 찾는 주제의 노트를 만들어 보세요: ${gapWords.slice(0, 5).join(", ")}`);
  }
  if (captures.length && capturesUnconfirmed / captures.length > 0.1) {
    suggestions.push("캡처 인덱싱 미확인이 10%를 넘어요 — 임베딩 서버 상태를 확인하세요(make health).");
  }
  if (suggestions.length === 0) suggestions.push("특이 사항 없음 — 지금처럼 사용하면 됩니다.");

  return {
    days: opts.days,
    minSamples: opts.minSamples,
    searches: rs.length,
    failed: failed.length,
    successRate,
    topFailures,
    gapWords,
    captures: captures.length,
    capturesUnconfirmed,
    verifyStats,
    suggestions,
    insufficient: rs.length < opts.minSamples,
    scoreStats,
    scoredMissing,
  };
}

/** 특정 날짜(UTC 일 기준)에 검증이 시도된(verify 필드가 있는) 레코드 수 —
 *  specs/017 일일 상한 카운터(별도 상태 파일 없이 로그가 곧 카운터). */
export function countVerifyOnDay(records: QueryLogRecord[], now: number = Date.now()): number {
  const day = new Date(now).toISOString().slice(0, 10);
  return records.filter((r) => r.verify && r.ts.slice(0, 10) === day).length;
}
