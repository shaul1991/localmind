# Evidence-gated 개선 ledger

LocalMind 코어 개선은 **측정된 결함 → 사람 승인 → 구현 1개 → 검증된 결론**의 순서로만 진행할 수 있습니다. `scripts/evidence-cadence.mjs`는 이 경계를 append-only event ledger로 기록하고 검증합니다. 연구 agent, critic, scheduler, 자동 merge 시스템은 아닙니다.

## 보장하는 계약

- 첫 cycle은 `bootstrap`, 후속 cycle은 `iterate`, 검증 후 관찰은 `maintain`입니다.
- 목표별 iteration은 1부터 최대 5까지입니다.
- `implementation_started`에는 proposal hash와 별도의 human authorization hash가 필요합니다.
- 한 canonical ledger에서 진행 중인 구현은 최대 1개입니다. `validated` 또는 `rejected`가 WIP를 닫습니다.
- `validated`는 이전 accepted event를 `supersedes_event_sha256`으로 명시합니다.
- `rejected`는 직전 accepted decision을 대체하지 않으므로 이후 maintain/revalidate가 계속 가능합니다.
- `maintained`와 `assumption_revalidated`는 기존 결정을 수정하지 않고 새 event를 추가합니다.
- terminal event는 validation, lesson, residual-risk artifact의 SHA-256을 모두 요구합니다.
- ID와 SHA-256은 canonical string scalar만 허용하며, raw query, 노트 본문, 파일 경로와 임의 field는 schema에 들어갈 수 없습니다.

## 저장 방식

ledger는 하나의 수정 가능한 JSON 파일이 아니라 순번 segment 디렉터리입니다.

```text
000001.json
000002.json
000003.json
```

각 event는 직전 event hash를 포함합니다. writer는 canonical JSON bytes를 mode `0600` 임시 파일에 기록·flush한 뒤 no-clobber hard link로 다음 순번을 publish하고, staging name을 제거한 뒤 ledger와 parent directory를 모두 flush합니다. staging cleanup까지 성공하기 전에는 성공을 반환하지 않습니다. reader는 stored bytes와 canonical frame의 exact 일치, 연속된 순번, exact action schema, hash chain, 최대 500 events, regular file, `nlink=1`, segment당 32 KiB를 검사합니다. directory entry는 streaming으로 읽어 501번째에서 즉시 거부하며, duplicate JSON key·symlink·외부 hard-link alias도 거부합니다.

## CLI

먼저 전용 private 디렉터리를 만듭니다.

```bash
install -d -m 700 .localmind/evidence-cadence
```

Event JSON은 argv가 아니라 stdin으로 전달합니다. 입력은 최대 32 KiB입니다.

```bash
node scripts/evidence-cadence.mjs append .localmind/evidence-cadence < opaque-event.json
node scripts/evidence-cadence.mjs verify .localmind/evidence-cadence
```

`append` 출력은 `sequence`와 `event_sha256`뿐입니다. `verify` 출력도 event 수, 목표 수, WIP 수, action별 개수와 chain head만 반환합니다. goal ID와 원문 evidence는 출력하지 않습니다. 거부 오류는 입력값이나 절대 경로를 반사하지 않습니다.

## Event schema 요약

모든 입력 event에는 다음 opaque metadata가 필요합니다.

- `goal_id`: 1~64자의 소문자 ASCII ID
- `phase`: `bootstrap`, `iterate`, `maintain` 중 해당 transition에 맞는 값
- `iteration`: 1~5
- `trigger`: `user_request`, `quality_regression`, `reliability_failure`, `scheduled_maintenance`
- `recorded_at`: canonical UTC millisecond timestamp

Action별 추가 필드는 다음과 같습니다.

- `proposed`: `classification=implementation_candidate`, before metric/sample, hypothesis/reproduction/fixture/stop-condition SHA-256
- `implementation_started`: proposal SHA-256, human authorization SHA-256
- `validated`: proposal/validation/lesson/residual-risk SHA-256, after metric/sample, 이전 accepted event SHA-256 또는 첫 결정의 `null`
- `rejected`: proposal/validation/lesson/residual-risk SHA-256
- `maintained`, `assumption_revalidated`: current decision SHA-256, validation SHA-256

SHA-256이 가리키는 상세 artifact는 별도 접근 제어 저장소에 둡니다. ledger에는 민감 원문을 복사하지 않습니다.

## 운영 및 한계

- 이 도구는 schedule을 만들거나 구현을 실행하지 않습니다. 사람 승인 hash와 GitHub의 사람 merge gate를 대체하지 않습니다.
- hash chain은 우발적·부분적 변조를 검출하지만 전자서명이나 OS ACL을 대체하지 않습니다. 동일 권한 사용자가 전체 chain을 다시 쓸 수 있으므로 중요한 chain head는 reviewed commit/PR evidence 같은 별도 정본에 고정합니다.
- SHA-256은 artifact identity만 결속합니다. artifact의 품질·가용성·접근 권한은 별도 검토 대상입니다.
- 같은 권한의 cooperative writers에 대한 no-clobber를 보장합니다. root 또는 hostile filesystem 관리자를 방어하는 저장소는 아닙니다.
- Windows, 자동 VPN 구성, autonomous critic/persona, public-internet 운영, 자동 merge는 지원 범위가 아닙니다.
