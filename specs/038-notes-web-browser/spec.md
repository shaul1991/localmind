# Spec: 노트 카드 브라우저

<!-- 무엇을(what) 만드는가. 정확한 스키마·경로·매핑은 plan의 몫. 상위: [goal](goal.md) -->

<!-- 검증 표기: self-review clean 시 FR·AC를 [x] + 근거로. 미충족은 사유 부기(은폐 금지). -->

## Scope
<!-- 이번에 만드는 범위. goal의 Objective에 대응. -->

034 웹 UI에 `#/notes` 페이지 추가 — 전체 노트 카드 그리드 + 검색·태그 필터 + 본문 읽기. 백엔드는
노트 메타(제목·태그·날짜·스니펫) 목록 API + 본문 API(경로 안전). 편집·의미검색·그래프는 범위 밖.

## Context
<!-- 현재 상태·관련 시스템. -->

- `src/brain.ts` — `listNotes()`는 `{folder, path}`만 반환. `notesFolders()`가 폴더 루트 제공.
  frontmatter 파싱 조각(태그 어휘 수집·frontmatter 제거)이 이미 있음(재사용 가능).
- `src/routes/ui.ts` — `/ui/api/*`(overview·index·config·reports·report-note). `report-note`가
  경로 안전(심링크 거부) 패턴을 이미 가짐 → 노트 본문 API가 재사용.
- `public/ui/{index.html,app.js,style.css}` — 034 SPA. `el/badge/card/api`·해시 라우팅·토큰.
- 디자인 정본: [design.md](design.md)(034 시스템 확장 — NoteCard·notes 페이지).

## Functional Requirements
<!-- 각 FR 끝에 goal 추적. -->
- [x] **FR-1 (노트 목록 API)**: `GET /ui/api/notes` — 전체 노트 메타 배열 + 태그 목록 반환.
      *검증: `listNotesWithMeta`+`/notes`; 심링크 제외 테스트 + 도그푸드(실벌트 1089노트·23→상위24 태그).*
- [x] **FR-2 (메타 추출)**: title(frontmatter→`#`→파일명)·tags(인라인+블록)·date·snippet 추출.
      *검증: `parseNoteMeta`; `notes-browser.test.ts` 5+블록태그+날짜방어 케이스.*
- [x] **FR-3 (본문 API — 경로 안전)**: `GET /ui/api/note?path=` — 폴더 밖·심링크·트래버설 거부.
      *검증: `readNoteContent`; 4 케이스(유효·트래버설·라벨·심링크) + 도그푸드(트래버설 거부).*
- [x] **FR-4 (카드 그리드 페이지)**: `#/notes` NoteCard 그리드 + loading→success|empty|error.
      *검증: 도그푸드 스크린샷(그리드 렌더·상태전이 코드).*
- [x] **FR-5 (검색·태그 필터)**: 검색=제목·스니펫 즉시 필터, 태그 칩=해당 태그만.
      *검증: 도그푸드(검색 1089→7, 태그 design→1, "전체" 해제 칩).*
- [x] **FR-6 (본문 읽기)**: 카드 클릭 시 우측 슬라이드 패널로 본문(원문 텍스트, XSS 안전).
      *검증: 도그푸드(리더 패널 본문 표시).*
- [x] **FR-7 (대량 성능)**: 초기 60장 + "더 보기". *검증: 도그푸드(1089노트에서 60장 렌더, 멈춤 없음).*
- [x] **FR-8 (일관성·보안 계승)**: 034 토큰·KeyGate·읽기전용·로컬전용·빌드리스·외부요청0.
      *검증: CSS var() 토큰만, 크리틱 XSS clean, 읽기전용(GET only), 397 테스트 green(회귀 0).*

## Acceptance Criteria
<!-- Given-When-Then, 테스트 1:1. 엣지 포함. -->
- [x] **AC-1 (목록)**: *테스트+도그푸드: `/ui/api/notes`가 folder·path·title·tags·date·snippet +
      태그목록 JSON 반환(실벌트 1089노트). 심링크 제외 회귀 테스트.*
- [x] **AC-2 (메타 폴백)**: *테스트: `parseNoteMeta` — frontmatter 없으면 `#`헤딩/파일명, snippet
      본문 첫 텍스트. 5+블록태그+날짜방어 케이스 green.*
- [x] **AC-3 (본문·경로안전)**: *테스트: 유효 path 본문 O, 트래버설·심링크·라벨위조 거부(4 케이스) +
      도그푸드(트래버설 거부 응답).*
- [x] **AC-4 (그리드 렌더)**: *도그푸드: 카드 그리드가 제목·폴더·태그·날짜·스니펫과 렌더. empty/error
      상태전이 코드 존재(스크린샷).*
- [x] **AC-5 (검색)**: *도그푸드: "gemini" 입력 → 1089→7개 제목·스니펫 매칭.*
- [x] **AC-6 (태그 필터)**: *도그푸드: `design` 칩 → 1개, "전체" 칩으로 복귀. 필터 칩은 빈도 상위 24개.*
- [x] **AC-7 (읽기)**: *도그푸드: 카드 클릭 → 우측 패널에 본문(pre-wrap). 로드 실패 복구 안내 코드.*
- [x] **AC-8 (대량 성능 — 엣지)**: *도그푸드: 1089노트에서 초기 60장 렌더, UI 멈춤 없음. "더 보기" 증분.*
- [~] **AC-9 (회귀·보안 — 엣지)**: *XSS: 크리틱이 코드 검증 clean(모든 동적텍스트 textContent 경유).
      회귀: 397 테스트 green + 034 페이지·KeyGate 정상. **라이트 도그푸드 O / 다크 테마는 토큰 구조적
      커버(prefers-color-scheme + var())이나 시각 미검증 — 정직 표기.***

## Open questions
<!-- 해소분 취소선. -->
- ~~본문 읽기 원문 vs 마크다운 렌더~~ → **해소: 원문 텍스트(textContent, XSS 안전)**. 마크다운 렌더 후속.
- ~~정렬 기본값~~ → **해소: 날짜 내림차순**(구현·도그푸드). 폴더·제목 정렬 후속.
- ~~대량 성능 방식~~ → **해소: 초기 60 + "더 보기"**(도그푸드 1089노트 확인).
- **해소(self-review 발견)**: 필터 태그 칩은 **빈도 상위 24개만**(벌트 태그 수백 개 — 다 뿌리면 그리드를
  밀어냄. 재도그푸드로 발견·수정). 희귀 태그는 검색으로 커버.
- **미해소(후속)**: 다크 테마 시각 검증, NoteReader 포커스 트랩(현재 aria-modal+포커스 이동만),
  마크다운 렌더, 정렬 옵션.
