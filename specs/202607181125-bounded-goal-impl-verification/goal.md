---
title: Bound goal-impl verification loops and completion evidence
audience: human
---

# Goal: goal-impl 검증 루프를 유한하고 증거 중심으로 만든다

> **TL;DR** — `goal-impl`의 품질 게이트는 유지하되 검수·도그푸드·완료 기록이 스스로 새 작업을
> 만드는 구조를 제거한다. self-review 자동 재검은 두 라운드로 제한하고, dogfood 전에 검증
> matrix를 동결하며, 시작·최종 검수 전 base freshness를 확인하고, PR·CI 상태는 원격 시스템을
> 단일 진실 원천으로 사용한다.
>
> **누가/언제** — LocalMind의 SDD 구현 워크플로를 사용하는 설치 사용자와 유지보수자가, 구현보다
> 검증 꼬리가 길어지는 작업을 예측 가능하게 끝내야 할 때 적용한다.

## Background — 배경

`goal-impl`은 TDD 구현, 실제 도그푸드, 독립 self-review, 문서 검증 표기, feature branch PR과 CI까지
한 흐름으로 닫는다. 이 강한 완료 규율은 회귀와 자기확증 편향을 줄였지만, 종료 조건이
`clean까지 재검`으로 열려 있고 dogfood 증거의 형식·범위를 사전에 고정하지 않아 reviewer가 새 증거를
요청할 때마다 작업이 확장될 수 있다.

직전 provider-neutral Deep Research 구현에서는 canonical workflow 자체보다 SDD·감사 증거가 훨씬
커졌고, 격리 검수가 다섯 라운드 반복됐다. 후반 finding의 다수는 제품 결함이 아니라
감사 형식·증거 완성도였으며, 최신 base 동기화가 늦어 이미 해결된 전체 테스트 실패를 오래 추적했다.
PR CI 성공을 versioned 작업 원장에 다시 기록하는 후속 커밋은 새 CI를 발생시켜 완료 기록이 완료 상태를
변경하는 재귀도 만들었다.

사용자는 이 회고를 검토한 뒤 2026-07-18에 네 개선안을 공식 규칙으로 채택했다.

## Problem — 문제

1. **self-review 자동 루프가 유한하지 않다.** fresh reviewer마다 새 관점이 blocker로 승격되면
   구현 결함이 없어도 검수가 계속된다.
2. **검증 계약이 dogfood 뒤에 확장된다.** 어떤 AC를 어떤 방식·증거·종료 조건으로 검증할지 미리
   동결되지 않아, 사후 증명 요구가 실제 scope를 늘린다.
3. **base freshness 확인 시점이 늦다.** 최신 기본 브랜치에 이미 들어간 수정이나 충돌을 최종 단계에서
   발견하면 검수·테스트를 되풀이한다.
4. **완료 기록이 새 변경을 만든다.** PR·CI 성공을 versioned task에 사후 기록하면 새 commit과 CI가
   생겨 완료 판정이 재귀한다.
5. **품질 유지와 중단을 잘못 대립시킨다.** 재검 상한이 알려진 결함을 무시하는 예외로 오해되면
   형식적 시간 절약을 위해 완료 기준을 약화할 위험이 있다.

## Objective — 목표

- **O-1 — 유한한 self-review:** 자동 self-review를 최대 두 라운드로 제한하고, 세 번째 이후는
  사용자의 fresh 명시 승인이 있을 때만 한 라운드씩 실행한다.
- **O-2 — 검증 계약 사전 동결:** dogfood 전에 각 AC의 검증 방식·필요 증거·종료 조건을 하나의
  matrix로 확정해 reviewer가 사후 선호를 자동 blocker로 추가하지 못하게 한다.
- **O-3 — 두 시점 base freshness:** 구현 시작과 최종 self-review 직전에 최신 기본 브랜치 상태를
  확인·정합해 stale base에서 발생하는 재작업을 줄인다.
- **O-4 — 외부 완료 상태 SSoT:** PR·CI 상태는 원격 PR/CI 시스템을 정본으로 사용하고, 그 결과만
  기록하기 위한 versioned 후속 commit을 만들지 않는다.
- **O-5 — 품질 게이트 보존:** 치명·중대 결함, 미충족 AC, 테스트 실패가 남으면 상한 도달 후에도
  완료로 위장하지 않고 중단·보고·승인 요청 상태로 남긴다.

## Expected outcome — 기대 결과

- 첫 review가 clean이면 즉시 닫고, 수정이 필요해도 자동 재검은 두 번째 라운드에서 멈춘다.
- 두 라운드 뒤 blocker가 남으면 `완료`가 아니라 발견·수정·잔여 위험과 함께 다음 라운드 승인을
  요청한다.
- plan만 읽어도 각 AC에 필요한 정적 테스트·통합 테스트·dogfood와 보존할 증거, 충분 조건이 보인다.
- dogfood가 시작된 뒤 새로운 증거 형식은 제품·보안 결함 또는 사용자가 승인한 scope 변경이 아닌 한
  완료 blocker가 되지 않는다.
- 최신 base의 이동은 구현 전 또는 최종 review 전에 처리되고, 영향 테스트가 review 전에 다시
  통과한다.
- 최종 versioned commit 이후에는 push·PR·CI 감시만 수행하며 성공 결과는 PR/CI와 최종 보고에서
  확인한다. 실제 수정이 필요한 CI 실패만 새 commit을 정당화한다.

## Success metrics — 성공 지표

- [x] **SM-1:** 기존 프로젝트 정본·새 프로젝트 기본·workflow 계약에서 self-review 자동 상한 2라운드,
      추가 라운드별 fresh 사용자 승인, blocker 잔존 시 완료 금지가 같은 의미로 고정된다. 검증: bounded
      contract 13/13 + merged review round 1~3.
- [x] **SM-2:** 문서 준비 단계의 plan이 모든 AC에 대해 검증 방식·증거·종료 조건을 포함하고, 구현
      workflow가 dogfood 직전 동결 여부를 확인한다. 검증: 11행 matrix readiness/freeze + amendment A-1.
- [x] **SM-3:** 시작 전과 최종 review 직전 base freshness gate, remote 조회 불가·dirty 충돌의
      정직한 중단/승인 경로가 자동 테스트 가능한 계약으로 존재한다. 검증: 실제 fetch 3회 + synthetic
      up-to-date/advanced/unavailable 시나리오.
- [x] **SM-4:** versioned task 진행 상태와 post-push PR/CI 상태의 경계가 명문화되고, 완료 결과만을
      기록하기 위한 후속 commit을 금지하는 계약 테스트가 통과한다. 검증: task-format negative contract.
- [x] **SM-5:** 이 slice의 publish handoff 전 검증에서 동결 matrix 밖 증거 선호로 늘어난 blocker,
      사용자 승인 없는 3차 review, stale base 최종 재작업, 외부 상태를 되쓰기 위한 필수 tracked task가
      모두 0건이다. 검증: round 3 fresh 승인 1회, scope/stale/external mirror 지표 0건.
- [x] **SM-6:** 전체 테스트·빌드·packaged workflow 배포가 green이고 기존 TDD·도그푸드·독립
      critic·PR gate가 약화되지 않는다. 검증: 935/935, build pass, deploy unchanged, round 3 blocker 0.

## Non-goals — 비목표

- self-review를 생략하거나 critic 등급·독립성·보안 검수 강도를 낮추지 않는다.
- 두 라운드 뒤 blocker가 남은 상태를 성공이나 예외 통과로 처리하지 않는다.
- 시간 상한, evidence 줄 수, transcript 크기 같은 수치 예산을 이번 규칙에 추가하지 않는다.
- 문서 준비 단계 자체의 critic 재검 루프까지 같은 상한으로 바꾸지 않는다. 이번 범위는 구현 후
  self-review다.
- workflow engine, 자동 DAG 실행기, Git hook, CI bot을 새로 구현하지 않는다.
- raw transcript 저장소나 별도 evidence database를 만들지 않는다.
- 특정 CI 서비스 전체를 재설계하거나 GitHub 외 원격 제공자의 일반화를 해결하지 않는다.
- 이전 Deep Research 기능·감사 artifact를 다시 수정하지 않는다. 그 작업은 회고 근거일 뿐이다.

## Constraints — 제약

- **C-1 — 사용자 확정 네 규칙:** review 상한, evidence matrix 동결, 두 시점 base freshness,
  PR/CI SSoT를 하나도 누락하지 않는다.
- **C-2 — SSoT 경계:** repository 완료 정책, workflow 행동, 새 프로젝트 기본, 검증 matrix 형식은
  각각 하나의 정본을 갖고 소비 surface 사이의 의미 drift를 허용하지 않는다.
- **C-3 — 품질 불변:** 기존의 전 AC green, 필수 dogfood, 적대적 critic, 테스트 green, feature PR
  규칙은 그대로 유지한다.
- **C-4 — 외과적 규약 변경:** 관련 정책·계약·사용자 설명만 최소 변경하고 새로운 실행 backend나
  배포 엔진 분기를 도입하지 않는다.
- **C-5 — 사용자 자산 보존:** 착수 전 dirty 파일과 unmanaged workflow target을 덮어쓰거나
  stage하지 않는다.
- **C-6 — provider/model 중립:** workflow 계약은 역할·능력·추상 등급으로만 서술하고 구체
  provider/model ID에 의존하지 않는다.
- **C-7 — 새 작업 브랜치:** 구현은 최신 기본 브랜치에서 새 feature branch로 시작해 이미 종료된
  Deep Research branch/PR에 섞지 않는다.

## Stakeholders — 이해관계자

- **단일 사용자(설치한 개인 누구나 — 비개발자 포함):** 품질을 유지하면서도 검증 작업의 끝과
  다음 승인 지점을 예측할 수 있다.
- **LocalMind 유지보수자:** stale base·증거 scope creep·재귀 CI로 인한 불필요한 작업을 줄인다.
- **SDD 문서 준비·구현·검수 workflow 소비자:** plan 단계부터 같은 검증 계약과 review semantics를
  사용한다.
- **새 프로젝트 사용자:** 새로 만든 SDD repo에서도 동일한 유한 검수 규칙을 얻는다.

## Risks — 리스크

- **R-1 — 상한을 품질 면제로 오해:** 두 라운드 후 blocker를 숨기고 완료할 수 있다 → 완료 금지와
  사용자 승인 대기를 같은 문장·테스트로 고정한다.
- **R-2 — matrix가 새 결함을 가림:** 동결 뒤 발견된 실제 제품·보안 문제를 범위 밖으로 밀 수 있다 →
  재현된 제품·보안 결함은 예외로 허용하되, spec-first 갱신과 잔여 review 예산을 명시한다.
- **R-3 — remote freshness 실패:** 네트워크·remote 부재·dirty 충돌 때문에 동기화가 불가능할 수 있다 →
  fresh라고 위장하지 않고 이유·기준 SHA·영향을 보고해 사용자 결정을 받는다.
- **R-4 — 완료 증거 손실:** CI 결과를 repo 문서에 쓰지 않으면 이력 가시성이 낮아질 수 있다 → PR/CI
  링크와 최종 보고를 정본으로 사용하고 실제 코드 변경이 있을 때만 새 commit을 허용한다.
- **R-5 — 정본 간 drift:** 완료 정책·문서 준비 계약·구현/검수 workflow가 서로 다른 의미를 가질 수
  있다 → 의미 조합을 계약 검증으로 고정하고 배포된 계약과의 일치를 확인한다.
- **R-6 — instruction-level 한계:** 산문 규약은 모든 runtime에서 기술적으로 강제되지 않는다 →
  행동 dogfood와 정직한 fallback을 유지하고 강제 수준을 과장하지 않는다.
