---
title: "간헐 플레이크 수정 — prune-guard 자식 reindex의 embed 타임아웃/재시도 조정"
audience: both
---

# Change: 간헐 플레이크 수정 — embed 타임아웃/재시도 조정

## 왜(why)

`npm test` 첫 실행에서만 간헐적으로 1 fail(재실행 green)이 4회 관찰됐다(7/20 ×2, 7/21 ×2).
재현 루프(12회 중 3회차)로 처음 실패 로그를 포착: `brain.test.ts` "손상 색인 방어…"(프루닝
가드 020)의 자식 `scripts/reindex.ts`가 embed fetch를 **120,092ms에 abort** —
`EMBED_TIMEOUT_MS ?? 120000` 상한과 일치. 테스트 env가 `EMBED_RETRIES: "1"`이라 재시도
0회로 1번 굶주림 = 즉사. 기질은 10-way 파일 병렬 + 자식 spawn마다 cold tsx 컴파일의
CPU/디스크 경합(무거운 작업 직후 첫 실행에서만 발현, 재실행은 워밍업 green — 관찰 패턴과
정확히 일치). 제품 결함 아님 — 부하 조건의 테스트 인프라 경합.

## 무엇을(what)

`src/brain.test.ts`의 `runReindexCli` childEnv 한 곳만 조정(제품 코드 무변경):
`EMBED_TIMEOUT_MS: "15000"` 추가 + `EMBED_RETRIES: "1"` → `"3"`. 로컬 스텁 정상 응답은
ms 단위라 15초는 여유 10배 이상이고, 일시 굶주림은 백오프 재시도(1.5s·3s)로 흡수 —
최악 총 ~50초 < 현행 120초 즉사. (참고: retry 횟수 assert가 있는 다른 테스트는
runReindexCli를 쓰지 않음 — 판정 오염 없음.)

관찰 백로그(이번 범위 밖 — 증거 미포착 예측 용의): query-log 폴링 2초 예산(brain.test.ts,
자백 주석 "CI에서 발현된 경합")·delegation waitLog 3초·stale-lock 5초 assert·bootstrap
PID 포트. 다음 플레이크 포착 시 그 로그로 판정.

## AC (Given-When-Then · 테스트 1:1)

- [x] **AC-1**: Given 조정된 childEnv, When 프루닝 가드 describe를 포함한 brain.test.ts를
  실행하면, Then 전부 green이고 childEnv에 두 값이 실제로 설정돼 있다(코드 검사).
- [x] **AC-2 (엣지)**: Given 전체 스위트, When 연속 3회 실행하면, Then 3회 모두 green
  (플레이크 재발 없음 관찰 — 부하 의존이라 결정적 재현은 불가, 관찰 근거로 기록).

## 티어 근거

**Tier 1(작음).** 하드 신호 전부 비해당 — 테스트 파일 1곳의 env 값 조정, 제품 코드·계약
무변경, blast-radius = 해당 describe. Tier 0 아님: config 값 변경은 Tier 0 제외(행동 영향
확인 필요 — AC로 검증). 검증가능성(결정적 테스트 커버·가역)이 Tier 1 지지.
