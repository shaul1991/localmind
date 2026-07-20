---
candidate-id: 4a12b0b8b04a2c623c2910c45914d738e9baf095
round: 1
independence: isolated-context
blockers: 0
advisories: 2
approval-needed: false
completion: clean
duration-minutes: 6
---

# Self-review round 1 merged report — clean

단일 격리 리뷰어. 판정: **완료 가능(clean)** — 치명·중대 0, 전체 스위트 1036/1036 ×3(플레이크
미재현), 6 AC 전수 mutation·실행 검증(AGENTS.md 구 문구 복원 시 presence+absence 핀 동시 fail
확인, overlap 무력화 시 AC-5 2케이스 fail — 핀 비공허 실증). spec FR-4의 "적극형 핀 2곳뿐"
실측 주장을 origin/main 대조로 사실 확인.

## Advisories (이월 — 후속 preflight 통합 슬라이스에서 수정 조건)

- A-1: `normalizeEvidencePath`가 `./`·중복 슬래시 미정규화 → false CARRY 방향(unsafe).
  완화: production 호출부 없는 reference impl + 실전 diff는 git canonical 출력. 통합 시
  tasks-format 1단계 정규화 전처리 일치 필수.
- A-2: `declaredDeps: []`(빈 배열)가 null(재실행)과 달리 무조건 CARRY — null vs [] 구분이
  load-bearing. 통합 시 빈 선언=null 매핑 또는 []=재실행 + 핀 테스트 필수.

미검증(정보성): dogfood 소급 적용의 scratchpad 스크립트는 미커밋 — judge 동작 자체는 리뷰어가
독립 probe로 확인. 이 slice에서 실전 승계 발생 없음(r1 첫 라운드 — 후속 텔레메트리 소관).
