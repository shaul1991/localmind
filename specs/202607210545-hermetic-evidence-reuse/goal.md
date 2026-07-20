---
audience: both
tier: 2
tier-rationale: >
  하드 신호 2건 — 검증 워크플로 계약 변경("적극형 무효화-스킵 미도입" 원칙의 조건부 개정:
  AGENTS.md critic 캐싱 절·sdd-self-review·goal-impl §7A + 계약 테스트 핀 동반 개정) +
  크로스커팅(모든 Tier 2 self-review 라운드 전환에 영향).
---

# goal — P4: 라운드 간 hermetic evidence 조건부 승계

## Background

- **계보**: specs/202607201808(critic 효율화)이 P4를 명시 보류했다 — "verdict 승계·hermetic
  evidence 재사용은 규약 개정이 필요한 별도 슬라이스". 외부 조사(같은 spec evidence)가 그 안전
  조건을 확인했다: **"안 닿은 것 스킵"은 hermetic(결정적) 검증에만 sound하다**(Bazel/Infer —
  예외 없이 결정적 검증 전제 + 의존성 그래프 무효화). LLM verdict는 non-hermetic이므로 승계
  불가·전량 재검증 유지가 이론적으로 옳다는 것도 같은 조사의 결론이다.
- **실측 동기**: 텔레메트리 2건 — 202607202152 r1→r2에서 도그푸드성 실행(rules-deploy 관찰
  등)이 문서-만 수정된 라운드 전환에도 재실행됐다. 라운드 전환 수정이 evidence의 의존 파일과
  교집합이 없을 때의 재실행은 정보 가치 없이 시간만 소모한다.
- **권고 오버라이드(정직 기록)**: AI 권고는 "텔레메트리 축적 후 판단"(데이터포인트 2개)이었으나,
  사용자가 2026-07-21 설계 착수를 명시 결정했다 — 설계 근거(hermetic-only sound skip)는 이미
  조사로 확인됐고, 효과 측정은 도입 후 텔레메트리로 수행한다.

## Problem

라운드 전환(blocker 수정 → 새 candidate) 시 **모든** evidence가 무효로 취급된다 — 수정 diff가
해당 evidence의 의존 파일과 전혀 겹치지 않아도, 재실행 비용이 높은 결정적 산출(격리 시나리오
도그푸드·배포 관찰)까지 재실행된다. 반면 규약은 "적극형 무효화-스킵은 도입하지 않는다"로 이
최적화 자체를 봉쇄하고 있어, sound한 조건부 승계조차 규약 위반이 된다.

## Objective

**verdict 전량 재검증(보수형)은 불변으로 유지**한 채 — 라운드 전환 시 (1) **재실행 비용이 높은
결정적(hermetic) evidence에 한해**, (2) **matrix 행의 의존 파일 선언과 수정 diff의 교집합이
공집합일 때만**, 직전 라운드의 실행 결과를 승계할 수 있도록 규약을 조건부 개정하고 절차를
명문화한다. 선언 누락·교집합 존재·비결정적 산출은 무조건 재실행(보수 기본).

## Expected outcome

- matrix 행에 evidence 의존 파일을 선언하는 문법이 생기고, sdd-self-review가 라운드 전환 시
  "diff ∩ 의존 = ∅ AND hermetic AND 고비용"인 evidence만 승계 표기(출처 라운드 명시)한다.
- 전체 테스트 스위트·typecheck·preflight는 **항상 재실행**(저비용 — 승계 대상 아님).
- critic의 행 검토(verdict)는 여전히 전 행 수행 — 승계된 evidence도 critic이 "승계 타당성
  (의존 선언의 정확성 포함)"을 검증한다(도장찍기 금지 연장).
- AGENTS.md·양 SKILL의 "적극형 미도입" 문구가 조건부 허용으로 개정되고 계약 테스트 핀이 새
  문구를 강제한다.

## Success metrics

- 개정 규약·절차가 계약 테스트로 핀되고 전체 스위트 green(기존 verdict 재검증 핀 불변).
- 승계 판정 로직(순수 함수)이 테스트로 실증: 교집합 공집합→승계 가능, 교집합 존재/선언 누락/
  저비용 유형→재실행.
- 다음 Tier 2 실행의 라운드 전환에서 승계 발생 시 evidence에 출처 라운드가 표기되고, retro
  텔레메트리로 절감(재실행 생략 건수)을 관찰할 수 있다.

## Non-goals

- **verdict(critic 판단) 승계** — 절대 비대상. 전량 재검증·도장찍기 금지·2라운드 상한 불변.
- cross-session/cross-run 승계 — within-run(한 goal-impl 실행 내) 한정. cross-session 금지 불변.
- 테스트 스위트·typecheck·preflight의 승계 — 저비용이라 항상 재실행.
- base 통합 재평가 규약(202607181125 frozen matrix 영향 행)의 변경 — 그 소관은 그대로.
- 자동 의존 추론 — 의존은 명시 선언만(누락 = 재실행), 정적 분석 도입 안 함.

## Constraints

- 승계 조건 3개 전부 충족 시에만: hermetic(같은 입력→같은 산출) · 고비용(재실행이 스위트 실행
  대비 유의미하게 비쌈) · diff ∩ 선언 의존 = ∅. 하나라도 애매하면 재실행(escalate-on-doubt).
- 승계 evidence는 출처(라운드·candidate SHA)를 명시 표기 — 무표기 승계 금지.
- 개정은 관련 계약 테스트 핀과 **같은 변경에서** 동반(드리프트 창 금지).
- provider 중립 — 특정 런타임 기능을 전제하지 않는 instruction-level 절차.

## Stakeholders

단일 사용자(설치한 개인 누구나 — 비개발자 포함). Tier 2 self-review를 도는 모든 런타임.

## Risks

- **의존 선언 오류(과소 선언)** → stale evidence 승계. 완화: 선언 누락=재실행 보수 기본 +
  critic이 승계 타당성(선언 정확성)을 행 검토에서 검증 + 잘못 승계가 발견되면 해당 spec은
  전량 재실행으로 강등.
- **규약 복잡도 증가** → Tier 2 절차가 무거워짐. 완화: 승계는 선택적 최적화(기본은 재실행) —
  선언이 없으면 현행과 동일하게 동작.
- **텔레메트리 부족 상태의 설계**(권고 오버라이드) → 절감 효과가 미미할 수 있음. 완화: 도입 후
  retro에서 승계 건수 관찰, 효과 없으면 재보정 리듬 규칙으로 되돌림(되돌림 신호: 승계 관련
  결함 1건 이상 또는 3회 연속 retro에서 승계 0건).
