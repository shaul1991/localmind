# Implementation Handoff: 044 공급자 중립 AI 워크플로 자산

아래 프롬프트 전문을 구현 모델에게 그대로 전달한다.

---

당신은 localmind 저장소의 044 구현 담당자다. 목표는 파일을 세 군데 복사하는 것이 아니라,
localmind가 소유한 AI workflow와 logical command를 하나의 provider/model-neutral 정본에서
Claude Code, Codex, Gemini CLI에 안전하게 배포하는 것이다.

작업 전 다음 문서를 순서대로 모두 읽어라.

1. 저장소 root `AGENTS.md`
2. `specs/044-provider-neutral-workflow-assets/goal.md`
3. `specs/044-provider-neutral-workflow-assets/spec.md`
4. `specs/044-provider-neutral-workflow-assets/plan.md`
5. 선행 계약 `specs/007-sdd-scaffold/`, `specs/016-persona-agent-registry/`,
   `specs/018-sdd-self-review-orchestration/`,
   `specs/019-device-local-asset-sync/`, `specs/026-design-persona-registry/`,
   `specs/031-device-sync-pipeline/`, `specs/033-local-update/`

## Working Method

- TDD를 지켜라. AC별 failing test를 먼저 만들고 최소 구현, refactor, full regression 순으로 진행한다.
- 시작 전에 current official docs를 live 조회하라. 이 handoff의 path나 invocation을 기억으로 확정하지
  마라. 변했으면 코드를 억지로 맞추지 말고 spec amendment/Open question을 먼저 제시한다.
- canonical workflow 작성과 implementation을 분리하라. SKILL.md 행동은 role/capability로 쓰고 runtime
  path, TOML, invocation syntax는 adapter에서만 다룬다.
- 기존 사용자 `Makefile` hunk, untracked audit 문서, specs/041~043을 수정/revert/stage/commit하지 마라.
  Makefile은 현재 내용을 다시 읽은 뒤 `skills-deploy` help 한 줄만 별도 044 hunk로 교정할 수 있으며,
  commit에는 기존 사용자 hunk가 섞이지 않게 검증하라.
- 실제 홈 디렉터리 asset은 migration dogfood 전까지 read-only로 보고, 모든 자동 테스트는 temp root와
  injected path를 사용한다.
- 구현 후 가용하면 별도 critic context로 적대적 self-review를 수행한다. 불가하면 main-session fallback을
  `not-independent`로 밝히고 같은 checklist로 clean까지 수정/재검한다.

## Non-negotiable Product Decisions

1. 공통 정본은 Agent Skills 표준 `SKILL.md`다.
2. 초기 localmind workflow catalog는 정확히 `sdd-implement`, `goal-ready`, `sdd-self-review`다.
3. behavior와 logical ID는 같지만 native invocation token은 runtime 공식 문법을 따른다.
   - Claude Code: `/name`
   - Codex: `$name`
   - Gemini CLI: Agent Skill auto match 후 workflow activation policy 적용, 생성 TOML이 있으면 `/name`
4. Codex deprecated custom prompt와 `/prompts:name`은 새 adapter로 쓰지 않는다.
5. Claude target은 `~/.claude/skills`, Codex+Gemini 공용 target은 `~/.agents/skills`다.
   `~/.codex/skills`를 새 localmind user target으로 사용하지 않는다.
6. Gemini native command wrapper는 `~/.gemini/commands/<name>.toml`에 생성한다.
7. canonical SKILL.md는 provider 이름, concrete model/alias, runtime tool name, runtime argument placeholder에
   의존하지 않는다.
8. `AGENTS.md`가 SDD 구현 완료 규칙의 SSoT다. `sdd-implement` skill은 읽고 조율할 뿐 복제 정본이
   아니다.
9. third-party/user assets는 import, overwrite, prune하지 않는다.
10. Antigravity CLI는 이번 완료 범위가 아니다.
11. user custom canonical skill은 skill target에 배포할 수 있지만 native command wrapper로 자동 승격하지
    않는다. native wrapper catalog는 localmind packaged workflows다.
12. root `AGENTS.md`의 mandatory 역할 배치는 concrete model name이 아니라
    `critical-reasoning | standard | economy`와 capability/fallback으로 표현한다.
13. Claude built-in `/goal`은 LocalMind SDD workflow로 shadow하지 않는다. 기존 SDD logical ID를
    `sdd-implement`로 이관하고 세 runtime에서 그 이름을 사용한다.
14. activation policy는 command contract다. `goal-ready`는 명시 호출 또는 분명한 문서 준비 의도,
    `sdd-self-review`는 명시 호출 또는 authorized `sdd-implement`의 current-turn 위임을 허용한다.
    `sdd-implement`는 runtime-attested explicit activation + exact 3자리 NNN 또는 provenance 없는 runtime의
    fresh confirmation handshake 뒤에만 실행한다. prompt/generated request 문자열 자체는 권한 증거가 아니다.
15. "모든 command"는 모든 LocalMind-owned packaged AI workflow command를 뜻한다. Make/npm/MCP/install,
    runtime built-in, user/third-party command는 통합하거나 prune하지 않는다.
16. packaged activation/side-effect policy는 `templates/skills/catalog.json` manifest로 선언한다. renderer는
    skill 이름을 hard-code하지 않고 manifest-directory 1:1 binding을 따른다.
17. Gemini user wrapper 설치와 Codex user skill 설치는 arbitrary workspace resolution 보장이 아니다.
    current-workspace command/skill collision을 resolution evidence로 보고하고 shadow/ambiguity를 parity success로
    부르지 않는다.
18. packaged catalog의 세 logical ID는 예약 이름이다. non-equivalent markerless fork source는 보존하되 어느
    runtime에도 배포하지 않고 name-bound managed entrypoint만 retire한다. custom behavior는 rename해야 한다.
19. Claude/Codex deny-implicit metadata는 runtime-enforced지만 Gemini fresh confirmation은 instruction-level
    guard다. 정적 recorder나 prompt test를 실제 model tool-call 0회 증명이라고 보고하지 않는다.
20. runtime-attested exact-NNN과 fresh exact confirmation은 동일한 execution grant다. 두 branch의 completion은
    같은 AGENTS 규칙을 따르며 일반 자연어 위임은 자동 commit/push 권한이 아니다.

## Live-Verify Sources

구현 시점 current content를 직접 확인하라.

- Agent Skills specification: https://agentskills.io/specification
- Claude Code skills: https://code.claude.com/docs/en/skills
- Claude Code built-in `/goal`: https://code.claude.com/docs/en/goal
- Claude Code commands: https://code.claude.com/docs/en/commands
- Codex skills: https://developers.openai.com/codex/skills
- Codex deprecated custom prompts: https://developers.openai.com/codex/custom-prompts
- Gemini CLI skills: https://geminicli.com/docs/cli/skills/
- Gemini CLI custom commands: https://geminicli.com/docs/cli/custom-commands/
- Gemini CLI built-in commands: https://geminicli.com/docs/reference/commands/
- Gemini CLI GEMINI.md context: https://geminicli.com/docs/cli/gemini-md/
- YAML parser: https://eemeli.org/yaml/
- Gemini CLI transition notice:
  https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/

검증일과 확인한 path/schema/invocation을 docs 또는 self-review evidence에 남겨라. Gemini CLI는 현재 기기에
없으므로 contract test와 live E2E를 구분하라. Claude installed version에서 `/goal`이 built-in인지 확인하고
LocalMind `goal` skill을 생성하지 마라.

## Required Architecture

### Canonical layer

- `templates/skills/{sdd-implement,goal-ready,sdd-self-review}/`가 packaged seeds다.
- `templates/skills/catalog.json`이 logical ID별 activation/side-effect class를 선언하며 production ID 집합은
  세 skill directory와 정확히 일치한다. injected fourth fixture도 code name list 변경 없이 처리한다.
- packaged SKILL.md마다 name-bound managed marker가 있어 clean seed와 후속 managed update를 구분한다.
- data source는 기존 `LOCALMIND_SKILLS_DIR` 또는 첫 NOTES_DIR의 `skills/`다.
- `skill-contract` 모듈이 name, description, directory/manifest binding, body, regular resource traversal,
  canonical payload fingerprint를 validation한다.
- YAML frontmatter는 ad-hoc regex로 파싱하지 말고 current license/Node support를 재확인한 `yaml` package의
  YAML 1.2 document parser + zod를 사용한다. 64 KiB limit, alias/custom tag rejection을 포함한다.
- localmind packaged workflow만 neutrality policy를 강제한다. 사용자 custom skill이 특정 provider를
  위한 것까지 검열하지 마라.
- packaged frontmatter는 exact `name`/`description`만 허용하고 compatibility/allowed-tools/model metadata를
  넣지 않는다. description/body/UTF-8 text resources를 neutrality scan한다.

### Adapter layer

- Claude skill target
- shared Agent Skills target
- Gemini command target

Target adapter는 workflow 내용을 별도 정본으로 소유하지 않는다. Gemini wrapper는 runtime이 찾은 동명
Agent Skill이나 self-asserted fingerprint를 신뢰하지 않고 verified canonical body와 필수 UTF-8 text reference를
generated prompt에 결정적으로 inline한다. managed/source-hash comment, exact logical-id/raw-args, workflow
boundary 순서로 렌더한다. prompt 전체는 quote/backslash/control/LF를 escape하고 invalid Unicode scalar를
거부하는 TOML basic-string encoder 하나로 작성하며 multiline delimiter에 의존하지 않는다. `{{args}}`는
generated workflow 밖에 한 번 전달하고 inline body/reference의 `{{args}}`, `!{...}`, `@{...}`는 validation
error다. request/hash는 authorization 또는 runtime attestation이 아니다. active managed data source가
package-equivalent이고 wrapper
self-containment를 만족할 때 생성/갱신한다. markerless/non-equivalent reserved-ID fork나 invalid source이면
name-bound managed wrapper를 fail-closed `pruned`하고 unmanaged wrapper는 보존한다. shared target 실패는
wrapper 생성과 분리하고 auto-skill availability에만 반영한다.

- Claude `sdd-implement` target에는 `disable-model-invocation: true`를 generated frontmatter로 추가한다.
- shared `sdd-implement` target에는 `agents/openai.yaml`의 `policy.allow_implicit_invocation: false`를 생성한다.
- canonical/data SKILL.md는 provider metadata 없이 유지한다. normalized payload hash와 target-specific policy
  exact validation을 분리한다.
- injected current workspace에서 Codex repo same-ID skill과 Gemini workspace command/skill을 CWD부터 repo
  root까지 검사해 `resolved|equivalent-shadow|ambiguous-shadow|unmanaged-shadow|unverified`로 별도 보고한다.
  source hash는 감사 정보일 뿐 runtime path attestation에 쓰지 않는다.

Item status는 `created`, `updated`, `unchanged`, `pruned`, `recovered`, `skipped-unmanaged`,
`skipped-unavailable`, `skipped-dependency`, `problem`; aggregate는 `success`, `partial`, `failed`로 고정한다.
source/filesystem/recovery problem은 `failed`/exit 1, 정상 absence/unmanaged/dependency skip만 있으면
`partial`/exit 0이다. reserved-ID fork에 retire할 managed target이 없으면 target별
`skipped-dependency`/`reserved-id-fork`, retirement가 하나라도 있으면 aggregate 최소 `partial`이다.

### Reconciliation layer

- `src/agents/reconcile.ts`의 작은 공통 primitive가 directory/file의 `lstat` ownership, same-parent staged
  swap, backup rollback, orphan recovery, marker-bound prune를 소유한다.
- prune/retirement는 marker 확인 후 hidden `.localmind-retired-...`로 먼저 rename하고 삭제해 cleanup
  failure가 stale runtime command를 active name에 남기지 않게 한다.
- skills/commands는 이 primitive를 호출하고 자체 복사-삭제 구현을 중복하지 않는다.
- fault injection은 filesystem operation seam만 주입하며 production과 같은 control flow를 검증한다.

### Activation layer

- `workflow-policy.ts`는 manifest activation/side-effect policy를 Claude/Codex runtime metadata와
  canonical/Gemini instruction으로 렌더하고 `runtime-enforced | instruction-level | not-applicable`을 보고한다.
- raw args 전체가 `^[0-9]{3}$`일 때만 execution-grant syntax가 valid다. spec directory 존재는 grant 뒤 read
  단계에서 별도로 확인한다. quote, negation, explain/review-only, extra/multiple args, stale/replayed challenge는
  grant하지 않는다.
- provenance 없는 runtime은 first turn에 side effect를 금지하고 challenge만 발급하도록 instruction한다.
  다음 user turn의 exact fresh response만 execution grant다. runtime hook이 없으므로 이 TypeScript renderer가
  실제 invocation path에서 선행 실행된다고 가장하지 않는다.
- AC-9~11 tests는 exact generated metadata/text와 enforcement-level reporting을 검증한다. installed runtime
  dogfood만 model behavior evidence이고 Gemini CLI 부재 시 pre-confirmation behavior는 `skipped/not-proven`이다.

### Lifecycle layer

- `skills:deploy` 한 번이 seed, validation, 모든 target deploy와 summary를 수행한다.
- backup에는 canonical source만 포함한다.
- restore/recover/update/device-sync는 generated targets를 다시 만든다.
- target별 status와 unavailable reason을 따로 기록한다.

## Canonical Workflow Content

### `goal-ready`

현재 data-only skill을 그대로 복사하지 마라. 다음 순서로 다시 써라.

1. explicit/clear document-preparation intent를 확인한다. quoted/negated/explain/review-only/ambiguous match면
   tool/file mutation 없이 확인 질문만 하고 중단한다.
2. repo SDD rules, existing specs, prior relevant knowledge를 읽는다.
3. time-sensitive fact를 분류하고 필요한 live official verification을 문서 초안 전에 수행한다.
4. open-ended decision space는 interviewer role로 설계하고 main session이 사용자에게 묻는다.
5. tradeoff 결정을 받으면 repo decision-log 계약을 읽고 available durable knowledge-capture capability로
   질문/선택지/선택/근거/spec pointer를 기록한다. capability가 없으면 docs/report에 근거와 미수행 사유를
   남기며 concrete tool 이름을 workflow dependency로 만들지 않는다.
6. 실제 max spec number + 1로 goal/spec/plan을 작성한다.
7. UI scope이면 design gate를 포함한다.
8. context map, ubiquitous language, constitution, ADR 같은 project SSoT가 실제로 있을 때만 정합성을
   검사하고, 없는 문서를 필수라고 추측하지 않는다.
9. architect/researcher/designer role은 named agent가 아니라 task prompt와 expected output으로 위임할 수
   있어야 한다.
10. critic이 traceability, testability, edges, facts, SSoT, Non-goals/Constraints/OQ를 검토한다. 격리
   reviewer가 없으면 main session fallback을 사용하고 independent라고 부르지 않는다.
11. 결함 수정 후 재검한다.
12. 문서, 결정, OQ, role/fallback과 현재 runtime의 truthful `sdd-implement` invocation을 보고하고 사용자
    확인을 명시적으로 요청한다. 수정 요청이면 반영 -> critic 재검 -> 재확인을 반복한다.
13. 확인 전 implementation 금지. 문서 준비는 사용자 요청 없이 commit/push하지 않는다.

`Agent`, `AskUserQuestion`, `capture_note`, `search_notes`, provider/model 이름을 command dependency로 쓰지
마라. 같은 의미를 capability와 outcome으로 표현한다.

### `sdd-implement`

- 첫 동작으로 activation contract를 적용하라. runtime-attested explicit activation + raw args 전체가 실제
  3자리 spec 번호이면 execution grant다. prompt command 문자열과 generated request는 provenance가 아니다.
- provenance가 없으면 side-effecting workflow action 없이 fresh one-time challenge를 발급해 중단한다. 다음
  user turn의 exact challenge+NNN만 grant하며 quote/negation/explain-only, extra/multiple args,
  stale/replayed/mismatched challenge는 거부한다. Gemini에서는 이것이 instruction-level guard임을 숨기지 마라.
- 항상 repo AGENTS.md부터 읽는다.
- goal/spec/plan 셋 중 하나라도 없으면 구현 전에 중단한다.
- TDD, surgical change, mandatory adversarial self-review, evidence check, clean completion은 AGENTS 규칙을
  따르고 실제 isolation/fallback 상태를 보고한다.
- attested branch와 fresh-confirmed branch는 같은 execution grant이므로 완료 후 같은 AGENTS commit/push/CI
  규칙을 따른다. 일반 자연어 구현 요청은 이 자동 side-effect 권한을 만들지 않는다.
- durable goal primitive가 없는 runtime에서도 같은 workflow가 가능해야 한다.
- missing docs, dirty unrelated files, environment-limited tests의 정직한 reporting을 포함한다.

### `sdd-self-review`

- explicit invocation 또는 authorized `sdd-implement` current-turn delegation만 허용한다. standalone
  implicit/quoted/negated match는 중단하고 모든 경로에서 file/subprocess/network mutation은 0회다.
- adversarial critic review가 mandatory minimum이다. isolated context가 가용하면 반드시 우선하고, 없으면
  main-session fallback을 `not-independent`로 보고한다.
- additional independent/cross-runtime review는 available하면 실행하지만 특정 provider 또는 model을
  필수로 하지 않는다. available positive branch와 unavailable skip branch를 모두 검증한다.
- 실제 independence status를 `isolated-context`, `cross-runtime`, `main-session-fallback`으로 보고한다.
- cross review가 없는데 있었다고 쓰지 않는다.
- finding report까지만 소유하고 수정/retest/re-review는 `sdd-implement` workflow에 넘긴다.
- canonical body에는 concrete `localmind-review` 이름을 넣지 않는다. 기존 binary는 삭제하지 말고
  adapter/reference layer의 optional evidence transport로만 취급한다.

## Provider-Neutral Execution Policy

- root `AGENTS.md`의 Opus/Sonnet/Haiku/Fable mandatory table을 abstract tier로 치환한다.
- architecture/spec/complex logic/final critic은 `critical-reasoning`, routine implementation/test는
  `standard`, 저위험 기계 작업만 `economy`다.
- runtime이 model/tier selection을 제공하지 않으면 현재 session이 같은 role checklist를 수행하고
  fallback을 보고한다. concrete model 부재만으로 workflow를 중단하지 않는다.
- root/scaffold의 mandatory `Agent`, `AskUserQuestion`, `WebFetch`, `WebSearch`, `context7` 같은 runtime
  전용 identifier도 role/capability/outcome으로 치환한다. project-owned portable MCP operation은 adapter
  mapping으로 남길 수 있지만 특정 client tool label을 필수조건으로 삼지 않는다.
- 기존 SDD/TDD, final review, evidence, commit/push/CI gate는 약화하지 않는다.
- gateway default model과 persona registry schema는 변경하지 않는다.

## Safety and Ownership

- name-bound managed marker가 맞는 target만 update/prune한다.
- canonical source root symlink는 resolved real directory를 고정 traversal boundary로 사용할 수 있다.
  Generated target root와 immediate runtime parent symlink/dangling/non-directory는 target-level `problem`이다;
  override에는 resolved real path를 요구하고 mutation 직전 root identity를 재확인한다.
- target 동명 asset은 `lstat`하고 marker가 없거나 file/dir type이 다르거나 symlink/special이면 따라가지
  않고 `skipped-unmanaged`로 보존한다.
- 예약되지 않은 markerless user-authored source는 배포 가능하고 generated target SKILL.md에는 managed marker를
  결정적으로 삽입한다. packaged reserved ID의 non-equivalent fork는 source bytes를 보존하되 runtime에
  배포하지 않는다. 해당 ID의 name-bound managed runtime artifact만 retire하고 unmanaged collision은 보존하며
  `reserved-id-fork`/rename guidance를 보고한다.
- invalid source가 하나라도 있으면 source absence 기반 catalog prune을 모든 target에서 보류한다. 단,
  invalid source/reserved-ID fork가 오래된 workflow를 실행할 수 있는 name-bound managed runtime entrypoint는
  fail-closed retire하고 결과 사유를 함께 보고한다.
- managed canonical seed와 runtime directory update는 same-parent stage 완성 -> managed target을 backup
  sibling으로 rename -> stage를
  target으로 rename -> 성공 후 backup 정리 순서다. 두 번째 rename 실패 시 backup을 원위치로 복구하고,
  다음 deploy는 name-bound marker가 확인된 고아 stage/backup만 결정적으로 복구/정리한다. 상태가
  모호하면 삭제하지 않고 problem으로 보고한다.
- Gemini managed TOML도 complete same-parent temp file + backup swap을 사용하고 write/swap 실패 시 old를
  복구한다. complete-new 배치 뒤 backup cleanup만 실패하면 new를 유지하고 다음 deploy가 old backup을
  정리한다.
- symlink나 source root 밖 path를 따라가지 않는다.
- target 하나의 실패가 다른 target의 성공을 rollback하거나 막지 않는다.
- third-party plugin cache, system skills, extensions를 scan/prune하지 않는다.
- Codex repo same-ID skill과 Gemini workspace command/skill은 user asset resolution을 바꿀 수 있다. current
  workspace collision은 read-only resolution evidence로 보고하고 unmanaged asset을 수정하지 않으며, 미래
  workspace까지 parity를 약속하지 않는다.

## Exact Target Behavior

### Claude target

- default `${HOME}/.claude/skills`
- parent `.claude`가 없고 override도 없으면 `skipped-unavailable`
- recursive resources preserved
- manifest `explicit` workflow에는 generated `disable-model-invocation: true`; canonical/data frontmatter는 불변

### Shared Agent Skills target

- default `${HOME}/.agents/skills`
- explicit deploy에서 생성 가능
- Codex와 Gemini CLI가 함께 소비
- manifest `explicit` workflow에는 generated `agents/openai.yaml` deny-implicit policy와 payload fingerprint
- source와 Claude target의 normalized canonical workflow hashes와 executable bits가 같아야 하며
  target-specific metadata는 exact 별도 검증

### Gemini command target

- default `${HOME}/.gemini/commands`
- `.gemini` parent 없고 override 없으면 `skipped-unavailable`
- packaged logical ID당 TOML 하나; user custom skill은 wrapper 없음
- packaged description의 CR/LF/tab/연속 whitespace를 ASCII space 하나로 접어 single-line로 만든 뒤
  description/name/backslash/quote를 safe escaping
- exact managed/source-hash comment + logical-id/raw-args + canonical body/text-reference boundaries; one safe TOML
  basic-string encoder; `{{args}}` exactly once outside generated workflow; reject inline `!{...}`/`@{...}`;
  request/hash is not auth or runtime attestation
- shared skill lookup 없이 verified canonical body에서 생성; shared target failure는 auto-skill status로 분리
- Codex/Gemini workspace command/skill resolution을 installation result와 분리
- marker-bound update/prune, unmanaged collision protection
- wrapper가 Gemini CLI의 Agent Skill activation consent를 우회한다고 문서화하지 않음

## Context Bridge

- root `AGENTS.md`의 `/goal {NNN}` 규약을 `sdd-implement {NNN}`로 이관하고 concrete model allocation을
  neutral execution policy로 갱신한다.
- root `GEMINI.md`를 추가해 `@./AGENTS.md`를 import한다.
- `templates/sdd/CLAUDE.md`, `templates/sdd/GEMINI.md`를 추가한다.
- `scaffoldSdd()`는 AGENTS.md, CLAUDE.md, GEMINI.md, specs/를 각자 create-if-absent한다.
- 기존 context file은 어떤 내용이든 수정/병합/덮어쓰기 금지다.

## Mandatory TDD Sequence

1. AC-1: skill schema/resource/manifest-binding failure table.
2. AC-2, AC-3, AC-20(seed): exact production catalog + injected fourth, legacy managed update, general/reserved
   markerless fork preservation/exposure block, write/swap recovery.
3. AC-8, AC-9, AC-10, AC-11: packaged neutrality와 세 workflow activation/behavior characterization. AC-10에는
   attested/unattested, fresh confirmation, adversarial args, runtime-enforced/instruction-level 구분을 포함한다.
4. AC-4, AC-5: Claude/Codex deny-implicit policy, fingerprint, injected fourth, reserved fork, Codex repo collision,
   recursive payload/idempotence.
5. AC-12, AC-13, AC-14, AC-15: source boundary, root/item symlink와 unmanaged collision, prune, injected
   copy/swap/cleanup failure와 next-run recovery,
   exact exit,
   missing runtime.
6. AC-6, AC-7, AC-20(command): exact Gemini generated body/hash, Codex/Gemini workspace resolution, shared-target
   independence, safe file recovery, truthful invocation/resolution.
7. AC-16, AC-19: root/scaffold bridge protection와 neutral execution policy.
8. AC-17: temp backup -> restore/recover/update/device-sync E2E, including mirror-deferred recover.
9. AC-18: full regression, privacy, live fact evidence.
10. AC-21: docs/help/env/result semantics.

AC-21의 old-command scan은 historical `specs/`와 migration 설명을 제외하고 active `AGENTS.md`,
`templates/sdd/`, `templates/skills/`, `docs/`, relevant `src/` comments를 검사한다.

테스트는 실제 `$HOME`을 쓰지 않는다. path override와 temp dirs를 주입한다. fault injection seam은 최소로
두고 production path가 같은 code를 실행하게 하라.

## Regression Boundaries

다음을 변경하지 마라.

- backend router 또는 Claude/Codex/Gemini chat adapters
- localmind HTTP/OpenAI/Anthropic API behavior
- brain, search, index, capture, MCP note logic
- persona registry schema/rendering/runtime
- user/third-party plugin assets
- existing shell command names와 npm script names
- active user `Makefile` hunk (`skills-deploy` help 한 줄은 별도 044 hunk만 허용)
- specs/041~043 content

specs/007에는 historical check를 재작성하지 말고 044가 CLAUDE.md/GEMINI.md bridge를 item 단위
create-if-absent로 추가 확장한다는 짧은 포인터만 추가하라. specs/018에는 provider/model-specific
orchestration(FR-1/4), old `/goal` default trigger(FR-6), Claude-only fallback(FR-7), Claude-only copy(FR-8),
provider-specific docs(FR-10)의 superseded 범위를 적어라. structured transport/output(FR-2/3), report-only
ownership(FR-5), optional adapter toggle(FR-6)은 유지하고, backup/index/unmanaged·speckit invariants와 plain
docs(FR-8/9/10)는 044 FR-11/12/13이 흡수한다고 명시하라.
specs/019, 031, 033에는
각각 restore/recover, device-sync verification, update deploy의 multi-target additive extension 포인터만
추가하라.

## Required Verification

- AC-1~AC-21 targeted unit/integration/characterization/fault-injection/shell tests
- activation matrix와 policy renderer: deny-implicit metadata, fresh confirmation instruction, adversarial args,
  enforcement-level truthfulness
- injected fourth packaged workflow, reserved-ID fork, Codex/Gemini workspace resolution, generated body/hash tests
- `npm run typecheck`
- `npm run build`
- full `npm test`
- canonical skill neutrality scan
- fixture/privacy/absolute-path/secret scan
- installed Claude Code and Codex discovery dogfood where safe
- Gemini static contract test; local CLI absence를 skipped로 기록
- `git diff --check`
- adversarial self-review with truthful isolation/fallback status

Sandbox 때문에 socket/network test가 실패하면 green이라고 쓰지 말고 필요한 승인 실행으로 다시
검증한다. Gemini CLI를 검증 목적으로 무단 설치하지 않는다.

## Stop Conditions

다음이면 임의 구현을 중단하고 사용자에게 보고한다.

- 공식 current runtime contract가 spec path/invocation과 충돌한다.
- Codex bare `/name`을 제공해야만 AC를 만족한다고 해석하게 된다.
- Claude/Codex official deny-implicit metadata가 current runtime contract와 다르거나 rendered target에서
  검증되지 않는다.
- provenance 없는 runtime confirmation을 기술적 zero-tool-call enforcement라고 표현해야만 완료할 수 있다.
- Gemini wrapper를 canonical body에서 결정적으로 생성할 수 없거나 workspace shadowing을 감지하지 못하면서
  native wrapper parity를 주장해야 한다.
- Codex repo same-ID collision을 감지하지 못하면서 user skill parity를 주장해야 한다.
- reserved packaged ID fork의 source 보존과 runtime exposure 차단을 동시에 만족할 수 없다.
- provider-only capability를 canonical workflow의 필수조건으로 넣어야 한다.
- legacy ownership을 안전하게 판정할 수 없어 user asset 삭제 위험이 생긴다.
- new dependency 없이 Gemini TOML을 안전하게 만들 수 없다.
- current `yaml` package가 YAML 1.2/license/Node compatibility 검증을 통과하지 못한다.
- AGENTS.md와 `sdd-implement` skill의 완료 규칙이 충돌한다.
- neutral execution tier로 치환하려면 gateway default나 persona schema 변경이 필수가 된다.
- Gemini live E2E가 없다는 이유로 static test를 live success로 바꾸어야 한다.
- unrelated code/data를 바꿔야 테스트가 통과한다.

## Self-review and Completion

격리 reviewer가 가용하면 다음을 적대적으로 확인시켜라. 없으면 main session이 같은 checklist를 수행하고
`not-independent` fallback을 먼저 명시하라.

1. goal Objective/Success Metric -> FR -> AC -> test가 모두 연결되는가.
2. command catalog 세 항목이 clean install, update, restore에서 모두 재현되는가.
3. canonical workflow와 root mandatory execution policy에 provider/model/tool dependency가 숨어 있지 않은가.
4. unsupported native invocation을 문서나 summary가 약속하지 않는가.
5. side-effect workflow의 runtime-enforced guard와 instruction-level guard를 구분하고 unsupported zero-tool
   guarantee를 주장하지 않는가.
6. Codex/Gemini workspace collision과 user-level install을 behavior parity로 혼동하지 않는가.
7. marker/symlink collision, source invalid, prune, seed/target/command partial write/swap failure와 orphan
   recovery가 user asset을 지우지 않는가.
8. Gemini absent와 live verified를 혼동하지 않는가.
9. 최신 외부 contract가 T1으로 검증됐는가.
10. reserved-ID fork source는 보존되고 runtime-visible managed entrypoint만 fail-closed 되었는가.
11. user Makefile hunk와 041~043 작업을 건드리거나 commit에 섞지 않았는가.
12. FR/SM/AC/test traceability matrix가 AC-1~21 실제 test ID와 일치하는가.

명백한 defect를 수정하고 tests/review를 다시 수행하라. isolated reviewer가 없으면 main-session
fallback을 independent라고 쓰지 마라. clean이면 세 SDD 문서의 Success Metrics,
FR/AC, plan step/test status에 `[x]`와 실제 test evidence를 남긴다. caller가 runtime-attested
`sdd-implement 044` 또는 fresh-confirmed exact-044 execution grant를 제공한 경우에는 AGENTS clean completion
규칙에 따라 관련 파일을 stage/commit/push하고 commit message에 self-review 요약을 포함한다. 일반 자연어
위임에서는 별도 explicit commit/push 지시가 있어야만 같은 remote side effect를 수행한다. commit한 경우에만
전체 commit SHA로 CI run을 찾아 `gh run watch <run-id> --exit-status`로 감시한다. 이 handoff를 받은 현재
작업은 attested/fresh-confirmed grant가 아니므로 별도 지시가 없으면 clean uncommitted 상태로 보고한다.
clean이 아니면 blocking finding과 미충족 AC를 보고한다.

---
