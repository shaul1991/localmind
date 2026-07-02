/**
 * specs/004 — 실패 쿼리 분석 리포트 (Loop 4: 언덕 오르기).
 *
 * QUERY_LOG(JSONL, 기본 ~/.localmind/query-log.jsonl)를 읽어 최근 30일의
 * 성공률·실패 키워드·노트 갭·개선 제안을 출력한다.
 *
 * 사용:  npm run query-report            리포트 출력
 *        npm run query-report -- --clean 30일 이전 항목 정리(FR-6)
 *
 * 개인 쿼리 패턴이 담기므로 로그는 로컬 전용이며 repo·백업 커밋에서 제외된다(.gitignore).
 */
import fs from "node:fs";
import path from "node:path";

interface QueryRecord {
  ts: string;
  tool: "search_notes" | "ask_brain" | "capture_note";
  query: string;
  hitCount: number;
  success: boolean;
  folder?: string | null;
  captureValidation?: string | null;
  sources?: string[];
}

const LOG_PATH =
  process.env.QUERY_LOG ?? path.join(process.env.HOME ?? ".", ".localmind", "query-log.jsonl");
const DAYS = 30;
const MIN_SAMPLES = 20;

// 한국어 조사·불용어 간이 제거(형태소 분석 없이 — 데이터가 부족을 증명하면 재론).
const STOPWORDS = new Set(["이", "가", "을", "를", "의", "에", "은", "는", "와", "과", "로", "으로", "에서", "한", "그", "및"]);

function keywords(q: string): string[] {
  return q
    .split(/\s+/)
    .map((w) => w.replace(/[^\w가-힣]/g, ""))
    .map((w) => w.replace(/(이|가|을|를|의|은|는|에서|으로|로|에)$/u, (m, _p, offset) => (offset >= 2 ? "" : m)))
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

function readRecords(): QueryRecord[] | null {
  let raw: string;
  try {
    raw = fs.readFileSync(LOG_PATH, "utf8");
  } catch {
    return null;
  }
  const out: QueryRecord[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const r = JSON.parse(t) as QueryRecord;
      if (r && typeof r.ts === "string" && typeof r.query === "string") out.push(r);
    } catch {
      /* 손상 라인 — 건너뜀(리포트는 계속) */
    }
  }
  return out;
}

function recent(records: QueryRecord[]): QueryRecord[] {
  const cutoff = Date.now() - DAYS * 86400_000;
  return records.filter((r) => {
    const t = Date.parse(r.ts);
    return Number.isFinite(t) && t >= cutoff;
  });
}

// ── --clean: 30일 이전 항목 제거(FR-6) ──────────────────────────
if (process.argv.includes("--clean")) {
  const all = readRecords();
  if (all === null) {
    console.log("로그 없음 — 정리할 것이 없어요.");
    process.exit(0);
  }
  // "30일 이전"만 지운다 — ts를 해석할 수 없는 레코드는 나이를 단정할 수 없으므로
  // 보존한다(위임 범위 초과 삭제 방지 — self-review D-4).
  const cutoff = Date.now() - DAYS * 86400_000;
  const keep = all.filter((r) => {
    const t = Date.parse(r.ts);
    return !Number.isFinite(t) || t >= cutoff;
  });
  // 원자적 쓰기(temp+rename) — 쓰기 중 크래시로 로그 전체가 날아가지 않게(D-3).
  // 주의: 실행 중인 MCP가 그 사이 append한 레코드는 유실될 수 있다(분석용 로그라 수용).
  const tmp = `${LOG_PATH}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, keep.map((r) => JSON.stringify(r)).join("\n") + (keep.length ? "\n" : ""));
  fs.renameSync(tmp, LOG_PATH);
  console.log(`정리 완료 — ${all.length - keep.length}건 제거, ${keep.length}건 유지(최근 ${DAYS}일).`);
  process.exit(0);
}

// ── 리포트 ──────────────────────────────────────────────────────
const all = readRecords();
if (all === null) {
  console.log(`로그 없음(${LOG_PATH}) — 먼저 search_notes/ask_brain을 사용하면 쌓여요.`);
  process.exit(0);
}
const rs = recent(all).filter((r) => r.tool !== "capture_note");
const captures = recent(all).filter((r) => r.tool === "capture_note");

console.log(`── second-brain 검색 품질 리포트 (최근 ${DAYS}일) ──`);
if (rs.length < MIN_SAMPLES) {
  console.log(`⚠ 데이터 부족 (${rs.length}건 < ${MIN_SAMPLES}건) — 더 사용한 뒤 다시 분석하면 정확해져요.`);
}
const unconfirmedEarly = captures.filter((r) => r.captureValidation === "unconfirmed");
if (rs.length === 0) {
  console.log("최근 검색 기록이 없어요.");
  // 검색이 없어도 캡처 통계(FR-4.3)는 있으면 보여준다(self-review D-6).
  if (captures.length) console.log(`캡처 인덱싱 미확인: ${unconfirmedEarly.length}/${captures.length}건`);
  process.exit(0);
}

const failed = rs.filter((r) => !r.success || r.hitCount === 0);
const successRate = Math.round(((rs.length - failed.length) / rs.length) * 100);
console.log(`총 쿼리 ${rs.length}건 · 성공률 ${successRate}% (실패 ${failed.length}건)`);

// 실패 키워드 Top 10
const freq = new Map<string, number>();
for (const r of failed) for (const k of keywords(r.query)) freq.set(k, (freq.get(k) ?? 0) + 1);
const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log("\n자주 실패하는 키워드 Top 10:");
if (top.length === 0) console.log("  (없음)");
for (const [k, n] of top) console.log(`  ${k} — ${n}회`);

// 인덱싱 미확인(capture unconfirmed) 빈도
const unconfirmed = unconfirmedEarly;
if (captures.length) {
  console.log(`\n캡처 인덱싱 미확인: ${unconfirmed.length}/${captures.length}건`);
}

// 노트 갭 — 출처 없이 끝난 실패 주제
const gapWords = [...new Set(failed.filter((r) => !(r.sources?.length)).flatMap((r) => keywords(r.query)))].slice(0, 10);
console.log("\n노트 갭(자주 찾지만 노트가 없는 주제):");
console.log(gapWords.length ? `  ${gapWords.join(", ")}` : "  (없음)");

// 개선 제안(휴리스틱)
console.log("\n개선 제안:");
const suggestions: string[] = [];
if (failed.length / rs.length > 0.5) {
  suggestions.push("실패율이 50%를 넘어요 — 청크 크기 축소(BRAIN_CHUNK_SIZE=1000)를 시도해 보세요.");
}
if (gapWords.length >= 3) {
  suggestions.push(`자주 찾는 주제의 노트를 만들어 보세요: ${gapWords.slice(0, 5).join(", ")}`);
}
if (captures.length && unconfirmed.length / captures.length > 0.1) {
  suggestions.push("캡처 인덱싱 미확인이 10%를 넘어요 — 임베딩 서버 상태를 확인하세요(make health).");
}
if (suggestions.length === 0) suggestions.push("특이 사항 없음 — 지금처럼 사용하면 됩니다.");
for (const s of suggestions) console.log(`  • ${s}`);
