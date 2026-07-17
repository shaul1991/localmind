# 직군별 워크플로우 — 내 직군, 바로 실행

> 내 일에 localmind가 어떻게 쓰이는지 직군별 예제로 체감하기. 각 직군의 상황→활용→효과는
> 👉 [직군별 유즈케이스(19 페르소나)](../examples/use-cases.md), 모든 예제는 [examples/](../examples/).

`make up` 후 **내 직군 스크립트 하나만 돌리면** localmind 활용이 한 번에 체감됩니다. 전부 실행·검증됨.

| 그룹 | 바로 실행할 워크플로우 |
|---|---|
| **개발** | [백엔드](../examples/workflow-backend.py) · [프론트](../examples/workflow-frontend.mjs) · [앱/모바일](../examples/workflow-mobile-i18n.py) · [게임](../examples/workflow-game-content.py) |
| **데이터/ML** | [ML 엔지니어](../examples/workflow-ml-index.py) · [데이터 분석](../examples/workflow-data-analysis.py) |
| **품질·설계·운영** | [QA](../examples/workflow-qa-testcases.py) · [아키텍트](../examples/workflow-design-review.py) · [인프라/SRE](../examples/workflow-infra-runbook.mjs) |
| **비개발** | [PM](../examples/workflow-pm-spec.py) · [테크니컬 라이터](../examples/workflow-docs-draft.mjs) · [보안](../examples/workflow-security-triage.py) · [연구자](../examples/workflow-research-synthesis.mjs) |
| **콘텐츠** | [AI 글작성](../examples/workflow-ai-writer.py) · [유튜브 대본](../examples/workflow-youtube-script.py) · [유튜브 편집](../examples/workflow-youtube-edit.py) · [썸네일](../examples/workflow-thumbnail-copy.py) · [인플루언서](../examples/workflow-influencer-repurpose.py) |
| **1인 개발** | [풀스택 투어](../examples/workflow-solo-stack.sh) |

## 실제 플로우 예시 — 어떻게 쓰고, 무엇이 쌓이는지
실행 중인 스택에 그대로 태운 두 직군. 응답·저장 데이터 모두 **실제 출력**입니다.

**백엔드 개발자** — 로그 요약 → 분류(perf) → 대응 결정을 노트로 적재 → `NOTES_DIR`에 **.md 정본이 쌓임**(이후 검색·RAG 대상)

![백엔드 플로우](flow-backend.gif)

**기획자(PM)** — 결정을 `remember`로 mem0에 저장 → PRD 초안 → 2주 뒤 `recall`로 **의미 회상**(결정·이유가 **기억으로 쌓임**)

![PM 플로우](flow-pm.gif)

## 페르소나/모델 바인딩 온보딩 (`localmind-binding`)

> 위 표의 워크플로우들과는 성격이 다른 절입니다 — "직군별 예제"가 아니라, `goal-ready`·
> `sdd-implement`·`sdd-self-review` 같은 localmind의 AI 워크플로 스킬이 **실행 등급별로 어떤
> 모델을, 역할별로 어떤 페르소나를 쓸지**를 이 설치(런타임)에 맞게 정하는 온보딩 절차입니다
> (배포·스킬 전반은 [agents.md](agents.md) §5 참고).

### 무엇을 하는 스킬인가

`localmind-binding`은 AGENTS.md "실행 등급 배치"의 추상 등급 3종
(`critical-reasoning`·`standard`·`economy`) 각각에 쓸 구체 모델과, 역할(architect·critic·
worker 등)별로 위임할 페르소나를 확정하는 **온보딩·재설정 전용 스킬**입니다. 명시적으로
호출했을 때만 시작합니다(예: Claude Code에서 `/localmind-binding`).

1. 이 세션이 지금 돌고 있는 런타임을 스스로 파악해 식별자(runtime-id, 아래 표)를 보여주고
   확인받습니다.
2. 재설정이면 기존 바인딩을 요약해 보여주고 바꿀 항목만 고르게 합니다 — 손대지 않은 항목은
   그대로 보존합니다.
3. 등급별 모델 추천 초안을 제시합니다 — 예를 들어 Claude 계열 세션이라면 critical-reasoning에
   Opus 계열, standard에 Sonnet 계열, economy에 Haiku 계열 같은 식입니다. **이 추천은 세션의
   지식 시점에 따라 낡을 수 있으므로**, 실제로 저장되는 값은 어디까지나 그 자리에서 사용자가
   확정한 값입니다.
4. 페르소나 레지스트리(`~/.localmind/agents/`)를 나열해 역할별로 쓸 페르소나를 확정받습니다.
   페르소나 정의가 하나도 없으면 이 단계는 사유를 안내하고 건너뛰며, 등급 설정은 그대로
   이어집니다.
5. 레지스트리에 없는 페르소나 이름은 저장하지 않고 다시 고르게 합니다. 등급·역할 일부만
   채운 설정도 유효합니다(전부 채우도록 강요하지 않습니다).
6. 확정된 값을 저장하고, 무엇이 어떻게 저장됐는지 평이한 말로 요약해 보여줍니다.

### 저장 위치 — 런타임별 로컬 파일, 백업 제외

바인딩은 `~/.localmind/_bindings/<runtime-id>.json`에 **런타임(설치)당 파일 하나**로
저장됩니다(노트 폴더를 옮겼다면 첫 노트 폴더 아래). 파일명 접두 `_`는 이 저장소의 "기본
로컬·미커밋" 컨벤션이며, `_bindings/`는 `make backup`의 gitignore 시드 목록에 포함돼 **백업
저장소에 커밋되지 않습니다** — 실행 등급별 모델 선호는 기기·설치마다 다를 수 있는 로컬
설정이기 때문입니다.

### 왜 런타임마다 따로 설정하나

같은 컴퓨터 안에서도 Claude Code·Codex CLI·Gemini CLI처럼 런타임(설치)마다 **실제로 쓸 수
있는 모델의 종류·이름이 다릅니다.** 한 런타임에서 확정한 등급→모델 매핑을 다른 런타임에
그대로 옮기면 존재하지 않는 모델을 가리키게 될 수 있어, 온보딩은 설치마다 별도 파일로
분리하고 서로의 값을 대신 읽지 않습니다. 같은 종류의 런타임이라도 다른 컴퓨터에 새로
설치했다면 그 설치에서 다시 한 번 온보딩을 실행해야 합니다 — 이 "격리"는 오류가 아니라
의도된 설계입니다.

### runtime-id 정규 표

온보딩은 세션이 스스로 자기 런타임을 판단해 소문자 kebab-case 식별자를 제안하고 사용자
확인을 받습니다. 표기가 흔들리기 쉬운 지점이라 알려진 런타임의 권장 id를 아래에 고정합니다
— 온보딩 세션이 아래와 다른 id를 제안하면 이 표의 값으로 정정해 확인하세요:

| 런타임(설치) | 권장 runtime-id |
|---|---|
| Claude Code | `claude-code` |
| Codex CLI | `codex` |
| Gemini CLI | `gemini-cli` |

위 표에 없는 런타임(향후 추가되는 Agent Skills 호환 도구 등)은 제품명을 소문자 kebab-case로
바꾼 값을 그대로 씁니다. 애매하면 세션이 추측하지 않고 사용자에게 직접 물어 확정합니다.
