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

`~/.localmind/agents/` 폴더에 `.md` 파일을 만듭니다. 시작은 샘플 복사가 쉽습니다:

```bash
mkdir -p ~/.localmind/agents
cp templates/agents/sample-persona.md ~/.localmind/agents/critic.md
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

## 4. 주의

- **민감정보 경고**: 페르소나 지침에 적은 내용은 백업 저장소에 그대로 커밋됩니다.
  비공개 repo라도 토큰·비밀번호 같은 민감정보는 넣지 마세요(백업 전반과 동일한 규칙 —
  [FAQ](faq.md) 참고).
- 어떤 페르소나를 어떤 역할·모델로 둘지의 구성 예시는 [personas.md](personas.md)를
  참고하세요(이 저장소를 개발하며 쓰는 구성의 정본).
