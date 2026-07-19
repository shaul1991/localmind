---
title: Deep Research evidence pack 보강
audience: human
---

# Goal: Deep Research evidence pack 보강

> **TL;DR** — LocalMind의 안전한 provider-neutral `deep-research`를 정본으로 유지하면서, 핵심
> 주장과 출처의 연결을 재현 가능한 형태로 남기고 필요할 때만 파일 묶음으로 보존할 수 있게 한다.
> 기본 조사는 계속 report-only이며, 저장은 사용자가 별도로 명시한 경우에만 수행한다.

## Background — 배경

현재 `deep-research`는 명시 실행, 권위 있는 출처 우선, 상충 근거 공개, final critic, 정직한 capability
fallback을 제공한다. 실제 제품·아키텍처 결정을 뒷받침하는 조사에서는 최종 보고서뿐 아니라 “어떤
주장을 어떤 근거가 지지하거나 반박했는가”를 다시 확인할 수 있는 구조화된 기록도 가치가 있다.

외부 Deep Research 스킬 조사에서 source·evidence·claim 원장, 중단 후 이어가기, 기계 검증이 유용한
보강점으로 확인됐다. 반면 홈 디렉터리 자동 저장, 자동 HTML/PDF 열기, 고정 출처 수와 장문 분량,
특정 runtime 도구 종속은 LocalMind의 안전·중립성 원칙과 충돌한다.

## Problem — 문제

1. 현재 evidence ledger는 보고서 안의 표 형식 계약이라 장기 조사에서 출처·주장 식별자가 흔들릴 수 있다.
2. 조사 결과를 나중에 재검증하거나 구현 근거로 인계할 때, 출처·근거·주장 관계를 다시 추출해야 한다.
3. 파일 보존이 필요해도 report-only 조사와 쓰기 권한의 경계가 분리된 표준 workflow가 없다.
4. 단순 출처 개수 같은 고정 기준은 한 개의 결정적 T1 근거와 다수의 약한 중복 근거를 구분하지 못한다.
5. 장기 조사 중단·재개 시 어느 질문과 주장이 완료됐는지 정직하게 인계하는 표준 상태가 없다.

## Objective — 목표

- **O-1 — 안전한 정본 유지:** 기존 `deep-research`의 explicit/report-only·provider-neutral 계약을
  약화하지 않는다.
- **O-2 — 추적 가능한 근거:** 출처·근거·주장·실행 상태를 안정적 ID와 참조 관계로 표현한다.
- **O-3 — 적응형 품질 게이트:** 출처 수가 아니라 주장 중요도·권위·독립성·충돌 상태에 따라 충분성을
  판정한다.
- **O-4 — 명시적 보존:** 사용자가 별도로 요청한 경우에만 선택한 프로젝트 경로에 evidence pack을
  저장하고 기계 검증한다.
- **O-5 — 재개 가능성:** 중단된 조사가 완료·미완료 질문과 검증 상태를 잃지 않고 이어질 수 있게 한다.

## Expected outcome — 기대 결과

- 일반 사용자는 지금처럼 채팅 보고서만 받으며 파일이나 외부 상태가 자동으로 바뀌지 않는다.
- 중요한 조사는 보고서의 각 핵심 결론이 source/evidence/claim ID로 추적된다.
- 보존이 필요할 때는 명시적 별도 workflow로 Markdown 보고서와 JSONL 원장을 프로젝트 내부에 만든다.
- 검증기는 중복 ID, 깨진 참조, JSON 오류, 근거 없는 확정 claim을 전달 전에 탐지한다.
- 장기 조사는 checkpoint를 통해 중단·재개 상태와 한계를 정직하게 전달한다.

## Success metrics — 성공 지표

- [x] **SM-1:** 기존 `deep-research`의 explicit/report-only 정책과 provider/model/tool 중립성 회귀가 0건이다.
- [x] **SM-2:** 핵심 claim의 source/evidence 연결, 충돌, 인식 상태를 안정적 ID로 표현하는 계약이 자동
      검증된다.
- [x] **SM-3:** 별도 evidence-pack workflow가 명시 호출과 사용자 선택 경로 없이 파일을 쓰는 경우가 0건이다.
- [x] **SM-4:** 유효 fixture는 검증을 통과하고, 중복 ID·깨진 참조·미지원 확정 claim fixture는 각각
      결정적으로 실패한다.
- [x] **SM-5:** 실제 대표 조사에서 report-only 결과와 선택적 evidence pack을 각각 dogfood하고,
      조사 결론과 원장의 추적성이 관찰된다.
- [x] **SM-6:** 전체 테스트·build·배포 멱등성·unmanaged 자산 보호 검증이 green이다.

## Non-goals — 비목표

- HTML/PDF 자동 생성·자동 열기, 홈 디렉터리 기본 저장을 추가하지 않는다.
- 모든 핵심 주장에 기계적으로 3개 이상 출처를 강제하지 않는다.
- 최소 출처 수, 최소 글자 수, 조사 시간을 성공 조건으로 삼지 않는다.
- 특정 검색 서비스, provider, model, runtime, 위임 도구를 정본에 고정하지 않는다.
- 웹 crawler, 검색 엔진, 외부 데이터베이스, 원격 evidence 저장소를 구현하지 않는다.
- evidence pack workflow가 조사 내용을 새로 판단하거나 외부 시스템에 적용하게 하지 않는다.

## Constraints — 제약

- 기존 LocalMind Agent Skills 배포·managed/unmanaged 보호 계약을 재사용한다.
- `deep-research`의 기본 side effect는 계속 `report-only`다. 파일 보존은 별도 explicit workflow다.
- 모든 파일 경로는 사용자가 선택하거나 현재 프로젝트 안의 명시된 경로여야 하며, 암묵적 HOME 출력은 금지한다.
- validator는 네트워크·추가 패키지 없이 동작하고 지원 Python 최소 버전을 명시한다.
- 외부 source 내용은 untrusted data이며, 비밀·개인정보와 장문 원문을 evidence pack에 복제하지 않는다.
- 구현은 TDD, 전체 테스트, 실제 dogfood, self-review를 거친다.

## Stakeholders — 이해관계자

- 설치한 개인 누구나(비개발자 포함)
- LocalMind workflow 유지보수자
- 조사 결과를 제품·아키텍처 의사결정 근거로 소비하는 사람과 AI

## Risks — 리스크

- 구조화된 원장이 조사 자체보다 목적이 되어 과도한 형식 작업을 만들 수 있다.
- ID·스키마가 너무 엄격하면 짧은 조사에도 불필요한 부담이 생길 수 있다.
- evidence excerpt에 저작권 자료나 개인정보가 과도하게 복제될 수 있다.
- 별도 쓰기 workflow가 report-only 경계를 흐리면 사용자가 예상하지 못한 파일 변경이 생길 수 있다.
- 정적 validator 통과가 출처의 진실성까지 보장한다는 거짓 확신을 줄 수 있다.
