/**
 * 리포트 노트 렌더 — 순수 함수 (specs/017 FR-6).
 * scripts/brain-report.ts(진입점)가 사용하며, 진입점은 파일 IO·페르소나 호출만 남긴다.
 */
import type { QueryAnalysis } from "./query-analysis.js";

/** ISO 8601 주차 — week-year(%G)와 주(%V). 연말·연초 경계에서 달력연도와 다를 수 있다
 *  (크리틱 리뷰 경미-3 — 순진한 YYYY 결합 금지). */
export function isoWeek(d: Date): { year: number; week: number } {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7; // 월=1 … 일=7
  date.setUTCDate(date.getUTCDate() + 4 - day); // 이 주의 목요일이 속한 해가 week-year
  const year = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400_000 + 1) / 7);
  return { year, week };
}

export function renderMarkdown(a: QueryAnalysis, interpretation: string | null, generatedAt: Date): string {
  const lines: string[] = [
    "---",
    `title: "검색 품질 리포트 (최근 ${a.days}일)"`,
    `date: ${generatedAt.toISOString().slice(0, 19)}`,
    "type: report",
    "source: localmind",
    "tags: [report]",
    "---",
    "",
    `# 검색 품질 리포트 — 최근 ${a.days}일`,
    "",
  ];
  if (a.insufficient) {
    lines.push(`> ⚠ 데이터 부족 (검색 ${a.searches}건 < ${a.minSamples}건) — 통계는 참고만 하세요.`, "");
  }
  lines.push(
    "## 요약",
    "",
    `- 검색·질문: ${a.searches}건 · 성공률 ${a.successRate}% (실패 ${a.failed}건)`,
    `- 캡처: ${a.captures}건 (인덱싱 미확인 ${a.capturesUnconfirmed}건)`,
    `- 답변 검증: 통과 ${a.verifyStats.pass} · 경고 ${a.verifyStats.warn} · 생략 ${a.verifyStats.skipped}`,
    "",
    "## 자주 실패하는 키워드",
    "",
    a.topFailures.length ? a.topFailures.map(([k, n]) => `- ${k} — ${n}회`).join("\n") : "- (없음)",
    "",
    "## 노트 갭 (자주 찾지만 노트가 없는 주제)",
    "",
    a.gapWords.length ? `- ${a.gapWords.join(", ")}` : "- (없음)",
    "",
    "## 개선 제안 (휴리스틱)",
    "",
    a.suggestions.map((s) => `- ${s}`).join("\n"),
    "",
  );
  if (interpretation) {
    lines.push("## 분석가 해석", "", interpretation.trim(), "");
  } else {
    lines.push("## 분석가 해석", "", "_analyst 페르소나가 없거나 응답하지 않아 이번 리포트는 집계만 담았습니다._", "");
  }
  return lines.join("\n");
}
