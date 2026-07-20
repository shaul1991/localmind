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
  specCadence: Record<string, number>; // spec 식별자(경로형은 폴더 식별자 전체, 레거시 바레는 3자리) → 언급 커밋 수
  patterns: { pattern: string; count: number }[]; // type(scope) 반복 — 자동화 후보 원천
}

/** 커밋 제목 목록(git log --format=%s)을 집계한다. 스펙 참조는 실측 형식:
 *  ① `specs/{식별자}` 경로형 — 폴더 식별자 전체(레거시 3자리·timestamp 12/14자리 프리픽스 + 슬러그)
 *  ② 제목 말미 `(NNN)` ③ docs(spec): 나열형의 절 시작 3자리(그 외는 spec 토큰 인접만).
 *  ②③과 인접형은 레거시 3자리 전용 — timestamp는 ①(specs/ 경로형)으로만 인정(OQ-1). */
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
    // `specs/{식별자}` 경로형: 폴더 식별자 전체(프리픽스 3+자리 + 선택 슬러그)를 키로 잡는다 —
    // 레거시 3자리(`specs/031`, `specs/041-slug`)와 timestamp(`specs/202607180014-slug`)를 한 규칙으로
    // 인식하고, 같은 프리픽스라도 슬러그로 disambiguate한다(specs/202607180014-retro-analysis-timestamp-prefix).
    // collectDecisionNotes의 캡처와 동일 규칙. timestamp는 이 경로형으로만 인정한다(바레/나열/인접은 레거시 3자리 전용).
    for (const g of subj.matchAll(/\bspecs\/(\d{3}[\w-]*)/g)) specs.add(g[1]);
    for (const g of subj.matchAll(/\((\d{3})\)/g)) specs.add(g[1]);
    // 베어 3자리(R6 + codex 재적발 — "docs(spec): 031 cap 100 chars"의 100 오집계 방지):
    // docs(spec): 나열형 커밋은 "절 시작 위치"(콜론/쉼표 뒤)의 3자리만 스펙 번호로 인정
    // ("022 a, 023 b, 024 c" 전부 집계, 절 중간의 "cap 100"은 제외). 그 외 커밋은
    // spec 토큰 인접(12자 이내)만 — 단 `specs/` 경로형은 위 line 46이 폴더 식별자로 이미 잡으므로
    // 인접형이 다시 발화해 바레 `NNN` 키를 중복 생성하지 않게 제외한다(`(?!\/)`).
    if (/^docs\(spec\):/i.test(subj)) {
      for (const g of subj.matchAll(/(?::|,)\s*(\d{3})\b/g)) specs.add(g[1]);
    } else {
      for (const g of subj.matchAll(/\bspecs?\b(?!\/)\W{0,12}(\d{3})\b/gi)) specs.add(g[1]);
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

// specs/202607201808-critic-efficiency FR-6 — self-review evidence 텔레메트리 집계.

export interface SelfReviewEvidenceFile {
  spec: string;
  filename: string;
  text: string;
}

export type SelfReviewCompletion = "clean" | "blocked";

export interface SelfReviewSpecAggregate {
  spec: string;
  rounds: number;
  totalBlockers: number;
  finalCompletion: SelfReviewCompletion; // 최대 round 값 evidence의 completion(파일 순서 비의존)
  durationMinutesTotal: number | null; // duration-minutes 기재분 합 — 하나도 없으면 null
}

export interface SelfReviewAggregate {
  bySpec: SelfReviewSpecAggregate[];
  nonCompliant: number; // FR-5 필수 7필드를 못 채운(또는 frontmatter 자체가 없는) 파일 수
}

/** FR-5 필수 7필드 — 하나라도 없으면 그 파일 전체를 스키마 미준수로 본다. */
const REQUIRED_SELF_REVIEW_FIELDS = [
  "candidate-id",
  "round",
  "independence",
  "blockers",
  "advisories",
  "approval-needed",
  "completion",
] as const;

/** completion 값 정규화(FR-6) — "clean" 포함→clean, "blocked" 포함→blocked, 그 외는 null(미준수).
 *  레거시 실사용값(예: `complete-clean`)도 부분 문자열로 흡수한다. */
function normalizeCompletion(raw: string): SelfReviewCompletion | null {
  if (raw.includes("clean")) return "clean";
  if (raw.includes("blocked")) return "blocked";
  return null;
}

/** evidence 파일 frontmatter(`---`...`---`)를 key: value 맵으로 파싱한다. frontmatter가 없으면 null. */
function parseFrontmatter(text: string): Record<string, string> | null {
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end < 0) return null;
  const fm = text.slice(0, end);
  const out: Record<string, string> = {};
  for (const line of fm.split("\n")) {
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

interface ParsedSelfReviewEvidence {
  round: number;
  blockers: number;
  completion: SelfReviewCompletion;
  durationMinutes: number | null;
}

/** frontmatter 맵을 스키마 검증하며 파싱한다. 필수 필드 누락·비정상 값이면 null(미준수). */
function parseSelfReviewEvidence(fm: Record<string, string>): ParsedSelfReviewEvidence | null {
  for (const f of REQUIRED_SELF_REVIEW_FIELDS) if (!fm[f]) return null;
  const round = Number(fm["round"]);
  const blockers = Number(fm["blockers"]);
  if (!Number.isFinite(round) || !Number.isFinite(blockers)) return null;
  if (!/^(true|false)$/i.test(fm["approval-needed"])) return null;
  const completion = normalizeCompletion(fm["completion"]);
  if (!completion) return null;
  const durationRaw = fm["duration-minutes"];
  const durationMinutes = durationRaw !== undefined && Number.isFinite(Number(durationRaw)) ? Number(durationRaw) : null;
  return { round, blockers, completion, durationMinutes };
}

/** self-review evidence 파일들을 spec별로 집계한다(FR-6, 순수 — IO 없음).
 *  "최종" completion = 최대 round 값 evidence의 completion(파일 읽기 순서 비의존).
 *  스키마 미준수(frontmatter 부재·필수 필드 누락)는 예외 없이 nonCompliant로 구분 집계하고
 *  해당 spec의 bySpec 집계에서 제외한다 — 정상 파일 집계는 그대로 유지된다(AC-11). */
export function aggregateSelfReviewEvidence(files: SelfReviewEvidenceFile[]): SelfReviewAggregate {
  const bySpec = new Map<string, ParsedSelfReviewEvidence[]>();
  let nonCompliant = 0;
  for (const f of files) {
    const fm = parseFrontmatter(f.text);
    const parsed = fm ? parseSelfReviewEvidence(fm) : null;
    if (!parsed) {
      nonCompliant++;
      continue;
    }
    if (!bySpec.has(f.spec)) bySpec.set(f.spec, []);
    bySpec.get(f.spec)!.push(parsed);
  }
  const result: SelfReviewSpecAggregate[] = [];
  for (const [spec, list] of [...bySpec.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const totalBlockers = list.reduce((s, x) => s + x.blockers, 0);
    const final = list.reduce((a, b) => (b.round > a.round ? b : a));
    const durations = list.map((x) => x.durationMinutes).filter((d): d is number => d !== null);
    result.push({
      spec,
      rounds: list.length,
      totalBlockers,
      finalCompletion: final.completion,
      durationMinutesTotal: durations.length > 0 ? durations.reduce((s, x) => s + x, 0) : null,
    });
  }
  return { bySpec: result, nonCompliant };
}
