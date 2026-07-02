# Spec: Notes Repo Connect

상위: [goal](goal.md)

## Scope

`NOTES_REPOS` 환경변수("라벨=git URL" 쉼표 구분)에 선언된 노트 git 저장소들을
`make notes-connect`가 검증 → clone(있으면 pull) → `NOTES_DIR` 조립 → 기존
`scripts/mcp-install.sh` 등록으로 잇는다. 입력은 사용자가 직접 작성하지 않았을 수 있다는
전제(복원된 `.env`·붙여넣은 예시)로 URL·라벨을 검증한 뒤에만 처리한다. 추가로 `make setup`
(최초 온보딩)의 연결 단계가 `NOTES_REPOS` 유무에 따라 `notes-connect`(있음) 또는 기존
단일 폴더 `mcp-install`(없음)로 분기하도록 통합한다.

## Context

- `scripts/mcp-install.sh`는 `NOTES_DIR` env를 받아 준비물 점검 → 설정 확인 →
  `claude mcp remove` 후 `claude mcp add` 등록을 수행한다(`mcp-install.sh:61-64`). 이 스크립트가
  등록의 단일 경로이며, 본 기능은 그 앞단(저장소 준비와 `NOTES_DIR` 조립)만 담당한다.
- `NOTES_DIR` 파싱은 `src/brain.ts`의 `parseFolders`(대략 `brain.ts:28-45`)에서 한다:
  `,`로 항목 분리, 첫 `=` 기준 `라벨=경로` 분리, 라벨 생략 시 폴더명(선행 `.` 제거), 라벨
  중복 시 `label-2`처럼 접미사를 붙여 조용히 개명. 본 스펙의 `NOTES_DIR` 조립은 이 규칙과
  호환돼야 하며, 라벨에 `,`·`=`가 들어가면 조립 문자열이 오염되므로 라벨 charset으로 차단한다.
- clone 위치는 `NOTES_REPOS_DIR`(기본 `$HOME/localmind-notes`) 아래 `<라벨>/` 폴더로 한다.
  이미 다른 경로에 clone해 둔 사용자는 그 경로에 심볼릭 링크를 두거나 `NOTES_REPOS_DIR`를
  바꿔 대응한다(자동 탐지는 하지 않는다 — 예측 가능성 우선).
- `scripts/setup.sh`의 4단계(연결 점검)는 현재 `claude mcp list`로 localmind 등록 여부를 보고,
  미등록이면 `make mcp-install`을 제안한 뒤 `confirm` 시 `NOTES_DIR="$NOTES_DIR"
  bash scripts/mcp-install.sh`를 실행한다(`setup.sh:157-167`). FR-16의 분기는 바로 이 자리에
  들어간다. `setup.sh`는 `set -e`를 쓰지 않고 비대화/DRY_RUN에서 자동으로 건너뛰는 규약이 있다.

## Interface Contract (고정 인터페이스 — 공유 오라클이 겨냥하는 계약)

여러 모델이 같은 오라클로 채점되려면 관측 가능한 입출력을 고정해야 한다. 구현은 아래를
**정확히** 따른다(사람용 메시지는 자유롭게 추가하되, 아래 기계 판독 라인·exit code·seam은 규약이다).

### 실행·입력
- 실행: `bash scripts/notes-connect.sh` (인자 없음). 설정은 모두 환경변수로 받는다.
- 입력 env: `NOTES_REPOS`, `NOTES_REPOS_DIR`(기본 `$HOME/localmind-notes`), `HOME`.
- **테스트 seam(구현이 반드시 지원해야 하는 env 오버라이드)**:
  - `MCP_INSTALL_CMD` — 등록에 쓸 명령(기본 `"$SCRIPT_DIR/mcp-install.sh"`). 구현은 이 명령을
    호출하며 조립된 `NOTES_DIR`를 **환경변수로 export**해 전달한다(인자 아님).
  - `NOTES_CONNECT_ENV` — `.env` 폴백에서 읽을 파일 경로(기본 `"$PROJECT_DIR/.env"`).
  - `GIT_BIN` — git 실행 파일(기본 `git`). 존재하지 않는 경로로 두면 "git 없음"을 재현한다.

### 기계 판독 stdout 라인(사람용 메시지와 별개로 반드시 출력)
- 파싱된 항목마다 정확히 한 줄: `ITEM\t<라벨>\t<상태>\t<사유>`
  - `<상태>` ∈ `connected`(clone 또는 pull 성공) | `skipped-dirty`(기존 repo에 로컬 변경 →
    pull 생략하고 폴더는 포함) | `failed`(검증·clone·pull·origin·충돌 실패).
  - 라벨을 뽑지 못한 항목은 라벨 자리에 `-`.
  - 성공 집합 = {`connected`, `skipped-dirty`} (둘 다 `NOTES_DIR`에 포함됨).
- 등록을 시도하는 경우(성공 항목 ≥1) 정확히 한 줄: `NOTES_DIR\t<조립된 값>`.
- opt-in 게이트(env·`.env` 어디에도 `NOTES_REPOS` 없음): 한 줄 `NO_REPOS` 출력 후 exit 0.
- git 없음: 한 줄 `NO_GIT` 출력 후 exit 1.

### exit code
- `0`: opt-in no-op이거나, **모든 항목이 성공 집합 + 등록 성공**일 때만.
- `1`: git 없음, 또는 실패 항목이 하나라도 있음, 또는 등록 실패(mcp-install exit≠0).

### 등록·마스킹
- `MCP_INSTALL_CMD`는 성공 항목이 ≥1일 때만 **정확히 한 번** 호출한다(전부 실패면 미호출).
- URL의 자격증명(`user:token@`의 userinfo)은 stdout·stderr 어디에도 평문으로 나타나지 않는다.

## Functional Requirements

- **FR-1 (저장소 목록 선언)**: `NOTES_REPOS`(쉼표 구분)로 저장소 목록을 지정한다. 각 항목은
  `라벨=URL` 또는 `URL`(라벨 생략)이다. 라벨 생략 판정은 "첫 `=` 앞 문자열이 안전한 라벨
  charset(FR-3)에 부합하는가"로 하며(부합하면 라벨 지정, 아니면 항목 전체를 URL로 간주),
  이렇게 해야 `=`가 포함된 URL(쿼리스트링 등)을 오분할하지 않는다. 라벨 생략 시 URL 마지막
  경로 세그먼트에서 `.git`·후행 `/`를 제거한 이름을 라벨로 쓴다. 항목 앞뒤 공백과 후행 쉼표는
  무시한다.
  → goal: Objective

- **FR-2 (URL 검증 — 스킴 allowlist·옵션 인젝션 차단)**: 각 URL은 허용 형태
  (`https://…`, `ssh://…`, scp 유사형 `user@host:path`, 그리고 테스트·로컬 사용을 위한 로컬
  파일시스템 절대경로)만 입력 검증을 통과시킨다. `-`로 시작하는 값(옵션 위장)과
  `ext::`·`git://`·`http://`·`file://` 등 명시적 transport 스킴은 해당 항목을 실패로 기록하고
  clone을 시도하지 않는다. **1차 방어는 이 입력 스킴 검증이다.** clone·pull 호출은 항상
  end-of-options(`git ... -- <URL> <경로>`)로 하고, `GIT_ALLOW_PROTOCOL`은 실제로 필요한
  최소 집합만 연다 — 원격 URL이면 `https:ssh`, 로컬 절대경로면 그 호출에 한해 `file`을 포함
  (로컬 경로 clone은 git 내부적으로 file 프로토콜을 쓰므로). 즉 `file://` **스킴 문자열**은
  입력에서 거부되지만, 검증된 로컬 절대경로는 file 프로토콜로 clone된다 — 이 둘은 구분된다.
  → goal: Risks (URL을 통한 명령 실행)

- **FR-3 (라벨 검증·경로 봉쇄)**: 라벨은 `^[A-Za-z0-9._-]+$`에 부합해야 하며 `.`·`..`가
  아니어야 한다(`/`·`,`·`=`·공백 불가). 부합하지 않으면 해당 항목을 실패로 기록하고 건너뛴다.
  clone 대상 경로를 계산한 뒤 물리 경로가 `NOTES_REPOS_DIR` 하위인지 재검증하고, 벗어나면
  아무것도 건드리지 않고 실패로 기록한다(`scripts/backup-extras.sh:32-64`의 `$HOME` 봉쇄 선례).
  → goal: Risks (라벨을 통한 경로 탈출)

- **FR-4 (라벨 중복 거부)**: 파싱 결과 라벨이 다른 항목과 겹치거나(명시·유도 불문) 예약된
  기본 라벨 `localmind`와 겹치면, 겹치는 항목을 실패로 기록한다(먼저 나온 항목은 그대로 처리).
  → goal: Risks (라벨 충돌)

- **FR-5 (미설정 시 `.env` 폴백 후 안내)**: `NOTES_REPOS`/`NOTES_REPOS_DIR`가 환경변수로
  비어 있으면 프로젝트 `.env`에서 같은 키를 읽는다(`mcp-install.sh:53`의 `OPENMEMORY_USER`
  폴백과 동일 방식). env·`.env` 어디에도 `NOTES_REPOS`가 없으면 설정 방법 예시를 평이한
  한국어로 안내하고 실패 없이 종료한다(exit 0). 기존 명령·흐름에는 어떤 영향도 없다.
  → goal: Expected outcome (완전 opt-in, `.env` 복원 흐름)

- **FR-6 (clone)**: 검증을 통과한 항목의 대상 경로가 없으면 그 경로로 clone한다. 상위
  디렉토리는 자동 생성한다. git은 비대화 모드(`GIT_TERMINAL_PROMPT=0`, SSH `BatchMode`)로
  실행해 자격증명 프롬프트로 행에 빠지지 않고 즉시 실패로 떨어지게 한다.
  → goal: Objective, Risks (인증 실패·행 UX)

- **FR-7 (pull — origin 대조·멱등 재실행)**: 대상 경로가 이미 git 저장소면 `origin` URL이
  선언된 URL과 일치할 때만 pull(fast-forward만)로 갱신한다. origin이 다르면 엉뚱한 원격을
  당기지 않도록 실패로 기록하고 건너뛴다. 커밋 안 된 로컬 변경이 있으면 pull을 건너뛰고
  경고를 출력하되, 그 폴더는 `NOTES_DIR` 조립에 정상 포함한다.
  → goal: Expected outcome (멱등), Risks (로컬 변경·엉뚱한 저장소)

- **FR-8 (경로 충돌 보호)**: 대상 경로에 git 저장소가 아닌 폴더/파일이 이미 있으면 절대
  덮어쓰지 않는다 — 해당 항목만 실패로 기록하고 건너뛴 뒤 나머지를 계속 진행한다.
  → goal: Risks (경로 충돌)

- **FR-9 (부분 실패 격리)**: 어느 항목의 검증·clone·pull이 실패해도 그 항목만 실패로 기록하고
  나머지 저장소는 계속 처리한다. 인증 실패로 보이는 경우 SSH 키/로그인 확인을 평이한 한국어로
  안내한다.
  → goal: Success metrics, Risks (인증 실패 UX)

- **FR-10 (NOTES_DIR 조립)**: 성공한 저장소들의 `라벨=경로`에 기본 노트 폴더
  (`localmind=$HOME/.localmind`)를 앞에 붙여 `NOTES_DIR`를 조립한다. 라벨은 FR-3으로 `,`·`=`가
  배제되므로 조립 문자열에 의도치 않은 항목이 주입될 수 없다.
  → goal: Objective

- **FR-11 (MCP 등록 연계·덮어쓰기 명시)**: 조립한 `NOTES_DIR`로 `scripts/mcp-install.sh`를
  호출해 등록한다. 성공한 저장소가 하나도 없으면 등록 단계로 넘어가지 않는다(기존 등록을 빈
  목록으로 덮어쓰지 않음). 등록은 remove 후 add라 기존 등록을 통째로 재작성하므로, 수동으로만
  추가했던 `NOTES_DIR` 폴더는 사라진다 — 이 성격을 실행 중 안내와 문서(FR-14)로 명시한다.
  mcp-install 호출의 exit code를 포착해, 실패해도 FR-13 요약이 반드시 출력되게 한다.
  → goal: Objective, Constraints (mcp-install 재사용), Expected outcome (덮어쓰기 인지)

- **FR-12 (자격증명 마스킹)**: 요약·에러 출력에서 저장소를 식별할 때 URL의 자격증명
  (`user:token@`의 userinfo)을 마스킹한다(`https://***@host/...`). git stderr를 그대로
  전달하는 경우에도 마스킹을 적용한다.
  → goal: Risks (자격증명 유출)

- **FR-13 (요약 출력·순서 보장)**: 등록 성공·실패와 무관하게 마지막에 저장소별 결과
  (연결됨/pull 건너뜀/실패+사유)와 최종 `NOTES_DIR` 값을 요약 출력한다. 하나라도 실패가
  있으면(등록 실패 포함) exit code는 0이 아니어야 한다.
  → goal: Risks (부분 실패의 침묵)

- **FR-14 (준비물 점검)**: 실행 시작 시 `git` 존재를 점검하고, 없으면 설치 안내와 함께
  중단한다(exit 1).
  → goal: Constraints

- **FR-15 (문서화)**: `.env.example`에 `NOTES_REPOS`·`NOTES_REPOS_DIR` 항목과 설명 주석을,
  README(또는 `docs/faq.md`)에 새 기기 셋업 흐름("clone → .env 복원 → make setup(또는
  make notes-connect)"), 등록 덮어쓰기 성격, 토큰-in-URL 대신 SSH 키/credential helper 권장을
  추가한다. 예시에는 실제 개인 계정·절대경로 대신 플레이스홀더(`<user>`)를 쓴다.
  → goal: Problem (기억에 의존하는 셋업 제거), Risks (자격증명 유출)

- **FR-16 (make setup 통합)**: `make setup`의 연결 점검 단계(현재 `scripts/setup.sh`가
  `make mcp-install`을 제안·실행하는 자리, `setup.sh:157-167`)를 `NOTES_REPOS` 유무로 분기한다.
  - **감지는 "비어있지 않음" 기준**: `NOTES_REPOS`를 env→`.env` 폴백으로 읽은 뒤 **값이
    비어있지 않을 때만** notes-connect 경로로 판정한다(`.env.example`이 `NOTES_REPOS=` 빈 값을
    싣기 때문에 "라인 존재"로 판정하면 안 됨 — 안 그러면 미설정 사용자가 잘못된 분기를 탄다).
  - **미설정 시**: 기존 `setup.sh` 동작을 한 줄도 바꾸지 않고 보존한다(회귀 없음) — 기본
    `NOTES_DIR=$HOME/.localmind`로 `mcp-install` 제안.
  - **설정 시(이미 등록 여부와 무관)**: `notes-connect`(재)연결을 제안·실행한다. 현재
    `setup.sh`는 `claude mcp list`에 localmind가 있으면 연결 단계를 통째로 건너뛰는데
    (`setup.sh:158-159`), `NOTES_REPOS`가 있으면 **이미 등록돼 있어도** "저장소 갱신/재연결"
    제안이 노출돼야 한다(그래야 "등록 후 NOTES_REPOS 추가 → 재실행" 시나리오가 동작).
    기존 UX 규약 유지 — 강제 실행 없이 `confirm`(기본 '아니오', 비대화·DRY_RUN은 건너뜀).
  - **전부 실패 폴백**: notes-connect 실행 후에도 localmind가 미등록이면(전 저장소 clone 실패
    등), 기본 단일 폴더 `mcp-install`로 폴백 제안하거나 미등록 상태·재시도 방법을 명확히
    안내한다 — 레거시 경로보다 나빠지지 않게 한다.
  - **`claude` CLI 부재 시**: 분기는 `claude`가 있는 경로 안에서만 동작한다. `claude`가 없으면
    기존 `setup.sh` 동작(설치 안내 경고)을 그대로 유지하고 notes-connect를 실행하지 않는다
    (clone은 무의미하지 않으나 등록 단계가 실패하므로, 안내에 `NOTES_REPOS` 설정 시
    `make notes-connect`를 나중에 실행하라는 힌트만 덧붙인다).
  - **위임·비노출·비실행 불변식(보안)**: setup은 `NOTES_REPOS`를 분기 판정(set/unset)에만
    쓰고, git·notes-connect에 인자로 넘기지 않으며 모든 git 동작은 notes-connect.sh에 위임한다
    (검증은 전적으로 notes-connect.sh). `.env` 읽기는 **비실행** 방식(`grep -E '^NOTES_REPOS='
    | cut -d= -f2-`, FR-5와 동일)만 쓰고 `source`/`eval`/`export $(...)`를 쓰지 않는다.
    setup은 `NOTES_REPOS` **값을 화면에 출력하지 않는다**(존재 여부·개수만) — 저장소 식별을
    표시해야 하면 FR-12와 동일한 자격증명 마스킹을 적용한다.
  → goal: Objective (setup 통합), Expected outcome, Risks (setup 통합의 회귀·자격증명 유출)

- **FR-17 (NOTES_REPOS_DIR 검증)**: `NOTES_REPOS_DIR`도 `.env`에서 오는 신뢰 불가 입력이다.
  절대경로여야 하며, 물리 경로가 `$HOME` 하위가 아니거나 알려진 민감 디렉토리
  (`~/.ssh`·`~/.config`·`~/.claude` 등)로 해석되면 거부하고 기본값 `$HOME/localmind-notes`로
  폴백하며 경고한다. FR-3의 "clone 대상이 `NOTES_REPOS_DIR` 하위인지" 재검증은 이 검증된
  base를 기준으로 한다.
  → goal: Risks (라벨을 통한 경로 탈출 — base 자체도 공격 입력)

## Acceptance Criteria

- **AC-1 (opt-in 회귀 없음)**: Given `NOTES_REPOS`가 env에도 프로젝트 `.env`에도 없는 상태에서,
  When `make notes-connect`를 실행하면,
  Then 설정 예시 안내가 출력되고 exit 0으로 종료되며, clone·MCP 등록 등 어떤 부수 효과도 없다.

- **AC-2 (`.env` 폴백)**: Given `NOTES_REPOS`가 환경변수로는 비어 있지만 프로젝트 `.env`에
  선언돼 있을 때,
  When `make notes-connect`를 실행하면,
  Then `.env`의 값이 사용돼 저장소가 처리된다(headline 새 기기 흐름이 실제로 동작).

- **AC-3 (신규 clone)**: Given `NOTES_REPOS="work=<로컬 bare repo 경로>"`이고
  `$NOTES_REPOS_DIR/work`가 없을 때,
  When 실행하면,
  Then 해당 경로로 clone되고 조립된 `NOTES_DIR`에 `work=$NOTES_REPOS_DIR/work`가 포함된다.

- **AC-4 (라벨 생략)**: Given 항목이 URL만으로 지정됐을 때(예 `.../my-notes.git`),
  When 실행하면,
  Then 라벨은 저장소 이름(`my-notes`)이 되고 그 이름의 폴더로 clone된다.

- **AC-5 (엣지 — URL 스킴 거부)**: Given `NOTES_REPOS="x=ext::sh -c touch\ /tmp/pwned"` 또는
  `NOTES_REPOS="x=--upload-pack=touch /tmp/pwned"`일 때,
  When 실행하면,
  Then 어떤 clone도 시도되지 않고(`/tmp/pwned` 미생성) 해당 항목은 실패로 기록되며, 평이한
  한국어 경고가 출력된다.

- **AC-6 (엣지 — 라벨 경로 탈출 거부)**: Given `NOTES_REPOS="../../escape=<정상 repo>"`
  (또는 유도된 이름이 `..`가 되는 URL)일 때,
  When 실행하면,
  Then `NOTES_REPOS_DIR` 밖의 어떤 경로도 생성·변경되지 않고 해당 항목은 실패로 기록된다.

- **AC-7 (엣지 — 라벨 charset 위반)**: Given 라벨에 `/`·`,`·`=`·공백이 포함되거나 빈 라벨
  (`=url`)일 때,
  When 실행하면,
  Then 해당 항목은 실패로 기록되고 조립된 `NOTES_DIR`에 의도치 않은 항목이 추가되지 않는다.

- **AC-8 (엣지 — 라벨 중복)**: Given 두 항목이 같은 라벨(또는 예약 라벨 `localmind`)로
  매핑될 때,
  When 실행하면,
  Then 먼저 나온 항목만 처리되고 겹치는 항목은 실패로 기록되며, `NOTES_DIR`에 중복 항목이
  없다.

- **AC-9 (멱등 pull)**: Given 대상 경로에 같은 origin의 저장소가 clone돼 있고 원격에 새 커밋이
  있을 때,
  When 다시 실행하면,
  Then pull로 갱신되고 결과 요약에 해당 항목이 성공으로 표시된다.

- **AC-10 (엣지 — origin 불일치)**: Given 대상 경로에 선언된 URL과 다른 origin의 git 저장소가
  있을 때,
  When 실행하면,
  Then pull하지 않고 해당 항목을 실패로 기록하며 기존 저장소는 변경되지 않는다.

- **AC-11 (엣지 — 로컬 변경 보존)**: Given 이미 clone된 저장소에 커밋 안 된 로컬 변경이 있을 때,
  When 실행하면,
  Then pull은 수행되지 않고 로컬 변경은 보존되며, 경고가 출력되되 해당 폴더는 `NOTES_DIR`에
  정상 포함된다.

- **AC-12 (엣지 — 비git 경로 충돌)**: Given 대상 경로에 git 저장소가 아닌 폴더가 이미 있을 때,
  When 실행하면,
  Then 그 폴더 내용은 변경되지 않고 해당 항목은 실패로 요약되며, 다른 정상 항목은 계속 처리된다.

- **AC-13 (엣지 — 접근 불가 저장소, 비대화 실패)**: Given 목록에 접근 불가한 URL(존재하지 않는
  로컬 경로 등)과 정상 URL이 섞여 있을 때,
  When 실행하면,
  Then 정상 항목은 연결되고 접근 불가 항목은 (프롬프트로 행에 빠지지 않고) 실패로 기록되며,
  exit code가 0이 아니고 실패 사유가 평이한 한국어로 출력된다.

- **AC-14 (엣지 — 전부 실패 시 등록 보호)**: Given 모든 항목의 clone이 실패했을 때,
  When 실행하면,
  Then MCP 등록 단계는 수행되지 않고(기존 등록 불변) 실패 요약과 함께 0이 아닌 exit code로
  종료된다.

- **AC-15 (NOTES_DIR 조립 규칙)**: Given 두 저장소가 성공적으로 준비됐을 때,
  When `NOTES_DIR`가 조립되면,
  Then 값은 `localmind=$HOME/.localmind,<라벨1>=<경로1>,<라벨2>=<경로2>` 형식이며 이 값이
  `mcp-install.sh` 호출에 전달된다.

- **AC-16 (등록 실패에도 요약)**: Given clone은 성공했으나 mcp-install이 실패할 때(예: `claude`
  CLI 없음),
  When 실행하면,
  Then 저장소별 요약과 최종 `NOTES_DIR`가 여전히 출력되고, exit code는 0이 아니다.

- **AC-17 (자격증명 마스킹)**: Given URL에 `user:token@`가 포함돼 있을 때,
  When 실행하면,
  Then stdout·stderr 어디에도 토큰이 평문으로 나타나지 않는다(`***`로 마스킹).

- **AC-18 (git 없음)**: Given `git` 명령이 없는 환경에서,
  When 실행하면,
  Then 설치 안내가 출력되고 exit 1로 종료된다.

- **AC-19 (문서화)**: Given 구현 완료 후,
  When `.env.example`·README(또는 `docs/faq.md`)를 확인하면,
  Then `NOTES_REPOS`·`NOTES_REPOS_DIR` 키와 플레이스홀더 예시, 새 기기 셋업 흐름, 등록
  덮어쓰기 안내, 토큰-in-URL 경고가 존재한다(리뷰로 검증 — 테스트 대신 체크리스트).

- **AC-20 (setup 통합 — 분기, 이미 등록 여부 무관)**: Given `NOTES_REPOS`가 비어있지 않게
  설정되어 있고 localmind가 **이미 MCP 등록돼 있을** 때,
  When `make setup`의 연결 단계에 도달하면,
  Then 기본 단일 폴더 `mcp-install`이 아니라 `notes-connect`(재)연결이 제안되고(confirm 시
  실행), `NOTES_REPOS`의 저장소들이 포함된 `NOTES_DIR`로 등록이 갱신된다. (이미 등록됐다는
  이유로 건너뛰지 않는다.)

- **AC-21 (setup 통합 — 회귀 없음, 빈 값 포함)**: Given `NOTES_REPOS`가 미설정이거나 `.env`에
  빈 값(`NOTES_REPOS=`)으로만 있을 때,
  When `make setup`을 실행하면,
  Then 연결 단계는 기존과 동일하게 기본 `NOTES_DIR=$HOME/.localmind`로 `mcp-install`을
  제안하며(notes-connect 분기를 타지 않음), 다폴더 등록을 단일 폴더로 되돌리는 등의 동작
  변화가 없다.

- **AC-22 (setup 통합 — 전부 실패 폴백)**: Given `NOTES_REPOS`는 설정됐으나 모든 저장소 clone이
  실패해 notes-connect가 아무것도 등록하지 못했을 때,
  When `make setup`이 그 뒤를 이으면,
  Then localmind가 미등록으로 방치되지 않는다 — 기본 단일 폴더 `mcp-install` 폴백이 제안되거나
  미등록 상태·재시도 방법이 명확히 안내된다(레거시보다 나빠지지 않음).

- **AC-23 (setup 통합 — 자격증명 비노출)**: Given `.env`의 `NOTES_REPOS`에 `user:token@`가
  포함돼 있을 때,
  When `make setup`이 연결 단계를 지나면,
  Then stdout·stderr 어디에도 토큰이 평문으로 나타나지 않는다(setup은 값을 출력하지 않거나
  FR-12 마스킹을 적용).

- **AC-24 (setup 통합 — 비실행 읽기)**: Given `.env`에 `NOTES_REPOS=$(touch /tmp/pwned)` 또는
  `NOTES_REPOS=x; touch /tmp/pwned` 같은 셸 표현이 들어 있을 때,
  When `make setup`이 분기 판정을 위해 `.env`를 읽으면,
  Then 그 명령이 실행되지 않는다(`/tmp/pwned` 미생성) — `source`/`eval`이 아닌 `grep|cut`
  비실행 읽기이기 때문.

- **AC-25 (NOTES_REPOS_DIR 검증)**: Given `NOTES_REPOS_DIR`가 `$HOME` 밖 또는 민감
  디렉토리(예 `~/.ssh`)로 설정됐을 때,
  When notes-connect(또는 setup 경유)가 실행되면,
  Then 그 값은 거부되고 기본 `$HOME/localmind-notes`로 폴백하며 경고가 출력된다(민감
  디렉토리에 clone하지 않는다).

## Open questions

- 기본 노트 폴더(`localmind=$HOME/.localmind`)를 항상 포함할지, `NOTES_REPOS`만 쓰는
  사용자를 위해 제외 옵션이 필요한지 — 우선 항상 포함(mcp-install 기본값과 일관)으로 진행.
- 로컬 파일시스템 경로를 URL로 허용하는 범위(절대경로만? `~` 확장?) — plan에서 확정하되,
  FR-2의 "`-` 시작 거부"와 상충하지 않게 한다.
- 자격증명 마스킹 정규식이 놓치는 URL 형태가 있는지는 구현 중 실제 git 출력으로 확인 —
  마스킹 실패 시에도 토큰이 노출되지 않도록, 요약에는 원본 URL 대신 라벨을 우선 노출한다.
- `NOTES_REPOS` 읽기·자격증명 마스킹이 `notes-connect.sh`와 `setup.sh` 두 곳에 필요하다 —
  drift를 막기 위해 공용 헬퍼(예: `scripts/lib/read-env.sh` + `mask_url()`)로 뽑는 것을 기본
  방향으로 한다(FR-16의 비실행·비노출 불변식을 한 곳에서 강제). 구현 시 중복 규모를 보고
  인라인 대안을 택할 수 있으나, 두 사이트의 규칙은 반드시 동일해야 한다.
- `make recover`(백업 복원) 흐름에도 같은 분기를 넣을지는 후속 스펙으로 미룬다(이번엔 setup만).
