# Spec 044 Independent Review Findings - Round 1

## Review Context

- Reviewer: Codex, implementation session과 분리된 컨텍스트
- Reviewed snapshot: Claude implementation session `510c5191-7628-4d28-b89f-029be8e3245d` 종료 직후
- Review stance: `spec.md`/`plan.md`/`handoff.md`를 정본으로 두고 결함을 찾는 적대적 재검
- Scope: product code를 직접 수정하지 않고, 재현과 계약 대조 후 다음 Claude 구현 세션에 넘길 차단 결함을 기록
- Current gate: **NOT CLEAN**. 이 문서의 차단 항목이 모두 수정되고 full regression이 green이 되기 전에는
  FR/AC/plan/Success metric을 `[x]`로 표시하지 않는다.

## Severity Summary

| ID | Severity | Area | Gate |
|---|---|---|---|
| R1-01 | Critical | recovery ownership | blocking |
| R1-02 | Critical | activation metadata/hash | blocking |
| R1-03 | Critical | canonical source absence | blocking |
| R1-04 | High | cleanup failure/result | blocking |
| R1-05 | High | seed failure aggregation | blocking |
| R1-06 | High | invalid reserved source retirement | blocking |
| R1-07 | High | orphan state machine | blocking |
| R1-08 | High | filesystem identity/boundary | blocking |
| R1-09 | High | parser/ownership validation | blocking |
| R1-10 | High | exact execution grant | blocking |
| R1-11 | High | shadow resolution/enforcement | blocking |
| R1-12 | Medium | custom metadata/resource preservation | blocking for FR-1/FR-6 |
| R1-13 | Medium | override availability | blocking for AC-15/AC-21 |
| R1-14 | Medium | result truthfulness | blocking for AC-7/AC-10 |
| R1-15 | Medium | wrapper boundary/workspace validation | blocking until resolved or contract narrowed |

## Blocking Findings

### R1-01 - Recovery overwrites an unmanaged visible target

**Contract:** `spec.md` Ownership and Synchronization Contract 5, 10; AC-12, AC-13, AC-20.

`recoverManagedFile()` and the directory equivalent reduce target state to a boolean `targetOk`. An existing
unmanaged/incomplete target and an absent target both become `false`; with one valid backup the code renames the backup
to the visible target. For files, POSIX rename replaces the user file.

Observed reproduction:

```json
{
  "result": { "status": "recovered", "reason": "backup 파일에서 복구" },
  "target": "# managed-by: localmind (command: demo) ... old-managed"
}
```

The original `prompt = "user-owned"` file was lost. Recovery must distinguish `absent`, `managed-complete`, and
`present-unmanaged-or-incomplete`. The last state is `problem` with zero rename/delete. Add directory and file tests for
unmanaged file, nonempty/empty directory, symlink, special item, and incomplete managed-looking target.

### R1-02 - Canonical adapter metadata is normalized away and can disable the execution guard

**Contract:** canonical/data `SKILL.md` has no provider metadata; reserved packaged ID equivalence is exact canonical
content/resource equivalence; generated metadata is excluded only on a generated target and validated exactly.

`normalizeSkillMdPayload()` always removes `disable-model-invocation`, and `computePayloadHash()` always omits
`agents/openai.yaml`, including canonical/data and user custom sources. A managed canonical `sdd-implement` modified to
contain `disable-model-invocation: false` remains package-equivalent. Claude target rendering keeps the existing false
key because injection only checks key presence.

Observed result: deploy returned `success/created`, and the generated Claude target contained
`disable-model-invocation: false`.

Required design:

1. Canonical/source hashing includes every canonical field/resource and executable bit.
2. Only a target-aware inspector may normalize the adapter-generated field/file expected for that target.
3. Target metadata must match exact expected schema/content, including absence when not expected.
4. `injectClaudeFrontmatter` must deterministically set exact `true`, never preserve a conflicting value.
5. A modified reserved canonical source becomes `reserved-id-fork` and is not exposed.

Add adversarial tests for `false`, duplicate keys, alternate YAML spelling, an unexpected canonical
`agents/openai.yaml`, missing/modified generated policy, and custom skill-owned metadata.

### R1-03 - Missing canonical source is treated as an empty valid catalog and prunes all managed targets

**Contract:** source/filesystem validation problems yield `failed`/exit 1 and suppress source-absence prune.

`loadSkillRegistry()` returns an empty clean registry when the root cannot be read. Direct `deployWorkflows()` after the
canonical root disappears reports success and prunes all three visible managed Claude skills.

Observed result: `outcome=success`, `exit=0`, three `pruned` items, no source problems.

Missing/unreadable/not-directory data root must be distinct from an intentionally existing empty root. The former is a
source problem and must suppress absence-based prune across every target. Add missing, permission/read failure,
non-directory, dangling symlink, and intentionally empty real-directory cases.

### R1-04 - Cleanup failures are reported as success

**Contract:** `plan.md` Managed Artifact Reconciler and Target Orchestration; AC-13 explicitly requires first execution
`failed`/exit 1 for backup cleanup failure. AC-20 applies the same write-recovery contract.

Current tests encode the opposite behavior: directory/file backup cleanup failure expects `updated`, and retired cleanup
failure expects `pruned`. `safeRm()` also hides recovery cleanup failure. The complete-new target or removed visible name
should remain, but the item must be `problem`, aggregate `failed`, exit 1, with the hidden orphan retained. A later clean
run may return `recovered` after removing it.

Replace the contrary tests before changing implementation. Cover directory/file update cleanup, prune cleanup, retired
recovery cleanup, stage cleanup when another failure already occurred, and aggregate result propagation.

### R1-05 - Seed filesystem failures do not propagate to process failure

**Contract:** AC-20 and aggregate outcome contract.

`seedWorkflows()` can return item status `problem` while `problems` remains empty. `runSkillsDeploy()` only promotes
`seed.problems`, so an injected first `copyFile` failure produced a final `success/exit 0`; two other workflows deployed.
Successful independent work may remain, but any seed item `problem` must make the integrated result failed/exit 1.

Also fix seed idempotence: `dirsByteEqual()` ignores executable bits. Removing an executable bit from a seeded script
currently returns `unchanged` and leaves mode `0644` although the template is `0755`.

### R1-06 - Invalid reserved source leaves the old mutating runtime asset active

**Contract:** Ownership contract 7 and wrapper eligibility/fail-closed retirement rules.

After deploying `sdd-implement`, corrupting its canonical `SKILL.md` causes `failed/exit 1`, but the old managed Claude
target remains visible because global prune is suppressed and the invalid ID never enters `reservedForks`.

An invalid/unverifiable reserved ID must be tracked separately from ordinary source absence. Its exact name-bound managed
skill/wrapper may be retired fail-closed even while catalog prune is suppressed; unmanaged collisions remain untouched.
Test every target, retirement failure, and invalid non-reserved custom source.

### R1-07 - Orphan recovery state machine deletes ambiguous backups and cannot recover complete stages

**Contract:** Ownership contract 10; `plan.md` says multiple backups and incomplete stages are ambiguous, which means a
validated complete stage needs deterministic handling.

Current defects:

- complete visible target + two valid backups returns `recovered` and deletes both; multiple backups must be `problem`
  with zero deletion.
- every stage, including a complete exact-marker stage, is treated as ambiguous forever.
- file recovery has no `isComplete` callback; marker presence alone can restore a truncated wrapper.
- directory completeness currently means only "some skill marker exists", not a valid exact artifact/package.
- sync may recover an ineligible reserved wrapper before pruning it, briefly re-exposing stale mutating behavior.

Define and test a deterministic matrix for target state x stage count/completeness x backup count/completeness. At minimum:
complete stage only; complete stage + one backup; managed-complete target + one backup; unmanaged target + orphan;
multiple stages/backups; marker mismatch; truncated resource set; cleanup failure. Never restore an ineligible workflow to
the visible name.

### R1-08 - Recovery/prune skip parent and target identity checks

**Contract:** generated root and immediate parent are real directories; mutation immediately rechecks root identity;
source/target collision is `lstat` based.

Only replace paths call `parentIdentity()`, and they recheck the parent but not the target inode/state after staging.
Recovery and prune enumerate/mutate without their own parent identity guard. A symlink/race introduced between ownership
read and rename can redirect cleanup or replace a newly created user target.

Apply the same pre-mutation `(dev, ino)` parent check to replace/recover/prune, and revalidate target absentness or the
previous exact target identity immediately before rename. Add deterministic fault/race hooks rather than test-only
production branches. Also make hidden artifact matching exact: `startsWith(.localmind-...-<name>-)` is ambiguous when one
valid name is a prefix of another hyphenated name; accept only the exact name plus the specified nonce format.

### R1-09 - Parser and managed ownership validation accept malformed/spoofable packages

**Contract:** exact closed frontmatter, nonempty Markdown body, packaged exact marker, duplicate manifest entry rejection,
UTF-8 text resources, exact name-bound ownership.

Observed:

- closing line `---not-a-delimiter` is accepted by `splitFrontmatter()`.
- a body containing only the generated marker is accepted as nonempty workflow body.
- markerless packaged `SKILL.md` is accepted with no problems.
- duplicate `workflows.demo` JSON keys are accepted; the last value silently wins.
- marker recognition accepts any single-line HTML/TOML comment containing the marker substring rather than the exact
  generated ownership line.
- `SKILL.md` is read before traversal rejects it as a symlink, and text resources use replacement decoding rather than
  strict UTF-8 validation.

Use exact delimiter lines, lstat before every source read, strict UTF-8 decoding for declared text, exact generated marker
matching, packaged marker requirement, marker-excluded body nonemptiness, and duplicate-key detection. Keep custom
frontmatter forward-compatible as the spec requires.

### R1-10 - Exact execution grant accepts surrounding whitespace and does not model one-time freshness

**Contract:** raw arguments *entirely* match `^[0-9]{3}$`; confirmation is an exact immediately-next-turn one-time value;
stale/replayed values are rejected.

`validNnn()` and `verifyConfirmation()` trim input. Test currently asserts `" 044 "` is granted, contradicting AC-10.
The `Challenge` shape has no freshness/turn/consumed state, so the same correct response can be replayed indefinitely in
the characterization function.

First change tests to reject leading/trailing whitespace and confirmation whitespace. Model and test
immediately-previous plus unconsumed state explicitly. Continue to report that this TypeScript characterization does not
act as a Gemini runtime hook.

### R1-11 - Codex workspace shadow can be called equivalent without its deny-implicit policy

**Contract:** generated metadata is part of target idempotence/fingerprint validation; workspace resolution must not claim
behavior parity for a non-equivalent shadow.

Copying the generated repo skill and removing `agents/openai.yaml` still yields `equivalent-shadow`, because workspace
resolution checks only normalized payload hash + marker. For `sdd-implement` this falsely reports parity while removing
runtime-enforced explicit-only activation.

Use the same exact target validator for the user target and workspace shadow, including generated policy and fingerprint.
Treat symlink/file/special same-ID workspace entries as ambiguous/unmanaged shadow, not `resolved`. Validate that `cwd`
is lexically/physically inside the supplied repo root; otherwise return `unverified` rather than scanning unrelated
ancestors.

### R1-12 - User custom `agents/openai.yaml` is silently dropped

**Contract:** user custom skills may contain provider-specific compatibility/tool instructions; recursive regular
resources and executable bits are preserved. Only localmind-generated target metadata is adapter-owned.

A markerless custom skill with its own `agents/openai.yaml` deploys with `success`, but that file is omitted. Separate
canonical custom resources from generated packaged policy. If a collision cannot be safely merged for the shared target,
report a dependency/problem explicitly; never silently lose content.

### R1-13 - Explicit path overrides are incorrectly treated as unavailable

**Contract:** Claude/Gemini target is available when the runtime parent exists **or an override is given**.

Passing new temporary `claudeSkillsDir` and `geminiCommandsDir` paths with missing parents returns six
`skipped-unavailable` items. Explicit option and environment overrides must authorize creation of their real-directory
path (while retaining symlink/non-directory guards). Default paths still use runtime-installation parent detection.

### R1-14 - Deploy machine/human results omit activation enforcement level

**Contract:** AC-7 and AC-10 require runtime-enforced vs instruction-level to appear in the result, not only in an
unrelated helper test.

`invocationReport()` has `enforcement`, but `WorkflowSyncItem` and `formatDeployResult()` do not. Add target-specific
enforcement to machine items and the human summary for packaged workflows. Do not label custom workflows or
non-explicit policies as runtime-enforced.

### R1-15 - Wrapper and workspace boundaries need explicit adversarial closure

**Contract:** generated wrapper uses deterministic workflow/reference boundaries and exact raw-args field; higher
precedence workspace assets must be reported truthfully.

Resource paths/content can contain the literal reference/workflow delimiter and newlines, so an injected packaged fixture
can forge boundary text. Either encode/length-frame the inline resource contract or reject delimiter/control collisions
before rendering; add tests. `canonicalBody()` must fail on malformed input rather than treating the whole file as body.

Gemini `{{args}}` substitution cannot cryptographically delimit attacker-controlled multiline text. Keep the documented
instruction-level limitation and do not upgrade static tests to runtime enforcement evidence. If exact structural raw args
cannot be guaranteed by the official runtime, narrow the claim in spec/docs rather than asserting an impossible property.

## Required Correction Workflow

1. Read all four spec 044 documents plus this review file before editing.
2. For every R1 item, add an adversarial test that fails against the current snapshot **before** changing implementation.
   Preserve evidence of the red result in the implementation session report.
3. Fix shared primitives before adapter orchestration. Avoid target-specific duplication in `skills.ts`/`commands.ts`.
4. Re-run focused tests after each semantic cluster, then the entire suite, typecheck, build, shell/lifecycle tests,
   `git diff --check`, privacy scan, and provider/model neutrality scan.
5. Run a fresh isolated adversarial review after fixes. Do not mark spec/plan/goal checkboxes until that review is clean.
6. Do not commit, push, deploy into the real HOME, or modify protected pre-existing user work.

## Protected Existing Work

The correction must preserve these pre-existing user-owned paths byte-for-byte unless the user separately authorizes
changes:

- `docs/architecture-business-logic-audit-2026-07.md`
- `specs/041-retrieval-quality-contract/`
- `specs/042-brain-domain-decomposition/`
- `specs/043-completion-core-boundary/`
- the pre-existing `Makefile` `uninstall: purge` hunk

Spec 044 documents and implementation files may change only to resolve this contract. No commit/push and no real runtime
deployment are authorized in this correction round.

