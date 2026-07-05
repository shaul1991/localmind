# Spec: ask_brain Source Tracking

상위: [goal](goal.md)

## Scope

`ask_brain` MCP 도구가 답변 생성에 사용한 노트 청크의 출처를 응답에 포함한다.
관련 청크가 없는 경우(노트 기반 답변 불가)를 명시적으로 경고한다.

## Context

현재 `askBrain()` 흐름 (`brain.ts`):
1. `searchNotes(query, topK)` → 관련 청크 배열(각 청크에 `path`, `text` 포함)
2. 청크들을 컨텍스트로 LLM 프롬프트에 주입
3. LLM 응답 텍스트만 반환

`searchNotes()` 결과에 이미 `path` (파일 경로) 정보가 있으므로 추가 IO 없이 출처를 추출할 수 있다.

## Functional Requirements

- **FR-1 (출처 추출)**: `askBrain()` 이 `searchNotes()` 를 통해 청크를 찾으면
  청크의 `path` 에서 `폴더라벨/파일명` 형식으로 출처 목록을 구성한다.
  → goal: Objective (출처 포함)

- **FR-2 (출처 포함 응답)**: 관련 청크가 1개 이상 있으면 응답 말미에
  `\n\n[출처: work/project-note.md, life/memo.md]` 형태로 추가한다.
  → goal: Expected outcome

- **FR-3 (출처 없음 경고)**: `searchNotes()` 결과가 비어 있으면
  응답 말미에 `\n\n⚠️ 관련 노트 없음 — 모델 자체 지식 기반 답변` 경고를 추가한다.
  → goal: Expected outcome / Objective

- **FR-4 (중복 출처 제거)**: 같은 파일에서 여러 청크가 히트된 경우 출처 목록에서 중복을 제거한다.
  → goal: Expected outcome (출처 가독성)

- **FR-5 (반환값 확장)**: `askBrain()` 함수 반환값에 `sources: string[]` 필드를 추가해
  mcp-server.ts 가 응답을 조합할 수 있도록 한다.
  → goal: Constraints (구조 유지)

## Acceptance Criteria

- **AC-1**: Given `ask_brain("지난달 미팅 결론?")` 호출 시,
  When 관련 청크가 2개(work/meeting.md, work/notes.md에서)히트되면,
  Then 응답 텍스트 말미에 `[출처: work/meeting.md, work/notes.md]` 가 포함된다.

- **AC-2**: Given `ask_brain("화성 탐사 계획?")` 처럼 노트에 없는 주제 질문 시,
  When `searchNotes()` 결과가 빈 배열이면,
  Then 응답 말미에 `⚠️ 관련 노트 없음 — 모델 자체 지식 기반 답변` 이 포함된다.

- **AC-3 (엣지 — 중복 파일)**: Given 같은 파일에서 청크 3개가 히트된 경우,
  When 출처를 구성하면,
  Then 해당 파일이 출처 목록에 1번만 나온다.

- **AC-4 (엣지 — 경로 표시 형식)**: Given 절대 경로 `/home/<user>/.localmind/work/note.md` 가 히트 시,
  When 출처를 구성하면,
  Then `폴더라벨/파일명` 형식(`work/note.md`)으로 표시된다(절대 경로 노출 없음).

- **AC-5 (엣지 — 임베딩 서버 다운)**: Given 임베딩 서버 다운으로 `searchNotes()` 실패 시,
  When `ask_brain` 이 호출되면,
  Then 기존 오류 처리를 유지하고 출처 없음 경고를 포함한다.

## Open questions

- ~~출처 포맷: `[출처: ...]` vs `**참조 노트**: ...` 등 — 일단 `[출처: ...]` 로 통일.~~
- `topK` 기본값이 몇 개인지 확인 필요 — 출처 목록이 너무 길면 가독성 저하.
- `path` 에서 폴더라벨 추출: 현재 인덱스의 `folder` 필드를 활용할 수 있는지 `brain.ts` 코드 확인 필요.
