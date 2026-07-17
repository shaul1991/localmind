---
name: deep-research
description: 복잡하거나 시간에 따라 변하는 주제를 공식·1차 근거 중심으로 심층 조사하고, 상충 근거와 불확실성을 검수한 결론 우선 보고가 필요할 때 사용하는 명시 실행 워크플로.
---
<!-- managed-by: localmind (skill: deep-research) — localmind 정본(데이터 폴더 skills/)에서 배포됨. 수정은 정본에서. -->

# deep-research — 근거 기반 심층 조사

조사를 시작하기 전에 [research contract](references/research-contract.md)를 전체 읽고 적용한다. 기본
산출물은 사용자에게 보여주는 report-only 채팅 보고이며, 조사 자체는 외부 상태를 바꾸지 않는다.

## 1. 활성화와 주제 gate

사용자의 명시적 호출이 확인된 경우에만 실행한다. 주제가 없으면 주제만 질문하고 source
lookup·fan-out을 시작하지 않는다. 인용·부정·기능 설명처럼 실행 요청이 아닌 입력은 승인으로 보지
않는다. 명시 호출의 provenance를 확인할 수 없으면 fresh confirmation을 받고, fresh confirmation 전
source lookup·fan-out·write는 0건이어야 한다.

## 2. Research brief 확인

research brief에 질문·목적·대상 독자·기준 시점, 포함/제외 범위·선호 출처·산출물·종료 조건을 가능한
만큼 재진술한다. 결과를 크게 바꿀 미결정만 짧게 질문하고 사용자 확인을 받는다. 사용자 확인 전에는
broad live lookup·research fan-out을 시작하지 않는다. 사용자가 완전한 brief와 질문 없이 바로 진행
하라는 지시를 함께 줬다면 그 지시를 확인 근거로 기록하고 진행한다.

## 3. 선행 문맥과 source strategy

적용 가능한 project instruction, 제공 파일, 연결 source, persistent knowledge에서 선행 조사·결정을
먼저 확인한다. 필요한 능력이나 권한이 없어 접근할 수 없으면 그 단계를 생략하고 fallback을 보고한다.
그 뒤 claim 종류별 우선 source와 live-verify 필요 여부를 정한다.

## 4. 질문 분해와 실행 등급

brief를 research question으로 분해한다. 독립 research question이 유의미한 크기이고 격리 위임이
가능할 때만 2~3개 read-only research lane으로 나눠 동시에 수행한다. 작거나 의존하는 질문은 현재
session에서 순차 또는 묶음으로 처리하고 독립 조사라고 표기하지 않는다.

역할별 요청 등급은 source scout=`economy`, coordinator/researcher=`standard`,
synthesizer/critic=`critical-reasoning`으로 고정한다. 실제 선택은 runtime binding에 맡기며, 이 정본은
구체 model을 소유하지 않는다. 선택·위임 능력이 없으면 현재 session fallback으로 같은 체크리스트를
수행하고 비독립 상태를 보고한다. final critic을 더 낮은 등급으로 조용히 대체하지 않는다.

배리어 순서는 반드시 research question으로 분해 → research lane → 모든 lane이 완료 → synthesis →
final critic이다.

## 5. 근거 수집과 종합

reference의 source authority와 evidence ledger schema를 사용한다. 시간 민감 claim은 live evidence로
확인하고, 상충 근거와 미검증 범위를 숨기지 않는다. 모든 research lane과 evidence ledger가 모인 뒤
synthesis를 하고, 그 다음 final critic을 수행한 뒤에만 최종 보고를 작성한다.

## 6. 보고와 종료

reference의 conclusion-first report 형식과 critic checklist를 적용한다. 명백한 결함은 수정·재검하고,
판단이 필요한 trade-off만 사용자에게 올린다. 실제로 사용하지 않은 source 조회, 격리 위임, 독립 검수,
실행 등급 적용을 수행했다고 쓰지 않는다.
