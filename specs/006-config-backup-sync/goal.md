# Goal: Config Backup Sync (사용자 지정 개인 설정 파일 백업/복원)

## Background — 배경

localmind는 이미 `make backup`/`make restore`/`make recover`로 노트(.md)와 메모리(memory.md)를
git 백업 저장소를 통해 새 기기로 옮기는 패턴을 갖고 있다(`BACKUP_DIR` 기준, `docs/faq.md`·
`scripts/backup-init.sh`·`scripts/recover.sh` 참고).

한편, 사용자가 여러 기기에서 AI 에이전트(Claude Code/Codex 등)를 쓸 때 개인 전역 설정
(예: `~/.claude/CLAUDE.md`)을 기기마다 동일하게 유지하고 싶어 하는 경우가 있다. 이 설정
동기화는 localmind의 기능이 아니라 사용자가 별도로 관리하는 영역이지만, localmind가 이미
갖춘 "백업 repo에 파일을 커밋해 새 기기에서 복원"하는 메커니즘을 재사용하면 사용자가 별도
도구 없이 자신이 지정한 개인 설정 파일도 함께 옮길 수 있다.

## Problem — 문제

- `make backup`/`make restore`는 현재 notes+memory.md만 다룬다.
- 사용자가 지정한 임의의 개인 설정 파일(어떤 파일이든, AI 에이전트 설정에 국한되지 않음)을
  새 기기로 옮기려면 사용자가 별도 스크립트·수단을 직접 마련해야 한다.

## Objective — 목표

사용자가 `BACKUP_EXTRA_FILES` 환경변수로 명시한 `$HOME` 하위 파일들을, 기존 `make backup`이
백업 저장소에 함께 포함하고, `make restore`가 새 기기의 원래 경로로 복원하게 한다.

## Expected outcome — 기대 결과

- `BACKUP_EXTRA_FILES` 미설정 시 기존 `make backup`/`make restore` 동작이 완전히 그대로 유지된다
  (완전 opt-in, 기본값은 아무 파일도 다루지 않음).
- 사용자가 파일 목록을 명시하고 `make backup`을 실행해야만 해당 파일이 포함된다 — 자동/실시간
  동기화가 아니라 매번 사용자가 직접 명령을 실행해야 한다.
- 새 기기에서 `make restore`(또는 `make recover`) 실행 시 백업 저장소에 있던 지정 파일들이
  원래 경로(`$HOME` 기준 상대 위치)로 복원된다.
- 복원 시 기존 파일과 충돌하면 데이터를 잃지 않도록 기존 파일을 보존한 뒤 덮어쓴다.

## Success metrics — 성공 지표

- `BACKUP_EXTRA_FILES` 미설정 상태에서 기존 `make backup`/`make restore` 테스트·동작에 회귀 없음.
- 지정한 파일이 새 기기에서 정확히 원래 상대 경로로 복원됨.
- 복원 중 기존 파일이 덮어써지기 전에 백업본이 남아 데이터 유실이 없음.

## Non-goals — 비목표

- `~/.claude`/`~/.codex` 등 특정 디렉토리 전체를 자동으로 백업하는 것은 이번 범위 밖 —
  사용자가 명시한 개별 파일만 다룬다.
- 실시간/자동 동기화(파일 변경 감지 등)는 이번 범위 밖 — `make backup`/`make restore`를
  사용자가 직접 실행해야 한다.
- 민감정보 자동 탐지·마스킹·암호화는 이번 범위 밖 — 어떤 파일을 백업할지는 전적으로 사용자
  책임이며, 문서로 경고만 제공한다.
- 여러 기기 간 설정 파일의 병합(merge)은 이번 범위 밖 — 단순 overwrite(+충돌 시 보존)만 한다.
- AI 에이전트 설정에 국한되지 않은 범용 기능이다 — 특정 도구나 특정 governance 체계를
  전제하지 않는다.

## Constraints — 제약

- 기존 `scripts/backup-init.sh`·`scripts/recover.sh`의 스타일(친절한 한국어 메시지,
  `ok()`/`warn()`/`err()` 헬퍼, 비대화 환경 자동 진행)을 유지한다.
- `$HOME` 하위 경로만 지원한다(기기 간 이식성 — 절대경로 그대로는 다른 기기에서 의미 없음).
- 추가 npm 의존성 없이 셸 스크립트와 파일 복사로 구현한다(기존 백업 스택과 동일한 도구 사용).
- 기존 `BACKUP_DIR`(노트 백업 저장소) 안에 함께 저장한다 — 별도 저장소를 만들지 않는다.

## Stakeholders — 이해관계자

- 여러 기기에서 localmind와 함께 개인 설정 파일을 유지하고 싶은 사용자 누구나
  (설치한 개인 — 비개발자 포함)

## Risks — 리스크

- **민감정보 노출**: 지정한 파일이 백업 저장소(사용자 소유의 private repo)에 그대로
  커밋된다 — 사용자가 민감정보 포함 여부를 스스로 확인해야 하며, 문서에 명시적 경고가 필요하다.
- **복원 시 덮어쓰기**: 새 기기에 이미 다른 내용의 파일이 있으면 복원 과정에서 덮어써질 수
  있다 — 기존 파일을 타임스탬프 백업으로 보존해 완화한다.
- **경로 이식성**: 심볼릭 링크·특수 파일(디바이스 파일 등)의 처리는 정의되지 않음 — 일반
  파일만 지원 범위로 한정한다.
