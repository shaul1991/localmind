# Plan: Device Sync Pipeline (기기 동기화 파이프라인)

> **044 확장 포인터**: 수신 워커의 자산 배포·마커 검증 단계에 workflow target별 marker 확인이 추가된다(specs/044, `asset-dirs.ts`의 target 경로 노출 재사용). 흐름·이름은 유지된다.

상위: [goal](goal.md) · [spec](spec.md)

## 도메인 경계

- **오케스트레이션(주 기기)**: 순서·게이트·부분 완료 보고. 원격의 노트 경로는 모른다 —
  host·원격 localmind 경로만 안다.
- **수신(원격 기기)**: 원격 자체 `.env`로 노트 저장소·자산 경로를 자기 해석하고 pull·
  build·검증·배포한다. **"주 기기 오케스트레이션 + 원격 자기 기술"** 로 경계를 나눈다 —
  이 분리 덕에 주 기기 설정이 host+경로로 최소화되고, 수신 워커는 ssh 없이 단독
  테스트된다(변경 국소화).
- **재사용, 재발명 금지**: 백업·복원·색인·배포는 019가 이미 소유한다. device-sync는
  그 위에 순서와 원격 배선만 얹는다 — `make backup`(주)·`agents:deploy`/`skills:deploy`
  /`build`/`seed.test.ts`(원격)를 호출할 뿐 로직을 복제하지 않는다.

## 영향 모듈 (구체 경로)

신규:
- `scripts/device-sync.sh` — 오케스트레이터(FR-1~4,6,7). 주 기기에서 실행.
- `scripts/device-sync-receive.sh` — 원격 수신 워커(FR-5,7). 원격에서 ssh로 호출되며,
  ssh 없이도 단독 실행·테스트 가능(경로는 인자/원격 `.env`로 해석).
- `scripts/device-sync-pipeline.test.sh` — ssh/gh/npm 스텁 + 로컬 bare repo 기반
  단계 로직 테스트(CI 실행). `scripts/device-sync-e2e.test.sh`(019) 관례 계승.

변경(순수 추가):
- `scripts/backup.sh` — 실패 급 구분 신호(코어 실패 exit 2 / 소프트만 exit 1 — 재검
  중대-A. 기존 소비자는 비0 여부만 보므로 하위호환).
- `Makefile` — `##@ 백업/복구(git)` 섹션에 `device-sync` 타깃 1개. `HOST`·`REMOTE_DIR`·
  `SYNC_SKIP_CI`·`SYNC_TEST_CMD`를 환경으로 전달(reindex 타깃의 명시 전달 관례 계승 —
  make 암묵 export 금지).
- `.env.example` — `NOTES_REPOS` 아래에 "기기 동기화" 섹션(`SYNC_DEVICES`·
  `SYNC_ENV_PREP`), 시크릿 금지·ssh 키 권장 주석.
- `docs/usage.md`("백업 · 새 기기 복구" 절)·`docs/faq.md`("5. 운영" 절) — device-sync
  1줄 설명 + 미설정·ff 불가·node 환경 처방.

재사용(무변경 source):
- `scripts/lib/read-env.sh` — `read_env_val`(SYNC_DEVICES 비실행 파싱)·`mask_url`.
- `scripts/lib/notes-dir.sh` — 수신 워커가 원격 `.env`의 `NOTES_DIR` 해석에
  `resolve_notes_dir`·`notes_dir_paths`·`canon_path` 재사용(NOTES_REPOS 파싱 아님 —
  pull 대상은 "노트 폴더 중 git 워크트리", 리뷰 중대-2).
- `scripts/restore-assets.sh` — 수신 워커의 자산 복원+배포 경로(미러→레지스트리 복사·
  삭제 전파·배포 — bare deploy 금지, 리뷰 중대-1).
- `src/agents/deploy.ts:14`(`MANAGED_MARKER`) — 검증 grep 문자열의 정본.

## 단계 (의존 순서)

1. **인터뷰 게이트 — 완료(2026-07-05)**: 인터뷰 전 질문 6건은 확인을 마쳐 spec
   "확정 사항"으로 이관·종결됐고, 결정 노트도 적재됐다(결정 로그 규약). 잔여 OQ는
   `HOST=all` 1건(기기 3대+ 시 재론)뿐 — 재인터뷰 불요.
2. **수신 워커 TDD**: `device-sync-receive.sh` — 노트 pull(per-repo 계속)·build 게이트·
   seed test 게이트·배포·마커 검증·node 부재 중단. 먼저 `device-sync-pipeline.test.sh`에
   워커 대상 실패 테스트(AC-8~12,17)를 쓰고 통과시킨다. ssh 불필요 — 로컬에서 직접 실행.
3. **오케스트레이터 TDD**: `device-sync.sh` — HOST 해석·CI 게이트·backup·코드 pull·
   수신 호출·순서·fail-fast·부분 완료 보고. 가짜 `ssh`/`gh`/`npm` 스텁 도입 후 AC-1~7,
   13~16,18 통과.
4. **Makefile 타깃**: `device-sync` 추가 + `make help` 노출.
5. **설정·문서**: `.env.example` 섹션 + `docs/usage.md`·`docs/faq.md` 문구.
6. **self-review(규약 5)**: 분리 컨텍스트 서브에이전트로 FR·AC 1:1 추적, 엣지(빈
   SYNC_DEVICES·node 부재·ff 불가·CI red·gh 부재), 파괴 방지 불변식(AC-18), 원격 명령
   주입(설정 검증), 종료 코드 정합을 결함 찾기 자세로 재검토. clean 후에만 완료 보고.

## 테스트 전략

- **CI 실행 가능(모의)**: `scripts/device-sync-pipeline.test.sh` — `device-sync-e2e.test.sh`
  구조 계승(임시 TMP + 로컬 bare repo + 가짜 `npm`, pipefail 없는 `assert`로 SIGPIPE
  플레이키 방지). 추가 스텁:
  - **가짜 `ssh`**: `ssh <host> <cmd>` → `<cmd>`를 로컬 "원격" 디렉토리에서 실행하고
    호출 인자를 로그에 기록(순서·prep 주입 검증).
  - **pass-through 로깅 `git` shim**(리뷰 중대-5): 전 하위명령을 `GIT_LOG`에 기록한 뒤
    실 git 실행 — ff 판정(실 git 필요)과 파괴 하위명령 부재 검증(AC-18)을 동시에 충족.
    가짜 ssh 로그만으로는 워커 내부 git 호출을 못 잡는다.
  - **부재 shim**(리뷰 중대-6): "gh 미설치"·"node 부재"는 shim을 안 두는 방식(PATH
    prepend라 시스템 실물이 새어 나와 비결정)이 아니라 **exit 127 스텁으로 덮어** 결정화.
    구현의 부재 판정은 실행 가능 여부 기준.
  - **가짜 `gh`**: 환경변수로 CI 결론을 구성(success/failure/in-progress/부재·미인증).
  - **로컬 bare repo 2개**: 원격 localmind repo·노트 저장소 역할 — ff 가능/불가를
    커밋으로 연출(AC-6/7/9).
- **backup.sh exit 신호 회귀(최종 확인 경미-H)**: 015 backup.test.sh는 `-ne 0`만 봐서
  1↔2를 구분하지 못한다 — 코어 실패가 실수로 1을 뱉으면 device-sync가 소프트로 오인해
  stale 코어를 전파한다(중대-A가 막은 경로의 재개통). backup.test.sh에 정밀 케이스를
  추가한다: "메모리만 실패 → **정확히 exit 1**", "push 거부/커밋 실패 → **정확히
  exit 2**".
- **원격 검증 게이트는 seed 단독**: `node --import tsx/esm --test src/agents/seed.test.ts`.
  전체 `npm test`(수 분)는 CI(①)가 push 시점에 이미 게이트하므로 원격 재실행 안 함 —
  spec Context 근거. `SYNC_TEST_CMD`로 재정의 여지만 남긴다.
- **정직한 한계 분리**: 실제 ssh·실기기(원격 node·nvm·gh 로그인)는 CI에서 재현 불가 →
  **실기기 수동 스모크 체크리스트**로 분리 명시(plan에 절차: 두 기기에서 성공 경로 1회,
  ff 불가 연출 1회, node 부재 기기 1회). 모의 테스트가 실기기 성공을 보장한다고 과장하지
  않는다(부정 앵커 금지 — 026~030 관례).

## 주의점 (부정 앵커 금지 — 사실 서술)

- **의존 체인 vs 독립 단계**: 015의 "단계는 서로의 인질이 아니다"를 오케스트레이터 전체에
  일괄 적용하면 안 된다 — 의존 체인(CI→backup→코드pull→수신)은 fail-fast여야 깨진/빈
  전파를 막는다. "계속"은 수신 워커 안의 **독립 노트 저장소 여러 개** pull에만 적용한다.
- **종료 코드 합성**: 오케스트레이터는 ssh로 받은 수신 워커의 종료 코드를 삼키지 말고
  최종 요약·종료 코드에 반영한다(backup.sh가 커밋 실패를 삼키지 않은 self-review 교훈).
- **원격 명령 주입(리뷰 경미-9 분리)**: `SYNC_DEVICES`의 host·경로·라벨·`REMOTE_DIR`은
  형식 검증 후에만 ssh 명령에 합성하고, 경로는 **단일 인용으로 감싸** 공백·특수문자를
  무해화한다. 반면 `SYNC_ENV_PREP`는 본질상 임의 원격 셸이라 형식 검증이 불가능하다 —
  "신뢰되는 입력(이 값을 쓰는 사람 = 원격 셸 실행 권한자)"으로 분류하고 그 위험을
  .env.example 주석에 문서화한다(형식 검증 대상으로 묶지 않는다 — 모순 제거).
- **마커 수명주기 오판**: 검증 grep은 019의 `.localmind-mirror` 마커가 아니라 배포
  산출물의 `managed-by: localmind`(deploy.ts:14)를 본다 — 둘을 혼동하지 말 것.

## supersede / 문서 정합

- device-sync는 019의 결정을 **뒤집지 않는다**(순수 추가) — supersede 표기 불필요.
- Makefile `make help`·`docs`에서 recover/restore와 device-sync의 경계(부트스트랩 vs
  증분 최신화)를 한 줄로 구분해, 사용자가 빈 기기에 device-sync를 오용하지 않게 한다.
