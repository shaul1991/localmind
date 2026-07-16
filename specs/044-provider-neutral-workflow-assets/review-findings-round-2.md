# Codex Independent Review Findings — Round 2

## Review Context

- Review date: 2026-07-13 (Asia/Seoul)
- Reviewer: Codex, independent from the Claude implementation and correction contexts
- Scope: current uncommitted spec 044 implementation after Claude reported 607 tests green
- Method: source inspection plus isolated `/tmp` runtime probes; no product code was modified
- Verdict: **not clean — three blocking correctness findings remain**

The existing green suite does not prove the three contracts below. Each finding was reproduced against the
current worktree with public module entry points and temporary injected paths. The implementation model must
add a failing regression test first, observe red, make the smallest product fix, and then run the complete
verification matrix again.

## R2-01 — Custom `agents/openai.yaml` Drift Is Silently Ignored

- Severity: **Medium / blocking**
- Contract: FR-1, FR-4, FR-6, AC-1, AC-5, R1-12 preservation contract
- Primary code: `src/agents/skills.ts:166-207`
- Missing test: `src/agents/skills.test.ts` only proves initial copy and an unchanged second deploy; it does not
  mutate the source provider resource between deploys.

### Reproduction

1. Create a valid custom, policy-less skill with `agents/openai.yaml` containing
   `allow_implicit_invocation: true`.
2. Deploy it to an injected `agent-skill` target.
3. Change only the canonical source `agents/openai.yaml` to `false`.
4. Deploy again.

Observed result:

```json
{
  "first": "created",
  "second": "unchanged",
  "deployed": "policy:\n  allow_implicit_invocation: true\n",
  "expected": "policy:\n  allow_implicit_invocation: false\n"
}
```

### Root Cause

`targetUpToDate()` compares `inspectSkillDir()` hashes for source and target. That inspection always uses
`target-normalized` hashing, which excludes `agents/openai.yaml` on both sides. Exact YAML comparison is then
performed only for packaged workflows (`policy` is present). A custom skill has no policy, so a changed custom
resource is excluded from both the generic comparison and the packaged metadata check.

This contradicts the implementation comment that custom `openai.yaml` is a user resource copied verbatim. A
resource is not preserved by synchronization if later source changes are silently ignored.

### Required Red Test

Extend the R1-12 custom-resource test to:

1. deploy `true` and assert the target contains `true`;
2. change only the source YAML to `false`;
3. redeploy and assert item status is `updated`;
4. assert the target contains `false` byte-for-byte;
5. deploy once more and assert `unchanged`.

Run the same mutation check for `claude-skill`, because custom resources are meant to be copied intact to both
skill-directory targets.

### Fix Contract

Target comparison must exclude `agents/openai.yaml` only when it is generated target metadata for a packaged
workflow. For a custom skill it is ordinary source-owned payload and must participate in exact drift detection.
Do not solve this by discarding or regenerating the custom file.

## R2-02 — Payload Hash Tuple Encoding Is Structurally Ambiguous

- Severity: **Medium / blocking integrity defect**
- Contract: canonical skill contract rule 8, FR-1, FR-3, FR-6, AC-1, R1-02
- Primary code: `src/agents/skill-contract.ts:247-270`
- Missing test: no test constructs distinct file graphs whose current delimiter encoding is byte-identical.

### Reproduction

Create two valid skills with the same name and identical `SKILL.md`:

- A has file `a` with bytes `X\0b\0-\0Y`.
- B has file `a` with bytes `X` and file `b` with bytes `Y`.
- All files are non-executable.

Observed result:

```json
{
  "filesA": ["SKILL.md", "a"],
  "filesB": ["SKILL.md", "a", "b"],
  "hashA": "5f7dd37555efa3669c24aae067ad02e369ed5525f44f9058793e46e47972630d",
  "hashB": "5f7dd37555efa3669c24aae067ad02e369ed5525f44f9058793e46e47972630d",
  "equal": true
}
```

Both registries reported zero problems. This is not a SHA-256 collision. The byte stream fed to SHA-256 is the
same because the current encoding is:

```text
relative-path NUL executable-flag NUL content NUL
```

Resource content may contain NUL, so one content field can forge the following tuple boundary. The comment in
the spec requires length-framed tuple hashing precisely to avoid this ambiguity.

### Impact

Canonical identity and target up-to-date decisions rely on this hash. The current three packaged workflows
contain only `SKILL.md`, which limits immediate exploitability for those exact payloads, but the contract allows
recursive resources and the implementation is already used for custom resources. A future packaged resource or
a custom multi-file skill can therefore have a distinct file graph accepted as identical.

### Required Red Tests

1. Add the exact A/B fixture above and assert both canonical hashes differ.
2. Exercise target-normalized inspection with the same fixture and assert hashes differ there too.
3. Retain deterministic-order and executable-bit tests.

### Fix Contract

Use an unambiguous, versioned encoding for every field, for example a fixed-width or decimal byte length followed
by the exact bytes. Frame at least the relative path, executable flag, normalized/raw content, tuple count, and
hash mode/domain. Do not merely change the delimiter: arbitrary resource bytes can contain any delimiter.

## R2-03 — Unterminated Gemini TOML Backup Can Be Promoted

- Severity: **Medium / blocking recovery defect**
- Contract: FR-5, FR-6, AC-6, AC-13, AC-20, R1-07.3
- Primary code: `src/agents/commands.ts:379-396`, wired at `src/agents/commands.ts:412-419`
- Missing test: existing truncation coverage does not include a file ending in an escaped quote.

### Reproduction

1. Put this managed backup at
   `.localmind-backup-goal-ready.toml-abcdef` while the visible target is absent:

```toml
# managed-by: localmind (command: goal-ready)
# source-payload-sha256: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
description = "valid"
prompt = "unterminated\"
```

2. Run `syncGeminiCommands()` with an eligible packaged `goal-ready` and inject failure into the first
   `writeFile` of the subsequent replacement.

Observed result:

- sync reports `problem` because the replacement stage write failed;
- `goal-ready.toml` nevertheless exists at the visible runtime name;
- its content is the invalid backup above;
- the backup name is gone.

The actual visible content ended with byte sequence `... 5c 22 0a` (backslash, quote, LF). In TOML that quote is
escaped, so the basic string is unterminated.

### Root Cause

`cmdComplete()` checks marker/hash line prefixes, the presence of `description = "` and `prompt = "`, then only
checks whether `trimEnd()` ends with a quote. It does not parse TOML or compare the recovered file to a known
deterministic wrapper. An escaped final quote therefore passes the completeness predicate.

### Required Red Tests

1. Recover the escaped-final-quote fixture and assert `problem`, zero promotion, visible target absent, backup
   retained.
2. Cover a syntactically invalid but marker-complete TOML document with duplicate keys or trailing junk.
3. Keep the existing valid-backup recovery test green.

### Fix Contract

Recovery completeness must prove that a backup is a complete generated command, not merely that it resembles
one. Prefer exact byte comparison with `renderGeminiCommand(template)` because the wrapper is deterministic and
the eligible template is already available. If the shared reconciler callback shape prevents that, use a strict
TOML parser plus exact managed schema and required envelope checks, but exact generated-content comparison is
the narrower and stronger contract for a managed generated artifact.

The completeness callback must be constructed only after a successful deterministic render. If rendering
fails, do not promote any backup.

## Delegation Instructions

1. Do not modify or revert `specs/041-*`, `specs/042-*`, `specs/043-*`, the architecture audit, unrelated user
   changes, or the pre-existing `Makefile` `uninstall: purge` hunk.
2. Add all R2 tests first and capture the red counts/output.
3. Fix R2-01, R2-02, and R2-03 without broad refactoring.
4. Run focused tests after each cluster, then `npm run typecheck`, `npm run build`, full `npm test`, lifecycle
   shell suites, `git diff --check`, privacy scan, and provider/model neutrality scan.
5. Use an isolated adversarial reviewer to inspect the three fixes and look for equivalent bypasses.
6. Do not mark goal/spec/plan checkboxes until the independent Codex follow-up review is clean.
7. Do not commit, push, or deploy to real HOME/runtime paths.

