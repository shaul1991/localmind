# Goal: 공급자 중립 AI 워크플로 자산

## Background

localmind는 `AGENTS.md`의 `/goal` 규약, 데이터 폴더의 `goal-ready`와 `sdd-self-review`
스킬, 페르소나 레지스트리를 통해 반복 가능한 AI 작업 방식을 관리한다. 그러나 현재 스킬 배포는
Claude Code 경로 하나만 지원하고, `goal-ready`는 패키지 템플릿이 아니라 한 사용자의 데이터 폴더에만
존재한다. Codex와 Gemini CLI는 현재 Agent Skills의 `SKILL.md` 형식을 지원하지만 localmind는 그
공통 계약을 활용하지 않는다.

명령 표면도 일관되지 않다. `/goal`은 저장소 규약에만 있고, `/goal-ready`는 Claude Code가 스킬
디렉터리를 slash command로 노출하는 관례에 의존하며, `sdd-self-review` 본문은 특정 도구명과 특정
모델 계열을 직접 지칭한다. 결과적으로 같은 정본을 가진 사용자라도 어느 AI 런타임을 열었는지에 따라
사용 가능한 워크플로, 호출 방법, 위임 가능 여부가 달라진다.

또한 2026-07-11 공식 재확인 결과 Claude Code v2.1.139+는 `/goal`을 session completion condition용 built-in
command로 예약한다. 현재 설치된 2.1.197에서 LocalMind가 같은 이름의 skill을 배포해 SDD 구현 command로
사용하면 precedence와 동작을 보장할 수 없다. provider-neutral parity를 위해 SDD 구현 logical ID는
충돌 없는 `sdd-implement`로 이관해야 한다.

2026-07-11 라이브 공식 문서 재확인 결과, Claude Code, Codex, Gemini CLI가 공유하는 안정된 최소
계약은 Agent Skills 표준의 `SKILL.md`다. 반면 네이티브 command와 subagent 파일 형식 및 호출 문법은
서로 다르다. 따라서 공통 행동을 하나의 정본으로 관리하고, 경로와 호출 문법 차이는 얇은 런타임
adapter가 담당해야 한다.

## Problem

1. `src/agents/skills.ts`는 `~/.claude/skills`에만 배포하므로 Codex와 Gemini CLI가 localmind
   워크플로를 발견하지 못한다.
2. `goal-ready` 정본은 현재 `~/.localmind/skills/goal-ready/`에만 있고
   `templates/skills/`에 없어 새 설치에서 재현되지 않는다.
3. `/goal`은 command asset이 아니라 `AGENTS.md`의 prose 규약이어서 런타임별 명시 호출 목록에
   동일하게 나타나지 않고, 최신 Claude Code built-in `/goal`과 의미/이름이 충돌한다.
4. 현재 스킬 본문에는 `Agent`, `AskUserQuestion`, `capture_note`, Claude/Codex 이름과 모델 계열
   전제가 있어 다른 런타임에서 같은 지침을 그대로 실행할 수 없다.
5. Claude, Codex, Gemini CLI의 native command 포맷이 다른데 이를 복사 하나로 해결하려 하면
   형식 오류, 인자 손실 또는 특정 런타임 종속이 생긴다.
6. 저장소에는 Gemini CLI가 `AGENTS.md`를 정본으로 읽도록 연결하는 `GEMINI.md`가 없다.
7. 현재 배포와 device-sync 검증은 Claude 산출물을 중심으로 작성되어 새 target이 빠져도 성공으로
   오인할 수 있다.
8. root `AGENTS.md`의 모델 역할 배치는 Opus/Sonnet/Haiku/Fable과 Claude 전용 subagent 예시를
   필수 실행 정책처럼 사용한다. `sdd-implement` skill만 중립화해도 이 규약을 읽는 Codex/Gemini runtime은
   같은 완료 절차를 모델 이름에 종속되지 않게 수행할 수 없다.

## Objective

- localmind가 소유한 packaged AI workflow command를 표준 Agent Skill 하나로 정의하고 Claude Code, Codex,
  Gemini CLI에서 같은 논리 이름과 같은 행동 계약으로 사용할 수 있게 한다.
- 기존 `/goal {NNN}` SDD 구현 규약을 collision-free logical command `sdd-implement`로 이관하고,
  `sdd-implement`, `goal-ready`, `sdd-self-review`를 패키지 정본과 데이터 정본에 모두 재현 가능하게 둔다.
- 공통 `SKILL.md`에서 공급자명, 제품 전용 tool 이름, 구체 model ID/alias를 제거하고 역할과
  capability, 명시적 fallback으로 행동을 표현한다.
- 런타임별 경로, 호출 문법, native wrapper는 adapter가 소유하게 하며 한 target의 실패가 다른
  target의 배포나 기존 사용자 자산을 훼손하지 않게 한다.
- `AGENTS.md`를 SDD 규약의 단일 정본으로 유지하면서 Claude Code와 Gemini CLI에는 얇은 import
  bridge를 제공한다.
- 실패 파장과 난이도를 추상 실행 등급으로 표현하고, 구체 provider/model 선택은 runtime이 가진
  capability에 맡기며 unavailable fallback을 보고하게 한다.
- 배포, backup/restore, recover, update, device-sync, 문서를 하나의 수명주기로 닫는다.

## Expected Outcome

사용자는 동일한 localmind 워크플로 정본을 한 번 관리한다. 배포 후 Claude Code에서는 `/goal-ready`,
Codex에서는 `$goal-ready`, Gemini CLI에서는 Agent Skill 자동 활성화 또는 `/goal-ready` wrapper로
같은 문서 준비 절차를 실행한다. SDD 구현은 Claude `/sdd-implement`, Codex `$sdd-implement`, Gemini
`/sdd-implement` generated wrapper + fresh confirmation으로 같은 논리 이름과 행동을 갖고,
`sdd-self-review`도 같은 원칙을 따른다. Gemini wrapper는 workspace에서 다시 찾은 skill을 신뢰하는
간접 포인터가 아니라 canonical workflow 본문에서 결정적으로 렌더한 파생 command다.

자동 description match는 side effect 권한이 아니다. `goal-ready`는 명시 호출 또는 분명한 문서 준비
의도에서, `sdd-self-review`는 명시 호출 또는 `sdd-implement`의 내부 위임에서 사용할 수 있다. 반면
commit/push/CI까지 갈 수 있는 `sdd-implement`는 runtime이 보증한 명시 호출과 정확한 3자리 spec 번호가
있을 때만 바로 시작한다. 그런 provenance를 제공하지 않는 runtime은 새 사용자 확인 turn을 거친다.
Claude/Codex의 deny-implicit metadata는 runtime enforcement이고, Gemini의 확인 절차는 generated prompt가
요구하는 behavioral guard다. Gemini 공식 API가 실행 전 hook이나 attestation을 제공하지 않는 상태에서
후자를 기술적으로 강제된 zero-tool guarantee라고 과장하지 않는다.

호출 문자까지 같다는 거짓 약속은 하지 않는다. Codex의 현재 공식 command 표면은 bare `/name`을
등록하지 않으므로, 성공 기준은 **논리 command ID와 행동의 동일성**이다. runtime-native 문법 차이는
배포 결과와 문서에 명시한다.

아키텍처/구현/review 역할도 특정 모델명이 아니라 실행 등급으로 요청한다. runtime이 별도 모델을 고를
수 없으면 현재 session이 같은 role checklist를 수행하고 fallback을 밝히므로 concrete model 부재가
workflow를 막지 않는다.

## Success Metrics

- [ ] **SM-1 (catalog)**: 패키지 `templates/skills/`와 데이터 폴더 `skills/`에 `sdd-implement`, `goal-ready`,
      `sdd-self-review` 세 표준 Agent Skill이 모두 존재한다. package activation manifest는 packaged skill
      directory와 1:1 schema 검증을 통과한다.
- [ ] **SM-2 (deterministic adapters)**: 같은 canonical skill에서 Claude Code용 skill, 공용
      `.agents/skills` skill, canonical body를 포함하는 Gemini CLI용 command wrapper와 지원되는
      side-effect invocation-control metadata가 결정적으로 생성되며 재실행 결과가 같다.
- [ ] **SM-3 (neutral workflows)**: 세 canonical `SKILL.md`의 workflow 본문에 공급자명, 구체
      모델명/ID, 런타임 전용 tool 이름,
      런타임 전용 argument placeholder가 0건이다.
- [ ] **SM-4 (`goal-ready`)**: `goal-ready`가 어느 런타임에서도 요구 조사, Live-Verify,
      goal/spec/plan 작성, critic review, 사용자 feedback/확인을 같은 순서와 stop condition으로 수행하도록
      characterization test가 고정된다.
- [ ] **SM-5 (`sdd-implement`)**: `sdd-implement`가 어느 런타임에서도 저장소 `AGENTS.md`와 해당
      goal/spec/plan을 읽고
      TDD, self-review,
      문서 체크, clean 시 commit/push/CI까지 같은 완료 계약을 적용한다. runtime-attested explicit
      invocation이 없으면 새 확인 turn을 요구한다. Claude/Codex는 deny-implicit runtime policy를,
      Gemini는 instruction-level confirmation contract와 그 한계를 정확히 표시한다.
- [ ] **SM-6 (review truthfulness)**: `sdd-self-review`가 특정 모델 계열의 존재를 전제로 하지 않고,
      가용하면 독립 컨텍스트 reviewer를 우선하며 main-session fallback과 추가 교차 검증의 실제 수행
      여부를 숨기지 않는다.
- [ ] **SM-7 (ownership)**: unmanaged 동명 skill/command는 변경 또는 삭제되지 않고, managed target의
      update/prune은 target
      별로 독립적으로 검증된다.
- [ ] **SM-8 (partial availability)**: Claude Code나 Gemini CLI가 설치되지 않은 환경에서도 공용 Agent
      Skill 배포와 다른 target은
      성공하며 누락 target은 평이한 사유로 표시된다.
- [ ] **SM-9 (lifecycle)**: backup/restore, recover의 기본/미러 지연 경로, local update, device-sync 후에도
      세 workflow와 target별 배포 상태가 재현된다.
- [ ] **SM-10 (verification honesty)**: Gemini CLI 미설치 기기에서는 live E2E를 성공으로 가장하지 않고
      정적 contract 검증과
      `skipped` 사유를 남긴다.
- [ ] **SM-11 (neutral execution policy)**: root `AGENTS.md`의 필수 역할 배치가 구체 provider/model/tool
      이름이 아니라 추상 실행 등급과 capability/fallback으로 표현되고, runtime에 특정 등급 선택 기능이
      없어도 workflow가 중단되지 않는다.

## Non-goals

- Claude Code, Codex, Gemini CLI의 built-in command(`/goal` session condition, `/clear`, `/help`, `/model`
  등)를 통일하거나 shadow하는 것
- 세 런타임에서 문자 그대로 동일한 invocation token을 강제하는 것
- deprecated Codex custom prompt를 새 command 기반으로 채택하는 것
- Make target, npm script, MCP tool, provider 설치 명령과 runtime built-in을 AI workflow command로
  재정의하거나 세 runtime에서 같은 문법으로 감싸는 것
- 사용자 또는 third-party plugin이 만든 skill/command를 localmind 정본으로 가져오거나 덮어쓰는 것
- 모든 페르소나 레지스트리를 이번 작업에서 Gemini agent 형식으로 전환하는 것
- localmind의 LLM gateway routing, chat completion backend 선택 또는 기본 모델을 변경하는 것
- 기존 persona registry 전체를 추상 실행 등급 schema로 마이그레이션하는 것. workflow가 persona를
  필수 전제로 하지 않게 만드는 범위까지만 수행한다.
- 특정 공급자나 모델의 품질, 가격, 한도 또는 우선순위를 추천하는 것
- Antigravity CLI 지원을 Gemini CLI 지원과 동일하다고 선언하는 것. 공식 계약과 로컬 실증이 안정된
  뒤 별도 adapter로 다룬다.
- 웹 UI를 추가하거나 변경하는 것

## Constraints

- 공통 workflow의 정본은 Agent Skills 표준 `SKILL.md`여야 한다. `name`과 `description`은 필수이고
  디렉터리명과 name이 일치해야 한다.
- runtime 차이는 adapter와 generated artifact에만 둘 수 있다. canonical workflow는 특정 provider,
  model, tool API가 없으면 실행 불가능한 구조여서는 안 된다.
- 호출 문법은 runtime 공식 계약을 따른다. 논리 command ID와 행동은 같게 유지하되 문법 차이를
  숨기지 않는다.
- mutating workflow는 prompt 문자열을 explicit invocation 증거로 보지 않는다. 공식 deny-implicit
  metadata가 있는 target은 이를 생성하고, 없는 runtime은 fresh user confirmation 전 side effect를
  금지하는 행동 지침을 생성한다. runtime hook이 없는 target에서 이 지침을 기술적 강제로 표현하지 않는다.
- manifest의 packaged logical ID는 예약 이름이다. 같은 이름의 markerless/non-equivalent data fork는 원문을
  보존하지만 어느 runtime target에도 배포하지 않고, 기존 name-bound managed 산출물만 fail-closed로
  retire한다. custom behavior는 예약되지 않은 이름으로 바꿔야 한다.
- user-level Gemini wrapper와 Codex/Gemini skill 설치는 higher-precedence 또는 동명 workspace asset이 없는
  경우에만 의도한 asset으로 resolve된다. shadowing/ambiguity/unverified 상태를 성공으로 과장하지 않는다.
- 기존 `LOCALMIND_SKILLS_DIR`, `LOCALMIND_CLAUDE_SKILLS_DIR`, managed marker, unmanaged 보호,
  backup 범위와 restore 흐름을 깨지 않는다. 계약을 개선할 때는 legacy 산출물 adoption 경로를 둔다.
- YAML frontmatter를 ad-hoc 문자열 파싱하지 않는다. Agent Skills 표준 호환을 위해 Phase 0에서 current
  license/Node compatibility를 다시 확인한 YAML 1.2 parser `yaml` 하나는 허용하고 zod로 결과를 검증한다.
  TOML wrapper는 fixed schema의 안전한 encoder로 결정적으로 생성하며 불필요한 dependency는 늘리지 않는다.
- canonical skill과 fixture에 실제 사용자 홈 경로, 개인 note 내용, token 또는 secret을 넣지 않는다.
- Gemini CLI는 현재 기기에 설치되어 있지 않다. 구현 완료 판정은 자동 정적/격리 테스트와 설치된
  runtime 실증을 구분하고, Gemini live 검증이 없으면 그 상태를 명시한다.
- 외부 runtime 형식은 구현 직전 최신 공식 문서로 다시 확인한다. 변했거나 확인할 수 없으면 adapter
  구현을 추측하지 않고 Open question으로 남긴다.
- 진행 중인 사용자 `Makefile` 변경과 기존 041~043 문서 작업을 수정, stage, revert 또는 commit하지
  않는다.
- 사용자 메시지와 오류는 비개발자도 이해할 수 있는 평이한 한국어로 작성한다.

## Stakeholders

- 단일 사용자: localmind를 설치한 개인 누구나(비개발자 포함)
- 여러 AI coding runtime을 병행하는 사용자
- workflow, SDD, self-review 규약을 유지하는 프로젝트 관리자
- localmind 설치, backup/restore, device-sync를 운영하는 사용자
- 후속 workflow와 runtime adapter를 추가할 개발자

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| native command 문법 차이를 동일하다고 과장 | 사용자가 존재하지 않는 command를 호출 | 논리 ID와 invocation을 분리하고 target matrix를 출력/문서화 |
| `sdd-implement`가 암시적으로 활성화 | 사용자 요청 없이 코드 변경, commit 또는 원격 side effect 발생 | Claude/Codex deny-implicit adapter metadata, unattested runtime의 새 확인 turn, Gemini behavioral-guard 한계 공개와 live 검증 분리 |
| Claude built-in `/goal`과 LocalMind workflow 충돌 | SDD 구현 대신 session goal이 설정되거나 command precedence 불명 | logical ID를 `sdd-implement`로 이관하고 `/goal`을 생성하지 않음 |
| 후속 runtime built-in이 packaged ID와 충돌 | 기존 invocation이 다른 기능 실행 | Phase 0 official command collision scan과 spec amendment stop gate |
| 최신 runtime 형식 변경 | 생성 산출물이 로드되지 않음 | Phase 0 live official verification과 adapter별 contract test |
| 공통 본문에 provider 용어가 다시 유입 | 다른 runtime에서 실행 불가 | canonical-only neutrality test와 critic review |
| target prune이 사용자 asset 삭제 | 복구 어려운 설정 손실 | 이름 결합 managed marker, unmanaged 충돌 보호, target별 prune 격리 |
| source와 generated wrapper가 함께 정본화 | 행동 drift와 이중 수정 | SKILL.md만 행동 정본, wrapper는 재생성 가능한 얇은 adapter |
| ad-hoc YAML frontmatter 파싱 | 유효 skill 오거부 또는 악성/복잡 입력 오해석 | 검증된 YAML 1.2 parser + zod, size/alias/tag 제한 |
| Gemini CLI 부재로 잘못된 green 판정 | 실제 환경에서 명령 미동작 | static/contract/live 검증 상태를 분리하고 skipped를 공개 |
| sdd-implement skill과 AGENTS.md 규약 중복 | 완료 규칙이 서로 달라짐 | AGENTS.md가 우선 정본, skill은 읽기/오케스트레이션만 소유 |
| role subagent가 runtime마다 다름 | workflow 결과 편차 | 역할 설명을 prompt로 전달하고 불가 시 main-session fallback + 수행 내역 보고 |
| root 실행 정책이 구체 모델명을 강제 | Codex/Gemini에서 같은 goal 완료 불가 | 파장 기반 추상 실행 등급으로 바꾸고 가용한 최상 capability/fallback을 기록 |
| 예약 ID의 markerless fork가 안전 metadata 없이 배포 | Gemini auto activation 또는 다른 runtime에서 오래된 mutating workflow 실행 | source bytes는 보존하되 reserved ID runtime 배포 금지, managed entrypoint retirement, rename 안내 |
| Gemini wrapper가 shared skill lookup에 의존 | workspace fork가 같은 이름/자기신고 hash로 다른 workflow 실행 | wrapper prompt를 canonical workflow에서 직접 생성하고 source hash는 감사 정보로만 사용 |
| Codex/Gemini workspace asset이 user asset과 충돌 | 같은 logical ID가 다른 workflow로 해석 | current-workspace resolution/ambiguity 경고, arbitrary future workspace에서는 parity를 보장하지 않는다고 명시 |
| Gemini 확인 지침을 runtime enforcement로 오해 | 모델이 확인 전 side effect를 낼 가능성을 숨김 | 정적 contract와 live E2E를 분리하고 `instruction-level` 상태 및 제한을 결과/문서에 표시 |
| 기존 007/019/031/033 수명주기 계약과 충돌 | 문서와 구현의 정본 불명확 | 044의 additive extension 포인터를 각 선행 문서에 추가 |
| 기존 018의 Claude-only 계약과 충돌 | 문서와 구현의 정본 불명확 | 044에서 대체 범위를 명시하고 018에 superseded 포인터 추가 |
