# Spec — 모니터링 웹 UI (specs/034)

> **검증 표기**: `[x]`는 2026-07-06 self-review(ux-reviewer + security-reviewer + 크리틱 최종
> 게이트 clean)에서 구현+테스트로 충족 확인된 항목. 근거는 `src/ui-status.test.ts`(수집기)·
> `src/ui-server.test.ts`(라우트/인증/정적) 및 실기기 도그푸드(m5, :8788). 미충족은 미체크+사유.

## Functional Requirements

- [x] **FR-1 정적 UI 서빙** *(goal: Objective / Constraints — 호스트 서버·빌드리스)*
  호스트 UI 서버(127.0.0.1:8788, `make ui`)가 `/ui`에서 정적 파일(`public/ui/`)을 서빙한다.
  기존 서버의 인증·Host 가드 미들웨어를 재사용하며, 빌드 파이프라인·외부 네트워크 요청(CDN
  등) 없음. *(2026-07-06 개정 — 컨테이너 동거 불가, plan 개정 이력 참조)*
- [x] **FR-2 상태 API(read-only)** *(goal: Objective — 한눈 모니터링)*
  `/ui/api/*`로 조회 전용 엔드포인트를 제공한다:
  - `overview` — 스택 헬스(gateway/embeddings/memory 각 up/down)
  - `index` — 폴더(라벨)별 파일·청크 수, 인덱스 파일 mtime, 포맷 버전
  - `repos` — 코드 repo·NOTES_DIR 노트 repo 각각의 origin 대비 ahead/behind(명시적 새로고침
    시에만 fetch — 기본 응답은 마지막 fetch 기준임을 표기)
  - `config` — .env 키 목록(시크릿은 **서버에서 마스킹** 후 전송: 앞4자+길이), NOTES_DIR 폴더
  - `agents` — 페르소나 레지스트리 목록 + claude/codex 배포 상태, 스킬 목록
  - `reports` — 실패 쿼리 요약(query-report 데이터) + retro/리포트 노트 목록
- [x] **FR-3 대시보드 페이지** *(goal: Objective)*
  overview+index+repos를 한 화면에: 헬스 3종 카드, 폴더별 인덱스 통계, 정본 최신성(ahead/
  behind), 최근 실패 쿼리 수. 낡은 항목엔 대응 make 명령을 안내한다(실행 아님 — 1차).
- [x] **FR-4 설정 페이지(읽기 전용)** *(goal: Non-goals — 편집 없음)*
  마스킹된 시크릿 현황(`make secrets` 웹판), NOTES_DIR 폴더 목록, 백업 설정 상태. 각 항목에
  "바꾸려면: make …" 안내를 붙인다.
- [x] **FR-5 에이전트 페이지** *(goal: Objective)*
  페르소나 레지스트리(~/.localmind/agents) 목록·설명·배포 상태(claude/codex별 배포됨/안됨),
  스킬 목록.
- [x] **FR-6 리포트 페이지** *(goal: Objective)*
  실패 쿼리 리포트 요약과 리포트/회고 노트 목록(노트 본문은 마크다운 원문 표시).
- [x] **FR-7 인증·바인딩** *(goal: Constraints — 루프백+키)*
  `/ui/api/*`는 기존 auth(LOCALMIND_API_KEY 등)로 보호한다. UI는 최초 접속 시 키를 입력받아
  저장(localStorage)하고, 키가 틀리면 명확한 에러 화면을 보인다. hostGuard(루프백) 적용 유지.
  시크릿 원문은 어떤 응답에도 실리지 않는다.
- [x] **FR-8 상태 가시성** *(goal: Constraints — 026 원칙)*
  모든 데이터 영역은 로딩/성공/실패(및 빈 상태)를 명시적으로 표시한다. API 실패 시 원인과
  복구 안내(예: "스택이 꺼져 있어요 — make up")를 보인다.

## Acceptance Criteria (테스트 1:1 매핑 — 레벨은 plan 테스트 전략 참조)

- [x] **AC-1** Given 스택 기동, When `GET /ui`, Then 200과 HTML이 온다(외부 도메인 참조 0 —
  응답 정적 자산 내 http(s) 외부 URL 부재).
- [x] **AC-2** Given 유효 키, When `GET /ui/api/overview`, Then 세 서비스의 up/down이 JSON으로
  온다. Given 임의 서비스 down, Then 해당 항목만 down으로 표기되고 응답 자체는 200.
- [x] **AC-3** Given 인덱스 파일 존재, When `GET /ui/api/index`, Then 폴더 라벨별 파일·청크 수와
  인덱스 mtime이 온다. Given 인덱스 부재, Then 오류가 아니라 "아직 색인 전" 상태로 온다.
- [x] **AC-4** Given 키 없음/오류, When `GET /ui/api/*`, Then 401과 평이한 한국어 에러 메시지.
- [x] **AC-5** When `GET /ui/api/config`, Then 시크릿 값이 원문으로 포함되지 않는다(마스킹 형식
  검증 — 값 전체가 응답 본문에 부재).
- [x] **AC-6** Given 페르소나 레지스트리에 N개, When `GET /ui/api/agents`, Then N개 각각의 배포
  상태(claude/codex)가 실제 배포 폴더 존재와 일치한다.
- [x] **AC-7** Given 노트 repo가 origin보다 behind인 픽스처, When `GET /ui/api/repos?refresh=1`,
  Then 해당 repo가 behind>0로 보고된다(git repo 아닌 폴더는 "git 아님"으로 구분).
- [x] **AC-8** Given API가 오류를 반환, When 대시보드 렌더링, Then 해당 카드가 실패 상태 + 복구
  안내를 표시한다(빈 화면·무한 로딩 금지). *(실증: 깨진 인덱스 픽스처 인스턴스(:8799)에서
  인덱스 카드만 에러 상태 + 나머지 3카드 정상 — 카드별 독립 실패 확인, 2026-07-06)*
- [ ] **AC-9** Given 오프라인(외부 네트워크 차단), When UI 로드, Then 모든 페이지가 정상 동작한다.
  *(부분 검증: 외부 URL 참조 0은 자동 테스트로 확인(정적 근거) — 실제 네트워크 차단 상태의
  수동 도그푸드 1회는 미실시. 후속: 다음 오프라인 상황에서 확인)*
- [x] **AC-10** Given reports/ 안의 심볼릭 링크(폴더 밖 파일을 가리킴), When 목록·본문 조회, Then
  목록에서 제외되고 본문 읽기는 거부된다(보안 리뷰 중대-1 회귀 — 심링크 경로 탈출 차단).
- [x] **AC-11** Given 시크릿 키-이름 패턴에 안 걸리는 항목의 값에 URL 임베드 자격증명
  (`user:token@host`), When `GET /ui/api/config`, Then userinfo가 `***`로 대체되어 원문이
  응답에 없다(보안 리뷰 중대-2 회귀).

## Open questions

- ~~repos의 fetch 자격증명: 사용자 git credential이 없는 환경(순수 로컬 노트)에서는 fetch를
  건너뛰고 "원격 확인 불가"로 표기하면 충분한가?~~ → 확정(2026-07-06): fetch 실패 시
  `fetched:false` + "원격 확인 불가(네트워크/자격증명) — 마지막으로 받아온 기준" 표기로 구현,
  도그푸드 통과.
- ~~리포트 노트의 마크다운 렌더링 라이브러리 없이(빌드리스) `<pre>` 원문 표시로 시작할지,
  최소 렌더러를 벤더링할지.~~ → 확정(2026-07-06): `<pre>` 원문 표시(단순함 우선 + XSS 표면
  제거 — textContent 렌더). 렌더러 벤더링은 필요가 증명되면 재론.

## 검증 기록 (2026-07-06)

- [x] 자동 테스트 25/25(ui-status 13 + ui-server 12), 전체 스위트 356/356, typecheck clean
- [x] 독립 리뷰 3종 — ux-reviewer(중대 1·사소 4·제안 4 → 전부 반영), security-reviewer(중대 2
      실증 → 수정+revert-to-red 회귀 테스트), 크리틱 최종 게이트 **clean**(치명·중대 0,
      트레이드오프 1건 승인, 사소 3건 반영 후 배칭 재검)
- [x] 실기기 도그푸드(m5): `make ui` → 4페이지 실데이터 렌더, API 7종 실측, 원격 새로고침,
      시크릿 원문 부재 grep 확인, AC-8 에러 카드 실증
- [ ] 실제 오프라인 도그푸드(AC-9) — 미실시(정적 근거만 자동 검증, 후속)
