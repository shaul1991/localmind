/**
 * specs/202607201808-critic-efficiency FR-3 — review-preflight 순수 검사 모듈 단위 테스트.
 * AC-3(임시경로 evidence)·AC-4(diff --check 판정 함수)·AC-5(merged report 필드)·
 * AC-6(matrix 전수 대응)을 인라인 픽스처로 커버한다.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkTempPathEvidence,
  checkDiffCheckOutput,
  checkMergedReportFields,
  checkMatrixCoverage,
  runPreflight,
  type EvidenceFile,
} from "./review-preflight.js";

const SPEC_ID = "202607201808-critic-efficiency";

describe("FR-3a — 임시경로 evidence 검출 (AC-3)", () => {
  it("임시경로만 있고 versioned 경로 언급이 없으면 위반", () => {
    const files: EvidenceFile[] = [
      {
        path: "specs/202607201808-critic-efficiency/evidence/self-review-round1.md",
        body: "실행 로그는 /tmp/review-2026/round1.log 에 저장했다.",
      },
    ];
    const violations = checkTempPathEvidence(files, SPEC_ID);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].file, files[0].path);
    assert.match(violations[0].detail, /\/tmp\/review-2026\/round1\.log/);
  });

  it("같은 본문에 specs/{spec}/evidence/ 하위 경로를 병기하면 통과", () => {
    const files: EvidenceFile[] = [
      {
        path: "specs/202607201808-critic-efficiency/evidence/self-review-round1.md",
        body:
          "실행 로그는 /tmp/review-2026/round1.log 에 저장했다가 " +
          "specs/202607201808-critic-efficiency/evidence/round1.log 로 승격했다.",
      },
    ];
    const violations = checkTempPathEvidence(files, SPEC_ID);
    assert.equal(violations.length, 0);
  });

  it("/private/tmp·$TMPDIR 참조도 동일 판정을 받는다", () => {
    const files: EvidenceFile[] = [
      { path: "a.md", body: "경로: /private/tmp/xyz/out.txt" },
      { path: "b.md", body: "경로: $TMPDIR/out.txt" },
    ];
    const violations = checkTempPathEvidence(files, SPEC_ID);
    assert.equal(violations.length, 2);
  });

  it("임시경로 참조가 아예 없으면 통과", () => {
    const files: EvidenceFile[] = [{ path: "a.md", body: "임시경로 언급 없음." }];
    assert.equal(checkTempPathEvidence(files, SPEC_ID).length, 0);
  });
});

describe("FR-3b — diff --check 판정 (AC-4 단위분)", () => {
  it("위반 출력이 있으면 fail(줄 단위 위반 목록)", () => {
    const output = [
      "src/foo.ts:12: trailing whitespace.",
      "src/foo.ts:20: new blank line at EOF.",
    ].join("\n");
    const violations = checkDiffCheckOutput(output);
    assert.equal(violations.length, 2);
    assert.match(violations[0].detail, /trailing whitespace/);
  });

  it("빈 출력이면 pass(위반 없음)", () => {
    assert.equal(checkDiffCheckOutput("").length, 0);
    assert.equal(checkDiffCheckOutput("\n\n").length, 0);
  });
});

describe("FR-3c — merged report 필드 검사 (AC-5)", () => {
  const ALL_FIELDS_FM = [
    "---",
    "candidate-id: abc123",
    "round: 1",
    "independence: isolated-context",
    "blockers: 0",
    "advisories: 1",
    "approval-needed: false",
    "completion: clean",
    "---",
    "본문",
  ].join("\n");

  it("필수 7필드 중 하나(completion)가 누락되면 위반", () => {
    const missingCompletion = [
      "---",
      "candidate-id: abc123",
      "round: 1",
      "independence: isolated-context",
      "blockers: 0",
      "advisories: 1",
      "approval-needed: false",
      "---",
      "본문",
    ].join("\n");
    const files: EvidenceFile[] = [
      { path: "specs/x/evidence/self-review-round1.md", body: missingCompletion },
    ];
    const violations = checkMergedReportFields(files);
    assert.equal(violations.length, 1);
    assert.match(violations[0].detail, /completion/);
  });

  it("7필드 전부 존재하면 통과", () => {
    const files: EvidenceFile[] = [
      { path: "specs/x/evidence/self-review-round1.md", body: ALL_FIELDS_FM },
    ];
    assert.equal(checkMergedReportFields(files).length, 0);
  });

  it("self-review-round*.md 패턴이 아닌 evidence 파일은 검사 대상에서 제외", () => {
    const files: EvidenceFile[] = [{ path: "specs/x/evidence/notes.md", body: "필드 없음" }];
    assert.equal(checkMergedReportFields(files).length, 0);
  });

  it("여러 필드 누락 시 각각 별도 위반으로 보고", () => {
    const missingMany = ["---", "candidate-id: abc123", "round: 1", "---", "본문"].join("\n");
    const files: EvidenceFile[] = [
      { path: "specs/x/evidence/self-review-round2.md", body: missingMany },
    ];
    const violations = checkMergedReportFields(files);
    // independence, blockers, advisories, approval-needed, completion = 5개 누락
    assert.equal(violations.length, 5);
  });
});

describe("FR-3d — matrix 전수 대응 검사 (AC-6)", () => {
  const SPEC_MD_HEADING_STYLE = [
    "## Acceptance Criteria",
    "",
    "### AC-1 (FR-1) 첫 항목",
    "- Given ...",
    "",
    "### AC-2 (FR-1) 둘째 항목",
    "- Given ...",
  ].join("\n");

  const SPEC_MD_INLINE_STYLE = [
    "## Acceptance Criteria",
    "",
    "**AC-1** 첫 항목 — Given ...",
    "",
    "**AC-2** 둘째 항목 — Given ...",
  ].join("\n");

  const PLAN_MD_FULL = [
    "## Verification matrix",
    "",
    "| AC | 검증 방법 | evidence | 종료 조건 | 상태 |",
    "|---|---|---|---|---|",
    "| AC-1 | 단위 | 로그 | green | |",
    "| AC-2 | 단위 | 로그 | green | |",
  ].join("\n");

  const PLAN_MD_MISSING_AC2 = [
    "## Verification matrix",
    "",
    "| AC | 검증 방법 | evidence | 종료 조건 | 상태 |",
    "|---|---|---|---|---|",
    "| AC-1 | 단위 | 로그 | green | |",
  ].join("\n");

  it("spec에 있으나 matrix에 없는 AC는 위반으로 보고 (### AC-N 헤딩 형식)", () => {
    const violations = checkMatrixCoverage(SPEC_MD_HEADING_STYLE, PLAN_MD_MISSING_AC2);
    assert.equal(violations.length, 1);
    assert.match(violations[0].detail, /AC-2/);
  });

  it("전수 대응이면 통과 (### AC-N 헤딩 형식)", () => {
    assert.equal(checkMatrixCoverage(SPEC_MD_HEADING_STYLE, PLAN_MD_FULL).length, 0);
  });

  it("T1.3 — **AC-N** 인라인 형식도 동일하게 인식한다", () => {
    assert.equal(checkMatrixCoverage(SPEC_MD_INLINE_STYLE, PLAN_MD_FULL).length, 0);
    const violations = checkMatrixCoverage(SPEC_MD_INLINE_STYLE, PLAN_MD_MISSING_AC2);
    assert.equal(violations.length, 1);
    assert.match(violations[0].detail, /AC-2/);
  });

  it("matrix에는 있으나 spec에 없는 AC(역방향)도 위반으로 보고", () => {
    const specMissingAc2 = ["### AC-1 (FR-1) 첫 항목", "- Given ..."].join("\n");
    const violations = checkMatrixCoverage(specMissingAc2, PLAN_MD_FULL);
    assert.equal(violations.length, 1);
    assert.match(violations[0].detail, /AC-2/);
  });
});

describe("runPreflight — 통합 진입 함수", () => {
  it("모든 검사가 clean이면 ok=true, violations=[]", () => {
    const result = runPreflight({
      specId: SPEC_ID,
      evidenceFiles: [],
      diffCheckOutput: "",
      specMdText: "### AC-1 (FR-1) 항목",
      planMdText: "| AC-1 | 단위 | 로그 | green | |",
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.violations, []);
  });

  it("하나라도 위반이 있으면 ok=false이고 violations에 반영된다", () => {
    const result = runPreflight({
      specId: SPEC_ID,
      evidenceFiles: [{ path: "a.md", body: "/tmp/x.log" }],
      diffCheckOutput: "",
      specMdText: "### AC-1 (FR-1) 항목",
      planMdText: "| AC-1 | 단위 | 로그 | green | |",
    });
    assert.equal(result.ok, false);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0].check, "temp-path-evidence");
  });
});
