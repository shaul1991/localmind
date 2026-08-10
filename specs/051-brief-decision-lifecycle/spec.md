# Spec — Brief/Decision Lifecycle v1

## FR-1 결정 대체 참조

`capture_note` 결정 입력은 optional `supersedes`를 받는다. 각 값은 C0/DEL, backslash, absolute path, `.`/`..`, 빈 segment를 포함하지 않는 `folder/relative.md` canonical path다. 중복은 거부한다. 새 결정의 target folder와 reference folder가 다르면 파일 생성 전에 fail-closed한다. 필드가 없으면 기존 Markdown bytes shape를 유지한다.

## FR-2 active decision resolution

현재 관련 검색 hit에서 구조화 결정 path를 고유화한 뒤 same-folder·existing-hit reference만 적용한다. source의 capture `date`가 target과 같거나 더 새로워야 한다. chain은 대체된 path를 모두 제외한다. cycle 참여자의 모든 outgoing edge, cross-folder, missing reference, timestamp 불명확·시간 역전 reference는 어떤 결정을 숨기지 않는다. 이는 잘못된 metadata가 현재 결정을 침묵시키는 것보다 중복 표시를 우선하는 fail-safe다.

## FR-3 brief precision

brief는 활성 결정마다 선택, 이유, 전제의 volatility, `last_verified`, 재검증 필요 여부를 구분해 보여준다. structured 및 legacy frontmatter 문자열은 정본을 수정하지 않고 bounded single-line projection으로 표시해 newline/control이 brief 구조나 낡음 신호를 위조하지 못하게 한다. 대체된 결정 수와 무시한 cycle/cross-scope 수는 원문 path 없이 lifecycle summary로 알린다. legacy fallback은 유지한다.

## FR-4 stale-on-contact

`brief`와 `search_notes`가 현재 hit에서 구조화 결정을 만났을 때 stale signal은 active decision에만 계산한다. signal은 기존 검색/brief 본문 뒤에 붙는 비차단 advisory다. superseded 결정의 오래된 전제가 단독으로 signal을 만들지 않는다.

## FR-5 folder scope isolation

notes root가 하나면 folder 생략을 기존처럼 허용한다. 둘 이상이면 `brief`는 explicit canonical folder label 없이는 검색 전에 오류로 종료하며 결정 내용/path를 반환하지 않는다. 알 수 없는 label도 fail-closed한다. 명시한 folder 결과에는 다른 folder 결정을 포함하지 않는다.

## FR-6 compatibility

일반 `capture_note`, `search_notes`, 단일 root brief, legacy decision parsing, tool 수와 MCP wire shape를 보존한다. 오래된 결정 note에는 migration이 필요 없다.

## Acceptance Criteria

1. safe supersedes roundtrip과 unsafe/duplicate rejection.
2. A←B←C chain에서 C만 active.
3. cycle participant의 제3자 edge와 과거→미래 edge도 적용하지 않음.
4. cross-folder capture는 파일 생성 0으로 거부.
5. 다중 root folderless brief는 content 없이 오류, scoped brief는 해당 folder만 표시.
6. superseded stale decision은 brief/search signal에서 제외.
7. brief가 활성 assumption의 마지막 검증 시점을 표시하고 frontmatter control/newline을 한 줄로 정규화.
8. 기존 living-memory·legacy suite와 전체 회귀가 GREEN.
