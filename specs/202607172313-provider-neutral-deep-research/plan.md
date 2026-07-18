---
title: Provider-neutral Deep Research workflow implementation plan
audience: both
---

# Plan: Provider-neutral Deep Research workflow

> **결론** — 기존 packaged workflow 배포 엔진은 수정하지 않고, `deep-research` canonical Agent
> Skill + text reference + catalog policy를 추가한다. 계약 테스트를 먼저 RED로 고정한 뒤 package와
> 문서를 구현하고, 임시 target 배포와 실제 조사 시나리오로 dogfood한다. 행동 정본은 끝까지
> provider/model/tool-neutral이며 runtime 이름은 adapter 테스트와 사람용 문서에만 둔다. 단계별로
> 추상 실행 등급을 요청하고, 구체 모델 선택은 설치별 runtime binding에 맡긴다.

## 1. 입력·근거

- [goal.md](goal.md) — 왜 만드는가, 성공 지표, 비목표, 제약.
- [spec.md](spec.md) — FR-1~14, AC-1~16, 사용자 시나리오, 용어.
- `specs/044-provider-neutral-workflow-assets/` — canonical Agent Skills + runtime adapter +
  reserved catalog + managed/unmanaged 보호의 선행 SSoT.
- `specs/051-goal-impl-reconciliation/` — runtime별 명시 호출과 logical command ID 분리.
- `specs/052-sdd-parallel-orchestration/` — tasks DAG·fan-out·최종 barrier 규약.
- `AGENTS.md` — timestamp spec 폴더, TDD, Live-Verify, goal-impl completion, open-source 문구,
  release/CHANGELOG 규약.

## 2. Live-Verify 확정 사실

검증일: **2026-07-18**. 시간에 따라 바뀔 수 있으므로 구현 착수 Phase 0과 self-review에서 다시
확인한다. 아래 외부 자료는 모두 공식 문서·표준 `[T1]`이다.

| ID | 확정 사실 | 설계 영향 | 공식 근거 |
|---|---|---|---|
| F-1 | Agent Skills 최소 단위는 폴더의 `SKILL.md`; `name`·`description`이 필수이고 references/scripts/assets는 선택이다. 표준은 명시 호출 문자를 강제하지 않는다. | `deep-research`를 logical ID + canonical skill로 정의하고 invocation은 adapter로 분리한다. | [Agent Skills specification](https://agentskills.io/specification), [client implementation guide](https://agentskills.io/client-implementation/adding-skills-support) |
| F-2 | Codex는 Agent Skills를 지원하며 명시 호출은 `$skill-name`; Custom Prompts는 deprecated다. | Codex bare `/deep-research`·`/prompts:deep-research`를 만들지 않고 `$deep-research`만 안내한다. | [Codex Build skills](https://learn.chatgpt.com/docs/build-skills), [Custom Prompts](https://learn.chatgpt.com/docs/custom-prompts), [Codex manual](https://developers.openai.com/codex/codex-manual.md) |
| F-3 | Claude Code skills는 Agent Skills를 따르고 직접 호출은 `/skill-name`; legacy custom commands보다 skills가 권장된다. | Claude target은 `/deep-research`; 별도 legacy command 정본을 만들지 않는다. | [Claude Code skills](https://code.claude.com/docs/en/slash-commands), [commands reference](https://code.claude.com/docs/en/commands) |
| F-4 | Gemini CLI는 `.agents/skills` alias와 Agent Skills activation을 지원한다. custom command는 TOML 파일을 `/name`으로 노출하고 `{{args}}`를 전달한다. | 현행 LocalMind의 canonical skill + generated `/deep-research` wrapper를 유지한다. | [Gemini CLI Agent Skills](https://geminicli.com/docs/cli/skills/), [Using Agent Skills](https://geminicli.com/docs/cli/using-agent-skills/), [Custom Commands](https://geminicli.com/docs/cli/custom-commands/) |
| F-5 | 2026-06-18부터 consumer Gemini CLI 경로는 Antigravity CLI로 전환됐고, enterprise/API-key 경로는 Gemini CLI 지원이 유지된다. 더 최신 migration 문서는 skills의 slash 노출을 설명해 기존 Gemini activation 문서와 표현이 충돌한다. | Gemini 설치본에서 native skill slash와 generated wrapper의 discovery/우선순위를 dogfood한다. Antigravity 전용 adapter는 이번 범위 밖이며 후속 결정으로 둔다. | [Google 전환 공지](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/), [Antigravity migration](https://antigravity.google/docs/gcli-migration), [Antigravity Agent Skills](https://antigravity.google/docs/skills) |

### 내부 확인 사실

| ID | 저장소 사실 | 영향 |
|---|---|---|
| F-6 | `templates/skills/catalog.json`이 packaged workflow 목록·activation·sideEffects를 소유하며 loader는 catalog↔directory 1:1을 검증한다. | `deep-research: explicit/report-only`를 catalog와 동일 이름 디렉터리로 추가한다. |
| F-7 | `src/agents/skills.ts`와 `src/agents/commands.ts`는 manifest-driven으로 Claude skill, shared Agent Skill, Gemini wrapper를 생성한다. text reference도 canonical payload에 포함된다. | production engine 변경 없음이 기본. 신규 package만으로 세 target이 생성되는지 RED→GREEN으로 증명한다. |
| F-8 | `workflow-policy.ts`는 explicit workflow에 Claude/Codex deny-implicit metadata를 생성한다. | 기존 policy renderer 재사용; 신규 분기 추가 금지. |
| F-9 | production logical ID 목록과 "세 workflow" 문구가 여러 테스트·README·docs에 하드코딩돼 있고 현재 catalog 5개와도 일부 drift가 있다. | 이번 기능과 직접 맞닿은 목록을 6개로 갱신하거나 catalog-derived 검증으로 바꾼다. unrelated timestamp/legacy 문구는 건드리지 않는다. |
| F-10 | 작업 시작 전 user-owned `package-lock.json`이 이미 수정돼 있다. | 이 파일은 영향 범위에서 제외하고 byte 변경 없이 보존한다. |

## 3. DDD 경계와 유비쿼터스 언어

### Bounded context A — Workflow Catalog & Distribution (기존)

- **소유:** `WorkflowDefinition`, `SkillPackage`, activation policy, side-effect policy, target adapter,
  managed marker/fingerprint, lifecycle result.
- **이번 변경:** 기존 aggregate에 `deep-research` 정의 1건을 추가한다. loader·adapter·renderer의
  도메인 규칙은 바꾸지 않는다.
- **불변식:** catalog ID와 package directory가 1:1이고 canonical payload는 target별로 fork되지 않는다.

### Bounded context B — Research Orchestration Contract (신규 instruction contract)

- **소유:** `research brief`, `research question`, `source authority`, `evidence ledger`, `capability
  fallback`, `execution tier`, `critic gate`, `research report`의 행동 규칙.
- **형태:** TypeScript domain class나 새로운 service가 아니라 Agent Skill 본문과 text reference로
  표현한다. 실행은 host agent runtime이 담당한다.
- **경계:** source lookup·persistent knowledge·isolated delegation·file save는 외부 capability다.
  canonical contract는 capability 존재를 가정하지 않고 확인→사용 또는 fallback만 지시한다.

### Context relationship

`Workflow Catalog & Distribution`이 canonical package를 발견·배포하고,
`Research Orchestration Contract`는 runtime이 skill을 활성화한 이후의 행동만 정의한다. runtime 이름,
설치 경로, invocation token은 A의 adapter/문서 책임이며 B로 유입시키지 않는다.

## 4. 설계 결정

- **D-1 — logical command 공용화:** 공용의 의미는 동일 문자열이 아니라 `deep-research` logical ID,
  canonical payload, 행동 계약의 동일성이다. 호출은 Claude `/deep-research`, Codex
  `$deep-research`, Gemini `auto skill 또는 /deep-research wrapper`로 노출한다(F-1~4).

- **D-2 — explicit/report-only:** `activation: explicit`, `sideEffects: report-only`로 등록한다.
  deep research는 일반 질문보다 비용·시간이 크고 사용자 확인 gate가 있으므로 intent 자동 활성화는
  부적합하다. 기본 결과가 문서 파일 생성이 아니라 채팅 조사 보고이므로 `docs-only`보다
  `report-only`가 의미상 정확하다.

- **D-3 — two-file canonical package:** `SKILL.md`에는 activation, 단계 순서, capability fallback,
  report-only boundary를 간결히 둔다. `references/research-contract.md`에는 source authority,
  evidence ledger schema, 충돌 처리, report/critic checklist를 둔다. skill은 시작 시 reference를
  전부 읽도록 지시하며 총 본문은 progressive disclosure 권장에 맞게 작게 유지한다.

- **D-4 — instruction-only:** script와 executable asset을 추가하지 않는다. 현재 요구는 판단·조사
  workflow이며 결정적 로컬 자동화가 없다. 후속에서 반복 가능한 기계 처리 필요가 실제로 확인될 때만
  script를 제안한다.

- **D-5 — brief confirmation:** 명시 호출 후에도 broad lookup/fan-out 전 research brief 확인을
  둔다. 주제가 없으면 주제만 질문하고 정지한다. 완전한 brief와 no-pause 지시는 확인으로 인정해
  불필요한 왕복을 줄인다.

- **D-6 — fan-out policy:** 2~3개의 genuinely independent, read-only, meaningful research lane만
  격리 위임한다. 현재 session이 hub이며 모든 lane 완료를 barrier로 삼는다. capability가 없거나
  작은 질문이면 순차 fallback하고 실제 독립성 상태를 보고한다.

- **D-7 — evidence/epistemic contract:** T1/T2 우선, time-sensitive claim live verification,
  claim-level direct link, source date/check date, facts/inference/recommendation/unverified 분리,
  conflict disclosure를 필수로 한다. live source가 없으면 context-only로 강등하고 최신 결론을
  확정하지 않는다.

- **D-8 — critic last barrier:** synthesis 초안 뒤가 아니라 모든 research/evidence lane이 끝난 뒤
  critic을 실행한다. 격리 capability가 있으면 independent critic, 없으면 current-session adversarial
  checklist + `not independent` 표기를 사용한다. 명백한 결함은 수정·재검한다.

- **D-9 — generated Gemini wrapper 유지:** 이번 slice는 기존 renderer가 canonical body와 text
  references에서 생성하는 wrapper를 사용한다. wrapper를 별도 편집하거나 제2 정본으로 만들지 않는다.
  native slash와의 충돌은 Phase 0 설치본 spike로 관찰하고, gap이 확인되면 이번 구현을 임의 확장하지
  않고 Open question으로 사용자에게 올린다(F-5).

- **D-10 — no production engine change:** 신규 package로 기존 dynamic lifecycle이 동작해야 한다.
  RED test가 실제 generic defect를 증명한 경우에만 최소 product change를 제안하며, 단순히 신규 ID를
  위한 switch/분기 추가는 금지한다.

- **D-11 — actual runtime dogfood:** 설치·인증돼 실제 사용할 수 있는 runtime 2종 이상에서 같은
  대표 조사 brief를 실행한다. 사용할 수 없는 target은 static deploy/contract test로 대체하고 skipped
  사유를 기록한다. 외부 유료 실행이나 새 설치가 필요하면 사용자 권한을 넓히지 않는다.

- **D-12 — retrieved content는 untrusted data:** 웹·문서·연결 source의 embedded instruction,
  tool/권한 요청, secret 전송 요구를 실행하지 않는다. credential·secret 외부 전송은 항상 금지하고,
  private context가 query에 필요하면 redact/minimize한 문안을 사용자에게 먼저 확인받는다. critic과
  malicious-source fixture가 이 경계를 검증한다.

- **D-13 — abstract tier routing + external binding:** source scout는 `economy`, coordinator와
  evidence researcher는 `standard`, synthesizer와 final critic은 `critical-reasoning`으로 요청한다.
  canonical package는 concrete provider/model ID나 가격을 소유하지 않고 runtime binding이 실제
  값을 정한다. 별도 선택 능력이 없으면 current-session fallback을 보고하되 final critic의 적대적
  체크리스트는 다운시프트하지 않는다.

## 5. 불변식

- **I-1:** canonical `deep-research` 정본은 한 벌이다. runtime별 복사본을 수동 편집하지 않는다.
- **I-2:** canonical skill/reference neutrality findings = 0. provider/model/runtime/tool 고유 토큰은
  사람용 docs·adapter test fixture에만 존재할 수 있다.
- **I-3:** policy는 explicit/report-only다. implicit activation과 기본 write side effect를 허용하지 않는다.
- **I-4:** research write side effect = 0. 저장·capture·code/config 변경·commit/push·외부 갱신은
  deep-research 실행의 일부가 아니다. host/project 규약상 의무 기록은 조사 완료 뒤 분리된 단계다.
- **I-5:** time-sensitive claim은 live-verified 또는 unverified다. 그 중간 상태를 사실처럼 쓰지 않는다.
- **I-6:** 모든 research lane 완료 전 synthesis/critic 금지. 실제 격리 위임 없는 independent 표기 금지.
- **I-7:** user/unmanaged asset overwrite·delete = 0. managed lifecycle만 갱신한다.
- **I-8:** 기존 `package-lock.json` 변경을 건드리지 않는다.
- **I-9:** Antigravity 전용 adapter와 신규 search/backend/UI/model-routing은 범위 밖이다.
- **I-10:** 구현은 contract RED → 최소 package GREEN → refactor/document → dogfood 순서를 지킨다.
- **I-11:** retrieved content는 evidence candidate일 뿐 instruction이 아니다. secret/private context의
  외부 query·source 유출 = 0.
- **I-12:** abstract tier mapping은 scout=economy, coordinator/researcher=standard,
  synthesizer/critic=critical-reasoning이다. concrete model ID는 canonical package에 0건이며 final
  critic의 silent downshift도 0건이다.

## 6. 영향 모듈

### 신규

| 파일 | 책임 |
|---|---|
| `templates/skills/deep-research/SKILL.md` | explicit activation, research workflow 순서, capability fallback, report-only boundary의 canonical 지시 |
| `templates/skills/deep-research/references/research-contract.md` | source authority, evidence ledger, conflict/epistemic labels, report format, critic checklist |

### 수정

| 파일 | 변경 |
|---|---|
| `templates/skills/catalog.json` | `deep-research: explicit/report-only` 등록 |
| `src/agents/skill-contract.test.ts` | canonical/reference 필수 절·neutrality·catalog policy·execution tier 정적 계약 RED 추가 |
| `src/agents/workflow-policy.test.ts` | explicit/report-only policy와 Claude/Codex deny-implicit metadata 계약 추가 |
| `src/agents/skills.test.ts` | production logical ID 6개, 세 target 배포, 멱등성, unmanaged 보호, deep-research metadata 검증 |
| `src/agents/commands.test.ts` | Gemini generated wrapper가 canonical body/reference와 `{{args}}`를 한 번 전달하고 호출 ID 목록에 포함됨을 검증 |
| `src/agents/workflow-docs.test.ts` | 세 runtime 호출 matrix, Codex bare slash 금지, 사용자 문서의 범위·fallback 설명 검증 |
| `scripts/workflow-lifecycle.test.mjs` | hard-coded 3 workflow lifecycle을 현행 packaged catalog 전체 또는 6개 workflow 계약으로 확장 |
| `README.md` | 설치된 packaged workflows와 runtime별 `deep-research` quick-start 갱신 |
| `docs/agents.md` | stale "정확히 세 개" 표현 정리, 현재 catalog/policy/invocation matrix 추가 |
| `docs/workflows.md` | 비개발자용 사용 흐름, 결과 구조, capability fallback, first-party 제품과 차이 설명 |
| `CHANGELOG.md` | 아직 버전을 매기지 않은 변경 내용에 provider-neutral deep-research workflow 추가 |

### 원칙적으로 변경하지 않음

- `src/agents/skills.ts`, `src/agents/commands.ts`, `src/agents/workflow-policy.ts`: 기존 generic
  구현을 그대로 재사용한다(D-10). RED가 generic defect를 증명할 때만 사용자에게 범위 변화를
  표면화한다.
- `package-lock.json`: user-owned dirty change 보존(I-8).

## 7. 구현 단계

### [x] Phase 0 — baseline·Live-Verify·runtime spike

1. 작업트리와 baseline test 상태를 기록하고 user-owned dirty 파일을 다시 확인한다.
2. F-1~5 공식 문서의 현재 계약을 재확인한다.
3. 설치된 runtime만 read-only로 발견해 Gemini native slash/generated wrapper 우선순위를 관찰할 수
   있는지 판단한다. 설치/로그인/유료 호출을 임의로 추가하지 않는다.
4. baseline failure가 있으면 이번 변경과 분리해 기록하고, unrelated fix로 scope를 넓히지 않는다.

### [x] Phase 1 — TDD RED: 계약·lifecycle·문서 테스트

1. core contract tests에 FR-1~12·14의 정적 필수 문구, neutrality, policy, tier routing을 먼저 추가한다.
2. lifecycle/invocation tests에 6번째 logical ID, 세 target, exact invocation, generated reference,
   idempotency/unmanaged protection을 추가한다.
3. docs test에 runtime별 호출·Codex bare slash 금지·비개발자 설명 계약을 추가한다.
4. 아직 package/docs가 없어 새 테스트만 기대한 이유로 실패하는 RED를 확인한다.

### [x] Phase 2 — canonical package GREEN

1. `catalog.json`에 explicit/report-only entry를 추가한다.
2. 표준 frontmatter(`name`, `description`)만 가진 provider-neutral `SKILL.md`를 작성한다.
3. `research-contract.md`를 작성하고 skill이 조사 시작 전에 이를 읽게 한다. 단계별 추상 등급과
   runtime binding/fallback을 provider/model ID 없이 명시한다.
4. core contract·policy·deployment tests를 통과시킨다. engine 코드 분기 없이 GREEN이어야 한다.

### [x] Phase 3 — 사람용 문서·catalog drift 정리

1. README, agents guide, workflows guide, CHANGELOG를 현재 catalog 6개 기준으로 갱신한다.
2. 공용 command의 의미, runtime별 호출, first-party 제품과 차이, explicit/report-only,
   capability fallback, Gemini/Antigravity 범위를 평이하게 설명한다.
3. docs tests를 GREEN으로 만든다. 이번 기능과 무관한 legacy/timestamp 문구는 정리하지 않는다.

### [x] Phase 4 — 통합 검증·도그푸드

1. 전체 unit/integration/lifecycle test와 build를 실행한다.
2. 임시 HOME/target roots에 seed→deploy→두 번째 deploy를 실행해 세 target 생성, canonical hash,
   unchanged, unmanaged preservation을 확인한다.
3. temp lifecycle이 clean하면 `make skills-deploy`로 현재 **managed runtime target**에 배포한다.
   이는 repository 파일 변경은 아니지만 사용자 runtime 상태 변경이므로 실행·대상·unmanaged skip을
   명시적으로 기록한다.
4. 대표 time-sensitive comparison brief로 사용 가능한 runtime 2종 이상을 실행한다. research brief
   확인, live sources, conflict/labels, final critic, report shape를 관찰한다.
5. Gemini 또는 다른 target을 실제 실행할 수 없으면 static contract 대체와 skipped 이유를 기록한다.

### [x] Phase 5 — self-review·검증 표기·goal-impl completion

1. 격리 critic이 FR/AC 1:1, TDD 증거, 정확성, 단순성/보안, Live-Verify를 적대적으로 검수한다.
2. 명백 결함을 수정하고 clean까지 재검한다. 기계적 문구 정리는 한 라운드로 배칭한다.
3. canonical package나 행동 계약을 수정했으면 최종 canonical hash로 temp lifecycle, installed managed
   redeploy, representative dogfood, write/security audit를 다시 실행한다. pre-fix 배포·증거를 완료
   근거로 재사용하지 않는다.
4. goal/spec/plan/tasks에 `[x]`와 근거를 남기고 OQ 해소/잔존 상태를 표기한다.
5. clean이면 AGENTS.md `goal-impl` 규약대로 feature branch commit·push·PR·CI 감시까지 수행한다.
   버전 숫자·tag·release는 이번 단계에서 만들지 않는다.

## 8. 테스트 전략 — AC 1:1

instruction-only workflow이므로 **정적 계약 테스트는 행동 규칙이 배포본에 존재함을 보장**하고,
**runtime dogfood는 실제 agent가 그 규칙을 따르는지 관찰**한다. 정적 문구 테스트만으로 model 행동을
증명했다고 주장하지 않는다.

| AC | 자동 검증 | 행동/도그푸드 증거 |
|---|---|---|
| AC-1 package contract | catalog loader 1:1, policy exact, packaged neutrality scan | target canonical hash 비교 |
| AC-2 runtime invocation | deploy result invocation exact + docs negative assertion | 실제 사용 가능 runtime의 help/discovery·호출 관찰 |
| AC-3 explicit metadata | Claude frontmatter, Codex `openai.yaml`, Gemini wrapper gate assertion | provenance 없는 runtime은 fresh confirmation 전 lookup/fan-out 0 확인 |
| AC-4 activation edges | skill 필수 gate 문구·fixture characterization | no-topic/quoted/negated/description-only에서 confirmation 전 action 0 |
| AC-5 brief confirmation | skill/reference 정적 contract | broad lookup 전 정지와 no-pause override 각각 관찰 |
| AC-6 live evidence | source tier·ledger·no fabricated source 문구 | time-sensitive claim의 직접 URL·확인일 검사 |
| AC-7 fan-out/barrier | independent/meaningful/read-only/2~3/barrier 문구 | 격리 가능 runtime fan-out 또는 truthful fallback 기록 |
| AC-8 conflict/labels | reference의 conflict·epistemic schema assertion | 충돌 source를 포함한 sample 결과 검사 |
| AC-9 degraded mode | context-only/live unavailable contract assertion | live capability 없는 fixture/role simulation |
| AC-10 report shape | report template 필수 heading assertion | sample report 가독성·claim 인접 link 검사 |
| AC-11 critic truthfulness | critic last barrier·independence label assertion | independent 또는 not-independent 실제 상태 기록 |
| AC-12 report-only | policy exact + 금지 action·untrusted-source·privacy 문구 assertion | malicious-source fixture + write/exfiltration 0건 확인 |
| AC-13 lifecycle safety | temp roots deploy twice, unmanaged fixture byte equality | seed/deploy 결과 요약 |
| AC-14 discoverability | workflow docs test의 호출·범위·fallback 문구 | 비개발자 관점 문서 review |
| AC-15 representative dogfood | — | 같은 brief를 가용 runtime 2종 이상에서 실행·비교 |
| AC-16 tier routing | canonical tier/role mapping·concrete model 금지 assertion | binding 적용 또는 truthful current-session fallback·final critic no-downshift 관찰 |

### 검증 명령 후보

- `npm test`
- `npm run build`
- repository가 제공하는 workflow lifecycle test command
- `make skills-deploy` 또는 temp root 환경변수를 주입한 `npm run --silent skills:deploy`

정확한 command는 구현 착수 시 `package.json`·Makefile의 현재 task-runner 정본에서 다시 확인한다.

- [x] **AC-1~3·13~14 자동 검증:** catalog/policy/adapter/docs/lifecycle 계약 테스트로 통과했다.
- [x] **AC-4~12 행동 검증:** activation, 대표 조사, conflict/degraded, malicious-source 감사로 통과했다.
- [x] **AC-15~16 runtime 검증:** Claude/Codex 공통 brief와 독립성·binding fallback 기록으로 통과했다.
- [x] **최종 회귀:** 전체 테스트 922/922, TypeScript build 및 `git diff --check`가 clean이다.

## 9. Rollback

신규 catalog entry와 package 디렉터리, 관련 test/docs 변경만 되돌리면 된다. 기존 runtime adapter와
**unmanaged 사용자 자산**은 손대지 않으므로 데이터 migration은 없다. 이미 배포된 managed
`deep-research` 산출물은 기존 marker-aware catalog prune 규약으로만 회수하며 unmanaged 동명 자산은
보존한다. clean에 도달하지 못하면 commit 전에 새 managed target을 회수하거나, 회수 불가 상태와
정확한 target을 사용자에게 stale deployment로 보고한다.

## 10. Open questions 처리

- **spec OQ-1:** Antigravity 정식 target 편입은 비목표로 유지하고 별도 SDD 후보로 남긴다.
- **spec OQ-2:** Phase 0에서 설치본이 있으면 dogfood한다. 없으면 미검증으로 남기고 이번 slice는
  existing generated wrapper 계약만 검증한다. 공식 문서 충돌을 임의 해석해 product logic을 바꾸지 않는다.
