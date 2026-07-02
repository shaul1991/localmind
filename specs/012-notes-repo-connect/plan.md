# Plan: Notes Repo Connect

상위: [goal](goal.md) · [spec](spec.md)

## 접근 요약

`scripts/notes-connect.sh` 셸 스크립트 하나를 추가하고 `Makefile`에 `notes-connect` 타겟을
만든다. 스크립트는 (1) 입력 로드(env → `.env` 폴백) → (2) 파싱·검증(URL 스킴·라벨 charset·
경로 봉쇄·중복 라벨) → (3) 저장소별 clone/pull(비대화·origin 대조) → (4) `NOTES_DIR` 조립
→ (5) 기존 `scripts/mcp-install.sh` 호출 → (6) 요약 출력의 파이프라인이다. 등록 로직은 새로
만들지 않는다 — mcp-install.sh가 이미 준비물 점검·등록·재시작 안내를 담당한다.

테스트는 **네트워크 없이** 임시 디렉토리에 만든 로컬 bare 저장소를 원격으로 삼아 clone/pull/
실패 시나리오를 재현한다(006의 `scripts/backup-extras.test.sh` 스타일의 assert 기반 셸
테스트 — 그 파일은 `assert`/임시 `$HOME` 관례를 실제로 갖고 있음을 확인함). CI는
`.github/workflows/ci.yml`이 `scripts/*.test.sh`를 자동 발견하므로 CI 변경은 불필요하다.

## 도메인 경계 (DDD)

- **새 개념 — notes repo**: 노트 폴더의 정본 git 저장소. 기존 개념인 notes folder
  (`NOTES_DIR`의 각 항목)의 원천이며, `notes-connect`가 repo → folder로 실체화한다.
- **기존 경계 불변**: `NOTES_DIR` 파싱(`src/brain.ts`의 `parseFolders`)·인덱싱·검색은 폴더가
  어떻게 준비됐는지 알지 못하고 알 필요도 없다. 본 기능은 전적으로 "폴더 준비" 단계에만
  존재하는 셸 레이어다(TypeScript 코드 변경 없음).
- **신뢰 경계**: `NOTES_REPOS`는 사용자가 직접 작성하지 않았을 수 있는 입력(복원된 `.env`·
  붙여넣은 예시)으로 취급해 URL·라벨을 검증한 뒤에만 git에 넘긴다. 반면 clone된 저장소의
  *내용*은 사용자가 신뢰하는 정본으로 간주한다(프롬프트 인젝션 근본 차단은 011과 동일하게
  범위 밖).
- **유비쿼터스 언어**: *notes repo*(=`NOTES_REPOS`의 한 항목), *연결(connect)*(=clone/pull로
  폴더를 준비하고 그 폴더가 포함된 `NOTES_DIR`로 MCP 등록).

## 영향 모듈

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `scripts/notes-connect.sh` | 신규 | 로드→파싱·검증→clone/pull→조립→mcp-install→요약 |
| `scripts/lib/read-env.sh` | 신규 | 공용 헬퍼: 비실행 `.env` 읽기(`read_env_val`) + `mask_url()` — notes-connect.sh·setup.sh가 공유(FR-16 불변식을 한 곳에서 강제) |
| `scripts/notes-connect.test.sh` | 신규 | 로컬 bare repo 기반 assert 테스트 (AC 전부) |
| `Makefile` | 수정 | `notes-connect` 타겟 추가(help 주석 포함) |
| `scripts/setup.sh` | 수정 | 4단계 연결 점검을 `NOTES_REPOS`(비어있지 않음) 유무로 분기(FR-16), 공용 헬퍼 재사용 |
| `.env.example` | 수정 | `NOTES_REPOS=`·`NOTES_REPOS_DIR=` 항목 + 설명·경고 주석 |
| `README.md` 또는 `docs/faq.md` | 수정 | 새 기기 셋업 흐름·덮어쓰기·토큰 경고 (FR-15) |

주의: `Makefile`은 `.env`를 make 변수로 자동 로드하지 **않는다**(`include .env` 없음). 따라서
타겟은 `NOTES_REPOS="$(NOTES_REPOS)"`를 전달하되, 값이 비면 `notes-connect.sh`가 프로젝트
`.env`를 직접 읽는 폴백을 갖는다(FR-5) — 이것이 `.env` 복원 시나리오가 실제로 동작하는 경로다.

## 단계 (task 분해 가능)

1. **테스트 하네스 먼저 (TDD)**: `scripts/notes-connect.test.sh` 골격 — 임시 `$HOME`·
   `$NOTES_REPOS_DIR`, 헬퍼 `make_bare_repo()`(임시 폴더에 커밋 1개짜리 bare 저장소 생성),
   `assert`/`assert_contains`/`assert_exit` 헬퍼. mcp-install 호출부는 `MCP_INSTALL_CMD`
   오버라이드(기본 `"$SCRIPT_DIR/mcp-install.sh"`)로 스텁해, 등록 없이 전달된 `NOTES_DIR`
   값과 호출 여부만 검증한다.

2. **입력 로드 + opt-in 게이트 (FR-5, FR-14 / AC-1, AC-2, AC-18)**:
   - `SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"`, `PROJECT_DIR` 도출(기존 스크립트 관례).
   - `git` 존재 점검 → 없으면 안내 후 exit 1.
   - `NOTES_REPOS`/`NOTES_REPOS_DIR`가 env로 비면 프로젝트 `.env`에서 **비실행** 방식으로 읽는다
     (`scripts/lib/read-env.sh`의 `read_env_val`: `grep -E "^KEY=" | head -1 | cut -d= -f2-`,
     `mcp-install.sh:53` 관례 — `source`/`eval` 금지). `NOTES_REPOS_DIR` 기본값 `$HOME/localmind-notes`.
   - **NOTES_REPOS_DIR 검증(FR-17 / AC-25)**: 절대경로가 아니거나 물리 경로가 `$HOME` 밖 또는
     민감 디렉토리(`~/.ssh`·`~/.config`·`~/.claude` 등)로 해석되면 거부하고 기본값으로 폴백+경고.
     이후 FR-3의 clone 대상 봉쇄는 이 검증된 base를 기준으로 한다.
   - `NOTES_REPOS`가 끝내 비면 예시 안내 후 exit 0(부수효과 0).

3. **파싱·검증 (FR-1~4 / AC-4~8)**: 항목별로 순서대로
   - 앞뒤 공백·후행 쉼표 제거.
   - 라벨 판정: 첫 `=` 앞 문자열이 `^[A-Za-z0-9._-]+$`면 라벨 지정, 아니면 항목 전체를 URL로
     간주(라벨 생략). 라벨 생략 시 URL 마지막 세그먼트에서 `.git`·후행 `/` 제거해 라벨 도출.
   - 라벨 검증: charset 부합·`.`/`..` 아님 확인(위반 → 실패 기록).
   - URL 검증(FR-2): `-` 시작 거부, allowlist(`https://`·`ssh://`·scp형 `user@host:`·로컬 경로)
     외 거부(`ext::`·`git://`·`http://`·`file://` 등 실패 기록).
   - 중복 라벨(기존 목록 + 예약 `localmind`) → 실패 기록.
   - 통과 항목은 `label|url|target_path` 형태로 누적. `target_path="$NOTES_REPOS_DIR/$label"`
     계산 후 물리 경로가 `NOTES_REPOS_DIR` 하위인지 재검증(`backup-extras.sh` 봉쇄 방식) —
     벗어나면 실패 기록.

4. **clone/pull (FR-6~9 / AC-3, AC-9~13)**: git 공통 환경
   `GIT_TERMINAL_PROMPT=0`, `GIT_SSH_COMMAND="ssh -oBatchMode=yes"`. `GIT_ALLOW_PROTOCOL`은
   **항목 유형별로 최소만** 연다 — 원격 URL 호출엔 `https:ssh`, 검증된 로컬 절대경로 호출엔
   그 호출에 한해 `file`(로컬 clone은 git 내부적으로 file 프로토콜). 전역 하드코딩(`:file`
   상시 개방)은 하지 않아 FR-2의 입력-스킴 방어와 상충하지 않게 한다. 항목별로
   - 대상 없음 → `git clone -- "$url" "$target"`(실패 시 stderr 요약 + 인증 패턴이면 SSH 안내).
   - 대상 있음 + `.git` 존재 →
     `git -C "$target" remote get-url origin`가 `$url`과 다르면 실패 기록(AC-10);
     같으면 `git -C "$target" status --porcelain` 비어 있으면 `git -C "$target" pull --ff-only`,
     변경 있으면 pull 생략 + 경고(둘 다 성공 집계, 폴더는 포함).
   - 대상 있음 + git 아님 → 실패 기록(AC-12).
   - 결과를 `status|label|reason` 배열로 집계.

5. **NOTES_DIR 조립 + 등록 연계 (FR-10, FR-11 / AC-14~16)**:
   - 성공 0건 → 등록 생략, exit 준비(요약 후 exit 1).
   - 성공 ≥1건 → `NOTES_DIR="localmind=$HOME/.localmind,<성공 label=target ...>"` 조립.
   - `set +e`로 감싸 `NOTES_DIR="$NOTES_DIR" $MCP_INSTALL_CMD` 호출, exit code 포착
     (`register_rc`). mcp-install이 remove→add로 기존 등록을 재작성한다는 안내 문구 출력.

6. **요약 출력 (FR-12, FR-13 / AC-16, AC-17)**: 저장소별 상태 표(라벨 우선 노출, URL은
   `mask_url()`로 userinfo 마스킹)와 최종 `NOTES_DIR`를 항상 출력. 실패 항목 ≥1건 또는
   `register_rc != 0`이면 exit 1.

7. **문서화 (FR-15 / AC-19)**: `.env.example`에
   ```
   # NOTES_REPOS(선택): 노트 폴더의 원본 git 저장소 목록("라벨=URL" 쉼표 구분, 라벨 생략 가능).
   # 예: NOTES_REPOS="work=git@github.com:<user>/work-notes.git,life=https://github.com/<user>/life-notes.git"
   # 주의: 토큰을 URL에 박지 말 것(https://user:token@...) — SSH 키나 git credential helper 권장.
   NOTES_REPOS=
   # 저장소를 받아올 위치(기본 ~/localmind-notes). 각 저장소는 <이 폴더>/<라벨>에 clone된다.
   NOTES_REPOS_DIR=
   ```
   README(기존 'MCP 서버' 섹션 근처)에 새 기기 셋업 3단계 + "notes-connect가 MCP 등록을 통째로
   재작성하므로 수동 폴더는 NOTES_REPOS로 옮기라"는 안내를 추가. 예시는 전부 플레이스홀더.

8. **`scripts/setup.sh` 통합 (FR-16 / AC-20~24)**: 4단계 연결 점검(`setup.sh:157-167`)을 다음처럼
   재구성한다. 핵심은 **분기 판정을 기존 "이미 등록됨" 게이트보다 바깥에서** 하는 것.
   - `read-env.sh`로 `NOTES_REPOS`를 env→`.env` 조회. **값이 비어있지 않을 때만** notes-connect
     경로(빈 값/미설정은 레거시 경로). `.env.example`이 `NOTES_REPOS=` 빈 값을 실으므로
     "라인 존재"가 아니라 "비어있지 않음"으로 판정한다(AC-21).
   - **비어있지 않으면**: `claude mcp list`에 localmind가 이미 있어도 "저장소 (재)연결" 상태·
     명령을 노출하고, 기존 `confirm` 규약(기본 '아니오', 비대화·DRY_RUN 건너뜀)으로
     `bash scripts/notes-connect.sh` 실행(AC-20). **`NOTES_REPOS` 값 자체는 출력하지 않는다**
     (존재/개수만; 식별 표시가 필요하면 `mask_url()`) — AC-23.
   - **실행 후 폴백(AC-22)**: notes-connect 뒤 `claude mcp list`에 localmind가 여전히 없으면
     (전부 실패) 기본 단일 폴더 `mcp-install`을 제안하거나 미등록·재시도 안내.
   - **비어있으면**: 기존 코드 경로 그대로(`NOTES_DIR=$HOME/.localmind` mcp-install 제안) — 한 줄도
     안 바꿔 회귀 0(AC-21).
   - **불변식**: setup은 `NOTES_REPOS`를 set/unset 판정에만 쓰고 git·notes-connect 인자로 넘기지
     않으며 모든 검증·clone은 notes-connect.sh에 위임. `.env`는 `source`/`eval` 없이 read-env.sh로만
     읽는다(AC-24). `set -e` 미사용 등 기존 스타일 유지.

## 테스트 전략

| AC | 테스트 레벨 | 방법 |
|----|-------------|------|
| AC-1 (opt-in) | 단위(셸) | env·`.env` 모두 없이 실행 → exit 0, `NOTES_REPOS_DIR` 미생성, 스텁 미호출 |
| AC-2 (`.env` 폴백) | 단위(셸) | 임시 프로젝트 `.env`에 `NOTES_REPOS` 기록, env는 비움 → 처리됨 확인 |
| AC-3 (신규 clone) | 단위(셸) | 로컬 bare repo → clone 확인 + 스텁에 전달된 `NOTES_DIR` 검증 |
| AC-4 (라벨 생략) | 단위(셸) | URL만 지정 → 폴더/라벨이 repo 이름인지 확인 |
| AC-5 (URL 스킴 거부) | 단위(셸) | `ext::`·`--upload-pack=` → clone 미시도(`/tmp` 마커 미생성)+실패 요약 |
| AC-6 (경로 탈출 거부) | 단위(셸) | 라벨 `../../escape` → `NOTES_REPOS_DIR` 밖 미생성 + 실패 |
| AC-7 (charset 위반) | 단위(셸) | `/`·`,`·`=`·빈 라벨 → 실패 + `NOTES_DIR` 오염 없음 |
| AC-8 (중복 라벨) | 단위(셸) | 같은 라벨 2개 / 예약 `localmind` → 겹치는 항목 실패 |
| AC-9 (멱등 pull) | 단위(셸) | clone 후 bare에 새 커밋 → 재실행 → 반영 + 성공 |
| AC-10 (origin 불일치) | 단위(셸) | 대상에 다른 origin repo → pull 안 함 + 실패 + 불변 |
| AC-11 (로컬 변경 보존) | 단위(셸) | clone 후 파일 수정 → 재실행 → 보존 + 경고 + 폴더 포함 |
| AC-12 (비git 충돌) | 단위(셸) | 대상에 일반 폴더 → 내용 불변 + 실패 요약 |
| AC-13 (접근 불가·비대화) | 단위(셸) | 없는 로컬 경로 + 정상 1개 → 정상 연결 + 행 없음 + exit ≠ 0 |
| AC-14 (전부 실패) | 단위(셸) | 접근 불가만 → 스텁 미호출 + exit ≠ 0 |
| AC-15 (조립 규칙) | 단위(셸) | repo 2개 → 스텁이 받은 `NOTES_DIR` 문자열 완전 일치 |
| AC-16 (등록 실패에도 요약) | 단위(셸) | 스텁을 exit 1로 → 요약 출력됨 + exit ≠ 0 |
| AC-17 (자격증명 마스킹) | 단위(셸) | `user:token@` URL → 출력에 토큰 평문 없음 |
| AC-18 (git 없음) | 단위(셸) | `PATH`에서 git 제거한 서브셸 → 안내 + exit 1 |
| AC-19 (문서화) | 리뷰 | `.env.example`/README에 키·플레이스홀더·경고 존재 확인 |
| AC-20 (setup 분기, 이미 등록 무관) | 단위(셸) + 수동 | 분기 판정 헬퍼에 `NOTES_REPOS` 비어있지 않음 + "이미 등록됨" 상태 → notes-connect 경로 선택됨 검증; 전체 상호작용은 BACKLOG 라이브 |
| AC-21 (setup 회귀 없음, 빈 값) | 단위(셸) + 수동 | 헬퍼에 미설정/빈 값(`NOTES_REPOS=`) → 레거시 mcp-install 경로 선택 검증; setup 동작 불변 수동 확인 |
| AC-22 (전부 실패 폴백) | 단위(셸) + 수동 | notes-connect 등록 0건 후 "미등록이면 폴백/안내" 판정 로직 단위 검증; 실제 흐름 BACKLOG 라이브 |
| AC-23 (setup 자격증명 비노출) | 단위(셸) | `.env`에 `user:token@` 넣고 분기·표시 함수 실행 → 출력에 토큰 평문 없음 |
| AC-24 (setup 비실행 읽기) | 단위(셸) | `.env`에 `NOTES_REPOS=$(touch marker)` → read-env.sh 읽기 후 marker 미생성 |
| AC-25 (NOTES_REPOS_DIR 검증) | 단위(셸) | `NOTES_REPOS_DIR=$HOME/.ssh` 등 → 거부·기본값 폴백·경고, 민감 dir에 clone 안 함 |
| 라이브 통합 | 수동(BACKLOG) | 실제 GitHub 비공개 repo + 실제 `claude mcp` 등록까지 새 기기 시나리오(설정/미설정/이미등록/전부실패) |

## Open questions

- 인증 실패 감지 패턴(`Permission denied (publickey)` 등)은 git 버전·로케일에 따라 문구가
  달라질 수 있으므로 안내 강화용으로만 쓰고, 실패 처리 자체는 exit code 기준으로 한다.
- 로컬 경로 URL 허용 범위(절대경로만 vs `~` 확장) — `-` 시작 거부(FR-2)와 상충하지 않게
  구현 시 확정. 테스트는 절대경로 bare repo를 쓴다.
- `NOTES_REPOS` 조회 로직이 `notes-connect.sh`와 `setup.sh` 두 곳에 생긴다 — 작은 공용
  헬퍼(예: `scripts/lib/read-env.sh`)로 뺄지, 각자 인라인할지는 구현 시 중복 규모를 보고 결정.
- `setup.sh`가 이미 등록된 경우 `NOTES_REPOS` 있으면 "재연결/갱신"을 제안할지 — 우선 제안
  노출로 진행(spec Open questions와 동일).
