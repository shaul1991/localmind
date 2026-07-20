---
title: "goal-impl §4A 조율 불변식 3중 중복 정리"
audience: both
---

# Change: goal-impl SKILL §4A 중복 정리

## 왜(why)
202607202152 self-review 렌즈④ 발견(A-1 이월): §4A에서 동일 조율 불변식(메인 유일 조율·hub/leaf·
중첩 spawn 금지)이 신설 "불변식" 소절·"권장 기본"·기존 "위상" 소절에 3중 서술 — 모순은 없으나
스킬은 컨텍스트 예산을 먹는 ai 문서라 비대화가 실비용.

## 무엇을(what)
`templates/skills/goal-impl/SKILL.md` §4A만: "위상" 소절의 불변식 재서술을 신설 불변식 소절로
흡수하고 A/B 노드 크기 구분 등 고유 내용만 남긴다. 의미 변경 0 — 중복 제거만.
**핀 동반**: 관련 계약 핀(skill-contract.test.ts·workflow-policy.test.ts)이 깨지면 같은 변경에서
새 문구로 개정(의미 유지) — 깨지는 핀 목록을 먼저 실측 후 편집.

## AC (Given-When-Then · 테스트 1:1)
- [ ] **AC-1**: Given 정리된 §4A, When 전체 스위트 실행, Then green(핀 동반 개정 포함) +
  조율 불변식 서술이 §4A 내 1곳으로 수렴(중복 grep 검사).
- [ ] **AC-2**: Given 정리 전후, When §4A 의미 대조(불변식 목록·A/B 구분·중첩 금지), Then 손실 0.

## 티어 근거
**Tier 1.** 문서 중복 제거(의미 불변 목표)이나 행동 불변이 자명하지 않고(핀·계약 문서) 테스트
검증 필요 — Tier 0 아님. 하드 신호 무해당 — Tier 2 아님.
