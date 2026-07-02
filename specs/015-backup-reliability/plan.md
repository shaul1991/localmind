# Plan: Backup & Recovery Reliability

상위: [goal](goal.md) · [spec](spec.md)

## 접근 요약

전부 셸·Makefile 층위 — `src/` 변경이 없다. 핵심 이동은 하나: `make backup`의 레시피
로직을 **스크립트로 내려**(`scripts/backup.sh`) 실패 정책·요약·종료 코드를 제어 가능하게
만들고, backup-init의 export 처리와 같은 정책을 공유한다(Makefile 레시피는 `@bash
scripts/backup.sh`만 남는 얇은 진입점 — 기존 "진입점은 얇게" 관례). 나머지는 각
스크립트의 국소 수정이다. 모든 변경은 기존 `scripts/*.test.sh` 관례(임시 디렉토리 +
로컬 bare repo, 라이브 불필요)로 테스트를 먼저 쓴다.

## 도메인 경계 (DDD)

- **백업 파이프라인의 실패 정책**: "단계는 독립적으로 시도하고, 결과는 끝에 모아
  정직하게 보고한다" — 메모리 export / 노트 커밋·push / extras는 서로의 인질이 아니다.
- **파괴적 명령의 계약**: 비가역 단계 앞에는 실경로 기준 가드, 완료 메시지는 실제 상태와
  일치("완료"는 전부 됐을 때만).
- **유비쿼터스 언어**:
  - *부분 실패(partial failure)*: 일부 단계만 성공한 백업/제거 — 요약 + 비0 종료로 표현
  - *실패 요약(failure summary)*: 실행 말미에 "무엇이 안 됐고 어떻게 하는지"를 모은 출력
  - *실경로(physical path)*: 심링크를 해소한 경로 — 가드 판정의 기준

## 영향 모듈

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `scripts/backup.sh` | **신규** | backup 파이프라인(export→노트→extras) + 실패 요약·종료 코드 (FR-1·7) |
| `Makefile` | 수정 | backup 타깃을 backup.sh 호출로 축소, init-env에 chmod 600 (FR-1·9) |
| `scripts/backup-init.sh` | 수정 | export 실패 문구·판정을 backup.sh와 공유(중복 제거 최소한으로) (FR-1) |
| `scripts/backup-cron.sh` | 수정 | 크론 라인에 커스텀 변수 포함, 실패 시나리오 문구 정합 (FR-6, AC-3) |
| `scripts/recover.sh` | 수정 | 복원 단계에 restore-extras 호출 추가, .env 생성 시 600 (FR-2·9) |
| `scripts/purge.sh` | 수정 | 실경로 가드($HOME 하위 + `PURGE_OUTSIDE_HOME=1` 예외), down 실패 추적 → 요약·종료 코드 (FR-3·4) |
| `scripts/mcp-install.sh` | 수정 | 기존 등록 백업 → add → 실패 시 복원 (FR-5) |
| `scripts/up.sh` | 수정 | 헬스 폴링에 :8787 + curl 타임아웃, 미준비 안내, .env 생성 시 600 (FR-8·9) |
| `scripts/claude-token.sh` | 수정 | append 경로 후 chmod 600 (FR-9) |
| `scripts/backup.test.sh` | **신규** | AC-1·2·11 (로컬 bare repo + 가짜 npm/스택 다운 시뮬레이션) |
| `scripts/purge.test.sh` | **신규** | AC-6·7·8 (임시 HOME·심링크·가짜 docker) |
| `scripts/mcp-install.test.sh` | **신규** | AC-9 (가짜 claude 바이너리) |
| 기존 `*.test.sh` | 수정 | AC-3·10·12·13 해당 케이스 추가 |
| `CHANGELOG.md` / `README.md` | 수정 | backup 종료 코드 동작 변경 명시, purge 가드 안내 |

## 단계 (task 분해 가능)

1. **`scripts/backup.sh` 신설(FR-1·7)**: 현재 Makefile backup 레시피를 이식하되 —
   ① export를 `if ! npm run memory:export ...; then MEMORY_FAILED=1; warn ...; fi`로
   (backup-init.sh:106-110과 같은 문구) ② 노트 git 단계는 항상 진행 ③ push 거부 시
   원인 감지(비0 + stderr) → non-ff 안내 ④ 말미에 실패 요약 출력, 실패 항목 있으면
   `exit 1`. 테스트 먼저: AC-1(가짜 export 실패), AC-2(성공 경로), AC-11(앞선 원격
   bare repo).
2. **Makefile·backup-cron 정리(FR-1·6)**: backup 타깃 축소. backup-cron이 등록 시점의
   `BACKUP_DIR`·`BACKUP_EXTRA_FILES`(기본값과 다르면)를 크론 라인 env로 포함 —
   DRY_RUN 출력 검증(AC-10). `:82` 문구를 "메모리만 건너뛰고 노트는 백업됩니다"로
   정합(AC-3).
3. **recover 배선(FR-2)**: recover.sh 복원 단계(5·6단계 사이)에 restore-extras 호출 —
   `Makefile:162`의 restore 타깃과 같은 호출 형태. specs/006의 기존 테스트
   (`restore-extras.test.sh`)가 recover 경유로도 성립하는지 케이스 추가(AC-4·5).
4. **purge 가드(FR-3·4)**: ① `WIPE_NOTES` 검증을 실경로 기반으로 —
   `RESOLVED=$(cd "$BACKUP_DIR" && pwd -P)` 후 `$HOME/` 접두 확인, 밖이면
   `PURGE_OUTSIDE_HOME=1` 요구(AC-6·7. notes-connect.sh의 물리 경로 정규화 관례 재사용)
   ② `DC down -v` 결과를 변수로 추적, 이미지 제거 결과도 추적 ③ 말미 요약에서 실패
   항목 나열 + "완전 제거 완료"는 전부 성공일 때만, 아니면 비0 종료(AC-8 — 가짜
   docker(항상 실패하는 셸 함수 PATH 주입)로 테스트).
5. **mcp-install 원자성(FR-5)**: `claude mcp get localmind` 류로 기존 등록을 확보(불가
   시 remove 직전 등록 JSON을 임시 파일로) → remove → add → add 비0이면 백업으로
   재등록 시도 + 실패 안내. 가짜 claude 바이너리(add에서만 비0)로 AC-9. spec Open
   questions의 "add 성공 후 제거" 대안은 claude CLI가 중복 add를 허용하는지 확인 후
   가능하면 그쪽으로(더 단순).
6. **up.sh 헬스(FR-8)**: 폴링 대상에 `:8787/health` 추가, curl에
   `--connect-timeout 2 --max-time 5`(AC-12 — B4 흡수·마감). 타임아웃 시 포트별
   상태 나열 + `make logs` 안내. 빌드 실패 경로에도 같은 안내.
7. **.env 권한(FR-9)**: 생성 3곳 `cp` 직후 + claude-token append 후 `chmod 600 .env`.
   read-env.test.sh에 권한 케이스 추가(AC-13).
8. **문서**: CHANGELOG에 backup 종료 코드 변경 명시, README 백업 절·purge 관련 안내
   갱신.
9. **도그푸드**: 라이브 스택에서 ① 스택 끈 채 `make backup` → 노트 커밋 + 실패 요약
   ② `make up` 첫 대기에서 :8787 포함 준비 완료 ③ (선택) 실제 기기에서 recover
   전 과정 — 남는 항목은 BACKLOG A에 등재.

## 테스트 전략

| AC | 테스트 레벨 | 방법 |
|----|-------------|------|
| AC-1·2 (부분/정상 백업) | 셸(CI) | 임시 HOME + 로컬 bare 원격 + export 성공/실패 시뮬레이션(가짜 npm 스텁) |
| AC-3 (문구 정합) | 셸(CI) | backup-cron 안내 출력에 고정 문구 존재 확인 |
| AC-4·5 (recover extras) | 셸(CI) | extras 포함/미포함 bare repo → recover 복원 단계 호출 → 파일·.bak 확인 |
| AC-6·7 (purge 가드) | 셸(CI) | 임시 HOME, 홈 밖 경로·심링크 → 거부/예외 변수 진행 확인 |
| AC-8 (부분 완료 보고) | 셸(CI) | PATH에 실패하는 가짜 docker → 요약·종료 코드·문구 부재 확인 |
| AC-9 (등록 보존) | 셸(CI) | 가짜 claude(add만 비0) → 기존 등록 잔존 확인 |
| AC-10 (cron 변수) | 셸(CI) | DRY_RUN 출력 파싱 |
| AC-11 (push 안내) | 셸(CI) | 원격을 한 커밋 앞세운 bare repo → 안내·비0 확인 |
| AC-12 (up 타임아웃) | 셸(CI) | 타임아웃 인자·:8787 폴링을 정적 확인 + (가능하면) 무응답 포트 폴링 함수 실측 |
| AC-13 (.env 600) | 셸(CI) | 각 생성 경로 후 `stat` 권한 확인 |
| 전체 회귀 | 라이브 | `make up`·`make smoke`·스택 끈 `make backup` — BACKLOG A 등재 |

## Open questions

- backup.sh와 backup-init.sh의 export 처리 공유 방식 — 함수 소싱 vs 문구·판정만 통일
  (기본안: 소스 공유는 셸 복잡도를 올리므로 문구·정책 통일 + 양쪽 테스트로 고정).
- push 실패의 원인 구분(non-ff vs 인증 vs 네트워크)을 어디까지 나눠 안내할지 —
  기본안: non-ff만 특정 안내, 나머지는 stderr 원문 + 일반 안내.
- purge의 `PURGE_OUTSIDE_HOME` 변수명 — 기존 FORCE/DRY_RUN 관례와 맞는 이름으로 구현
  시 확정.
