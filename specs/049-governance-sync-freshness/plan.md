# Plan: 거버넌스 정본 동기 신선도 표시

> 모델 이력 — 작성: Opus 4.8 · 검토: Opus 4.8(critic) · 구현(예상): 미정

<!-- how. 048 패턴 재사용, 소규모 증분. -->

## 확정 사실 표 (F-n) — 재조사 금지·인용만

| ID | 확정 사실 | 근거 | 확인 |
|----|----------|------|------|
| F-1 | firstNotesDir()=이 기기의 첫 노트 폴더(=`~/.localmind`), rules/skills 정본 복제본 루트. 이게 git 클론이면 origin=localmind-backup | `src/agents/registry.ts` firstNotesDir · whoami(/root/.localmind) | 2026-07-16 |
| F-2 | 048 데이터 흐름: `routes/ui.ts` wrap()→`ui-status.ts` 수집기→ `/ui/api/*`(authMiddleware 뒤, 무토큰 401). 프런트 `pageGovernance` 3섹션 스택 | specs/048 (커밋 ecb3aa8) | 2026-07-16 |
| F-3 | git 메타: `<dir>/.git` 존재=클론 · `.git/FETCH_HEAD` mtime=마지막 fetch · `git -C <dir> log -1 --format=%cI/%h`=HEAD · `git -C <dir> remote get-url origin`=remote | git 표준 | 2026-07-16 |

## 도메인 경계

- interface(routes·SPA 배너) + infrastructure(git 메타 read) · 조회 전용 · 새 도메인 로직 0(048 계승).

## 영향 모듈

- **신규**: `src/ui-status.ts` `sourceSyncStatus()`(firstNotesDir git 메타, 네트워크 fetch 없음) ·
  `src/routes/ui.ts` `/source-sync` wrap() 배선 · `public/ui/app.js` `pageGovernance` 상단에
  `syncBanner()` 추가.
- **재사용(수정 없음)**: authMiddleware · card/badge/dim 컴포넌트·토큰.

## 단계

- **Phase 0 — Live-Verify**: F-3 git 명령·경로 재확인(경미). *(전제)*
- **Phase 1 — 수집기**: `sourceSyncStatus()` — firstNotesDir에서 `.git` 유무 판정, 있으면 FETCH_HEAD
  mtime·`git log -1`·`remote get-url origin` 수집(execSync, 네트워크 없음), 없으면 `{isGitRepo:false}`.
  git 명령 실패는 graceful(부분 반환). + 단위 테스트(git repo·non-git 임시 폴더). *(FR-1·4, AC-1·2)*
- **Phase 2 — 엔드포인트**: `/source-sync` wrap() 배선(401 = AC-5). *(FR-1, AC-5)*
- **Phase 3 — 배너**: `pageGovernance` 상단에 `syncBanner()` — git이면 `dim` "정본 마지막 동기 확인:
  <lastFetch> · HEAD <headDate>", 아니면 `badge("warn","정본 git 동기 안 됨 — 로컬 전용")`. read-only
  (컨트롤 0, textContent). *(FR-2·3, AC-3·4)*
- **Phase 4 — dogfood**: `make ui` → 배너 표시 확인(이 기기=git 클론 → 시점 표시). *(전 AC)*

## 테스트 전략

| AC | 검증 | 레벨 |
|----|------|------|
| AC-1·2 (git·non-git 메타) | 임시 git repo / 일반 폴더 | 단위(결정론) |
| AC-5 (401) | 엔드포인트 | route 테스트 |
| AC-3·4 (배너·read-only) | make ui | dogfood |

## 구현 담당

worker/backend-dev(수집기·엔드포인트) + frontend-dev(배너, 048 패턴). 소규모라 메인이 직접 가능.
self-review = critic(Opus). design.md 별도 불요(배지/dim 재사용, 신규 토큰 0 — spec Open questions 명시).

> **상태**: draft. lean SDD. `/goal 049` 또는 메인 직접 구현 후 critic self-review.
