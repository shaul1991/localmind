# Codex Independent Review Findings - Round 4

## Review Context

- Review date: 2026-07-13 (Asia/Seoul)
- Reviewers: Codex primary plus two isolated read-only audit contexts
- Scope: complete FR/AC trace audit of the current uncommitted spec 044 implementation after round 2, while the
  separate round-3 Gemini recovery correction was in progress
- Method: source/test traceability inspection and isolated `/tmp` fault/race probes; no product code was modified
- Verdict: **not clean - four product defects and one lifecycle implementation/evidence gap remain outside R3-01**

R3-01 remains documented in `review-findings-round-3.md` and is intentionally not duplicated here. This round is
one batched correction request so mechanical fixes and lifecycle coverage receive a single verification/review
cycle. The implementation model must preserve every round-1 through round-3 correction.

## R4-01 - Invalid Packaged Catalog Still Deploys Mutating Workflows Without Activation Policy

- Severity: **Critical / authorization boundary**
- Contract: FR-1, FR-2, FR-6, FR-8, AC-1 write-before-problem gate, AC-10, AC-14
- Primary code: `src/agents/skills.ts:523-554`
- Missing tests: malformed packaged manifest and manifest-directory 1:1 mismatch are validated at registry/seed
  level, but no deploy test proves zero runtime writes.

### Reproduction

1. Seed valid canonical data from the production package.
2. Copy the packaged template root to a temporary directory.
3. Replace `catalog.json` with `{ broken`.
4. Deploy the valid data to empty injected Claude and shared Agent Skills targets.

Observed result:

```json
{
  "outcome": "failed",
  "exitCode": 1,
  "created": [
    ["claude-skill", "goal-ready"],
    ["claude-skill", "sdd-implement"],
    ["claude-skill", "sdd-self-review"],
    ["agent-skill", "goal-ready"],
    ["agent-skill", "sdd-implement"],
    ["agent-skill", "sdd-self-review"]
  ],
  "claudeSddImplementDenyImplicit": false,
  "sharedSddImplementPolicyExists": false
}
```

A second probe used parseable JSON with an extra packaged directory not bound by the manifest. It also returned
`failed` while continuing runtime writes.

### Root Cause

`deployWorkflows()` records `templateReg.problems` in `sourceProblems` and sets the aggregate problem flag, but it
does not stop target orchestration. If manifest parsing fails, `reservedIds` becomes an empty set and
`classify()` treats the canonical packaged names as ordinary custom skills. The `sdd-implement` source is then
copied without the manifest-derived Claude/Codex deny-implicit metadata.

This is not a harmless "failed with partial output" case. The result exposes a mutating workflow under a reserved
name while removing the activation control that makes explicit invocation enforceable.

### Required Red Tests

Add deploy-level tests for both:

1. malformed `catalog.json`;
2. valid JSON whose manifest and packaged directory sets do not bind 1:1 (missing or extra entry/directory).

For each case, inject all three empty runtime targets and assert:

- aggregate is `failed`/exit 1 with the package problem;
- no target root or logical-ID artifact is created;
- zero `created|updated|pruned|recovered` runtime item is reported;
- a pre-existing name-bound managed target and an unmanaged collision remain byte-for-byte and mode-for-mode
  unchanged;
- no Gemini wrapper is created, retired, recovered, or pruned.

Keep a distinction test showing that an isolated data-source item problem under a valid package retains the
existing per-item/prune-suppression behavior. Do not turn every custom data problem into a global package failure.

### Fix Contract

Any packaged registry/catalog/schema/binding problem is a global trust failure. `deployWorkflows()` must return
before `prepareRoot()`, recovery, classification-based writes, prune, or command generation. It may read and report
data-source problems, but it must not infer an empty reservation set or downgrade packaged IDs to custom skills.

The failed result must remain deterministic and explain the package problem in plain Korean. Existing runtime
assets are preserved because neither their current policy nor safe reservation set can be proven from the corrupt
package.

## R4-02 - Runtime Parent Can Become a Symlink After the One-Time Check

- Severity: **High / filesystem redirection**
- Contract: FR-6, AC-12, plan Managed Target Copy identity and target-isolation rules
- Primary code: `src/agents/skills.ts:246-272`, `src/agents/skills.ts:323-388`,
  `src/agents/reconcile.ts:183-217`
- Missing test: race between runtime-parent validation/root creation and the first reconciler mutation.

### Reproduction

The injected shared target was `<tmp>/.agents/skills`.

1. `.agents` starts as a real directory and `skills` is absent.
2. `prepareRoot()` validates `.agents`.
3. Injected `FsOps.mkdir(skills)` creates the real root, then:
   - renames `.agents` to a saved real path;
   - creates a separate redirect tree with its own `skills` directory;
   - installs `.agents -> <redirect>` as a symlink.
4. Deployment continues.

Observed result:

```json
{
  "outcome": "success",
  "status": "created",
  "runtimeParentIsSymlink": true,
  "originalTreeWasWritten": false,
  "redirectTreeWasWritten": true
}
```

`lstat(rootDir)` and the reconciler's root `(dev,ino)` check do not catch a symlink in an intermediate path
component. The final `skills` component is still a real directory after path resolution.

### Required Red Tests

Use the existing `FsOps` seam to add at least one exact shared-target race test and table coverage for the other
runtime roots:

- replace the immediate runtime parent with a symlink after root creation/initial validation;
- assert the affected target reports `problem`/aggregate failed;
- assert zero skill/command write appears in the redirected tree;
- assert the saved original tree and unrelated/unmanaged artifacts are preserved;
- assert another independent target can still finish successfully.

Cover a parent inode replacement with another real directory as well as a symlink replacement. A final-component
root symlink test alone is insufficient; that path is already covered.

### Fix Contract

Capture the verified immediate runtime parent identity and verified target-root identity after creation, then
revalidate both immediately before recovery, replace, and prune mutations. The guard must reject:

- symlink/dangling/non-directory parent;
- parent `(dev,ino)` replacement;
- root replacement or a root that no longer belongs to the verified parent path.

The guard must apply consistently to Claude skills, shared Agent Skills, and Gemini commands. Do not rely only on
`lstat()` of the final target-root path, because intermediate symlinks are followed. Preserve per-target failure
isolation and existing item-race checks.

## R4-03 - Executable `SKILL.md` Loses Its Mode and Never Becomes Idempotent

- Severity: **Medium / contract and repeated-write defect**
- Contract: package-equivalent executable-bit definition, FR-1, FR-4, AC-1, AC-4, AC-5
- Primary code: `src/agents/skills.ts:144-155`
- Missing test: executable permission on `SKILL.md` itself; existing tests cover only non-SKILL resources.

### Reproduction

1. Create a valid custom canonical skill whose `SKILL.md` mode is `0755`.
2. Deploy it to an injected shared target twice.

Observed result:

```json
{
  "first": "created",
  "targetModeAfterFirst": "0644",
  "second": "updated",
  "targetModeAfterSecond": "0644"
}
```

The target-normalized hash includes the executable state of `SKILL.md`, so every later run detects drift. The
renderer writes generated `SKILL.md` content through `writeFile` but never applies the source mode.

### Required Red Test and Fix Contract

Parameterize Claude and shared targets with canonical `SKILL.md` modes `0644` and `0755`. Assert target executable
state matches the source after create/update, and the next deploy is `unchanged`. Preserve generated frontmatter
and marker behavior.

After writing the rendered `SKILL.md`, copy its source mode through the injected `FsOps` interface so chmod failure
is fault-injectable and causes staged-write `problem` without exposing a partial target. Keep ordinary resource
mode handling unchanged.

## R4-04 - Scaffold Follows a Dangling Bridge Symlink and Writes Outside the Project

- Severity: **Medium / user asset boundary**
- Contract: FR-10, AC-16 create-if-absent and never-overwrite rules
- Primary code: `src/scaffold.ts:43-53`
- Missing test: dangling symlink and create-time race for `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md`.

### Reproduction

1. Create an empty temporary project.
2. Create `GEMINI.md -> <tmp>/outside.md` where the referent does not exist.
3. Run `scaffoldSdd(project)`.

Observed result:

```json
{
  "reportedStatus": "created",
  "projectEntryStillSymlink": true,
  "externalReferentCreated": true
}
```

`existsSync()` follows the dangling link and returns false; `copyFileSync()` then follows it and creates the
external referent.

### Required Red Tests and Fix Contract

For each bridge name, create a dangling symlink to an absent external temporary path. Assert scaffold reports it as
existing/skipped (or a plain safety problem), does not alter the symlink, and does not create the referent. Retain
tests for regular existing files, symlinks to existing files, directories/special collisions, and missing sibling
bridge creation.

Use no-follow existence semantics plus an exclusive create operation. The final write must not have a
check-then-copy overwrite race: if any item appears after inspection, preserve it and report skipped/problem rather
than following or replacing it.

## R4-05 - Device Sync Reports Success Without Verifying Available Claude/Gemini Targets

- Severity: **High / false-green lifecycle result**
- Contract: FR-11, FR-12, AC-17, plan Lifecycle target-by-target verification
- Primary code: `scripts/device-sync-receive.sh:96-127`, `scripts/asset-dirs.ts:20-23`
- Incomplete evidence: `scripts/workflow-lifecycle.test.mjs:57-98` and
  `scripts/device-sync-pipeline.test.sh:70-120`

### Reproduction

An isolated device-sync receiver fixture had:

- all three shared `.agents/skills` targets with correct markers;
- an available Claude parent/explicit path but no Claude workflow artifacts;
- an available Gemini parent/explicit path but no Gemini command artifacts.

The real receiver returned exit 0, printed only the shared-target success, and ended with `수신 완료`. It reads
only `agent_skills=`. Although `asset-dirs.ts` exposes `claude_skills=` and `gemini_commands=`, those outputs are not
validated. If the resolver command itself fails, `DIRS_OUT` becomes empty and all workflow verification is silently
skipped, also allowing exit 0.

Gemini lifecycle assertions currently check file existence only, so an unmanaged or wrong-name TOML can pass.

### Required Red Tests

Add adversarial receiver tests using injected temp roots:

1. shared target missing one packaged skill -> exit 1;
2. available Claude target missing one skill or marker -> exit 1;
3. available Gemini target missing one wrapper or name-bound command marker -> exit 1;
4. Claude/Gemini runtime parent genuinely unavailable with no explicit override -> truthful skip, not failure;
5. target-status/path resolver failure -> exit 1, not silent bypass;
6. all available targets exact -> exit 0.

The existing device-sync fixture must actually install/copy the verifier it invokes. A test that omits
`asset-dirs.ts` and therefore bypasses the branch is not evidence.

### Lifecycle Evidence Matrix

`workflow-lifecycle: AC-17` currently executes only direct deploy, repeated deploy, target deletion followed by
direct deploy, one `restore-assets.sh` recover-default branch, and `asset-dirs.ts` output. It does not execute the
named entry points promised by AC-17.

Add temp-root end-to-end coverage for:

| Entry point | Required evidence |
|---|---|
| backup | canonical three-skill source is mirrored; generated Claude/shared/Gemini artifacts are excluded |
| restore | restored canonical source is followed by all-target regeneration and exact marker/policy checks |
| recover, no mirror | immediate seed plus all-target deploy |
| recover, mirror deferred | no generated target is built from the mirror before notes connection; later normal restore regenerates all targets |
| update | the actual update entry point reaches expanded `skills:deploy` and regenerates all injected targets |
| device sync | the actual receiver reaches restore/deploy and verifies each available target |

Existing stub/grep tests may remain as narrow wiring tests, but they do not replace this E2E matrix. Keep all paths
inside a temporary HOME/data/backup/runtime root and never use real user assets.

### Fix Contract

Do not duplicate target availability, path, ownership, or marker rules in shell. Prefer a small TypeScript verifier
or existing shared helpers that return deterministic target-level status for the receiver. At minimum:

- shared Agent Skills is the default required target for explicit deployment;
- Claude/Gemini are checked when their runtime parent exists or an explicit override makes them available;
- Claude/shared require each name-bound skill marker and target-specific `sdd-implement` policy metadata;
- Gemini requires each name-bound command marker, not file existence alone;
- resolver failure is a verification failure;
- unavailable is distinct from missing/corrupt;
- messages remain plain Korean and identify the failing target/logical IDs.

## Additional Evidence Limits

The final completion report must not overclaim the following even after R4 code fixes:

- Gemini CLI live E2E remains `skipped` while the CLI is absent.
- AC-7 official built-in collision evidence is a dated live-document check; the current automated assertion is
  narrower than a live catalog comparison.
- AC-9 through AC-11 primarily validate deterministic policy/canonical text, not actual model tool-call behavior.
  Static evidence must not be labeled runtime enforcement or installed-model E2E.
- AC-18 gateway/backend/search non-regression needs full regression plus diff-boundary evidence, not only file
  existence assertions.

These limits may be recorded as honest manual/static/skipped evidence rather than forcing speculative runtime
automation. They must remain unchecked if the spec wording requires stronger evidence that was not performed.

## Delegation Instructions

1. Finish and preserve the separately delegated R3-01 correction before starting this batch.
2. Do not modify or revert `specs/041-*`, `specs/042-*`, `specs/043-*`, the architecture audit, unrelated user
   changes, or the pre-existing `Makefile` `uninstall: purge` hunk.
3. Implement R4-01 first because it is an authorization boundary. Capture each red test before product changes.
4. Batch R4-02 through R4-04 mechanical safety fixes, then run one focused adversarial review of their bypasses.
5. Implement R4-05 with real temp-root lifecycle/receiver tests. Do not satisfy AC-17 with grep-only assertions.
6. Run focused tests after each cluster, then `npm run typecheck`, `npm run build`, full `npm test`, all lifecycle
   shell suites, `git diff --check`, privacy scan, and provider/model neutrality scan.
7. Use at most one isolated adversarial reviewer for the combined batch; final success still requires independent
   Codex follow-up.
8. Do not mark goal/spec/plan checkboxes. Do not commit, push, or deploy to real HOME/runtime paths.
