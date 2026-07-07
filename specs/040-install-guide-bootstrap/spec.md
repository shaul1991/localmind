# Spec: 설치 전 시각적 설치 가이드 (무의존 부트스트랩 서버)

<!-- 무엇을(what). 상위: [goal](goal.md) · 방법: [plan](plan.md) · 화면·콘텐츠: [design](design.md) -->

## Scope
`make guide`로 실행하는 **무의존 부트스트랩 서버**(단일 `.mjs`, Node 내장만)와, 그 서버가 여는
**아주 상세한 한국어 설치 가이드 웹페이지**. 준비물 실시간 점검(배지) + 단계별 안내(설명+복사
버튼) + 문제 해결. **복사만**(명령 실행 없음).

## Context
- `make ui`(034)는 `npm run ui`(tsx)라 node_modules 필요 → 설치 전 실행 불가.
- setup.sh preflight 점검 항목: `docker` + `docker info`(설치+실행), `npm`/Node, `.env`, ollama(`:11434`).
- 이 가이드는 그 preflight를 **브라우저에서, 설치 전에** 재현한다 — 단 무의존(.mjs)으로 새로 구현.
- 디자인 토큰: `public/ui/style.css`(034)는 빌드 없이도 있는 정적 파일 → 서버가 그대로 서빙해 **재사용**.
- 설치 후 라이브 설정 관리는 specs/039가 담당(중복 아님 — 생애주기 분담).

## Functional Requirements

- [x] **FR-1 (무의존 실행)**: Node 내장 모듈만(node_modules·dist·tsx·외부 패키지 0). → goal: Objective/Constraint
  ✔ import 스캔 테스트 + **심링크 경로 서브프로세스 기동 회귀 테스트** + 격리 폴더 수동 실증
- [x] **FR-2/AC-8 (Node 부재 폴백)**: `make guide`가 node 없으면 안내+링크+exit≠0(크래시 아님). → goal: Risk
  ✔ node 없는 PATH로 가드 실행 검증
- [x] **FR-3 (점검 API)**: `GET /api/checks` → 7항목 ok|missing|unknown. → goal: Objective  ✔ 스키마 테스트
- [x] **FR-4 (상세 가이드)**: 준비물(배지)+설치단계(명령+복사)+문제해결 HTML. → goal: Objective  ✔ 브라우저 dogfood
- [x] **FR-5 (복사만·실행 없음)**: GET만, 명령 실행 엔드포인트 없음. → goal: Constraint  ✔ 405 테스트
- [x] **FR-6 (읽기 전용 점검)**: `--version`·`info`·`command -v`만 spawn. → goal: Constraint  ✔ 코드 리뷰(크리틱)
- [x] **FR-7 (우아한 저하)**: 실패/타임아웃/ENOENT → unknown/missing 흡수. → goal: Risk  ✔ classifyExit 테스트 6종
- [x] **FR-8 (로컬 전용·자동 오픈·포트 폴백)**: 127.0.0.1 바인딩, 브라우저 자동 오픈, 포트 충돌 시 다음 포트.
  → goal: Constraint/Risk  ✔ LAN 접근 거부 수동 실증 + 코드 리뷰
- [x] **FR-9 (비개발자 눈높이)**: 무엇/왜·예상·막히면 + "터미널 여는 법"(OS별). → goal: Objective  ✔ dogfood 스크린샷

## Acceptance Criteria

- [x] **AC-1 (무의존·심링크 실기동)**: node_modules·dist 없이 + **심링크 경로**에서도 `node
  bootstrap-guide.mjs`가 기동·응답. ✔ 서브프로세스 회귀 테스트(중대-1 방지) + 격리 폴더 수동 실증
- [x] **AC-2 (Docker 판정)**: info 성공→ok, 명령 없음→missing(dockerInstalled), 데몬 미실행→missing. ✔ classifyExit 테스트
- [x] **AC-3 (Node 버전)**: ≥20 ok, <20 missing. ✔ classifyNode 테스트
- [x] **AC-4 (.env 판정)**: 없음→missing, 있음→ok. ✔ 심링크 회귀 테스트(격리 폴더 env=missing) + dev ok
- [x] **AC-5 (확인 불가, 엣지)**: 타임아웃/예외 → unknown, 응답 200. ✔ classifyExit(signal·ETIMEDOUT) 테스트
- [x] **AC-6 (복사 버튼)**: 클립보드 복사+"복사됨", 미가용 시 선택 폴백. ✔ dogfood + 코드 리뷰
- [x] **AC-7 (GET-only·무실행, 보안)**: 비GET 405, 명령 실행 엔드포인트 없음. ✔ POST/PUT/DELETE 405 테스트
- [x] **AC-8 (Node 부재 폴백)**: node 없으면 안내+exit≠0. ✔ node 없는 PATH 가드 실증
- [x] **AC-9 (setup preflight 미러 — 정정)**: docker/.env/ollama 판정은 setup.sh preflight와 일치. **단
  node는 guide가 버전(≥20)까지 점검해 더 엄격**(setup은 npm 존재만 확인). ✔ 스키마 + 판정 로직 리뷰
- [x] **AC-10 (로컬 바인딩)**: 127.0.0.1에만 바인딩. ✔ LAN IP 접근 거부 수동 실증(크리틱)
- [x] **AC-11 (상세 콘텐츠 — 정정)**: 각 단계는 **설명(무엇/왜) 필수**, 명령·예상·문제해결은 **해당하는
  단계에**(예: '터미널 열기'는 명령 없음이 자연스러움). "터미널 여는 법"(OS별) 안내 존재. ✔ dogfood 스크린샷

## Open questions
- **[OQ-1] 브라우저 자동 오픈 방식**: macOS `open`·Linux `xdg-open`·Windows `start` 분기. 실패 시 URL
  출력 폴백. (plan에서 확정 — child_process, 실패 무해)
- **[OQ-2] ollama 점검 포함 여부**: 설치 전에는 ollama가 없을 수 있어 `missing`이 정상. "선택 준비물"로
  표기하고 배지는 회색/주황 중 무엇으로 둘지 → design에서 "선택"으로 구분.
- **[OQ-3] 포트 대체 전략**: 8799 사용 중이면 8800..로 증가 탐색 vs 오류 안내. 1차는 안내 + 다음 빈 포트.
