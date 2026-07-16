# Plan: 공급자 중립 AI 워크플로 자산

## Approach

행동 정본은 Agent Skills 표준 `SKILL.md` 하나로 통일하고, runtime별 차이는 세 adapter로 제한한다.
Claude Code는 기존 personal skill copy를 유지하고, Codex와 Gemini CLI는 공식 공용 경로
`~/.agents/skills`를 함께 사용한다. Gemini CLI의 `/name` 경험은 canonical body에서 매번 생성하는 TOML
wrapper로 제공한다. 생성본은 수동 정본이 아니며 workspace skill lookup이나 self-asserted fingerprint에
의존하지 않는다. Codex에는 존재하지 않는 bare custom slash command를 만들지 않는다.

현재 `src/agents/skills.ts`의 동기화 흐름을 유지한다. source discovery/validation, marker-bound managed
artifact reconciliation, runtime rendering을 작은 모듈로 분리하고 새 범용 plugin framework는 만들지
않는다. 기존 이름 결합 managed marker, user asset 불가침, prune guard를 유지하며 directory/file update는
임시 sibling과 backup sibling을 이용한 rollback 가능한 swap으로 수행한다.

`sdd-implement`, `goal-ready`, `sdd-self-review`는 package template로 고정한다. workflow 본문은 role와
capability만 말하고 provider, model, tool API를 직접 지칭하지 않는다. SDD 구현의 상세 완료 규칙은
`AGENTS.md`가 계속 정본이며 `sdd-implement` skill은 해당 문서를 읽고 조율하는 adapter다. root 규약의 concrete
model 배치는 파장 기반 abstract execution tier로 바꿔 어느 runtime에서도 같은 필수 절차를 수행하게
한다.

## Domain Boundaries

| Boundary | Owns | Must not own |
|---|---|---|
| Workflow catalog | localmind-owned logical IDs와 packaged seeds | runtime path, native command syntax, model selection |
| Agent Skill contract | SKILL.md schema, directory binding, safe resource traversal | provider-neutrality policy for third-party/user-owned skills |
| Workflow neutrality policy | localmind packaged workflow의 role/capability/fallback 규칙 | 사용자 custom skill 내용 검열 |
| Execution policy | 실패 파장 기반 abstract tier, capability mapping, truthful fallback | provider/model 추천, gateway default, persona schema migration |
| Managed artifact reconciliation | marker ownership, lstat collision, staged swap/recovery, prune, exact status | workflow schema/행동, runtime path/invocation |
| Skill synchronization | source -> target directory copy, marker injection, idempotence | workflow 행동 해석, runtime CLI 실행 |
| Runtime target adapters | Claude path, shared Agent Skills path, canonical body 기반 Gemini TOML rendering/invocation | canonical workflow의 수동 편집/별도 정책 |
| SDD context bridge | AGENTS.md SSoT와 CLAUDE.md/GEMINI.md import | 규약 복제, 기존 context 파일 병합/덮어쓰기 |
| Asset lifecycle | seed, backup mirror, restore, update, device-sync 검증 | 실제 사용자 note 내용, third-party plugin assets |

### Ubiquitous Language

- `workflow`: 반복 절차 전체
- `logical command`: runtime과 무관한 workflow 이름
- `canonical skill`: 행동 정본
- `packaged seed`: 배포판 기본 workflow
- `target adapter`: runtime-specific 파생물 생성기
- `native wrapper`: logical command를 runtime command로 노출하는 얇은 파생물
- `behavior parity`: 같은 행동 계약
- `invocation mapping`: 서로 다른 공식 호출 문법의 정직한 대응표

### Dependency Direction

```text
templates/skills -> seed -> canonical data skills
                              |
                              v
                    Agent Skill contract
                              |
             +----------------+----------------+
             v                v                v
       Claude copy      Shared Agent copy   Gemini command renderer
             |                |                |
             +----------------+----------------+
                              v
                    deploy result / lifecycle
```

Contract와 canonical workflow는 runtime adapter를 import하지 않는다. Adapter가 contract와 source를
소비한다.

## Impacted Modules

| Path | Change | Responsibility |
|---|---|---|
| `templates/skills/catalog.json` | new | packaged logical ID, activation class, side-effect class의 adapter policy manifest |
| `templates/skills/sdd-implement/SKILL.md` | new | collision-free SDD implementation orchestration, AGENTS.md SSoT handoff |
| `templates/skills/goal-ready/SKILL.md` | new | 현재 data-only skill을 neutral contract로 package |
| `templates/skills/sdd-self-review/SKILL.md` | update | provider/model-specific review wording 제거 |
| `package.json`, `package-lock.json` | update | standards-compliant YAML 1.2 parser `yaml` dependency |
| `src/agents/skill-contract.ts` | new | Agent Skills frontmatter/schema/resource/manifest binding, packaged neutrality validation helper |
| `src/agents/skill-contract.test.ts` | new | AC-1, AC-8, packaged workflow characterization |
| `src/agents/reconcile.ts` | new | file/directory marker ownership, lstat collision, staged swap/recovery, prune, status aggregation |
| `src/agents/reconcile.test.ts` | new | AC-12, AC-13, AC-20 deterministic fault injection |
| `src/agents/skills.ts` | update | validated source discovery, Claude/shared targets, marker injection, recoverable swap, target isolation |
| `src/agents/skills.test.ts` | update | seed, multi-target deploy, collision/prune/failure/absent target |
| `src/agents/workflow-policy.ts` | new | manifest-derived activation policy와 target metadata/prompt rendering; runtime enforcement 범위 표시 |
| `src/agents/workflow-policy.test.ts` | new | AC-9~11 adversarial activation text/policy matrix와 enforcement-level reporting |
| `src/agents/commands.ts` | new | logical invocation matrix, Gemini TOML wrapper/render/sync |
| `src/agents/commands.test.ts` | new | TOML generated request/body/hash, Codex/Gemini workspace resolution, ownership, prune, truthful invocation |
| `scripts/skills-deploy.ts` | update | seed + all target deploy + command wrapper summary |
| `scripts/asset-dirs.ts` | update | canonical/shared/Gemini target override path를 shell lifecycle에 노출 |
| `scripts/backup-assets.sh` | characterization/update if needed | canonical skills backup 범위 유지, generated target 제외 |
| `scripts/restore-assets.sh` | update | restore 후 expanded skills deploy 실행/요약 |
| `scripts/recover.sh` | characterization/update if needed | default immediate deploy와 mirror-deferred restore 경로 보존 |
| `scripts/update.sh` | characterization/update if needed | 기존 skills:deploy가 all-target regeneration을 수행함을 고정 |
| `scripts/device-sync-receive.sh` | update | Claude agent 하나가 아닌 workflow target별 marker/status 검증 |
| corresponding `scripts/*.test.*` | update | AC-17 lifecycle regression |
| `GEMINI.md` | new | `@./AGENTS.md` root bridge |
| `AGENTS.md` | update | `/goal` SDD 규약을 `sdd-implement`로 이관하고 concrete model allocation을 abstract tier/fallback으로 치환 |
| `templates/sdd/AGENTS.md` | update | scaffold command migration과 neutral execution fallback |
| `templates/sdd/spec.template.md` | small update | verification comment의 old `/goal` pointer를 `sdd-implement`로 이관 |
| `templates/sdd/CLAUDE.md` | new | external scaffold용 `@AGENTS.md` bridge |
| `templates/sdd/GEMINI.md` | new | external scaffold용 `@AGENTS.md` bridge |
| `src/scaffold.ts`, `src/scaffold.test.ts` | update | bridge files create-if-absent, existing file protection |
| `src/agents/cross-review-cli.ts` | comment-only | old `/goal` flow 명칭을 `sdd-implement`로 교정; behavior 불변 |
| `docs/agents.md` | update | canonical/target/invocation/lifecycle/user fork guidance |
| `docs/reference.md` | update | new env vars와 target paths |
| `README.md` | small update | 세 runtime workflow deploy entry point 안내 |
| `Makefile` | help-only update | 기존 unrelated 변경을 보존하며 `skills-deploy`의 Claude-only 설명만 교정 |
| `specs/007-sdd-scaffold/{goal,spec,plan}.md` | small doc note | runtime bridge scaffold 확장이 044에 정의됨을 명시 |
| `specs/018-sdd-self-review-orchestration/{goal,spec,plan}.md` | small doc note | provider-specific trigger/fallback/copy/docs superseded와 transport/toggle/invariants retention/subsumption을 FR별 명시 |
| `specs/019-device-local-asset-sync/{goal,spec,plan}.md` | small doc note | restore/recover all-target regeneration extension pointer |
| `specs/031-device-sync-pipeline/{goal,spec,plan}.md` | small doc note | target별 workflow marker verification extension pointer |
| `specs/033-local-update/{goal,spec,plan}.md` | small doc note | expanded skills deploy extension pointer |

`src/agents/registry.ts`, `src/agents/deploy.ts`, persona templates, `src/agents/runtime.ts`, backend router,
brain/search, web UI는 이번 구현에서 변경하지 않는다. `goal-ready`는 named persona가 없어도 role prompt와
fallback으로 동작해야 하므로 Gemini persona renderer는 선행조건이 아니다.

## Detailed Design

### 1. Skill Registry and Validation

`loadSkillRegistry(root, options)`는 정렬된 direct child directory만 읽는다. 각 entry는 다음 정보를
가진다.

```ts
interface SkillPackage {
  name: string;
  description: string;
  root: string;
  files: string[];       // POSIX relative, sorted, regular files only
  managedSource: boolean;
  canonicalPayloadHash: string;
  policy?: { activation: "intent" | "explicit" | "delegated-or-explicit"; sideEffects: "docs-only" | "mutating" | "report-only" };
}

interface SkillProblem {
  nameOrPath: string;
  reason: string;
}

type WorkflowTargetId = "canonical-seed" | "claude-skill" | "agent-skill" | "gemini-command";
type WorkflowStatus =
  | "created"
  | "updated"
  | "unchanged"
  | "pruned"
  | "recovered"
  | "skipped-unmanaged"
  | "skipped-unavailable"
  | "skipped-dependency"
  | "problem";

interface WorkflowSyncItem {
  logicalId: string;
  target: WorkflowTargetId;
  artifactKind: "skill-directory" | "command-file";
  status: WorkflowStatus;
  invocation?: string;
  reason?: string;
  resolution?: "resolved" | "equivalent-shadow" | "ambiguous-shadow" | "unmanaged-shadow" | "unverified";
}

interface WorkflowDeployResult {
  outcome: "success" | "partial" | "failed";
  pruneSuppressed: boolean;
  items: WorkflowSyncItem[];
  sourceProblems: SkillProblem[];
}
```

- `yaml` document parser는 YAML 1.2 core schema로 frontmatter를 읽고 zod가 root mapping과 string
  `name`/`description`을 검증한다. 64 KiB limit, alias/custom tag rejection을 적용한다. unknown standard
  fields는 원문을 보존하고 renderer가 다시 쓰지 않는다.
- packaged mode는 `catalog.json`을 structured JSON+zod로 읽어 manifest ID와 direct child skill directory의
  exact 1:1 binding, activation/side-effect enum을 먼저 검증한다. production catalog는 정확히 세 ID지만
  injected fourth fixture가 code name list 변경 없이 같은 pipeline을 통과해야 한다.
- symlink는 따라가지 않는다. source root 밖 traversal이 가능한 entry는 문제로 거부한다.
- regular resource의 content와 executable permission bit를 보존한다.
- neutrality validator는 `templates/skills/{sdd-implement,goal-ready,sdd-self-review}`와 그 seeded managed
  copy에만 적용한다. packaged frontmatter는 `name`/`description` exact key set을 요구하고 description,
  Markdown body, UTF-8 text resources를 검사한다. 사용자 custom skill의 provider-specific `compatibility`,
  metadata, tool instruction은 검열하지 않는다.
- known forbidden token 목록은 구현 세부 테스트 상수로 두되 adapter/reference fixture는 검사 범위에서
  제외한다. generic standard term `Agent Skills`를 runtime-only `Agent tool/type`과 혼동하지 않는다.
- canonical payload hash와 target fingerprint는 sorted relative path, normalized canonical SKILL payload,
  regular resource bytes와 executable bits로 결정적으로 계산한다. generated marker/policy metadata는 payload
  hash에서 제외하지만 target renderer exact validation에서는 포함한다.

### 2. Managed Artifact Reconciler

`reconcile.ts`는 workflow나 runtime을 모르는 file/directory write primitive다.

- ownership predicate와 artifact name을 받아 `lstat` collision, marker binding, unmanaged preservation을
  판정한다.
- canonical source root symlink는 `realpath`로 한 번 고정해 resolved directory를 traversal boundary로 쓴다.
  Generated target root와 immediate runtime parent는 real directory만 허용하고 symlink/dangling/non-directory는
  target-level problem이다. mutation 직전 `(dev, ino)` identity를 재확인한다.
- same-parent stage/backup naming은 runtime discovery에 노출되지 않는
  `.localmind-stage-<name>-<nonce>` / `.localmind-backup-<name>-<nonce>` 형식을 사용한다.
- `replaceManagedDirectory`, `replaceManagedFile`, `recoverManagedArtifact`, `pruneManagedArtifact`가 같은
  result/status contract를 반환한다.
- prune/retirement도 direct delete하지 않는다. marker 검증 후 `.localmind-retired-<name>-<nonce>`로 먼저
  rename해 runtime-visible name을 제거하고 hidden cleanup failure는 problem/orphan recovery로 처리한다.
- recovery는 exact name-bound marker와 complete artifact validation callback을 모두 통과한 orphan만
  복구/정리한다. 모호한 상태는 손대지 않는다.
- fault injection은 production default filesystem operation table에 test에서만 injected operation을
  넘기는 최소 seam으로 제공한다. test 전용 분기가 production control flow를 우회하지 않는다.

### 3. Seed

기존 `seedSkills()` API와 result shape를 가능한 한 유지한다.

1. template registry를 validation한다. package template 하나라도 invalid이면 data source를 쓰지 않고
   문제를 반환한다.
2. 모든 package template은 name-bound managed marker를 가지며 clean seed에도 marker가 보존된다.
3. data target에 이름이 없으면 complete stage directory를 만든 뒤 rename해 생성한다.
4. data target이 legacy name-bound managed marker를 가지면 template과 비교해 update/unchanged 처리하고,
   update는 Managed Target Copy와 같은 backup swap/recovery primitive를 사용한다.
5. marker가 없거나 symlink/special item이면 user fork/unmanaged로 보고 따라가지 않고 보존한다. manifest의
   예약 ID와 이름이 같은 non-equivalent fork에는 `reserved-id-fork` metadata를 붙인다.
6. seed는 data source를 prune하지 않는다. 예약 ID fork 차단은 runtime deploy 단계에서 수행한다.

현재 `~/.localmind/skills/goal-ready`와 `sdd-self-review`는 legacy managed marker가 있으므로 새 neutral
template으로 갱신 대상이다. 실제 사용자 경로는 테스트 fixture와 문서에 넣지 않는다.

### 4. Managed Directory Swap

`syncSkillTarget(source, target)`는 source package별 임시 sibling directory를 만들고 전체 regular file을
복사한다. 대상 `SKILL.md`에 정확한 name-bound marker가 없으면 frontmatter 종료 직후 아래 comment를
한 번 삽입한다.

```markdown
<!-- managed-by: localmind (skill: <name>) - generated from the canonical skills registry. -->
```

Packaged target은 manifest policy를 렌더한다. `sdd-implement` Claude target에는 YAML parser를 통해
`disable-model-invocation: true`를 추가하고 shared target에는 exact `agents/openai.yaml`의
`policy.allow_implicit_invocation: false`와 package fingerprint marker를 생성한다. user custom skill은
unknown provider frontmatter/resources를 보존하며 packaged policy를 강제로 붙이지 않는다. Cross-target
comparison은 normalized canonical payload hash를 비교하고 target-specific metadata는 별도 exact validator로
검사한다.

Manifest 예약 ID의 active data source가 package-equivalent가 아니면 이 일반 custom-skill path보다 먼저
fail-closed 처리한다. source는 수정하지 않으며 Claude/shared/Gemini target의 name-bound managed artifact만
retire한다. unmanaged artifact는 보존하고 `reserved-id-fork` + rename guidance를 반환한다. 이 fixture에서
runtime-visible reserved workflow를 새로 만들거나 갱신하는 write는 0회다.

완성된 stage, 기존 target, backup은 검증된 real target root 안의 같은 parent에 둔다. 기존 target item은
먼저 `lstat`하고,
directory가 아니거나 symlink/special/unmanaged이면 따라가지 않고 `skipped-unmanaged`다. managed
directory만 marker name이 일치할 때
backup sibling으로 rename하고, 이후 stage를 target으로 rename한다. 두 번째 rename이 실패하면 backup을
원위치로 복구한다. 새 target 배치가 끝난 뒤에만 backup을 정리한다. 이 계약은 비어 있지 않은 directory를
단일 rename으로 교체할 수 있다고 가정하지 않는다.

deploy 시작 시 해당 logical ID의 고아 stage/backup을 먼저 검사한다. target이 없고 정확히 하나의 유효한
name-bound backup이 있으면 backup을 복구한다. complete managed target과 old backup이 함께 있으면 target을
유지하고 backup을 정리한다. marker 불일치, 여러 backup, incomplete stage처럼 상태가 모호하면 어떤
directory도 삭제하지 않고 problem으로 보고한다. 이를 통해 injected failure와 process interruption 뒤
다음 실행에서 복구할 수 있게 한다.

Target orchestration은 다음 순서로 각각 try/catch boundary를 가진다.

1. Claude target, available when parent exists or override given
2. shared Agent Skills target, explicit deploy이면 default path를 생성
3. Gemini command target, available when parent exists or override given

한 target의 filesystem 오류는 다른 target 실행을 막지 않는다. source validation, filesystem, recovery
problem이 하나라도 있으면 aggregate `failed`와 CLI exit 1이고 성공한 target은 rollback하지 않는다.
problem 없이 unavailable/unmanaged/dependency skip 또는 reserved-ID fork retirement가 있으면 `partial`과 exit
0이다. reserved-ID fork에 retire할 managed target이 없으면 target item은
`skipped-dependency`/`reserved-id-fork`다.

### 5. Gemini Command Rendering

`renderGeminiCommand(skill, policy)`는 spec의 wrapper만 생성하는 순수 함수다.

- 입력 catalog는 packaged registry뿐이다. user custom skill은 wrapper 대상이 아니다.
- file name은 `<logical-id>.toml`, nested namespace는 초기 catalog에서 사용하지 않는다.
- description은 packaged template에서 읽어 CR/LF/tab과 연속 whitespace를 ASCII space 하나로 바꾸고
  trim한 single-line string으로 정규화한다. name/description은 TOML basic string으로 안전하게 escape한다.
- comment/request/body 순서는 managed marker, source payload hash, `logical-id`, `raw-args`, canonical workflow
  boundary다. prompt 전체는 quote/backslash/control/LF를 escape하고 invalid Unicode scalar를 거부하는 TOML
  basic-string encoder 하나로 렌더한다. multiline delimiter에 의존하지 않는다. `{{args}}`는 `raw-args=`에
  정확히 한 번, generated workflow 밖에 둔다. request/hash는 authorization 또는 runtime attestation이라고
  쓰지 않는다.
- verified canonical SKILL body와 실행에 필수인 UTF-8 text reference를 결정적 relative-path/hash boundary로
  inline한다. packaged command는 executable/binary resource를 core behavior의 필수 전제로 둘 수 없고,
  inline content의 `{{args}}`, `!{...}`, `@{...}` 같은 Gemini preprocessing directive는 validation error다.
- `sdd-implement` generated body는 unattested runtime confirmation handshake를 생략하지 않으며 Gemini에서는
  instruction-level guard임을 표시한다.
- command marker와 filename name이 일치해야 managed다.
- eligibility는 packaged ID membership + active data source의 managed/package equivalence + wrapper
  self-containment다. markerless/non-equivalent reserved-ID fork는 eligible하지 않다. shared target failure는
  wrapper rendering을 막지 않고 auto-skill availability에만 반영한다.
- reserved-ID fork 또는 invalid/unverifiable packaged source이면 name-bound managed wrapper를 fail-closed
  `pruned`한다. 없는 wrapper는 `skipped-dependency`, unmanaged wrapper는 `skipped-unmanaged`다.
- complete temp file과 managed backup을 같은 parent에 두고 directory swap과 같은 failure/recovery
  원칙으로 교체한다. symlink/special/unmanaged command는 따라가지 않는다.
- invalid source가 있으면 source absence 기반 command catalog prune은 보류하되, invalid source/reserved-ID
  fork의 name-bound generated runtime entrypoint safety retirement는 허용하고 aggregate 상태를 유지한다.
- injected current workspace resolver는 CWD부터 repository root까지 Codex `.agents/skills` 동명 asset과
  Gemini `.gemini/commands`, `.agents/skills`, `.gemini/skills`의 official resolution을 검사한다. Codex
  non-equivalent duplicate는 `ambiguous-shadow`, Gemini command shadow는 `unmanaged-shadow`, skill shadow는
  auto-activation parity 미검증으로 반환한다. user install과 arbitrary future workspace resolution을 동일한
  success로 합치지 않는다.

### 6. Workflow Contents

세 skill은 다음 공통 문체를 사용한다.

- main session, isolated subagent, role, capability, runtime이라는 중립 용어
- runtime tool 이름을 쓰지 않고 "사용자에게 질문한다", "공식 문서를 live 조회한다", "결정 노트를
  기록한다"처럼 결과 중심으로 표현
- named persona가 있으면 사용할 수 있으나 없으면 task prompt에 role checklist를 포함해 generic isolated
  subagent로 위임
- isolated subagent도 없으면 main session fallback과 사유 보고
- model tier나 provider 이름을 workflow 완료 조건으로 사용하지 않음
- user argument placeholder를 본문에 넣지 않음. 현재 user request/context를 입력으로 삼음

Activation은 behavior contract에 포함한다. `goal-ready`는 명시 invocation 또는 분명한 문서 준비 의도,
`sdd-self-review`는 명시 invocation 또는 authorized `sdd-implement`의 current-turn 내부 위임을 허용한다.
`sdd-implement`는 Claude/Codex generated deny-implicit metadata가 제공하는 runtime-attested provenance와
exact 3자리 raw args가 있을 때만 즉시 시작한다. provenance 없는 runtime은 fresh one-time confirmation
turn을 거친다. grant 전에는 side effect를 금지하며 prompt/generated request 문자열과 과거 대화는 권한이
아니다. Claude/Codex의 runtime policy와 Gemini의 instruction-level guard를 같은 enforcement라고 부르지 않는다.

`workflow-policy.ts`는 manifest policy를 Claude/Codex metadata와 canonical/Gemini activation instruction으로
렌더하고 enforcement level을 `runtime-enforced | instruction-level | not-applicable`로 보고한다. runtime
invocation이 이 TypeScript 함수를 호출한다고 가장하지 않는다. adversarial contract tests는 exact generated
policy/text와 forbidden grant conditions를 고정하며, installed runtime E2E만 실제 model behavior evidence로
분리한다. Gemini CLI가 없으면 pre-confirmation tool-call behavior는 `skipped`, not-proven으로 남는다.

Runtime-attested exact-NNN과 fresh exact confirmation은 동일한 `execution grant`다. 두 branch 모두 local
implementation을 시작하고 완료 후 repo `AGENTS.md`의 commit/push/CI 규칙을 따른다. 일반 자연어 위임은
이 자동 completion side-effect 권한을 만들지 않는다.

`goal-ready`는 이전 audit에서 발견한 세 drift도 함께 고친다.

1. Live-Verify를 goal/spec 초안보다 먼저 수행
2. SSoT readiness(context map, ubiquitous language, constitution, ADR)은 해당 계약 문서가 있는 project에서
   조건부 검증
3. 사용자 확인 요청과 feedback 반영 loop를 명시적 마지막 단계로 추가

Tradeoff decision은 repo decision-log 계약을 읽고 provider-neutral durable knowledge-capture capability로
기록한다. concrete MCP/tool 이름은 canonical body에 넣지 않고, capability가 없으면 docs/report에 근거와
미수행 사유를 남긴다.

`sdd-self-review` canonical body는 구체 binary 이름 없이 optional additional review capability만 말한다.
기존 `localmind-review`는 adapter/reference layer에서만 optional evidence transport로 남긴다. mandatory
adversarial review를 유지하되 isolated capability가 없으면 main-session fallback을 `not-independent`로
정확히 보고한다.

### 7. Provider-Neutral Execution Policy

- root `AGENTS.md`의 concrete model table을 spec의 `critical-reasoning | standard | economy` 등급으로
  치환한다.
- architecture/spec/final critic은 `critical-reasoning`, routine implementation/test는 `standard`, 저위험
  기계 작업만 `economy`에 둔다.
- runtime이 model/tier 선택을 제공하지 않으면 현재 session이 role checklist를 수행하고 fallback을
  보고한다. 특정 provider/model 부재는 stop condition이 아니다.
- SDD/TDD, final review 강도, evidence check, commit/push/CI 같은 행동 gate는 약화하지 않는다.
- provider별 구체 mapping, 가격, model alias는 root workflow contract나 canonical skill에 두지 않는다.
- root/scaffold의 `Agent`, `AskUserQuestion`, `WebFetch`, `WebSearch`, `context7` 같은 runtime 전용 필수
  identifier도 role/capability/outcome으로 바꾼다. project-owned portable MCP operation은 adapter mapping으로
  남길 수 있지만 특정 client label이 없으면 capability fallback과 미수행 사유를 사용한다.
- `templates/sdd/AGENTS.md`는 이미 concrete model을 강제하지 않는지 characterization하고, root와 같은
  fallback 원칙이 필요한 최소 범위만 동기화한다.

### 8. Context Bridges and Scaffold

- root `GEMINI.md`는 설명 한 줄과 `@./AGENTS.md`만 가진다.
- root `CLAUDE.md`는 기존 파일을 유지한다.
- `templates/sdd/CLAUDE.md`는 `@AGENTS.md`, `templates/sdd/GEMINI.md`는 `@./AGENTS.md` import stub이다.
- `scaffoldSdd()`는 AGENTS.md, CLAUDE.md, GEMINI.md, specs/를 각 item 단위로 create-if-absent한다.
  어느 하나가 존재해도 다른 missing item은 만들며 기존 내용은 병합/수정하지 않는다.
- output과 tests는 기존 두 item 고정 가정을 새 item list에 맞게 갱신한다.

### 9. Lifecycle

canonical source만 backup 대상이다. `~/.claude`, `~/.agents`, `~/.gemini`의 generated artifacts는 backup에
넣지 않고 restore/update 후 재생성한다.

- `asset-dirs.ts`: canonical skills와 override 여부는 기존 key를 유지한다. target path가 shell 검증에
  필요하면 새 key를 additive하게 출력한다.
- restore: canonical mirror 복원 후 `skills:deploy` 한 번으로 모든 target 재생성.
- recover: mirror가 없는 기본 구성은 seed 후 all-target deploy를 수행한다. mirror가 있지만 notes 연결 전
  restore가 보류되는 경로는 backup mirror를 generated target source로 사용하지 않고, notes 연결 후
  `restore-assets`가 canonical을 복원한 다음 all-target deploy한다.
- update: 기존 단계 이름을 유지하고 expanded deploy summary 표시.
- device-sync: installed/available target별 marker를 확인하되 unavailable target을 실패로 오인하지 않는다.
  `agent-skill` target은 기본 생성 대상이므로 세 packaged workflow 존재를 확인한다.

## Implementation Steps

### Phase 0: Live Verification and Characterization

- [ ] Agent Skills, Claude Code, Codex, Gemini CLI의 current official path/schema/invocation을 다시 조회하고
      `spec.md` 표와 다른 항목을 먼저 amendment/OQ로 표면화한다.
- [ ] Claude built-in `/goal` availability/collision을 공식 current docs와 installed version으로 확인하고
      LocalMind가 `goal` skill/wrapper를 생성하지 않는 characterization을 고정한다.
- [ ] 세 runtime의 implicit/explicit skill activation과 precedence 차이를 확인한다. Claude/Codex
      deny-implicit metadata를 contract fixture로 고정하고 provenance 없는 runtime의 fresh confirmation을
      instruction-level guard로 분류한다. runtime hook이 없는 곳에서 zero-tool-call enforcement를 주장하지
      않는다.
- [ ] 세 packaged logical ID를 current official Claude/Gemini built-in command 목록과 대조한다. 새 충돌이
      있으면 이름을 추측해 우회하지 말고 spec amendment/OQ로 중단한다.
- [ ] `yaml` package의 current official YAML 1.2 support, license, supported Node range를 재검증하고 lockfile에
      설치할 exact version을 evidence로 남긴다. 검증 실패 시 ad-hoc parser로 대체하지 말고 중단한다.
- [ ] 현재 `seedSkills`, `deploySkills`, `skills-deploy`, backup/restore/recover/update/device-sync의 result와
      side effect를 characterization test로 고정한다.
- [ ] 현재 data source와 Claude target의 legacy marker/hash 상태를 read-only로 확인하고 migration fixture를
      만든다. 실제 private path/content는 test fixture에 복사하지 않는다.
- [ ] `Makefile`의 기존 unrelated hunk와 041~043 worktree 변경을 기록한다. 041~043은 완전 제외하고,
      Makefile은 `skills-deploy` help 한 줄만 별도 hunk로 허용하며 기존 hunk를 수정/revert/stage하지 않는다.

### Phase 1: Contract, Ownership, and Safe Seed

- [ ] AC-1, AC-2, AC-3, AC-8, AC-20의 seed-side failing tests를 먼저 작성한다.
- [ ] `skill-contract.ts`의 YAML document parsing + zod schema, manifest 1:1 binding, safe traversal,
      package neutrality/fingerprint validator를 구현한다.
- [ ] invalid package template일 때 seed가 쓰기 전에 실패하는 ordering을 검증한다.
- [ ] packaged marker, managed seed staged swap/recovery, markerless/symlink fork protection, reserved-ID fork의
      runtime exposure 차단을 구현한다.

### Phase 2: Neutral Workflow Seeds

- [ ] `sdd-implement`, `goal-ready`, `sdd-self-review` SKILL.md의 failing characterization tests를 작성한다.
- [ ] provider/model/tool identifier 없이 spec의 행동 계약을 구현한다.
- [ ] `workflow-policy.ts` renderer와 activation matrix를 구현한다. quote/negation/explain-only,
      missing/invalid/extra/multiple NNN, stale/replay challenge, unavailable provenance에서 generated policy가
      grant하지 않는지 검증하고 runtime-enforced/instruction-level 차이를 결과에 남긴다.
- [ ] legacy managed update와 user fork preservation을 테스트하며 세 package를 seed한다.
- [ ] AC-9~AC-11의 SSoT/feedback 및 review fallback scenario matrix를 통과시킨다.

### Phase 3: Multi-target Skill Deploy

- [ ] AC-4, AC-5, AC-12, AC-13, AC-14, AC-15 failing tests를 작성한다.
- [ ] source validation, marker injection, rollback 가능한 directory swap/recovery, target-independent result를
      구현한다.
- [ ] manifest policy에서 Claude `disable-model-invocation`과 shared `agents/openai.yaml`을 렌더하고
      normalized canonical hash와 target-specific metadata exact validation을 분리한다.
- [ ] exact item status, aggregate outcome, CLI exit 계약과 Claude/shared target의
      create/update/unchanged/root-or-item-symlink/collision/prune/problem/absent cases를 통과시킨다.
- [ ] recursive resources의 path/order/content/executable bit가 두 skill target에서 같음을 검증한다.
- [ ] reserved `sdd-implement` fork source는 보존하되 Claude/shared managed entrypoint가 retire되고 새 runtime
      exposure가 0인지 검증한다. Codex repo same-ID equivalent/non-equivalent resolution도 포함한다.

### Phase 4: Logical Commands and Gemini Adapter

- [ ] AC-6, AC-7과 AC-20 command-side failing tests를 작성한다.
- [ ] invocation matrix와 Gemini TOML renderer/synchronizer를 구현한다.
- [ ] wrapper generated request가 source hash/logical ID/raw args/canonical body/text references를 고정 순서로
      전달하되 provenance나 runtime attestation을 주장하지 않고 `sdd-implement` fresh confirmation을 우회하지
      않는지 검증한다.
- [ ] injected current workspace의 Codex/Gemini command/skill resolver를 구현하고
      `resolved|equivalent-shadow|ambiguous-shadow|unmanaged-shadow|unverified`를 installation status와 분리한다.
- [ ] packaged-only catalog, shared-target 독립 wrapper, quote, backslash, multiline, braces, empty args,
      unmanaged/symlink collision, safe file swap/recovery, prune guard를 검증한다.
- [ ] summary는 logical ID와 runtime syntax를 분리하고 nonexistent Codex slash command를 표시하지 않는다.

### Phase 5: Context and Lifecycle

- [ ] AC-16, AC-19 failing tests 후 root/template의 `sdd-implement` migration, bridge, additive scaffold,
      abstract execution policy를
      구현한다.
- [ ] AC-17 temp-repo lifecycle test를 작성하고 restore/recover/update/device-sync를 expanded deploy에
      연결한다.
- [ ] unavailable runtime과 actual failure를 구분해 marker verification과 exit summary를 갱신한다.

### Phase 6: Documentation and Compatibility

- [ ] AC-21 failing contract test 후 `docs/agents.md`, `docs/reference.md`, README에 정본, target paths,
      activation/invocation matrix, LocalMind-owned command scope, env override,
      `/goal` built-in과 `sdd-implement` migration, deny-implicit/confirmation, fork/unmanaged protection,
      reserved-ID rename 규칙, Codex/Gemini workspace collision과 Gemini instruction-level/live verification 한계를
      문서화한다.
- [ ] historical specs/migration 설명을 제외한 active AGENTS/templates/docs/relevant source comments에서 old
      LocalMind `/goal` workflow pointer를 제거하고 contract scan으로 고정한다.
- [ ] Makefile의 unrelated hunk를 보존하고 `skills-deploy` help의 Claude-only 문구만 교정한다.
- [ ] specs/007에 044 additive scaffold extension note를 추가한다.
- [ ] specs/018에 FR-1/4/6/7/8/10 supersede 범위와 FR-2/3/5/6 optional adapter retention,
      FR-8/9/10 invariants/docs의 044 FR-11/12/13 subsumption note를 추가한다.
- [ ] specs/019, specs/031, specs/033에 각 lifecycle additive extension pointer를 추가한다.
- [ ] `make skills-deploy`와 npm script 이름을 유지하고 shell/MCP/backend behavior가 바뀌지 않음을
      regression으로 확인한다.

### Phase 7: Full Verification and Self-review

- [ ] AC-1~AC-21 테스트, typecheck, build, full unit/integration/shell suite를 실행한다.
- [ ] canonical/template privacy and neutrality scan을 실행한다.
- [ ] 설치된 Claude Code와 Codex에서 배포 asset discovery를 dogfood하고 실제 invocation syntax를 확인한다.
- [ ] Gemini CLI가 없으면 contract test 결과와 `skipped`를 기록하고 live E2E green이라고 쓰지 않는다.
- [ ] 가용하면 격리 critic이, 불가하면 명시적 main-session adversarial fallback이 FR/AC traceability,
      ownership/prune, runtime fact freshness, user asset safety를 review한다. 명백한 defect를 모아 수정하고
      clean까지 재검하며 실제 독립성 상태를 기록한다.
- [ ] clean이면 goal/spec/plan의 모든 검증 항목에 `[x]`와 구체 evidence를 기록한다.
- [ ] runtime-attested `sdd-implement 044` 또는 fresh-confirmed execution grant로 시작한 경우 clean completion
      때 관련 파일만 commit/push하고 전체 SHA로 CI를 감시한다. 일반 자연어 위임이면 별도 explicit
      commit/push 지시가 없는 한 uncommitted로 둔다.

## Test Strategy

| AC | Exact test case ID | Level and assertion | Status |
|---|---|---|---|
| AC-1 | `skills-contract: AC-1` | unit: schema/resource/manifest binding/mode/symlink table | [ ] |
| AC-2 | `skills-seed: AC-2` | integration: exact production catalog + injected fourth + idempotence | [ ] |
| AC-3 | `skills-seed: AC-3` | integration: legacy update + general/reserved markerless fork preservation and exposure block | [ ] |
| AC-4 | `skills-deploy-claude: AC-4` | integration: rendered policy, recursive payload, injected fourth, idempotence | [ ] |
| AC-5 | `skills-deploy-shared: AC-5` | integration: Codex policy, fingerprint, fourth, reserved fork, repo collision resolution | [ ] |
| AC-6 | `commands-gemini: AC-6` | unit/integration: generated body/hash, fourth, reserved fork, workspace precedence | [ ] |
| AC-7 | `workflow-invocation: AC-7` | unit: invocation/provenance/resolution/status/outcome summary | [ ] |
| AC-8 | `workflow-neutrality: AC-8` | unit/privacy: packaged behavior token scan | [ ] |
| AC-9 | `goal-ready-contract: AC-9` | decision/characterization: intent negatives + goal-ready/SSoT/feedback matrix | [ ] |
| AC-10 | `sdd-implement-contract: AC-10` | policy/characterization: provenance/confirmation/adversarial args + enforcement-level honesty | [ ] |
| AC-11 | `self-review-contract: AC-11` | recorder/characterization: activation, report-only, cross available/unavailable, fallback | [ ] |
| AC-12 | `workflow-ownership: AC-12` | integration: source boundary, root and item symlink/collision protection | [ ] |
| AC-13 | `workflow-swap-recovery: AC-13` | fault injection: runtime directory swap/recovery | [ ] |
| AC-14 | `workflow-prune-guard: AC-14` | integration: invalid source, catalog prune suppression, wrapper safety retirement, exit 1 | [ ] |
| AC-15 | `workflow-missing-target: AC-15` | integration: absent runtimes, shared success, partial/0 | [ ] |
| AC-16 | `scaffold-runtime-bridges: AC-16` | unit/integration: root/scaffold bridge protection | [ ] |
| AC-17 | `workflow-lifecycle: AC-17` | shell E2E: backup/restore/recover/update/device-sync | [ ] |
| AC-18 | `workflow-boundary: AC-18` | full regression/privacy/fact provenance | [ ] |
| AC-19 | `execution-policy-neutrality: AC-19` | contract: abstract tier and no-selection fallback | [ ] |
| AC-20 | `managed-write-recovery: AC-20` | fault injection: seed and command file recovery | [ ] |
| AC-21 | `workflow-doc-contract: AC-21` | contract: docs/help/env/result semantics | [ ] |

## Rollout and Migration

1. marked package templates, safe seed, and multi-target deploy support are released in the same change so no new
   workflow is exposed without its reconciler.
2. root/scaffold SDD command docs move from `/goal {NNN}` to `sdd-implement {NNN}` in the same release. No
   LocalMind `goal` skill/wrapper is generated; Claude built-in `/goal` remains untouched.
3. first `skills:deploy` validates templates, recovers orphan state, safely updates legacy managed data sources, then
   deploys targets and manifest-derived invocation-control metadata.
4. existing markerless data forks remain unchanged. Non-reserved custom names can receive a managed generated target;
   a non-equivalent fork using a packaged reserved ID is not deployed and its managed runtime entrypoints are retired.
5. existing Claude managed directories are updated through a same-parent staged swap with rollback/recovery.
6. `.agents/skills` is created on explicit deploy. This is a shared standard target, not evidence that a specific
   runtime is installed.
7. Gemini command wrappers are generated only if `.gemini` exists or override is supplied and the canonical packaged
   source is equivalent/self-contained. After later install, the user reruns `make skills-deploy`. User-level install
   does not certify arbitrary workspace precedence; resolution evidence and fresh instruction-level confirmation remain
   active.
8. rollback is code rollback + deploy. Names removed from rolled-back source are pruned only when marker-bound and
   source validation is clean.
9. recover/update/device-sync reuse `skills:deploy`; they do not copy generated targets through backup mirrors.

## Stop Conditions

- current official runtime contract no longer supports a path or invocation assumed by spec
- Claude/Codex deny-implicit metadata가 공식 contract와 다르거나 target에서 검증되지 않음
- provenance 없는 runtime의 confirmation을 기술적 zero-tool-call enforcement로 표현해야만 완료할 수 있음
- Gemini wrapper를 canonical body에서 결정적으로 생성할 수 없거나 workspace shadowing을 감지하지 못하면서
  native wrapper behavior parity를 주장해야 함
- Codex repo same-ID collision을 감지하지 못하면서 user skill parity를 주장해야 함
- reserved packaged ID fork를 source 보존과 runtime exposure 차단 둘 다 만족하며 처리할 수 없음
- canonical behavior requires a provider-only capability with no main-session fallback
- safe same-parent target swap/recovery cannot be implemented without deleting or overwriting an unmanaged target
- Gemini command TOML cannot be rendered/validated deterministically without a new dependency
- existing marker semantics cannot distinguish managed/unmanaged legacy artifacts without risking deletion
- implementation would require modifying gateway/backend/search behavior or staging/reverting user-owned unrelated
  changes
- AGENTS.md and `sdd-implement` workflow contract disagree on completion semantics

## Definition of Done

- 모든 FR이 Traceability Matrix의 하나 이상 passing AC/test case에 연결된다.
- 세 packaged workflows가 표준/neutrality 검증을 통과한다.
- Claude/shared/Gemini command target의 success, absence, collision, prune, injected failure가 검증된다.
- logical invocation matrix가 실제 공식 계약과 일치하며 unsupported parity를 주장하지 않는다.
- reserved-ID fork는 source가 보존되고 runtime entrypoint가 fail-closed이며 Codex/Gemini workspace ambiguity를
  설치 성공과 구분한다.
- root/scaffold/lifecycle에서 neutral AGENTS.md SSoT와 asset regeneration이 검증된다.
- full regression green, privacy scan green, adversarial self-review 치명/중대 0이며 실제 독립성/fallback 상태가
  기록된다.
- Gemini live E2E 미실행 상태는 명시되고 자동 contract test를 live green으로 부르지 않는다.
