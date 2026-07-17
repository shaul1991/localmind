# Plan: 버전/릴리스 프로세스 규약 (CalVer)

> 모델 이력 — 작성: Fable 5(architect) · 검토: Fable 5(critic) · 구현: Opus 4.8(fan-out worker 위임)

<!-- 어떻게(how). 상위: [goal](goal.md) · [spec](spec.md) -->
<!-- 검증 표기: self-review clean 시 단계·테스트 전략 항목을 [x] + 근거로 표기한다(AGENTS.md 규약 5). -->

## TL;DR

AGENTS.md에 **버전·릴리스 절을 신설**(규약7 "PR 생성까지" 직후의 연장 — 머지→버전 확정 확인→tag→release)하고, goal-ready 스킬 §6에 "버전 미정" 1~2줄, CHANGELOG 상단 모순 주석 1줄을 각각 정정한다. 세 파일은 disjoint라 **레이어 1에서 동시 진행** 가능하고, 규약 문구를 핀하는 정적 테스트(052 F-7 패턴)가 그 뒤를 따른다. OQ 3건은 이 plan에서 확정한다 — MICRO 정본 = **git tag 목록**(D-1), 같은 날·hotfix = **동일 취급 MICRO+1**(D-2), 버전 확정 커밋 = **머지 대상 PR의 마지막 chore(release) 커밋**(이미 전부 머지된 묶음 릴리스만 경량 릴리스 PR — D-3).

## 확정 사실 표 (F-n) — 하위(tasks 분해·구현·크리틱)의 유일 사실 출처

> **재조사 금지·인용만.** 근거는 파일:행(행번호는 밀릴 수 있음 — 심볼·문구로 재검증). 확인일 2026-07-17.

| # | 사실 | 근거 |
|---|---|---|
| **F-1** | 규약7의 현행 문안: "self-review가 clean이면 **feature 브랜치 커밋·push + PR 생성까지가 `goal-impl`의 완료 정의**" + "**main 직접 push는 금지** — … 머지는 사람이 한다"(051 D-6) + CI 감시(`gh run watch`). 릴리스 절은 이 문장들을 **재서술 없이** "그 이후 단계"로만 이어 붙인다 | `AGENTS.md:56-66` (절 `## goal-impl {NNN} 처리 방법`은 16행 시작) |
| **F-2** | AGENTS.md 최상위 절 순서: SDD 흐름(5) → goal-impl 처리 방법(16) → 구현 규율(68) → 디자인·UI/UX(99) → 바이브 코딩(119) → 계약 저장소(135) → 실행 등급(160) → 오픈소스 대상(194). **신설 절의 자연 위치 = 66행(규약7 끝)과 68행(구현 규율) 사이** — 규약7 직후라 "연장"으로 읽힌다 | `AGENTS.md` `## ` 헤더 전수(grep, 2026-07-17) |
| **F-3** | CHANGELOG 모순 주석(FR-7 정정 대상)은 상단 blockquote 1줄: "버전 체계: **CalVer `YYYY.MM.MICRO`** — 버전은 릴리스 시점이 아니라 **문서 작성(goal-ready) 시점** 기준으로 부여한다." | `CHANGELOG.md:5` |
| **F-4** | goal-ready 정본의 편입 지점 = **§6 네 문서 작성**(43-52행, 번호 채번·네 문서 목록 직후). goal-ready는 packaged 스킬(catalog 등재)이라 **중립성 스캔 대상** — provider명·구체 모델 ID·런타임 도구명 금지. 단 `AGENTS.md` 파일명 언급은 이미 §2에 선례가 있어 안전 | `templates/skills/goal-ready/SKILL.md:43-52(§6)·24(§2 "AGENTS.md" 언급)` · 스캔 규칙은 052 plan F-6(`src/agents/skill-contract.ts:485-575`) |
| **F-5** | 정적 규약 문구 assert 패턴 2벌 존재: ① packaged 스킬 본문 핀 — `fs.readFileSync` + `assert.match(md, /문구/)`(050 T2.6), ② **AGENTS.md 규약7 문구 핀 선례** — `workflow-docs.test.ts`가 `read("AGENTS.md")` 후 "규약7에 PR 게이트가 명문으로 존재" assert(051 D-6). 053 정적 검증은 ②의 파일에 describe 블록을 추가하는 게 최소 변경 | `src/agents/skill-contract.test.ts:487-528` · `src/agents/workflow-docs.test.ts:12-13(read 헬퍼)·97-142(AGENTS.md 핀 describe)` |
| **F-6** | 첫 CalVer 릴리스의 로컬 검증 가능 증거: git tag `2026.07.0` 존재(**`v` 접두 없음**) · `package.json` version = `"2026.07.0"` · CHANGELOG 해당 릴리스 헤더 존재 | `.git/refs/tags/2026.07.0` · `package.json:3` · `CHANGELOG.md:7` |
| **F-7** | 이번 2026.07.0 릴리스의 실제 절차(메인 세션 실행분): **gh 소유자 계정 전환(`gh auth switch`)** → gh로 PR 머지(collaborator 권한 한계로 전환이 선행 필요했음) → **통합 PR 마지막에 chore(release) 커밋**(package.json bump + CHANGELOG 버전 헤더) → `git tag 2026.07.0` + tag push → **`gh release create 2026.07.0`**(CHANGELOG 해당 항목을 release notes로). ⚠️ 이 중 gh 계정 전환·release 생성은 **로컬 파일로 재검증 불가**(세션 보고 기반) — Phase 0에서 `gh release view 2026.07.0`으로 재확인한다(Live-Verify) | `specs/053-*/goal.md:9-14,27-30` · `spec.md:30-40(Context)` · 세션 실행 기록. 로컬 검증분은 F-6 |
| **F-8** | 도그푸드 함정 2건(규약 안전장치의 원천): (a) gh CLI 쓰기 작업은 권한 있는 계정 확인 선행, (b) "머지 완료" 판정 = `gh pr view` state(MERGED) **AND** main HEAD 이동 — main 불변이면 미머지, tag·release 진행 금지(빈 태그 방지) | `specs/053-*/spec.md:37-40` (goal Problem 3의 성문화 대상) |

## OQ 해소 결정 (D-1 ~ D-3)

> 각 결정은 "권고 + 근거 + 기각 대안" — 사용자 확인이 필요하면 메인이 이 절을 그대로 올린다. 확정 시 spec OQ에 취소선 + 이 절 포인터를 남긴다(AGENTS.md OQ 해결 표기 규약).

### D-1. MICRO 산정 정본 = **git tag 목록** (OQ-1 해소)

**권고**: 그 달의 MICRO는 **`git fetch --tags`로 원격 태그를 먼저 동기화**한 뒤 `git tag -l 'YYYY.MM.*' --sort=-v:refname`(머지 시점의 연·월)의 최상단 **수치 + 1**(사전순 아님 — `2026.07.10` > `2026.07.9`), 매칭 태그가 없으면 `0`. CHANGELOG 헤더와 어긋나면 **태그가 이긴다** — 태그는 릴리스 행위의 결정적·기계적 증거이고(release가 태그에 걸린다), CHANGELOG는 산문이라 드리프트의 대상 그 자체다(F-3이 실증). 어긋남 발견 시 CHANGELOG를 태그에 맞춰 정정한다.

**기각 대안**: ① CHANGELOG 헤더 기준 — 사람이 쓰는 산문이라 누락·오기가 가능(이번 spec의 정정 대상이 바로 CHANGELOG 주석). ② GitHub release 목록 기준 — 네트워크·gh 인증 의존이라 오프라인에서 결정 불가, 태그의 파생물일 뿐.

### D-2. 같은 날 복수 릴리스·hotfix = **동일 취급, MICRO +1** (OQ-2 해소)

**권고**: 같은 날 두 번째 릴리스든 긴급 hotfix든 구분 없이 통상 규칙(MICRO +1)을 적용한다. 채널·접미 표기를 도입하지 않는다.

**근거**: CalVer에 호환성·긴급도 시그널을 부여하지 않는다는 결정(goal Non-goal — SemVer 복귀 없음)과 동일 원리 — 버전은 "언제 릴리스했나"만 말한다. 긴급성·성격은 release notes(CHANGELOG 항목)가 말할 몫이고, 날짜는 태그 자체가 이미 담는다. 형식이 하나면 AC-9 같은 엣지가 기계적으로 풀린다.

**기각 대안**: hotfix 전용 접미·채널(`2026.07.1-hotfix` 류) — 형식 파편화로 MICRO 산정(D-1)·태그 글롭이 복잡해지고, 얻는 정보는 release notes로 충분히 대체된다.

### D-3. 버전 확정 커밋 경로 = **머지 대상 PR의 마지막 chore(release) 커밋** (OQ-3 해소)

**권고**: 버전 확정 커밋(package.json bump — 잠금 파일 동반 + CHANGELOG 버전 헤더 기입)은 **main으로 머지될 PR의 마지막 커밋**으로 넣는다. 경우 분기:

- **단일 PR 릴리스**(기본): 그 feature PR의 머지 직전, 마지막 커밋으로 stamp.
- **여러 PR 묶음 릴리스**: 마지막으로 머지되는 PR(통합 PR)에 stamp — 이번 2026.07.0 실증 경로(F-7). 묶음의 모든 PR이 **이미 머지된 뒤**라면 chore(release) 단독의 **경량 릴리스 PR**을 만들어 머지한다(main 직접 push 금지 — 규약7과 정합).
- **월 경계 안전장치**: stamp 후 머지가 지연돼 월이 바뀌면 머지 전에 **재확정(re-stamp)** 한다 — "버전 = 머지 시점의 연·월"(FR-2)이 stamp 시점보다 우선한다(AC-7의 규약 문구로 편입).

**근거**: ① 규약7(main 직접 push 금지)을 위반하지 않고 버전 확정을 main에 넣는 유일한 경로가 PR 경유다. ② "머지 직전 확정"(FR-2)과 커밋 위치(PR 꼬리)가 시간적으로 일치해 버전-시점 드리프트 창이 최소다. ③ 이번 릴리스에서 실증된 경로라 도그푸드 근거가 있다.

**기각 대안**: ① 항상 별도 릴리스 PR — 단일 PR 릴리스에서 머지·CI가 2회로 늘어나는 순수 오버헤드(과설계). 묶음 릴리스의 "이미 전부 머지됨" 경우에만 쓰는 fallback으로 강등. ② 머지 후 main 직접 커밋 — 규약7 정면 위반, 즉시 기각.

## DDD 경계 · 유비쿼터스 언어

- bounded context: **저장소 거버넌스 문서면** — 코드 모듈 신설 없음. 산출물 = AGENTS.md 산문 규약 + packaged 스킬 1~2줄 + CHANGELOG 주석 + 정적 테스트 케이스.
- 용어는 spec Terminology를 그대로 쓴다(CalVer `YYYY.MM.MICRO`·변경 내용 서술·버전 확정(version stamping)·릴리스). 새 용어 없음. 신설 절 제목은 **`## 버전·릴리스 — 규약7 이후 (CalVer)`** 로 이 plan에서 고정한다(참조하는 두 파일이 절 제목에 의존하므로 여기서 못 박아 레이어 1 병렬을 가능하게 함).

## 영향 모듈

| 파일 | 변경 | 내용 |
|---|---|---|
| `AGENTS.md` | 수정(절 신설 — F-2 위치: 규약7 직후·"구현 규율" 앞) | `## 버전·릴리스 — 규약7 이후 (CalVer)`: FR-1 형식(YYYY.MM.MICRO·머지 시점 기준·MICRO 첫 릴리스 0·`v` 접두 없음·SemVer 의미 없음) + FR-2 관심사 분리(내용은 작업 중 PR에, 버전은 머지 직전) + FR-5 절차 5단계(각 단계 확인 항목 포함, 비개발자 가독) + FR-6 안전장치 2건(F-8) + D-1·2·3 확정 규칙 + 월 경계 재확정. **규약7 문장 재서술 금지** — "규약7의 PR 생성 이후"라는 접속으로만 연결 |
| `templates/skills/goal-ready/SKILL.md` | 수정(§6에 1~2줄) | "버전은 여기서 정하지 않는다 — 저장소 릴리스 규약(AGENTS.md 버전·릴리스 절) 참조. 작업 시작 시점에는 변경 내용 서술만 누적한다"(FR-4). **이중 서술 금지**(051 SSoT) — 규칙 본문 없이 참조만. **중립성 스캔 대상**(F-4) — provider·모델명 0건, AGENTS.md 언급은 §2 선례로 안전 |
| `CHANGELOG.md` | 수정(상단 주석 1줄) | F-3 문구를 "버전은 **릴리스(PR 머지) 시점** 기준 — 확정 규칙은 AGENTS.md 버전·릴리스 절이 정본"으로 정정(FR-7 — 참조·요약만, 이중 서술 금지) |
| `src/agents/workflow-docs.test.ts` | 수정(describe 블록 추가) | AC-1·2·4(AGENTS.md 문구 존재)·AC-3(goal-ready 문구 존재 + packaged 스캔 clean)·AC-5(CHANGELOG 새 문구 존재 + 구 문구 부재) assert. **배치 근거**: 이 파일이 이미 AGENTS.md 규약7 문구를 핀하는 선례(F-5②)·`read()` 헬퍼 보유 — skill-contract.test.ts(스킬 전용)보다 적합. assert 스타일은 F-5① 패턴(`assert.match`) 계승 |
| `specs/053-*/tasks.md` | 신규(구현 시) | 전 phase에 `depends-on`·`files` 선언(052 규약) |

> AGENTS.md는 packaged 스킬이 아니라 중립성 스캔 밖(저장소 규약 문서) — `gh`·`git tag` 같은 구체 명령을 절차에 그대로 쓸 수 있다. `templates/sdd/AGENTS.md`(scaffold 배포용)에는 반영하지 않는다 — 이 릴리스 규약은 localmind 자체의 것이고, 외부 프로젝트 강제는 goal 범위 밖(scope creep 방지).

## 단계 (phase) — 052 병렬 형식

예상 fan-out: **레이어 1 = Phase 1 ∥ Phase 2 ∥ Phase 3**(파일 disjoint, 내용 의존은 이 plan의 D-1~3·절 제목 고정으로 해소됨), **레이어 2 = Phase 4**, **레이어 3 = Phase 5**.

- [x] **Phase 0 — Live-Verify 게이트** (standard, 착수 시 1회)
  > depends-on: 없음 · files: 없음(확인만)
  F-7의 세션 보고 사실을 재확인: `gh release view 2026.07.0`(release 실존), `git tag -l '2026.07.*'`(태그·접두 확인 — F-6과 대조), 현재 gh 인증 계정. 확인 결과를 self-review 보고에 1줄 명시. 실패(예: release 부재) 시 규약 문안의 해당 실증 서술을 수정하고 사용자에게 보고.

- [x] **Phase 1 — AGENTS.md 버전·릴리스 절 신설** (critical-reasoning — 규약 문안은 이후 모든 릴리스의 정본, 파장 큼)
  > depends-on: 없음 · files: `AGENTS.md`
  영향 모듈 표의 내용대로 F-2 위치에 절 신설. FR-1·2·5·6 + D-1·2·3 전부 이 절 한 곳에(단일 정본). 규약7 비재서술 확인(FR-3 Constraint).

- [x] **Phase 2 — goal-ready "버전 미정" 편입** (standard — 문구·위치가 이 plan에 확정돼 있음)
  > depends-on: 없음 · files: `templates/skills/goal-ready/SKILL.md`
  §6에 1~2줄 편입(F-4 지점). 편집 후 packaged 중립성 스캔 clean 확인. `make skills-deploy` 전파는 Phase 5에서 일괄.

- [x] **Phase 3 — CHANGELOG 모순 주석 정정** (standard)
  > depends-on: 없음 · files: `CHANGELOG.md`
  F-3의 5행 blockquote를 새 규약 요약 + AGENTS.md 참조로 교체(FR-7).

- [x] **Phase 4 — 정적 계약 테스트** (standard)
  > depends-on: Phase 1, Phase 2, Phase 3 · files: `src/agents/workflow-docs.test.ts`
  확정된 규약 문구를 assert로 핀(AC-1~5). 규약 문구가 먼저 확정돼야 assert 문자열을 못 박을 수 있는 사후 핀 성격(050 T2.6·052 Phase 4와 동일 — TDD 변형임을 보고에 명시). **AC-5 스캔 범위 주의**: 구 문구("문서 작성(goal-ready) 시점 기준"류) 부재 검사는 CHANGELOG.md·AGENTS.md·`docs/`·`templates/`로 한정하고 **`specs/`는 제외**한다 — specs/053 자신이 드리프트를 역사로 인용하고 있어 전역 0건 검사는 자기 오탐이다(제외 사유를 테스트 주석에 명시). 검증: `npm test` 전체 green + `npm run build` clean.

- [x] **Phase 5 — 배포·self-review·검증 표기** (worker 실행 · 최종 판정은 격리 리뷰어 critical-reasoning)
  > depends-on: Phase 0~4 전부 · files: `specs/053-version-release-process/goal.md`, `spec.md`, `plan.md`, `tasks.md`
  `make skills-deploy`(goal-ready 정본 전파) → self-review(점검 5범위 — 특히 규약7 비약화 여부, F-7 미검증분 처리) clean → spec OQ 취소선 + D 포인터 → 세 문서 `[x]` + 근거 표기 → 커밋·push·PR·CI 감시(규약7). AC-6~9 도그푸드는 후속 릴리스 승계임을 spec 검증 결과 절에 정직 명시.

## 테스트 전략 — AC 1:1 (정적 / 도그푸드 2층, specs/050·052 계승)

| AC | 정적(규약 문구 존재 — Phase 4) | 도그푸드 |
|---|---|---|
| AC-1 CalVer 형식 | AGENTS.md 신설 절에 `YYYY.MM.MICRO`·"릴리스(PR 머지) 시점"·"첫 릴리스 = 0"·"`v` 접두 없" assert | — |
| AC-2 관심사 분리 | "변경 내용 서술은 작업 중 PR에"·"버전 … 확정은 PR 머지 직전" assert | — |
| AC-3 goal-ready 버전 미정 | SKILL.md에 "버전은 여기서 정하지 않는다"류 + 릴리스 규약 참조 assert + packaged 중립성 스캔 clean | — |
| AC-4 절차·안전장치 | 머지→버전 확정 확인→tag→release 순서, gh 계정 확인, "PR state + main HEAD 변화" assert | — |
| AC-5 모순 문구 0건 | CHANGELOG 새 문구 존재 + 구 문구 부재(범위: CHANGELOG·AGENTS.md·docs/·templates/, specs/ 제외 — Phase 4 참조) assert | — |
| AC-6 릴리스 수행 | — | **다음 릴리스에서 관찰**(규약 문서만으로 재질문 없이 수행·연월 일치) — 052 AC-5·7과 동일하게 **후속 slice 관찰로 승계**, 미발생 시 spec에 정직 명시(은폐 금지) |
| AC-7 달 넘긴 작업 | (월 경계 재확정 문구는 AC-4 assert에 포함) | 해당 조건의 릴리스 발생 시 관찰 — 후속 승계 |
| AC-8 미머지 태그 차단 | (안전장치 문구는 AC-4 assert에 포함) | 미머지 상황은 의도 재현이 아니면 미발생 가능 — 후속 승계, 미발생 명시 |
| AC-9 같은 달 2번째 릴리스 | (D-1 MICRO 규칙 문구는 AC-1 assert에 포함) | 같은 달 추가 릴리스 발생 시 관찰 — 후속 승계 |

회귀: `npm test` 전체 + `npm run build`. 주의 — `workflow-docs.test.ts`·`skill-contract.test.ts`의 기존 케이스가 AGENTS.md·goal-ready 문구를 이미 핀하고 있으므로(F-5), 본문 편집 후 **기존 핀 케이스 포함 전수 green**이 각 배리어 조건이다.

## 가정 · 리스크

- **가정 1**: GitHub release `2026.07.0`이 실존한다(세션 보고 — 로컬 미검증, F-7). Phase 0이 재확인하며, 부재면 규약의 실증 서술을 수정한다.
- **가정 2**: 051 머지 완료 상태의 AGENTS.md(절 제목 `goal-impl {NNN} 처리 방법`, 규약7 56-66행)가 구현 시점에도 유효하다. 행번호가 밀렸으면 문구로 재탐색(F표 원칙).
- **리스크 — 산문 규약의 드리프트 재발**(goal Risks): 정적 문구 핀(Phase 4) + 다음 릴리스 도그푸드(AC-6)로 2층 방어. 절차 *준수* 자체는 정적으로 못 잡음을 spec에 명시.
- **리스크 — 중립성 스캔 위반으로 배포 실패**: goal-ready 편집 어휘 규율(F-4) + Phase 4의 packaged 스캔 clean 케이스가 커밋 전 기계 검출.
- **리스크 — AC-5 자기 오탐**: specs/ 역사 서술을 스캔에 넣으면 영구 red — Phase 4의 범위 한정으로 차단(테스트 주석에 사유 고정).
- **리스크 — 이중 서술 슬립**: goal-ready·CHANGELOG에 규칙 본문이 새어 들어가면 051 SSoT 위반 — self-review 점검 항목으로 명시(참조·요약만 허용).

## Open questions 해소 매핑

spec OQ 3건 전부 이 plan에서 확정: MICRO 정본 = D-1, 같은 날·hotfix = D-2, 버전 확정 커밋 경로 = D-3. 세 결정 모두 사용자 미확인 상태의 **권고**다 — 메인이 사용자 확인을 받은 뒤 구현 착수하며, 확정 시 spec OQ에 취소선 + 본 절 포인터를 남기고 결정 노트(`tags: ["decision"]`)를 적재한다.
