---
name: sdd-self-review
description: SDD 구현 완료 직후의 적대적 self-review를 조율하고, 실제 독립성 상태와 함께 완료 가능 여부를 판정하는 검토 워크플로. 명시적으로 호출되거나 권한 있는 SDD 구현 워크플로가 같은 턴에 위임할 때만 실행하며, finding 보고까지만 소유한다.
---
<!-- managed-by: localmind (skill: sdd-self-review) — localmind 정본(데이터 폴더 skills/)에서 배포됨. 수정은 정본에서. -->

# sdd-self-review — 적대적 검토 조율

SDD 구현이 끝나면 이 절차로 self-review를 수행한다. 역할은 능력(capability)으로 표현하고 특정
공급자·모델을 전제하지 않는다. 이 워크플로는 **finding 보고까지만** 소유한다 — 수정·재테스트·재검
루프와 최종 commit은 SDD 구현 워크플로가 맡는다.

## 1. 활성화 판정

**명시적 호출**이거나 **권한 있는 SDD 구현 워크플로가 같은 턴에 내부 위임**한 경우에만 실행한다.
그 밖의 암시적·인용·부정 매치이면 중단한다. 허용된 경우에도 이 워크플로는 finding 보고만 하고
파일·하위 프로세스·네트워크 변경(mutation)을 **0회** 수행한다.

## 2. 입력

해당 spec의 모든 FR/AC와 실제 변경(diff)·테스트 근거, **review candidate** identity와 요청받은
**review round** 번호를 입력으로 받는다 — 경로를 명시해 직접 읽는다. candidate identity는 commit
SHA 또는 diff/evidence를 결정적으로 식별하는 값이어야 하며, round 예산과 추가 승인 여부는 이
워크플로가 아니라 호출한 SDD 구현 워크플로가 소유한다.

## 3. 적대적 크리틱 검토(필수)

적대적 크리틱(critic) 검토는 필수 최소선이다. **구현 컨텍스트와 분리된 격리 리뷰 능력이 있으면 반드시
우선 사용**하되 특정 공급자나 모델을 요구하지 않는다. 격리 능력이 없으면 저장소 `AGENTS.md`가 허용하는
현재 세션 체크리스트 fallback을 쓰고 이를 독립(independent) 검토라고 부르지 않는다.

크리틱 프롬프트에 반드시 포함할 것:

- 대상: spec의 FR/AC 목록 + 변경 파일(diff) — 경로 명시.
- 점검 범위: ① FR/AC가 구현+테스트로 1:1 충족되는지(추적성) ② 유저 시나리오·엣지가 실제 테스트로
  커버되는지(커버리지) ③ 로직·경계·에러 처리 버그(정확성) ④ 불필요한 복잡도·보안(단순성·보안)
  ⑤ 낡을 수 있는 외부 사실이 공식 문서로 검증됐는지(사실 정확성).
- 자세: "결함을 찾으러 간다"(자기확증 배제). 테스트를 직접 실행해 재현·실증한다.
- 출력: 심각도(치명/중대/경미)·파일:줄·재현·제안 + 완료 가능/불가 판정.

## 4. 추가 독립 검토(있으면)

사용 가능한 **추가 독립 검토 능력**(예: 서로 다른 컨텍스트의 교차 검토)이 있으면 실행한다. 다만
특정 공급자·모델을 필수로 하지 않는다. 실패·미설치·시간 초과가 나면 그대로 받아들이고 보고에 사유를
명시한다. 추가 검토가 없더라도 3단계의 필수 self-review는 계속 수행한다.

## 5. 병합

발견을 하나의 self-review 보고로 병합한다.

- 같은 review candidate를 여러 격리 reviewer가 검토해도 findings를 **병합 report 하나**로 합치며,
  이것이 **review round 하나**다. reviewer 수·finding 수는 round 수를 늘리지 않는다. 서로 다른
  candidate의 findings를 같은 report에 섞지 않는다.

- **차단(blocking)**: 어느 쪽이 찾았든 치명·중대 결함과 미충족 AC — SDD 구현 워크플로의 수정→재검
  루프로 넘긴다(이 워크플로는 보고까지만).
- **조언(advisory)**: 참고 표기만 한다.
- 축을 함께 표기한다: 추적성·커버리지·정확성·단순성/보안·사실 정확성.
- merged report에는 다음 필드를 항상 포함한다:
  `candidate-id`, `round`, `independence`, `blockers`, `advisories`, `approval-needed`.
  `approval-needed`는 호출자가 전달한 자동 예산 상태와 blocker 여부를 다음 상태표로 판정한다.
  **round 1 + blocker → false; round 2 + blocker → true; round 3+ + blocker → true; 어느 round든
  clean → false**다. round 3+에 blocker가 남으면 **새 승인(fresh approval)을 다시 요청**한다.
  이 필드는 승인하거나 다음 round를 실행하는 권한이 아니라 중단 신호다.

## 6. 독립성 상태 정직 보고

실제로 수행한 독립성 범위를 `isolated-context`, `cross-runtime`, `main-session-fallback` 중 해당 값으로
보고한다. 수행하지 않은 교차 검토를 수행했다고 쓰지 않으며, 현재 세션 fallback을 독립 검토로 과장하지
않는다.

## 7. 소유 경계

이 워크플로는 finding을 보고한다. 수정·재테스트·재검 루프와 최종 commit은 SDD 구현 워크플로가 소유한다.
완료 기준: 치명·중대 0 + 테스트 green + AC 전부 충족(미충족분은 사용자에게 명시 보고).
