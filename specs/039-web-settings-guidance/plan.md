# Plan: 웹 설정 페이지 — 상태·복사·안내

<!-- 어떻게(how). 상위: [goal](goal.md) · 무엇을: [spec](spec.md) · 화면: [design](design.md) -->

## 도메인 경계 (DDD)
- **상태 수집(도메인/애플리케이션)**: "각 설정이 지금 어떤 상태인가"를 판정하는 **순수 로직**.
  IO(파일 읽기)는 주입받아 순수 판정만 하도록 분리 → 테스트에서 픽스처로 3상태 재현.
- **읽기 어댑터(인프라)**: `.env`·repo 밖 config 파일을 읽는 얇은 함수(이미 있는 `configStatus`
  계열 재사용/확장). 실패는 예외가 아니라 `unknown`으로 흡수.
- **인터페이스(구동 어댑터)**: `src/routes/ui.ts`에 **읽기 전용 GET** 하나 추가. 로직 없음(수집 호출→직렬화).
- **프레젠테이션**: `public/ui/app.js`(설정 페이지)·`style.css`(복사 버튼 클래스만). 배지는 기존 재사용.

용어(유비쿼터스): **연결 상태(connection status)** = `ok | missing | unknown`. **감지 소스** =
상태를 읽는 파일/엔드포인트. 시크릿은 **존재 여부(presence)**로만 다룬다(값 아님).

## 영향 모듈
- **신규** `src/connection-status.ts` — `computeConnections(inputs)` 순수 함수 + 소스 리더.
  (또는 `src/ui-status.ts`에 추가 — 파일 크기 보고 결정; 300줄 가이드 준수.)
- **신규 테스트** `src/connection-status.test.ts` — ok/missing/unknown 픽스처, 시크릿 미노출.
- **수정** `src/routes/ui.ts` — `r.get("/connections", …)` 추가(GET only).
- **수정** `public/ui/app.js` — 설정 페이지에 배지·복사 버튼·안내 카드; 진입 시 `/connections` 1회 조회.
- **수정** `public/ui/style.css` — `.copy-btn`(+"복사됨" 상태)만 추가. 배지·상태색은 기존 토큰/클래스 사용.
- **문서** 구현 후 README/docs/mcp.md는 변경 불필요(웹은 안내만; 명령 자체는 동일).

## 단계 (task 분해 가능)
1. **상태 수집 순수 함수 + 테스트** → 검증: `computeConnections`가 픽스처 입력으로 각 항목
   ok/missing/unknown을 정확히 반환(AC-1~5), 반환에 시크릿 원문 없음(AC-8). *실패 테스트 먼저.*
2. **소스 리더(우아한 저하)** → 검증: 존재하는/없는/깨진 `claude_desktop_config.json` 픽스처로
   ok/missing/unknown; 파일 읽기 실패가 예외로 새지 않음(AC-3).
3. **GET /connections 배선** → 검증: 통합 테스트로 200 + 스키마; 라우트 열거 시 GET only(AC-7).
4. **프런트 배지·복사·안내** → 검증(수동 dogfood): 각 상태 색·문구(AC-9), 복사 동작+폴백(AC-6),
   안내 카드 흐름.
5. **읽기 전용·시크릿 불변 회귀 테스트** → 검증: UI 라우터 메서드 열거 GET-only(AC-7), 응답 시크릿
   스캔(AC-8).
6. **[OQ-1] Claude Code MCP 위치 라이브 확인** → 확인되면 소스 리더에 반영, 실패 시 `unknown` 유지.

## 테스트 전략 (AC → 레벨)
| AC | 레벨 | 방법 |
|---|---|---|
| AC-1,2,3 (Desktop ok/missing/unknown) | 단위 | 임시 config 픽스처로 `computeConnections` |
| AC-4,5 (인증·백엔드) | 단위 | 가짜 `.env` 입력 |
| AC-6 (복사·폴백) | 수동 | dogfood(클립보드 가용/불가) |
| AC-7 (GET only) | 단위/통합 | 라우터 등록 메서드 열거 |
| AC-8 (시크릿 미노출) | 단위 | 응답 객체에 토큰/키 원문 부재 assert |
| AC-9 (배지 렌더) | 수동 | dogfood — 3상태 시각 확인 |

- 순수 로직은 인메모리 픽스처(파일 IO 주입)로 검증. repo 밖 실제 파일에 의존하지 않음(CI 안전).
- 구현은 TDD(실패 테스트 → 최소 구현). self-review는 독립 크리틱 + 보안(읽기전용·시크릿) 중점.

## 위험 완화
- **오탐**(Risk): 판정 불가는 전부 `unknown`으로 — 틀린 "안됨"보다 정직한 "확인 불가".
- **경로 편차**(Risk): 소스 경로는 OS 분기 + 존재 확인, 실패는 흡수(AC-3).
- **보안 회귀**: FR-5/AC-7,8을 회귀 테스트로 고정 — 이후 누구도 실수로 쓰기/시크릿을 열지 못하게.

## 구현 검증 (2026-07-07, self-review clean)
- [x] 1. 상태 판정 순수 함수 + 테스트 — `connection-status.ts` classifyMcpConfig/classifyPresence, 19종 테스트.
- [x] 2. 소스 리더(우아한 저하) — readMcpConfig/readEnvMap, IO 실패 흡수(파일없음·파싱실패·손상 top-level→unknown).
- [x] 3. `GET /connections` 배선 — `ui.ts`, **HTTP 통합 테스트(200·스키마·시크릿 미노출)** 추가.
- [x] 4. 프런트 배지·복사·안내 — `app.js` connectionsCard/copyControl/guideCard, `style.css`. **브라우저 dogfood**.
- [x] 5. 읽기전용·시크릿 회귀 — 라우트 열거 GET-only + HTTP 시크릿 스캔.
- [x] 6. [OQ-1] Claude Code 위치 라이브 확인 — `~/.claude.json` top-level `mcpServers`(확정, spec 결정절).
- 테스트: connection-status 19/19, 전체 **416/416** green. self-review(독립 크리틱): 중대-1(codex 감지)은
  스펙 정정+사용자 표면화로, 경미 6건은 코드 수정(4)·문서 동기화(2)로 반영.
