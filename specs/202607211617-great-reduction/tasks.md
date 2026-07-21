---
audience: both
---

# tasks — great-reduction

phase 선언 문법: `templates/skills/goal-impl/references/tasks-format.md`. 지도: inventory.md·
coupling.md(이 두 문서의 목록·절단선이 각 태스크의 파일 명세를 대신한다 — 전수 반복 안 함).

## Phase 0 — 안전망 (회수·기준 스냅샷)
> depends-on: 없음 · files: `specs/202607211617-great-reduction/evidence/memory-recovery.md`, `specs/202607211617-great-reduction/evidence/deploy-baseline.txt`

- [ ] **T0.1** openmemory 실데이터 확인 → export → 노트 회수(AC-7). 서비스 미기동·데이터 0이면
  그 사실을 기록(회수 0건). 회수 후에만 P2의 openmemory 코드 제거 허용.
- [ ] **T0.2** 배포 산출물 기준 스냅샷: `~/.claude/localmind-rules.md`·스킬 배포 산출물 해시
  기록(AC-3 비교 기준).

## Phase 1 — sdd-toolkit 추출 (로컬 repo)
> depends-on: Phase 0 · files: `specs/202607211617-great-reduction/evidence/toolkit-suite.md`, `specs/202607211617-great-reduction/evidence/deploy-parity.md`

- [ ] **T1.1** `~/personal/shaul1991/sdd-toolkit` git init → inventory Extract 목록 복사(src 44·
  scripts 11·templates 48·docs 5·문서 계약 테스트 7 + 검증 대상 문서 사본) → 최소 하네스
  (package.json·tsconfig·vitest·Makefile deploy 타깃·README 초안).
- [ ] **T1.2** sdd-toolkit 스위트 green(이전 테스트 전부) — 실패는 import 경로 수선으로만
  해결(로직 무변). evidence 기록.
- [ ] **T1.3** sdd-toolkit에서 rules·skills 배포 dogfood → T0.2 기준과 산출물 동등 확인(AC-3).

## Phase 2 — localmind 절제
> depends-on: Phase 1 · files: `src/`, `scripts/`, `templates/`, `docs/`, `Makefile`, `package.json`, `package-lock.json`, `docker-compose.yml`, `.github/workflows/ci.yml`

- [ ] **T2.1** Extract·Remove 파일 삭제(inventory 목록 전수) + templates/ 제거.
- [ ] **T2.2** 부분 절단(coupling 절단선): mcp-server 도구 14개 절제(AC-1 단언 테스트 선행 —
  RED 확인) → brain.ts suggestTags·게이트웨이 절 → ui-status 메타 import → update.sh 메타
  호출 절단 → Makefile·package.json(scripts·deps: express 등)·docker·CI 스텝.
- [ ] **T2.3** AC-2 grep 검증 스크립트 + AC-5 inventory 대조 스크립트 작성·실행 — 결정적,
  evidence 보존.

## Phase 3 — 문서 정합
> depends-on: Phase 2 · files: `README.md`, `docs/`

- [ ] **T3.1** Keep docs 12 개정 — 제거된 도구·서비스·타깃 언급 소거(FR-6, 역사 문서 제외).
  README를 축소된 표면(도구 3·stdio 단독·서비스 의존 최소)으로 재기술.

## Phase 4 — 통합 검증·도그푸드
> depends-on: Phase 2, Phase 3 · files: `specs/202607211617-great-reduction/evidence/suites.md`, `specs/202607211617-great-reduction/evidence/dogfood.md`

- [ ] **T4.1** localmind 전 스위트 green(AC-4) — 잔존 테스트가 Extract 모듈 참조 0.
- [ ] **T4.2** 재빌드 → stdio 실호출 도그푸드(AC-6): whoami·capture_note(태그 호출자 공급)·
  search_notes + query-log 증가 확인.

## Phase 5 — self-review·closure
> depends-on: Phase 4 · files: `specs/202607211617-great-reduction/goal.md`, `specs/202607211617-great-reduction/spec.md`, `specs/202607211617-great-reduction/plan.md`, `specs/202607211617-great-reduction/tasks.md`

- [ ] **T5.1** preflight → 격리 렌즈 critic(§7A 예산 2라운드) → clean → 문서 검증 표기 →
  commit·push·PR(머지는 사용자 게이트).
