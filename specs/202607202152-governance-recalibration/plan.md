---
audience: both
---

# plan — 거버넌스 재보정

## 도메인 경계

- **rules base 정본** (`~/.localmind/rules/base/` — 데이터 폴더, 자체 git 백업) — FR-1·2·5.
  repo 커밋 대상이 아니며 배포는 `make rules-deploy`(→ `~/.claude/localmind-rules.md` 등).
  **repo PR과 별개의 변경 트랙**임을 실행 내내 구분한다.
- **localmind repo** — FR-3(goal-impl SKILL)·FR-4(AGENTS.md)·FR-6 계약 테스트·이 spec 폴더.
  통상 규약 7(feature branch → PR) 적용.
- **불변 계약** — 검증 계층 문구는 기존 workflow-policy 계약 테스트가 핀 — green 유지가 하드
  게이트(AC-4).

용어: **불변식(invariant)** = 완료가 성립하려면 참이어야 하는 조건(재량 불가). **권장 기본
(default recipe)** = 불변식을 달성하는 검증된 수단(재량 가능) — §15 패턴 재사용.

## 영향 모듈

| 구분 | 트랙 | 경로 | 변경 |
|---|---|---|---|
| 수정 | rules | `~/.localmind/rules/base/interview-protocol.md` | 위험 보정형 재확인(FR-1) + 개정 이력 |
| 수정 | rules | `~/.localmind/rules/base/deep-interview-elicitation.md` | 권고 동반·일괄 제시 모드(FR-2) + 개정 이력 |
| 신규 | rules | `~/.localmind/rules/base/governance-recalibration.md` | 재보정 리듬 규칙(FR-5) |
| 수정 | repo | `templates/skills/goal-impl/SKILL.md` | §4·§4A·§5 불변식/권장 기본 재서술(FR-3) |
| 수정 | repo | `AGENTS.md` | 티어 절 비가역성 신호·검증가능성 보조 축·예시 행(FR-4) |
| 수정 | repo | `docs/workflows.md` | 비가역성 하드 신호의 사람말 설명 추가 — **AC-17 parity 테스트가 하드 신호 토큰 수와 이 문서 대응을 동시 강제**하므로 AGENTS.md와 동반 갱신 필수 |
| 수정 | repo | `src/agents/workflow-policy.test.ts` | FR-3·4 신규 문구 계약(AC-3·5) 추가 + **기존 AC-17 `DOCS_EQUIVALENT` 배열에 비가역성 항목 추가**(하드 신호 토큰 증가에 따른 parity 유지) |
| 신규 | repo | `specs/202607202152-governance-recalibration/evidence/research-report.md` | 조사 전문 보존(AC-8) |

## 단계

1. **Phase 1 — 조사 보고서 보존**: deep research 결과 전문을 `evidence/research-report.md`로
   저장(두괄식·출처 등급 태그, human/both).
2. **Phase 2 — rules base 개정**(FR-1·2·5): 세 파일 작성/개정 + 인라인 개정 이력. rules 트랙
   (repo 밖) — 커밋은 데이터 폴더 백업 리듬에 맡기고 이 plan은 파일 상태만 관찰.
3. **Phase 3 — repo 개정**(FR-3·4): SKILL 재서술·AGENTS.md 티어 절 + 신규 문구 계약 테스트 →
   전체 스위트 green(AC-4).
4. **Phase 4 — 배포·도그푸드**: `make rules-deploy` 실행 → `~/.claude/localmind-rules.md` 반영
   관찰(AC-7). 결정 노트 second-brain 적재(AC-8).
5. **Phase 5 — self-review·closure**: preflight → **렌즈 병렬 fan-out self-review**(이 slice가
   첫 실전 — 사용자 지시 2026-07-20, evidence `lenses` 필드 기록) → 문서 검증 표기 → repo 트랙
   commit/push/PR.

## 테스트 전략

- 계약(unit): AC-3·4·5 — workflow-policy 관례(`has`/`hasIn`). rules base 파일은 repo 밖이라
  계약 테스트 대상이 아님 — AC-1·2·6은 **수동 텍스트 검사**(critic이 실파일 대조)로 검증.
- 통합(실행): AC-7 — `make rules-deploy` 실제 실행 + 배포 산출물 grep.
- 산출물 검사: AC-8 — 파일 존재 + capture 출력.
- 도그푸드: Phase 4·5 — 배포 반영 관찰 + 렌즈 병렬 self-review 첫 실전 자체가 이 개정 방향
  (능력 활용)의 도그푸드.

## Verification matrix

| AC | 검증 방법·레벨 | 최소 evidence | 통과·종료 조건 | 상태 |
|---|---|---|---|---|
| AC-1 | 수동 텍스트 검사(critic 실파일 대조) | 개정 파일 인용 | 고위험 강제·저위험 진행·요약 불가생략·결정로그·개정 이력 존재 | ✅ r2 clean |
| AC-2 | 수동 텍스트 검사(critic 실파일 대조) | 개정 파일 인용 | 권고 동반·일괄 모드·종료/한도 유지·개정 이력 존재 | ✅ r2 clean |
| AC-3 | 계약(unit) — SKILL 텍스트 | workflow-policy 신규 테스트 로그 | 불변식 목록·권장 기본 표기·재량 문구 존재, green | ✅ r2 clean |
| AC-4 | 계약(unit) — 전체 스위트 | 전체 테스트 실행 로그 | 기존 문구 계약 전부 green(회귀 0) | ✅ r2 clean |
| AC-5 | 계약(unit) — AGENTS.md 텍스트 | workflow-policy 신규 테스트 로그 | 비가역성 신호·검증가능성 보조 축·기존 신호 보존·예시 행, green | ✅ r2 clean |
| AC-6 | 수동 텍스트 검사(critic 실파일 대조) | 신설 파일 인용 | 이동 원칙·트리거·사람 결정+ADR·비대상 명시 존재 | ✅ r2 clean |
| AC-7 | 통합 — `make rules-deploy` 실행 | 실행 출력 + 배포 파일 grep | exit 0 + `~/.claude/localmind-rules.md`에 개정 문구 출현 | ✅ r2 clean |
| AC-8 | 산출물 검사 | 파일 목록·capture 출력 | research-report.md·개정 이력·결정 노트 존재 | ✅ r2 clean |

모든 AC가 정확히 한 행. AC-1·2·6은 자동 테스트가 아닌 수동 검사임을 명시(repo 계약 테스트의
경로 범위 밖) — degraded가 아니라 검증 방법의 성격이며, critic이 실파일로 수행한다.

**이중 트랙 closure 명시(D-5)**: FR-1·2·5의 실변경(rules base)은 repo PR diff에 포함되지
않는다 — versioned closure·PR 본문에 "실변경은 데이터 폴더, 리뷰어 실파일 대조 로그
(self-review evidence)가 유일한 검증 근거"임을 명시해 사람 머저가 오해하지 않게 한다.
