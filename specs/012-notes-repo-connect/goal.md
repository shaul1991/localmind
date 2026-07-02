# Goal: Notes Repo Connect (git 저장소 URL 기반 노트 폴더 자동 연결)

## Background — 배경

localmind의 노트 폴더는 MCP 등록 시 `NOTES_DIR` 환경변수("라벨=경로" 쉼표 구분)로 지정하며,
`make mcp-install`이 이 값으로 Claude Code에 등록해준다(`scripts/mcp-install.sh`).

많은 사용자가 노트를 git 저장소(GitHub 등 비공개 repo)로 관리한다. 이 경우 노트의 "정본"은
git 저장소이고, 각 기기의 로컬 폴더는 그 clone이다. 그런데 현재는 새 기기에서 localmind를
연결할 때 (1) 노트 저장소들을 어디서 받아와야 하는지, (2) 어느 경로에 clone했는지,
(3) `NOTES_DIR`를 어떤 라벨·문법으로 조립해야 하는지를 전부 사용자가 기억해서 수동으로
수행해야 한다.

## Problem — 문제

- 노트 git 저장소 목록(URL·라벨)이 어디에도 설정으로 남지 않는다 — 사용자의 기억에만 있다.
- 새 기기 셋업 시 "clone → 경로 확인 → `NOTES_DIR` 조립 → `make mcp-install`"의 여러 단계를
  수동으로 이어야 하고, 한 단계라도 빠지면 일부 노트 폴더가 검색에서 조용히 누락된다
  (에러가 나지 않으므로 알아차리기 어렵다).
- 비개발자 사용자에게 "쉼표 구분 라벨=경로" 문법을 손으로 조립하게 하는 것은 진입 장벽이다.

## Objective — 목표

사용자가 `NOTES_REPOS` 환경변수("라벨=git URL" 쉼표 구분)로 노트 저장소 목록을 한 번
선언하면, `make notes-connect` 한 번으로 (1) 각 저장소를 clone(이미 있으면 pull)하고,
(2) 그 경로들로 `NOTES_DIR`를 자동 조립해, (3) Claude Code MCP 등록까지 이어지게 한다.
나아가 이 연결을 `make setup`(최초 온보딩)의 연결 단계에 통합해, 새 기기에서 `make setup`이
노트 저장소 연결까지 **제안·수행**하도록 한다(대화형 확인 기준 — 기존 `setup.sh` 규약대로
비대화·DRY_RUN에서는 건너뛴다). 목표는 "별도로 `make notes-connect`를 기억해 실행할 필요를
없애는 것"이며, 완전 무인 재현이 아니라 대화형 온보딩 경로의 간소화다.

## Expected outcome — 기대 결과

- 새 기기에서 localmind 저장소 clone + `.env` 복원(또는 `NOTES_REPOS` 한 줄 입력) 후
  `make notes-connect` 한 번이면 노트 저장소 연결이 끝난다. 이 흐름이 실제로 동작하려면
  `make`가 `.env`의 값을 스크립트에 전달해야 하며(현재 Makefile은 `.env`를 자동 로드하지
  않으므로), 스크립트가 프로젝트 `.env`를 직접 읽는 폴백을 갖춰야 한다.
- 같은 명령을 다시 실행해도 안전하다(멱등) — 이미 clone된 저장소는 pull, 등록은 갱신.
- `NOTES_REPOS`를 쓰지 않는 사용자에게는 아무 변화가 없다(완전 opt-in).
- MCP 등록은 기존 등록을 통째로 재작성한다(remove 후 add) — 수동으로만 추가했던 노트 폴더가
  경고 없이 사라지지 않도록, 이 덮어쓰기 성격을 사용자가 알 수 있어야 한다.
- `make setup`의 연결 단계가 `NOTES_REPOS`가 있으면 `notes-connect` 경로를(없으면 기존 단일
  폴더 `mcp-install`을) 타므로, 대화형 온보딩에서 노트 저장소 연결까지 함께 제안·수행된다
  (비대화·DRY_RUN은 기존 규약대로 건너뜀 — 완전 무인 재현은 목표가 아님).

## Success metrics — 성공 지표

- `NOTES_REPOS` 미설정 상태에서 기존 `make mcp-install`·`make setup` 동작에 회귀 없음.
- 새 기기(깨끗한 환경, 인증 준비됨) 시나리오: `NOTES_REPOS` 설정 → `make notes-connect`(또는
  대화형 `make setup`) 실행으로 모든 노트 저장소가 clone되고 MCP 등록의 `NOTES_DIR`에 전부
  포함된다.
- `make setup`의 연결 단계가 `NOTES_REPOS` **유무(비어있지 않음)**에 따라 분기하되,
  `NOTES_REPOS` 미설정 시에는 기존 단일 폴더 등록 동작이 그대로 유지된다(회귀 없음).
- 새 기기에서 인증(SSH 키 등)이 아직 없어 모든 clone이 실패해도, localmind가 아예 미등록으로
  남지 않는다 — 기본 단일 폴더 등록으로 폴백하거나 사용자에게 미등록 상태·재시도 방법을
  명확히 알린다(레거시 경로보다 나빠지지 않음).
- 일부 저장소 접근 실패(인증·네트워크) 시에도 나머지 저장소는 정상 연결되고, 실패 항목이
  평이한 한국어로 보고된다.

## Non-goals — 비목표

- git 저장소 자체의 생성·초기화(GitHub에 repo 만들기)는 범위 밖 — 이미 존재하는 저장소를
  받아오는 것만 다룬다.
- SSH 키 발급·GitHub 로그인 등 인증 수단의 설치·설정은 범위 밖 — 실패 시 안내만 한다.
- 노트 변경사항의 자동 commit/push/pull(동기화 데몬·cron)은 범위 밖 — 연결(최초 clone과
  실행 시점 pull)까지만 다룬다.
- Claude Code 외 MCP 클라이언트(Cursor·Claude Desktop 등) 자동 등록은 범위 밖 — 기존
  `make mcp-config`(설정 JSON 출력)를 그대로 안내한다.
- 기존 노트 백업/복원(`make backup`/`restore`, `BACKUP_DIR`)의 변경은 범위 밖 — 그 경로와는
  독립인 별도 기능이다.
- `make setup`만 통합 대상이다 — `make recover`(백업 복원 흐름)에 notes-connect를 끼워넣는
  것은 이번 범위 밖(후속). 백업/복원 경로 회귀 위험을 최소화하기 위함이다.
- 전역 `~/.claude/CLAUDE.md`(base+device 레이어링) 자동 스캐폴딩은 이번 범위 밖 — 이는
  노트 연결이 아니라 Claude Code 메모리 설정 영역이라 별도 스펙(013 후보)으로 다룬다.
- clone된 저장소 내용은 사용자가 신뢰하는 자기 노트의 정본으로 간주한다 — 간접 프롬프트
  인젝션(노트 본문이 LLM에 그대로 주입되는 표면)의 근본 차단은 이번 범위 밖이며, `specs/011`과
  동일하게 soft-delete로 비가역 피해만 완화한다. `NOTES_REPOS`에 어떤 저장소를 넣을지는 전적으로
  사용자 책임이다.

## Constraints — 제약

- 기존 셸 스크립트 스타일(`ok()`/`warn()`/`err()` 헬퍼, 친절한 한국어 메시지, 비대화 환경
  자동 진행)을 유지한다 — 비개발자도 메시지만 읽고 따라갈 수 있어야 한다.
- 추가 npm 의존성 없이 셸 스크립트와 git CLI로 구현한다.
- `git`이 없는 환경에서는 명확한 안내와 함께 중단한다(암묵적 설치 시도 금지).
- MCP 등록은 기존 `scripts/mcp-install.sh`를 재사용한다 — 등록 로직을 중복 구현하지 않는다.

## Stakeholders — 이해관계자

- 노트를 git 저장소로 관리하며 여러 기기에서 localmind를 쓰는 단일 사용자
  (설치한 개인 누구나 — 비개발자 포함)

## Risks — 리스크

- **URL을 통한 명령 실행**: `NOTES_REPOS`가 복원된 `.env`·붙여넣은 예시 등 사용자가 직접
  작성하지 않은 경로로 올 수 있다. git의 `ext::` transport나 `-`로 시작해 `--upload-pack=<cmd>`
  같은 옵션으로 해석되는 "URL"은 로컬에서 명령을 실행시킬 수 있다 — 스킴 allowlist와
  end-of-options(`--`) 강제로 차단한다.
- **라벨을 통한 경로 탈출**: clone 대상은 `$NOTES_REPOS_DIR/<라벨>`이라, 라벨이 `../../.ssh`
  같으면 대상이 지정 폴더를 벗어난다 — 라벨 charset 제한 + 물리 경로가 `NOTES_REPOS_DIR`
  안인지 재검증으로 차단한다(`scripts/backup-extras.sh`의 `$HOME` 봉쇄 선례를 따른다).
- **자격증명 유출**: HTTPS URL에 토큰을 박은 경우(`https://user:token@host/...`) 요약·git
  stderr에 그대로 노출될 수 있다 — 출력 시 자격증명을 마스킹하고, SSH 키/credential helper
  사용을 문서로 권장한다.
- **인증 실패·행(hang) UX**: 비공개 저장소는 SSH 키/토큰이 없으면 clone이 실패한다. 비대화
  환경에서 git이 자격증명 프롬프트로 멈추면 전체 파이프라인이 행에 빠질 수 있다 — 비대화
  모드(`GIT_TERMINAL_PROMPT=0` 등)를 강제해 즉시 실패로 떨어뜨리고, 실패 원인별 평이한
  한국어 안내를 제공한다.
- **로컬 변경과의 충돌**: 이미 clone된 저장소에 커밋 안 된 변경이 있을 때 pull이 실패하거나
  데이터가 꼬일 수 있다 — 변경이 있으면 pull을 건너뛰고 경고만 하는 보수적 동작으로 완화한다.
- **경로 충돌·엉뚱한 저장소**: clone 대상 경로에 git 저장소가 아닌 폴더/파일이 있거나, 다른
  원격의 git 저장소가 이미 있으면 덮어쓰거나 잘못된 원격을 pull하면 안 된다 — origin URL을
  대조해 다르면 건너뛰고 명시적으로 보고한다.
- **부분 실패의 침묵**: 여러 저장소 중 일부만 성공했을 때 전부 성공한 것처럼 보이면 노트
  누락을 알아차리기 어렵다 — 등록 성공/실패와 무관하게 마지막에 성공/실패 요약을 반드시
  출력한다.
- **라벨 충돌**: 두 항목이 같은 라벨(명시적이든 URL에서 유도됐든, 기본 `localmind` 라벨과의
  충돌 포함)로 매핑되면 한쪽이 다른 쪽의 폴더를 덮어쓰거나 pull해 "성공"으로 오보될 수 있다
  — 파싱 시점에 중복 라벨을 감지해 실패로 처리한다.
- **setup 통합의 회귀**: 현재 `make setup`의 연결 단계는 기본 단일 폴더(`$HOME/.localmind`)로
  `mcp-install`을 호출한다. 통합을 잘못하면 `NOTES_REPOS`를 안 쓰는 사용자의 기존 동작을
  바꾸거나, 다폴더 등록을 단일 폴더로 되돌릴 수 있다 — `NOTES_REPOS` 유무로만 분기하고
  미설정 시 기존 동작을 100% 보존하는 것으로 완화한다.
