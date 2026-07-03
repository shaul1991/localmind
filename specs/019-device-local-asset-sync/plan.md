# Plan: Device-Local Asset Sync (기기 로컬 자산 동기화 완결)

상위: [goal](goal.md) · [spec](spec.md)

## 접근 요약

새 서비스나 데몬을 만들지 않는다 — 006/015가 다진 backup/restore 셸 파이프라인에
자산 단계(레지스트리·스킬 미러, 쿼리 로그)를 **추가**하고, doctor/reindex/backup
진입점에 `NOTES_DIR` 정합·폴백 로직을 넣는다. 모든 단계는 015 정책(부분 실패 허용
+ 요약 + 비0 종료)을 계승하고, 삭제·덮어쓰기가 일어나는 모든 경로에는 spec의
"공통 가드 원칙"(판정 불확정 시 파괴 금지 + 빈/부재 소스 가드)을 먼저 둔다.
recover는 노트 연결 전이라 멀티 repo 자산의 올바른 위치를 알 수 없으므로 —
기본 구성만 반영하고 "notes-connect 후 `make restore` 재실행"을 안내하는 2단
흐름으로 설계한다(spec FR-2). 새 동작은 opt-in 또는 무해한 기본값으로 하위호환을
지킨다(자산 미사용 사용자의 backup은 계속 0 종료 — AC-6). Open questions(정본
위치·쿼리 로그 기본값·삭제 전파)은 **구현 착수 전** 사용자와 확정한다.

이 스펙은 두 개의 기존 결정을 의도적으로 개정한다 — 004(쿼리 로그 로컬 전용 →
opt-in 한정 완화), 016 FR-9(복원≠배포 → 복원 맥락 한정 자동 배포). 두 문서에
개정(supersede) 표기를 남기는 것까지가 이 작업의 범위다.

## 도메인 경계 (DDD)

- **백업/복원 파이프라인**(셸): `backup.sh`·`recover.sh`·Makefile restore 타깃 —
  자산 이동의 소유자. 자산별 단계는 독립(인질 금지).
- **레지스트리/스킬 정본 판정**(TS): `src/agents/registry.ts`(`agentsDir()`)·
  `src/agents/skills.ts` — 정본 위치 판정의 단일 소스. 셸은 이 판정을
  **재구현하지 않고 조회**한다(노드 원라이너 또는 전용 소형 스크립트) —
  `LOCALMIND_AGENTS_DIR` 재지정까지 코드와 항상 일치해야 하므로.
- **색인**(TS): `src/brain.ts` — 미러 경로 색인 제외(FR-1)만 추가. 폴더 해석
  자체는 변경하지 않는다(env가 입력).
- **진단**(셸): `doctor.sh` — 읽기 전용 + 항상 exit 0 원칙 유지, NOTES_DIR 정합
  점검 추가.
- **설정 정본**(셸): `mcp-install.sh`·`notes-connect.sh` — `.env` 기록의 소유자
  (Open question 1 확정 후).

## 영향 모듈

- `scripts/backup.sh` — FR-1(자산 미러 호출), FR-3(쿼리 로그 opt-in).
- 신규 `scripts/backup-assets.sh` — 미러·가드·비가역 고지 본체.
  backup-extras 패턴(전용 스크립트 + 전용 테스트) 답습.
- 신규 `scripts/restore-assets.sh` — 복원·`.bak` 보존·삭제 전파·배포 재실행·
  쿼리 로그 병합(보존 기간 적용) 본체.
- `Makefile` restore 타깃 — restore-assets 배선, 재색인의 `.env` 폴백(FR-6),
  기본값 주입이 폴백을 가리지 않도록 전달 방식 조정.
- `scripts/recover.sh` — FR-7(사전 안내) + 자산 반영은 **마커 기반 판정**으로
  기본 구성만(마커 있으면 보류 + 말미 순서 안내, AC-15), `set -e` 하에서 실패
  허용 블록(서브셸 + 종료 코드 수집)으로 감싸 015 정책과 정합.
- `scripts/doctor.sh` — FR-5. MCP 등록 조회를 함수로 분리(스텁 주입 가능하게).
- `scripts/mcp-install.sh`·`notes-connect.sh` — FR-6(`.env` 기록, 부재 시 생성 +
  600).
- `src/brain.ts` — FR-1의 미러 색인 제외. **마커 파일(`.localmind-mirror`) 방식**:
  색인 프로세스(MCP 서버)는 `BACKUP_DIR`를 모르므로 env 배관 대신 미러 폴더가
  스스로를 식별하게 한다 — backup-assets가 마커를 기록하고 brain은 마커 폴더를
  건너뛴다.
- `scripts/reindex.ts` 진입 경로(Makefile) — FR-6 폴백·경고.
- specs/004·016 문서 — 개정(supersede) 표기.
- `docs/faq.md`·`docs/usage.md` — 기기 전환 가이드, 쿼리 로그 비가역 고지.

## 단계 (task 분해 가능)

1. **Open questions 확정** — ✅ 완료(2026-07-04): 5건 모두 제안대로 사용자 확정.
   spec "확정 사항" 절 갱신 + 004 goal·016 spec FR-9에 supersede 표기 완료.
2. **FR-6 (정본 단일화 + 폴백)** — mcp-install/notes-connect의 `.env` 기록,
   셸 진입점 폴백, Makefile 전달 방식. **자산 단계보다 먼저** — FR-1 가드의
   1차 방어선이므로 순서가 안전을 만든다.
3. **FR-1 (backup 자산 미러)** — `backup-assets.sh` 신설: 판정 조회(agents/skills
   override 각각) → realpath 비교 → 후퇴 가드 → 미러(삭제 반영, `*.bak-*` 제외,
   마커 기록) → 빈 소스 가드(+`BACKUP_CONFIRM_EMPTY_ASSETS` 탈출구) → 미사용자
   조용히 스킵. brain.ts 마커 색인 제외 포함. 실패 테스트 먼저(AC-1~10).
4. **FR-2 + FR-4 (restore 자산)** — `restore-assets.sh` 신설: 후퇴 가드 →
   `.bak-<ts>` 보존 → 교체 → 삭제 전파(백업에 폴더 존재 시에만, `*.bak-*` 제외)
   → 배포 재실행 → 쿼리 로그 병합(dedupe + 백업 유래만 보존 기간 적용).
   Makefile restore와 recover 양쪽 배선(015가 잡은 "restore에만 배선" 재발 방지)
   — 단 recover는 기본 구성만 반영 + 말미 순서 안내(AC-15). AC-11~15, AC-19~21.
5. **FR-3 (쿼리 로그 backup) + FR-7 (recover 안내)** — opt-in 분기·기기 식별자
   정제·최초 1회 비가역 고지, recover 사전 안내. AC-16~18, AC-27.
6. **FR-5 (doctor 정합 점검)** — MCP 등록 조회 함수 + 비교 + 안내. AC-22.
7. **문서 + 기기 전환 E2E** — 임시 HOME 두 개로 "기기 A backup → 기기 B recover"
   왕복 검증(삭제 반영·메모리 수·로그 건수 일치 = goal Success metrics), docs
   갱신, self-review(AGENTS.md 규약 — 독립 에이전트).

## 테스트 전략

- 기존 셸 테스트 관례 답습: 파일별 `*.test.sh`, 임시 디렉토리 + 로컬 bare repo,
  라이브 스택(도커) 불필요, CI(node 22)에서 실행. **AC-1~27을 테스트와 1:1
  매핑**한다.
- FR-6의 notes-connect 경로는 mcp-install 재사용으로 자동 충족되는 구조 —
  "재사용이 유지되고 있음"을 테스트로 고정한다(AC-23 후반부).
- 판정 조회(레지스트리/스킬 위치)는 실제 TS 로직을 호출해 검증 — 셸 재구현이
  없음을 테스트로 보증(`LOCALMIND_AGENTS_DIR` 케이스 포함).
- 배포 재실행(FR-2)은 PATH 앞에 스텁을 두어 호출 여부·실패 전파만 검증(스택·
  claude CLI 비의존). recover의 실패 허용은 스텁 실패 + 종료 코드/요약
  검증(AC-14). 기기 식별자(AC-17)는 hostname을 스텁/env 주입으로 고정해 검증.
- doctor(FR-5)는 MCP 등록 조회 함수에 스텁 주입 — "조용히 건너뜀"(오탐 금지)도
  AC-22로 검증.
- 멱등성(AC-19)은 같은 restore를 **즉시 연속** 2회 실행 후 diff 없음으로 검증
  (보존 기간 컷오프의 시간 이동으로 인한 플레이키 방지 — spec FR-4의 한정과
  일치). 가드(AC-3·5·13)는 미러/로컬 내용 불변 + 비0 종료로 검증.
- 색인 제외(AC-10)는 임시 노트 폴더 구성으로 reindex 대상 목록 검사(임베딩 스택
  불필요한 수준까지 — 대상 열거 단계에서 확인).
- 플레이키 예방: 파이프라인에 `head`/`grep -q` 조합 시 pipefail-SIGPIPE 클래스
  주의(52bbdce 교훈) — assert 헬퍼 재사용.

## Open questions

- 없음 — 단계 1의 5건이 2026-07-04 모두 확정됐다(spec "확정 사항" 절 참조).
  단계 2~5는 제안 설계 그대로 진행한다.
