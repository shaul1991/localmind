/**
 * specs/017 FR-6 — 리포트 진입점: 실패 질의 집계(최근 7일)를 리포트 노트로 저장한다.
 * 노트는 색인 대상이라 search_notes로 회수된다. 페르소나(analyst) 해석부는
 * great-reduction(r1 B3)으로 추출(sdd-toolkit) — 집계-only 발행이다.
 * 계산은 src/query-analysis.ts, 렌더는 src/report-note.ts — 이 파일은 IO만(얇은 진입점).
 *
 * 사용: make report (주기 등록: make report-cron)
 *
 * 주의: 리포트 노트에는 검색 질의 원문이 포함되며, 노트 폴더는 백업 저장소에
 * 커밋된다(docs/agents.md의 안내와 동일 계열의 주의).
 */
import fs from "node:fs";
import path from "node:path";
import { analyze, readRecords } from "../src/query-analysis.js";
import { isoWeek, renderMarkdown } from "../src/report-note.js";
import { listFolders } from "../src/brain.js";

const LOG_PATH =
  process.env.QUERY_LOG ?? path.join(process.env.HOME ?? ".", ".localmind", "query-log.jsonl");
const DAYS = 7;
const MIN_SAMPLES = 10;

async function main(): Promise<void> {
  const records = readRecords(LOG_PATH) ?? [];
  const a = analyze(records, { days: DAYS, minSamples: MIN_SAMPLES });

  // 페르소나 해석부 추출됨(great-reduction r1 B3) — 집계-only. 해석이 필요하면
  // 리포트 노트를 대화의 AI에게 읽혀 해석시키면 된다(모델이 잘하는 일은 모델에게).
  const interpretation: string | null = null;

  const now = new Date();
  const { year, week } = isoWeek(now);
  const first = listFolders()[0];
  const reportsDir = path.join(first.dir, "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const file = path.join(reportsDir, `query-report-${year}-W${String(week).padStart(2, "0")}.md`);
  fs.writeFileSync(file, renderMarkdown(a, interpretation, now)); // 같은 주 재실행 = 갱신(AC-12)

  console.log(`📊 리포트 저장: ${file}`);
  if (a.insufficient) console.log(`ℹ 데이터 부족(검색 ${a.searches}건 < ${MIN_SAMPLES}건) — 집계만 기록했습니다.`);
  console.log("ℹ 다음 색인 때부터 search_notes 검색에 잡힙니다.");
}

main().catch((e) => {
  console.error(`brain-report 실패: ${(e as Error).message}`);
  process.exitCode = 1;
});
