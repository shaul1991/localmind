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
 *
 * specs/017: 집계 계산은 src/query-analysis.ts(순수 모듈)와 공유한다 — 이 파일은
 * CLI 렌더(30일/20건 창)만 남은 얇은 진입점이다. 리포트 노트는 scripts/brain-report.ts.
 */
import fs from "node:fs";
import path from "node:path";
import { analyze, readRecords } from "../src/query-analysis.js";

const LOG_PATH =
  process.env.QUERY_LOG ?? path.join(process.env.HOME ?? ".", ".localmind", "query-log.jsonl");
const DAYS = 30;
const MIN_SAMPLES = 20;
const SCORE_MIN_SAMPLES = 10; // specs/025 — 스코어 분포 전용 게이트(전체 표본과 모집단이 다름)

// ── --clean: 30일 이전 항목 제거(FR-6; specs/041 FR-004로 raw-line 방식 전환) ──
// 041 FR-004: 파싱→재직렬화(readRecords)는 미지·확장·malformed 필드를 유실시킨다.
// 따라서 원본 JSONL의 raw line을 대상으로 판정한다 — "JSON object로 parse되고 유효한 ts가
// cutoff보다 오래된 행"만 제거하고, 최근 행·해석 불가 ts·malformed non-empty line·미지의
// 필드를 byte-for-byte 보존한다(확장 additive 필드 손실 방지).
if (process.argv.includes("--clean")) {
  let raw: string;
  try {
    raw = fs.readFileSync(LOG_PATH, "utf8");
  } catch {
    console.log("로그 없음 — 정리할 것이 없어요.");
    process.exit(0);
  }
  const cutoff = Date.now() - DAYS * 86400_000;
  const segments = raw.split("\n"); // "\n" join으로 원문 복원 가능(마지막 trailing "" 포함)
  let removed = 0;
  const kept = segments.filter((line) => {
    if (line.trim() === "") return true; // 빈/trailing 세그먼트 — 구조 보존
    let obj: unknown;
    try {
      obj = JSON.parse(line);
    } catch {
      return true; // malformed non-empty line — 나이를 단정 불가, 보존
    }
    // JSON object가 아니거나(배열·원시값) ts가 문자열이 아니면 나이 판정 불가 → 보존
    if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return true;
    const ts = (obj as { ts?: unknown }).ts;
    if (typeof ts !== "string") return true;
    const t = Date.parse(ts);
    if (!Number.isFinite(t)) return true; // 해석 불가 ts — 보존
    if (t >= cutoff) return true; // 최근 행 — 보존
    removed++;
    return false; // parse됨 + 유효 ts + cutoff보다 오래됨 → 유일한 제거 대상
  });
  // 원자적 쓰기(temp+rename) — 쓰기 중 크래시로 로그 전체가 날아가지 않게(D-3).
  // 주의: 실행 중인 MCP가 그 사이 append한 레코드는 유실될 수 있다(분석용 로그라 수용).
  const tmp = `${LOG_PATH}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, kept.join("\n"));
  fs.renameSync(tmp, LOG_PATH);
  console.log(`정리 완료 — ${removed}건 제거(최근 ${DAYS}일 유지).`);
  process.exit(0);
}

// ── 리포트 (렌더만 — 계산은 analyze) ────────────────────────────
const all = readRecords(LOG_PATH);
if (all === null) {
  console.log(`로그 없음(${LOG_PATH}) — 먼저 search_notes를 사용하면 쌓여요.`);
  process.exit(0);
}
const a = analyze(all, { days: DAYS, minSamples: MIN_SAMPLES });

console.log(`── second-brain 검색 품질 리포트 (최근 ${DAYS}일) ──`);
if (a.insufficient) {
  console.log(`⚠ 데이터 부족 (${a.searches}건 < ${MIN_SAMPLES}건) — 더 사용한 뒤 다시 분석하면 정확해져요.`);
}
if (a.searches === 0) {
  console.log("최근 검색 기록이 없어요.");
  // 검색이 없어도 캡처 통계(FR-4.3)는 있으면 보여준다(self-review D-6).
  if (a.captures) console.log(`캡처 인덱싱 미확인: ${a.capturesUnconfirmed}/${a.captures}건`);
  process.exit(0);
}

console.log(`총 쿼리 ${a.searches}건 · 결과 반환률 ${a.successRate}% (실패 ${a.failed}건)`);

console.log("\n자주 실패하는 키워드 Top 10:");
if (a.topFailures.length === 0) console.log("  (없음)");
for (const [k, n] of a.topFailures) console.log(`  ${k} — ${n}회`);

if (a.captures) {
  console.log(`\n캡처 인덱싱 미확인: ${a.capturesUnconfirmed}/${a.captures}건`);
}

console.log("\n노트 갭(자주 찾지만 노트가 없는 주제):");
console.log(a.gapWords.length ? `  ${a.gapWords.join(", ")}` : "  (없음)");

// specs/025 — 스코어 분포(소프트 실패 관측 기준선). 게이트는 topScore 보유 성공분
// 기준(SCORE_MIN_SAMPLES) — 레거시 라인이 많아 전체 표본이 충분해도 보유분이 적으면
// N=1짜리 무의미한 분포를 내지 않는다.
if (a.scoreStats.count >= SCORE_MIN_SAMPLES) {
  const f = (v: number) => v.toFixed(2);
  console.log("\n스코어 분포(성공 검색의 최상위 스코어):");
  console.log(
    `  중앙값 ${f(a.scoreStats.median)} · p25 ${f(a.scoreStats.p25)} · 최소 ${f(a.scoreStats.min)} · 최대 ${f(a.scoreStats.max)} (${a.scoreStats.count}건)`,
  );
  console.log("  • 낮을수록 '결과는 나왔지만 어정쩡한' 검색이 많다는 뜻 — 검색 개선의 기준선이에요.");
  if (a.scoredMissing > 0) console.log(`  • 스코어 미기록 ${a.scoredMissing}건(업데이트 이전 기록)은 제외했어요.`);
}

console.log("\n개선 제안:");
for (const s of a.suggestions) console.log(`  • ${s}`);
