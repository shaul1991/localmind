---
title: Deep Research evidence pack 보강 계획
audience: both
---

# Plan: Deep Research evidence pack 보강

상위: [goal.md](goal.md) · [spec.md](spec.md)

## 접근 요약

기존 `deep-research` package는 report-only 정본으로 유지하고, reference에 ID·claim 충분성·checkpoint·
handoff 계약만 추가한다. 영속 파일 생성은 별도 `research-evidence-pack` package로 분리해 catalog에서
`explicit/docs-only`로 선언한다. 이 package는 사용자 확인 경로와 이미 수집된 조사 산출물만 입력으로
받으며 네트워크 조사나 판단을 수행하지 않는다.

JSONL 구조 검증은 외부 의존이 없는 Python 표준 라이브러리 script로 구현하고 Python 3.9 이상 문법만
사용한다. TDD fixture로 유효/손상 pack을 먼저 고정한다. 기존 manifest-driven adapter와 lifecycle을
재사용하며 logical ID 전용 product 분기는 추가하지 않는다.

## 도메인 경계 (DDD)

### Research Orchestration Contract — 기존 bounded context

- 소유: research brief/question/lane, source authority, claim/evidence ledger, 충분성, conflict, checkpoint,
  synthesis, final critic, report-only 경계.
- Aggregate: `ResearchRun` — run-local source/evidence/claim ID와 상태를 묶는다.
- 불변식: 모든 material claim은 supported/contested/unverified/withdrawn 중 하나이며 근거 없는 supported는 없다.

### Research Evidence Packaging — 신규 bounded context

- 소유: `EvidencePack`, 출력 경로 gate, 5개 파일 schema, 참조 무결성 검사, validation result.
- 입력: 완료 또는 checkpoint 상태의 조사 보고와 ledger handoff.
- 출력: 사용자 확인 경로의 versionable 문서/JSONL 파일.
- 비소유: source 검색, claim 판단, synthesis, HTML/PDF, 외부 저장.

### Workflow Catalog & Distribution — 기존 bounded context

- 소유: logical ID, activation/side-effect policy, canonical package 배포, managed/unmanaged lifecycle.
- 변경: `research-evidence-pack` 정의를 추가하고 기존 generic adapter를 그대로 재사용한다.

## 설계 결정

- **D-1:** `deep-research` 정책은 explicit/report-only를 유지한다. 쓰기 권한을 위해 docs-only로 완화하지 않는다.
- **D-2:** 영속화는 별도 explicit/docs-only `research-evidence-pack` workflow가 담당한다.
- **D-3:** source/evidence/claim ID는 run-local 순번(`S-001`, `E-001`, `C-001`)이며 전역 정합성을 요구하지 않는다.
- **D-4:** 출처 충분성은 fixed count가 아니라 directness·authority·independence·materiality·conflict로 판정한다.
- **D-5:** validator는 구조와 참조를 검증할 뿐 source 진실성은 critic과 live verification의 책임으로 남긴다.
- **D-6:** validator는 Python 3.9+ 표준 라이브러리만 사용하고 네트워크·파일 수정 없이 pack을 읽는다.
- **D-7:** 산출 경로는 사용자 지정 또는 확인된 프로젝트 내부 경로만 허용한다. 암묵적 HOME fallback은 없다.
- **D-8:** HTML/PDF·자동 open·원격 저장은 비목표이며 후속 요구가 생길 때 별도 SDD로 다룬다.

## 영향 모듈

### 수정

- `templates/skills/deep-research/SKILL.md`
- `templates/skills/deep-research/references/research-contract.md`
- `templates/skills/catalog.json`
- `src/agents/skill-contract.test.ts`
- `src/agents/workflow-policy.test.ts`
- `src/agents/skills.test.ts`
- `src/agents/commands.test.ts`
- `src/agents/workflow-docs.test.ts`
- `docs/workflows.md`
- `README.md`, `docs/agents.md`, `CHANGELOG.md` 중 catalog·사용법과 직접 맞닿는 부분

### 신규

- `templates/skills/research-evidence-pack/SKILL.md`
- `templates/skills/research-evidence-pack/references/evidence-pack-contract.md`
- `templates/skills/research-evidence-pack/scripts/validate_bundle.py`
- validator valid/invalid fixture와 테스트

### 원칙적으로 무변경

- `src/agents/skills.ts`, `src/agents/commands.ts`, `src/agents/workflow-policy.ts`
- 외부 설치본 `~/.agents/skills/deep-research` — 배포 단계 전까지 손대지 않는다.

## 단계

- [x] **Phase 0 — baseline/freshness:** origin/main과 clean 상태를 확인하고 기존 deep-research 계약·전체
      baseline을 기록한다.
- [x] **Phase 1 — TDD RED:** ID/충분성/checkpoint, 새 policy/package, validator valid/invalid fixture,
      docs/lifecycle 계약 테스트를 먼저 실패시킨다.
- [x] **Phase 2 — canonical GREEN:** deep-research reference를 최소 보강하고 research-evidence-pack
      package·validator를 구현해 focused test를 통과시킨다.
- [x] **Phase 3 — distribution/docs:** catalog·runtime adapter 기대값·호출 문서·CHANGELOG를 7개 workflow
      상태로 갱신하고 generic lifecycle 회귀를 통과시킨다.
- [x] **Phase 4 — 통합/dogfood:** 전체 test/build, temp roots 2회 배포, unmanaged 보호, validator fixture,
      실제 Innerview 조사 brief의 report-only 실행과 임시 프로젝트 pack 생성을 관찰한다.
- [x] **Phase 5 — self-review/closure:** FR·AC 추적성, 정확성, 단순성, 보안·저작권·Live-Verify를 적대적으로
      검수하고 문서 검증 표기를 닫는다.

## 검증 matrix — AC 1:1

| AC | 검증 방법·레벨 | 최소 evidence | 통과·종료 조건 | 상태 |
|---|---|---|---|---|
| AC-1 | 정적 계약 단위 | policy exact, neutrality/executable scan | deep-research explicit/report-only와 고유 토큰·실행파일 0 | [x] |
| AC-2 | 정적 계약 + fixture | ID/schema/참조 assertion | 네 ID 종류·상태·관계가 모두 존재 | [x] |
| AC-3 | 행동 fixture | 단일 T1/상충 고위험 판정 기록 | fixed count 없이 각 기대 상태와 일치 | [x] |
| AC-4 | 행동 fixture | partial checkpoint sample | 완료·미완료·ledger·fallback·next step 모두 존재 | [x] |
| AC-5 | policy + 격리 agent 행동 | no-path 응답, watch tree·git status before/after hash | write/open 0, 경로 질문만 반환 | [x] |
| AC-6 | validator 단위 | valid pack stdout/exit | exit 0, count·coverage 요약 일치 | [x] |
| AC-7 | validator 단위 | invalid fixture별 stderr/exit | 네 결함이 각각 non-zero와 명시 오류 | [x] |
| AC-8 | temp filesystem 통합 + versioned mirror | before/after tree/hash, exact pack | 지정 경로 5개 외 변경 0 | [x] |
| AC-9 | 격리 agent 보안 행동 audit | malicious 입력 pack, validator, forbidden scan | 실행·유출 0, 최소 요약만 pack에 존재 | [x] |
| AC-10 | lifecycle 통합 | first/second deploy report, hashes | created/updated→unchanged, unmanaged byte 동일 | [x] |
| AC-11 | 실제 dogfood + versioned mirror | report, ledger/pack, critic 원문, validator log | claim 추적 가능·validator green·독립성 정직 표기 | [x] |
| AC-12 | 전체 회귀 | test/build/diff-check log | 모든 명령 exit 0 | [x] |

첫 dogfood 직전에 이 matrix를 freeze한다. 이후 candidate를 바꾸는 finding은 영향받은 행의 evidence를
재실행한다.

## Open questions

- 없음. 구현 중 generic lifecycle 결함이나 runtime별 script 실행 제약이 실제로 발견되면 범위를 임의
  확장하지 않고 새 Open question으로 올린다.
