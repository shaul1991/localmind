---
title: Phase 3 dogfood 관찰 기록
audience: both
---

# T3.0 — 전체 스위트 (2026-07-21 06:1x)

- 1회차 1035/1036(1 fail — 간헐 플레이크 3번째, 로그 미포착) → 2·3·4회차 모두 **1036/1036 green**.
  typecheck clean. 플레이크는 이 diff와 무관한 세션 간 재발 패턴(기록: critic-efficiency 메모리).

# T3.1 — dogfood

- **preflight 자기 적용**: exit 0 (`✅ preflight 통과`).
- **retro §8 승계 컬럼 출현**: `| 형태 | 승계 |` — 기존 2 spec 모두 `-`(승계 없음, 정상 —
  carried-from 미기록 시대의 데이터).
- **판정 함수 소급 적용**(202607202152 r1→r2 실 diff 5파일, scratchpad/carryover-retro.ts):
  - rules-deploy 관찰(hermetic-costly, 의존 `scripts/rules-deploy.ts`·`src/rules/`) →
    **carryOver: true** — "당시 승계 가능했을 행" 실증(절감 잠재. 참고용 — 소급 개정 아님).
  - 전체 스위트(cheap) → 재실행("hermetic-costly가 아니면 항상 재실행").
  - 선언 부재 → 재실행(보수 기본). 교집합 존재(SKILL 의존) → 재실행(겹침 파일 명시).
- **이 slice 자체의 승계 발생 없음**: r1이 첫 라운드라 승계 조건이 성립하지 않는다 — 실전
  승계 관찰은 후속 Tier 2의 라운드 전환 + retro 텔레메트리 소관.
