# Spec: Device Sync Pipeline (기기 동기화 파이프라인)

상위: [goal](goal.md)

## Scope

(1) 주 기기 발신 오케스트레이터 `make device-sync HOST=<라벨|호스트>` — CI 게이트 →
백업 → 원격 코드 pull → 원격 수신(노트 pull + 배포 + 검증)의 순서·fail-fast·부분 완료
보고, (2) 원격 수신 워커 스크립트(원격 자체 `.env`로 경로 자기 해석 — 주 기기는 원격
노트 경로를 몰라도 됨), (3) 설정 스키마(`.env`의 `SYNC_DEVICES`·`SYNC_ENV_PREP`)와
미설정 안내, (4) 파괴 방지 불변식(`--ff-only`·읽기 전용 검증·자동 merge 금지),
(5) ssh/gh/npm 모의 기반 테스트 + 실기기 수동 스모크 분리.

## Context

- **실측 6단계(회고)**: ①CI green(주) → ②`make backup`(주) → ③원격 localmind repo
  `git pull`(ssh) → ④원격 노트 저장소 `git pull`(ssh) → ⑤원격 `seed.test.ts` +
  `agents:deploy`(ssh) → ⑥원격 정본·배포 검증 grep(ssh). ①②는 주 기기 로컬, ③~⑥은
  원격 ssh. 즉 **주 기기 오케스트레이션 + 원격 자기 기술** 구조다.
- `scripts/backup.sh`: 부분 완료 보고(`FAILURES` 누적 → 말미 요약 + 비0), pull 거부
  시 "pull 후 `make backup` 재실행" 안내(105-107행). device-sync는 이 문체·비0 규약을
  계승하되, 의존 체인은 015의 "계속"이 아니라 fail-fast(깨진 전파 금지)로 갈린다.
- `Makefile` backup(114-118)·restore(166-184)·recover(185-187)·reindex(124-126)
  타깃. device-sync는 이들을 재구현하지 않고 원격에서 재사용/호출한다.
- `scripts/recover.sh`: `set -euo pipefail`, 6단계 중 스택 기동·헬스 대기(127-144)·
  메모리 import(146-153)·reindex(155-168)는 **스택 의존**이라 device-sync 범위 밖이다.
  recover가 gh 자동탐색·폴백(100-118)에서 쓰는 `command -v gh … gh auth status` 패턴을
  CI 게이트에 계승한다.
- `scripts/lib/read-env.sh`: `read_env_val`(비실행 grep 파싱 — 복원 `.env`의 RCE 차단),
  `mask_url`(자격증명 마스킹). device-sync가 `SYNC_DEVICES`를 읽을 때 재사용한다.
- `scripts/lib/notes-dir.sh`: `resolve_notes_dir`·`notes_dir_paths`·`canon_path` —
  **`NOTES_DIR`만 해석한다**(`NOTES_REPOS` 파싱은 notes-connect.sh 소유 — 리뷰 중대-2
  교정). 원격 수신 워커의 노트 pull 대상은 **"`notes_dir_paths(resolve_notes_dir)`로
  열거한 노트 폴더 중 git 워크트리인 것"**으로 정의한다(backup이 노트를 다루는 방식과
  정합) — 주 기기는 원격 경로를 몰라도 된다.
- `scripts/notes-connect.sh`(1-24): 비대화 git(`GIT_TERMINAL_PROMPT=0`,
  `GIT_SSH_COMMAND=ssh -oBatchMode=yes`), 입력 신뢰 불가 취급·검증 후 git 전달. ssh
  인증·입력 검증 관례를 계승한다. `.env.example` `NOTES_REPOS`(78-88)는
  "라벨=값,라벨=값" 구조를 한 키에 담는 선례 — `SYNC_DEVICES`가 이를 따른다.
- `scripts/device-sync-e2e.test.sh`(019): 임시 HOME + 로컬 bare repo + 가짜 `npm`(
  export는 파일 생성, 배포는 호출 기록), `assert`가 pipefail 없이 직전 `$?` 보존(
  SIGPIPE 플레이키 방지). CI 실행. device-sync 테스트는 여기에 **가짜 `ssh`·`gh`**를
  더한다(원격 명령을 로컬 "원격" 디렉토리에서 실행하는 스텁).
- `src/agents/deploy.ts:14`: `MANAGED_MARKER = "managed-by: localmind"` — 배포 산출물의
  표식. 검증(⑥) 표준 = 배포 대상 폴더에서 이 마커 존재 확인(결정적·읽기 전용).
- `package.json` scripts: `agents:deploy`·`skills:deploy`·`build`·`test`(=
  `node --import tsx/esm --test src/*.test.ts src/agents/*.test.ts`). seed 단독 검증은
  `node --import tsx/esm --test src/agents/seed.test.ts`(수 초) — 전체 `npm test`(수
  분·스택 무관 단위지만 광범위)와 구분한다.
- `.env.example`(85-87): `NOTES_REPOS`/`NOTES_REPOS_DIR`. 신규 키는 이 아래
  "기기 동기화" 섹션으로 추가한다.

## Functional Requirements

- **FR-1 (오케스트레이터 + 순서 + fail-fast + 부분 완료 보고)**:
  `make device-sync HOST=<라벨|호스트>`가 아래 의존 순서로 단계를 실행한다:
  ① CI 게이트(FR-2) → ② 주 기기 백업(FR-3) → ③ 원격 코드 pull(FR-4) → ④ 원격 수신(
  FR-5). 앞 단계가 하드 실패하면 이후를 **중단**하고, backup.sh 문체로 "어디까지
  됐는지"(성공 단계 나열)와 실패 단계·처방을 요약한 뒤 비0으로 종료한다. 전 단계
  성공 시 "동기화 완료" 요약 + 0 종료.
  - 전제: localmind **코드 push는 device-sync 이전에 완료**돼 있다(/goal 규약 7 완료
    또는 수동 push). device-sync는 코드를 push하지 않고, ①에서 그 커밋의 CI만 확인한다.
  → goal: Objective, Problem(순서 손 엮임), Success metrics(순서·부분 실패 보고)

- **FR-2 (CI 게이트 — gh 확인·부재 폴백)**: ①에서 전파 대상 커밋(현재 `HEAD`의 sha)의
  CI 결론을 `gh`로 확인한다 — 조회 대상 repo는 **현재 디렉토리의 origin**(localmind
  체크아웃)이다(리뷰 경미-10 명시).
  - green(해당 sha의 최신 run이 success)이면 다음 단계로 진행한다.
  - green이 아니면(실패·진행 중·해당 sha의 run 없음) 원격 전파를 **보류**하고
    "CI 미통과/미확인 — 원격 전파를 멈췄어요" 안내 + 비0으로 종료한다(② 이후 미실행).
  - `gh` 미설치 또는 미인증이면 CI 확인을 **건너뛴다는 경고**를 출력하고 ② 이후를
    계속 진행한다(게이트는 스킵, 종료 코드는 나머지 단계에 따름). recover의
    `command -v gh … gh auth status` 패턴 계승.
  - `SYNC_SKIP_CI=1`이면 gh가 있어도 게이트를 건너뛴다(명시 opt-in — 경고 출력).
  → goal: Problem(CI 의존·미설치 폴백), Risks(CI 오탐 — sha 일치)

- **FR-3 (백업 단계 — 하드/소프트 분리, 재검 중대-A)**: ②에서 주 기기의 `make backup`을
  **비대화**로 실행한다(backup.sh는 비-tty에서 자동 진행). backup.sh의 실패는 두 급이다 —
  **하드**(BACKUP_DIR 코어: 커밋·push 거부 — 원격이 빈/오래된 정본을 받게 됨)와
  **소프트**(메모리 export 실패 — 가장 흔한 원인은 스택 꺼짐이며 backup.sh 스스로
  소프트로 설계함. 게다가 메모리는 이 파이프라인의 Non-goal). 종료 코드가 이진이면
  구분 불가하므로 **backup.sh에 구조적 신호를 추가한다: 코어 실패 = exit 2, 소프트만
  실패 = exit 1, 성공 = 0**(하위호환 — 기존 소비자는 비0 여부만 보므로 불변).
  **코어(exit 2)의 집합은 "BACKUP_DIR의 커밋·push 실패"에 한정**한다(최종 확인 경미-G) —
  메모리·개인설정(extras)·자산(assets)·쿼리로그 등 콘텐츠 하위 단계 실패는 전부
  소프트(exit 1)다. 단 **자산 백업이 소프트 실패하면** 미러가 stale이라 원격
  restore-assets가 stale 페르소나를 배포할 수 있다 — device-sync 경고에 이 영향
  ("페르소나 동기화가 이번엔 완전하지 않을 수 있음")을 명시한다(비파괴이나 목표 미달의
  정직한 표면화). device-sync는 exit 2면 **중단** + 보고 + 비0, exit 1이면 **경고 +
  ③ 이후 계속**(최종 종료 코드에만 반영), 0("변경 없음" 포함 — 멱등)이면 계속.
  **②b(리뷰 중대-3·재검 경미-C 확정)**: 주 기기의 노트 폴더 중 `BACKUP_DIR` 밖 git
  워크트리들도 push를 시도한다 — 이 실패는 **소프트**다(경고 + 해당 저장소 stale 가능
  명시 + ③ 이후 **계속** + 최종 비0. 본절의 하드 중단과 구분 — FR-5 수신과 대칭).
  → goal: Problem(backup 전 원격 pull 위험), Constraints(의존 체인 fail-fast)

- **FR-4 (원격 코드 pull — ff-only)**: ③에서 원격 localmind repo에 대해
  `git -C <원격경로> pull --ff-only`를 ssh로 실행한다. 성공이면 ④로 진행한다.
  fast-forward 불가(원격에 로컬 커밋 존재 등)면 그 repo를 **건드리지 않고**
  "원격에서 직접 해결(예: 원격에서 커밋 정리 후 재시도)" 안내 + 중단 + 비0. 원격에
  localmind repo가 아예 없으면(부재) "이 기기는 먼저 `make recover`가 필요해요" 안내 +
  중단 + 비0.
  → goal: Problem(ff 불가 실측), Constraints(파괴 방지·자동 merge 금지)

- **FR-5 (원격 수신 워커 — 노트 pull + 검증 + 배포 + 재검증)**: ④는 원격에서
  수신 워커 스크립트를 실행한다(주 기기가 ssh로 `cd <원격경로> && <워커>`). 워커는
  **원격 자체 `.env`**로 경로를 자기 해석한다(주 기기는 원격 노트 경로를 모른다):
  - **노트 수신**: 원격 `.env` 기준 — `BACKUP_DIR`(remote 있으면)과, `notes_dir_paths(
    resolve_notes_dir)`로 열거한 **노트 폴더 중 git 워크트리인 것**들에 대해
    `git pull --ff-only`(리뷰 중대-2 교정 — NOTES_REPOS 문자열 파싱이 아니라 폴더 실사
    기준). 저장소들은 **서로 독립**이므로 015 정책 — 하나가 ff 불가여도 나머지는 계속,
    실패는 요약에 자산별로 명시 + 비0.
  - **빌드**: `dist/mcp.js`가 없거나 **dist가 src보다 오래됐으면**(워커 자족 판정 —
    재검 경미-F: ③은 별 프로세스라 "HEAD 전진" 신호 전달이 복잡함. `find src -newer
    dist/mcp.js` 류 mtime 비교로 단순화, build는 멱등이라 과잉 빌드 무해) `npm run
    build`. build 실패면 이후(test·deploy) 미실행 + 비0(빌드는 test·deploy의 전제).
  - **레지스트리 검증 게이트**: `node --import tsx/esm --test src/agents/seed.test.ts`
    (seed만 — 수 초). 실패면 깨진 레지스트리를 배포하지 않도록 **배포 미실행** +
    보고 + 비0. (전체 `npm test`는 CI(①)가 push 시점에 이미 게이트했으므로 원격에서
    재실행하지 않는다 — 근거는 Context. `SYNC_TEST_CMD`로 재정의 가능.)
  - **자산 복원 + 배포**: bare `agents:deploy`가 아니라 **`restore-assets.sh`**(019의
    자산 복원 경로 — 미러(`BACKUP_DIR/agents`·`skills`)→레지스트리 복사·삭제 전파·배포
    포함)를 호출한다(리뷰 중대-1: 미러 구성 — 019 e2e의 주 시나리오 — 에서 bare deploy는
    갱신 안 된 레지스트리를 재배포해 주 기기의 페르소나/스킬 변경·삭제가 전파되지
    않는다). memory-import·reindex는 여전히 범위 밖(Non-goal 유지 — restore-assets는
    자산만 다루므로 정합). 실패는 015 — 경고 + 요약 + 비0.
  - **배포 검증**: 배포 대상에 `managed-by: localmind` 마커 존재를 확인(읽기 전용
    grep). 미검출이면 경고 + 비0.
  - 워커는 자체 요약(성공/실패 단계)을 stdout으로 내고, 종료 코드로 성패를 전한다 —
    오케스트레이터는 이를 ④의 결과로 흡수해 최종 요약에 합친다.
  → goal: Objective(배포까지·검증), Success metrics(마커 존재·단계별 실패 보고)

- **FR-6 (설정 스키마 + HOST 해석 + 미설정 안내 + 시크릿 없음)**:
  - `.env`의 `SYNC_DEVICES="라벨=ssh호스트:원격_localmind_경로,..."`(`NOTES_REPOS`와
    같은 "라벨=값" 구조, `read_env_val`로 비실행 파싱). `make device-sync HOST=<라벨>`은
    이 목록에서 라벨을 찾아 host·경로를 해석한다.
  - **값 분리 규칙(리뷰 경미-10)**: `라벨=host:경로`는 **첫 `=`로 라벨, 그다음 첫
    `:`로 host/경로를 분리**한다(NOTES_REPOS의 scp형 콜론 선례와 동일 — host에 콜론
    포트는 미지원, ssh config 별칭 사용 안내).
  - **HOST 판별**: `HOST` 값이 SYNC_DEVICES의 라벨과 일치하면 라벨로 해석한다. 일치하지
    않으면 raw host로 취급해 `REMOTE_DIR=<원격경로>`를 함께 요구하되(없으면 안내 + 비0),
    SYNC_DEVICES가 비어 있지 않으면 "등록된 라벨: … — 오타는 아닌가요?" 힌트를 병기한다
    (미지 라벨의 오도 에러 방지 — 리뷰 경미-10).
  - SYNC_DEVICES에 라벨이 하나뿐이면 `HOST` 생략 시 그것을 쓴다. **라벨이 2개
    이상인데 `HOST` 생략이면 어느 기기인지 명시를 요구하는 안내 + 비0**(무정의 동작
    금지 — 리뷰 중대-4. 복수 기기 순차 sync는 Open question).
  - **검증 순서(리뷰 경미-8)**: HOST·설정 해석과 검증은 ① CI·② backup보다 **먼저**
    수행한다 — 대상 없는 실행이 주 기기에 부작용(backup 커밋·push)을 남기지 않게.
  - **미설정 안내**: HOST 미지정 + SYNC_DEVICES 비어있음이면 원격을 **전혀 건드리지
    않고** 설정 예시(`.env`에 `SYNC_DEVICES=` 형식)를 평이한 한국어로 안내 + 비0.
  - **시크릿 없음**: 설정에 비밀번호·토큰을 담지 않는다 — ssh 인증은 키/agent
    (`GIT_SSH_COMMAND=ssh -oBatchMode=yes` 계승). 요약·에러에 host를 출력할 때
    자격증명이 섞이지 않는다.
  → goal: Objective(설정 일반화), Constraints(하드코딩·시크릿 금지)

- **FR-7 (원격 node 환경 — 로그인 셸 + 명시 탈출구)**: 원격 명령은 기본적으로 원격
  사용자의 로그인 셸 경유로 실행해 PATH를 얻는다. node가 로그인 셸에 노출되지 않는
  기기를 위해 `SYNC_ENV_PREP`(예: `export PATH="$HOME/.nvm/.../bin:$PATH"`)를 원격
  명령 앞에 주입한다. 원격에서 **node 실행이 실패하면**(`node --version`이 비0 — `command -v`가 아니라
  실행 가능 여부 기준: exit-127 부재 shim 결정화(AC-17)와 정합, 재검 중대-B) npm 단계
  (빌드·테스트·배포) **이전에** 중단하고 "`SYNC_ENV_PREP`로 원격 node 경로를 지정해 주세요" 안내 + 비0
  (파괴 없음). 특정 기기의 node 경로를 스크립트에 하드코딩하지 않는다.
  → goal: Problem(nvm PATH 미노출), Risks(node 환경 편차)

- **FR-8 (파괴 방지 불변식)**: device-sync의 모든 pull은 `--ff-only`, 모든 검증은
  읽기 전용(grep·test), 원격에 대해 `reset`/`merge`(비-ff)/`push --force`/파일 삭제를
  **하지 않는다**. ff 불가·부재·불확실은 전부 "멈추고 보고"로 처리한다.
  → goal: Constraints(파괴 방지 우선), Risks(백업 교차 병합)

## Acceptance Criteria

FR-1 (오케스트레이터):

- **AC-1** (성공 경로·순서): Given 스텁 `ssh`·`gh`·`npm`(모두 성공)과
  `SYNC_DEVICES="dev=host:<원격repo>"`, When `make device-sync HOST=dev`, Then
  ① CI 확인 → ② backup → ③ 코드 pull → ④ 수신이 이 순서로 실행되고, "동기화 완료"
  요약과 함께 0으로 종료한다.
- **AC-2** (fail-fast·부분 완료 보고): Given ②의 `make backup`이 비0(push 거부 스텁),
  When `make device-sync HOST=dev`, Then ③·④가 **실행되지 않고**, "①까지 완료 · ②
  실패" 취지의 부분 완료 요약 + 비0으로 종료한다.

FR-2 (CI 게이트):

- **AC-3** (CI red 중단): Given `gh`가 HEAD sha의 CI를 실패/진행 중으로 보고, When
  `make device-sync HOST=dev`, Then ② 이후가 실행되지 않고 "CI 미통과 — 전파 보류"
  안내 + 비0.
- **AC-4** (gh 부재 스킵): Given `gh` **부재 shim**(exit 127로 종료하는 스텁으로 덮음 —
  019 PATH prepend 관례에서 "shim 미설치"는 CI 호스트의 실 gh가 새어 나와 비결정,
  리뷰 중대-6. 구현은 `command -v` 단독이 아니라 실행 가능 여부로 부재를 판정한다),
  When `make device-sync HOST=dev`(나머지 스텁 성공), Then CI 확인을 건너뛴다는 경고 후
  ②~④가 진행되고 0으로 종료한다. Given `SYNC_SKIP_CI=1`(gh 있음), Then 게이트를
  건너뛴다는 경고 후 진행한다.

FR-3 (백업):

- **AC-5** (변경 없음은 계속): Given `make backup` 스텁이 "변경 없음"으로 0 종료,
  When `make device-sync HOST=dev`, Then ③ 이후가 정상 진행된다.
- **AC-5b** (소프트 실패는 계속 — 재검 중대-A): Given backup 스텁이 exit 1(소프트 —
  메모리 export 실패, 코어 push 성공), When `make device-sync HOST=dev`, Then 경고와
  함께 ③ 이후가 진행되고 최종 종료 코드는 비0이다. Given exit 2(코어 실패), Then
  AC-2와 동일하게 ③ 이후 미실행 + 중단.

FR-4 (원격 코드 pull):

- **AC-6** (ff 성공): Given 원격 localmind repo가 fast-forward 가능, When
  `make device-sync HOST=dev`, Then `git pull --ff-only`가 성공하고 ④ 수신이 실행된다.
- **AC-7** (ff 불가 중단): Given 원격 repo에 로컬 커밋이 있어 ff 불가, When
  `make device-sync HOST=dev`, Then 원격 repo가 변경되지 않고(HEAD 불변) "원격에서 직접
  해결" 안내 + ④ 미실행 + 비0. Given 원격에 localmind repo 부재, Then "먼저
  `make recover`" 안내 + 비0.

FR-5 (원격 수신 — 워커 단독 테스트, ssh 불필요):

- **AC-8** (수신 성공): Given 원격 `.env`에 노트 저장소 목록 + 각 저장소 ff 가능 +
  seed test 스텁 green + 배포 스텁, When 수신 워커 실행, Then 각 노트 저장소 pull →
  build(필요 시) → seed test → **restore-assets 경로**(미러→레지스트리 복사 +
  `agents:deploy`·`skills:deploy`) 순으로 실행되고 0 + 요약(재검 경미-D — bare deploy
  단독 호출 단언 금지).
- **AC-9** (노트 저장소 per-repo 계속): Given 노트 저장소 2개 중 1개가 ff 불가, When
  수신 워커, Then 가능한 저장소는 pull되고, 불가 저장소는 **불변**이며 요약에 자산별로
  명시 + 비0(다른 저장소·배포는 계속).
- **AC-10** (seed test 게이트): Given seed test 스텁이 비0, When 수신 워커, Then
  `agents:deploy`가 **실행되지 않고** "레지스트리 검증 실패" 보고 + 비0.
- **AC-11** (배포 검증 마커): Given 배포가 실행되고 배포 대상에 `managed-by: localmind`
  마커가 있음, When 수신 워커의 검증, Then 검증 통과. Given 마커가 없음, Then 경고 + 비0.
- **AC-11b** (미러 구성 자산 왕복 — 리뷰 중대-1): Given 019 e2e와 동일한 미러 구성
  (레지스트리가 `BACKUP_DIR` 밖 노트 폴더, `BACKUP_DIR/agents`는 미러) + 주 기기에서
  페르소나 1개 추가·1개 삭제 후 백업 반영, When 수신 워커, Then 원격 레지스트리와 배포
  산출물에 추가가 나타나고 삭제가 전파(prune)된다 — bare deploy가 아닌
  restore-assets 경로의 회귀 고정.
- **AC-12** (빌드 게이트): Given `dist/mcp.js` 부재, When 수신 워커, Then build가
  실행된 뒤 진행한다. Given build 스텁이 비0, Then test·deploy 미실행 + 비0.

FR-6 (설정):

- **AC-13** (라벨 해석): Given `.env`에 `SYNC_DEVICES="dev=host:/remote/localmind"`,
  When `make device-sync HOST=dev`, Then ssh 호출의 대상 host가 `host`, 원격 경로가
  `/remote/localmind`로 해석된다(스텁으로 확인).
- **AC-14** (미설정 안내): Given HOST 미지정 + SYNC_DEVICES 비어있음, When
  `make device-sync`, Then ssh가 **한 번도 호출되지 않고**, **`make backup`도 실행되지
  않으며**(주 기기 부작용 금지 — 리뷰 경미-8), 설정 예시가 포함된 안내 + 비0.
- **AC-14b** (복수 라벨 + HOST 생략 — 리뷰 중대-4): Given SYNC_DEVICES에 라벨 2개 +
  HOST 미지정, When `make device-sync`, Then 원격·backup을 건드리지 않고 "어느
  기기인지 지정" 안내(등록 라벨 나열) + 비0.
- **AC-15** (raw host + REMOTE_DIR): Given SYNC_DEVICES 무관, When
  `make device-sync HOST=user@host REMOTE_DIR=/remote/localmind`, Then 그 host:경로로
  진행한다. Given `HOST=user@host`인데 `REMOTE_DIR` 없음, Then 안내 + 비0.

FR-7 (원격 node 환경):

- **AC-16** (SYNC_ENV_PREP 주입): Given `SYNC_ENV_PREP="export PATH=/x:$PATH"`, When
  `make device-sync HOST=dev`, Then 원격 명령 문자열 앞에 그 prep이 주입돼 전달된다
  (스텁 기록으로 확인).
- **AC-17** (node 부재 중단): Given 원격에서 node **부재 shim**(exit 127 스텁 — AC-4와
  동일한 결정화 방식, 리뷰 중대-6), When 수신 워커, Then npm 단계 이전에
  "`SYNC_ENV_PREP`로 node 경로 지정" 안내 + 비0(파괴 없음).

FR-8 (파괴 방지):

- **AC-18** (불변식): Given AC-7·AC-9의 ff 불가 상황 + **pass-through 로깅 git shim**
  (`GIT_LOG`에 전 하위명령 기록 후 실 git 실행 — 리뷰 중대-5: 가짜 ssh의 최상위 명령
  로그만으로는 워커 내부 git 호출을 못 잡고, ff 판정은 실 git이 필요하므로 기록+통과
  shim이 유일한 정합 방식), When device-sync, Then `GIT_LOG`에 `reset`/비-ff
  `merge`/`push --force`류 파괴 하위명령이 없고 대상 repo HEAD가 불변이다.

## Open questions (plan 단계 1 인터뷰에서 확정 — 6건)

1. **설정 위치** — `.env`의 `SYNC_DEVICES`(추천: 기존 `NOTES_REPOS` 선례·`read_env_val`
   재사용·백업에 안 실림) vs 별도 `devices.conf`/`~/.config`. 추천 확정 여부.
2. **CI 게이트 기본 강도** — green 아니면 중단(추천) vs 경고 후 계속. 사용자 판단.
3. **원격 검증 범위** — `seed.test.ts`만(추천·수 초) vs 전체 `npm test`(수 분).
4. **원격 node 기본 해석** — 로그인 셸 우선 + `SYNC_ENV_PREP` 탈출구(추천) vs 항상
   명시 요구. 사용자 기기 프로필 확인.
5. **복수 기기 순차 sync** — `HOST=all` 같은 전 기기 순차 동기화를 지원할지. 현재는
   단일 호스트 명시(중대-4 확정: 생략+복수면 안내+비0). 기기가 3대 이상으로 늘면 재론.
6. **/goal 규약 7 연결** — device-sync는 **명시 호출 전용**, 규약 7의 CI green 감시
   후에는 "device-sync로 원격 최신화 가능" **제안 문구까지만**(자동 실행 비목표 —
   goal Non-goals). 확정 여부.

## 확정 예정 사항 (인터뷰 반영 후 여기로 이동)

(plan 단계 1 완료 시 Open questions 6건을 확정 문구로 이관 — 019 spec의 "확정 사항"
절 관례 계승.)
