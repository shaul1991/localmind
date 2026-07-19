---
title: Deep Research evidence pack 보강 명세
audience: both
---

# Spec: Deep Research evidence pack 보강

상위 목표: [goal.md](goal.md)

## Scope

기존 `deep-research`에 안정적 source/evidence/claim/run 식별과 적응형 충분성·checkpoint 계약을
추가한다. 파일 보존은 별도 logical workflow `research-evidence-pack`으로 분리한다. 이 workflow는
사용자가 전달한 조사 보고·원장을 선택한 경로에 Markdown+JSONL로 저장하고 로컬 validator로 구조적
무결성을 확인한다.

## Context

- 기존 `deep-research`는 `explicit/report-only`이며 canonical package는 SKILL.md와 research contract
  두 파일이다.
- 배포기는 catalog를 정본으로 Claude/Codex/Gemini target을 생성하고 unmanaged 동명 자산을 보호한다.
- 기존 계약은 source authority와 evidence ledger 필드를 정의하지만 안정적 ID, pack schema,
  checkpoint, 기계 검증은 정의하지 않는다.
- 외부 스킬의 자동 HOME 출력·자동 open·고정 분량/출처 수·runtime 종속은 채택하지 않는다.

## Functional Requirements

- [x] **FR-1 — 기존 안전 계약 보존:** `deep-research`는 explicit/report-only, provider/model/tool-neutral,
      untrusted-source/private-data 안전 경계를 유지한다. → goal: O-1, Constraints
- [x] **FR-2 — 안정적 식별자:** research run은 `R-`, source는 `S-`, evidence는 `E-`, claim은 `C-`
      접두의 run-local 안정적 ID와 참조 관계를 사용한다. → goal: O-2
- [x] **FR-3 — atomic claim ledger:** 핵심 결론은 검증 가능한 한 문장 claim으로 분해하고 상태를
      `supported|contested|unverified|withdrawn` 중 하나로 기록한다. → goal: O-2
- [x] **FR-4 — 적응형 충분성:** 단일 결정적 T1이 직접 지지하면 출처 1개도 충분할 수 있고, 해석·시장
      비교·고위험 권고·상충 사안은 독립 source로 삼각검증한다. 단순 출처 개수만으로 통과시키지 않는다.
      → goal: O-3
- [x] **FR-5 — checkpoint:** 긴 조사나 중단 가능성이 있는 실행은 완료 질문, 미완료 질문, source/claim
      상태, 다음 검증 단계, capability fallback을 포함하는 checkpoint를 만든다. → goal: O-5
- [x] **FR-6 — 명시적 pack workflow:** `research-evidence-pack`은 explicit/docs-only 별도 workflow이며,
      source research나 synthesis를 수행하지 않고 전달받은 조사 산출물의 보존만 담당한다. → goal: O-1, O-4
- [x] **FR-7 — 출력 경로 gate:** pack workflow는 사용자 지정 경로 또는 사용자가 확인한 프로젝트 내부
      경로가 없으면 쓰지 않고 경로만 질문한다. HOME/Documents 자동 기본값과 자동 open은 금지한다.
      → goal: O-4, Constraints
- [x] **FR-8 — pack 구성:** pack은 `report.md`, `sources.jsonl`, `evidence.jsonl`, `claims.jsonl`,
      `run-manifest.json`을 포함하며 각 schema와 최소 필드를 reference에서 정의한다. → goal: O-2, O-4
- [x] **FR-9 — 결정적 검증:** 표준 라이브러리 validator는 JSON/JSONL 파싱, ID 고유성, 참조 무결성,
      필수 필드, 허용 상태, supported/contested claim의 evidence 존재를 검사하고 오류별 non-zero로 종료한다.
      → goal: O-2, O-4
- [x] **FR-10 — 최소 복제:** evidence에는 직접 URL·locator·짧은 근거 요약을 우선하고, 장문 원문·비밀·
      불필요한 개인정보를 복제하지 않는다. → goal: Constraints, Risks
- [x] **FR-11 — 배포·발견:** 두 workflow의 역할·호출·side effect 차이가 runtime별 문서와 배포 결과에
      드러나며, managed lifecycle과 unmanaged 보호가 유지된다. → goal: O-1, O-4
- [x] **FR-12 — 검수 투명성:** deep research final critic은 claim coverage, evidence 적합성, checkpoint
      정합성을 검수하고 validator가 진실성 자체를 보장하지 않는다는 한계를 보고한다. → goal: O-2, O-3

## Acceptance Criteria

- [x] **AC-1 — 기본 회귀 없음:** Given 기존 canonical package와 catalog, When 보강본을 로드하면,
      Then `deep-research` 정책은 정확히 explicit/report-only이고 provider/model/runtime/tool 고유 토큰과
      executable file은 0건이다.
- [x] **AC-2 — ID·ledger 계약:** Given 핵심 claim이 있는 조사, When research contract를 적용하면,
      Then run/source/evidence/claim ID와 각 참조·상태·충돌 관계가 빠짐없이 표현된다.
- [x] **AC-3 — 적응형 충분성:** Given 단일 결정적 T1 claim과 상충하는 고위험 claim fixture, When
      충분성을 판정하면, Then 전자는 단일 T1로 통과할 수 있고 후자는 독립 근거 또는 contested/unverified
      표기 없이는 통과하지 않는다.
- [x] **AC-4 — checkpoint:** Given 일부 질문만 끝난 조사, When 중단 checkpoint를 만들면, Then 완료·
      미완료 질문, 현재 ledger ID, fallback, 다음 단계가 포함되고 완료로 오인되지 않는다.
- [x] **AC-5 — 명시적 쓰기 gate:** Given `research-evidence-pack` 호출에 출력 경로 확인이 없을 때,
      When workflow가 실행되면, Then 파일 생성·수정·자동 open은 0건이고 경로만 질문한다.
- [x] **AC-6 — 유효 pack:** Given 유효한 5개 pack 파일 fixture, When validator를 실행하면, Then exit 0과
      source/evidence/claim 개수 및 coverage 요약을 반환한다.
- [x] **AC-7 — 손상 pack 거부:** Given 중복 ID, 깨진 참조, 허용되지 않은 상태, evidence 없는 supported
      claim fixture 각각, When validator를 실행하면, Then 각 결함을 식별하는 non-zero 결과가 난다.
- [x] **AC-8 — 안전한 경로:** Given 사용자가 확인한 프로젝트 내부 경로, When pack을 생성하면, Then
      정확히 5개 산출물만 만들고 HOME/Documents·외부 서비스·기존 unrelated 파일을 변경하지 않는다.
- [x] **AC-9 — 최소 복제·보안:** Given source에 장문 인용·embedded instruction·secret 유도 문자열이
      있을 때, When pack을 만들고 critic을 수행하면, Then 명령을 실행하거나 secret을 기록하지 않고
      URL·locator·짧은 요약만 보존한다.
- [x] **AC-10 — lifecycle:** Given temp runtime roots의 managed/unmanaged fixture, When 두 workflow를
      두 번 배포하면, Then 첫 실행은 생성/갱신, 둘째는 unchanged이며 unmanaged byte 변경·삭제는 0건이다.
- [x] **AC-11 — 대표 dogfood:** Given 동일한 Innerview 구현 전 조사 brief, When 보강된 deep-research를
      실행하고 명시적 pack workflow로 임시 프로젝트 경로에 보존하면, Then 결론-근거 추적성, critic,
      validator green, 실제 독립성/fallback이 관찰된다.
- [x] **AC-12 — 전체 회귀:** Given 최종 candidate, When 전체 테스트·build·whitespace 검사를 실행하면,
      Then 모두 green이고 기존 workflow의 계약 회귀가 0건이다.

## Open questions

- 없음. HTML/PDF, 원격 저장, source 수·글자 수 하한은 명시적으로 비목표다.
