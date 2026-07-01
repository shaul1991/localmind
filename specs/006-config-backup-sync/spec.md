# Spec: Config Backup Sync

상위: [goal](goal.md)

## Scope

`BACKUP_EXTRA_FILES` 환경변수로 지정된 `$HOME` 하위 파일들을 `make backup`이
`$(BACKUP_DIR)/extras/`에 상대경로 구조 그대로 복사·커밋하고, `make restore`가 새 기기의
원래 경로로 복원한다.

## Context

기존 `make backup`(Makefile, 인라인 셸)은 `npm run memory:export`로 `memory.md`를 만들고
`$(BACKUP_DIR)` 전체를 git commit+push한다. `make restore`는 백업 repo를 pull/clone한 뒤
`memory:import`와 `reindex`를 수행한다. 둘 다 `BACKUP_DIR`(기본 `~/.localmind`)를 기준으로
동작한다.

`extras/`는 `BACKUP_DIR` 안의 새 하위 폴더로, notes/memory.md와 마찬가지로 git이 추적한다.
경로 매핑은 별도 매니페스트 없이 **`$HOME` 기준 상대경로를 그대로 미러링**해서 결정한다
(`~/.claude/CLAUDE.md` → `extras/.claude/CLAUDE.md` → 복원 시 `$HOME/.claude/CLAUDE.md`).

## Functional Requirements

- **FR-1 (백업 대상 지정)**: `BACKUP_EXTRA_FILES` 환경변수(콤마 구분, `~` 표기 지원)로 백업할
  파일 목록을 지정한다. 미지정 시 빈 목록으로 처리되어 기존 동작이 완전히 유지된다.
  → goal: Objective, Success metrics

- **FR-2 (백업 시 복사)**: `make backup` 실행 시 지정된 각 파일이 존재하면, `$HOME` 기준
  상대경로 구조를 유지해 `$(BACKUP_DIR)/extras/<상대경로>`로 복사한다.
  → goal: Objective

- **FR-3 (존재하지 않는 파일 — graceful 처리)**: 지정된 파일이 존재하지 않으면 경고 메시지를
  출력하고 해당 항목만 건너뛴 채 나머지 백업(notes/memory/다른 extra 파일)은 정상 진행한다.
  → goal: Constraints (비개발자 친화적 graceful 처리)

- **FR-4 (`$HOME` 밖 경로 거부)**: `BACKUP_EXTRA_FILES`에 `$HOME` 하위가 아닌 경로(예:
  `/etc/hosts`, 상대경로 탈출 시도)가 있으면 해당 항목을 건너뛰고 경고를 출력한다.
  → goal: Constraints (이식성)

- **FR-5 (복원)**: `make restore` 실행 시 `$(BACKUP_DIR)/extras/`가 존재하면, 그 안의 모든
  파일을 `$HOME/<상대경로>`로 복사한다. 대상 상위 디렉토리가 없으면 자동 생성한다.
  → goal: Objective

- **FR-6 (복원 충돌 시 보존)**: 복원 대상 경로에 이미 다른 내용의 파일이 존재하면, 덮어쓰기
  전에 `<원본경로>.bak-<타임스탬프>`로 백업한 뒤 덮어쓴다. 내용이 동일하면 건너뛴다.
  → goal: Risks (데이터 유실 방지)

- **FR-7 (extras 없음 — graceful 생략)**: 백업 저장소에 `extras/` 폴더가 없으면 이 단계를
  조용히 건너뛰고 기존 복원(메모리+노트) 절차는 정상 진행한다.
  → goal: Constraints

- **FR-8 (민감정보 경고 문서화)**: README 또는 관련 문서(`docs/faq.md`)에 "백업 저장소가
  비공개여도, 지정한 파일 내용은 그대로 커밋되니 민감정보 포함 여부를 직접 확인하라"는
  경고를 명시한다.
  → goal: Risks

## Acceptance Criteria

- **AC-1**: Given `BACKUP_EXTRA_FILES`가 설정되지 않은 상태에서,
  When `make backup`을 실행하면,
  Then 기존과 동일하게 notes+memory.md만 처리되고 `$(BACKUP_DIR)/extras/` 폴더가 생성되지
  않는다(회귀 없음).

- **AC-2**: Given `BACKUP_EXTRA_FILES="~/.claude/CLAUDE.md"`이고 해당 파일이 실제 존재할 때,
  When `make backup`을 실행하면,
  Then `$(BACKUP_DIR)/extras/.claude/CLAUDE.md`로 복사되고 git에 커밋된다.

- **AC-3 (엣지 — 존재하지 않는 파일)**: Given `BACKUP_EXTRA_FILES`에 존재하지 않는 경로가
  포함되어 있을 때,
  When `make backup`을 실행하면,
  Then 경고가 출력되고 스크립트는 실패 없이 나머지 백업을 정상 완료한다.

- **AC-4 (엣지 — `$HOME` 밖 경로)**: Given `BACKUP_EXTRA_FILES="/etc/hosts"`로 설정했을 때,
  When `make backup`을 실행하면,
  Then 해당 항목은 건너뛰고 경고가 출력되며 다른 정상 항목은 백업된다.

- **AC-5 (복원)**: Given 백업 저장소에 `extras/.claude/CLAUDE.md`가 존재할 때,
  When `make restore`를 실행하면,
  Then `$HOME/.claude/CLAUDE.md`로 복사된다.

- **AC-6 (엣지 — 복원 충돌)**: Given 복원 대상 위치(`$HOME/.claude/CLAUDE.md`)에 이미 다른
  내용의 파일이 존재할 때,
  When `make restore`를 실행하면,
  Then 기존 파일이 `$HOME/.claude/CLAUDE.md.bak-<타임스탬프>`로 보존된 뒤 새 내용으로
  덮어써진다.

- **AC-7 (엣지 — 동일 내용)**: Given 복원 대상 파일이 이미 백업본과 내용이 동일할 때,
  When `make restore`를 실행하면,
  Then `.bak` 파일을 만들지 않고 건너뛴다(불필요한 파일 증식 방지).

- **AC-8 (엣지 — extras 없음)**: Given 백업 저장소에 `extras/` 폴더가 없을 때,
  When `make restore`를 실행하면,
  Then 이 단계는 조용히 건너뛰고 기존 복원(메모리+노트)은 정상 진행된다.

## Open questions

- `.bak-<타임스탬프>` 형식 — `date +%Y%m%d%H%M%S` 정도로 충분한지, 아니면 더 정밀한
  타임스탬프가 필요한지는 plan에서 확정.
- 심볼릭 링크로 지정된 파일의 처리(실제 대상을 복사할지, 링크 자체를 오류로 볼지)는
  Non-goals로 명시했으나 구현 중 최소한의 안전한 기본 동작(예: 심볼릭 링크는 건너뛰고 경고)은
  plan에서 정의한다.
