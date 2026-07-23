# change: restore-assets 배포 단계 — 소멸한 배포 스크립트는 정상 스킵

## Why (배경·문제)

great-reduction(2026-07-21)이 페르소나·스킬 배포(npm `agents:deploy`/`skills:deploy`, make
`agents-deploy`/`skills-deploy`)를 메타로 분류해 이관·소멸시켰는데,
`scripts/restore-assets.sh`의 `deploy_asset`은 이 스크립트들을 여전히 무조건 호출한다.
결과: 코어 전용 구성에서 **모든 복원·동기화가 "배포 실패 → 부분 완료(exit 1)"로 끝난다**
(2026-07-23 M1 device-sync에서 실측 — 코드·빌드·검증 전부 성공인데 매번 실패로 보임).
실패 안내문도 소멸한 `make agents-deploy`를 가리켜 사용자를 막다른 길로 보낸다.

## What (변경)

- `scripts/restore-assets.sh` `deploy_asset`: package.json에 해당 배포 스크립트가 **없으면
  정상 스킵**(0 종료, "코어 전용 구성" 안내). 있으면 기존대로 실행하고 실패 시 비0 유지
  (애드온이 배포 스크립트를 되살리면 자동으로 재개 — 추가 설정 불필요).
- 존재 판정 파일은 `LOCALMIND_PKG_FILE`로 격리 가능(기존 `LOCALMIND_ENV_FILE`과 같은 결 —
  테스트가 가짜 npm과 함께 스텁).
- 실패 안내문의 소멸한 타깃(`make ${name}-deploy`)을 실존 경로(`make restore`)로 정정.
- 파일 복원(restore_asset)·쿼리 로그 병합(merge_query_logs)·가드는 **불변**(외과적 변경).

## Acceptance Criteria

- [x] AC-1: 배포 스크립트가 package.json에 없으면 배포 단계를 스킵하고 0으로 종료한다
      (npm 배포 호출 0회, "배포 스킵" 안내 출력). *(검증: 신규 케이스 4어서션 RED→GREEN +
      실구성 도그푸드 — 스킵 ×2·exit 0)*
- [x] AC-2 (회귀): 배포 스크립트가 있으면 기존대로 실행 — 성공 시 0, 실패 시 비0(AC-14
      계승)과 복원·병합 동작이 전부 기존 테스트 green으로 유지된다. *(검증: restore-assets
      47/47 + 셸 전수 19파일 green — 기존 케이스는 배포 있는 pkg 스텁으로 원형 유지)*
- [x] AC-3: 실패 안내문이 소멸한 make 타깃을 가리키지 않는다. *(검증: 'make restore'로 정정,
      저장소 내 잔여 참조 grep 0)*

## 티어 근거

**Tier 1.** 국소 행동 변경(배포 단계의 스킵 조건 추가) — 계약·마이그레이션·보안·전역 상태
하드 신호 없음. 결정적 셸 테스트로 전체 커버·가역. 문서는 본 change.md 단일, critic은
in-session 적대 자기검증 1라운드. (일일 리듬 "회고당 변경 1개"의 예외 — 사용자 명시 지시
"지금 고쳐라", 2026-07-23.)

## 검증 기록 (self-review 후 기입, 2026-07-23)

- TDD: 스크립트 변경 stash로 구 코드 RED(신규 4어서션 중 2 실패 — 가짜 npm은 스크립트 부재
  실패를 재현 못 해 나머지 2는 통과, 한계 명시) → 구현 → restore-assets 47/47 GREEN.
- 셸 전수 19파일 green(CI 동일 루프) · npm test 189/189 · 기존 배포-경유 테스트(AC-11~15,
  recover 실행, e2e)는 배포 있는 pkg 스텁(LOCALMIND_PKG_FILE)으로 원형 유지 — 두 분기 모두 커버.
- 도그푸드(격리 env + 실 package.json 코어 전용): agents 복원 ✓ + "배포 스킵 — 코어 전용
  구성" ×2 + exit 0. 수정 전 동일 실행은 "배포 실패" ×2 + exit 1(M1 device-sync 실측과 동일).
- in-session 적대 자기검증 1라운드(**비독립 명시**): blocker 0. 엣지: grep이 키 아닌 문자열을
  오탐하면 기존(실행→실패 보고) 동작으로 수렴 — 악화 없음. PKG 부재 시 스킵(합리적 기본).
- 일일 리듬 예외 근거: 사용자 명시 지시("지금 고쳐라") — change.md 티어 근거 절에 기록.
