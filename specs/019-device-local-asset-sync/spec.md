# Spec: Device-Local Asset Sync (기기 로컬 자산 동기화 완결)

상위: [goal](goal.md)

## Scope

(1) 백업에 페르소나 레지스트리 + 스킬 정본 포함(첫 노트 폴더 위치 무관, 파괴 방지
가드 포함), (2) restore/recover에 자산 복원 + 배포 재실행 배선(016 FR-9의 의도적
개정), (3) 쿼리 로그 opt-in 백업 + 복원 시 병합(004 로컬 전용 제약의 opt-in 한정
완화), (4) `make doctor`의 `NOTES_DIR` 정합 점검, (5) `NOTES_DIR` 정본 단일화 +
셸 진입점 폴백, (6) recover의 전환 사전 안내.

## Context

- `src/agents/registry.ts:51-68`: 레지스트리 정본 판정 = `LOCALMIND_AGENTS_DIR`
  재지정 최우선 → 없으면 **첫 노트 폴더**의 `agents/`(NOTES_DIR 미설정 시
  `~/.localmind/agents`). `src/agents/skills.ts:29-32`: 스킬 정본도 동일 구조 —
  단 재지정 변수는 **`LOCALMIND_SKILLS_DIR`로 독립**이다. 012 멀티 repo 구성에서
  첫 폴더가 `BACKUP_DIR`와 다르면 둘 다 백업 범위 밖.
- `src/brain.ts:372`: 색인 제외가 `agentsDir()` **정확히 그 경로**만 — 미러 사본은
  제외되지 않는다(016 FR-10의 "페르소나는 검색에 안 섞임" 불변식에 영향). 색인
  프로세스(MCP 서버)는 `BACKUP_DIR`를 알 수 없다(mcp-install이 전달하는 env에
  없음) — 미러 식별은 env가 아니라 **미러 폴더 안의 마커 파일**로 한다(FR-1).
- `scripts/backup.sh`: `BACKUP_DIR`(기본 `~/.localmind`)에 `git add -A`. 기본
  구성에선 `agents/`·`skills/`가 우연히 포함되지만 보장이 아니다.
- `query-log.jsonl` 백업 제외는 **004의 결정**이다(specs/004 plan.md — backup
  `.gitignore` 시드에 추가). 근거는 파생물이 아니라 **프라이버시**("개인 검색
  패턴 — 로컬에만 보관 필수", 004 goal.md·`src/brain.ts:77` 주석). 019 FR-3/4는
  이 제약을 **사용자 opt-in에 한해 의도적으로 완화**한다(004 supersede — plan
  단계에서 004 문서에 개정 표기).
- `reports/`(brain-report 산출물, `scripts/brain-report.ts:61-63` — 첫 노트 폴더에
  기록)는 LLM 해석이 담긴 **재생성 불가 데이터**이자 검색 가능한 노트다 — 백업
  제외(gitignore 시드) 대상이 아니며 019는 건드리지 않는다.
- specs/016 spec.md **FR-9**: "복원이 배포를 자동 실행하지는 않는다(명시적 실행)"
  — 016의 명시적 결정. 2026-07-04 도그푸드에서 기기 복구 맥락의 함정으로 확인돼
  019 FR-2가 **복원 맥락에 한해** 뒤집는다(016 supersede — plan 단계에서 표기).
  016의 명시성 의도는 일상 편집 흐름에 대한 것으로, 기기 복구에는 "복원했으면
  쓸 수 있어야 한다"가 사용자 기대다.
- `Makefile` restore 타깃: pull/clone → `memory:import` → `restore-extras.sh` →
  재색인(`NOTES_DIR="${NOTES_DIR:-$(BACKUP_DIR)}"`). 재색인 실패는 `|| echo`로
  삼켜져 exit 0 — **의도된 등급**이다: 색인은 첫 검색 때 자동 인덱싱으로 자가
  치유되는 파생물이라 정보성 안내로 충분하다. 반면 019가 신설하는 배포 실패는
  자가 치유되지 않으므로(사용자가 명령을 다시 돌려야 함) 비0으로 보고한다 —
  같은 restore 안에서 실패 등급이 갈리는 근거다. `Makefile:226` 부근
  `NOTES_DIR ?=` 기본값이 레시피에 주입되면 `.env` 폴백을 가리는 함정.
- `scripts/recover.sh`: `set -euo pipefail`(6행), 6단계(사전점검→백업 내려받기→
  설치·빌드→스택 기동→메모리 복원→재색인) 중 **노트 저장소 연결(notes-connect)은
  없다** — 사용자가 별도로 실행하는 명령이며, recover가 `.env`를 `.env.example`
  에서 새로 생성하므로(58-61행) recover 시점에는 멀티 repo 구성의 첫 노트 폴더를
  원리적으로 확정할 수 없다. 따라서 자산의 "올바른 위치" 복원은 노트 연결 이후의
  `make restore`에서만 가능하다(FR-2의 recover 항 참조).
- `scripts/mcp-install.sh:8,71-75`: `NOTES_DIR`를 MCP 등록 env에만 기록(전달 env는
  OPENMEMORY_USER·NOTES_DIR·LITELLM_MASTER_KEY). `scripts/notes-connect.sh`는
  NOTES_DIR를 조립해 **mcp-install을 재사용**한다 — FR-6의 `.env` 기록을
  mcp-install에 구현하면 notes-connect 경로는 자동 충족된다(plan에서 테스트로
  확인). `scripts/doctor.sh`: 임베딩 전용 진단, 읽기 전용, 항상 `exit 0`(129행).
- `src/brain.ts:79`: 쿼리 로그 위치는 `QUERY_LOG` env로 재지정 가능(004 FR-3).
  004 FR-6: 30일 로테이션(`query-log-clean`).
- `src/agents/registry.ts:210`: 배포는 `.md`만 읽는다 — 그러나 `.bak-<ts>` 파일이
  자산 폴더에 남으면 미러·삭제 전파를 오염시키므로 별도 제외 규칙이 필요하다
  (FR-1/FR-2).
- 2026-07-04 도그푸드(기기 전환) 실측: 레지스트리 8파일 수동 scp, 미export 메모리
  3건, 쿼리 로그 수동 병합, 셸 `make reindex`가 5/1,090 파일만 조용히 색인.
- 기존 셸 테스트 관례: 임시 디렉토리 + 로컬 bare repo, 라이브 스택 불필요, CI 실행.

## 공통 가드 원칙 — 판정 불확정 시 파괴 금지

FR-1(백업 미러)과 FR-2(복원·삭제 전파)에 공통 적용한다: 자산 소스/대상 판정에
`NOTES_DIR`가 **실제로 사용**됐는데 그 값이 환경변수에도 `.env`에도 없어
**기본값으로 후퇴한 상태**에서는, 자산의 삭제·덮어쓰기를 진행하지 않는다(보류 +
경고 + 비0). 재지정 변수(`LOCALMIND_AGENTS_DIR`/`LOCALMIND_SKILLS_DIR`)로 판정이
확정된 자산은 후퇴가 아니므로 이 가드의 대상이 아니다(override 사용자의 정당한
미러를 막지 않는다). 후퇴 판정이라도 결과 경로가 `BACKUP_DIR` 하위와 일치하는
기본 구성은 애초에 미러·별도 복원이 필요 없으므로 역시 대상이 아니다. 경고에는 해결 명령(`.env`에 NOTES_DIR 설정
또는 `make mcp-install NOTES_DIR=...` 재실행)을 평이한 한국어로 포함하고, MCP
등록 값을 조회할 수 있으면 참고로 표시한다.

## Functional Requirements

- **FR-1 (자산 미러 백업 — 파괴 방지 가드 포함)**: `make backup`이 레지스트리
  폴더와 스킬 정본 폴더를 항상 백업에 포함한다.
  - 소스 판정은 코드와 동일한 단일 로직을 조회한다 — 레지스트리는
    `LOCALMIND_AGENTS_DIR` 재지정 → 첫 노트 폴더의 `agents/`, 스킬은
    `LOCALMIND_SKILLS_DIR` 재지정 → 첫 노트 폴더의 `skills/`. `NOTES_DIR` 해석은
    FR-6의 폴백(환경변수 → `.env`)을 공유한다.
  - 소스가 `BACKUP_DIR` 밖이면 `BACKUP_DIR/agents/`·`BACKUP_DIR/skills/`로
    미러(삭제 반영 복사)한 뒤 커밋한다. 경로 비교는 realpath 정규화 후 수행하며,
    소스가 `BACKUP_DIR` 안(기본 구성)이면 미러 단계를 건너뛴다(자기 복사 금지) —
    기존 `git add -A`로 충분. 이때 그 폴더에 과거 미러 시절의 `.localmind-mirror`
    마커가 남아 있으면 제거한다(멀티 repo → 기본 구성 전환 후 recover가 정본을
    미러로 오판하지 않도록 — 마커 수명주기).
  - `*.bak-*` 파일(FR-2의 보존본)은 미러 대상에서 제외한다 — 백업 repo로 실려
    가지 않는다.
  - 미러 폴더에는 마커 파일(`.localmind-mirror`)을 기록하고, 노트 색인은 마커가
    있는 폴더를 제외한다(`BACKUP_DIR`가 노트 폴더 목록에 포함된 구성에서 페르소나
    본문이 검색 결과에 섞이지 않도록 — 016 FR-10 불변식 유지. 마커 방식인 이유:
    색인 프로세스는 `BACKUP_DIR`를 모른다 — Context 참조).
  - **가드**(공통 가드 원칙의 FR-1 적용 — 아래 순서대로 판정하며, 미사용자
    스킵이 후퇴 가드에 **우선**한다):
    - 판정된 소스도 기존 미러도 없으면(자산 기능 미사용) 후퇴 여부와 무관하게
      조용히 건너뛴다 — 지킬 것도 오염시킬 것도 없다.
    - 해당 자산의 판정에 `NOTES_DIR`가 사용됐고(재지정 변수 미설정) 후퇴
      상태(환경변수·`.env` 모두 부재)이며 소스가 `BACKUP_DIR` 밖으로 판정되면,
      그 자산의 미러 단계를 진행하지 않고 경고 + 요약 + 비0.
    - 판정은 확정됐으나 소스 폴더가 부재/빈 폴더이고 **기존 미러가 존재**하면,
      삭제 반영을 거부하고 미러를 그대로 둔 채 경고 + 요약 + 비0. 경고에는
      **어느 자산이 비었는지**와 탈출구를 안내한다: 정말 그 자산을 모두 삭제한
      것이면 `BACKUP_CONFIRM_EMPTY_ASSETS=<자산명>`(예: `agents` — 복수는
      `agents,skills`)으로 해당 자산만 빈 상태 반영을 허용. 확인은 자산별로만
      적용된다(일괄 플래그로 다른 자산이 함께 지워지지 않는다).
    - (위 첫 항의 재확인) 미사용자의 조용한 스킵은 경고·비0 없음 — **하위호환**:
      019 이전과 동일하게 0 종료. `BACKUP_DIR`만 옮겨 쓰는 자산-미사용 사용자의
      cron 백업이 비0으로 바뀌지 않는다.
  - 그 외 실패는 015 정책(경고 후 계속 + 요약 + 비0).
  → goal: Objective, Problem(백업 범위 누락), Expected outcome(판정 확정 시에만
    파괴적 반영), Constraints(파괴 방지 우선·완전 하위호환·015 정책)

- **FR-2 (복원 후 자산 반영 + 배포 재실행 — 016 FR-9 개정)**: `make restore`가
  백업 repo의 `agents/`·`skills/`를 FR-1과 같은 판정 로직의 대상 폴더로 복원하고,
  `agents:deploy`·`skills:deploy`를 실행한다.
  - 복원 대상 파일이 로컬 기존 파일과 다르면 006 extras 패턴대로 기존 파일을
    `.bak-<ts>`로 보존한 뒤 덮어쓴다. `.localmind-mirror` 마커와 `*.bak-*` 파일은
    복원 대상이 아니다.
  - **삭제 전파**: 백업 repo에 해당 자산 폴더가 **존재할 때만**, 백업에 없는 로컬
    파일을 `.bak-<ts>`로 보존한 뒤 제거한다. 폴더 자체가 없으면(구버전 백업 등)
    아무것도 지우지 않는다. 로컬의 `*.bak-*` 파일은 삭제 전파 판정에서 제외한다
    (보존본이 재보존·제거되는 증식 루프 방지).
  - **가드**(공통 가드 원칙의 FR-2 적용 — FR-1과 같은 우선순위): 백업 repo에
    해당 자산 폴더가 없으면(자산 미사용) 가드 이전에 조용히 건너뛴다 — 복원할
    것이 없으므로 경고·비0 없음(0 종료, 하위호환). 자산 폴더가 있고 복원 대상
    판정이 `NOTES_DIR` 후퇴 상태이며 대상이 `BACKUP_DIR` 밖으로 판정되면, 자산
    복원·삭제 전파를 보류하고 안내 + 비0. 복원 대상과 백업 원본이 같은
    경로면(기본 구성) 파일 복사는 건너뛰고 배포만 실행한다.
  - **recover에서의 동작**: recover 시점에는 노트 저장소 연결(012 notes-connect)이
    아직 없고 `.env`도 새로 생성되므로 판정 입력이 항상 후퇴 상태다(Context 참조)
    — 경로 판정은 신뢰할 수 없다. 대신 **백업 repo 자산 폴더의 마커**로 구성을
    판정한다: `.localmind-mirror` 마커가 있으면 그 자산은 미러(정본이 다른 곳에
    있다는 백업 시점의 확실한 신호)이므로 recover는 복원·배포를 하지 않고 말미에
    순서를 안내한다: "노트 저장소를 연결(`make notes-connect`)한 뒤 `make
    restore`를 한 번 더 실행하면 페르소나·스킬이 올바른 위치로 복원됩니다."
    마커가 없으면(기본 구성 백업 — 자산이 `BACKUP_DIR` 정본) 파일 복사는 불필요
    하므로 배포만 실행한다. 이 보류는 실패가 아니라 설계된 2단 흐름의 1단이므로
    recover 종료 코드에 영향을 주지 않는다(노트·메모리 성공 시 0 유지) — 배포를
    실행했다가 실패한 경우만 비0이다. restore의 후퇴 가드(AC-13)에서도 백업
    자산에 마커가 있으면 같은 순서 안내를 문구에 포함한다.
  - 배포 실패는 경고 후 계속 + 요약 + 비0(노트·메모리 복원의 인질이 아님). 재색인
    실패가 정보성(exit 0)인 것과 등급이 갈리는 근거는 Context 참조(자가 치유
    여부). recover는 `set -e` 구조이므로 자산 단계를 실패 허용 블록으로 감싼다
    (plan).
  - 016 FR-9(복원≠배포)의 의도적 개정이다 — 근거는 Context 참조.
  → goal: Expected outcome(배포까지 완료·순서 안내), Problem(016 결정의 반전
    여부), Success metrics(목록 일치 — 삭제 반영 포함), Risks(로컬 수정본 보호)

- **FR-3 (쿼리 로그 opt-in 백업)**: `BACKUP_QUERY_LOG=1`일 때 `make backup`이
  쿼리 로그를 기기별 파일명 `query-log.<기기식별자>.jsonl`로 백업 repo에 커밋한다.
  - 로그 위치는 004와 동일하게 해석한다(`QUERY_LOG` env → 기본 경로).
  - 기기 식별자: `hostname -s`를 소문자화하고 영숫자·하이픈 외 문자는 `-`로
    치환한다. 치환 결과가 비면(전부 특수문자인 극단 hostname) `device`로 폴백한다.
    같은 식별자의 두 기기는 서로의 파일을 덮어쓴다(알려진 한계 — Open questions).
  - 기기별 파일의 의미는 "그 기기의 현재 로그 스냅샷"이다 — FR-4 병합 이후에는
    타 기기 유래 라인이 섞일 수 있으며 이는 정의상 허용된다(dedupe가 흡수).
  - **비가역성 고지**: 백업 repo에 이 기기의 로그 파일이 처음 생성되는 백업에서,
    "검색 기록이 백업 저장소의 git 이력에 남으며 이후 설정을 꺼도 이력에서
    지워지지 않는다"를 평이한 한국어로 경고한다. docs에도 고지한다.
  - `BACKUP_QUERY_LOG` 미설정 시 기존 동작(제외) 그대로 — 완전 opt-in.
  → goal: Problem(004 제약의 의도적 완화), Constraints(opt-in + 비가역 고지)

- **FR-4 (쿼리 로그 복원 병합)**: `make restore`/`recover`가 백업 repo의
  `query-log.*.jsonl` 전부를 로컬 쿼리 로그에 **라인 단위 dedupe 병합**한다.
  - **백업 유래 라인**에는 004 FR-6의 보존 기간(30일)을 적용한다 — 로테이션으로
    지운 항목이 타 기기 파일에서 부활하지 않는다. **로컬 기존 라인**은 기간과
    무관하게 유지한다(restore가 `query-log-clean`을 암묵 수행하지 않는다 —
    로테이션은 004의 명시적 명령 소관).
  - 타임스탬프를 파싱할 수 없는 라인은 유지한다(유실 방지 우선 — 보존 기간 필터
    미적용을 허용).
  - 같은 restore를 **즉시 연속으로** 반복하면 결과가 같다(멱등 — 보존 기간
    컷오프가 실행 시각에 따라 움직이므로 시간 경계는 이렇게 한정한다). 병합본은
    `query-report`가 그대로 읽을 수 있어야 한다.
  → goal: Success metrics(건수 일치), Risks(중복 계상·로테이션 부활)

- **FR-5 (doctor의 NOTES_DIR 정합 점검)**: `make doctor`가 MCP 등록 env의
  `NOTES_DIR`와 셸 유효값(환경변수 → `.env` → 기본값)을 비교해, 다르면 어떤
  폴더가 색인에서 빠지는지와 해결 명령을 평이한 한국어로 안내한다. MCP 등록을
  읽을 수 없는 환경(claude CLI 부재 등)에서는 점검을 조용히 건너뛴다(오탐 금지).
  doctor의 "읽기 전용 + 항상 exit 0" 정책은 유지한다(진단 전용).
  → goal: Problem(조용한 부분 색인), Success metrics(경고 출력)

- **FR-6 (NOTES_DIR 정본 단일화 + 셸 폴백)**: `.env`를 `NOTES_DIR`의 정본으로
  단일화한다(Open questions 1 확정 후 진행).
  - `mcp-install.sh`가 MCP 등록 시 같은 값을 `.env`에도 기록한다. `.env`가 없으면
    `.env.example` 복사로 생성하고 권한 600을 준다(015 FR-9 계승).
    `notes-connect.sh`는 mcp-install을 재사용하므로 자동 충족된다(테스트로 확인).
  - 셸 진입점(`make reindex`, restore의 재색인, backup/restore의 자산 단계)이
    환경변수 부재 시 `.env`의 `NOTES_DIR`를 읽는다. Makefile이 기본값을 무조건
    주입해 폴백을 가리지 않게 한다(설정된 경우에만 전달).
  - 환경변수에도 `.env`에도 없는데 MCP 등록에 다른 값이 있음을 감지할 수 있으면
    시작 전에 경고한다(색인은 진행, 자산 단계는 공통 가드 원칙에 따라 파괴적
    반영 보류).
  → goal: Objective(정본 단일화), Success metrics(셸/MCP 색인 동일), Risks(이중
    완화의 1차 방어선)

- **FR-7 (recover 전환 사전 안내)**: `make recover` 시작 단계에서 "이전 기기에서
  `make backup`을 마지막으로 언제 실행했는지" 확인을 안내하고, 백업 시점 이후의
  메모리·페르소나·쿼리 로그는 이 복구로 오지 않음을 고지한다. 비대화 환경에서는
  안내 출력 후 자동 진행한다.
  → goal: Problem(미export 메모리 유실), Expected outcome(인지하고 진행)

## Acceptance Criteria

FR-1 (자산 미러 백업):

- **AC-1** (포함+마커): Given 첫 노트 폴더가 `BACKUP_DIR` 밖이고
  `repoA/agents/x.md`·`repoA/skills/s/SKILL.md`가 존재, When `make backup`,
  Then 백업 repo 커밋에 `agents/x.md`·`skills/s/SKILL.md`가 포함되고, 두 미러
  폴더에 `.localmind-mirror` 마커가 기록된다.
- **AC-2** (삭제 반영): Given 이전 백업 미러에 `agents/x.md`·`agents/y.md`,
  이후 소스에서 `y.md` 삭제, When `make backup`, Then 미러에서 `y.md`가 제거된
  커밋이 생긴다.
- **AC-3** (빈 소스 가드): Given 백업 repo에 `agents/` 미러가 있고 판정은 확정
  (`.env`에 NOTES_DIR 존재)이나 소스 폴더가 빈 폴더, When `make backup`,
  Then 미러가 삭제되지 않고, 어느 자산이 비었는지와
  탈출구(`BACKUP_CONFIRM_EMPTY_ASSETS=agents`)가 포함된 경고 + 말미 요약 + 비0
  종료하며, 노트·메모리 백업은 완료된다.
- **AC-4** (빈 소스 탈출구 — 자산별): Given AC-3과 같은 상태 + `skills/` 미러도
  존재하고 스킬 소스도 빈 폴더, When `BACKUP_CONFIRM_EMPTY_ASSETS=agents make
  backup`, Then `agents/` 미러만 빈 상태로 반영(삭제 커밋)되고 `skills/` 미러는
  불변이며 스킬 쪽 경고는 유지된다(비0).
- **AC-5** (후퇴 가드): Given `NOTES_DIR`가 환경변수·`.env` 모두에 없고
  `BACKUP_DIR`는 기본값이 아니어서 소스 판정이 `BACKUP_DIR` 밖(기본값 후퇴)이며,
  **판정된 소스 또는 기존 미러가 존재**, When `make backup`, Then 미러 단계가
  진행되지 않고(기존 미러 불변) 해결 명령이 포함된 경고 + 비0 종료한다.
  Given 같은 후퇴 상태이나 소스도 미러도 없음, Then AC-6이 적용된다(경고 없이 0
  — 미사용자 스킵이 우선). Given 같은 상태에서 `LOCALMIND_AGENTS_DIR=<폴더A>`만
  설정, Then agents는 후퇴가 아니므로 정상 미러되고 skills만 가드가
  발동한다(AC-8과 공존).
- **AC-6** (미사용자 하위호환): Given 자산 소스 폴더도 백업 repo의 미러도 없음,
  When `make backup`, Then 자산 관련 경고 없이 기존과 동일하게 동작하고 0으로
  종료한다.
- **AC-7** (자기 복사 금지+마커 정리): Given 레지스트리가 `BACKUP_DIR` 안(기본
  구성, 후행 슬래시·심볼릭 링크 변형 포함)이고 폴더에 과거 미러 시절의
  `.localmind-mirror` 마커가 잔존, When `make backup`, Then 미러 단계가
  건너뛰어지고 자산은 기존 `git add -A`로 커밋되며, 잔존 마커는 제거된다.
- **AC-8** (override): Given `LOCALMIND_AGENTS_DIR=<폴더A>`·
  `LOCALMIND_SKILLS_DIR=<폴더B>` 설정, When `make backup`, Then 각각 그 폴더가
  미러 소스로 쓰인다.
- **AC-9** (.bak 제외): Given 소스에 `y.md.bak-<ts>` 존재, When `make backup`,
  Then 미러·커밋에 `*.bak-*` 파일이 포함되지 않는다.
- **AC-10** (색인 제외 — 마커): Given `BACKUP_DIR`(기본값 아님)가 노트 폴더 목록에
  포함된 구성 + 마커가 기록된 미러 존재, When 재색인, Then 미러 하위 파일이 색인
  대상·검색 결과에 나타나지 않는다.

FR-2 (복원 + 배포):

- **AC-11** (복원+배포): Given 백업 `agents/y.md`와 내용이 다른 로컬 `y.md`,
  When `make restore`, Then 기존 파일이 `y.md.bak-<ts>`로 보존되고 교체되며,
  `agents:deploy`와 `skills:deploy`의 실행 결과가 출력된다. Given 복원 대상과
  백업 원본이 같은 경로(기본 구성), When `make restore`, Then 파일 복사 없이
  배포만 실행된다.
- **AC-12** (삭제 전파·비복원 대상): Given 백업 `agents/`에 `x.md`와 마커
  `.localmind-mirror`가 있고 로컬에 `x.md`·`z.md`·`w.md.bak-<ts>`,
  When `make restore`, Then `z.md`는 `.bak-<ts>`로 보존 후 제거되고,
  `w.md.bak-<ts>`는 건드리지 않으며, 마커는 정본 폴더로 복사되지 않는다.
  Given 백업 repo에 `agents/` 폴더 자체가 없음, When `make restore`, Then 로컬
  파일이 하나도 제거되지 않는다.
- **AC-13** (복원 후퇴 가드·미사용자 스킵): Given 복원 대상 판정이 기본값 후퇴 +
  대상이 `BACKUP_DIR` 밖 + 백업 자산 폴더에 `.localmind-mirror` 마커 존재,
  When `make restore`, Then 자산 복원·삭제 전파가 보류되고 "notes-connect 후
  `make restore` 재실행" 순서 안내가 포함된 문구 + 비0 종료한다(노트·메모리
  복원은 완료). Given 같은 후퇴 상태이나 백업 repo에 자산 폴더가 없음(미사용),
  When `make restore`, Then 자산 관련 경고 없이 기존과 동일하게 동작하고 0으로
  종료한다(AC-6의 restore판 — 하위호환).
- **AC-14** (실패 계속): Given 배포 스크립트가 실패하는 환경(PATH 스텁) + 백업
  자산에 마커 없음(기본 구성 백업 — recover에서 배포가 실제로 호출되는 전제),
  When `make restore` 그리고 `make recover`, Then 각각 노트·메모리 복원은 완료되고
  실패 요약 + 비0 종료로 끝난다(recover가 중간 abort 되지 않는다).
- **AC-15** (recover 마커 판정): Given 백업 repo의 `agents/`에 `.localmind-mirror`
  마커 존재, When `make recover`, Then 그 자산의 복원·배포가 실행되지 않고 말미에
  "notes-connect 후 `make restore` 재실행" 안내가 출력되며, 노트·메모리 복구가
  성공했다면 recover는 0으로 종료한다(보류는 실패가 아님). Given 마커가 없는
  자산(기본 구성 백업), When `make recover`, Then 파일 복사 없이 배포가 실행된다.

FR-3 (쿼리 로그 백업):

- **AC-16** (opt-in): Given `BACKUP_QUERY_LOG` 미설정, When `make backup`,
  Then 백업 repo에 쿼리 로그 파일이 없다(기존 동작 불변). Given
  `BACKUP_QUERY_LOG=1` + `QUERY_LOG=<대체 경로>`, When `make backup`, Then 그
  경로의 로그가 `query-log.<기기식별자>.jsonl`로 커밋된다.
- **AC-17** (식별자 정제): Given `hostname -s` 결과가 `My_MacBook Pro` 형태
  (공백·대문자·언더스코어 — `-s`는 첫 점 앞까지만 반환하므로 점은 입력에 없다),
  When `make backup`(opt-in), Then 파일명의 식별자가 `my-macbook-pro`가 된다.
  Given 정제 결과가 빈 문자열, Then `device`로 폴백한다.
- **AC-18** (비가역 고지): Given `BACKUP_QUERY_LOG=1`이고 백업 repo에 이 기기의
  로그 파일이 아직 없음, When `make backup`, Then git 이력 비가역 경고 문구가
  출력된다. 두 번째 백업부터는 반복 출력하지 않는다.

FR-4 (쿼리 로그 병합):

- **AC-19** (병합·멱등): Given 백업 repo에 기기 2대의 로그(각 3줄, 그중 1줄 동일)
  + 로컬 2줄(백업과 1줄 중복), 전부 보존 기간 내, When `make restore`, Then 로컬
  로그가 중복 없는 합집합 **6줄**이 되고, **즉시 연속으로** 한 번 더 restore 해도
  동일하다.
- **AC-20** (로테이션 정합): Given 백업 파일에 보존 기간(30일) 이전 라인과 로컬
  로그에 보존 기간 이전 라인이 각각 존재, When restore 병합, Then 백업 유래
  기간-외 라인은 들어오지 않고, 로컬 기간-외 라인은 유지된다. 타임스탬프 파싱
  불가 라인은 유지된다.
- **AC-21** (리포트 호환): Given 병합된 로그, When `npm run query-report`,
  Then 에러 없이 집계가 출력된다.

FR-5 (doctor):

- **AC-22**: Given MCP 등록 `NOTES_DIR`가 3개 폴더·셸 유효값이 기본값,
  When `make doctor`, Then 불일치 경고 + 빠지는 폴더 목록 + 해결 명령이 출력되고
  종료 코드는 0이다. Given 두 값이 같음, Then 경고가 없다. Given MCP 등록 조회
  불가(claude CLI 부재), Then 이 점검 관련 출력이 없다.

FR-6 (정본 단일화 + 폴백):

- **AC-23** (기록): Given `.env`가 없는 상태, When `make mcp-install
  NOTES_DIR=<3개 폴더>`, Then `.env`가 생성되고(권한 600) `NOTES_DIR`가 기록되며
  MCP 등록 값과 일치한다. notes-connect 경로도 같은 결과를 낸다(mcp-install
  재사용 확인).
- **AC-24** (색인 폴백): Given `.env`에 `NOTES_DIR=<3개 폴더>`·셸 환경변수 없음,
  When `make reindex`, Then 3개 폴더가 모두 색인 대상으로 출력된다.
- **AC-25** (자산 단계 폴백): Given AC-24와 같은 상태 + 첫 노트 폴더에 자산 존재,
  When `make backup`, Then 후퇴 가드가 발동하지 않고 올바른 소스가 미러된다.
- **AC-26** (감지 경고): Given 환경변수·`.env` 모두 없음 + MCP 등록에 다른 값
  존재(조회 가능 환경), When `make reindex`, Then 시작 전에 경고가 출력되고 색인은
  진행된다.

FR-7 (recover 안내):

- **AC-27**: When `make recover` 시작, Then 이전 기기 `make backup` 실행 확인
  안내와 "백업 이후 데이터는 오지 않음" 고지가 출력된다(비대화 환경은 안내 후
  자동 진행).

## 확정 사항 (2026-07-04 사용자 확정 — 구 Open questions)

plan 단계 1의 사용자 인터뷰로 5건 모두 제안대로 확정됐다. 잔여 open question 없음.

- **016 FR-9 반전 — 승인**: FR-2대로 기기 복구 맥락(`make restore`/`recover`)에
  한해 복원 후 자동 배포. 016 spec FR-9에 개정 표기 완료.
- **NOTES_DIR 정본 위치 — `.env`**: FR-6대로 `.env` 정본 + `mcp-install`이
  `.env` → MCP 등록으로 단방향 기록.
- **쿼리 로그 기본값 — opt-in**: FR-3대로 `BACKUP_QUERY_LOG=1`일 때만 백업
  (004의 로컬 전용 제약을 opt-in 한정 완화 — 004 goal Constraints에 개정 표기
  완료).
- **삭제 전파 — 채택**: FR-2대로 전파 + `.bak-<ts>` 보존.
- **기기 식별자 충돌 — 문서화-only 수용**: FR-3대로 한계를 문서화만 하고,
  suffix 도입은 실사용 충돌 보고 후 검토.
