# Spec: 공급자 중립 AI 워크플로 자산

## Status

Draft. 이 문서는 구현 계약이며 아직 구현 또는 검증 완료를 표시하지 않는다.

## Terminology

- **workflow**: AI runtime이 반복 수행하는 절차와 품질 gate. 이번 범위에서는 하나의 Agent Skill
  package로 표현한다.
- **canonical skill**: 데이터 폴더 `skills/<name>/`에 있는 행동 정본. `SKILL.md`와 선택적
  `scripts/`, `references/`, `assets/`를 포함한다.
- **packaged seed**: localmind 배포판 `templates/skills/<name>/`에 포함된 초기 workflow.
- **package-equivalent**: active data source 또는 generated target의 normalized file/resource content와
  executable bits가 current packaged seed와 같고 name-bound managed ownership도 확인된 상태. generated
  marker와 target-specific invocation-control metadata만 normalization에서 제외한다. 제외 항목 자체는
  target contract와 정확히 일치해야 하며 target idempotence/fingerprint 검증에서는 제외하지 않는다.
- **logical command ID**: runtime 문법과 무관한 workflow 이름. 이번 초기 catalog는 `sdd-implement`,
  `goal-ready`, `sdd-self-review`다.
- **behavior parity**: 같은 logical command가 같은 입력, 단계, stop condition, 산출물, 완료 조건을
  갖는 상태.
- **invocation parity**: 사용자가 입력하는 문자까지 같은 상태. 현재 세 runtime의 공식 계약상 보장하지
  않는다.
- **runtime adapter**: canonical skill을 runtime이 발견할 경로로 배포하거나 native command wrapper로
  렌더링하는 코드. 행동 정책을 소유하지 않는다.
- **activation policy**: workflow를 시작할 수 있는 사용자 의도와 side-effect 권한 계약. packaged
  `templates/skills/catalog.json`이 logical ID별 `intent | explicit | delegated-or-explicit`와
  `docs-only | mutating | report-only`를 선언하고 canonical body가 stop/fallback을 정의한다.
- **activation provenance**: runtime이 implicit model selection을 차단해 사용자 explicit invocation만
  skill을 load할 수 있었다는 증거. prompt 안의 문자열이나 generated envelope만으로는 provenance가 아니다.
- **generated command request**: native wrapper가 logical ID, raw arguments, canonical workflow body를
  결정적으로 전달하는 generated input. source hash는 감사용 comment이며 request 자체는 authorization
  증거나 runtime attestation이 아니다.
- **shared Agent Skills target**: Codex와 Gemini CLI가 함께 발견하는 사용자 경로
  `$HOME/.agents/skills/`.
- **native wrapper**: canonical workflow body에서 결정적으로 생성한 runtime command 산출물. 이번 범위에서는
  Gemini CLI TOML command만 해당한다.
- **role**: interviewer, architect, researcher, designer, critic 같은 업무 책임. 특정 model이나 runtime
  agent type이 아니다.
- **capability**: 사용자 질문, 파일 읽기, web live verification, 격리된 subagent, decision capture처럼
  workflow가 필요로 하는 기능의 의미 이름. 실제 tool 이름은 runtime이 결정한다.
- **managed artifact**: localmind의 이름 결합 marker가 있어 localmind가 갱신 또는 prune할 수 있는
  배포 산출물.
- **independent review**: 구현/작성 컨텍스트와 분리된 reviewer가 수행한 검토. 다른 provider 사용은
  추가 독립성 신호일 수 있으나 필수 정의가 아니다.
- **execution tier**: 특정 model 이름이 아니라 실패 파장과 작업 난이도로 고른 추상 실행 등급.
  이번 계약은 `critical-reasoning`, `standard`, `economy`를 사용하며 runtime은 가능한 capability에
  매핑하거나 fallback을 보고한다.

## Scope

이번 작업은 localmind가 소유한 AI workflow의 정의, seed, 배포, command exposure, project context
bridge, backup/restore/recover/update/device-sync 연결을 다룬다. 초기 workflow catalog는 다음 세 항목으로
고정한다.

| Logical ID | 목적 | 구현 여부 |
|---|---|---|
| `goal-ready` | 개방형 요구를 조사해 goal/spec/plan을 만들고 사용자 확인을 받음 | 문서만 작성, 제품 코드 구현 금지 |
| `sdd-implement` | 준비된 SDD를 TDD로 구현하고 self-review, 문서 체크, clean 완료 절차 수행 | 저장소 `AGENTS.md`가 최종 규칙 |
| `sdd-self-review` | 구현 결과를 적대적으로 review하고 실제 독립성 상태와 함께 완료 가능 여부 판정 | 수정 loop는 `sdd-implement`가 소유 |

localmind 소유 shell command, Make target, MCP tool, 각 runtime의 built-in slash command는 이 catalog에
포함하지 않는다.

초기 packaged catalog는 위 세 항목으로 정확히 고정하지만 배포기는 이름을 hard-code하지 않고 검증된
`templates/skills/catalog.json`과 `templates/skills/*`의 1:1 binding을 순회한다. 후속 localmind packaged
workflow는 manifest entry와 skill directory를 함께 추가하면 같은 adapter/안전 계약을 적용받는다.
사용자 custom canonical skill은 skill target에 배포할 수 있지만 localmind native command catalog에는
자동 편입하지 않는다.

## Current Context

- 데이터 정본에는 `goal-ready`, `sdd-self-review` 두 skill이 있고 Claude Code 배포본과 byte-level로
  같다.
- 패키지 `templates/skills/`에는 `sdd-self-review`만 있어 `goal-ready`는 clean install에서 seed되지
  않는다.
- `src/agents/skills.ts`와 `scripts/skills-deploy.ts`는 Claude Code target 하나만 지원한다.
- localmind 소유 `commands/` 또는 `prompts/` 정본은 없다.
- `/goal`은 기존 `AGENTS.md`의 SDD 규약이고 별도 skill package가 아니며, Claude Code의 built-in
  session goal command와 충돌한다.
- root `CLAUDE.md`는 `AGENTS.md`를 import하지만 `GEMINI.md`는 없다.
- root `AGENTS.md`의 모델 역할 배치는 concrete Claude model 이름과 tool 예시를 필수 규칙처럼 사용한다.
- 현재 기기에는 Claude Code `2.1.197`, Codex CLI `0.144.1`이 있고 Gemini CLI는 설치되어 있지
  않다. 이 정보는 구현 기본값이 아니라 live verification 상태다.

## Live-Verified Runtime Contracts

아래 사실은 2026-07-11에 공식 문서로 재확인했다. 구현 시점에 다시 확인한다.

| Contract | 확인된 사실 | T1 source |
|---|---|---|
| Agent Skills | `SKILL.md`의 `name`, `description`이 필수이며 name은 디렉터리명과 일치. scripts/references/assets 선택 | https://agentskills.io/specification |
| Claude Code skills | personal `~/.claude/skills/<name>/SKILL.md`, project `.claude/skills/...`; `/name` 또는 자동 활성화; `disable-model-invocation: true`로 explicit-only 가능; placeholder가 없어도 invocation args를 `ARGUMENTS:`로 append. legacy commands는 skill로 통합됨 | https://code.claude.com/docs/en/skills |
| Claude Code built-in goal | `/goal`은 v2.1.139+의 session completion condition command | https://code.claude.com/docs/en/goal |
| Claude Code command catalog | built-in/bundled/custom command surface와 current names | https://code.claude.com/docs/en/commands |
| Codex skills | user `$HOME/.agents/skills`, repo `.agents/skills`; `$name` 또는 implicit activation; `agents/openai.yaml`의 `policy.allow_implicit_invocation: false` 지원 | https://developers.openai.com/codex/skills |
| Codex prompts | `~/.codex/prompts/*.md`와 `/prompts:name`은 deprecated, skills 권장. bare `/name` 등록 계약 없음 | https://developers.openai.com/codex/custom-prompts |
| Gemini CLI skills | user `~/.gemini/skills` 또는 `~/.agents/skills`; description match 후 activation과 consent; workspace가 user보다 우선하고 same tier에서는 `.agents` alias 우선 | https://geminicli.com/docs/cli/skills/ |
| Gemini CLI commands | `~/.gemini/commands/**/*.toml`; `prompt` 필수, `description` 선택, `{{args}}`, `/name` | https://geminicli.com/docs/cli/custom-commands/ |
| Gemini CLI built-ins | current slash command catalog | https://geminicli.com/docs/reference/commands/ |
| Gemini CLI context | root `GEMINI.md`와 `@file.md` import 지원; `context.fileName`으로 AGENTS.md도 설정 가능 | https://geminicli.com/docs/cli/gemini-md/ |
| Gemini CLI lifecycle | consumer free/Pro/Ultra serving은 2026-06-18 종료. Standard/Enterprise 및 paid API key는 계속 지원 | https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/ |
| YAML parser | `yaml`은 YAML 1.2 기반 parser와 document API를 제공 | https://eemeli.org/yaml/ |

이번 계약은 runtime별 symlink 지원 여부에 의존하지 않고 기존 managed copy 방식을 유지한다.

## Canonical Skill Contract

각 canonical skill은 아래 구조를 따른다.

```text
skills/<name>/
  SKILL.md
  scripts/       # optional
  references/    # optional
  assets/        # optional
```

Packaged seed root에는 adapter/activation manifest가 하나 있다.

```json
{
  "schemaVersion": 1,
  "workflows": {
    "goal-ready": { "activation": "intent", "sideEffects": "docs-only" },
    "sdd-implement": { "activation": "explicit", "sideEffects": "mutating" },
    "sdd-self-review": { "activation": "delegated-or-explicit", "sideEffects": "report-only" }
  }
}
```

Manifest logical ID 집합과 packaged skill directory 집합은 정확히 같아야 한다. unknown key/value,
duplicate/missing entry, directory mismatch는 package 전체 `problem`이며 seed/deploy 전에 중단한다. 이
manifest는 runtime adapter policy의 정본이고 workflow 단계의 정본은 계속 각 `SKILL.md` body다.

`SKILL.md` frontmatter 최소 계약:

```yaml
---
name: <directory-name>
description: <what and when, 1..1024 chars>
---
```

Frontmatter는 `yaml` parser의 YAML 1.2 core schema로 읽고 zod로 root mapping, string `name`, string
`description`을 검증한다. 64 KiB를 넘는 frontmatter와 alias/custom tag는 이번 최소 contract에서
거부한다. unknown standard fields는 원문을 보존하되 localmind가 의미를 추측하거나 재렌더하지 않는다.

모든 canonical skill에 적용하는 표준/안전 검증 규칙:

1. name은 1~64자의 lowercase ASCII, number, hyphen만 허용하고 시작/끝 hyphen, 연속 hyphen을
   거부한다.
2. name은 parent directory 이름과 같아야 한다.
3. description은 비어 있지 않고 1024자 이하다.
4. frontmatter가 닫히고 Markdown body가 비어 있지 않아야 한다.
5. symlink와 special file은 source traversal 대상이 아니다. regular file과 directory만 허용한다.
6. 사용자 custom skill의 provider-specific compatibility나 tool instruction은 허용하며 neutrality
   policy로 검열하지 않는다.

다음 행동 중립성 규칙은 localmind가 소유한 packaged catalog와 그 managed seed에만 추가 적용한다.

1. packaged `SKILL.md` frontmatter key는 `name`, `description`만 허용한다. `compatibility`, `allowed-tools`,
   provider/model metadata 같은 runtime binding은 adapter/reference layer로 내린다.
2. canonical body와 packaged text resource는 provider name, concrete model ID/alias, runtime-only tool identifier,
   `$ARGUMENTS`, `{{args}}`, Gemini command의 `!{...}`/`@{...}` 같은 runtime placeholder/directive에 의존하지
   않는다. generated command에 inline될 text에서 이 token은 validation error다.
3. role delegation은 `role + task + expected output`으로 표현한다. named agent가 없으면 generic isolated
   subagent, 그것도 없으면 main session이 같은 role checklist를 수행하고 보고에 fallback을 밝힌다.
4. 사용자와의 대화는 main session이 소유한다. subagent가 사용자 질문 capability를 가진다고 가정하지
   않는다.
5. 변할 수 있는 외부 사실은 문서 초안보다 먼저 live official source로 확인한다. 미확인은 Open
   question으로 남긴다.

Provider와 runtime 이름은 adapter 문서, invocation matrix, generated wrapper, 검증 fixture에는 사용할
수 있다. 금지 범위는 canonical workflow의 행동 의존성이다.

Localmind packaged template의 `SKILL.md`에는 이름 결합
`managed-by: localmind (skill: <name>)` marker가 있어야 한다. seed는 이 marker를 함께 복사하므로 다음
package release에서 managed canonical source만 안전하게 갱신할 수 있다. marker를 제거한 data source는
user fork로 간주한다. manifest에 있는 packaged logical ID는 동시에 예약 이름이다. 예약 이름의 fork가
현재 package와 non-equivalent이면 source bytes는 보존하되 `reserved-id-fork`로 분류하고 runtime target에는
배포하지 않는다. custom behavior는 예약되지 않은 logical ID로 rename해야 배포할 수 있다.

## Runtime Target Contract

### Skill targets

| Target ID | 기본 경로 | 가용성 | 산출 |
|---|---|---|---|
| `claude-skill` | `${LOCALMIND_CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}` | parent `.claude` 존재 또는 override | managed rendered skill; explicit workflow에는 Claude invocation-control frontmatter 추가 |
| `agent-skill` | `${LOCALMIND_AGENT_SKILLS_DIR:-$HOME/.agents/skills}` | 명시적 deploy 실행 시 항상 생성 가능 | managed rendered skill; explicit workflow에는 Codex `agents/openai.yaml` policy 추가, Codex+Gemini가 발견 가능 |
| `gemini-command` | `${LOCALMIND_GEMINI_COMMANDS_DIR:-$HOME/.gemini/commands}` | parent `.gemini` 존재 또는 override | canonical body에서 생성한 managed TOML wrapper |

`LOCALMIND_SKILLS_DIR`는 canonical source override로 유지한다. 공식 current Codex user skill target은
`$HOME/.agents/skills`이므로 새 localmind 산출물을 `~/.codex/skills`에 쓰지 않는다.

Packaged `sdd-implement`의 Claude target은 canonical frontmatter에
`disable-model-invocation: true`를 결정적으로 추가하고, shared target은 generated
`agents/openai.yaml`에 `policy.allow_implicit_invocation: false`를 둔다. canonical/data `SKILL.md`에는
두 provider field를 넣지 않는다. 다른 activation class는 manifest가 요구하지 않는 deny-implicit
metadata를 임의로 받지 않는다.

Cross-target workflow hash는 canonical `SKILL.md`의 normalized name/description/body와 canonical
resources/executable bits만 포함한다. managed marker, Claude generated frontmatter key,
`agents/openai.yaml`, generated package-fingerprint line은 payload hash에서 제외한다. 단 각 generated
metadata는 target별 exact schema/content와 payload hash binding을 별도로 검증하므로 누락이나 변조가
`package-equivalent`로 통과할 수 없다.

### Invocation matrix

| Logical ID example | Claude Code | Codex | Gemini CLI |
|---|---|---|---|
| `goal-ready` | `/goal-ready <request>` | `$goal-ready <request>` | auto skill 또는 `/goal-ready <request>` wrapper |
| `sdd-implement` | `/sdd-implement <NNN>` | `$sdd-implement <NNN>` | auto match 또는 `/sdd-implement <NNN>` generated wrapper 뒤 fresh confirmation 필수 |
| `sdd-self-review` | `/sdd-self-review` | `$sdd-self-review` | auto skill 또는 `/sdd-self-review` wrapper |

문서와 CLI 출력은 logical ID와 target invocation을 함께 표시한다. Codex에 존재하지 않는 bare slash
command를 생성됐다고 보고하면 오류다.

Activation policy도 logical command contract의 일부다.

| Logical ID | 허용되는 시작 | 권한 전 안전 동작 |
|---|---|---|
| `goal-ready` | explicit invocation 또는 현재 메시지가 goal/spec/plan 문서 준비를 분명히 요청 | 인용/부정/설명-only/우연 match이면 파일을 쓰지 않고 의도를 질문 |
| `sdd-implement` | runtime-attested explicit invocation + raw args 전체가 `^[0-9]{3}$`; provenance 없는 runtime은 아래 확인 handshake까지 완료 | authorization 전 side effect 금지; runtime enforcement인지 instruction-level guard인지 결과에 표시 |
| `sdd-self-review` | explicit invocation 또는 authorized `sdd-implement`의 현재-turn 내부 위임 | 그 외 implicit match는 중단; 허용된 경우도 finding report만, mutation 0회 |

Claude와 Codex에서는 generated deny-implicit metadata가 `sdd-implement`의 implicit activation을 runtime
level에서 차단한다. 이 target에서 runtime이 전달한 explicit invocation과 exact raw args를 execution grant로
인정한다.
prompt에 command 문자열이 있거나 wrapper envelope가 있다는 사실, 과거 turn의 invocation, 준비 문서의
존재는 provenance가 아니다. raw arguments는 전체가 하나의 3자리 숫자여야 하며 quote,
부정문, 설명/review-only 문구, extra token, 여러 번호는 거부한다.

Gemini CLI처럼 current official contract가 per-skill deny-implicit provenance를 제공하지 않는 runtime은
explicit wrapper로 보이는 경우도 바로 mutation하지 않는다. 첫 turn에는 side-effecting workflow action 없이
해당 NNN과 새 one-time challenge를 포함한 확인 문구만 보낸다. 바로 다음 user turn이 그 challenge와
NNN을 exact match한 경우에만 execution grant로 전환하며, stale/replayed/mismatched challenge는 폐기한다.
이 확인은 generated workflow instruction이며 Gemini runtime hook이나 cryptographic attestation이 아니다.
따라서 정적 test는 instruction과 adapter 산출물을 검증할 뿐 실제 모델의 pre-confirmation tool call 0회를
증명한다고 주장하지 않는다. runtime이 provenance 또는 이 새 확인 turn을 제공할 수 없으면
`sdd-implement`는 중단한다.

`execution grant`는 (a) runtime-attested explicit exact-NNN 또는 (b) 바로 앞 turn의 fresh exact confirmation
중 하나다. 두 branch 모두 local implementation workflow를 시작할 수 있고, 완료 후 commit/push/CI는 동일하게
repo `AGENTS.md`의 규칙을 따른다. 일반 자연어 구현 요청, 과거 확인, wrapper text만으로는 이 grant가 생기지
않는다.

### Gemini command wrapper

localmind packaged catalog의 각 logical ID에 대해 TOML wrapper를 생성한다. user custom canonical skill은
shared target에서 auto/explicit skill activation으로 사용할 수 있지만 localmind native wrapper를 자동
생성하지 않는다. wrapper는 runtime이 어떤 동명 skill을 활성화했는지 self-attest하도록 요구하지 않는다.
검증된 packaged canonical `SKILL.md` body를 generated prompt에 직접 포함해 user-level `/name` 경로의 행동을
결정적으로 고정한다. 이는 수동으로 유지하는 두 번째 정본이 아니라 매 deploy에서 재생성하는 adapter다.
packaged command workflow의 실행에 필수인 text reference가 있으면 relative path와 hash를 포함한 경계 블록으로
같이 inline한다. executable script/binary를 wrapper 행동의 필수 전제로 두지 않는다.

```toml
# managed-by: localmind (command: <name>)
# source-payload-sha256: <sha256>
description = "<SKILL.md description>"
prompt = "LocalMind generated command request:\nlogical-id=<name>\nraw-args={{args}}\n\nThe command request carries arguments but is not runtime attestation. Apply the activation policy in the generated workflow below.\n\n--- BEGIN LOCALMIND GENERATED WORKFLOW ---\n<canonical workflow body and required text references>\n--- END LOCALMIND GENERATED WORKFLOW ---"
```

구현은 packaged description의 CR/LF/tab과 연속 whitespace를 ASCII space 하나로 접고 trim해 Gemini
help용 single-line description을 만든 뒤 name, backslash, quote와 함께 TOML 규칙에 맞게 escape한다.
prompt 전체는 TOML basic string 하나로 렌더한다. encoder는 quote/backslash/control/LF를 TOML escape로
변환하고 invalid Unicode scalar를 거부하며, multiline delimiter에 의존하지 않는다. `{{args}}`는 exact
`raw-args=` field에서 한 번만, generated workflow 경계 밖에 두며 canonical/body/reference에는 Gemini
`!{...}`/`@{...}` directive가 없어야 한다. 사용자 입력은 Gemini processing order상 directive 처리 후 raw
substitution되며 shell block에 넣지 않는다. `<sha256>`은 생성 provenance를 사람이/validator가 감사하기 위한
canonical payload hash이지 runtime authorization 또는 workspace skill attestation이 아니다. 실제 본문 언어는
영어일 필요가 없지만 comment, field/order, placeholder, workflow boundary와 authorization 경고는 byte-exact
fixture 계약을 따른다. generated request 자체는 activation provenance가 아니다.

Wrapper eligibility는 이름만으로 판정하지 않는다. (a) logical ID가 packaged catalog에 있고, (b) active
canonical data source가 name-bound managed이며 packaged template과 정규화된 content/resource가 같고,
(c) packaged workflow가 wrapper self-containment 규칙을 만족해야 한다. wrapper description/body/required text
reference는 이 verified packaged template에서만 읽는다. shared `agent-skill` target의 성공은 auto-activation
가용성에는 필요하지만 generated `/name` wrapper의 canonical 행동에는 의존하지 않는다.

Transient shared-target problem과 무관하게 verified canonical source로 wrapper를 생성할 수 있다. markerless
packaged-ID fork, reserved-ID non-equivalence, invalid/unverifiable packaged source이면 name-bound managed
wrapper를 안전하게 `pruned`하고 `reserved-id-fork` 또는 `source-non-equivalent` reason을 남긴다. wrapper가
없으면 `skipped-dependency`, unmanaged wrapper이면 `skipped-unmanaged`로 보존한다. 이는 source가 목록에서
빠졌다고 추측하는 catalog prune이 아니라 검증 불가능한 generated entrypoint의 fail-closed retirement이며,
unmanaged wrapper에는 적용하지 않는다.

User-level 설치 성공은 arbitrary workspace에서의 invocation resolution 성공을 뜻하지 않는다. 배포기는
injected current workspace가 있으면 다음 provider-native locations를 CWD에서 repository root까지 `lstat`한다.

1. Codex: repo `.agents/skills/<name>`이 user skill과 함께 노출되는지 검사한다. 같은 ID의 package-equivalent
   repo skill이면 `equivalent-shadow`, non-equivalent/unmanaged이면 `ambiguous-shadow`로 보고하고 `$name`
   behavior parity를 주장하지 않는다. generated user policy가 repo duplicate를 통제한다고 가정하지 않는다.
2. Gemini: workspace `.gemini/commands/<name>.toml`이 user wrapper를 shadow하는지, workspace
   `.agents/skills/<name>` 또는 `.gemini/skills/<name>`이 auto-activation 후보를 바꾸는지 검사한다. command
   shadow는 `unmanaged-shadow`, equivalent generated command는 `equivalent-shadow`로 보고한다. skill shadow는
   `/name` wrapper의 embedded workflow를 바꾸지 않지만 auto-activation parity는 별도로 미검증 처리한다.

Resolution evidence는 `resolved | equivalent-shadow | ambiguous-shadow | unmanaged-shadow | unverified` 중
하나다. current workspace를 주입하지 않았거나 미래 workspace이면 `unverified`다. 충돌 asset을 수정하지
않고, 충돌 제거 또는 clean workspace 검증을 안내하며, 미래의 다른 workspace까지 전역적으로 안전하다고
보고하지 않는다.

## Ownership and Synchronization Contract

1. package seed는 `templates/skills/*`에서 canonical data `skills/*`로 간다. seed는 data source를
   prune하지 않는다.
2. legacy `managed-by: localmind (skill: <name>)` source는 package-managed로 인식해 새 template으로
   갱신할 수 있다. marker가 제거된 source fork는 seed가 덮어쓰지 않는다.
3. deploy는 예약되지 않은 이름의 markerless user-authored canonical skill을 지원한다. target `SKILL.md`에
   이름 결합 managed marker를 결정적으로 삽입해 다음 deploy/update/prune의 소유권을 유지한다. manifest의
   예약 ID와 이름이 같은 non-equivalent fork는 source를 byte-level로 보존하되 어떤 runtime target에도
   deploy하지 않는다. 해당 ID의 기존 name-bound managed target/wrapper만 fail-closed retire하고 unmanaged
   collision은 그대로 보존하며 `reserved-id-fork`와 rename guidance를 보고한다.
4. canonical source root는 `lstat` 후 symlink이면 한 번 `realpath`로 고정하고 실제 directory를 traversal
   boundary로 사용한다. Generated target root와 그 runtime parent는 real directory여야 하며 symlink,
   dangling link, non-directory면 target-level `problem`으로 격리한다. 사용자는 override에 resolved real
   path를 줄 수 있다. mutation 직전 root identity를 다시 확인해 바뀌었으면 중단한다.
5. source와 target entry 판정은 `lstat` 기반이다. target에 같은 이름의 unmanaged directory/file,
   symlink, special file이 있으면 내용을 따라가거나 읽어 ownership을 추측하지 않고 그 item만
   `skipped-unmanaged`로 두며 다른 workflow와 target은 계속 처리한다.
6. prune/retirement는 현재 source에 없는 이름 또는 fail-closed dependency 중 해당 target의 이름 결합
   marker가 일치하는 산출물만 hidden `.localmind-retired-...` sibling으로 먼저 rename한 뒤 삭제한다.
   cleanup이 실패해도 runtime-visible 원래 이름은 사라지고 hidden orphan은 다음 recovery가 정리한다.
7. source validation problem이 하나라도 있으면 source absence에 근거한 catalog prune은 모든 target에서
   보류한다. 단, invalid source 또는 reserved-ID fork가 오래된 workflow를 실행할 수 있는 name-bound managed
   runtime asset의 fail-closed retirement는 허용한다. 유효한 다른 source의 non-destructive create/update
   수행 여부와 이 예외를 결과에 명시한다.
8. managed canonical seed와 runtime skill directory update는 같은 parent의 임시 sibling에 완성한 뒤
   기존 managed directory를 backup sibling으로 rename하고, 완성된 sibling을 target으로 rename하는
   rollback 가능한 swap으로 수행한다. stage/backup 이름은 `.localmind-...` hidden prefix로 runtime
   discovery에서 제외한다. 두 번째 rename이 실패하면 backup을 원위치로 복구한다.
9. Gemini command file도 같은 parent의 complete temp file과 managed backup을 사용해 교체하고, 실패 시
   old file을 복구한다. ownership은 `managed-by: localmind (command: <name>)` TOML comment와 filename
   binding으로 판정한다.
10. 다음 실행은 이름 결합 marker가 확인된 고아 stage/backup만 결정적으로 복구/정리한다. target이 없고
   유효한 backup 하나가 있으면 old를 복구하고, complete managed target과 old backup이 함께 있으면
   target을 유지한 뒤 backup을 정리한다. 여러 backup, marker 불일치, incomplete stage처럼 상태가
   모호하면 삭제하지 않고 `problem`으로 보고한다.
11. target별 item status는 정확히 `created`, `updated`, `unchanged`, `pruned`, `recovered`,
    `skipped-unmanaged`, `skipped-unavailable`, `skipped-dependency`, `problem` 중 하나다. item은 logical ID,
    target ID, artifact kind, 선택적 invocation/reason을 포함한다. reserved-ID fork에 retire할 managed
    runtime artifact가 없으면 해당 target은 `skipped-dependency`/`reserved-id-fork`다.
12. aggregate outcome은 `success`, `partial`, `failed` 중 하나다. source validation/filesystem/recovery `problem`이
    하나라도 있으면 `failed`이며 CLI exit 1이다. problem 없이 unavailable, unmanaged,
    dependency skip 또는 reserved-ID fork retirement가 있으면 `partial`과 exit 0, 이 항목도 없으면
    `success`와 exit 0이다.
13. 유효한 source의 non-destructive create/update는 다른 invalid source 또는 target problem과 독립해
    계속할 수 있지만 최종 `failed`와 prune suppression을 숨기지 않는다.
14. third-party Claude plugin cache, Codex system skills, Gemini extensions는 source 또는 prune 대상으로
    스캔하지 않는다.

## Workflow Behavior Contracts

### `goal-ready`

1. 현재 사용자가 goal/spec/plan 문서 준비를 명시 호출하거나 분명히 요청했는지 확인한다. skill 이름을
   인용, 부정, 설명 또는 review-only 문맥에서 언급했거나 의도가 모호하면 tool/file mutation 없이
   질문하고 확인 전에는 진행하지 않는다.
2. 현재 repo의 SDD 규약, 기존 specs, 관련 second-brain 기록을 먼저 읽는다.
3. 시점 민감 사실이 필요한지 분류하고 필요한 live official verification을 문서 초안 전에 수행한다.
4. 결정이 필요한 개방형 요구이면 interviewer role로 질문 공간을 설계하고 main session이 사용자에게
   묻는다. 간단한 요구라 생략하면 이유를 보고한다.
5. 사용자에게 tradeoff 결정을 받으면 repo의 decision-log 계약을 읽고 available durable knowledge-capture
   capability로 질문/선택지/선택/근거/spec pointer를 기록한다. capability가 없으면 문서와 보고에 결정
   근거를 남기고 durable capture 미수행 사유를 밝힌다. concrete tool 이름은 요구하지 않는다.
6. 실제 `specs/` max + 1 번호로 goal.md, spec.md, plan.md를 작성한다. UI scope이면 design gate를
   포함한다.
7. project에 context map, ubiquitous language, architecture constitution, ADR 같은 계약 문서가 실제로
   존재할 때만 관련 SSoT 정합성을 검사한다. 없는 문서를 필수라고 추측하지 않는다.
8. architect/researcher/designer role은 runtime이 제공하는 격리 위임 capability를 사용하되 named
   persona나 구체 model을 요구하지 않는다.
9. critic role이 FR-goal trace, AC-test mapping, edge cases, SSoT consistency, unverified facts,
   Non-goals/Constraints/Open questions를 점검한다. 격리 위임이 없으면 main session이 같은 적대적
   checklist를 수행하고 independent review라고 부르지 않는다.
10. defect를 모아 수정하고 재검한다.
11. 세 문서 경로, 결정, Open questions, role/fallback 수행 내역과 현재 runtime의 truthful
   `sdd-implement` invocation을 보고한 뒤 사용자 확인을 명시적으로 요청한다. 수정 요청을 받으면 문서
   반영 -> critic 재검 -> 재확인 loop를 반복한다. 확인 전에는 구현하지 않는다.
12. 문서 준비 자체는 `sdd-implement` clean 자동 commit 대상이 아니므로 사용자 요청 없이 commit/push하지
   않는다.

### `sdd-implement`

1. runtime이 제공하는 activation provenance, raw arguments, confirmation state를 먼저 판정한다. runtime이
   explicit-only activation을 보증하고 raw args 전체가 정확히 3자리 숫자면 execution grant다. provenance가
   없으면 side-effecting workflow action 없이 새 one-time challenge를 발급한 뒤 바로 중단하며, 다음 user
   turn의 exact challenge+NNN 응답만 grant로 인정한다. prompt의 command 문자열, generated request, quote,
   부정문, 설명/review-only 요청, extra/multiple args, stale prior turn은 권한이 아니다. 이 판정은 workflow
   행동 계약이며 runtime hook이 없는 provider에서 기술적 enforcement라고 주장하지 않는다.
2. repo `AGENTS.md`를 우선 정본으로 읽는다. 없거나 요구 번호의 goal/spec/plan이 없으면 구현 전에
   중단하고 평이하게 보고한다.
3. plan 순서, spec FR/AC, goal 의도를 따라 AC별 failing test부터 작성한다.
4. unrelated user changes를 보존하고 요청 범위 밖 refactor를 하지 않는다.
5. 구현과 검증 후 mandatory adversarial self-review를 수행한다. 가용하면 격리 reviewer를 우선하고,
   불가하면 main session fallback을 명시하며 defect가 있으면 수정 후 재검한다.
6. clean일 때만 goal success metrics, spec FR/AC, plan steps/test strategy를 evidence와 함께 체크한다.
7. 두 execution-grant branch 모두 repo AGENTS가 clean completion에 commit/push/CI를 요구하면 동일하게
   따른다. grant가 없는 일반 자연어 위임은 이 자동 side-effect 권한을 만들지 않는다. skill 자체가 더
   약하거나 더 강한 완료 규칙을 복제하지 않는다.
8. runtime에 durable goal primitive가 있으면 사용할 수 있지만 workflow의 필수 전제는 아니다.

### `sdd-self-review`

1. explicit invocation 또는 authorized `sdd-implement`의 현재-turn 위임인지 확인한다. standalone
   implicit/quoted/negated match면 중단한다. 이 skill은 허용된 경우에도 finding report만 소유하고
   file/subprocess/network mutation을 수행하지 않는다.
2. spec의 모든 FR/AC와 실제 diff/test evidence를 입력으로 받는다.
3. adversarial critic role self-review는 필수다. 구현 컨텍스트와 분리된 reviewer capability가 있으면
   반드시 우선 사용하되 특정 provider 또는 model은 요구하지 않는다. 격리 capability가 없으면 repo
   AGENTS가 허용하는 main-session checklist fallback을 사용하고 independent라고 부르지 않는다.
4. 사용 가능한 추가 independent review capability가 있으면 실행하되 실패/미설치/timeout을 숨기지
   않는다. 추가 review가 없더라도 repo AGENTS의 mandatory self-review는 계속 수행한다.
5. 결과를 blocking/advisory와 traceability/coverage/correctness/simplicity-security/fact-accuracy로
   병합한다.
6. 실제로 수행한 독립성 범위를 `isolated-context`, `cross-runtime`, `main-session-fallback` 중 해당 값으로
   보고한다. 수행하지 않은 cross-runtime review를 수행했다고 쓰지 않는다.
7. skill은 finding을 보고한다. 수정, 재테스트, 재검 loop와 최종 commit은 `sdd-implement` workflow가
   소유한다.

## Provider-Neutral Execution Policy

root `AGENTS.md`의 필수 역할 배치는 다음 추상 등급으로 표현한다.

| Tier | 사용 범위 | 금지 |
|---|---|---|
| `critical-reasoning` | 아키텍처/goal/spec/plan, 복잡 신규 로직, 적대적 최종/보안 review | 더 낮은 등급으로 조용히 대체 |
| `standard` | 잘 명세된 루틴 구현, 결정론적 테스트 작성/실행 | 최종 critic을 성공 판정하는 유일 reviewer |
| `economy` | 로그 조회, 파일 목록, 보일러플레이트 같은 저위험 기계 작업 | 아키텍처, 코딩 판단, 최종 review |

Runtime이 tier/model 선택 capability를 제공하면 해당 tier에 가장 적합한 available model을 adapter 또는
사용자가 매핑한다. 선택 capability가 없거나 tier를 만족하는 별도 model이 없으면 현재 main session에서
같은 role checklist를 수행하고 fallback을 보고한다. 특정 model의 부재만으로 workflow를 중단하거나
미수행 review를 수행했다고 쓰지 않는다. provider/model별 추천, 가격, alias는 이 규약의 필수 계약이
아니며 별도 local binding 문서가 있더라도 optional adapter다.

## Functional Requirements

- [ ] **FR-1 (표준 canonical contract)**: Agent Skills 표준의 최소 frontmatter, directory binding,
  resource traversal/permission, 본문과 packaged activation manifest binding을 검증하고 invalid source는
  target에 배포하지 않는다.
  -> goal: Objective(공통 정본), Constraints(표준/무추측)
- [ ] **FR-2 (완전한 packaged catalog)**: `sdd-implement`, `goal-ready`, `sdd-self-review`와 activation
  manifest를 package seed로 제공하고 clean install, 기존 managed source update, user fork preservation,
  code change 없는 후속 manifest entry 확장을 지원한다.
  -> goal: Objective(세 command 재현), Success Metrics(catalog)
- [ ] **FR-3 (provider/model-neutral behavior)**: localmind packaged canonical workflow는 구체 provider,
  model, runtime tool/placeholder 없이 role/capability/fallback으로 작성되고 자동 neutrality 검사를
  통과한다. 사용자 custom skill은 이 정책 검열 대상이 아니다.
  -> goal: Objective(종속 제거), Constraints(runtime 차이 adapter 한정)
- [ ] **FR-4 (multi-target skill deploy)**: 한 canonical source를 `claude-skill`과 `agent-skill`에
  target별로 독립 배포하고 resource directory와 manifest-derived invocation-control metadata를 보존한다.
  -> goal: Objective(Claude/Codex/Gemini 사용), Constraints(managed copy)
- [ ] **FR-5 (logical command parity)**: packaged logical command catalog, activation policy와 invocation
  matrix를 제공하고,
  verified canonical body를 포함한 Gemini native TOML wrapper를 동일 source에서 생성한다. 사용자
  custom skill을 native command로 자동 승격하거나 Codex에 없는 bare slash command를 약속하지 않는다.
  Codex/Gemini workspace collision이 user artifact와 충돌하면 resolution parity를 성공으로 보고하지 않는다.
  -> goal: Objective(command 동일 행동), Expected Outcome
- [ ] **FR-6 (소유권/불가침/복구성)**: managed marker 이름 바인딩, target symlink/unmanaged collision
  보호, prune guard, canonical seed/skill directory/command file의 rollback 가능한 swap과 고아 상태 복구,
  target failure isolation, 결정적 status/exit contract를 제공한다.
  -> goal: Constraints(사용자 자산 보호), Risks(prune/부분 복사)
- [ ] **FR-7 (`goal-ready` 행동)**: 조사, 조건부 SSoT 검사, feedback 반영/재검부터 사용자 확인까지
  고정된 provider-neutral 문서 준비 workflow를 제공하며 확인 전 구현/commit을 금지한다.
  -> goal: Objective(goal-ready 전 runtime), Success Metrics(characterization)
- [ ] **FR-8 (`sdd-implement` 행동)**: `AGENTS.md`를 정본으로 SDD 구현, TDD, self-review, evidence check,
  clean completion을 runtime 독립적으로 조율하되 runtime-attested explicit activation 또는 새 확인
  handshake가 없으면 side effect를 금지한다. runtime policy와 instruction-level guard의 차이를 숨기지 않는다.
  -> goal: Objective(all commands), Constraints(AGENTS SSoT)
- [ ] **FR-9 (`sdd-self-review` 행동)**: 특정 provider/model 없이 mandatory adversarial critic review를
  수행하고 isolated/cross/main-session fallback 상태를 독립성보다 과장하지 않고 보고한다. explicit 또는
  authorized delegation에서만 report-only로 실행되며 cross-review available/unavailable 양쪽을 검증한다.
  -> goal: Objective(model 독립), Risks(false assurance)
- [ ] **FR-10 (Gemini context bridge)**: root와 SDD scaffold에 기존 파일을 덮어쓰지 않는
  `GEMINI.md -> AGENTS.md` import bridge를 제공하고 Claude bridge와 같은 SSoT를 보게 한다.
  -> goal: Objective(동일 규약), Constraints(AGENTS SSoT)
- [ ] **FR-11 (asset lifecycle)**: backup/restore, recover, update, device-sync가 새 catalog와 target을
  재생성하고 target별 배포 상태를 검증한다.
  -> goal: Objective(수명주기), Success Metrics(recovery)
- [ ] **FR-12 (관측/문서)**: deploy 결과가 logical ID, target, invocation, status, skip/problem을 평이한
  한국어로 표시하고 reference docs에 정본/파생/호출/환경변수/지원 한계를 설명한다.
  -> goal: Objective(예측 가능), Stakeholders(비개발자)
- [ ] **FR-13 (회귀 경계)**: LLM gateway routing, chat backend, search/brain, third-party assets,
  active user changes를 수정하지 않고 기존 Claude skill과 SDD 규약의 행동을 보존한다.
  -> goal: Non-goals, Constraints(외과적 변경)
- [ ] **FR-14 (provider-neutral execution policy)**: root `AGENTS.md`의 mandatory 역할 배치를 abstract
  execution tier/capability/fallback으로 바꾸고 구체 provider/model/tool을 workflow 완료의 필수조건에서
  제거한다.
  -> goal: Objective(실행 정책 중립화), SM-11, Risks(root model binding)

## Acceptance Criteria

- [ ] **AC-1 (표준 schema)**: Given valid/invalid fixture skill directories, When registry를 읽으면,
  Then quoted/multiline/comment/colon을 포함한 valid YAML name/description/body/resources는 정규화되고,
  name mismatch, malformed/oversized/alias/custom-tag frontmatter, empty body, symlink/special file은 파일별
  문제로 보고되며 regular resource의 executable permission bit가 보존된다. packaged manifest의 exact
  schema/value와 directory 1:1 binding도 검증되고 missing/extra/mismatched entry는 write 전 package
  `problem`이다.
  Test: `skills-contract: AC-1`.
- [ ] **AC-2 (fresh seed catalog)**: Given production package + 빈 data skills directory, When seed를 실행하면,
  Then 정확히 `sdd-implement`, `goal-ready`, `sdd-self-review` package assets와 각각의 name-bound managed
  marker가 생성되고 두 번째 실행은 unchanged다. 별도 injected package root에 valid 네 번째 manifest
  workflow를 추가하면 implementation name list 수정 없이 네 번째도 seed된다.
  Test: `skills-seed: AC-2`.
- [ ] **AC-3 (legacy update와 fork 보호)**: Given 현재 legacy managed `goal-ready`/`sdd-self-review`와
  marker를 제거한 일반 user fork 및 예약 ID `sdd-implement` non-equivalent fork, When 새 package seed/deploy를
  실행하면, Then managed source만 새 neutral template로 갱신되고 두 fork source는 byte-level로 보존된다.
  일반 fork는 custom 경로로 배포할 수 있지만 예약 ID fork는 `reserved-id-fork`로 어느 runtime에도 새로
  노출되지 않고 기존 name-bound managed target/wrapper만 retire되며 unmanaged collision은 보존된다.
  Test: `skills-seed: AC-3`.
- [ ] **AC-4 (Claude skill target)**: Given injected Claude home과 세 canonical skills, When deploy하면,
  Then `~/.claude/skills/<name>/SKILL.md`와 resources가 생성되고 name-bound marker, content, status가
  결정적이며 `sdd-implement`에만 `disable-model-invocation: true`가 렌더되고 재실행은 unchanged다.
  injected fourth packaged workflow도 manifest policy대로 name hard-code 없이 배포된다. reserved
  `sdd-implement` fork fixture는 source가 보존되지만 Claude runtime exposure/tool execution은 0이다. retire할
  managed target이 없으면 `skipped-dependency`/`reserved-id-fork`다.
  Test: `skills-deploy-claude: AC-4`.
- [ ] **AC-5 (shared Agent Skills target)**: Given empty injected shared target, When deploy하면, Then 세
  skill이 `$HOME/.agents/skills/<name>/`에 생성되고 `sdd-implement`에만 exact generated
  `agents/openai.yaml` deny-implicit policy와 payload fingerprint가 있으며 Claude target과 normalized
  canonical workflow hash가 같다. injected fourth packaged workflow도 manifest policy대로 배포되고 current
  official Codex/Gemini discovery path를 contract fixture로 검증한다. reserved `sdd-implement` fork는 shared
  runtime에 배포되지 않고 name-bound managed old target만 retire된다. injected Codex repo의 same-ID
  equivalent/non-equivalent skill은 각각 `equivalent-shadow`/`ambiguous-shadow`로 보고되어 후자는 parity를
  보류한다. retire할 managed shared target이 없으면 `skipped-dependency`/`reserved-id-fork`다.
  Test: `skills-deploy-shared: AC-5`.
- [ ] **AC-6 (Gemini command wrapper)**: Given verified packaged canonical sources, injected Gemini home,
  packaged 세 workflow와 injected fourth packaged workflow, user custom skill, packaged ID의 markerless fork,
  shared target failure, higher precedence workspace skill/command collision을 포함할 때, When deploy하면, Then
  eligible packaged workflow의
  `commands/<name>.toml`만 생성되고 multiline description은 결정적 single-line로 정규화되며
  name/quotes/backslash를 안전하게 render한다. exact generated prompt는 source hash audit comment, logical ID,
  raw args, canonical body/required text references를 고정 순서로 담고 `{{args}}`를 workflow 경계 밖에서 한
  번만 사용하며 request를 authorization이나 runtime attestation으로 부르지 않는다. reserved-ID fork의
  managed wrapper는 `pruned`, 없는 wrapper는 `skipped-dependency`, unmanaged wrapper는 보존된다. shared target
  failure는 wrapper 생성을 막지 않되 auto-skill availability failure로 별도 보고한다. workspace command
  shadow는 `unmanaged-shadow`/parity 미검증, workspace skill shadow는 auto-activation parity 미검증으로
  보고된다.
  Test: `commands-gemini: AC-6`.
- [ ] **AC-7 (invocation truthfulness)**: Given deploy result, When 사람이 읽는 summary와 machine result를
  만들면, Then 각 logical ID에 Claude `/name`, Codex `$name`, Gemini `/name`/auto를 구분해 표시하고
  exact target/status/outcome/reason을 평이한 한국어로 표시하며 Codex `/name` 생성 주장과 LocalMind
  Claude `/goal` mapping은 없다. runtime-enforced와 instruction-level confirmation, current-workspace
  `resolved|equivalent-shadow|ambiguous-shadow|unmanaged-shadow|unverified`를 구분하고 user-level install을
  arbitrary workspace resolution success로 부르지 않는다. current official built-in command 목록과 packaged
  ID의 충돌도 0건이다.
  Test: `workflow-invocation: AC-7`.
- [ ] **AC-8 (neutrality gate)**: Given packaged canonical skills, When neutrality validator를 실행하면,
  Then packaged frontmatter key는 `name`/`description`뿐이고 description/body/text resources의 provider names,
  concrete model IDs/aliases, known runtime-only tool identifiers/placeholders가 0건이며 `localmind-review` 같은
  concrete optional adapter 이름도 0건이다. runtime adapter/reference fixture의 같은 문자열은 허용된다.
  Test: `workflow-neutrality: AC-8`.
- [ ] **AC-9 (`goal-ready` characterization)**: Given explicit/clear document-preparation intent, quoted,
  negated, explain/review-only, ambiguous description match, open-ended, already-decided, UI,
  unverified-external-fact scenarios, tradeoff decision, optional project SSoT 존재/부재 및 사용자 수정 요청,
  When workflow contract를 검사하면,
  Then prior-context read, pre-draft Live-Verify, main-session questions, three docs, conditional design/SSoT gate,
  provider-neutral durable decision capture/fallback, critic/fallback, feedback 반영 -> 재검 -> 재확인,
  truthful `sdd-implement` next invocation, no implementation/commit이 모두 존재한다. quoted/negated/
  explain-only/ambiguous case는 확인 전 file/tool mutation 0회다.
  Test: `goal-ready-contract: AC-9`.
- [ ] **AC-10 (`sdd-implement` authorization/execution)**: Given Claude/Codex runtime-attested explicit
  invocation, Gemini/unattested activation, valid NNN+SDD, quoted mention, negation, explain/review-only request,
  missing/invalid/extra/multiple NNN, stale/replayed/mismatched confirmation, missing AGENTS/document, dirty
  unrelated file scenarios, When generated runtime policies, canonical workflow text, Gemini generated request와
  installed-runtime characterization을 검사하면, Then only attested exact-NNN or immediately preceding fresh exact
  confirmation is described as an execution grant and both branches use the same AGENTS completion rule. Claude/Codex
  fixtures prove exact deny-implicit runtime metadata. Gemini fixture requires a first-turn fresh confirmation and
  forbids pre-grant side effects at instruction level, while the result explicitly says this is not runtime-enforced;
  Gemini live E2E가 unavailable이면 `skipped`다. Static recorder는 renderer/contract output만 검증하고 실제
  model tool-call 0회를 증명했다고 보고하지 않는다. request text alone never authorizes. Canonical body에는
  `AGENTS.md` 정본 읽기, failing-test-first TDD, mandatory adversarial self-review, evidence-based 문서 체크,
  execution-grant에 따른 동일 completion 단계가 모두 존재한다.
  Test: `sdd-implement-contract: AC-10`.
- [ ] **AC-11 (`sdd-self-review` characterization)**: Given explicit invocation, authorized current-turn
  delegation, standalone implicit/quoted/negated match, isolated reviewer available, additional cross-runtime reviewer
  available/unavailable, and main-session-only scenarios, When workflow를 수행하면, Then allowed cases keep
  mandatory review, prefer isolation when available, run and report `cross-runtime` when additional review is
  available, and report exact skip reason when unavailable. main-only is `main-session-fallback`/`not-independent`;
  implicit/quoted/negated case stops. 모든 case에서 mutation recorder는 0이고 false independence/cross-review
  claim이 없다.
  Test: `self-review-contract: AC-11`.
- [ ] **AC-12 (root/item collision)**: Given target root/runtime parent symlink와 각 target의 동명 unmanaged
  directory/file/symlink/special item 및 다른 managed asset, When deploy하면, Then unsafe root는
  target-level `problem`/exit 1로 격리하고 per-item collision은 `lstat` 후 따라가지 않고
  `skipped-unmanaged`로 보존하며 다른 target은 정상 처리된다. canonical source-root symlink fixture는
  resolved directory boundary 밖을 traverse하지 않는다.
  Test: `workflow-ownership: AC-12`.
- [ ] **AC-13 (safe prune/swap recovery)**: Given source에서 한 managed workflow가 삭제되고 다른 target
  update 중 stage copy, target-to-backup rename, stage-to-target rename, 또는 backup cleanup failure가
  주입될 때, When deploy와 다음 recovery deploy를 실행하면, Then 첫 실행은 `failed`/exit 1이면서 다른
  target 성공을 유지하고, marker-bound stale asset만 prune되며 실패 target에는 old 또는 complete-new
  directory만 남는다. placement 완료 전 실패는 old backup을 원위치로 복구하고, complete-new 배치 후
  cleanup 실패는 new target을 유지한 채 다음 실행에서 old backup만 정리한다. 모호한 고아 상태는
  삭제하지 않는다.
  Test: `workflow-swap-recovery: AC-13`.
- [ ] **AC-14 (source problem prune guard)**: Given 한 invalid source와 기존 managed target assets, When
  deploy하면, Then problem을 보고하고 source absence 기반 catalog prune을 모든 target에서 보류한다.
  검증 불가능한 dependency의 name-bound managed wrapper만 fail-closed retire할 수 있고 unmanaged 파일은
  그대로이며 aggregate는 `failed`/exit 1이다. Test: `workflow-prune-guard: AC-14`.
- [ ] **AC-15 (runtime absent)**: Given `.claude`와 `.gemini`가 없고 shared target만 쓸 수 있을 때, When
  deploy하면, Then agent-skill은 성공하고 Claude/Gemini command는 명시적 `skipped-unavailable` reason을 반환하며
  전체 process는 `partial`/exit 0으로 요약한다. Test: `workflow-missing-target: AC-15`.
- [ ] **AC-16 (context bridge/scaffold)**: Given localmind root와 빈 external project, When root contract와
  `scaffoldSdd()`를 검사하면, Then `CLAUDE.md`/`GEMINI.md`가 AGENTS.md를 import하고 scaffold는 없는 bridge만
  생성하며 기존 파일은 절대 덮어쓰지 않고 새 scaffold SDD 실행 규약은 `sdd-implement`를 사용한다.
  Test: `scaffold-runtime-bridges: AC-16`.
- [ ] **AC-17 (lifecycle recovery)**: Given temp canonical data, backup mirror, restore target, injected runtime
  homes, When backup -> restore/update/device-sync와 recover 두 경로를 실행하면, Then 세 canonical workflows와
  모든 available target artifacts가 재현되고 marker 검증은 target별 상태를 확인한다. 기본 구성 recover는
  즉시 all-target deploy하고, mirror 구성이 notes 연결 전에 보류되는 경우에는 generated target을 mirror에서
  직접 만들지 않으며 notes 연결 후 restore를 통해 all-target deploy한다.
  Test: `workflow-lifecycle: AC-17`.
- [ ] **AC-18 (회귀/개인정보/사실)**: Given full test suite and repository privacy scan, When 044 변경을
  검증하면, Then gateway/backend/search behavior와 third-party assets는 불변이고 canonical/template/test에
  실제 개인 절대경로/secret이 없으며 runtime 사실은 current official source와 verified date를 가진다.
  Test: `workflow-boundary: AC-18` + full regression.
- [ ] **AC-19 (neutral execution policy)**: Given root/scaffold SDD rules and a runtime with no model-selection
  capability, When mandatory role allocation을 검사하면, Then root `AGENTS.md`는
  `critical-reasoning|standard|economy`와 fallback/reporting으로 역할을 배치하고 concrete provider/model/tool
  부재를 blocker로 만들지 않는다. `Agent`, `AskUserQuestion`, `WebFetch`, `WebSearch`, `context7` 같은
  provider-runtime 전용 tool identifier는 필수 절차에서 capability/outcome 표현으로 바뀌고 scaffold
  규약도 이를 약화하지 않는다. project-owned portable MCP operation은 runtime binding으로 문서화할 수
  있지만 특정 client의 tool label 부재를 blocker로 만들지 않는다.
  Test: `execution-policy-neutrality: AC-19`.
- [ ] **AC-20 (seed/command write recovery)**: Given managed canonical seed와 managed Gemini wrapper에
  copy/write/swap/cleanup failure를 각 지점에 주입할 때, When 실행과 다음 recovery 실행을 수행하면,
  Then old 또는 complete-new artifact만 노출된다. placement 전 실패는 old backup을 복구하고,
  complete-new 배치 후 cleanup 실패는 new를 유지하며 다음 실행이 old backup을 정리한다. markerless
  fork/unmanaged command와 모호한 orphan은 삭제되지 않는다. Test: `managed-write-recovery: AC-20`.
- [ ] **AC-21 (docs/env wiring)**: Given reference docs, help output, and injected path overrides, When 044
  surfaces를 검사하면, Then `LOCALMIND_SKILLS_DIR`, `LOCALMIND_CLAUDE_SKILLS_DIR`,
  `LOCALMIND_AGENT_SKILLS_DIR`, `LOCALMIND_GEMINI_COMMANDS_DIR`의 source/target 의미와 canonical/generated
  구분, activation/invocation matrix, unavailable/partial/failed 의미, Gemini live limitation이 일치하고
  "모든 command" 범위를 모든 LocalMind-owned packaged AI workflow command로 한정한다. Make 도움말은
  Claude-only 배포라고 쓰지 않는다. Claude/Codex deny-implicit metadata, provenance 없는 runtime의 fresh
  confirmation의 instruction-level 한계, reserved-ID fork 차단, Codex/Gemini workspace
  shadowing/ambiguity/resolution limitation을 설명하고 skill activation consent나 arbitrary workspace parity,
  Gemini runtime enforcement를 우회/보장한다고 주장하지 않는다.
  기존 LocalMind `/goal` SDD 사용자는 `sdd-implement` migration과 Claude built-in `/goal` 차이를 확인할 수
  있고, active docs/templates/source comments에는 migration 설명 밖의 old LocalMind `/goal` workflow
  pointer가 0건이다.
  Test: `workflow-doc-contract: AC-21`.

## Traceability Matrix

각 AC의 `Test:` 이름은 plan Test Strategy의 한 행 및 구현 test case 이름과 1:1로 유지한다.

| FR | Goal evidence | Acceptance evidence | Plan phase |
|---|---|---|---|
| FR-1 | Objective(common source), SM-1, SM-2 | AC-1, AC-4, AC-5 | Phase 1, 3 |
| FR-2 | Objective(reproducible catalog), SM-1, SM-9 | AC-2, AC-3, AC-17, AC-20 | Phase 1, 2, 5 |
| FR-3 | Objective(model neutrality), SM-3, SM-4, SM-5, SM-6 | AC-8, AC-9, AC-10, AC-11 | Phase 2 |
| FR-4 | Objective(all runtimes), SM-2, SM-8 | AC-4, AC-5, AC-12, AC-13, AC-15 | Phase 3 |
| FR-5 | Objective(command behavior parity), SM-2 | AC-6, AC-7, AC-10, AC-21 | Phase 2, 4, 6 |
| FR-6 | Constraints(user assets), SM-7, SM-8 | AC-12, AC-13, AC-14, AC-15, AC-20 | Phase 1, 3, 4 |
| FR-7 | Objective(goal-ready), SM-4 | AC-9 | Phase 2 |
| FR-8 | Objective(all commands), SM-5, SM-11 | AC-10, AC-19 | Phase 2, 5 |
| FR-9 | Objective(review neutrality), SM-6 | AC-11 | Phase 2 |
| FR-10 | Objective(shared SSoT), SM-5 | AC-16 | Phase 5 |
| FR-11 | Objective(lifecycle), SM-9 | AC-17 | Phase 5 |
| FR-12 | Objective(observability), SM-2, SM-8, SM-10 | AC-7, AC-15, AC-21 | Phase 4, 5, 6 |
| FR-13 | Non-goals/regression constraints | AC-18 | Phase 7 |
| FR-14 | Objective(neutral execution policy), SM-11 | AC-19 | Phase 5 |

## Backward Compatibility

- `make skills-deploy`, npm `skills:deploy`, restore/recover/update/device-sync 호출 이름은 유지한다.
- `LOCALMIND_SKILLS_DIR`와 `LOCALMIND_CLAUDE_SKILLS_DIR` 의미를 유지한다.
- legacy Claude managed skill은 이름 결합 marker로 update/prune할 수 있다.
- root와 scaffold `AGENTS.md`의 기존 `/goal {NNN}` SDD 구현 표면은 logical `sdd-implement {NNN}`로
  이관하고 runtime별 sigil은 invocation matrix에서만 정의한다.
  Claude built-in `/goal`은 shadow/수정하지 않으며, LocalMind는 `goal` skill/wrapper를 생성하지 않는다.
  기존 markerless user `goal` asset이 있으면 unmanaged로 보존한다.
- 기존 `goal-ready`와 `sdd-self-review` data source는 legacy managed marker일 때 새 package template로
  갱신된다. 사용자가 marker를 제거해 fork한 source는 건드리지 않는다. 단 packaged reserved ID의
  non-equivalent fork는 같은 이름으로 runtime에 배포하지 않으며 custom behavior는 rename해야 한다.
- 기존 `AGENTS.md`와 `CLAUDE.md`가 규약 정본이다. SDD/TDD/review/commit/CI 행동은 보존하되 mandatory
  모델명 배치만 provider-neutral execution tier로 치환한다. 새 skill은 그 규칙을 약화하거나 복제 정본이
  되지 않는다.
- 기존 `localmind-review` binary와 cross-review API를 삭제하지 않는다. canonical self-review가 이를
  필수 provider로 가정하지 않게 하며, transport 일반화는 별도 요구가 없으면 기존 optional adapter로
  adapter/reference 문서에 남긴다. canonical `SKILL.md`에는 이 concrete binary 이름을 넣지 않는다.
- specs/007의 AGENTS.md+specs scaffold 계약은 044가 CLAUDE.md/GEMINI.md bridge를 item 단위
  create-if-absent로 추가 확장한다. 007 문서에는 이 포인터만 추가하고 과거 검증 기록은 다시 쓰지
  않는다.
- specs/018의 provider/model-specific orchestration(FR-1/4), `/goal` 기본 Claude+Codex trigger 부분(FR-6),
  Claude-only fallback(FR-7), Claude-only copy 부분(FR-8)은 044가 대체한다. FR-2/3의 structured Codex
  transport/output, FR-5의 report-only ownership, FR-6의 optional adapter toggle은 adapter/reference로
  유지한다. FR-8의 backup/index/unmanaged invariants와 FR-9 speckit 불가침은 044 FR-11/13이 계승한다.
  FR-10의 old `/goal`/Claude-only 문서는 superseded이고 plain observability, toggle 구분, speckit/user
  judgment 문서 의무는 044 FR-12/13으로 흡수한다. 018 세 문서는 이 포인터를 추가하고 과거 검증 체크를
  다시 쓰지 않는다.
- specs/019의 backup/restore/recover, specs/031의 device-sync marker verification, specs/033의 update
  deploy 계약은 044가 multi-target workflow artifact를 additive하게 확장한다. 각 문서에는 044 포인터만
  추가하고 과거 검증 체크를 다시 쓰지 않는다.

## Open Questions

- ~~Claude built-in `/goal`과 LocalMind SDD workflow를 같은 이름으로 둘 것인가?~~ -> **아니오.** 공식
  current Claude Code는 v2.1.139+에서 `/goal`을 session completion condition으로 예약한다. LocalMind logical
  ID와 세 runtime invocation은 `sdd-implement`로 이관하고 built-in을 shadow하지 않는다.
- ~~세 runtime에서 문자 그대로 `/goal-ready`를 강제할 것인가?~~ -> **아니오.** 2026-07-11 공식
  Codex 계약에는 bare custom `/name` 등록이 없다. logical ID와 behavior parity를 보장하고 runtime-native
  invocation을 정직하게 표시한다.
- ~~Codex deprecated custom prompts를 command adapter로 만들 것인가?~~ -> **아니오.** 새 기능을
  deprecated 표면에 결합하지 않고 Agent Skills를 사용한다.
- ~~Gemini skill을 `~/.gemini/skills`와 `~/.agents/skills`에 중복 배포할 것인가?~~ -> **아니오.** Gemini
  공식 alias이자 Codex 공용 경로인 `.agents/skills` 하나를 사용해 중복/precedence drift를 막는다.
- ~~사용자 custom skill에도 Gemini native wrapper를 자동 생성할 것인가?~~ -> **아니오.** skill target
  배포는 유지하지만 localmind가 소유한 packaged catalog만 native command로 노출해 built-in/reserved 이름
  충돌과 의도하지 않은 command 승격을 막는다.
- ~~root 실행 정책의 Opus/Sonnet/Haiku/Fable 배치를 유지할 것인가?~~ -> **아니오.** 사용자의
  provider/model 비종속 요구에 따라 mandatory policy는 abstract execution tier로 바꾸고 구체 mapping은
  optional runtime binding으로 내린다.
- ~~Antigravity CLI를 Gemini CLI와 같은 target으로 볼 것인가?~~ -> **아니오.** consumer 전환 사실은
  문서화하되 경로 계약과 live E2E가 안정될 때 별도 SDD로 추가한다.
- ~~`sdd-implement` 본문의 command 문자열만 explicit invocation 증거로 볼 것인가?~~ -> **아니오.**
  Claude/Codex는 official deny-implicit adapter metadata를 사용하고, provenance가 없는 runtime은 fresh
  confirmation turn을 요구한다. prompt/generated request 문자열만으로 authorization하지 않는다. Gemini의
  confirmation은 공식 pre-tool hook이 아니라 instruction-level guard임을 공개한다.
- ~~Gemini user wrapper 설치를 모든 workspace에서 behavior parity로 선언할 것인가?~~ -> **아니오.**
  wrapper는 canonical body를 직접 포함하지만 workspace command가 user command를 shadow할 수 있다.
  current-workspace evidence로 command/skill 충돌을 점검하고, shadow 또는 미래 workspace 미검증 상태를
  성공으로 과장하지 않는다. source hash는 runtime attestation으로 사용하지 않는다.
- ~~packaged logical ID의 markerless fork를 같은 이름으로 runtime에 배포할 것인가?~~ -> **아니오.** source는
  보존하지만 예약 ID는 fail-closed로 runtime exposure를 막고 custom behavior는 rename하도록 안내한다.
- **구현 전 재검증 필요**: 실행 시점의 Claude/Codex/Gemini 공식 skill path, command syntax,
  symlink/refresh behavior가 위 verified contract와 달라졌는가? 달라졌다면 Phase 0에서 spec amendment
  또는 Open question으로 표면화한다.
