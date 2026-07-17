# Plan: SDD 구현 스킬 정합 — goal-impl 통일

> 모델 이력 — 작성: Fable 5 · 검토: 미정 · 구현(예상): 미정

<!-- 어떻게(how) 만드는가. 상위: [goal](goal.md) · [spec](spec.md). audience: both —
     사람 검토용 결론 먼저, /goal-impl(=이 spec이 확립하는 워크플로)이 결정적으로 소화. -->

> **TL;DR** — ① 은퇴는 자동이 아니다: catalog·templates에서 `sdd-implement`를 지워도 seed는
> 데이터 정본을 정리하지 않고(F-4), 데이터 사본이 비예약 custom으로 **계속 배포**된다(F-3).
> Gemini wrapper도 template 루프 밖이라 잔존한다(F-5). → **마커 결합 source-absence 정리
> 2곳(seed 데이터 정본·gemini wrapper)을 기존 prune primitive로 보완**한다(D-2, 이름 목록
> tombstone 불요 → 활성 표면 리터럴 0 유지). ② 본문은 base 122줄 구조를 유지하며 044의
> 게이트·AGENTS.md 위임을 병합하고, 스캔 위반 실측 2토큰(`claude`·`sonnet`, F-10)과 페르소나
> 고유명·완료 규칙 자체 서술(F-12 상충 포함)을 제거한다. ③ §0(내장 명령 구분)은 packaged
> 본문에서 삭제하고 runtime 특화 서술은 docs/agents.md로 이관한다(D-1). ④ 052 문서 갱신은
> 051 범위 밖(D-4). 단계는 P1(은퇴 기제) ∥ P2(신 정본) → P3(개명 전파) → P4(가드 테스트)
> → P5(도그푸드).

## OQ 해소 결정 (D-1 ~ D-5)

- **D-1 (OQ-1 해소 — §0은 packaged에서 삭제, 이관 + 중립 잔존 1줄)**: base §0(내장 `/goal`
  구분)은 특정 런타임 URL(`code.claude.com` ×2 — F-10)과 내장 명령 계층 서술로 스캔 통과
  불가이고, 내용의 본질은 오케스트레이션 지침이 아니라 **명명 역사·근거**다. packaged 본문에서
  절을 삭제하고, (a) 런타임 특화 주의(내장 `/goal`과의 구분·겹쳐 쓰기 사용법)는 이미 같은
  내용을 담고 있는 `docs/agents.md`(:167-172 — adapter/docs는 스캔 대상 아님, F-9)를 갱신해
  이관하며, (b) packaged 본문에는 중립 규율 1줄만 남긴다 — "이 워크플로 이름을 런타임 내장
  명령과 겹치게 바꾸지 마라. 런타임에 지속 실행(목표 유지) 내장 기능이 있으면 사용자가
  바깥에서 감쌀 수 있으나 필수 전제가 아니다"(044 §8 계승). 기각 대안: 전체 일반화 재작성 —
  근거 URL 없는 역사 서술은 지침으로서 검증 불가한 서사만 남아 ai-문서 밀도 규약에 반한다.
  "이 절을 지우지 마라"는 거버넌스 지시의 수신처는 벌트 정본이며, packaged 스킬이 그 역사의
  집이 아니다.
- **D-2 (OQ-2 해소 — 은퇴는 자동이 아님 → 마커 결합 source-absence 정리 2곳 보완)**:
  실측 결과 catalog·templates 제거만으로는 은퇴되지 않는다. (a) seed는 데이터 폴더를 prune하지
  않아(F-4) 옛 `skills/sdd-implement/`(마커 보유 — F-11의 template이 marker 포함 verbatim
  seed됨)가 잔존하고, (b) 비예약이 된 그 사본을 classify가 **custom으로 계속 배포**한다(F-3).
  (c) skill-directory 타깃에는 source-absence prune이 이미 있으나(F-5a) — 데이터 정본이
  사라져야 발동한다 — (d) Gemini wrapper는 template 루프 한정이라 absence 정리가 없다(F-5b).
  → **보완 2곳**: ① `seedWorkflows`에 "데이터 폴더의 마커 결합 managed 디렉토리 중 template
  집합에 없는 이름 → `pruneManagedDirectory`"(template registry clean일 때만 — 기존 early
  return이 보장, F-18). ② `syncGeminiCommands`(commands 모듈 소유)에 "commandsDir의
  이름 결합 managed `.toml` 중 template 집합에 없는 이름 → `pruneManagedFile`"(available &&
  !pruneSuppressed일 때만 — skill-dir sweep과 동일 조건). 두 정리 모두 기존 reconcile
  primitive(retired rename→삭제, F-8)만 재사용하고 **이름 무관(generic)**이다 — unmanaged
  (마커 없음·개명된 fork)는 기존 의미론대로 보존된다. 같은 run에서 seed→deploy 순서
  (skills.ts:683-685)이므로 seed가 데이터 정본을 지우면 deploy의 기존 sweep이 skill-dir
  타깃을 자동 정리한다. 기각 대안 1: catalog `retired` 목록 — manifest 스키마가 strict라
  개정 필요(F-17)하고, 활성 표면에 `sdd-implement` 리터럴(tombstone)이 영구 잔존해 AC-1의
  기계 검증(grep 0)이 허용 목록 없이는 성립하지 않는다. 기각 대안 2: 수동 마이그레이션 안내 —
  오픈소스 비개발자 사용자에게 수동 단계 강제는 부적합.
- **D-3 (OQ-3 해소 — 개명 경계: 현재형 규범 = 개명, specs 문서 = 보존)**: AGENTS.md·docs·
  templates의 **현재형 규범 서술**(절 제목·논리 command ID·호출 문법·규약 7·구현 규율 예외
  문구 — F-15)은 전부 `goal-impl`로 갱신한다. AGENTS.md의 "specs/044" 포인터 문장(내장
  `/goal` 비-shadow 결정)은 구명 리터럴이 없으므로 그대로 둔다. **`specs/044`·`050` 폴더
  내부 문서는 역사 기록으로 불가침**. 개명 사실의 역사는 specs/051 문서 자신이 담당하고,
  활성 표면에는 "(specs/051에서 개명)" 같은 **구명 리터럴 없는 포인터만** 허용한다 — 이래야
  AC-1/AC-6의 grep-0 검증이 허용 목록 `specs/**` + 가드 테스트 자신만으로 결정적이 된다.
- **D-4 (OQ-4 해소 — 052 문서 갱신은 051 범위 밖)**: `specs/052-*`는 main에 없다(F-14 —
  feat/052 브랜치 전용). 브랜치 교차 편집은 충돌만 만들고, 052 plan D-4가 이미 "051 완료 시
  편집 대상 치환"으로 분기 처리했다(발주 지시로 확인). → 052 착수(rebase) 시점에 052가 자기
  문서를 치환한다. 051의 산출물(확정된 `goal-impl` 이름·본문)이 그 치환의 입력이다.
- **D-5 (OQ-5 해소 — 안내 표면 = 기존 배포 결과 보고)**: 신규 표면을 만들지 않는다.
  (a) 은퇴·대체는 `formatSeedResult`/`formatDeployResult`(비개발자 한국어, F-5a의 STATUS_LABEL)
  가 이미 항목별로 보고한다 — logicalId는 런타임에 디렉토리명에서 오므로 소스 리터럴 없이
  구명이 출력에 자연히 나타난다. seed 정리 reason만 "packaged 정본에서 은퇴됨"으로 명시한다.
  (b) unmanaged 데이터 `goal-impl` 사본이 있으면 기존 reserved-fork 안내(RESERVED_FORK_REASON,
  F-6)가 rename 지시를 출력한다. (c) 백업: managed 대체는 reconcile의 swap backup 경로
  (F-7·F-8)가 담당 — 신규 백업 기제 없음. (d) `docs/agents.md` 워크플로 표를 goal-impl로
  갱신하며 "(구명은 specs/051 참조)" 포인터를 단다(D-3 경계 준수).

## 확정 사실 표 (F-1 ~ F-18, 확인일 2026-07-17)

| # | 사실 | 근거(파일:행) |
|---|---|---|
| F-1 | `sdd-implement` 참조 32파일 244건. 활성: 코드 2(주석 — workflow-policy.ts:55, cross-review-cli.ts:9)·테스트 8파일(F-16)·스크립트 1(workflow-lifecycle.test.mjs)·templates 4(skills/sdd-implement/ 디렉토리, catalog.json:5, sdd/AGENTS.md:16-19, sdd/spec.template.md:7)·AGENTS.md 6건·docs 2파일 9건·README.md:109. 역사(불가침): specs/044(6파일)·050(4파일)·051 | Grep 전수(2026-07-17) |
| F-2 | catalog 등록: `"sdd-implement": { "activation": "explicit", "sideEffects": "mutating" }` | templates/skills/catalog.json:5 |
| F-3 | catalog에서 이름 제거 시 데이터 정본 사본은 **비예약 custom으로 계속 배포**된다(`classify`가 비예약 데이터 스킬을 deployable로 편입) | src/agents/skills.ts:303-330(특히 :317) |
| F-4 | seed는 데이터 폴더를 prune하지 않는다("prune 없음(사용자 fork 보존)") — template 부재 정본이 잔존 | src/agents/skills.ts:488-517 |
| F-5 | (a) skill-dir 타깃엔 source-absence prune 존재(`managedDirNames` sweep, `!pruneSuppressed`일 때) · (b) Gemini는 template 루프 한정 — absence sweep **없음**(제거된 ID의 managed `.toml` 잔존) | (a) src/agents/skills.ts:422-433 (b) src/agents/commands.ts:538-595 |
| F-6 | 예약 ID + non-equivalent/markerless 데이터 사본 = reserved fork → fail-closed retire(배포 차단·타깃 prune·rename 안내). goal-impl 예약화 시 unmanaged 데이터 사본의 처리 경로(AC-11) | src/agents/skills.ts:105,303-330,410-420; 특성화 테스트 src/agents/skills.test.ts:116-135 |
| F-7 | seed의 managed 대체: 마커 보유 데이터 사본은 `replaceManagedDirectory` 백업 스왑으로 신 template에 갱신 — FR-6 managed 분기 | src/agents/skills.ts:506-514 |
| F-8 | retirement primitive: `pruneManagedDirectory`(retired rename → 삭제, unmanaged 불가침) · `pruneManagedFile` 동일 규율 | src/agents/reconcile.ts:425-465, 673-713 |
| F-9 | 중립성 스캔: 금지 토큰 목록(provider명·모델·runtime 도구·placeholder) + `Agent tool/type` 정규식. packaged 로드 시 강제(위반 = source problem → 배포 전역 실패). **adapter·docs는 스캔 대상 아님** | src/agents/skill-contract.ts:485-515, 518, 556-575, 728-734 |
| F-10 | 배포 goal-impl 122줄의 스캔 위반 실측 **2토큰**: `claude`(§0의 code.claude.com URL — SKILL.md:22,26) · `sonnet`(§5 "Sonnet 5" — :87). 페르소나 고유명(§1 I-3 :46-51)·`pkpk /changelog`(:112)는 스캔 토큰이 아니나 FR-5·오픈소스 규약으로 제거 대상 | ~/.claude/skills/goal-impl/SKILL.md(배포본) ↔ skill-contract.ts:485-515 대조 |
| F-11 | 044 sdd-implement 69줄 구조: §1 활성화 게이트(provenance·3자리·challenge·instruction-level 정직 표기) · §2 AGENTS.md 정본 · §7 완료 규칙 위임 · §8 지속 목표 기능 선택. template에 마커 포함(seed 시 verbatim 전파 → 데이터 사본 managed) | templates/skills/sdd-implement/SKILL.md:5,16-31,33-36,56-61,63-65 |
| F-12 | base §6-4("PR 생성 — 머지는 사람, main 직접 push 금지")와 AGENTS.md 규약 7("커밋·push까지가 완료 정의")이 **상충** — FR-4 위임(자체 서술 삭제)이 해소 | 배포본 SKILL.md:103-104 ↔ AGENTS.md:56 |
| F-13 | 050 바인딩 소비 규약: 부재 시 side-effect 전 안내 + 기본 미진행, 그 자리 명시 동의 시만 임시 진행(보고에 명시), 격리 위임 불가 시 현재 세션 대행 + **비독립 fallback 명시**, 위임 성사 시 페르소나 정의 model이 tiers보다 우선 | templates/skills/localmind-binding/references/binding-contract.md:42-66 |
| F-14 | `specs/052*`는 main 작업 트리에 부재(0건) — feat/052 브랜치 전용 | Glob specs/052*/** → 없음 |
| F-15 | AGENTS.md 개명 대상 행: 16(절 제목)·18-20(ID·호출 문법)·56(규약 7)·83(구현 규율). templates/sdd/AGENTS.md:16-19 · templates/sdd/spec.template.md:7 · docs/agents.md:134,138,149,157,167,170-172,211 · docs/workflows.md:31 · README.md:109 | Grep -n |
| F-16 | 테스트 회귀 지점: skills.test.ts(54건 — :80 이름 목록, :645 manifest 픽스처 등), commands.test.ts(18건 — :50,461-464 호출 문법, :483 예약 목록), workflow-policy.test.ts(:76 AC-10 블록, :156-177), skill-contract.test.ts(:174-187 픽스처), verify-targets.test.ts(:72-75), workflow-docs.test.ts(:70-83 — :83 template 경로 하드코딩), scaffold.test.ts(:151-156), execution-policy.test.ts(:56-58), workflow-lifecycle.test.mjs(:48 WORKFLOWS 배열, :57-58,119-137) | Grep -n |
| F-17 | manifest 스키마는 `.strict()`(workflows만) — `retired` 필드 추가는 스키마 개정 필요(D-2 기각 대안의 근거) | src/agents/skill-contract.ts:379-392 |
| F-18 | template registry problem 시 seed는 어떤 write도 전에 early return, deploy는 전역 failed — 은퇴 sweep도 이 가드 아래에서만 실행됨(부재 기반 오삭제 방지) | src/agents/skills.ts:493-496, 556-564 |

## DDD 경계 · 영향 모듈

**Bounded context**: 워크플로 자산 수명주기(skill-contract=검증·중립성 / skills=seed·배포
조율 / commands=Gemini adapter / reconcile=write primitive / workflow-policy=활성화 계약).
051은 이 경계를 **바꾸지 않는다** — reconcile primitive 불변, sweep 오케스트레이션은 각
adapter의 기존 소유(seed는 skills, wrapper는 commands)에 얹는다. 유비쿼터스 언어 변경:
논리 ID `sdd-implement` → `goal-impl`(catalog가 SSoT), "은퇴(retire)" = 마커 결합
source-absence 정리.

| 모듈 | 변경 |
|---|---|
| `templates/skills/goal-impl/SKILL.md` | **신규** — 병합 매핑(아래) 산출물, 마커 `skill: goal-impl` |
| `templates/skills/sdd-implement/` | **디렉토리 삭제** |
| `templates/skills/catalog.json` | 키 개명(`goal-impl`, explicit·mutating 유지) |
| `src/agents/skills.ts` | seed source-absence 정리 추가(D-2①) |
| `src/agents/commands.ts` | Gemini wrapper source-absence 정리 추가(D-2②) |
| `src/agents/workflow-policy.ts` · `cross-review-cli.ts` | 주석 개명(F-1) |
| `AGENTS.md` · `templates/sdd/AGENTS.md` · `templates/sdd/spec.template.md` | 규범 절 개명(F-15, D-3 경계) |
| `docs/agents.md` · `docs/workflows.md` · `README.md` | 개명 + §0 런타임 특화 서술 이관(D-1) + 구명 없는 051 포인터(D-5d) |
| 테스트 8파일 + `scripts/workflow-lifecycle.test.mjs` | 개명·신규 시나리오(F-16) |
| `specs/052-*` | **불변**(D-4) · `specs/044·050` **불가침**(D-3) |

## 본문 병합 매핑 (FR-3·4·5 — 신 goal-impl 정본 구성)

| 신 절 | 출처 | 처리 |
|---|---|---|
| frontmatter | base description 재작성 | §0 참조 문구 삭제, 중립 |
| §1 활성화 게이트 | 044 §1(F-11) | 전문 이식(이미 중립) — provenance·3자리·challenge·instruction-level 정직 표기(AC-3) |
| §2 AGENTS.md 정본 읽기 | 044 §2 | 이식 — 문서 부재 시 중단·보고 |
| §3 입력 확정 | base §2 | 유지(tasks 재사용·재분해 금지, F표 인용 규칙, readiness 반환). 벌트 거버넌스 링크는 삭제 |
| §4 끊김 방어 | base §1 | I-1(체크박스 SSoT)·I-2(phase 커밋) 유지. I-3 페르소나 고유명 열거 → "쓰기 가능한 실행 역할 vs 읽기 전용 판단·검증 역할" 추상(구체 해석 = 바인딩) |
| §5 구현 규율 | base §3 + 044 §3·§4 | TDD/RED 확인·회귀 핀·DB 패리티·외과적 변경·로컬 인프라 유지(전부 중립) |
| §6 중단 규율 | base §4 | 유지(추측 금지·spec-first·3회 실패 중단) |
| §7 실행 등급·역할 | base §5 재작성 | "Sonnet 5" 삭제(F-10). critical-reasoning/standard 등급 언어 + 바인딩 참조 + 부재 시 F-13 소비 규약(안내→기본 미진행→명시 동의 시 임시 진행·비독립 fallback 명시)(AC-10) |
| §8 DoD | base §6 | 1(전 AC green)·2(도그푸드)·3(self-review — sdd-self-review 이름 유지, Non-goals) 유지. **4(PR/push 자체 규칙) 삭제** → "완료(commit/push/CI)는 AGENTS.md 규약대로" 위임 — F-12 상충 해소(AC-4) |
| §9 보고·정직 | base §7 + 044 정직 보고 | 병합. `pkpk /changelog` 예시 삭제(오픈소스 규약) |
| §10 이름·지속 실행(선택) | 044 §8 + D-1 잔존 1줄 | 내장 명령 비충돌 개명 금지 + 지속 실행 기능은 선택 전제 |
| (삭제) base §0·관련 링크 | — | D-1: docs/agents.md 이관 |

## 단계 (phase — depends-on · files 선언, 052 규약 형식 자기적용)

> P2·P3은 개명 원자성(goal Constraint "부분 개명 금지") 때문에 **한 커밋 그룹**으로 닫는다 —
> P3의 테스트 개명을 red로 먼저 쓰고 P2 산출물로 green을 만든 뒤 함께 커밋.

**P1 — 은퇴 기제(generic source-absence 정리)** · depends-on: 없음 · 담당: 쓰기 실행
역할(standard — 잘 명세된 primitive 재사용)
- files: `src/agents/skills.ts`, `src/agents/commands.ts`, `src/agents/skills.test.ts`, `src/agents/commands.test.ts`
- T1.1 (RED) seed 테스트: 데이터 폴더에 마커 결합 stale 디렉토리 → seed 후 pruned(reason
  "packaged 정본에서 은퇴됨") / unmanaged(마커 없음) → 보존·보고. T1.2 (RED) Gemini 테스트:
  template 부재 managed `.toml` → pruned / unmanaged toml 보존 / pruneSuppressed 시 보류.
  T1.3 구현(D-2①②) → green. 이름 무관이므로 개명과 독립 검증 가능(P2와 파일 배타 → 병렬 가).

**P2 — 신 정본 본문(병합·중립화)** · depends-on: 없음(P1과 병렬 가) · 담당: 쓰기 실행
역할(critical-reasoning — 신규 본문 판단)
- files: `templates/skills/goal-impl/SKILL.md`(신규), `templates/skills/sdd-implement/`(삭제), `templates/skills/catalog.json`
- T2.1 병합 매핑대로 SKILL.md 작성(마커 `goal-impl`). T2.2 catalog 키 개명. T2.3 자가 검증:
  `scanPackagedNeutrality` 0건(로컬 실행).

**P3 — 개명 전파(코드·테스트·규약·docs)** · depends-on: P1, P2(테스트 파일 공유 + 산출물
경로 참조) · 담당: 쓰기 실행 역할(standard — 기계적 치환, D-3 경계 준수)
- files: `AGENTS.md`, `templates/sdd/AGENTS.md`, `templates/sdd/spec.template.md`,
  `docs/agents.md`, `docs/workflows.md`, `README.md`, `src/agents/workflow-policy.ts`,
  `src/agents/cross-review-cli.ts`, F-16의 테스트 9파일
- T3.1 F-15 규범 서술 개명(specs/044·050 불가침). T3.2 docs/agents.md에 §0 런타임 특화 서술
  이관 + 구명 없는 051 포인터(D-1·D-5d). T3.3 F-16 테스트 픽스처·단언 개명 → 전체 스위트
  green(AC-8).

**P4 — 가드·특성화 테스트(AC-1~7 정적 잠금)** · depends-on: P3 · 담당: 쓰기 실행
역할(standard)
- files: `src/agents/workflow-docs.test.ts`(또는 신규 가드 테스트 파일),
  `src/agents/workflow-policy.test.ts`, `src/execution-policy.test.ts`,
  `scripts/workflow-lifecycle.test.mjs`
- T4.1 재유입 가드: 활성 표면(src/·docs/·templates/·scripts/·AGENTS.md·README.md) walk grep —
  허용 = `specs/**` + 가드 테스트 자신, 그 외 `sdd-implement` 0건(AC-1·AC-6). T4.2 중립성
  특성화: goal-impl `scanPackagedNeutrality` == [](AC-2; 재유입은 기존 packaged 강제가
  전역 실패시킴 — AC-7). T4.3 게이트·위임·강점 특성화: 본문에 게이트 문구(provenance·
  `^[0-9]{3}$`·challenge·instruction-level) 존재(AC-3), AGENTS.md 절 제목·호출 문법 goal-impl
  + 본문에 commit/push/CI 자체 규칙 부재·AGENTS.md 참조 존재(AC-4), 핵심 절 앵커(끊김 방어·
  tasks 재사용 금지·RED·중단 규율·DoD·보고) 존재(AC-5). T4.4 lifecycle 시나리오에 은퇴 관찰
  추가(WORKFLOWS 배열 개명 + 구 sdd-implement 잔재 정리 확인).

**P5 — 도그푸드·검증 표기·self-review** · depends-on: P4 · 담당: 현재 세션(조율) +
독립 리뷰(critical-reasoning — 다운시프트 금지)
- files: `specs/051-goal-impl-reconciliation/{goal,spec,plan}.md`(검증 표기)
- T5.1 `make update`(seed+deploy) 실행 — 3타깃에 goal-impl 배포 + sdd-implement 배포물
  pruned 관찰(AC-9). T5.2 데이터 폴더 goal-impl 분기 관찰: managed면 백업 스왑 갱신(F-7),
  unmanaged면 reserved-fork 보고·타깃 prune·rename 안내(F-6) — 덮어쓰기 0(AC-11, FR-6).
  T5.3 바인딩 설정/미설정 환경에서 스킬 §7 도달 관찰 — 해석/안내·fallback 표명(AC-10).
  T5.4 self-review clean 후 세 문서 체크 표기 → 커밋·push·CI 감시(AGENTS.md 규약 7).

## 테스트 전략 (AC → 레벨 1:1)

| AC | 검증 방법 | 레벨 | phase |
|---|---|---|---|
| AC-1 | 활성 표면 walk grep 0(허용: specs/**·가드 자신) | 정적(단위) | P4 |
| AC-2 | `scanPackagedNeutrality(goal-impl)` == [] 특성화 | 정적(단위) | P4 |
| AC-3 | 게이트 문구 특성화 + workflow-policy grant 판정 테스트 개명 유지 | 정적(단위) | P4 |
| AC-4 | AGENTS.md 절·문법 + 본문 완료 규칙 자체 서술 부재 특성화 | 정적(단위) | P4 |
| AC-5 | 핵심 절 앵커 존재 특성화(누락 0) | 정적(단위) | P4 |
| AC-6 | AC-1 가드가 스위트 상시 실행 — 재유입 = 실패 | 정적(단위) | P4 |
| AC-7 | 기존 packaged 중립성 강제(위반 → seed/deploy 실패) + AC-2 | 정적(단위·통합) | 기존+P4 |
| AC-8 | 전체 스위트 green(개명 기인 실패 0) | 정적(전체) | P3 |
| AC-9 | 실배포 3타깃 + sdd-implement 은퇴 관찰 | 도그푸드 + lifecycle(통합) | P5·P4 |
| AC-10 | 바인딩 설정/미설정 실행 관찰(F-13 규약 표명) | 도그푸드 | P5 |
| AC-11 | unmanaged 사본 보존·보고 관찰(+P1 단위 테스트가 같은 경로 커버) | 도그푸드 + 단위 | P5·P1 |

## 가정 · 리스크

- **가정 1**: 설치별 데이터 폴더 goal-impl의 마커 유무는 미확정(배포 타깃에서만 실측 —
  마커는 배포 시 주입되므로 데이터 소스는 markerless custom일 개연성이 높다). 어느 분기든
  F-6/F-7 기존 경로가 처리하며 P5-T5.2가 관찰·보고한다.
- **가정 2**: `sdd-self-review`·`goal-ready` 등 다른 스킬은 불변(goal Non-goals) — 신 본문의
  §8-3 참조 이름 유지.
- 리스크: seed sweep은 "마커 결합 + template 부재 = prune"이라는 계약 강화다 — 배포 타깃
  사본을 데이터 폴더로 손복사한 사용자가 있다면 동명 유지 시 정리된다(마커 의미론상 관리
  대상). 이름을 바꾼 fork는 마커 이름 불일치로 보존된다. P1 테스트가 이 경계를 핀한다.
- 관찰(범위 밖, 언급만): Gemini wrapper absence sweep 부재(F-5b)는 051 이전부터 있던 잠재
  비대칭 — D-2②가 이를 함께 닫지만, 과거 버전이 남긴 임의 stale wrapper 정리는 동일
  메커니즘으로 자연 해소된다.
