/**
 * specs/032 FR-1~5 — 워크플로우 회고의 순수 집계 모듈(IO 없음 — 텍스트/객체 입력만).
 * 진입점은 scripts/retro-report.ts(얇은 IO), 렌더는 src/retro-note.ts — 004/017의
 * query-analysis/report-note 3분할 관례를 계승한다. 검색 품질 집계는 query-analysis의
 * analyze()를 재사용(중복 구현 금지)하고, 여기는 "작업 방식" 프록시 신호만 다룬다.
 */

/** 자동화 후보 승격 임계 — 동일 패턴 3회 이상 관찰(2026-07-05 수동 회고의 판정 기준). */
export const PROMOTE_THRESHOLD = 3;
/** 표본 부족 임계(FR-5) — 전부 미만일 때만 부족(하나라도 있으면 해석 시도). */
export const MIN_COMMITS = 3;
export const MIN_DECISIONS = 1;
export const MIN_QUERIES = 10;

export interface CommitAggregate {
  total: number;
  byType: Record<string, number>; // conventional prefix(feat/fix/docs…) — 미매칭은 "기타"
  specCadence: Record<string, number>; // 스펙 번호(3자리) → 언급 커밋 수
  patterns: { pattern: string; count: number }[]; // type(scope) 반복 — 자동화 후보 원천
}

/** 커밋 제목 목록(git log --format=%s)을 집계한다. 스펙 참조는 실측 3형식(032 D1):
 *  ① `specs/NNN` ② 제목 말미 `(NNN)` ③ docs(spec): 나열형의 절 시작 3자리(그 외는 spec 토큰 인접만). */
export function parseCommits(gitLogText: string): CommitAggregate {
  const subjects = gitLogText.split("\n").filter((l) => l.trim().length > 0);
  const byType: Record<string, number> = {};
  const specCadence: Record<string, number> = {};
  const patternCount: Record<string, number> = {};

  const KNOWN = new Set(["feat", "fix", "docs", "test", "refactor", "chore", "perf", "style", "build", "ci", "revert"]);
  for (const subj of subjects) {
    const raw = subj.match(/^(\w+)(\(([^)]*)\))?!?:\s/);
    const m = raw && KNOWN.has(raw[1]) ? raw : null; // notes: 등 비관례 콜론도 기타(D1)
    const type = m ? m[1] : "기타";
    byType[type] = (byType[type] ?? 0) + 1;
    const pattern = m ? `${m[1]}${m[2] ?? ""}` : "기타";
    patternCount[pattern] = (patternCount[pattern] ?? 0) + 1;

    const specs = new Set<string>();
    for (const g of subj.matchAll(/\bspecs\/(\d{3})\b/g)) specs.add(g[1]);
    for (const g of subj.matchAll(/\((\d{3})\)/g)) specs.add(g[1]);
    // 베어 3자리(R6 + codex 재적발 — "docs(spec): 031 cap 100 chars"의 100 오집계 방지):
    // docs(spec): 나열형 커밋은 "절 시작 위치"(콜론/쉼표 뒤)의 3자리만 스펙 번호로 인정
    // ("022 a, 023 b, 024 c" 전부 집계, 절 중간의 "cap 100"은 제외). 그 외 커밋은
    // spec 토큰 인접(12자 이내)만.
    if (/^docs\(spec\):/i.test(subj)) {
      for (const g of subj.matchAll(/(?::|,)\s*(\d{3})\b/g)) specs.add(g[1]);
    } else {
      for (const g of subj.matchAll(/\bspecs?\b\W{0,12}(\d{3})\b/gi)) specs.add(g[1]);
    }
    for (const n of specs) specCadence[n] = (specCadence[n] ?? 0) + 1;
  }

  const patterns = Object.entries(patternCount)
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count);
  return { total: subjects.length, byType, specCadence, patterns };
}

export interface OpenQuestionItem {
  spec: string; // 예: "031-device-sync-pipeline"
  text: string; // 항목 원문(여러 줄 이어붙임)
  resolved: boolean; // 취소선(~~)이 유일한 결정적 해결 신호(032 D5)
}

/** specs/<이름>/spec.md에서 `## Open questions` 섹션을 추출한다(032 FR-2).
 *  헤딩은 제목 뒤 자유 텍스트 허용("… (plan 단계 1 인터뷰에서 확정 — 6건)" 류).
 *  취소선 없는 제자리-해결 항목은 미해결로 표면화된다 — 문서화된 한계(사람 판별). */
export function extractOpenQuestions(files: { spec: string; text: string }[]): OpenQuestionItem[] {
  const out: OpenQuestionItem[] = [];
  for (const f of files) {
    const lines = f.text.split("\n");
    let inSection = false;
    let current: string[] | null = null;
    const flush = () => {
      if (current && current.length > 0) {
        const text = current.join(" ").trim();
        out.push({ spec: f.spec, text, resolved: text.startsWith("~~") });
      }
      current = null;
    };
    for (const line of lines) {
      if (/^#{2,}\s+open questions/i.test(line)) {
        inSection = true;
        continue;
      }
      if (inSection && /^#{1,}\s/.test(line)) {
        flush();
        inSection = false;
        continue;
      }
      if (!inSection) continue;
      const item = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
      if (item) {
        flush();
        current = [item[1]];
      } else if (current && line.trim().length > 0) {
        current.push(line.trim()); // 여러 줄 항목 이어붙임
      }
    }
    flush();
  }
  return out;
}

export interface DecisionNote {
  path: string;
  title: string;
  date: string;
  specRefs: string[];
}

/** frontmatter tags에 `decision`을 가진 노트를 수집한다(032 FR-3 — `type:` 필드 아님).
 *  type: report/retro 노트는 자기 참조 방지로 제외. */
export function collectDecisionNotes(files: { path: string; text: string }[]): DecisionNote[] {
  const out: DecisionNote[] = [];
  for (const f of files) {
    if (!f.text.startsWith("---")) continue;
    const end = f.text.indexOf("\n---", 3);
    if (end < 0) continue;
    const fm = f.text.slice(0, end);
    const typeMatch = fm.match(/^type:\s*(\S+)/m);
    if (typeMatch && (typeMatch[1] === "report" || typeMatch[1] === "retro")) continue;
    const tagsMatch = fm.match(/^tags:\s*\[(.*)\]\s*$/m);
    if (!tagsMatch) continue;
    const tags = tagsMatch[1].split(",").map((t) => t.trim().replace(/^["']|["']$/g, ""));
    if (!tags.includes("decision")) continue;
    const title = fm.match(/^title:\s*"?(.*?)"?\s*$/m)?.[1] ?? f.path;
    const date = fm.match(/^date:\s*(\S+)/m)?.[1] ?? "";
    const refs = new Set<string>();
    for (const g of f.text.matchAll(/\bspecs\/(\d{3}[\w-]*)/g)) refs.add(g[1]);
    out.push({ path: f.path, title, date, specRefs: [...refs] });
  }
  return out;
}

export interface InventoryEntry {
  name: string;
  mtimeMs: number;
}

/** 자동화 후보 분류(FR-4) — 승격(≥3) / 관찰 중(<3).
 *  bare 타입(스코프 없는 feat·docs·기타 등)은 승격 대상에서 **제외**한다 — 모든 저장소에서
 *  자명하게 반복되는 노이즈(2026-07-05 첫 실전 회고 검증: feat 53회 승격은 무의미, 신호는
 *  fix(test) 5회 같은 scoped 패턴). */
export function classifyPatterns(patterns: { pattern: string; count: number }[]): {
  promoted: { pattern: string; count: number }[];
  observing: { pattern: string; count: number }[];
} {
  const scoped = patterns.filter((p) => p.pattern.includes("("));
  return {
    promoted: scoped.filter((p) => p.count >= PROMOTE_THRESHOLD),
    observing: scoped.filter((p) => p.count < PROMOTE_THRESHOLD && p.count >= 2),
  };
}

/** 표본 부족 판정(FR-5) — 전부 미만일 때만 true. */
export function isInsufficient(commits: number, decisions: number, queries: number): boolean {
  return commits < MIN_COMMITS && decisions < MIN_DECISIONS && queries < MIN_QUERIES;
}
