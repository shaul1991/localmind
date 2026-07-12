/**
 * specs/032 FR-6·7 — 회고 노트 렌더(순수). 6섹션 + reports/ 주의 + 자기 개정 게이트 고지.
 * 쓰기는 여기서 하지 않는다 — 유일 쓰기 지점은 src/retro-guard.ts(FR-7).
 */
import type { CommitAggregate, DecisionNote, OpenQuestionItem, InventoryEntry } from "./retro-analysis.js";
import { classifyPatterns, PROMOTE_THRESHOLD } from "./retro-analysis.js";
import type { QueryAnalysis } from "./query-analysis.js";

export interface RetroAggregate {
  days: number;
  repoLabel: string; // 대상 저장소 표시(개인 경로 아님 — basename)
  isGitRepo: boolean;
  commits: CommitAggregate;
  openQuestions: OpenQuestionItem[]; // 미해결만
  hasSpecsDir: boolean;
  decisions: DecisionNote[];
  query: QueryAnalysis | null;
  guides: InventoryEntry[];
  projects: InventoryEntry[];
  insufficient: boolean;
}

export function renderRetro(a: RetroAggregate, interpretation: string | null, generatedAt: Date): string {
  const date = generatedAt.toISOString().slice(0, 10);
  const L: string[] = [];
  L.push("---");
  L.push(`title: "워크플로우 회고 ${date}"`);
  L.push(`date: ${generatedAt.toISOString().slice(0, 19)}`);
  L.push("tags: [report, retro]");
  L.push("type: retro");
  L.push("source: localmind");
  L.push("---");
  L.push("");
  L.push(`# 워크플로우 회고 — ${date} (최근 ${a.days}일)`);
  L.push("");
  L.push("> ⚠️ 이 노트는 노트 폴더 `reports/`에 저장되어 검색에 잡히고 백업 저장소에 커밋됩니다.");
  L.push("> 커밋 해시·스펙 번호·결정 노트 제목·검색 질의 요약이 담깁니다.");
  L.push(">");
  L.push("> 🔒 **회고는 제안까지만 합니다** — 규약(AGENTS.md)·페르소나·스펙의 실제 개정은");
  L.push("> 사용자 결정 + SDD 스펙을 경유합니다(자기 개정 금지 — specs/032).");
  L.push("");

  // 1. 작업 패턴 관측
  L.push("## 1. 작업 패턴 관측 (기계 집계)");
  L.push("");
  if (!a.isGitRepo) {
    L.push(`- 대상(${a.repoLabel})이 git 저장소가 아니에요 — 커밋 집계를 건너뜁니다.`);
  } else {
    L.push(`- 커밋 ${a.commits.total}건 (대상: ${a.repoLabel})`);
    const types = Object.entries(a.commits.byType)
      .sort((x, y) => y[1] - x[1])
      .map(([t, c]) => `${t} ${c}`)
      .join(" · ");
    if (types) L.push(`- 타입 분포: ${types}`);
    const cadence = Object.entries(a.commits.specCadence)
      .sort((x, y) => y[1] - x[1])
      .map(([n, c]) => `${n}(${c})`)
      .join(" · ");
    if (cadence) L.push(`- 스펙 cadence: ${cadence}`);
  }
  L.push("- 승인 루프 등 개입 횟수의 정밀 카운트는 이 프록시 집계의 능력 밖입니다(트랜스크립트 미사용 — 정직한 한계).");
  L.push("");

  // 2. 자동화 후보
  const { promoted, observing } = classifyPatterns(a.commits.patterns);
  L.push(`## 2. 자동화 후보 (반복 ${PROMOTE_THRESHOLD}회 이상만 승격)`);
  L.push("");
  L.push("> bare 타입(feat·docs 등 스코프 없는 반복)은 모든 저장소에서 자명해 승격에서 제외합니다(첫 실전 검증).");
  L.push("");
  if (promoted.length === 0) L.push("- 승격 기준을 넘은 scoped 반복 패턴이 없어요.");
  for (const p of promoted) L.push(`- **승격**: \`${p.pattern}\` — ${p.count}회 반복`);
  for (const p of observing) L.push(`- 관찰 중: \`${p.pattern}\` — ${p.count}회 (3회부터 승격)`);
  L.push("");

  // 3. OQ 대시보드
  L.push("## 3. Open questions 대시보드");
  L.push("");
  L.push("> 취소선(~~) 없는 항목은 미해결로 표시됩니다 — 해결 여부는 사람이 판별하세요(파서의 문서화된 한계).");
  L.push("");
  if (!a.hasSpecsDir) {
    L.push("- 이 저장소에는 specs/ 폴더가 없어요 — OQ 대시보드를 건너뜁니다.");
  } else if (a.openQuestions.length === 0) {
    L.push("- 미해결 Open question이 없습니다.");
  } else {
    let cur = "";
    for (const q of a.openQuestions) {
      if (q.spec !== cur) {
        cur = q.spec;
        L.push(`- **${q.spec}**`);
      }
      L.push(`  - ${q.text}`);
    }
  }
  L.push("");

  // 4. 결정 로그 요약
  L.push("## 4. 결정 로그 요약");
  L.push("");
  if (a.decisions.length === 0) {
    L.push("- 수집된 결정 노트가 없어요(frontmatter tags에 `decision` — capture_note의 tags 옵션).");
  } else {
    for (const d of a.decisions)
      L.push(`- ${d.date.slice(0, 10)} · ${d.title}${d.specRefs.length ? ` (${d.specRefs.join(", ")})` : ""}`);
  }
  L.push("");

  // 5. 검색 품질 요약
  L.push("## 5. 검색 품질 요약 (query-report 집계 재사용)");
  L.push("");
  if (!a.query) {
    L.push("- 검색 로그가 없어요 — 건너뜁니다.");
  } else {
    L.push(`- 검색 ${a.query.searches}건 · 결과 반환률 ${a.query.successRate}% · 실패 ${a.query.failed}건`); // successRate는 이미 % 값(query-analysis — codex 적발: 이중 ×100 방지). 표시 문구만 "결과 반환률"(041 FR-004) — JSON key는 불변
  }
  if (a.guides.length > 0) L.push(`- 도메인 가이드 ${a.guides.length}개: ${a.guides.map((g) => g.name).join(", ")}`);
  if (a.projects.length > 0) L.push(`- 계약 저장소 ${a.projects.length}개: ${a.projects.map((p) => p.name).join(", ")}`);
  L.push("");

  // 분석가 해석
  L.push("## 6. 분석가 해석");
  L.push("");
  if (a.insufficient) {
    L.push("- 표본 부족(커밋·결정 노트·검색 전부 임계 미만) — 해석을 생략하고 집계만 남깁니다.");
  } else if (!interpretation) {
    L.push("- analyst 페르소나 없음/무응답 — 집계만 기록했습니다.");
  } else {
    L.push(interpretation.trim());
  }
  L.push("");

  // 액션 리스트(제안 전용)
  L.push("## 7. 사용자 결정 대기 액션 리스트");
  L.push("");
  if (promoted.length === 0) {
    L.push("- (제안 없음 — 승격된 scoped 자동화 후보가 생기면 여기에 '제안:'으로 나열됩니다)");
  } else {
    // §2의 단순 복제 방지(첫 실전 검증) — 상위 5개만, 나머지는 §2 참조
    for (const p of promoted.slice(0, 5))
      L.push(`- 제안: \`${p.pattern}\` 반복(${p.count}회)의 자동화/규약화 검토 — 채택 여부는 사용자 결정, 개정은 SDD 스펙 경유.`);
    if (promoted.length > 5) L.push(`- (그 외 ${promoted.length - 5}건은 §2 참조)`);
  }
  L.push("");
  return L.join("\n");
}
