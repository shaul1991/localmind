# Tasks: 에이전트 작업 규칙 중앙관리 — base + overlay 배포 (FR-1~8)

> 모델 이력 — 작성: Opus 4.8(tasks-architect) · 구현(예상): 미정(Sonnet 5 위임 가능)
> 슬라이스 범위: **FR-1~8만** (핵심 메커니즘). FR-9(거버넌스 마이그레이션)는 별 슬라이스 — 이 tasks 제외.
> 사실 출처: `plan.md` 확정 사실 표 **F-1~F-10** (재조사 금지·인용만 → 파일:행은 밀릴 수 있어 심볼명으로 인용).

## Invariants (I-n) — 구현 모델이 틀리기 쉬운 정확성 급소

이 슬라이스의 병합·prune 경계 버그는 사용자 파일을 파괴한다. 모든 task는 아래를 위반하지 않아야 한다.

- **I-1 (사용자·비managed 섹션 불가침)**: 섹션 upsert는 managed 마커 경계 **안쪽만** 교체한다. 마커 경계 밖 바이트(사용자 저작 섹션·포매팅·개행)는 1바이트도 바뀌지 않는다. → AC-3, AC-4. (F-3 `writeManaged`의 "미마커 skip" 원칙을 **섹션 단위로** 승계.)
- **I-2 (멱등)**: 같은 정본 재배포 시 managed 섹션 포함 **불필요 diff 0** (`current === content`면 unchanged). → AC-3. (F-3 참조.)
- **I-3 (prune은 managed 산출물만)**: 정본에서 사라진 overlay/규칙의 managed 산출물만 제거. 사용자 파일·비managed 섹션은 절대 삭제 금지. 검증 문제(problems>0)면 prune 스킵. → AC-5. (F-1·F-3 `pruneManaged`, `pruneSkipped` 승계.)
- **I-4 (대상 폴더 부재 시 스킵)**: 표면 대상 폴더(`~/.claude`·`~/.codex`) 부재 시 그 표면만 스킵, **폴더 신규 생성 금지**, 나머지 표면 진행. → AC-8. (F-5 게이트 승계.)
- **I-5 (경로 무관)**: 규칙 정본·산출물 어디에도 디바이스 절대경로 0. 대상 경로 해소는 HOME(글로벌)·cwd(repo)로만. 산출물의 경로 참조는 `~`-접두/상대경로여야 한다(예 Claude 스텁의 `@~/…`). → AC-7. (F-7 — 경로 번역 로직 없음 = 절대경로를 산출물에 넣지 않아야 유일 안전.)
  - **테스트 함정(critic 중대 1)**: 절대경로 부재 검사를 `/Users/·/root/·/home/` **고정 프리픽스 목록**으로 하면 임시 트리(`/var/folders/…`·`/tmp/…`)에 배포하는 테스트에서 **false-green**(실제 대상 경로가 목록에 없어 안 걸림). 반드시 아래 T032/T060 방식으로 검사.
- **I-6 (overlay 우선 합성)**: base와 overlay가 같은 항목 충돌 시 overlay 값이 base를 덮음. → AC-6.
- **I-7 (표면별 형태 계약)**: Claude 글로벌 = `@import` 하드주입 보존(스텁이 localmind 생성 파일을 `@import`) / Codex 글로벌 = `AGENTS.md` managed 섹션 인라인(`@import` 미지원) / repo = `AGENTS.md` 인라인 managed + `CLAUDE.md`는 `@AGENTS.md` 한 줄 스텁(본문 중복 없음). → AC-1, AC-9, AC-10.

## 테스트 러너 (저장소 관례)

- 실행: `npm test` (= `node --import tsx/esm --test <globs>`).
- 단일 파일: `node --import tsx/esm --test src/rules/<name>.test.ts`.
- 타입: `npm run typecheck`.
- **주의**: 현재 `package.json`의 `test` 글로브는 `src/rules/*.test.ts`를 **포함하지 않음** → Phase 0에서 추가 필요.

---

## Phase 0 — Setup

**Purpose**: 신규 `src/rules/` bounded context 배치 + 테스트 글로브 편입.

- [x] **T001** Create `src/rules/` directory + placeholder `index.ts` (re-export barrel). (trivial)
- [x] **T002** Extend `test` script glob in `package.json` to include `src/rules/*.test.ts` (append to existing `node --import tsx/esm --test …` line). Without this the new tests never run. → 검증: `npm test`가 새 rules 테스트를 수집(빈 파일이라도 0-test 통과).

---

## Phase 1 — rules 정본 모델·로더 (plan §단계 1)

**Purpose**: base/overlay 정본 로드·검증·문제격리. `→ plan §영향 모듈 (src/rules/registry.ts)`, `→ F-6`.

- [x] **T010** Implement `loadRules()` + types (`BaseRule`, `Overlay`, `RegistryProblem` 재사용) in **`src/rules/registry.ts`**. 규칙 폴더는 `agents/registry.ts`의 `firstNotesDir()` 패턴 재사용 — 예 `<notes>/rules/base/*.md`, `<notes>/rules/overlays/<project>/*.md`, env override(`LOCALMIND_RULES_DIR`). YAML 무의존 미니파서 계열 유지(goal Constraint). `→ F-6 loadRegistry/agentsDir/firstNotesDir 패턴 계승`. `→ FR-1`.
  - **확인 필요**: 규칙 폴더 정확 경로·base authoring 포맷(개별 `.md` vs 단일 파일)은 plan Open question 미확정 — 구현 착수 전 사용자 확인. 단정 금지.
- [x] **T011 [P]** RED tests in **`src/rules/registry.test.ts`**: 유효 정본 로드 → base+overlay 목록 반환 / 무효(파싱 실패) → `problems`에 격리되고 throw 안 함 / 중복 정본 → 문제로 표기. **RED 기대**: `loadRules` 미구현이라 import 실패 또는 problems 미격리. → 검증: `node --import tsx/esm --test src/rules/registry.test.ts`.

---

## Phase 2 — 합성기 (plan §단계 2)

**Purpose**: base + overlay 순수 합성, overlay 우선. IO 없음. `→ plan §도메인 경계 (composition)`. (I-6)

- [x] **T020** Implement pure `compose(base, overlay) → ComposedRuleset` in **`src/rules/compose.ts`**. 충돌 항목은 overlay 값 채택. overlay 없는 repo는 base만. `→ FR-2`. (I-6)
- [x] **T021 [P]** RED tests in **`src/rules/compose.test.ts`**: base·overlay 동일 항목 충돌 → 산출물이 overlay 값, base 값 덮임 / overlay 없음 → base만. **RED 기대**: `compose` 미구현 import 실패; 회귀 핀은 "충돌 시 base가 남으면 실패"를 명시적으로 assert(precedence 역전 회귀 포착). → **AC-6**. 검증: `node --import tsx/esm --test src/rules/compose.test.ts`.
  - **의존(critic 경미 B)**: "충돌 항목"의 **단위**(파일명? 문서 내 키? 규칙 블록?)는 base authoring 포맷(개별 `.md` vs 단일 — spec OQ 미확정)에서 파생된다. authoring 포맷 확정 전엔 AC-6을 결정적으로 assert 불가. 포맷 확정 시 단위(예 "항목 = 명명된 규칙 문서, 동명이면 overlay 대체")를 명시하고 이 핀을 그 단위로 재서술.

---

## Phase 3 — 표면 렌더러 (plan §단계 3)

**Purpose**: `ComposedRuleset → 표면별 순수 산출물`. 순수 함수 1 = 표면 1 (F-4 대칭). (I-7)

- [x] **T030** Implement pure renderers in **`src/rules/render.ts`**:
  - `renderClaudeGlobalStub()` — `~/.claude/CLAUDE.md` 스텁: localmind 생성 규칙 파일을 `@import` (하드주입 형태, 본문 인라인 금지). `→ FR-3`. (I-7)
  - `renderClaudeGlobalImportFile()` — `@import` 대상 규칙 파일 본문(합성 결과). `→ FR-3`.
  - `renderCodexGlobalSection()` — `~/.codex/AGENTS.md` managed 섹션 인라인 본문. `→ FR-4`. (I-7)
  - `renderRepoAgents()` — `<repo>/AGENTS.md` managed 섹션 인라인. `renderRepoClaudeStub()` — `<repo>/CLAUDE.md` = `@AGENTS.md` 한 줄 스텁(본문 중복 없음). `→ FR-5`. (I-7, AC-10 형태)
  - 모든 산출물에 managed 마커 + "localmind 관리·직접 편집 금지, overlay 우선" 경계 주석. **확인 필요**: 마커 문구·경계 형식은 spec Open question(precedence 표기) 미확정.
  - 산출물 문자열에 절대경로 0 (I-5).
- [x] **T031 [P]** RED tests in **`src/rules/render.test.ts`** (스냅샷/단위): Claude 스텁이 `@import` 지시 포함(소프트 포인터 아님) / repo `CLAUDE.md` == `@AGENTS.md` 스텁이고 규칙 본문 미포함 / Codex 섹션은 인라인 본문 포함. **RED 기대**: 렌더러 미구현 → import 실패; 회귀 핀은 "Claude 스텁에 `@import` 없으면 실패"·"repo CLAUDE.md에 규칙 본문이 섞이면 실패"를 assert. → **AC-9, AC-10**. 검증: `node --import tsx/esm --test src/rules/render.test.ts`.
- [x] **T032 [P]** RED test (경로 무관, positive-assert): 임의 합성 입력의 모든 렌더러 산출물의 경로 참조가 **`~`-접두/상대경로임을 positive-assert**(절대경로 세그먼트 `/`-시작 부재를 일반 패턴으로). 고정 프리픽스 allowlist 금지(중대 1). **RED 기대**: 렌더러가 절대경로를 하드코딩하면 실패. → **AC-7**. (I-5)

---

## Phase 4 — 섹션 upsert 기록기 + managed/prune/게이트 (plan §단계 4)

**Purpose**: 사용자 저작 보존·멱등·prune·대상 부재 스킵. 파일시스템 IO 격리 어댑터. `→ plan §도메인 경계 (deploy 어댑터)`. (I-1~I-4)

> **확인 필요 (plan Open question)**: `src/rules/deploy.ts` 신규 vs `src/agents/deploy.ts`의 `writeManaged`를 섹션 단위로 일반화해 공유 — 미확정. 신규 모듈 가정으로 기술하되 착수 전 결정.

- [x] **T040** Implement `writeManagedSection(filePath, markerId, content)` in **`src/rules/deploy.ts`**: 파일 존재 시 marker 경계 안쪽만 교체, 경계 밖 바이트 보존; marker 없으면 append(신규 섹션); managed 아닌 파일이라도 사용자 섹션 불가침. `current === next`면 unchanged(멱등). `→ F-2 MANAGED_MARKER · F-3 writeManaged 승계`. (I-1, I-2)
- [x] **T041** Implement `pruneManagedSections()` / `pruneManaged()` for rules 산출물 in **`src/rules/deploy.ts`**: 정본서 사라진 overlay/규칙의 managed 섹션·파일만 제거; 사용자 파일·비managed 섹션 불가침; `problems>0`이면 prune 스킵(`pruneSkipped`). `→ F-3 pruneManaged 승계`. depends on T040. (I-3)
- [x] **T042** Implement `deployRules(opts)` orchestrator in **`src/rules/deploy.ts`**: `loadRules`→`compose`→표면별 render→`writeManagedSection`→prune. 대상 가용성 게이트(`~/.claude`·`~/.codex` 부재 시 스킵·폴더 생성 금지). `→ F-5 게이트 · F-1 deployAgents 흐름 대칭`. depends on T010, T020, T030, T040, T041. (I-4)
- [x] **T043** RED integration tests in **`src/rules/deploy.test.ts`** (임시 파일트리):
  - 멱등: 2회 배포 후 managed 밖 바이트 동일 + managed 섹션 diff 0. → **AC-3**. (I-2)
  - 사용자 섹션 보존: `[사용자A][managed][사용자B]` 구조 `AGENTS.md` 배포 → managed만 갱신. **회귀 핀 유효성**: 배포 전후 **마커 경계 밖 전체 영역**(사용자A·사용자B·개행·포매팅) 바이트를 비교해 1바이트라도 변하면 실패(병합 경계 오염 포착 — I-1은 "경계 밖 전체", 사용자 섹션 단수 아님). → **AC-4**. (I-1)
  - prune: overlay 제거 후 재배포 → 해당 managed 산출물만 사라지고 사용자 파일·비managed 그대로. **회귀 핀 유효성**: 같은 트리에 둔 사용자 파일이 삭제되면 실패(prune 과잉 포착). → **AC-5**. (I-3)
  - **prune-skip 안전밸브(critic 중대 2)**: `loadRules`에 problems를 유발(무효 base 파일 주입)한 뒤 배포 → **어떤 managed 산출물도 prune되지 않고** `pruneSkipped=true` 리포트. **회귀 핀 유효성**: problems>0에도 prune이 돌면 실패(부분 로드 실패 시 산출물 몰살 방어 — F-3 승계). → **AC-5**. (I-3)
  - 대상 부재 게이트: `~/.codex` 없는 임시 트리 → Codex 스킵(폴더 미생성) + Claude·repo 진행. → **AC-8**. (I-4)
  - **RED 기대**: `deployRules` 미구현 → import 실패. 검증: `node --import tsx/esm --test src/rules/deploy.test.ts`.

---

## Phase 5 — cwd→project 매칭 + repo in-place 배포 (plan §단계 5)

**Purpose**: cwd를 대상 경로로, cwd→project 매칭으로 overlay 선택. `→ F-10 kebab 정규화(specs/029)`.

- [x] **T050** Implement cwd→project match + repo in-place deploy path in **`src/rules/deploy.ts`** (또는 `registry.ts` 헬퍼): kebab-case 정규화로 cwd 이름 ↔ overlay project 매칭(F-10). 모호/실패 시 추측 금지 → 호출자에 확인 요청 신호(specs/029 규칙). **repo 표면은 overlay-only**(base는 글로벌이 주입, D8) — overlay 없는 repo는 repo 파일을 만들지 않는다. `→ FR-5, D5, D8`. depends on T042. (I-5 — cwd 사용, 절대경로 산출물 금지)
- [x] **T051** RED integration test in **`src/rules/deploy.test.ts`**: overlay 있는 임시 repo에서 cwd 배포 → `<repo>/AGENTS.md`(**overlay-only** 인라인 managed, base 제외) + `<repo>/CLAUDE.md`(`@AGENTS.md` 스텁) 생성. overlay 없는 repo → repo 파일 없음. 매칭 모호 케이스 → 추측 배포 안 함. **RED 기대**: in-place 배포 미구현 → 산출물 미생성. → **AC-2**. 검증: `node --import tsx/esm --test src/rules/deploy.test.ts`.

---

## Phase 6 — 경로 무관 가드 (plan §단계 6)

**Purpose**: 전 표면 산출물에 절대경로 부재 보증(린트성 테스트). (I-5) `→ F-7`.

- [x] **T060 [P]** RED end-to-end 경로 가드 test in **`src/rules/deploy.test.ts`**: 임시 트리 전체 배포 후, **이 테스트가 실제 사용한 대상 디렉토리 절대경로들**(env override로 넘긴 temp HOME·codex·repo 경로)을 계산해 그 문자열이 생성된 어떤 파일에도 등장하지 않음을 assert(+ `/`-시작 절대경로 세그먼트 일반 패턴 부재). 고정 프리픽스 목록 금지 — 임시 트리 경로(`/var/folders/…`·`/tmp/…`)가 목록에 없어 새는 false-green 차단(중대 1). **회귀 핀 유효성**: 어떤 렌더러/기록기가 대상 절대경로를 본문에 흘리면 실패. → **AC-7**. (I-5)

---

## Phase 7 — CLI 진입점 + AC-1 글로벌 양표면 통합 (plan §단계 7)

**Purpose**: 로컬 CLI 진입점 + 글로벌 양표면 도달 검증 + 도그푸드. `→ plan §영향 모듈 (scripts/rules-deploy.ts)`, `→ F-9 MCP/CLI 패턴 대칭`.

- [x] **T070** Implement CLI entrypoint **`scripts/rules-deploy.ts`** (`scripts/agents-deploy.ts` 대칭): `deployRules` 호출 + `formatDeployResult` 유사 한국어 요약. Add `rules:deploy` script to `package.json`. depends on T042, T050.
- [x] **T071** Add `Makefile` 타깃(예 `rules-deploy`) wrapping `npm run rules:deploy` (§15 task runner). **확인 필요**: device-sync(031) 편입 범위는 plan Open question 미확정 — 이 slice에서 제외, 글로벌+현재 repo 개별 배포만.
- [x] **T072** RED integration test in **`src/rules/deploy.test.ts`** (AC-1): 임시 `~/.claude`·`~/.codex` 트리 배포 후 `~/.claude/CLAUDE.md` 스텁이 base 담은 생성 파일을 `@import` + `~/.codex/AGENTS.md` managed 섹션에 동일 base 실효 내용 인라인. → **AC-1**. depends on T042. 검증: `node --import tsx/esm --test src/rules/deploy.test.ts`.
- [x] **T073** Dogfood: 이 저장소 cwd에서 `npm run rules:deploy` 실행 관찰(생성/멱등/스킵 로그) + 임시 repo 트리 배포 관찰. §8 도그푸드 게이트. depends on T070.

---

## Phase 9 — Codex 사실 라이브 재검증 (plan §단계 9, 구현 착수 직전)

**Purpose**: 렌더러가 의존하는 낡을 수 있는 Codex 사실을 T1 공식문서로 확인. self-review 게이트 (5).

- [x] **T090** Live-verify (T1: OpenAI Codex 공식문서) **구현 착수 전**: `AGENTS.md` git root→cwd 이어붙임 규칙 · 32KiB 상한 · `AGENTS.override.md` 우선 · `@import`/`CLAUDE.md` 미지원. 결과를 spec Open question에 반영(취소선/확정 이관) + 근거 기록. 확인 불가 항목은 단정 금지 → Open question 유지. depends on: T030 렌더러 설계 반영 전. `→ goal Risk(낡은 사실), spec OQ(Codex 사실 재검증)`.

---

## Dependencies & Execution Order

- Phase 0 → Phase 1,2 (Setup before context 구현).
- Phase 1 (T010) + Phase 2 (T020) + Phase 3 (T030) 는 서로 독립 — 순수 로드/합성/렌더로 **병렬 가능**. 각 RED test(T011, T021, T031, T032)는 대응 구현과 [P].
- Phase 4: T040 → T041 (prune이 marker 경계 기록기 의존) → T042 (orchestrator, T010·T020·T030·T040·T041 전부 의존).
- Phase 5: T050 depends on T042. Phase 6: T060 depends on T042(+T050).
- Phase 7: T070 depends on T042,T050 → T071,T073 depends on T070; T072 depends on T042.
- **Phase 9 (T090)는 Phase 3(T030) 렌더러 설계에 사실을 주입해야 하므로 시점상 T030 착수 직전**에 수행 — 순서상 앞이지만 단계 번호는 plan 계승(9).
- `[P]` 판단: T011/T021/T031/T032는 서로 다른 test 파일 + 다른 구현 대상 → 병렬. **주의**: T040·T041·T042·T050·T060은 모두 `src/rules/deploy.ts` 동일 파일 → **[P] 금지**(직렬).

## Definition of Done

- spec AC-1~AC-10 전부 실환경 테스트 green (`npm test` + rules 글로브 편입 확인).
- `npm run typecheck` clean.
- 도그푸드: 이 저장소 + 임시 repo 트리에 실제 배포 실행 관찰(생성·멱등 재배포 diff 0·사용자 섹션 보존·대상 부재 스킵·prune·절대경로 0).
- self-review clean 후 spec FR-1~8·AC-1~10, plan 단계 1~7·9, goal Success metrics 문서 체크 표기(AGENTS.md 규약 5).

## Clarification markers (확인 필요 — plan/spec Open question 미확정)

- 규칙 폴더 정확 경로 + base authoring 포맷(개별 `.md` vs 단일) — T010. **compose "항목" 단위(AC-6)가 여기 의존**(경미 B).
- Claude 글로벌 `@import` **대상 산출 파일의 배포 위치** + 경로 무관 참조 방식(`@~/…` 강제) — T030(경미 A, spec OQ).
- precedence 마커 문구·경계 주석 형식 — T030.
- `src/rules/deploy.ts` 신규 vs `agents/deploy.ts` `writeManaged` 일반화 공유 — Phase 4.
- device-sync(031) repo 순회 편입 범위 — T071(이 slice 제외).
- 규칙 배포 MCP 도구 노출 여부 — 이 slice CLI 우선, 제외.
