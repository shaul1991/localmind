# Plan — `make update` (specs/033)

## 도메인 경계

운영 스크립트 레이어(bash) — 기존 개념 재사용:

- **정본(source of truth)**: git origin이 기준인 것 — 코드 repo, NOTES_DIR 노트 repo.
- **파생물(derived)**: 정본에서 재생성하는 것 — dist/(빌드), 노트 인덱스(재인덱싱),
  페르소나/스킬 배포. 기기 간 비교 대상이 아니라 로컬 재생성 대상.
- 이웃 명령과의 경계: `device-sync`(원격 기기) / `recover`(새 기기) / `restore`(백업 복원,
  memory-import 포함) / **`update`(이 기기, memory-import 없음)**.

## 영향 모듈

- 신규: `scripts/update.sh`, `scripts/update.test.sh`, `specs/033-local-update/`
- 수정: `Makefile` — `update` 타깃 추가(##@ 백업/복구(git), device-sync 옆)
- 재사용: `scripts/lib/read-env.sh`, `scripts/lib/notes-dir.sh`(NOTES_DIR 정본 해석 —
  specs/019), `scripts/reindex.sh`, npm `agents:deploy`/`skills:deploy`

## 단계

- [x] 1. `scripts/update.test.sh` 작성 — 가짜 npm shim + 실 git 픽스처(bare origin + clone)로
  AC-1~9를 결정적으로 검증(red — 19 failed 확인 후 착수).
- [x] 2. `scripts/update.sh` 구현 — ① 코드 pull(ff-only)+조건부 빌드 ② 노트 pull(ff-only)
  ③ 재인덱싱→자산 배포 ④ 실패 요약. 전체를 main 함수로 감싼다(자기갱신 안전 — 크리틱이
  덮어쓰기 실험으로 실증). (green — self-review 반영 후 AC-10·11 추가, 최종 34/34)
- [x] 3. `Makefile`에 `update` 타깃 추가, help 노출 확인.

## 테스트 전략

- [x] **단위/통합(자동)**: `scripts/update.test.sh` — device-sync-pipeline.test.sh와 같은 패턴
  (PATH shim + 임시 git repo, 파괴-부재 검증 포함). AC 1:1 매핑. → 34/34 green
  (기본 bash + `/bin/bash` 3.2 양쪽, 2026-07-05).
- [x] **스모크(수동)**: 실제 기기에서 `make update` 1회 — 실 스택·실 노트 repo 대상(도그푸드).
  → m5에서 2회 완주(exit 0, 노트 repo 3곳 pull·재인덱싱·자산 배포 성공, 멱등 확인).
