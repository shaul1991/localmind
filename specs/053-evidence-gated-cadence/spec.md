# Spec — Phase 6 evidence-gated cadence

## 1. Evidence envelope

`proposed`는 `implementation_candidate` classification, string scalar인 safe opaque goal/metric ID, canonical UTC 시각, explicit trigger, iteration 1~5, finite before metric/sample과 string scalar SHA-256 hypothesis/reproduction/fixture/stop-condition을 요구한다. exact allowlist 밖 field와 암묵 문자열 변환 값은 hash 계산 전에 거부한다.

## 2. State transitions

- 첫 proposal: `bootstrap`, iteration 1
- 다음 proposal: 직전 terminal 뒤 `iterate`, 직전 iteration + 1, 최대 5
- 구현 시작: exact proposal hash + human authorization hash, 한 canonical ledger 내 global WIP 0일 때만 허용
- validated: WIP를 닫고 이전 accepted event를 exact `supersedes_event_sha256`으로 대체
- rejected: WIP를 닫지만 accepted decision을 만들거나 대체하지 않으며, 기존 accepted decision의 maintenance는 계속 허용
- maintained/assumption_revalidated: `maintain` phase에서 current accepted decision을 참조하는 새 event 추가
- validated: finite after metric과 bounded sample size 및 validation, lesson, residual-risk artifact SHA-256 필수
- rejected: validation, lesson, residual-risk artifact SHA-256 필수

## 3. Append-only storage

각 event는 canonical framed SHA-256과 previous-event hash를 가진다. segment는 6자리 연속 순번의 canonical JSON bytes이며 temp file fsync 후 no-clobber hard link로 publish하고 staging unlink 뒤 ledger와 parent directory를 모두 fsync한다. staging cleanup 또는 directory durability 실패는 성공으로 반환하지 않는다. reader는 directory entry를 streaming으로 읽어 501번째에서 중단하고, 최대 500 events, 32 KiB/segment, stored-byte canonical equality, regular file, `nlink=1`, exact schema, 순번·timestamp·hash chain을 검증하며 duplicate key·symlink·alias·gap·tamper를 거부한다.

## 4. Privacy/CLI

append payload는 최대 32 KiB stdin으로만 받는다. argv에는 event를 넣지 않는다. append 출력은 sequence/head hash, verify 출력은 aggregate counts/head hash뿐이다. public 오류는 raw input과 path를 반사하지 않는다.

## 5. Closure contract

Blocker는 deterministic schema/transition/privacy/no-clobber/digest/alias 위반, targeted/full regression, candidate drift뿐이다. scheduler 부재, 전자서명·root 방어·Windows·artifact 저장소·자동 merge 부재는 명시 residual이며 blocker가 아니다.
