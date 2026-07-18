# Plan: {{제목}}

<!-- 어떻게(how) 만드는가. spec의 FR을 코드 변경으로 매핑한다. 상위: [goal](goal.md) · [spec](spec.md) -->

## 접근 요약
<!-- 핵심 기술 접근 1~2단락. -->

## 도메인 경계 (DDD)
<!-- bounded context·도메인 모델·유비쿼터스 언어. 변경이 닿는 도메인 경계. -->

## 영향 모듈
<!-- 수정/신규 파일·경로. (예: 수정 X, 신규 Y, 무변경 Z) -->

## 단계 (task 분해 가능)
<!-- 순서·의존이 드러나게. self-review clean 후 완료된 단계는 [ ]→[x]로 표기. -->
- [ ] 1. …
- [ ] 2. …

## 검증 matrix — AC 1:1
<!-- 모든 AC는 정확히 한 행에 둔다. TDD 검증 방법·레벨, 최소 evidence, 통과·종료 조건을
     구현 전에 채워 readiness를 확인한다. 필수 검증 capability가 없거나 skipped/degraded이면
     green이 아니라 미충족 blocker다.

     첫 dogfood 직전에 matrix freeze를 수행한다. freeze 뒤 단순 evidence 형식 선호는 현재 완료의
     blocker가 아니지만 재현된 제품·보안 결함은 blocker다. stop condition이 잘못됐거나 새 요구가
     필요하면 임의 확장하지 말고 변경 이유, 영향 AC, 무효화할 evidence를 기록한 뒤 spec-first 절차와
     영향 범위 재검증을 따른다.
     상태 컬럼은 self-review clean 후 [x]와 실제 evidence pointer로 채운다. -->
| AC | 검증 방법·레벨 | 최소 evidence | 통과·종료 조건 | 상태 |
|---|---|---|---|---|
| AC-1 | 단위 — … | … | …이면 종료 | [ ] |
| AC-2 | 통합 — … | … | …이면 종료 | [ ] |

## Open questions
<!-- plan 차원의 미결정(드라이버 선택·배치 등). -->
