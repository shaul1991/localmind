# Spec: 거버넌스 정본 동기 신선도 표시

> 모델 이력 — 작성: Opus 4.8 · 검토: Opus 4.8(critic) · 구현(예상): 미정

<!-- what. 048 거버넌스 페이지에 정본 동기 신선도 배너 추가. -->

## Functional Requirements

- **FR-1** — `/ui/api/source-sync` 엔드포인트: 로컬 `~/.localmind`(firstNotesDir)의 **git 메타**를
  반환한다 — `{ isGitRepo, remote, lastFetch, headSha, headDate }`. *(goal: Objective)*
- **FR-2** — 거버넌스 페이지 **상단에 신선도 배너**: git 동기면 "정본 마지막 동기 확인: <lastFetch> ·
  HEAD <headDate>", **git 동기 아니면 경고 배지**("정본 git 동기 안 됨 — 로컬 전용"). *(goal: SM1·2)*
- **FR-3** — **read-only**: 배너는 표시만, 동기(pull/update) 실행 컨트롤 없음. *(goal: SM3·Non-goal)*
- **FR-4** — **네트워크 fetch 없이** 로컬 git 메타만 사용(`.git/FETCH_HEAD` mtime·HEAD 커밋·remote URL).
  *(goal: Constraint)*

## Acceptance Criteria

- [x] **AC-1 (FR-1)** — Given `~/.localmind`가 localmind-backup git 클론, When `/ui/api/source-sync`,
      Then `{isGitRepo:true, remote(…localmind-backup…), lastFetch, headSha, headDate}`를 반환한다.
- [x] **AC-2 (FR-1·2)** — Given git 클론이 아닌 데이터 폴더(home-server식), When source-sync, Then
      `{isGitRepo:false}` → 배너가 **경고**로 표면화한다.
- [x] **AC-3 (FR-2)** — Given 거버넌스 페이지, When 로드, Then 상단에 동기 신선도 배너가 뜬다
      (git이면 시점, 아니면 경고).
- [x] **AC-4 (FR-3)** — Given 배너, When 둘러봄, Then 동기 실행 컨트롤이 **없다**.
- [x] **AC-5 (FR-1)** — Given 무토큰 요청, When `/ui/api/source-sync`, Then **401**.

## Open questions

- 없음(문구·표시 형식은 design 관례 재사용 — 배지/dim 텍스트, 신규 토큰 없음).

---

## 검증 결과 (2026-07-16 · /goal 049)

`sourceSyncStatus()` + `/source-sync` + `syncBanner()`. **605 테스트 green · tsc clean**. self-review(critic, Opus) **완료 가능** — 치명·중대 0.
- AC-1/2 단위 테스트(git 클론 메타 / non-git false), AC-5 route 401. AC-3/4 dogfood(m5: 배너에 "정본 마지막 동기 확인: … · HEAD b7e15c6b" 실표시, 컨트롤 0).
- critic 실증: 무네트워크(fetch/ls-remote 없음), "마지막 동기 확인"=FETCH_HEAD mtime(과대주장 없음, hint에 "같음 보장 아님" 명시), XSS 0(innerHTML 없음), subdir 오탐 realpath 가드, 회귀 없음.
