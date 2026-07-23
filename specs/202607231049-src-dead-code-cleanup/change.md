# change.md — src 미사용 코드 정리 (죽은 코드 삭제)

## Why

최상위 전제 정렬 재점검(specs/202607231034)의 후속 — 사용자 지시 "src에 사용하지 않는 기능
및 내용도 다 정리". 진입점(MCP 서버 `src/mcp.ts`·scripts·Makefile·CI·셸 스크립트)에서
도달성(reverse-reference)을 전수 추적한 결과:

- `src/util/proc.ts`·`src/util/log.ts`(113줄): 저장소 어디에서도 import 0건 —
  구 게이트웨이 스택의 잔재(great-reduction에서 소비처만 제거되고 본체가 남음).
- `scripts/embed-bench.ts` + `src/eval-metrics.ts`(+테스트, 342줄): 호출처 0건 — npm script·
  Makefile·docs 미등록. 용도(임베딩 모델 벤치)는 bge-m3 선정으로 완료된 일회성 도구.

## What

삭제(전부 git 이력으로 복구 가능):

- `src/util/log.ts`, `src/util/proc.ts` (폴더째)
- `src/eval-metrics.ts`, `src/eval-metrics.test.ts`, `scripts/embed-bench.ts`

유지 판정(도달성 확인됨 — 오탐 방지 기록): `scripts/index-labels.ts`(doctor.sh),
`scripts/asset-dirs.ts`(backup/restore-assets.sh), `src/query-analysis.ts`·`src/report-note.ts`
(make query-report·brain-report — 측정 루프), `src/mcp-http.ts`(mcp.ts 동적 import — 원격 옵션),
`src/retrieval-quality/testkit.ts`(search-event-contract.test.ts가 사용).

~~보류(사용자 판단 대기): `retrieval-quality` 서브시스템~~ → **확정(2026-07-23 사용자 결정:
지금 삭제)**: `src/retrieval-quality/`(testkit.ts 제외 8파일) + 테스트 9파일 +
`scripts/retrieval-quality.ts` + npm script `retrieval:quality` 삭제(~3.2k줄). 근거: 호출처
(make·CI·docs) 0건인 개발용 하네스, git 이력으로 복구 가능 — 임베딩 후속 판단 시 필요하면
되살린다. `testkit.ts`(109줄)는 살아있는 `search-event-contract.test.ts`가 사용하므로 유지.

## AC

- [x] AC-1: 삭제 후 `tsc --noEmit` OK + `npm test` 전체 green. — 실측: 1차(죽은 코드) 246/246,
      2차(RQ 하네스 포함 최종) 177/177 · dist 클린 재빌드 후 smoke:mcp 통과(낡은 산출물 제거).
- [x] AC-2: 삭제 대상 전체의 참조가 저장소에 0건 — 1차 5파일(util 2·eval-metrics 2·embed-bench)
      및 확정 삭제분(retrieval-quality 8파일·테스트 9파일·`scripts/retrieval-quality.ts`·npm
      script `retrieval:quality`) 모두, 정적 import·동적 `await import`·셸 `node --import tsx/esm`
      호출·Makefile·docs 패턴 grep 실측 0건(유지분 testkit·search-event-contract 참조만 잔존).
- [x] AC-3: 유지 판정 파일들의 소비처가 변경 없이 동작. — 스위트 246/246 + smoke:mcp 통과
      (smoke:brain은 실 노트 폴더 오염 방지를 위해 미실행 — 스위트가 brain 경로 커버).

**self-review (Tier 1 — in-session 적대 자기검증 1라운드, 비독립)**: 도달성 판정 재검 —
동적 import(`await import`)·셸에서의 tsx 직접 호출(`node --import tsx/esm scripts/…`)까지
grep 범위에 포함했는지 확인(포함 — doctor.sh·backup-assets.sh에서 index-labels·asset-dirs를
그 패턴으로 발견해 유지 판정). 삭제 대상 전체에 대한 동일 패턴 검색 0건 재확인. blocker 0.

점검 축별 기록(리뷰 대응 보강): (1) AC↔증거 — 본 문서 AC 3건이 각각 실측 증거와 1:1 대응.
(2) 시나리오·엣지 — 동적 import·셸 호출·Makefile 타깃·CI 스위트 경로를 엣지로 전수 검사,
dist 낡은 산출물 잔존 케이스 발견 → 클린 재빌드로 해소. (3) 로직·경계 버그 — 코드 추가 없음
(삭제만), 참조 무결성은 tsc·스위트 177/177이 검증. (4) 복잡도·보안 — 실행 표면 축소(-3.6k줄,
npm script 1개 제거)로 감소, 신규 표면 없음. (5) Live-Verify Facts — 외부 API·버전 등 낡을 수
있는 사실 주장 없음(도달성은 저장소 내부 사실로 라이브 검증 대상 아님) — 해당 없음 사유 기록.

## 티어 근거

**Tier 1** — 도달 불가능한 죽은 코드 삭제(행동 불변이 자명하지 않아 Tier 0 아님 — 도달성
판정이 개입). 하드 신호 없음: 계약·스키마·보안·전역 상태 무관, 가역적(git 이력), 결정적
테스트(스위트·타입체크)로 전체 커버.
