# Plan: 웹 거버넌스 뷰어 — 규칙·스킬·페르소나 조회

> 모델 이력 — 작성: Opus 4.8 · 검토: Opus 4.8(critic) · 구현(예상): 미정(Sonnet/Opus — /goal 시 확정)

<!-- how. 도메인 경계·영향 모듈·단계·테스트 전략. UI 시각은 design.md. -->

## 확정 사실 표 (F-n) — 코드 근거, 하위(tasks·critic) 재조사 금지·인용만

| ID | 확정 사실 | 근거 | 확인 |
|----|----------|------|------|
| F-1 | `make ui`→`scripts/ui.sh`→`npm run ui`→`src/ui-server.ts`(Express). SPA=`public/ui/`, `127.0.0.1:8788/ui/`, **read-only·localhost** | `Makefile:89`, `src/ui-server.ts:63-67` | 코드 2026-07-16 |
| F-2 | 페이지 추가 = `index.html` nav 링크 + `app.js` `pageX()` + `PAGES` 맵 등록(해시 라우터). 헬퍼 `el/card(loading→success\|error\|empty)/table/badge`. **동적 텍스트 textContent만**(XSS) | `public/ui/app.js:8-108,588-597`, `index.html:27-33` | 코드 2026-07-16 |
| F-3 | 데이터: 프런트 `api(path)`→`/ui/api`+path(Bearer) → `routes/ui.ts`(얇게, `wrap()`) → `ui-status.ts` 수집. deps 주입 `UiDeps`/`defaultUiDeps()` | `app.js:27-45`, `routes/ui.ts:22-99`, `ui-server.ts:22-53` | 코드 2026-07-16 |
| F-4 | 규칙 = `src/rules/registry.ts` `loadRules(dir=rulesDir())`→`{base:RuleDoc[], overlays:Map, problems, warnings}`, `RuleDoc{name,content(md),order,file}`. **그대로 조회 가능(Map→객체 직렬화 필요)** | `src/rules/registry.ts:17-37,144` | 코드 2026-07-16 |
| F-5 | 스킬 = `src/agents/skills.ts`에 **deploy/seed만, read-only 카탈로그 없음**. `listSkillDirs()` 미export. → **`listSkills()` 신규 export 필요**(skillsDir 하위 SKILL.md 열거 + frontmatter name/description 파싱, `parseDoc`식·YAML 의존 없음) | `src/agents/skills.ts:29,92-102` | 코드 2026-07-16 |
| F-6 | 페르소나 = 기존 `ui-status.ts` `agentsStatus` + `/agents` 엔드포인트 재사용 | `routes/ui.ts`, `ui-status.ts` agentsStatus | 코드 2026-07-16 |
| F-7 | 전문 파일 읽기 경로 안전 패턴 = `readNoteContent`/`readReportNote`(`..`·절대경로·`\`·심링크 차단 + `realpathSync` 루트 재검) | `src/ui-status.ts:311-364` | 코드 2026-07-16 |
| F-8 | 디자인 게이트 specs/026 — UI 구현 전 `design.md` 필수·사용자 확인. 토큰은 `public/ui/style.css :root`(+dark) | `templates/sdd/design.template.md`, `style.css:1-28` | 코드 2026-07-16 |

## 도메인 경계 (DDD)

- **interface = 웹 SPA + `routes/ui.ts`**(얇은 구동 어댑터, §6) · **infrastructure = 파일 읽기**(rules
  registry·skills 카탈로그·전문 read) · **조회 전용, 새 도메인 로직 0**.
- 재사용(불변): `loadRules`(F-4)·`agentsStatus`(F-6)·경로안전 패턴(F-7)·SPA 헬퍼/토큰(F-2·F-8).

## 영향 모듈

- **신규**: `src/agents/skills.ts`에 `listSkills()` export · `src/ui-status.ts`에 `rulesStatus()`·
  `skillsStatus()`·전문 read(경로안전) · `src/routes/ui.ts`에 `/rules`·`/skills`·전문 엔드포인트 ·
  `src/ui-server.ts` `defaultUiDeps()`에 rulesDir/skillsDir 배선 · `public/ui/{index.html,app.js}`
  거버넌스 페이지(+ 필요 시 `style.css` 최소 클래스, 기존 토큰 재사용).
- **재사용(수정 없음)**: `src/rules/registry.ts`(`loadRules`) · agentsStatus.

## 단계

- **Phase 0 — Live-Verify**: F표 재확인(경미 — 이미 grounded). *(전제)*
- **Phase 1 — 스킬 카탈로그**: `listSkills()` 신규(F-5) + 결정론적 **단위 테스트**(SKILL.md 열거·
  frontmatter 파싱·managed 마커 구분). *(FR-3 기반)*
- **Phase 2 — 수집 로직**: `rulesStatus()`(loadRules→Map 직렬화·problems/warnings 포함, F-4)·
  `skillsStatus()`. **전문 조회**: 규칙·페르소나는 **로드된 레지스트리 name 조회**(본문 메모리 상주 —
  RuleDoc.content(F-4)·Persona.prompt(F-6), 경로 입력·재read 없음), **스킬만 SKILL.md 파일 read +
  경로안전**(F-7 미러). 단위: 스킬 traversal 거부 + 규칙·페르소나 미존재 name 거부(AC-7). *(FR-2·3·5·7)*
- **Phase 3 — 엔드포인트**: `routes/ui.ts`에 `/rules`·`/skills`·`/rule?…`·`/skill?…` **+ `/agent?name=`
  페르소나 전문**(design.md OQ-3 해소 — 3부류 모두 드릴인) `wrap()` 배선, deps 주입. 인증 미들웨어
  통과(401 = AC-8). *(FR-1·4·8)*
- **Phase 4 — 프런트(design.md 게이트 이후)**: `design.md` 확정·사용자 확인 후 `pageGovernance()` 구현
  — 3섹션·목록+드릴인·problems 경고 배너. design.md 미확정 시 착수 금지(F-8). *(FR-1·2·3·4·5)*
- **Phase 5 — nav·read-only**: 에이전트 nav 처리(design.md OQ-1 결정대로) + 편집/삭제/배포 컨트롤
  부재 확인. *(FR-4·6)*
- **Phase 6 — dogfood**: `make ui` 실행 → 거버넌스 페이지에서 활성 규칙 전체·스킬·페르소나·problems
  관측(섹션 레벨)·드릴인 전문(3부류) 확인. *(전 AC 통합 실증)*

## 테스트 전략 (AC → 레벨)

| AC | 검증 | 레벨 |
|----|------|------|
| AC-2·3·4·5 (렌더·목록·드릴인·problems) | make ui 브라우저 관측 | dogfood + (수집 함수)단위 |
| AC-7 (traversal 거부) | 경로안전 read 단위 | 단위(결정론) |
| AC-8 (401) | 엔드포인트 인증 | 통합 |
| listSkills·rulesStatus·skillsStatus | 열거·파싱·직렬화 | 단위(결정론) |
| AC-1·6 (nav·read-only) | 페이지 렌더·컨트롤 부재 | dogfood |

## 구현 담당 배치

- 백엔드(`skills.ts`·`ui-status.ts`·`routes/ui.ts`) = **worker/backend-dev**(잘 명세 — 단위 테스트 명확).
- 프런트(`app.js`·`index.html`) = **frontend-dev**, **design.md 확정 후**(specs/026 게이트).
- UX 리뷰 = ux-reviewer(design.md 대비), 최종 게이트 = critic.

## Open questions (plan 유래)

- (spec OQ-1·3은 design.md에서 · OQ-2 skillsDir 화이트리스트 · OQ-4 overlays 직렬화 형식은 Phase 2에서 확정.)

> **상태**: draft. design.md(designer) 병행 작성 중. `/goal` readiness + **design.md 사용자 확인** 후 착수.
