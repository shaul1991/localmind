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

## 2A. critic 조사 지도 — matrix-as-map + 라운드 전량 재검증 (보수형)

위 2단계 입력(`FR/AC + diff + 테스트 근거`) 위에, verification matrix 각 행이 가리키는
**AC↔코드·evidence 대응을 조사 지도(map)** 로 물려받아 critic이 그 대응을 매번 재구성하지 않게
한다.

- **독립성 가드레일**: map은 "어디를 보라"만 정한다. critic은 검토하는 **각 행을 실제 코드로
  검증**하며, **matrix 상태 셀(구현자가 채운 주장)만으로 통과시키지 않는다**(도장찍기 금지).
  읽기 효율만 높이고 검증 깊이는 줄이지 않는다.
- **라운드 전량 재검증(보수형)**: review round가 전환돼도(blocker 수정으로 새 candidate)
  **모든 matrix 행을 전량 재검증**한다. **verdict 승계·행 스킵은 하지 않는다** — round 2 격리
  리뷰어는 round 1 verdict를 물려받지 않고 각 행을 독립 재검증한다(per-round 독립성 완전 보존).
  재사용되는 것은 **검증 결과가 아니라 map뿐**이다. **일부 행만 재검증하는 verification
  skip(verdict 스킵)은 여전히 금지한다** — 이것과 **evidence 실행 결과의 승계는 별개**다(아래
  "승계 절차" 참조).
- **map 재사용 범위**: matrix map 재사용은 **within-run(한 goal-impl 실행 내)** 으로만 유효하다.
  **세션·실행 간(cross-session) map 재사용은 금지**한다.

### 승계 절차 — hermetic evidence 조건부 재사용 (specs/202607210545)

- **선언**: plan verification matrix의 행은 evidence 셀에 선택적으로 `의존: \`파일1\`, \`파일2\``를
  병기할 수 있다(tasks-format의 `files:` 선언과 같은 백틱·쉼표 문법).
- **판정(라운드 전환 시)**: 직전 candidate → 새 candidate의 수정 diff 파일 목록과 행의 선언
  의존을 대조한다. **hermetic(결정적)·고비용·수정 diff와 선언 의존의 교집합이 공집합**(3조건
  전부)일 때만 그 행의 **실행 evidence를 승계 가능**하다 — ① 수정 diff 파일 목록과 선언 의존의
  교집합이 공집합 ② evidence 산출이 hermetic(스크립트 실행·배포 관찰 등 결정적) ③ 재실행이
  고비용(전체 스위트 실행 대비 유의미하게 비쌈). 하나라도 미충족·애매하거나 선언이 없으면
  **재실행이 기본**이다(보수 기본).
- **저비용은 항상 재실행**: 전체 스위트·typecheck·preflight 같은 저비용 유형은 3조건과 무관하게
  항상 재실행한다.
- **표기**: 승계 시 새 라운드 merged report·evidence에 `승계: rN@<candidate 7자 SHA>`
  (evidence frontmatter의 `carried-from`과 동일 표기)로 출처를 명시한다 — **무표기 승계는 금지**한다.
- **critic 검증(도장찍기 금지 연장)**: 승계된 행도 critic이 검토를 생략하지 않는다 — verdict는
  새로 내리고, 승계 타당성(선언이 실제 의존을 덮는지)을 행 검토에 포함한다.
- **cross-session 승계는 여전히 금지**한다(위 map 재사용 범위와 동일 불변).

## 2B. Preflight — critic 착수 전 결정적 사전 게이트

critic 착수 전에, 저장소가 결정적 preflight 검사를 제공하면(예: localmind의
`npm run review:preflight -- specs/{spec}` — 임시경로 evidence·diff 형식·merged report 필드·
matrix 전수 대응 검사) 먼저 실행한다. 실패하면 critic을 시작하지 않고 기계 수정 먼저 한 뒤
preflight를 재실행한다. preflight 통과는 critic 시작의 전제일 뿐 **어떤 AC의 green 근거도
아니다**(형식 통과 ≠ 내용 검증 — 도장찍기 금지와 동일 결). 이 게이트는 instruction-level이며
런타임이 기술적으로 강제하지 않는다(스크립트 자체는 결정적이지만 실행 여부는 워크플로 지침이
담당한다).

## 3. 적대적 크리틱 검토(필수)

적대적 크리틱(critic) 검토는 필수 최소선이다. **구현 컨텍스트와 분리된 격리 리뷰 능력이 있으면 반드시
우선 사용**하되 특정 공급자나 모델을 요구하지 않는다. 격리 능력이 없으면 저장소 `AGENTS.md`가 허용하는
현재 세션 체크리스트 fallback을 쓰고 이를 독립(independent) 검토라고 부르지 않는다.

**렌즈별 병렬 fan-out(선택적 실행 형태)** — 격리 위임 능력이 있으면 아래 5개 점검 축(①~⑤)을
**렌즈별 격리 리뷰어로 동시 실행**할 수 있다. 각 리뷰어는 전체 diff + matrix map을 입력으로
받되 자기 렌즈의 점검 축에 집중한다. 병렬 실행은 의무가 아니다 — 격리 능력이 없거나 비용
여건이 맞지 않으면 단일 리뷰어(5축 직렬)가 기본 fallback이며, 어떤 형태로 실행했는지 보고에
명시한다. 렌즈 병렬이든 단일 리뷰어든 round 산정 규칙은 불변이다 — 같은 candidate에 대한
모든 리뷰어의 findings를 병합한 **merged report 하나 = round 1개**.

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

- 렌즈 병렬 실행 시 병합 규칙: 서로 다른 렌즈가 같은 결함(**같은 파일:줄 + 동일 결함 서술**)을
  보고하면 하나로 합치고 **발견 렌즈를 병기**한다(dedup). 같은 결함에 렌즈 간 심각도가 갈리면
  **높은 쪽을 채택**한다(심각도 보수 병합). 각 finding에 발견 렌즈(축)를 표기한다.

- **차단(blocking)**: 어느 쪽이 찾았든 치명·중대 결함과 미충족 AC — SDD 구현 워크플로의 수정→재검
  루프로 넘긴다(이 워크플로는 보고까지만).
- **조언(advisory)**: 참고 표기만 한다.
- 축을 함께 표기한다: 추적성·커버리지·정확성·단순성/보안·사실 정확성.
- merged report에는 다음 필드를 항상 포함한다:
  `candidate-id`, `round`, `independence`, `blockers`, `advisories`, `approval-needed`, `completion`.
  merged report는 `templates/sdd/self-review-evidence.template.md`의 frontmatter 표준 스키마
  (필수 7필드 + 선택 `duration-minutes`·`lenses`)를 따라 evidence 파일로 저장한다.
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
