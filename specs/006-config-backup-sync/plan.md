# Plan: Config Backup Sync

상위: [goal](goal.md) · [spec](spec.md)

## 접근 요약

`scripts/backup-extras.sh`(백업)와 `scripts/restore-extras.sh`(복원) 두 개의 새 셸 스크립트를
추가하고, 기존 `Makefile`의 `backup:`/`restore:` 타겟에서 각각 호출한다. 경로 매핑은
별도 매니페스트 없이 **`$HOME` 기준 상대경로 미러링**으로 결정한다. 기존
`backup-init.sh`/`recover.sh`의 헬퍼 함수 스타일(`ok()`/`warn()`/`err()`, 친절한 한국어
메시지)을 그대로 재사용한다.

## 도메인 경계 (DDD)

- **백업/복구 도메인의 확장**: 기존 개념(notes, memory)에 **extras**(사용자가 명시적으로
  지정한 개인 설정 파일)라는 새 카테고리를 추가한다. extras는 notes/memory와 달리 localmind가
  내용을 해석하지 않는 불투명한(opaque) 파일 — 그대로 복사·복원만 한다.
- **유비쿼터스 언어**:
  - *extras*: 사용자가 `BACKUP_EXTRA_FILES`로 지정해 백업에 포함시킨 개인 설정 파일들
  - *상대경로 미러링*: `$HOME/<rel>` ↔ `$(BACKUP_DIR)/extras/<rel>` 간 경로를 그대로 반영하는 매핑 방식(매니페스트 불필요)

## 영향 모듈

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `scripts/backup-extras.sh` | 신규 | `BACKUP_EXTRA_FILES` 파싱 → 각 파일을 `extras/`로 복사 |
| `scripts/restore-extras.sh` | 신규 | `extras/`를 순회해 `$HOME`으로 복원, 충돌 시 `.bak` 보존 |
| `Makefile` | 수정 | `backup:`/`restore:` 타겟에 위 스크립트 호출 추가 |
| `.env.example` | 수정 | `BACKUP_EXTRA_FILES=` 항목과 설명 주석 추가 |
| `docs/faq.md` (또는 README) | 수정 | 민감정보 경고 문구 추가(FR-8) |

## 단계 (task 분해 가능)

1. **`scripts/backup-extras.sh` 작성**:
   - 입력: `BACKUP_DIR`, `BACKUP_EXTRA_FILES`(콤마 구분, `~` 표기 지원)
   - `BACKUP_EXTRA_FILES` 비어있으면 즉시 종료(0) — 기존 동작 무영향
   - 각 경로에 대해:
     - `~` → `$HOME` 확장, 절대경로로 정규화
     - 심볼릭 링크면 `warn` 후 건너뜀
     - `$HOME/` 프리픽스가 아니면(`$HOME` 밖) `warn` 후 건너뜀 (FR-4)
     - 파일이 없으면 `warn` 후 건너뜀 (FR-3)
     - 존재하면 `$HOME` 기준 상대경로를 구해 `$(BACKUP_DIR)/extras/<rel>`로 복사(상위
       디렉토리 자동 생성), `ok` 메시지 출력

2. **`scripts/restore-extras.sh` 작성**:
   - 입력: `BACKUP_DIR`
   - `$(BACKUP_DIR)/extras/`가 없으면 즉시 종료(0) — graceful 생략 (FR-7)
   - `find "$(BACKUP_DIR)/extras" -type f`로 모든 파일 순회, 각 파일의 `extras/` 기준
     상대경로를 구해 대상 경로 `$HOME/<rel>` 계산
   - 대상 상위 디렉토리 없으면 생성
   - 대상 파일이 이미 존재하면:
     - 내용이 동일(`cmp -s`)하면 건너뜀 (AC-7)
     - 다르면 `<대상>.bak-$(date +%Y%m%d%H%M%S)`로 복사 후 덮어씀 (FR-6)
   - 대상 파일이 없으면 바로 복사
   - 각 파일마다 `ok`/`warn` 메시지 출력

3. **`Makefile` — `backup:` 타겟 수정**: `git -C "$(BACKUP_DIR)" add -A` 직전에
   ```make
   @BACKUP_DIR="$(BACKUP_DIR)" BACKUP_EXTRA_FILES="$(BACKUP_EXTRA_FILES)" \
     bash "$(CURDIR)/scripts/backup-extras.sh"
   ```
   추가(이러면 extras/도 이후 `git add -A`에 포함됨).

4. **`Makefile` — `restore:` 타겟 수정**: 메모리 복원 단계 이후, 재인덱싱 이전에
   ```make
   @BACKUP_DIR="$(BACKUP_DIR)" bash "$(CURDIR)/scripts/restore-extras.sh"
   ```
   추가.

5. **`.env.example` 갱신**: `BACKUP_DIR` 근처에 주석과 함께 추가:
   ```
   # BACKUP_EXTRA_FILES(선택): make backup 시 함께 백업할 개인 설정 파일(콤마 구분, ~ 표기 가능).
   # 예: BACKUP_EXTRA_FILES="~/.claude/CLAUDE.md,~/.codex/config.toml"
   # 주의: 백업 저장소가 비공개여도 파일 내용이 그대로 커밋되니 민감정보 포함 여부를 직접 확인할 것.
   BACKUP_EXTRA_FILES=
   ```

6. **문서 경고 추가**: `docs/faq.md`(또는 README의 백업 섹션)에 FR-8 경고 문구 추가.

7. **테스트 작성**: 순수 로직(경로 정규화·`$HOME` 밖 거부·상대경로 미러링·충돌 보존)을
   임시 디렉토리 기반 셸 테스트로 검증. 기존 `backup-init.sh`/`recover.sh`처럼 실제 git
   remote·네트워크가 필요한 부분은 자동화하지 않고, `BACKLOG.md` 관례대로 라이브 스택
   체크리스트에 항목을 추가한다.

## 테스트 전략

| AC | 테스트 레벨 | 방법 |
|----|-------------|------|
| AC-1 (미설정 시 회귀 없음) | 단위(셸) | `BACKUP_EXTRA_FILES` 없이 `backup-extras.sh` 실행 → `extras/` 미생성 확인 |
| AC-2 (정상 백업) | 단위(셸) | 임시 `$HOME`에 테스트 파일 생성 → `backup-extras.sh` 실행 → `extras/<rel>`에 복사됐는지 확인 |
| AC-3 (존재하지 않는 파일) | 단위(셸) | 없는 경로 지정 → 스크립트 exit 0, 경고 텍스트 포함 확인 |
| AC-4 (`$HOME` 밖 경로) | 단위(셸) | `/etc/hosts` 지정 → 건너뜀 확인, 다른 정상 파일은 백업됨 확인 |
| AC-5 (정상 복원) | 단위(셸) | `extras/.foo/bar.txt` 준비 → `restore-extras.sh` 실행 → `$HOME/.foo/bar.txt` 생성 확인 |
| AC-6 (복원 충돌 보존) | 단위(셸) | 대상 위치에 다른 내용 파일 미리 생성 → 복원 후 `.bak-*` 존재 + 내용이 새 파일로 교체됐는지 확인 |
| AC-7 (동일 내용 스킵) | 단위(셸) | 대상 파일 = 백업 파일과 동일 내용 → 복원 후 `.bak-*` 파일이 생성되지 않음 확인 |
| AC-8 (extras 없음) | 단위(셸) | `extras/` 폴더 없이 `restore-extras.sh` 실행 → exit 0, 에러 없음 |
| 라이브 통합(BACKLOG 체크리스트) | 수동 | 실제 `make backup`/`make restore` 전체 흐름에서 git commit/push/pull까지 포함해 확인 |

## Open questions

- 셸 테스트를 어떤 형태로 둘지 — 별도 `scripts/*.test.sh` 파일 vs `BACKLOG.md`에 체크리스트만
  추가. 기존 프로젝트에 셸 테스트 프레임워크가 없으므로, 최소한의 assert 기반 테스트 스크립트를
  직접 작성하는 방향으로 진행(별도 러너 도입은 범위 밖).
- `docs/faq.md` vs README 중 어디에 민감정보 경고를 넣을지는 구현 시 기존 문서 구조를 보고 결정.
