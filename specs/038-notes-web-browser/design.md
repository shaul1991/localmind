# Design: 노트 카드 브라우저 — 디자인 사전 정의

> 디자인·UI/UX 게이트(specs/026). 이 문서가 구현·ux-reviewer 검증의 정본이다.
> **034 디자인 시스템을 확장**한다 — 새 토큰·패턴을 만들지 않고 [034 design.md](../034-web-ui-monitoring/design.md)를 계승.

## 1. 디자인 시스템 패턴 + 페이지 구성

034의 **사이드바+콘텐츠 SPA·해시 라우팅**을 그대로. 사이드바 5번째 메뉴 **"노트"(`#/notes`)** 추가.

**페이지 구성(확정):**
```
┌ 사이드바(034) ┬─ 콘텐츠 영역(#/notes) ─────────────────────────┐
│ localmind     │  h2 "노트"                                      │
│ 대시보드      │  ┌ FilterBar (sticky top) ───────────────────┐ │
│ 설정          │  │ [🔍 검색 입력 flex-grow]   "1066개 중 60개" │ │
│ 에이전트      │  │ [decision][project][feedback]… 태그칩 wrap  │ │
│ 리포트        │  └────────────────────────────────────────────┘ │
│ ▶노트         │  ┌ Card Grid (auto-fill, minmax 260px) ───────┐ │
│               │  │ [NoteCard][NoteCard][NoteCard][NoteCard]    │ │
│               │  │ [NoteCard][NoteCard]…                        │ │
│               │  └────────────────────────────────────────────┘ │
│               │  [ 더 보기 (남은 N개) ]                          │
└───────────────┴──── NoteReader: 우측 슬라이드 패널(오버레이) ────┘
```
- **읽기 뷰 = 우측 슬라이드 패널(확정, 모달 아님)**: 그리드 위치·스크롤 유지한 채 본문 열람.
  근거: 목록 맥락 잃지 않음, 좁은 화면은 full-width로 자연 축소.
- **정렬(확정): 날짜 내림차순**(최근 먼저). 폴더·제목 정렬은 후속.

## 2. 디자인 토큰 — 요소별 적용 (034 상속, 신규 0)

034 토큰(`--color-*`,`--space-*`,`--radius-card`,`--font-*`)만 var()로 참조. 요소별 매핑:

| 요소 | 배경 | 테두리 | 텍스트 | 폰트 | 간격/치수 |
|---|---|---|---|---|---|
| Card Grid 컨테이너 | — | — | — | — | gap `space.md`(16) |
| NoteCard | surface | border → hover primary | text | — | padding `space.md`, radius.card(10) |
| · 제목 | — | — | text | font.title(600/18) | 2줄 clamp |
| · 폴더 배지 | surface | border | text.dim | font.caption(12) | radius 999, pad `xs sm` |
| · 날짜 | — | — | text.dim | font.caption | — |
| · 스니펫 | — | — | text.dim | font.body(14/1.6) | 3줄 clamp, margin-top `space.sm` |
| · 태그칩(카드 내) | bg | border | text.dim | font.caption | radius 999, pad `xs sm`, gap `xs` |
| FilterBar 검색입력 | surface | border → focus primary | text | font.body | pad `sm md`, radius.card, 높이 36 |
| FilterBar 태그칩 | surface | border | text.dim | font.caption | 활성=primary bg + on.primary |
| 결과 카운트 | — | — | text.dim | font.caption | — |
| "더 보기" 버튼 | surface | border → hover primary | primary | font.body | pad `sm md`, radius.card, 중앙 |
| NoteReader 패널 | surface | 좌측 border | text | — | width 480px(≤720px 화면 100%), pad `lg` |
| · 경로 | — | — | text.dim | font.mono(13) | — |
| · 본문 | bg | — | text | font.mono(13/1.6) | pre-wrap, 세로 스크롤 |
| 오버레이(패널 밖) | rgba(0,0,0,.4) | — | — | — | 클릭 시 닫힘 |
| 스켈레톤 | border(펄스) | — | — | — | 034 loading과 동일 |

## 3. 컴포넌트 정의 (치수·상태 확정)

### NoteCard
- 구조(위→아래): **제목**(2줄 clamp) → **메타 행**(폴더 배지 · 날짜, `space.sm` gap) →
  **스니펫**(3줄 clamp) → **태그칩 행**(wrap, 최대 1줄 높이 — 넘치면 `+N`). 짧은 노트도
  스니펫 영역 min-height 유지(그리드 정렬 안정).
- 역할=버튼: `tabindex=0`·`role=button`, Enter/Space·클릭 → NoteReader. hover/focus 시 테두리
  primary + 살짝 그림자(focus-visible 아웃라인 primary).

### FilterBar (sticky top, 배경 bg)
- 검색: `<input>` flex-grow, placeholder "제목·내용 검색", 200ms 디바운스 클라이언트 필터.
- 태그칩: 전체 태그(빈도순) 칩 wrap. 클릭=토글(활성 primary). 다중=OR. "전체" 해제 칩 포함.
- 카운트: 우측 "전체 N개 중 M개" (dim).

### NoteReader (우측 슬라이드 패널)
- 헤더: 제목 + 폴더/경로(mono, dim) + 닫기(X). Esc·오버레이 클릭·X 로 닫힘.
- 본문: **원문 텍스트, textContent(XSS 안전)**, `white-space: pre-wrap`, mono. 마크다운 렌더 후속.
- 상태: loading(스켈레톤 3줄) → success | error("본문을 못 불러왔어요 — 다시 시도").
- 진입/이탈: transform translateX 애니메이션(prefers-reduced-motion 존중 — 모션 최소화 시 즉시).

### 페이지 상태전이 (034 계승)
- `loading`(스켈레톤 카드 6) → `success`(그리드) | `empty`("아직 노트가 없어요") |
  `filtered-empty`("검색 결과가 없어요") | `error`("노트 목록을 못 불러왔어요 — make ui 확인").
- 대량: 초기 **60장** + **"더 보기"**(다음 60). 검색·태그는 **전체 메타**에 적용 후 상한 재적용.

## 3.5 반응형 · 인터랙션 · 접근성

- **반응형**: 그리드 `repeat(auto-fill, minmax(260px, 1fr))` — 넓으면 다열, 좁으면 1열. Reader는
  ≤720px에서 width 100%. 사이드바는 034의 기존 반응형 규칙 계승.
- **인터랙션**: 검색 디바운스 200ms · 태그 토글 즉시 · 카드 Enter/클릭 열기 · Esc 닫기 · "더 보기"
  누적 · 필터 변경 시 상한 60 리셋.
- **접근성**: 카드 키보드 포커스·Enter, 배지·칩 색+텍스트 병기, focus-visible 아웃라인,
  reduced-motion 존중, 대비는 034 토큰이 이미 AA.

## 4. 에이전트 실행 프롬프트

### frontend-dev(구현)에게
```
이 design.md를 정본으로 public/ui/에 notes 페이지(#/notes)를 구현하라.
- 034의 el/badge/card/api·CSS 토큰(var())만 사용 — 새 토큰·색·프레임워크 금지.
- 모든 동적 텍스트는 textContent 경유(제목·스니펫·본문·태그 — innerHTML에 데이터 금지, XSS).
- NoteCard 그리드 + FilterBar(검색·태그) + NoteReader(원문 텍스트). 상태전이 loading→success|
  empty|error, 카드별/페이지 독립, 에러엔 복구 안내.
- 대량: 초기 60 + "더 보기". 필터는 전체 메타에 적용.
- API는 /ui/api/notes·/ui/api/note만 호출, 저장 키를 Authorization에(401→KeyGate).
```

### ux-reviewer(점검)에게
```
구현을 이 design.md + 034 design.md와 대조하라 — ① 034 토큰 위반(하드코딩) ② 상태 가시성
공백(로딩/빈/에러, 복구 안내) ③ 접근성(카드 키보드 포커스·Enter, 색+텍스트 병기, 대비)
④ XSS(데이터가 innerHTML로 들어가는 곳) ⑤ 라이트/다크 양쪽. 위반은 파일:줄로 보고.
```

## 5. tokens.json

없음 — 034 토큰 상속, 신규 토큰 0.
