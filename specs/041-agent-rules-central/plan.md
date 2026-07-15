# Plan: 에이전트 작업 규칙 중앙관리 — base + overlay 배포

> 모델 이력 — 작성: Opus 4.8(architect 관점, 메인 세션) · 검토: Opus 4.8(critic 서브에이전트) · 구현(예상): 미정(Sonnet 5 위임 가능)

<!-- 어떻게(how). 상위: [goal](goal.md) · [spec](spec.md) -->
<!-- 슬라이스 범위: FR-1~8만(핵심 메커니즘). FR-9(마이그레이션)는 별 슬라이스 — 아래 단계 8·9는 참조용. -->

## 확정 사실 표 (F-n) — 하위 페르소나(tasks-architect·critic·구현자)의 유일 사실 출처 [R1]

> 재조사 금지·인용만. 근거는 파일:행 + 심볼명(행번호는 밀릴 수 있음 — 심볼로 검증). 코드 확인 2026-07-15.

| ID | 확정 사실 | 근거(파일:행 심볼) | 확인 |
|---|---|---|---|
| F-1 | 멱등 배포 엔진 존재 = `deployAgents()`. 표면별로 render→writeManaged→prune 수행 | `src/agents/deploy.ts:202` `deployAgents()` | 코드 2026-07-15 |
| F-2 | managed 마커 상수 = `"managed-by: localmind"`. 페르소나 바인딩은 정규식 `managed-by: localmind (persona: <name>)` | `src/agents/deploy.ts:14` `MANAGED_MARKER`, `:28` matchAll | 코드 2026-07-15 |
| F-3 | 마커 붙은 파일만 갱신, 미마커/사용자 파일은 skip = `writeManaged()`. 정본서 사라진 산출물 삭제 = `pruneManaged()` | `src/agents/deploy.ts:156` `writeManaged()`, `:177` `pruneManaged()` | 코드 2026-07-15 |
| F-4 | 표면별 순수 렌더러 3종(페르소나) — 표면 하나 = 렌더 함수 하나 | `deploy.ts:95` `renderClaudeAgent()`, `:113` `renderCodexProfile()`, `:126` `renderCodexAgent()` | 코드 2026-07-15 |
| F-5 | 대상 경로 상수 + env 재지정. `~/.claude`·`~/.codex` 없으면 그 표면 스킵(폴더 신규 생성 안 함) | `deploy.ts:58` `defaultClaudeAgentsDir()`(env `LOCALMIND_CLAUDE_AGENTS_DIR`), `:65` `defaultCodexHome()`(env `CODEX_HOME`); 게이트는 `deployAgents()` 내부 | 코드 2026-07-15 |
| F-6 | 정본 로드·검증·문제격리 = `loadRegistry()`. 레지스트리 폴더 = `agentsDir()`(env `LOCALMIND_AGENTS_DIR` 우선, 없으면 `firstNotesDir()/agents`, 기본 `~/.localmind/agents`) | `src/agents/registry.ts:197` `loadRegistry()`, `:51` `agentsDir()`, `:59` `firstNotesDir()` | 코드 2026-07-15 |
| F-7 | 경로 해소는 `expandHome`+`path.resolve`뿐 — 원격 `/root`↔로컬 `/Users` 번역 로직 **없음** | `registry.ts:41` `expandHome()`, `:53` `path.resolve` | 코드 2026-07-15 |
| F-8 | **CLAUDE.md 생성 로직 전무**. AGENTS.md는 `scaffoldSdd()`가 `copyFileSync`로 **1회 복사, 병합 없음, 존재 시 skip** | `src/scaffold.ts:34` `scaffoldSdd()`, `:47` `copyFileSync(...AGENTS.md)`, `:45` skip | 코드 2026-07-15 |
| F-9 | MCP 도구 등록 위치(패턴 대칭 참고): `scaffold_sdd`·`list_agents`·`deploy_agents`·`whoami` | `src/mcp-server.ts:391`/`:415`/(deploy 인접)/`:54` | 코드 2026-07-15 |
| F-10 | cwd→project 매칭은 kebab-case 정규화 패턴(기존 계약저장소 project 식별) | `specs/029-project-contracts` (규약) | 스펙 2026-07-15 |

## 접근 요약

기존 페르소나 파이프라인(`src/agents/registry.ts` + `src/agents/deploy.ts`)을 **틀로 재사용**해,
"규칙(rules)" 도메인을 나란히 추가한다. 규칙 정본(base + project overlay)을 로드·검증하는
`loadRules()`, base+overlay를 합성하는 **순수 합성기**, 표면별 순수 렌더러(Claude 글로벌 스텁+`@import`
파일 / Codex 글로벌 인라인 / repo `AGENTS.md` 인라인 + `CLAUDE.md` 스텁), 그리고 규칙 파일의 **섹션
단위 upsert** 기록기(`writeManagedSection`)를 만든다. 배포는 로컬 CLI 작업으로, 글로벌은 로컬 HOME,
repo는 cwd를 대상 경로로 삼아 경로 발산을 회피한다. managed-marker·prune·대상 가용성 게이트는 기존
`deploy.ts` 원칙을 그대로 승계한다.

## 도메인 경계 (DDD)

- **rules 레지스트리 (신규 bounded context, 페르소나와 형제)**: 규칙 정본의 로드·검증·모델.
  유비쿼터스 언어: `BaseRule`, `Overlay`(project 키), `ComposedRuleset`(base+overlay 합성 결과),
  `Surface`(claude-global / codex-global / repo), `ManagedSection`(마커 경계로 구획된 산출 영역).
- **composition (도메인 서비스, 순수·IO 없음)**: `compose(base, overlay) → ComposedRuleset`,
  overlay 우선. 충돌 해소 규칙이 이 서비스에 응집.
- **surface renderer (신규, 페르소나 렌더러와 대칭)**: `ComposedRuleset → 표면별 파일 산출물`.
  순수 함수 1개 = 표면 1개. 새 표면 추가 = 렌더러 1개 추가.
- **deploy 어댑터 (기존 `deploy.ts` 확장 or 형제 모듈)**: 산출물을 대상 경로에 **섹션 upsert**로
  기록, managed-marker 불가침·prune, 대상 가용성 게이트. 파일시스템 IO는 여기로 격리.
- 경계 원칙: 로드·합성·렌더는 IO 무지(테스트는 인메모리 Fake), 기록만 어댑터.

## 영향 모듈

- **신규**
  - `src/rules/registry.ts` — `loadRules()`(base+overlay 로드·검증·문제격리). `agents/registry.ts`의
    미니파서·검증 격리 패턴 재사용/공유.
  - `src/rules/compose.ts` — 순수 합성기(overlay 우선).
  - `src/rules/render.ts` — 표면별 순수 렌더러(claude-global / codex-global / repo AGENTS+CLAUDE 스텁).
  - `src/rules/deploy.ts` — 섹션 upsert 기록기 + managed-marker/prune/대상 게이트(또는 `agents/deploy.ts`
    의 `writeManaged` 계열을 규칙 파일용 `writeManagedSection`으로 일반화해 공유).
  - `scripts/rules-deploy.ts` — 로컬 CLI 진입점(`agents-deploy.ts`와 대칭). `make` 타깃/ device-sync 연동.
  - 규칙 정본 폴더(예 `<notes>/rules/base/*.md`, `<notes>/rules/overlays/<project>/*.md`) + 시드 템플릿.
- **수정**
  - `src/mcp-server.ts` — (Open) 규칙 배포/목록 도구 노출 여부 결정 후 등록(`list_agents`/`deploy_agents`
    패턴 대칭). 배포는 로컬 작업이라 CLI 우선.
  - `~/.claude/CLAUDE.md` 스텁 — `@import` 대상을 벌트 governance → localmind 생성 파일로 전환(FR-9).
  - 벌트 `second-brain-private/contexts/governance/*` — base로 이관 후 은퇴(별 저장소 — 이관 카탈로그
    확정 후 별도 커밋).
  - `Makefile` / device-sync(specs/031) — 배포 단계 편입(Open: repo 순회 범위).
- **무변경**: 기존 `deploy_agents`/페르소나(016), `scaffold_sdd`(007) — 규칙은 별 파이프라인.

## 단계 (task 분해 가능)

<!-- self-review clean 후 완료 단계는 [x]. -->
- [x] 1. **rules 정본 모델·로더** (`src/rules/registry.ts`): base/overlay 스키마·검증·문제격리.
  → 검증: 단위 테스트(유효/무효/중복 정본 로드) green.
- [x] 2. **합성기** (`src/rules/compose.ts`): base+overlay, overlay 우선. → 검증: AC-6 단위 테스트.
- [x] 3. **표면 렌더러** (`src/rules/render.ts`): claude-global(스텁+@import 파일)·codex-global(인라인)·
  repo(AGENTS 인라인 + CLAUDE `@AGENTS.md` 스텁). → 검증: 스냅샷/단위(AC-9·AC-10 형태 검증).
- [x] 4. **섹션 upsert 기록기 + managed-marker/prune/게이트** (`src/rules/deploy.ts`): 사용자 저작
  보존, 멱등, prune, 대상 부재 스킵. → 검증: AC-3·AC-4·AC-5·AC-8 통합 테스트(임시 파일트리).
- [x] 5. **cwd→project 매칭 + repo in-place 배포**: kebab 정규화(specs/029 재사용), 모호 시 사용자
  확인·overlay 없으면 base만. → 검증: AC-2 통합 테스트.
- [x] 6. **경로 무관 가드**: 산출물 절대경로 미포함 린트/테스트. → 검증: AC-7.
- [x] 7. **CLI 진입점** (`scripts/rules-deploy.ts`) + `make` 타깃. → 검증: 로컬 dogfood 실행.
- [x] 9. **Codex 사실 라이브 재검증**(구현 착수 직전): AGENTS.md 병합·32KiB·`@import` 미지원 T1 확인
  후 렌더러 반영. → 검증: 공식문서 근거 기록 + self-review 게이트 (5).

**[별 슬라이스 — 이번 041 범위 밖]**
- [ ] 8. **마이그레이션(FR-9, 단계적)**: (a) governance→base 이관 카탈로그 확정 (b) localmind 정본
  작성 (c) 배포 검증 (d) `~/.claude/CLAUDE.md` `@import` 전환 (e) 벌트 governance 은퇴. — 벌트
  저장소 작업, 메커니즘 동작 후 착수. 별 slice 로 goal-ready 재실행.

## 테스트 전략

<!-- self-review clean 후 [x] green. -->
| AC | 테스트 레벨 | 방법 | 상태 |
|---|---|---|---|
| AC-1 | 통합 | 임시 `~/.claude`·`~/.codex` 트리에 배포 후 두 산출물에 base 도달 확인 | [x] |
| AC-2 | 통합 | 규칙 없는 임시 repo에서 배포 → AGENTS.md·CLAUDE.md 스텁 생성 확인 | [x] |
| AC-3 | 통합 | 2회 배포 후 managed 밖 바이트 동일·managed diff 안정성 | [x] |
| AC-4 | 통합 | 사용자 비managed 섹션 포함 파일 배포 → 사용자 섹션 보존 | [x] |
| AC-5 | 통합 | overlay 제거 후 배포 → 해당 managed 산출물만 prune | [x] |
| AC-6 | 단위 | 충돌 base/overlay 합성 → overlay 값 | [x] |
| AC-7 | 단위/린트 | 산출물 문자열에 절대경로 패턴 부재 | [x] |
| AC-8 | 통합 | `~/.codex` 부재 트리 → Codex 스킵·나머지 진행 | [x] |
| AC-9 | 단위 | 생성 스텁이 `@import` 지시 포함(하드주입 형태) | [x] |
| AC-10 | 단위 | repo `CLAUDE.md` == `@AGENTS.md` 스텁(본문 중복 없음) | [x] |

- **원칙**: 로드·합성·렌더는 순수라 인메모리 Fake로 단위. 기록·prune·게이트는 임시 파일트리
  통합(실제 파일시스템 거동). TDD — AC를 실패 테스트로 먼저 고정. 도그푸드: 실제 이 저장소·pkpk에서
  배포 실행해 과정·결과 관찰(§8 도그푸드).

## Open questions

- 규칙 배포를 MCP 도구로도 노출할지(배포는 로컬 작업 — CLI 우선, MCP는 목록/미리보기 정도?).
- device-sync(031)의 repo 순회 범위(글로벌만 vs 등록 repo 순회 배포).
- base authoring 포맷(개별 `.md` 유지 vs 단일 파일)·규칙 폴더 정확한 경로.
- `src/rules/deploy.ts`를 신규로 둘지 `src/agents/deploy.ts`의 `writeManaged`를 섹션 단위로 일반화해
  공유할지(중복 vs 결합).
