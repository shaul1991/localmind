/**
 * specs/202607201808-critic-efficiency FR-3 — critic 착수 전 결정적(hermetic) 사전 검사의
 * 순수 검사 모듈(IO 없음 — 텍스트/객체 입력만, LLM 판단 불포함). 얇은 IO 진입점은
 * scripts/review-preflight.ts(Phase 2)가 담당한다 — 004/017/032의 3분할 관례를 계승.
 *
 * 검사 4종: (a) 임시경로 evidence(FR-3a·AC-3) (b) diff --check 판정(FR-3b·AC-4)
 * (c) merged report 필드(FR-3c·AC-5) (d) matrix 전수 대응(FR-3d·AC-6).
 * preflight 통과는 critic 시작의 전제일 뿐 어떤 AC의 green 근거도 아니다(FR-4, 도장찍기 금지).
 */
import path from "node:path";
import { parse as parseYaml } from "yaml";

/** 검사 대상 파일 하나(경로 + 본문). 실제 디스크 읽기는 진입점의 몫이다. */
export interface EvidenceFile {
  path: string;
  body: string;
}

export interface PreflightViolation {
  check: "temp-path-evidence" | "diff-check" | "merged-report-fields" | "matrix-coverage";
  file?: string;
  detail: string;
}

export interface PreflightInputs {
  /** 대상 spec 폴더 식별자(예: "202607201808-critic-efficiency"). */
  specId: string;
  evidenceFiles: EvidenceFile[];
  /** `git diff --check` 실행 결과 텍스트(빈 문자열이면 clean). */
  diffCheckOutput: string;
  specMdText: string;
  planMdText: string;
}

export interface PreflightResult {
  ok: boolean;
  violations: PreflightViolation[];
}

// ── (a) 임시경로 evidence 검사 (FR-3a·AC-3) ──────────────────────────────

const TEMP_PATH_PATTERN = /(?:\/private\/tmp|\/tmp|\$TMPDIR)[^\s"'`)]*/g;

/**
 * evidence 본문에 저장소 밖 임시경로(`/tmp/…`·`/private/tmp/…`·`$TMPDIR`) 참조가 있는데,
 * 같은 본문에 해당 spec의 versioned evidence 경로(`specs/{spec}/evidence/` 하위 경로) 문자열이
 * 하나도 없으면 위반이다(plan.md FR-3a 판정 규칙 — 형식 게이트, 내용 충실성은 검증하지 않는다).
 */
export function checkTempPathEvidence(evidenceFiles: EvidenceFile[], specId: string): PreflightViolation[] {
  const violations: PreflightViolation[] = [];
  const versionedNeedle = `specs/${specId}/evidence/`;
  for (const file of evidenceFiles) {
    const matches = [...file.body.matchAll(TEMP_PATH_PATTERN)].map((m) => m[0]);
    if (matches.length === 0) continue;
    if (file.body.includes(versionedNeedle)) continue; // versioned 경로 병기 — 통과
    const uniquePaths = [...new Set(matches)];
    violations.push({
      check: "temp-path-evidence",
      file: file.path,
      detail: `임시경로 참조(${uniquePaths.join(", ")})가 있으나 versioned 경로(${versionedNeedle})가 본문에 없습니다`,
    });
  }
  return violations;
}

// ── (b) diff --check 판정 (FR-3b·AC-4 단위분) ────────────────────────────

/** `git diff --check` 출력 텍스트를 받아 비어 있지 않으면 줄 단위로 위반을 보고한다. */
export function checkDiffCheckOutput(diffCheckOutput: string): PreflightViolation[] {
  const lines = diffCheckOutput
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  return lines.map((line) => ({ check: "diff-check" as const, detail: line }));
}

// ── (c) merged report 필드 검사 (FR-3c·AC-5) ─────────────────────────────

/** FR-5 필수 7필드(단일 필드셋 — FR-2와 공유). */
const REQUIRED_MERGED_REPORT_FIELDS = [
  "candidate-id",
  "round",
  "independence",
  "blockers",
  "advisories",
  "approval-needed",
  "completion",
] as const;

/** `---\n...\n---` frontmatter 블록을 분리한다. 닫는 구분자가 없으면 null. */
function splitFrontmatter(text: string): { fm: string; body: string } | null {
  const norm = text.replace(/\r\n/g, "\n");
  if (!norm.startsWith("---\n")) return null;
  const lines = norm.split("\n");
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---") {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  return { fm: lines.slice(1, end).join("\n"), body: lines.slice(end + 1).join("\n") };
}

/** 파일명이 `self-review-round*.md` 패턴인 evidence의 frontmatter가 FR-5 필수 7필드를 갖췄는지 검사한다. */
export function checkMergedReportFields(evidenceFiles: EvidenceFile[]): PreflightViolation[] {
  const violations: PreflightViolation[] = [];
  for (const file of evidenceFiles) {
    const base = path.basename(file.path);
    if (!/^self-review-round.*\.md$/i.test(base)) continue;

    const split = splitFrontmatter(file.body);
    if (!split) {
      violations.push({
        check: "merged-report-fields",
        file: file.path,
        detail: "frontmatter(--- 로 시작하는 머리말)가 없습니다",
      });
      continue;
    }

    let fm: unknown;
    try {
      fm = parseYaml(split.fm);
    } catch (e) {
      violations.push({
        check: "merged-report-fields",
        file: file.path,
        detail: `frontmatter YAML 파싱 오류: ${(e as Error).message}`,
      });
      continue;
    }
    const obj: Record<string, unknown> = fm && typeof fm === "object" ? (fm as Record<string, unknown>) : {};
    for (const field of REQUIRED_MERGED_REPORT_FIELDS) {
      if (!(field in obj) || obj[field] === undefined || obj[field] === null) {
        violations.push({
          check: "merged-report-fields",
          file: file.path,
          detail: `필수 필드 누락: ${field}`,
        });
      }
    }
  }
  return violations;
}

// ── (d) matrix 전수 대응 검사 (FR-3d·AC-6) ───────────────────────────────

/** spec.md의 AC 식별자를 `### AC-N` 헤딩과 `**AC-N**` 인라인 두 형식 모두에서 수집한다. */
function extractSpecAcIds(specMdText: string): Set<string> {
  const ids = new Set<string>();
  for (const m of specMdText.matchAll(/^###\s+AC-(\d+)/gm)) ids.add(m[1]);
  for (const m of specMdText.matchAll(/\*\*AC-(\d+)\*\*/g)) ids.add(m[1]);
  return ids;
}

/** plan.md verification matrix 표의 `| AC-N |` 행에서 AC 식별자를 수집한다. */
function extractMatrixAcIds(planMdText: string): Set<string> {
  const ids = new Set<string>();
  for (const m of planMdText.matchAll(/\|\s*AC-(\d+)\s*\|/g)) ids.add(m[1]);
  return ids;
}

/** spec.md의 AC 집합과 plan.md verification matrix의 AC 집합이 정확히 일치하는지(양방향) 검사한다. */
export function checkMatrixCoverage(specMdText: string, planMdText: string): PreflightViolation[] {
  const specIds = extractSpecAcIds(specMdText);
  const matrixIds = extractMatrixAcIds(planMdText);
  const violations: PreflightViolation[] = [];
  for (const id of specIds) {
    if (!matrixIds.has(id)) {
      violations.push({
        check: "matrix-coverage",
        detail: `AC-${id}가 spec.md에 있으나 plan.md verification matrix에 없습니다`,
      });
    }
  }
  for (const id of matrixIds) {
    if (!specIds.has(id)) {
      violations.push({
        check: "matrix-coverage",
        detail: `AC-${id}가 plan.md verification matrix에 있으나 spec.md에 없습니다`,
      });
    }
  }
  return violations;
}

// ── 진입 함수 ─────────────────────────────────────────────────────────────

/** 4종 검사를 모두 실행해 위반 목록과 ok 여부를 반환한다. Phase 2 진입점이 이 함수를 호출한다. */
export function runPreflight(inputs: PreflightInputs): PreflightResult {
  const violations: PreflightViolation[] = [
    ...checkTempPathEvidence(inputs.evidenceFiles, inputs.specId),
    ...checkDiffCheckOutput(inputs.diffCheckOutput),
    ...checkMergedReportFields(inputs.evidenceFiles),
    ...checkMatrixCoverage(inputs.specMdText, inputs.planMdText),
  ];
  return { ok: violations.length === 0, violations };
}
