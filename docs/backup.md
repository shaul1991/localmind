# 백업 · 복구 (git)

> 내 노트·기억을 안전하게 지키고, 새 컴퓨터에서 한 줄로 되살리는 방법.
> 처음이라면 [README](../README.md)부터 보세요.

노트(.md)와 기억(mem0 → 마크다운 export)을 **내 private git repo 하나**로 백업하고, 새 기기에서 한 줄로 복구합니다. 인덱스·DB는 파생이라 백업 불필요(노트·메모리에서 재생성). 저수준은 `make memory-export`/`memory-import`.

## 자동 백업 (한 명령 + 스케줄)
`make backup` 하나로 **메모리 export → 노트 백업 repo에 커밋·푸시**.

```bash
# 1) 백업 repo 준비(최초 1회) — gh CLI로 GitHub private repo 생성·연결·첫 백업까지 한 번에
make backup-init
#   repo 이름 바꾸려면:   make backup-init BACKUP_REPO=내이름/brain
#   (gh 필요: brew install gh && gh auth login)

# 2) 이후엔 한 번에 백업 (BACKUP_DIR 기본값 ~/.localmind)
make backup
#   BACKUP_DIR을 바꾸려면:  make backup BACKUP_DIR=~/brain
```
- `make backup-init`은 **GitHub private repo를 자동 생성**(`gh repo create --private`)하고 origin 연결 후 첫 백업까지 수행 — 멱등(이미 연결돼 있으면 생성 생략).
- ⚠️ **백업 위치**: 백업은 **내 노트·메모리 전체를 내 GitHub 개인 계정의 비공개 저장소**에 올립니다(회사 계정이 아님). **업무·회사·고객 데이터**를 담았다면 개인 계정 백업이 조직 데이터 정책에 어긋나지 않는지 먼저 확인하세요 — 회사 데이터는 조직이 지정한 저장소에 두는 것을 권장합니다. (`make backup-init` 실행 시에도 동일 고지 후 진행 여부를 확인합니다.)
- 변경 없으면 커밋 생략, remote 없으면 로컬 커밋만 — **여러 번 돌려도 안전**.
- **스택이 꺼져 있어도 노트는 백업됩니다** — 메모리 export만 건너뛰고 "부분 완료" 요약과
  비0 종료 코드로 알립니다(cron 로그에서 식별 가능). 스택을 켜고 다시 실행하면 메모리까지 백업.
- ⚠️ 백업 repo는 **Private로 생성**됩니다. `.env`(시크릿)는 이 repo가 아닌 프로젝트 폴더에 있고 `.brain-index.json`(파생물)은 `.gitignore` 처리됩니다.

> gh CLI 없이 수동으로 하려면: `git -C ~/.localmind init && git -C ~/.localmind remote add origin <private repo url>` 후 `make backup`.

**주기 자동 실행** — `make backup-cron`이 매일 자동 백업을 **crontab 에 바로 등록**합니다(시간을 물어보고, 멱등).
```bash
make backup-cron                 # 시각을 입력받아 등록 (기본 03:00)
make backup-cron HOUR=21 MIN=30  # 시간 지정해서 등록
DRY_RUN=1 make backup-cron       # 등록 없이 추가될 줄만 미리보기
```
- cron 의 최소 PATH에서도 동작하도록 `npm`/`node`/`docker` 경로를 자동으로 넣어 줍니다.
- 자동 백업은 localmind가 **켜져 있을 때**만 동작하고, 사전에 `make backup-init`이 되어 있어야 합니다.
- 해제: `crontab -l | grep -v '# localmind-backup' | crontab -` · 기록: `tail -f ~/localmind-backup.log`
- macOS는 cron 에 **전체 디스크 접근 권한**이 필요할 수 있습니다(시스템 설정 → 개인정보 보호).

## 새 기기 복구 (원커맨드)
컴퓨터를 바꾸거나 고장 후, **백업 repo 하나로 통째 복구**합니다.

```bash
git clone https://github.com/shaul1991/localmind && cd localmind
make recover
#   gh 로그인 상태면 내 백업 저장소를 자동으로 찾아요. 아니면:
make recover RESTORE_REPO=<내 백업 repo url>
```
- `make recover`는 **6단계를 한국어로 한 단계씩 안내**합니다 — 준비물 점검(Docker·.env) → 백업 내려받기 → 설치·빌드 → 스택 기동·대기 → 메모리 복원 → 노트 재인덱싱. (gh 로그인 시 백업 저장소 자동 탐색)
- 이미 스택이 떠 있고 데이터만 되돌릴 땐 `make restore RESTORE_REPO=<url>` (또는 BACKUP_DIR이 이미 그 repo면 인자 없이 `make restore`).
- 복원 순서: **노트 repo pull/clone → `memory-import`(멱등) → 노트 재인덱싱**. 인덱스·DB는 파생이라 자동 재생성됩니다.
- 다중 노트 폴더를 쓴다면 폴더별 repo를 각각 복원하고 `NOTES_DIR`를 그에 맞게 지정하세요.

## 노트를 git 저장소로 쓸 때 — `make notes-connect`
노트를 GitHub 등 git 저장소로 관리한다면, 저장소 목록만 선언하면 새 기기 연결이 한 번에 끝납니다.

```bash
# .env 에 저장소 목록 선언(형식: "라벨=URL,...")
#   NOTES_REPOS="work=git@github.com:<user>/work-notes.git,life=https://github.com/<user>/life-notes.git"
make notes-connect        # 각 저장소 clone(있으면 pull) → NOTES_DIR 조립 → Claude Code 등록
```
- **새 기기 흐름**: `git clone localmind` → `.env` 복원(또는 `NOTES_REPOS` 한 줄 입력) → `make notes-connect`. `make setup`도 `NOTES_REPOS`가 있으면 이 연결을 함께 제안합니다.
- 저장소는 `NOTES_REPOS_DIR`(기본 `~/localmind-notes`) 아래 `<라벨>/`에 clone됩니다.
- ⚠️ **등록 덮어쓰기**: `notes-connect`는 MCP 등록을 통째로 재작성합니다 — 수동으로만 추가했던 폴더는 사라지니 `NOTES_REPOS`로 옮기세요.
- ⚠️ **자격증명**: 비공개 저장소는 SSH 키나 git credential helper를 쓰세요(토큰을 URL에 박지 말 것). 인증이 없으면 해당 저장소만 실패로 건너뛰고 나머지는 정상 연결됩니다.
