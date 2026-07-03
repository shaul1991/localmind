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

// ── --clean: 30일 이전 항목 제거(FR-6) ──────────────────────────
if (process.argv.includes("--clean")) {
  const all = readRecords(LOG_PATH);
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

// ── 리포트 (렌더만 — 계산은 analyze) ────────────────────────────
const all = readRecords(LOG_PATH);
if (all === null) {
  console.log(`로그 없음(${LOG_PATH}) — 먼저 search_notes/ask_brain을 사용하면 쌓여요.`);
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

console.log(`총 쿼리 ${a.searches}건 · 성공률 ${a.successRate}% (실패 ${a.failed}건)`);

console.log("\n자주 실패하는 키워드 Top 10:");
if (a.topFailures.length === 0) console.log("  (없음)");
for (const [k, n] of a.topFailures) console.log(`  ${k} — ${n}회`);

if (a.captures) {
  console.log(`\n캡처 인덱싱 미확인: ${a.capturesUnconfirmed}/${a.captures}건`);
}

console.log("\n노트 갭(자주 찾지만 노트가 없는 주제):");
console.log(a.gapWords.length ? `  ${a.gapWords.join(", ")}` : "  (없음)");

console.log("\n개선 제안:");
for (const s of a.suggestions) console.log(`  • ${s}`);
