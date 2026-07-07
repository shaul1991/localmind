# Spec: 웹 설정 페이지 — 상태 배지 · 명령 복사 · 단계 안내

<!-- 무엇을(what). 상위: [goal](goal.md) · 구현 방법: [plan](plan.md) · 화면: [design](design.md) -->

## Scope
기존 읽기 전용 설정 페이지(specs/034)에 세 가지를 더한다: **(1) 연결/설정 상태 배지**,
**(2) 바꿀 명령 복사 버튼**, **(3) 단계 안내 카드**. 이를 위해 상태를 읽어 주는 **읽기 전용
엔드포인트 하나**를 추가한다. 웹에서 설정을 **쓰지 않는다**.

## Context
- `make ui` → `src/routes/ui.ts`가 GET 엔드포인트만 노출(`/overview` `/index` `/config` `/reports`
  `/notes` `/note` …). `/config`는 `configStatus()`로 `.env`를 **마스킹**해 읽는다(시크릿 원문 미노출).
- 프런트 `public/ui/app.js`에 "설정(읽기 전용)" 페이지가 있고, 각 항목에 "바꾸려면 make X" 문구만 있다.
- 디자인 시스템: `public/ui/style.css`에 상태 토큰(`--color-ok|warn|error|idle`, 라이트/다크)과
  `.badge.ok|.warn|.error|.idle` 클래스가 **이미 존재** → 재사용한다.
- 감지 대상 상태 소스: repo `.env`(인증 토큰·Gemini 키·codex 모델·NOTES_DIR) + repo **밖**
  사용자 config(`claude_desktop_config.json` 등, 읽기 전용).

## Functional Requirements

- [x] **FR-1 (연결 상태 조회 API)**: `GET /ui/api/connections`가 각 항목 상태를 `ok|missing|unknown`으로
  반환, 시크릿 미반환. → goal: Objective / Constraint  ✔ `ui.ts` 라우트 + HTTP 통합 테스트(200·스키마)
- [x] **FR-2 (상태 배지)**: `statusBadge` ok→됨(초록)/missing→안됨(warn)/unknown→확인 불가(idle).
  → goal: Objective  ✔ 브라우저 dogfood 스크린샷(배지 3색·실상태 일치)
- [x] **FR-3 (명령 복사 버튼)**: `copyControl` — 클릭 시 클립보드 복사 + "복사됨 ✓", 미가용 시 선택 폴백.
  → goal: Objective / Risk  ✔ dogfood(버튼 렌더) + 코드 리뷰(폴백 경로)
- [x] **FR-4 (단계 안내)**: `guideCard` — 복사→붙여넣기→새로고침 3단계. → goal: Objective  ✔ dogfood 스크린샷
- [x] **FR-5 (읽기 전용 불변)**: 라우터 GET만·시크릿 원문 미포함. → goal: Constraint  ✔ AC-7 라우트열거 테스트 + AC-8 HTTP 테스트
- [x] **FR-6 (우아한 저하)**: 모든 IO try/catch → unknown/missing 흡수, 페이지 정상. → goal: Risk
  ✔ 테스트 3종(파일 없음·파싱 실패·손상 top-level)

### 상태 배지 대상(확정 목록 — 2026-07-07 사용자 확인)
| 배지 | ok 판정 | 감지 소스 | 비고 |
|---|---|---|---|
| Claude 구독 인증 | `.env`에 `CLAUDE_CODE_OAUTH_TOKEN` 비어있지 않음 | repo `.env` | 값 미노출 |
| Claude Code MCP 연결 | localmind 등록 존재 | repo 밖 Claude Code MCP config | 위치 Live-Verify(OQ) |
| Claude Desktop MCP 연결 | config에 `mcpServers.localmind` | `~/Library/…/Claude/claude_desktop_config.json`(OS별) | 경로 검증됨(macOS) |
| 백엔드: Gemini | `.env`에 `GEMINI_API_KEY` 존재 | repo `.env` | 값 미노출 |
| 백엔드: codex | `~/.codex`(로그인 디렉터리) 존재 | `~/.codex`(`$CODEX_HOME`) | ~~repo `.env` 존재~~ 정정(아래 결정) |
| 노트 폴더 | `NOTES_DIR` 설정·경로 존재 | repo `.env` + fs 존재 확인 | 기존 표시 확장 |
| 스택 실행 | 기존 health/overview 재사용 | 기존 엔드포인트 | 신규 아님 |
- **Cursor/Cline 제외**(위치 불확정) — 복사 안내만 제공.

## Acceptance Criteria

- [x] **AC-1 (Desktop 연결=ok)**: config에 `mcpServers.localmind` → `ok`. ✔ 테스트 + dogfood(실제 config ok)
- [x] **AC-2 (연결 안됨=missing)**: config 있으나 항목 없음 → `missing`. ✔ classifyMcpConfig 테스트
- [x] **AC-3 (확인 불가=unknown, 엣지)**: 파일 없음/파싱 실패/손상 top-level → `unknown`, 200 유지.
  ✔ 테스트 4종
- [x] **AC-4 (인증 상태)**: `CLAUDE_CODE_OAUTH_TOKEN` 존재 여부 → ok/missing. ✔ readConnections 테스트
- [x] **AC-5 (백엔드 상태)**: `GEMINI_API_KEY` 존재 여부 → ok/missing. ✔ readConnections 테스트
- [x] **AC-6 (복사 버튼)**: 클립보드 복사 + "복사됨", 미가용 시 선택 폴백. ✔ dogfood(렌더) + 코드 리뷰(폴백)
- [x] **AC-7 (읽기 전용 불변, 보안)**: 라우트 열거 시 GET 외 메서드 0. ✔ 라우터 열거 테스트
- [x] **AC-8 (시크릿 미노출, 보안)**: 응답에 토큰·키 원문 없음(enum만). ✔ 함수 + **HTTP 레벨** 테스트 + dogfood(curl 검사)
- [x] **AC-9 (배지 렌더)**: ok=초록/됨·missing=주황/안됨·unknown=회색/확인 불가. ✔ 브라우저 dogfood 스크린샷

## 결정·정정 (구현 중 확정)
- **[결정] codex 감지 소스 = `~/.codex` 존재** (최초 표는 `.env` 존재였음): `.env.example`의 codex
  기본값(`CODEX_DEFAULT_MODEL=gpt-5.5`·`CODEX_BIN=codex`)이 **비어있지 않은 채 박혀 있어** `.env`
  존재로 판정하면 항상 `ok`가 되어 무의미(Live-Verify 2026-07-07 확인). `.env.example` 주석도 "codex
  인증은 `~/.codex` 마운트로 별도 처리"라 명시. → 실제 로그인 신호인 `~/.codex`(`$CODEX_HOME`) 존재로
  판정. **사용자가 확인한 배지 목록(항목)은 그대로**이고, codex의 **감지 방법만** 정정. (self-review
  중대-1 반영 — 사용자 표면화 대상)
- **[해결] [OQ-1] Claude Code MCP 정본 위치 = `~/.claude.json` top-level `mcpServers`**: `make mcp-install`이
  `-s user`로 등록 → `~/.claude.json`의 top-level `mcpServers.localmind`에 저장됨을 라이브 확인(`claude
  mcp list` ✔ + 파싱 확인, 2026-07-07). 확인/파싱 실패 시 `unknown`으로 안전 저하.

## Open questions
- **[OQ-2] 상태 새로고침 방식**: 수동 "새로고침" 버튼만 둘지, 페이지 진입 시 자동 조회+주기 폴링까지 둘지.
  1차는 **진입 시 1회 + 수동 새로고침**으로 시작(단순함 우선), 필요 시 확장.
- **[OQ-3] 엔드포인트 경로명**: `/ui/api/connections` vs `/config`에 상태 필드 추가 — plan에서 확정.
