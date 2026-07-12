/**
 * specs/041 — provenance 캡처(FR-002, AC-009, Evaluation Report Contract).
 *
 * git으로 실행 출처를 캡처한다. fixture validation 뒤, 임시 index/output artifact 생성 전에
 * 한 번만 캡처하는 것이 계약이다(호출자가 그 순서를 보장한다). 파일 I/O·검색과 무관한
 * 순수 조회 계층이며, git이 없거나 저장소 밖이면 안전한 기본값으로 후퇴한다.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** baseline 부적격 사유 enum. 고정 순서(spec.md Evaluation Report Contract). */
export type BaselineIneligibilityReason =
  | "evaluation_inputs_dirty"
  | "test_embedding_stub"
  | "output_inside_worktree";

export interface Provenance {
  commit: string;
  workingTreeDirty: boolean;
  evaluationInputsDirty: boolean;
  outputInsideWorktree: boolean;
  baselineEligible: boolean;
  baselineIneligibilityReasons: BaselineIneligibilityReason[];
}

export interface ProvenanceInput {
  /** embedding.mode — "production"만 baseline 적격. "test_stub"이면 항상 부적격. */
  embeddingMode: "production" | "test_stub";
  /**
   * `--output`이 지정된 경우 그 대상 경로(절대/상대 무관). 지정 안 됐으면 undefined —
   * 이때 outputInsideWorktree는 false(stdout은 worktree 안이 아님).
   */
  outputPath?: string;
  /** git/toplevel 조회의 기준 디렉터리. 기본은 이 저장소 루트. */
  repoRoot?: string;
}

// evaluationInputsDirty 판정에 쓰는 pathspec(spec.md Evaluation Report Contract).
const EVALUATION_INPUT_PATHSPEC = [
  "src/",
  "scripts/",
  "tests/fixtures/retrieval-quality/",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "specs/041-retrieval-quality-contract/goal.md",
  "specs/041-retrieval-quality-contract/spec.md",
];

function git(args: string[], cwd: string): string | null {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

/** realpath — 존재하지 않는 경로는 존재하는 상위 조상 + 나머지 세그먼트로 근사한다. */
function bestEffortRealpath(target: string): string {
  const abs = path.resolve(target);
  let head = abs;
  const tail: string[] = [];
  for (;;) {
    try {
      const real = fs.realpathSync(head);
      return tail.length ? path.join(real, ...tail) : real;
    } catch {
      const parent = path.dirname(head);
      if (parent === head) return abs; // 루트까지 못 찾음 — 원본 절대경로
      tail.unshift(path.basename(head));
      head = parent;
    }
  }
}

/** child의 realpath가 parent realpath와 같거나 그 하위인지(containment). */
function isInside(childReal: string, parentReal: string): boolean {
  if (childReal === parentReal) return true;
  const withSep = parentReal.endsWith(path.sep) ? parentReal : parentReal + path.sep;
  return childReal.startsWith(withSep);
}

/**
 * provenance snapshot을 캡처한다(FR-002/AC-009). git이 없으면 commit은 빈 문자열,
 * dirty 플래그는 보수적으로 false로 둔다(무근거로 dirty 단정하지 않음).
 */
export function captureProvenance(input: ProvenanceInput): Provenance {
  const repoRoot = input.repoRoot ?? path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");

  const headSha = git(["rev-parse", "HEAD"], repoRoot)?.trim() ?? "";

  const fullStatus = git(["status", "--porcelain", "--untracked-files=all"], repoRoot);
  const workingTreeDirty = fullStatus !== null && fullStatus.length > 0;

  const scopedStatus = git(
    ["status", "--porcelain", "--untracked-files=all", "--", ...EVALUATION_INPUT_PATHSPEC],
    repoRoot,
  );
  const evaluationInputsDirty = scopedStatus !== null && scopedStatus.length > 0;

  // outputInsideWorktree — output parent의 realpath가 worktree toplevel 하위인지.
  let outputInsideWorktree = false;
  if (input.outputPath !== undefined) {
    const toplevel = git(["rev-parse", "--show-toplevel"], repoRoot)?.trim();
    if (toplevel) {
      const toplevelReal = bestEffortRealpath(toplevel);
      const outputParentReal = bestEffortRealpath(path.dirname(path.resolve(input.outputPath)));
      outputInsideWorktree = isInside(outputParentReal, toplevelReal);
    }
  }

  const baselineEligible = !evaluationInputsDirty && input.embeddingMode === "production" && !outputInsideWorktree;

  // 고정 순서 enum 배열 — 해당하는 것만.
  const reasons: BaselineIneligibilityReason[] = [];
  if (evaluationInputsDirty) reasons.push("evaluation_inputs_dirty");
  if (input.embeddingMode === "test_stub") reasons.push("test_embedding_stub");
  if (outputInsideWorktree) reasons.push("output_inside_worktree");

  return {
    commit: headSha,
    workingTreeDirty,
    evaluationInputsDirty,
    outputInsideWorktree,
    baselineEligible,
    baselineIneligibilityReasons: reasons,
  };
}
