# Spec: 에이전트 작업 규칙 중앙관리 — base + overlay 배포

> 모델 이력 — 작성: Opus 4.8(인터뷰·초안, 메인 세션) · 검토: Opus 4.8(critic 서브에이전트) · 구현(예상): 미정(Sonnet 5 위임 가능)

> **슬라이스 범위(goal-ready §0.5 R3)**: 이 슬라이스(041)는 **핵심 메커니즘 FR-1~8**만 구현·tasks 대상.
> **FR-9(거버넌스 마이그레이션)는 별 슬라이스로 분리** — 벌트(second-brain) 저장소 작업이며 메커니즘이
> 동작한 뒤 착수. 아래 FR-9는 참조용으로 남기되 이번 tasks.md에는 포함하지 않는다.

<!-- 무엇을(what). 상위: [goal](goal.md) -->

## Scope

localmind에 **규칙 정본(base + 프로젝트별 overlay)** 을 두고, **배포 시점에 합성**해 각 디바이스·
에이전트 표면에 managed 산출물로 기록하는 기능. 대상 표면 3종: (1) Claude 글로벌, (2) Codex 글로벌,
(3) repo(cwd) — Claude·Codex 공통. 기존 `deploy_agents`(페르소나)의 managed-marker·멱등·prune·대상
가용성 게이트 패턴을 규칙 파일로 확장한다.

## Context

- **재사용 자산**: `loadRegistry()`(정본 로드·검증·문제격리, YAML 무의존, `src/agents/registry.ts`),
  `deployAgents()`(멱등·managed-marker·prune·대상 가용성 게이트, `src/agents/deploy.ts`), 표면별 순수
  렌더러 패턴, `seedAgents()`, `scaffold.ts`의 "절대경로 강제 + 덮어쓰기 금지" 안전 패턴.
- **공백(신규)**: 규칙 파일(`CLAUDE.md`/`AGENTS.md`) 생성·**섹션 upsert** 배포, base+overlay 합성기,
  cwd→project 매칭 배포. (조사: CLAUDE.md 생성 로직 전무, AGENTS.md는 `scaffold_sdd` 1회 복사.)
- **현 규칙 위치**: base 성격은 벌트 `governance/*`(Claude `@import` 하드주입), Codex는 소프트
  포인터, 프로젝트별은 repo `AGENTS.md`(없는 repo 존재).
- **확정 결정(D1~D7)**: 배포 시점 합성(A) · base·overlay 모두 localmind 정본 · 벌트 governance 은퇴 ·
  path는 cwd in-place로 회피 · Claude는 `@import-able` 파일 · repo `CLAUDE.md`=`@AGENTS.md` 스텁.
  (결정 노트: second-brain `tags:[decision]` — D1·D2, D3~D6.)

## Functional Requirements

- [x] **FR-1 (규칙 정본 레지스트리)**: localmind가 base 규칙과 프로젝트별 overlay를 노트 저장소 하위
  규칙 폴더에 정본으로 소유한다(git 백업·동기화). 페르소나 레지스트리와 동거하되 별도 개념.
  → goal: Objective, Constraint(YAML 무의존)
- [x] **FR-2 (base+overlay 합성, overlay 우선)**: 배포 시 base와 해당 프로젝트 overlay를 합성한다.
  base와 overlay가 충돌하면 **overlay가 이긴다**(architecture-constitution-base 규칙 계승).
  → goal: Objective
- [x] **FR-3 (Claude 글로벌 — @import 하드주입)**: base(글로벌 표면에는 project overlay가 없으므로
  base만)를 localmind가 `@import` 가능한 규칙 파일로 생성하고, `~/.claude/CLAUDE.md` 스텁이 그 파일을
  **상대 `@import`**하도록 둔다. 하드주입("항상 컨텍스트") 보존. → goal: Objective, Constraint(하드주입 보존)
- [x] **FR-4 (Codex 글로벌 — 인라인)**: 같은 합성 결과를 `~/.codex/AGENTS.md`의 managed 섹션에
  **인라인**으로 기록한다. 근거 전제 — "Codex는 `@import`·`CLAUDE.md` 미지원" — 는 **T090 라이브
  재검증(T1) 하에서 확정**한다(현재 T2 기억 기반, 경미 E). 전제가 뒤집히면 렌더러 방식을 재검토.
  → goal: Constraint(Codex 비대칭)
- [x] **FR-5 (repo 표면 — cwd in-place, overlay-only)**: repo에서 배포하면 cwd를 대상 경로로,
  cwd→project 매칭(kebab 정규화, specs/029)으로 골라 **그 프로젝트 overlay만** `<repo>/AGENTS.md`(인라인
  managed)와 `<repo>/CLAUDE.md`(`@AGENTS.md` 한 줄 스텁, managed)에 기록한다. **base는 repo에 다시
  인라인하지 않는다** — 글로벌 표면(Claude @import·Codex `~/.codex/AGENTS.md`)이 이미 주입하므로
  중복·Codex 32KiB 이중계상을 피한다(D8). overlay 없는 repo는 repo 파일을 만들지 않는다.
  → goal: Objective, D5·D7·D8
- [x] **FR-6 (섹션 upsert · managed-marker 불가침 · prune)**: 규칙 파일은 사용자 저작과 공존할 수
  있으므로 **managed 섹션만** upsert한다. managed-marker가 붙지 않은 파일·섹션은 절대 갱신·삭제하지
  않는다. 정본에서 사라진 overlay/규칙의 managed 산출물은 다음 배포에서 prune한다.
  → goal: Constraint(managed-marker 불가침), Risk(섹션 병합 오염)
- [x] **FR-7 (경로 무관)**: 규칙 정본·산출물 어디에도 디바이스 절대경로를 넣지 않는다. 대상 경로는
  로컬 HOME(글로벌)·cwd(repo)로만 해소한다. → goal: Constraint(경로 무관), D5
- [x] **FR-8 (대상 가용성 게이트)**: 표면의 대상 폴더(`~/.claude`·`~/.codex`)가 없으면 그 표면 배포를
  건너뛰고(폴더 신규 생성 안 함) 나머지는 진행한다(기존 `deploy_agents` 게이트 계승).
  → goal: Objective(멱등·안전)
- [~] **FR-9 (거버넌스 이관 — 단계적) [진행 중 2026-07-15]**: 벌트 `governance/*` base 규칙을 localmind 정본으로 이관하고,
  검증 후 `~/.claude/CLAUDE.md` 스텁의 `@import` 대상을 localmind 생성 파일로 전환하며, 최종적으로
  벌트 `governance/*` 정본을 은퇴한다. 전환 구간에 규칙 공백이 없어야 한다. → goal: Objective, Risk(이관)
  - [x] (b) 17개 base 이관(`~/.localmind/rules/base/` — governance 14 byte-identical + claude-base 인라인 3절). 기기파일·hot.md 제외.
  - [x] (c) m5 실배포 + parity 확인 — `~/.claude`(managed @import 섹션)·`~/.codex`(governance 인라인, 사용자 콘텐츠 보존). **벌트 @import 유지 → 이중 주입(공백 0)**.
  - [ ] (d) 스텁 벌트 @import 제거 — **전 기기 전파·검증 후에만**(파괴적·별도 승인). hot.md 하드주입 상실 처리 결정 필요.
  - [ ] (e) 벌트 `governance/*` 은퇴 — **벌트 저장소 작업으로**(second-brain repo에서, 벌트 조작 규칙 준수).

## Acceptance Criteria

<!-- 각 AC는 테스트와 1:1. Given-When-Then. -->
- [x] **AC-1 (글로벌 양표면 배포)**: Given base 규칙 1벌이 정본에 있고 `~/.claude`·`~/.codex`가 존재,
  When `deploy`, Then `~/.claude/CLAUDE.md` 스텁이 base를 담은 생성 파일을 `@import`하고
  `~/.codex/AGENTS.md`의 managed 섹션에 같은 base 실효 내용이 인라인으로 존재한다.
- [x] **AC-2 (규칙 없던 repo, overlay-only)**: Given overlay가 있는 프로젝트 repo에서 cwd로 배포,
  When `deploy`, Then `<repo>/AGENTS.md`(그 프로젝트 **overlay만** 인라인, base 제외)와
  `<repo>/CLAUDE.md`(`@AGENTS.md` 스텁)가 생성된다. overlay 없는 repo면 repo 파일을 만들지 않는다
  (base는 글로벌 표면이 주입).
- [x] **AC-3 (멱등)**: Given 방금 배포한 표면, When 같은 정본으로 재배포, Then managed 섹션 밖의
  사용자 저작·포매팅은 바이트 동일하게 유지되고 managed 섹션도 안정적(불필요한 diff 없음)이다.
- [x] **AC-4 (엣지 — 사용자 섹션 보존)**: Given 사용자가 손으로 쓴 비managed 섹션이 있는
  `AGENTS.md`, When `deploy`, Then 그 사용자 섹션은 훼손되지 않고 managed 섹션만 갱신된다.
- [x] **AC-5 (엣지 — overlay 제거 prune)**: Given 정본에서 어떤 프로젝트 overlay를 제거, When 그
  repo에서 `deploy`, Then 그 overlay가 만든 managed 산출물만 prune되고 사용자 파일·비managed
  내용은 그대로다.
- [x] **AC-6 (overlay 우선)**: Given base와 overlay가 같은 항목에 충돌하는 규칙을 가짐, When 합성,
  Then 산출물에는 overlay 값이 반영되고 base 값은 덮인다.
- [x] **AC-7 (경로 무관)**: Given 임의 디바이스에서 배포, When 산출물 검사, Then 규칙 본문에 디바이스
  절대경로(`/Users/…`·`/root/…` 등)가 등장하지 않는다.
- [x] **AC-8 (엣지 — 대상 부재 게이트)**: Given `~/.codex`가 없는 기기, When `deploy`, Then Codex
  글로벌 배포는 건너뛰고(폴더 생성 안 함) Claude 글로벌·repo 배포는 정상 수행된다.
- [x] **AC-9 (하드주입 보존)**: Given Claude 글로벌 배포 완료, When `~/.claude/CLAUDE.md`를 읽음,
  Then 스텁이 localmind 생성 규칙 파일을 `@import`하고 있어 base가 항상 컨텍스트로 주입된다(소프트
  포인터가 아님).
- [x] **AC-10 (repo 스텁 형태)**: Given repo 배포 완료, When `<repo>/CLAUDE.md`를 읽음, Then 그
  내용은 `<repo>/AGENTS.md`를 가리키는 `@AGENTS.md` 스텁이며 별도 규칙 본문을 중복 담지 않는다.
- [x] **AC-11 (FR-1 정본 로드·문제격리)**: Given base/overlay 정본에 무효(파싱 실패) 파일이 섞임,
  When `loadRules`, Then 무효 항목은 `problems`로 격리되고 throw 없이 유효 항목은 로드되며, 이후
  배포의 prune은 스킵된다(AC-5 안전밸브의 전제). <!-- 경미 D: FR-1 전용 검증 -->
  → 지지: FR-1, FR-6(불가침), FR-8(안전)

## Open questions

<!-- 해소 시 취소선 또는 확정 절 이관(회고 OQ 대시보드 결정 신호). -->
- **Claude `@import` 대상 파일 배포 위치(경미 A)**: FR-3의 "`@import` 가능한 규칙 파일"이 **어디에**
  생성되는지가 AC-7(경로 무관)·AC-9(하드주입) 양립을 좌우한다. `~/.claude/` 안이면 `@~/.claude/…`로
  경로 무관 가능(사용자 실제 스텁도 `@~/…` 패턴), `<notes>/rules/`(기기별 절대경로)면 `@import`가
  절대경로를 요구해 I-5와 충돌. → 권장: `~/.claude/` 배포 + `@~/…` 참조로 확정.
- **precedence 표기**: managed 섹션이 "localmind 관리·직접 편집 금지, overlay 우선"을 표면 사용자에게
  어떻게 명시할지(마커 문구·경계 주석 형식).
- **마이그레이션 카탈로그**: 벌트 `governance/*` 중 어느 파일이 base로 이관되고, 어느 것이 기기별
  (`devices/<id>.md` 성격)이라 이관 대상이 아닌지 목록화. base authoring 포맷(개별 `.md` 유지 vs
  단일 파일)과 규칙 폴더 위치(`<notes>/rules/…`).
- ~~**Codex 사실 재검증(라이브 T1 필수)**: `AGENTS.md`의 git root→cwd 이어붙임·32KiB 상한·
  `AGENTS.override.md` 우선·`@import`/`CLAUDE.md` 미지원이 현행인지 OpenAI Codex 공식문서로 확인.~~
  **해소(T090, 2026-07-15, T1: learn.chatgpt.com/docs/agent-configuration/agents-md)**: 전부 확정 —
  Codex는 CLAUDE.md 미인식, `AGENTS.override.md`>`AGENTS.md`>fallback, 루트→cwd 이어붙임(가까울수록
  우선), `project_doc_max_bytes` 기본 32 KiB, `@import`/`@path` 구문 없음 → **인라인 필수**. FR-4 근거 확정.
  ~~**파생 리스크**: Codex는 글로벌 `~/.codex/AGENTS.md`(base) + repo `AGENTS.md`를 이어붙이므로, repo에
  base를 다시 인라인하면 base가 이중 계상돼 32 KiB 압박.~~ **해소(D8, 2026-07-15)**: repo 표면을
  **overlay-only**로 확정 — repo엔 프로젝트 overlay만, base는 글로벌 표면이 주입. Codex·Claude 모두
  base 이중계상 제거(도그푸드로 확인). 트레이드오프: repo가 localmind 없이 clone되면 base 미포함
  (사용자가 이 비-self-contained를 수용).
- **overlay↔project 매칭 모호성**: cwd→project 자동 매칭이 실패/모호할 때 추측 금지·사용자 확인
  규칙(specs/029) 재사용 방식. overlay가 없는 repo는 base만 배포하는지(권장) 확인.
- **device-sync(031) 연동**: `device-sync`가 글로벌 표면 + 등록된 repo들을 순회 배포까지 포함할지,
  아니면 글로벌만 하고 repo는 그 repo에서 개별 배포로 둘지.
- **MCP vs CLI 노출면**: 규칙 배포를 CLI(`agents:deploy` 계열)만으로 둘지, MCP 도구로도 노출할지
  (배포는 로컬 작업이므로 원격 MCP에서의 의미 제한).
