# 페르소나 에이전트 — 한 번 정의하고 Claude Code·Codex 양쪽에서 쓰기

> **TL;DR** — 노트 폴더 안 `agents/` 에 페르소나(역할·지침·모델)를 마크다운 한 파일로
> 정의하면, `make agents-deploy` 한 번으로 Claude Code 서브에이전트와 Codex
> 프로필/에이전트가 함께 만들어집니다. 정의 파일은 노트와 똑같이 백업·복원되므로
> 새 컴퓨터에서도 그대로 재현됩니다.
>
> - 정의: `~/.localmind/agents/이름.md` (파일 하나 = 페르소나 하나 · `NOTES_DIR`를 옮겼다면 **첫 노트 폴더** 안의 `agents/`)
> - 배포: `make agents-deploy` 또는 채팅창에서 "에이전트 배포해줘"(`deploy_agents`)
> - 목록: 채팅창에서 "어떤 에이전트 있어?"(`list_agents`)
> - 원칙: **정의 파일이 정본** — 배포로 만들어진 파일을 직접 고치면 다음 배포 때 덮어써집니다.

## 1. 페르소나 정의하기

**처음이라면 만들 필요가 없습니다** — `make agents-deploy`가 기본 페르소나 19종
(아키텍트·크리틱·워커·디자이너·백엔드/프론트엔드/앱 개발자 등)을 `~/.localmind/agents/`에 자동으로
채워 줍니다(specs/026 시드). 규칙 두 가지:

- 시드는 **없는 파일만** 만듭니다 — 이미 있는 정본(수정본 포함)은 절대 덮지 않아요.
- 시드된 정본은 자유롭게 편집해도 됩니다. "덮어써진다" 경고는 배포 산출물
  (`~/.claude/agents/`)에만 해당합니다 — 정본(`~/.localmind/agents/`)은 항상 여러분 것.

직접 새 페르소나를 만들 때는 샘플 복사가 쉽습니다:

```bash
mkdir -p ~/.localmind/agents
cp templates/sample-persona.md ~/.localmind/agents/my-persona.md
```

파일 형식(위 머리말 + 아래 본문 = 시스템 프롬프트):

```markdown
---
name: critic                  # 필수 — 소문자·숫자·하이픈만, 파일들 사이에서 유일
description: 적대 검증 리뷰어   # 필수 — 한 줄 설명
targets:                      # 필수 — claude/codex 중 최소 1개
  claude:
    model: opus               # opus·sonnet·haiku 별칭 또는 정식 모델 ID
    tools: Read               # (선택) 허용 도구
  codex:
    model: gpt-5.5
    reasoning_effort: high    # (선택) low·medium·high·xhigh
    sandbox: read-only        # (선택)
---
너는 적대적 리뷰어다. 결함을 찾으러 간다.
```

- 두 도구 중 한쪽에서만 쓸 페르소나면 `targets`에 그쪽만 적으면 됩니다.
- `agents/` 안의 파일은 노트 검색(`search_notes`·`ask_brain`)에 섞이지 않습니다.
- 노트 폴더를 여러 개 쓴다면 레지스트리는 **첫 번째 폴더**의 `agents/`입니다. 위치를
  직접 정하려면 `LOCALMIND_AGENTS_DIR`로 지정하세요(배포 대상 폴더도
  `LOCALMIND_CLAUDE_AGENTS_DIR`·`LOCALMIND_CODEX_HOME`으로 바꿀 수 있습니다 —
  [레퍼런스 › MCP 서버 환경변수](reference.md#mcp-서버--환경변수)).

## 2. 배포하기

```bash
make agents-deploy
```

무엇이 만들어지나:

| 대상 | 위치 | 쓰임 |
|---|---|---|
| Claude Code | `~/.claude/agents/<name>.md` | Claude Code가 서브에이전트로 인식 |
| Codex 프로필 | `~/.codex/<name>.config.toml` | `codex exec -p <name> "..."` 로 해당 모델·강도로 실행 |
| Codex 에이전트 | `~/.codex/agents/<name>.toml` | Codex 네이티브 서브에이전트(지침 포함) |

안전 규칙:

- **직접 만든 파일은 절대 건드리지 않습니다.** localmind가 만든 파일에는 페르소나
  이름이 새겨진 표식(`managed-by: localmind (persona: 이름)`)이 있고, **표식의 이름과
  파일명이 일치하는 파일만** 갱신·삭제합니다. 같은 이름의 직접 만든 파일이 있으면
  건너뛰고 알려주며, 배포 산출물을 **복사해 다른 이름으로 개인화한 파일**도 표식의
  이름이 달라 안전합니다. (새 페르소나를 만들 때는 산출물이 아니라 **정의 파일을
  복사**하는 것을 권장합니다 — 정의가 정본이니까요.)
- **멱등**: 몇 번을 실행해도 결과가 같습니다. 정의를 지우면 다음 배포 때 산출물도
  정리(prune)됩니다.
- 해당 도구가 설치되지 않은 컴퓨터(폴더 없음)에서는 그 대상만 건너뜁니다.
- 정의에 문제가 있으면(필수 필드 누락·이름 중복 등) 해당 파일만 건너뛰고 이유를
  알려주며, 이때 정리(prune)는 안전을 위해 함께 보류됩니다.

## 3. 백업·다른 컴퓨터에서 복원

`agents/`는 노트 폴더 안에 있으므로 별도 설정 없이 `make backup`에 포함됩니다.
새 컴퓨터에서는:

```bash
make recover RESTORE_REPO=<백업 repo url>   # 노트·메모리와 함께 agents/ 복원
make agents-deploy                          # 도구별 설정 재생성
```

## 4. localmind 자신도 페르소나에게 위임합니다 (런타임 위임)

페르소나를 배포해서 Claude Code·Codex에서 쓰는 것과 별개로, **localmind 런타임이
직접** 아래 4개의 고정 이름을 찾아 일을 맡깁니다. 해당 이름의 페르소나가 없으면
그 자동화만 조용히 건너뛰고 기존과 완전히 동일하게 동작합니다 — 이름이 정확히
일치해야 합니다(예: 합성 위임은 반드시 `librarian`).

| 이름 | 언제 | 하는 일 | 끄기 |
|---|---|---|---|
| `librarian` | 노트에 질문(ask_brain)할 때 | 답변 합성을 사서의 지침·모델로 수행 | `BRAIN_LIBRARIAN=off` |
| `critic` | ask_brain 답변 직후 | 답변의 사실·수치·인용을 **다른 계열 모델**로 대조 — 문제만 경고로 표시 | `BRAIN_VERIFY=off` |
| `curator` | 노트 캡처(capture_note) 때 | 태그를 골라 노트 머리말(`tags:`)에 기록 | `BRAIN_CAPTURE_TAGS=off` |
| `analyst` | `make report` 실행 때 | 검색 품질 집계를 해석해 리포트 노트로 저장 | (실행 안 하면 됨) |
| `analyst` | `make retro` 실행 때 | 작업 방식 회고 집계(커밋 패턴·OQ·결정 로그)를 해석해 회고 노트로 저장 — 제안까지만(규약 개정은 SDD 경유) | (실행 안 하면 됨) |

알아둘 것:

- **문제만 표시합니다.** 검증이 통과하면 아무 표시가 없습니다(기록은 쿼리 로그에 남음).
  경고는 "교차 모델의 추정"이며 최종 판단은 당신 몫입니다.
- **검증은 하루 50회까지**(기본값, `BRAIN_VERIFY_DAILY_LIMIT`)만 자동 수행합니다 —
  구독 사용량 보호. 시간 상한은 `BRAIN_VERIFY_TIMEOUT_MS`(기본 60초).
- **태그가 마음에 안 들면** 노트 파일에서 직접 고치세요 — 태깅은 캡처 때 한 번만
  하므로 수동 수정은 그대로 보존됩니다.
- **리포트 노트 주의**: `make report`(검색 품질)·`make retro`(작업 방식 회고)가 만드는
  노트(노트 폴더 `reports/`)에는 최근 검색 질의 원문·커밋 해시·결정 노트 제목이 담기고,
  노트라서 검색에도 잡히고 백업 저장소에도 커밋됩니다. 주기 실행은 `make report-cron`·
  `make retro-cron`.
- 위임이 실패하거나 느려도 본래 기능(답변·캡처)은 항상 완수됩니다.

## 5. 공급자 중립 AI 워크플로 자산 (specs/044)

localmind가 소유한 AI 워크플로는 **하나의 정본**(Agent Skills 표준 `SKILL.md`)에서
Claude Code·Codex·Gemini CLI로 안전하게 배포됩니다. "모든 command"는 **LocalMind가 소유한
packaged AI workflow command**만 뜻합니다 — Make/npm/MCP·설치 명령·런타임 built-in·사용자/
서드파티 command는 포함하지 않습니다.

**초기 워크플로 catalog(정확히 세 개)**:

| 논리 ID | 목적 | side effect |
|---|---|---|
| `goal-ready` | 개방형 요구를 조사해 goal/spec/plan을 만들고 확인을 받음 | docs-only |
| `goal-impl` | 준비된 SDD를 TDD로 구현·self-review·문서 체크·clean 완료 | mutating |
| `sdd-self-review` | 구현 결과를 적대적으로 review하고 완료 가능 여부 판정 | report-only |

행동 정본은 `SKILL.md` 하나이고, `AGENTS.md`가 SDD 구현 완료 규칙의 **최종 정본**입니다
(`goal-impl`는 읽고 조율할 뿐 복제 정본이 아님).

```bash
make skills-deploy    # 정본 시드 + Claude skill·공용 .agents skill·Gemini command로 다중 배포
```

**호출 문법은 런타임 공식 계약을 따릅니다**(논리 ID와 행동은 같고 문자만 다름):

| 논리 ID | Claude Code | Codex | Gemini CLI |
|---|---|---|---|
| `goal-ready` | `/goal-ready` | `$goal-ready` | auto skill 또는 `/goal-ready` wrapper |
| `goal-impl` | `/goal-impl <NNN>` | `$goal-impl <NNN>` | auto match 또는 `/goal-impl <NNN>` wrapper + 새 확인 |
| `sdd-self-review` | `/sdd-self-review` | `$sdd-self-review` | auto skill 또는 `/sdd-self-review` wrapper |

Codex 공식 계약에는 bare `/name` 등록이 없어 `$name`으로 표기합니다 — 존재하지 않는 slash
command를 약속하지 않습니다.

**활성화 권한과 enforcement 수준(정직하게 구분)**:

- `goal-impl`는 코드 변경·commit·push·CI까지 갈 수 있어, **runtime이 보증한 명시 호출 +
  정확한 3자리 spec 번호**(또는 provenance 없는 런타임에서 바로 앞 턴의 새 확인)가 있을 때만
  시작합니다. 프롬프트 안의 명령 문자열·생성된 요청 텍스트는 권한이 아닙니다.
- Claude Code·Codex는 생성된 deny-implicit metadata(`disable-model-invocation: true` /
  `agents/openai.yaml`의 `policy.allow_implicit_invocation: false`)로 암시적 활성화를
  **런타임이 강제(runtime-enforced)**합니다.
- Gemini CLI의 확인 절차는 생성된 프롬프트의 **지침 수준(instruction-level) 가드**입니다 —
  현재 공식 계약에 실행 전 hook이 없으므로 "도구 호출 0회"를 기술적으로 보장한다고
  과장하지 않습니다. Gemini의 auto 활성화도 consent 게이트를 우회하지 않습니다.
- `goal-ready`는 명시 호출 또는 분명한 문서 준비 의도에서, `sdd-self-review`는 명시 호출
  또는 권한 있는 `goal-impl`의 같은-턴 위임에서만 시작합니다.

**Claude built-in `/goal`과의 구분**: Claude Code v2.1.139+는 `/goal`을 session completion
condition(목표 문자열이 충족될 때까지 턴을 반복하는 지속성 루프)으로 예약합니다
(https://code.claude.com/docs/en/goal.md). 커스텀 skill이 내장 명령과 같은 이름을 쓰면 그
내장을 가릴(shadow) 수 있으므로(스킬 > 번들 > 내장 우선순위,
https://code.claude.com/docs/en/custom-skills.md), LocalMind의 SDD 구현 워크플로는 이름·의미가
다른 `goal-impl`로 운용하며 `/goal` skill/wrapper를 만들거나 built-in을 shadow하지 않습니다.
둘은 경쟁이 아니라 포개집니다 — 품질 게이트는 `goal-impl`이 맡고, 지속 실행이 필요하면
사용자가 `/goal <DoD 조건>`으로 바깥에서 감쌀 수 있으나 필수 전제는 아닙니다. 기존
`/goal {NNN}` 사용자는 같은 절차를 `goal-impl {NNN}`(위 표의 런타임별 문법)로 씁니다. (이름
변경 이력은 specs/051 참조.)

**소유권·안전**: 정본은 노트 폴더 `skills/`(백업 자동 포함)이고 각 런타임 배포본은
파생입니다 — 고칠 때는 정본에서. 이름 결합 managed marker가 있는 산출물만 갱신·정리(prune)
하고, 직접 만든 스킬/명령(마커 없음)은 건드리지 않습니다. 세 논리 ID는 **예약 이름**이라,
같은 이름의 non-equivalent fork(마커 제거·내용 변경)는 source는 보존하되 어느 런타임에도
배포하지 않고 기존 managed 산출물만 fail-closed로 retire합니다 — custom 동작은 다른 이름으로
rename하세요.

**결과 요약**: 각 항목은 논리 ID·target·status·호출을 평이한 한국어로 보여줍니다. status는
`created/updated/unchanged/pruned/recovered/skipped-unmanaged/skipped-unavailable/
skipped-dependency/problem`, 전체 결과는 `success`(exit 0)·`partial`(unavailable/unmanaged/
dependency skip·reserved fork retire가 있을 때, exit 0)·`failed`(source/파일시스템/복구 문제,
exit 1) 중 하나입니다. Claude Code나 Gemini CLI가 없어도 공용 `.agents/skills` 배포와 다른
target은 성공하고, 누락 target은 `skipped-unavailable` 사유로 표시됩니다.

**workspace 충돌(resolution evidence)**: user-level 설치는 임의 workspace에서의 호출 성공을
뜻하지 않습니다. current workspace를 주입하면 Codex repo `.agents/skills`·Gemini
`.gemini/commands`·workspace skill 충돌을 검사해
`resolved|equivalent-shadow|ambiguous-shadow|unmanaged-shadow|unverified`로 보고합니다.
충돌 자산은 수정하지 않으며, 미래의 다른 workspace까지 parity를 보장한다고 하지 않습니다.

**Gemini 검증 한계**: Gemini CLI가 설치되지 않은 기기에서는 정적 contract 검증만 수행하고
live E2E는 `skipped`로 남깁니다 — 정적 테스트를 live green으로 부르지 않습니다.

### self-review 교차 검증 (optional adapter — `localmind-review`)

`sdd-self-review`는 적대적 크리틱 검토를 필수로 하되, 사용 가능한 **추가 독립 검토 능력**이
있으면 실행합니다. 기존 `localmind-review`(codex/GPT 교차 검증) binary는 canonical `SKILL.md`가
전제하지 않는 **optional adapter/reference 계층**의 evidence transport로만 남습니다.

```bash
{ cat specs/<NNN>-*/spec.md; git diff; } | localmind-review   # 직접 실행도 가능
```

- **끄기**: `SDD_CROSS_REVIEW=off` — ask_brain 답변 검증을 끄는 `BRAIN_VERIFY`와는 **별개
  스위치**입니다. 미설치·프로필 없음·시간 초과면 그 검증만 "생략(사유)"로 표시되고 필수
  self-review는 계속됩니다 — 실제 독립성 상태(`isolated-context`/`cross-runtime`/
  `main-session-fallback`)를 과장 없이 보고합니다.
- 수정·재검 반복과 최종 commit은 `goal-impl` 흐름이 담당합니다(이 도구는 보고까지).

### 환경 변수 (source vs generated target)

| 변수 | 의미 |
|---|---|
| `LOCALMIND_SKILLS_DIR` | 워크플로 **정본(source)** 위치(노트 밖 지정 시 백업 제외 주의) |
| `LOCALMIND_CLAUDE_SKILLS_DIR` | Claude skill **배포 대상**(`~/.claude/skills`) |
| `LOCALMIND_AGENT_SKILLS_DIR` | 공용 Agent Skills **배포 대상**(`~/.agents/skills` — Codex·Gemini 공유) |
| `LOCALMIND_GEMINI_COMMANDS_DIR` | Gemini command **배포 대상**(`~/.gemini/commands`) |

정본만 백업에 포함되고, 생성 target은 restore/recover/update/device-sync에서 재생성됩니다.

## 6. 디자인 검증 도구 연동 (opt-in — specs/027)

디자인 작업(specs/026의 design.md 워크플로우)에 외부 도구를 붙이고 싶을 때의 안내입니다.
**전부 선택 사항**이고, localmind가 대신 설치·등록하지 않습니다 — 이 도구들은 opt-in
성격(전제조건·계정 의존)이 강하고, localmind가 검증하지 않은 외부 소프트웨어를 자동으로
끌어오지 않는다는 공급망 원칙 때문입니다. 아래 명령을 직접 실행해 연결하세요.

**정본 위계(가장 중요한 규칙)**: 어떤 도구를 붙이든 **design.md가 정본**입니다. Figma·
tokens.json은 참조·소비자일 뿐이며, Figma 변수와 design.md가 다르면 **design.md가
이깁니다.** Figma에서 가져온 값은 design.md에 반영해야 비로소 정본이 됩니다.

### Figma 공식 MCP (계정 필요 — 무료 플랜은 사실상 불가)

> ⚠️ **무료(Starter) 플랜은 월 6회 도구 호출**로 제한돼 실무 사용이 어렵습니다.
> 실사용에는 유료(Professional 이상) Dev/Full seat가 필요합니다(한도는 플랜에 따라 다름 — Figma 문서 확인).

```bash
claude mcp add --transport http figma https://mcp.figma.com/mcp
# 이후 Claude Code에서 /mcp 로 OAuth 로그인
```

- 활용: `get_variable_defs`로 기존 Figma 변수·토큰을 추출해 design.md 토큰 표로
  가져오기(1회성·수동 반영 — 자동 동기화 아님), `get_design_context`로 프레임 구조 참조.
- ⚠️ 커뮤니티(비공식) Figma MCP 서버들은 유지가 보증되지 않아 localmind가 권장하지
  않습니다 — 쓰더라도 직접 검토 후 자기 책임으로.

### 브라우저 검증 (Playwright MCP · Claude in Chrome)

> 전제: **실행 중인 로컬 UI**가 있어야 의미가 있습니다(design.md 문서 단계에선 불필요).

```bash
claude mcp add playwright -- npx @playwright/mcp@0.0.41   # 버전을 고정해 설치 권장
```

- Playwright MCP(Microsoft 공식·무료·로컬)로 스크린샷·접근성 검사·상호작용을 자동
  수집해 UX 리뷰어의 검증에 쓸 수 있습니다.
- Claude in Chrome(브라우저 확장)이 가용하면 라이브 화면·콘솔 확인에 활용됩니다 —
  환경에 따라 없을 수 있어 조건부입니다.
- UX 리뷰어 페르소나는 이 도구들이 없으면 제공된 스크린샷 대조(또는 정적 리뷰 +
  "실제 구현 미검증" 명시)로 폴백합니다 — 검증 계층은 ux-reviewer 정본 참고.

## 7. 프로젝트 계약 저장소 (바이브 코딩)

여러 도메인(백엔드·프론트·앱·인프라)이 함께 쓰는 프로젝트별 좌표 — API 형태, 환경 URL·
환경변수 이름, 용어 정리 — 를 노트 폴더의 `projects/<프로젝트 이름>/`에 축적합니다.
도메인 페르소나들이 작업 전에 이 문서들을 확인해, 세션이 바뀌어도 같은 계약으로 일합니다.

| 문서 | 담는 것 | 갱신 담당 |
|---|---|---|
| `context-map.md` | 프로젝트의 영역 구분과 관계, 관련 문서 위치 | 아키텍트 |
| `ubiquitous-language.md` | 용어집 — 용어·정의·금지 동의어 | 아키텍트(제안은 누구나) |
| `api-contract.md` | API 형태·상태 코드·에러 표면 | backend-dev |
| `environments.md` | 환경별 URL·환경변수 **이름**(값 금지!) | infra |

시작은 템플릿 복사:

```bash
mkdir -p ~/.localmind/projects/<프로젝트 이름>
cp templates/contracts/api-contract.template.md ~/.localmind/projects/<프로젝트 이름>/api-contract.md
```

- 문서가 없어도 작업은 진행됩니다("계약 문서 없음"을 알려줄 뿐). 문서가 있으면 그것이
  기준 — 코드와 다르면 계약이 이깁니다.
- ⚠️ **environments.md에 시크릿 값 금지** — 노트 폴더는 백업 저장소에 커밋됩니다. 값은
  프로젝트 `.env`에, 여기엔 이름·용도만.
- localmind 자체 개발에는 쓰지 않습니다 — 이 저장소는 specs/ 문서가 계약 역할을 하므로
  계약 저장소를 강제하지 않습니다.

## 8. 주의

- **민감정보 경고**: 페르소나 지침에 적은 내용은 백업 저장소에 그대로 커밋됩니다.
  비공개 repo라도 토큰·비밀번호 같은 민감정보는 넣지 마세요(백업 전반과 동일한 규칙 —
  [FAQ](faq.md) 참고).
- 어떤 페르소나를 어떤 역할·모델로 둘지의 구성 예시는 [personas.md](personas.md)를
  참고하세요(이 저장소를 개발하며 쓰는 구성의 정본).
