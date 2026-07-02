# Spec: Backup & Recovery Reliability

상위: [goal](goal.md)

## Scope

(1) `make backup`의 부분 실패 허용(경고 후 계속 + 비0 종료), (2) `make recover`에
extras 복원 배선, (3) `make purge` 가드 강화 + 정직한 부분 완료 보고, (4) MCP 등록
원자성, (5) backup-cron 변수 반영 + non-ff 안내, (6) `make up` 헬스 대기에 :8787 +
curl 타임아웃(BACKLOG B4 흡수), (7) `.env` 생성 시 권한 600(BACKLOG B1 일부).

## Context

- `Makefile:113` backup 타깃: 첫 줄 `@npm run memory:export -- "$(BACKUP_DIR)/memory.md"`
  가 실패하면 레시피 전체 중단 — 이후의 git 커밋·push·extras 단계 미실행.
  `scripts/memory-export.ts:56`은 스택 다운 시 exit 1.
- `scripts/backup-init.sh:106-110`: 같은 export 실패를 warn으로 넘기고 노트는 백업 —
  이 정책이 사용자 결정(2026-07-03: 경고 후 계속)과 일치하는 기준 구현.
- `scripts/backup-cron.sh:82`: "메모리 export만 안 되는 것처럼" 안내하지만 실제로는
  노트 백업도 함께 중단된다(현재 구조 기준) — 문구·동작 정합 필요. `:51`: 크론 라인에
  `BACKUP_DIR`·`BACKUP_EXTRA_FILES`를 싣지 않음.
- `scripts/recover.sh:134-149`: 5·6단계(복원)에 extras 복원 호출 없음.
  `scripts/restore-extras.sh:4` 헤더는 "make restore 내부에서 자동 호출"이라 명시,
  `Makefile:162`의 restore 타깃에만 배선됨. 기존 파일과 다르면 `.bak-<ts>` 보존
  (specs/006 AC).
- `scripts/purge.sh:41-45`: `WIPE_NOTES` 가드가 `""`·`/`·`$HOME`만 거부 —
  `/tmp`·`/var` 등 통과. `:63` `DC down -v` 실패를 warn으로 삼킨 뒤 `:82-89`의
  `rm -rf "$BACKUP_DIR"`는 무조건 진행, 마지막에 "완전 제거 완료" 출력.
- `scripts/mcp-install.sh:61-64`: `claude mcp remove` 후 `claude mcp add` — add 실패 시
  기존 등록 소실. `scripts/notes-connect.sh:159-161`도 통째 재작성이나 여기는 경고
  문구가 있음(이번 범위는 mcp-install의 원자성).
- `scripts/up.sh:48-53`: 헬스 폴링이 :8767·:4000만 — :8787(chat) 미확인. curl에
  `--connect-timeout`/`--max-time` 없음(BACKLOG B4). `:42` 빌드 출력 `>/dev/null 2>&1`.
- `.env` 생성 3곳 — `Makefile:174`(init-env), `scripts/up.sh:33`, `scripts/recover.sh:60`
  — 모두 `cp .env.example .env`(umask 기본 644). 이후 OAuth 토큰이 기록됨.
  `scripts/claude-token.sh`의 치환 경로는 mktemp(600)→mv라 600이 되지만 append 경로는
  644 유지.
- 기존 셸 테스트 관례: `scripts/backup-extras.test.sh`·`restore-extras.test.sh`·
  `notes-connect.test.sh` 등 — 임시 디렉토리 + 로컬 bare repo, 라이브 스택 불필요,
  CI에서 실행.

## Functional Requirements

- **FR-1 (backup 부분 실패 허용)**: `make backup`에서 memory-export가 실패해도 노트
  커밋·push와 extras 백업은 계속 진행한다. 실행 말미에 실패 요약("메모리는 백업되지
  않았어요 — 스택을 켜고(`make up`) 다시 실행하세요")을 출력하고 **비0 종료 코드**로
  끝난다(cron 로그에서 식별 가능). export 성공 시엔 기존과 동일(0 종료).
  `backup-init`의 기존 정책과 동일 문구·동일 판정을 공유한다. `backup-cron.sh:82`의
  안내 문구를 실제 동작과 일치시킨다.
  → goal: Objective(1), Constraints(backup-init 통일), Risks(요약+종료코드)
- **FR-2 (recover에 extras 복원)**: `make recover`의 복원 단계가 `make restore`와
  동일하게 extras 복원(restore-extras)을 수행한다. `.bak-<타임스탬프>` 보존 규칙
  (specs/006)이 recover 경로에서도 동일하게 작동한다. `BACKUP_EXTRA_FILES` 미사용
  사용자에겐 아무 변화가 없다.
  → goal: Objective(2), Risks(기존 파일 보존)
- **FR-3 (purge 경로 가드 강화)**: `WIPE_NOTES` 시 삭제 대상은 실경로(심링크 해소)
  기준으로 검증한다 — `$HOME` **하위**가 아니면 기본 거부한다. 홈 밖 경로를 정말
  지우려는 고급 사용자는 별도의 명시 변수(예: `PURGE_OUTSIDE_HOME=1`)를 함께 줘야
  한다(오차단 완화 — goal Risks 반영). 루트·홈 자체·빈값 거부는 유지.
  → goal: Objective(3), Success metrics
- **FR-4 (purge 정직한 보고)**: Docker 데몬 접근 불가 또는 `down -v` 실패 시,
  ① 볼륨·이미지가 남았음을 실행 말미 요약에 명시하고 ② 비0 종료 코드로 끝나며
  ③ "완전 제거 완료" 문구를 출력하지 않는다(부분 완료를 부분 완료라고 말한다).
  노트 삭제 진행 여부는 사용자가 이미 토큰으로 확인한 의사이므로 중단하지 않되,
  요약에 함께 표기한다.
  → goal: Objective(3), Expected outcome
- **FR-5 (MCP 등록 원자성)**: `mcp-install.sh`가 add 실패 시 기존 등록을 잃지 않는다 —
  기존 등록 정보를 보존한 뒤 add를 시도하고, 실패하면 이전 등록을 복원(또는 add 성공
  확인 후에만 기존 제거)한다. 성공·실패 어느 쪽이든 결과 상태를 한국어로 알린다.
  → goal: Objective(4), Expected outcome
- **FR-6 (backup-cron 변수 반영)**: `make backup-cron`이 등록 시점의
  `BACKUP_DIR`·`BACKUP_EXTRA_FILES`(기본값과 다를 때)를 크론 라인에 포함한다.
  DRY_RUN 미리보기에도 동일하게 반영된다.
  → goal: Objective(4), Expected outcome
- **FR-7 (push 실패 안내)**: backup의 push가 거부되면(non-ff 등) 실패 원인과 해결
  방법("다른 기기에서 백업이 먼저 올라갔어요 — `git -C <BACKUP_DIR> pull` 후 다시")을
  로그에 남기고 비0 종료한다 — cron에서 영구 무알림 실패가 되지 않게.
  → goal: Objective(4), Non-goals(자동 병합은 범위 밖)
- **FR-8 (up 헬스 대기 강화)**: `scripts/up.sh`의 헬스 폴링에 :8787을 포함하고, 모든
  폴링 curl에 `--connect-timeout`/`--max-time`을 준다(BACKLOG B4 흡수). 타임아웃까지
  준비되지 않으면 "준비 완료" 대신 어떤 포트가 안 떴는지와 확인 방법(`make logs`)을
  안내한다. 빌드 실패 시에도 같은 안내가 나온다.
  → goal: Objective(4), Expected outcome, Risks(첫 기동 대기)
- **FR-9 (.env 권한)**: `.env`를 생성·복사하는 3곳(init-env·up.sh·recover.sh)과
  claude-token의 append 경로에서 `.env`가 소유자 전용 권한(600)이 되게 한다.
  → goal: Objective(4) — BACKLOG B1 일부 흡수

## Acceptance Criteria

- **AC-1 (부분 백업)**: Given 스택이 꺼져 있고 노트에 변경이 있는 상태에서,
  When `make backup`을 실행하면,
  Then 노트 커밋이 생성되고, 메모리 실패 안내가 출력되며, 종료 코드가 0이 아니다.
- **AC-2 (정상 백업 회귀 없음)**: Given 스택이 켜져 있을 때,
  When `make backup`을 실행하면,
  Then 기존과 동일하게 메모리+노트가 백업되고 0으로 종료한다.
- **AC-3 (cron 문구 정합)**: Given backup-cron이 안내하는 실패 시나리오 문구가,
  Then FR-1의 실제 동작(노트는 백업됨)과 일치한다.
- **AC-4 (recover extras)**: Given extras(`extras/<상대경로>`)가 든 백업 repo에서,
  When `make recover`(또는 그 복원 단계)를 실행하면,
  Then extras 파일이 원위치로 복원되고, 기존에 다른 내용의 파일이 있으면
  `.bak-<타임스탬프>`로 보존된다.
- **AC-5 (extras 미사용 무영향)**: Given extras가 없는 백업 repo에서,
  When 같은 복원을 실행하면,
  Then 기존 recover 동작에 회귀가 없다.
- **AC-6 (purge 홈 밖 거부)**: Given `BACKUP_DIR=/tmp`(또는 `$HOME` 밖 임의 경로)로,
  When `NOTES=1 FORCE=1 make purge`를 실행하면,
  Then 노트 삭제 없이 거부되고 비0으로 종료한다. And `PURGE_OUTSIDE_HOME=1`을 함께
  주면 진행된다.
- **AC-7 (purge 심링크)**: Given `$HOME` 안의 심링크가 `$HOME` 밖을 가리킬 때,
  When `NOTES=1`로 purge하면,
  Then 실경로 기준으로 판정되어 거부된다.
- **AC-8 (purge 부분 완료 보고)**: Given Docker 데몬이 꺼진 상태에서,
  When `make purge`(FORCE)를 실행하면,
  Then 볼륨·이미지가 남았다는 요약이 출력되고 "완전 제거 완료"가 출력되지 않으며
  비0으로 종료한다.
- **AC-9 (MCP 등록 보존)**: Given localmind가 이미 등록된 상태에서,
  When add가 실패하는 조건(예: 가짜 claude 바이너리가 add에서 비0 반환)으로
  mcp-install을 실행하면,
  Then 기존 등록이 그대로 남아 있고 실패가 한국어로 안내된다.
- **AC-10 (cron 변수)**: Given `BACKUP_DIR`·`BACKUP_EXTRA_FILES`를 커스텀으로 지정해,
  When `DRY_RUN=1 make backup-cron`을 실행하면,
  Then 미리보기 크론 라인에 두 변수가 포함된다.
- **AC-11 (push 실패 안내)**: Given 백업 repo의 원격이 로컬보다 앞서 있는 상태에서
  (로컬 bare repo로 재현),
  When `make backup`을 실행하면,
  Then non-ff 원인과 해결 안내가 출력되고 비0으로 종료한다.
- **AC-12 (up 타임아웃)**: Given 응답하지 않는 엔드포인트를 폴링할 때,
  When up.sh의 헬스 대기가 돌면,
  Then 각 curl이 타임아웃 내에 반환하고(행 없음), 최종적으로 :8787 포함 미준비 포트가
  안내된다.
- **AC-13 (.env 권한)**: Given `.env`가 없는 상태에서,
  When init-env(및 up.sh·recover.sh의 생성 경로)가 `.env`를 만들면,
  Then 파일 권한이 600이다. And claude-token의 append 경로 이후에도 600이 유지된다.

## Open questions

- FR-1의 "비0 종료"가 `make backup && ...` 형태로 backup을 체이닝하는 기존 사용자
  스크립트를 깨는지 — repo 내부에는 해당 체이닝 없음(확인). 외부 사용자용으로
  CHANGELOG에 동작 변경을 명시한다.
- FR-4에서 노트 삭제를 "진행하되 요약 표기"로 정한 근거: 사용자가 이미 `delete-notes`
  토큰으로 노트 삭제 의사를 확인했고, Docker 상태는 노트와 무관 — 반대로 Docker 실패
  시 노트도 중단하는 게 낫다는 판단이 구현 중 서면 다시 올린다.
- FR-5의 구현 방식: "add 성공 후 제거"는 `claude mcp add`가 중복 등록을 거부할 수
  있어 불가할 수 있음 — 그 경우 "remove 전 기존 등록 JSON 백업 → add 실패 시 복원"
  으로. plan에서 확정.
- AC-12의 단위 검증 범위: up.sh 전체 실행 없이 헬스 폴링 함수만 분리 테스트할지 —
  기존 스크립트 구조상 함수 분리가 과하면 타임아웃 인자 존재를 정적 검사(grep)로
  대체(pinning.test.sh 방식).
