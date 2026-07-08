# Goal — 이 기기 최신화 한 방 명령 (`make update`)

## Background

- specs/031이 **원격 기기** 최신화(`make device-sync HOST=...`)를, `make recover`가 **새 기기**
  통째 복구를 만들었지만, **지금 앉아 있는 기기 자신**을 한 방에 최신 상태로 만드는 명령은 없다.
  사용자는 `git pull` 여러 번 + `make reindex` + `make agents-deploy`를 손으로 조합해야 한다.
- 2026-07-05 대화에서 상태 판단 원칙이 확정됐다: **정본(source of truth)은 git origin 대비
  ahead/behind로 상대 판단**(코드 repo·노트 repo·설정), **파생물(derived)은 각 기기에서 자기
  정본과의 정합으로 절대 판단·재생성**(인덱스·임베딩·페르소나/스킬 배포).

## Problem

기기를 최신으로 맞추는 절차가 머릿속 체크리스트로만 존재한다 — 노트 repo만 pull하고 재인덱싱을
잊거나, 코드만 pull하고 빌드를 잊으면 "조용히 낡은" 상태가 된다(특히 비개발자는 조합 자체가 부담).

## Objective

`make update` 한 번으로 이 기기의 **정본을 origin 최신으로 당기고**(코드·NOTES_DIR 노트 repo),
**파생물을 그 정본에서 재생성**한다(빌드·재인덱싱·페르소나/스킬 배포). 로컬 작업물은 절대
파괴하지 않는다.

## Expected outcome

- 아무 기기에서나 `make update` 실행 → 정본 pull + 파생물 재생성이 순서대로 수행되고,
  단계별 성공/실패가 평이한 한국어로 표시된다.
- 실패한 단계가 있어도 나머지 단계는 진행되고, 마지막에 실패 요약 + 비0 종료 코드로 알 수 있다.

## Success metrics

- [x] `make update` 1회로 "코드 pull → (변경 시) 빌드 → 노트 pull → 재인덱싱 → 자산 배포"가
  모두 수행된다(수동 조합 0회). *(검증: 실기기 도그푸드 2회 완주 + spec AC-1~5)*
- [x] 로컬 변경/분기가 있어도 데이터 손실 0 (ff-only — 실패로 표면화될 뿐 덮어쓰지 않는다).
  *(검증: spec AC-6·AC-10 — 로컬 커밋·파일 보존을 테스트로 실증)*
- [x] 멱등: 이미 최신인 상태에서 재실행해도 안전하다. *(검증: spec AC-2 + 실기기 연속 2회 실행)*

## Non-goals

- **memory-import 하지 않는다** — 이 기기의 메모리 DB가 정본이고 백업 repo의 `memory.md`는
  파생 export다. update가 import하면 로컬에서 삭제한 기억이 부활한다(복원은 `make restore` 소관).
- **push 하지 않는다** — 백업 방향(로컬→origin)은 `make backup`/백업 레인 소관.
- 실행 중 docker 스택의 자동 재기동·이미지 재빌드(안내 메시지만 — `make up`).
- 원격 기기 최신화(specs/031 `make device-sync`)·새 기기 복구(`make recover`).

## Constraints

- pull은 **ff-only** — 로컬 커밋·변경을 자동 병합/rebase로 건드리지 않는다.
  - *개정(2026-07-08)*: **노트 repo에 한해** ff 불가 시 `pull --rebase` 폴백을 허용한다.
    여러 기기가 각자 백업 커밋을 만들면 분기가 일상적으로 생기는데(실사례: m5 vs 타 기기
    07-08 백업), 매번 수동 개입은 "한 방 최신화" 목표와 어긋난다. 데이터 손실 0 보장은
    유지 — 충돌이면 자동으로 rebase를 중단·원상 복구하고 실패로 표면화한다. 코드 repo는
    ff-only 그대로(로컬 분기는 실제 작업일 수 있어 자동 재적용하지 않는다).
- NOTES_DIR 해석은 기존 정본 규칙(scripts/lib/notes-dir.sh — 환경변수 → .env → 기본)을 재사용한다
  (specs/019 "조용한 부분 색인" 재발 금지).
- 메시지는 비개발자가 이해할 수 있는 평이한 한국어.

## Stakeholders

단일 사용자(설치한 개인 누구나 — 비개발자 포함), 여러 기기에 localmind를 둔 경우 각 기기에서 실행.

## Risks

- 자기 자신(scripts/update.sh)을 pull로 갱신하는 중 실행 파일이 바뀌면 셸의 지연 읽기로 오동작할
  수 있다 → 전체를 main 함수로 감싸 파싱 완료 후 실행한다.
- 노트 폴더가 git repo가 아닐 수 있다 → 조용히 건너뛰되 안내한다(오류 아님).
