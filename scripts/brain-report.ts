/**
 * specs/017 FR-6 — 분석가 리포트 진입점: 실패 질의 집계(최근 7일) + analyst 페르소나
 * 해석을 리포트 노트로 저장한다. 노트는 색인 대상이라 recall/ask_brain으로 회수된다.
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
import { personaChat, resolvePersona } from "../src/agents/runtime.js";
import { listFolders } from "../src/brain.js";

const LOG_PATH =
  process.env.QUERY_LOG ?? path.join(process.env.HOME ?? ".", ".localmind", "query-log.jsonl");
const DAYS = 7;
const MIN_SAMPLES = 10;

async function main(): Promise<void> {
  const records = readRecords(LOG_PATH) ?? [];
  const a = analyze(records, { days: DAYS, minSamples: MIN_SAMPLES });

  // 분석가 해석 — 표본이 부족하면 해석도 생략(데이터 없는 해석은 소음, AC-13).
  let interpretation: string | null = null;
  if (!a.insufficient) {
    const analyst = resolvePersona("analyst");
    if (analyst) {
      const res = await personaChat(analyst, {
        user:
          `아래는 개인 second-brain의 최근 ${DAYS}일 검색 품질 집계다. 패턴·가설·개선 제안을 ` +
          `간결한 마크다운(불릿 위주, 300자 내외)으로 해석하라.\n\n` +
          JSON.stringify(
            {
              searches: a.searches,
              successRate: a.successRate,
              failed: a.failed,
              topFailures: a.topFailures,
              gapWords: a.gapWords,
              captures: a.captures,
              capturesUnconfirmed: a.capturesUnconfirmed,
              verifyStats: a.verifyStats,
            },
            null,
            2,
          ),
        systemPrefix: "역할 제한: 지금은 검색 품질 집계 해석만 한다. 수치에 근거해서만 말하라.",
        prefer: "claude",
        timeoutMs: Math.max(1000, Number(process.env.BRAIN_REPORT_TIMEOUT_MS ?? 60_000)),
      });
      interpretation = res?.text ?? null;
    }
  }

  const now = new Date();
  const { year, week } = isoWeek(now);
  const first = listFolders()[0];
  const reportsDir = path.join(first.dir, "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const file = path.join(reportsDir, `query-report-${year}-W${String(week).padStart(2, "0")}.md`);
  fs.writeFileSync(file, renderMarkdown(a, interpretation, now)); // 같은 주 재실행 = 갱신(AC-12)

  console.log(`📊 리포트 저장: ${file}`);
  if (a.insufficient) console.log(`ℹ 데이터 부족(검색 ${a.searches}건 < ${MIN_SAMPLES}건) — 집계만 기록했습니다.`);
  else if (!interpretation) console.log("ℹ analyst 페르소나 없음/무응답 — 집계만 기록했습니다.");
  console.log("ℹ 다음 색인 때부터 recall/ask_brain 검색에 잡힙니다.");
}

main().catch((e) => {
  console.error(`brain-report 실패: ${(e as Error).message}`);
  process.exitCode = 1;
});
