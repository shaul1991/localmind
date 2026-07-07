# Plan: 노트 카드 브라우저

<!-- 어떻게(how). spec FR→코드. 상위: [goal](goal.md) · [spec](spec.md) · 디자인: [design.md](design.md) -->

## 접근 요약
<!-- 핵심 기술 접근 1~2단락. -->

034 인프라를 최대한 재사용한다. 백엔드는 `brain.ts`에 **노트 메타 열거 함수**(각 노트 읽어 title·
tags·date·snippet 추출)를 추가하고, `routes/ui.ts`에 `/ui/api/notes`(목록)와 `/ui/api/note`(본문,
`report-note`의 경로안전 재사용)를 배선한다. 프론트는 `public/ui/`에 `#/notes` 페이지를 추가 —
기존 `el/badge/card/api`·토큰·상태전이를 재사용한 **NoteCard 그리드 + 검색/태그 필터 + 읽기 뷰**.
새 프레임워크·토큰·빌드 없음(Simplicity First).

## 도메인 경계 (DDD)
<!-- bounded context·경계. -->

- 이 작업은 **interface(웹 UI) + 얇은 조회**다. 도메인 모델 변경 없음. 신규 용어 없음.
- `brain.ts`(노트 열거·frontmatter 파싱 재사용) = 조회 소스. `routes/ui.ts` = inbound 어댑터.
  `public/ui` = 표시. 판정·쓰기 로직 없음(읽기 전용).

## 영향 모듈
<!-- 수정/신규. -->
- **수정** `src/brain.ts` — `listNotesWithMeta()` 신규(각 노트 title·tags·date·snippet 추출).
  frontmatter 제거·태그 파싱은 기존 조각 재사용/공유(중복 회피).
- **수정** `src/routes/ui.ts` — `GET /ui/api/notes`(목록+태그) · `GET /ui/api/note`(본문,
  경로안전은 `report-note` 헬퍼 재사용).
- **수정** `public/ui/index.html` — 사이드바에 "노트" 메뉴(`#/notes`).
- **수정** `public/ui/app.js` — notes 페이지 렌더(그리드·검색·태그·읽기뷰). 라우팅 등록.
- **수정** `public/ui/style.css` — NoteCard 그리드·태그칩·읽기뷰 스타일(기존 토큰 var()만).
- **신규 테스트** `src/*.test.ts` — 메타 추출(title 폴백·snippet·tags)·경로안전 거부 단위/통합.
- **무변경** 034 기존 엔드포인트·페이지 — 회귀 0 확인.

## 단계 (task 분해 가능)
<!-- self-review clean 후 [x]. -->
- [x] 1. **메타 추출 TDD**: `parseNoteMeta`·`listNotesWithMeta`. *5+블록태그+날짜방어 테스트. 심링크 리스팅 제외.*
- [x] 2. **경로 안전 본문 TDD**: `readNoteContent`. *4 케이스(유효·트래버설·라벨·심링크) green.*
- [x] 3. **라우트 배선**: `/ui/api/notes`·`/ui/api/note` in ui.ts. *도그푸드 API 실증.*
- [x] 4. **프론트 그리드·상태전이**: `#/notes` 카드 그리드 + 60상한+더보기. *도그푸드 스크린샷.*
- [x] 5. **검색·태그 필터·읽기뷰**: 클라이언트 필터 + 리더 패널. *도그푸드(검색·태그·읽기).*
- [x] 6. **일관성·보안·도그푸드**: var() 토큰·KeyGate·textContent·회귀. *실기기 도그푸드 + 크리틱
      self-review(중대 심링크 리스팅 수정 + 경미 5건 반영) → 재도그푸드(태그 상한 24 발견·수정).*

## 테스트 전략
<!-- AC→레벨. self-review 후 상태 채움. -->
| AC | 레벨 | 방법 | 상태 |
|---|---|---|---|
| AC-1 목록 | 단위+도그푸드 | 심링크 제외 테스트 + 실벌트 1089노트 | [x] |
| AC-2 메타 폴백 | 단위 | parseNoteMeta 5+블록+날짜 | [x] |
| AC-3 경로안전 | 단위 | 트래버설·심링크·라벨·유효 4건 | [x] |
| AC-4 그리드 | 도그푸드 | 스크린샷 렌더 | [x] |
| AC-5 검색 | 도그푸드 | 1089→7 | [x] |
| AC-6 태그 | 도그푸드 | design→1, 전체 칩 | [x] |
| AC-7 읽기 | 도그푸드 | 카드→우측 패널 본문 | [x] |
| AC-8 대량 성능 | 도그푸드 | 1089노트 60장 멈춤 없음 | [x] |
| AC-9 회귀·보안 | 단위+도그푸드 | 397 green + XSS 크리틱 clean + 라이트 도그푸드 | [~] 다크 시각 미검증 |

- 백엔드(메타 추출·경로안전)는 **단위/통합 TDD**. 프론트(그리드·필터·읽기)는 **도그푸드**가 본질
  (헌법 §8). XSS·토큰·상태전이는 ux-reviewer가 design.md 대조로 점검(디자인 게이트).

## Open questions
- 본문 렌더: v1 원문 텍스트(XSS 안전) 확정 제안 — 마크다운 렌더는 후속.
- 성능: 초기 상한 60 + "더 보기" 제안(가상 스크롤은 과설계).
