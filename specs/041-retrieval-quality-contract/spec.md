# Spec: 검색 품질 측정 계약

## Status

Draft. 이 문서는 구현 계약이며 아직 구현·검증 완료를 표시하지 않는다.

## Terminology

- **결과 반환(result return)**: 검색 실행이 하나 이상의 hit를 반환한 상태. 관련성 판정이 아니다.
- **관련성(relevance)**: 고정 ground truth와 대조하여 hit가 질의의 정보 요구를 충족한다고 판정한 상태.
- **양성 질의(positive)**: `relevantDocIds`가 하나 이상인 평가 질의.
- **명시적 no-match 질의(negative)**: corpus에 답이 없도록 설계되었고 `relevantDocIds`가 빈 평가 질의.
- **canonical source**: 여러 chunk가 생겨도 하나로 세는 원본 문서 식별자. fixture에서는 Markdown
  frontmatter의 `id`다.
- **canonical top-5 ranking**: production이 반환한 raw top 5 hit를 순서대로 순회하면서 같은 canonical
  source의 두 번째 이후 chunk를 제거한 순위다. raw hit를 5개보다 더 읽어 빈자리를 보충하지 않는다.
- **top score**: 검색기가 반환한 첫 hit의 원점수. 결과가 없으면 보고서에는 `null`, 계산 내부에서는
  모든 유한 점수보다 작은 값으로 취급한다.
- **양성 탐지율(positive detection rate)**: 후보 임계값에서 양성 질의의 top score가 임계값 이상인
  비율(`TP / 24`). 정답 문서를 찾았는지를 뜻하는 recall@5와 다른 점수 분리 지표다.
- **후보 임계값**: 평가 데이터로 계산해 보고하는 단일 점수 경계. 041에서는 운영 검색에 적용하지 않는다.

## Fixed Evaluation Data

### Corpus Contract

구현은 `tests/fixtures/retrieval-quality/corpus/`에 아래 12개 합성 Markdown 문서를 만든다. 각 파일은
아래 frontmatter template과 해당 ID의 canonical body를 합친 정확한 UTF-8 내용 및 마지막 LF 1개를
가진다. placeholder 값은 바로 아래 표의 ID와 Title이다. 본문을 구현자가 다시 쓰거나 사실을 추가하지
않는다.

```yaml
---
id: <ID>
title: <Title>
type: reference
status: active
visibility: shared
updated_at: "2026-01-01T00:00:00Z"
---
```

| ID / file | Title | 반드시 포함할 고정 내용 |
|---|---|---|
| `EVAL-001` / `offline-notes-sync.md` | 오프라인 노트 동기화 | 오프라인 우선 저장, 재연결 시 동기화, 충돌 복사본 보존 |
| `EVAL-002` / `search-index-rebuild.md` | 검색 인덱스 재구축 | schema 변경 뒤 derived index 재구축, 정본 Markdown 불변 |
| `EVAL-003` / `capture-triage.md` | 캡처 분류 정책 | 새 캡처는 restricted/draft, 사람의 분류 뒤 상태 변경 |
| `EVAL-004` / `search-observability.md` | 검색 관측성 | latency, result count, unique source count 기록, 질의 원문 제외 |
| `EVAL-005` / `device-backup.md` | 장치 백업 런북 | 15분 주기 staging, 실패 시 다음 주기 재시도, 정본 보호 |
| `EVAL-006` / `api-token-rotation.md` | API 토큰 교체 | 새 토큰 검증, 이전 토큰 폐기, health check 확인 |
| `EVAL-007` / `lentil-soup.md` | 렌틸 수프 조리법 | 붉은 렌틸, 커민, 25분 끓이기 |
| `EVAL-008` / `busan-weekend.md` | 부산 주말 일정 | 자갈치시장, 해안열차, 2일 동선 |
| `EVAL-009` / `basil-care.md` | 바질 관리 | 겉흙 2cm가 말랐을 때, 아침 물주기, 배수 확인 |
| `EVAL-010` / `dependency-rule.md` | 의존성 규칙 | 의존성은 안쪽 정책으로 향함, 업무 규칙과 프레임워크 분리 |
| `EVAL-011` / `release-checklist.md` | 릴리스 체크리스트 | 테스트, changelog, tag, rollback 절차 확인 |
| `EVAL-012` / `accessible-meeting.md` | 접근 가능한 회의 | 사전 agenda, captions, 키보드 접근 확인 |

외부 장소·도구에 대한 설명은 fixture의 합성 텍스트일 뿐 최신 운영 사실의 근거로 사용하지 않는다.

### Canonical Markdown Bodies

#### `EVAL-001`

```markdown
# 오프라인 노트 동기화

노트는 네트워크가 없어도 먼저 장치의 로컬 저장소에 기록한다. 연결이 끊긴 동안 만든 변경은 삭제하거나 임시 메모로 낮추지 않고 동기화 대기열에 둔다.

장치가 다시 연결되면 대기 중인 변경을 원격 저장소와 동기화한다. 같은 노트가 양쪽에서 바뀌었다면 어느 한쪽을 조용히 덮어쓰지 않고 충돌 복사본을 별도 파일로 보존해 사용자가 비교할 수 있게 한다.
```

#### `EVAL-002`

```markdown
# 검색 인덱스 재구축

검색 schema가 바뀌면 파생 검색 인덱스를 새 형식으로 다시 구축한다. 인덱스는 검색 속도를 위한 산출물이며 원본 지식의 정본이 아니다.

재구축 과정은 canonical Markdown 파일의 내용과 경로를 수정하지 않는다. 파생 인덱스가 손상되거나 사라져도 정본 Markdown에서 다시 만들 수 있어야 한다.
```

#### `EVAL-003`

```markdown
# 캡처 분류 정책

새로 들어온 캡처는 자동으로 `visibility: restricted`와 `status: draft`에서 시작한다. 이 초기 상태는 아직 사람이 공개 범위와 장기 보존 가치를 확인하지 않았다는 뜻이다.

사람이 내용을 읽고 분류를 마친 뒤에만 상태나 visibility를 변경한다. 자동화는 초안을 만들 수 있지만 사람의 검토를 완료된 분류로 가장하지 않는다.
```

#### `EVAL-004`

```markdown
# 검색 관측성

검색 관측 기록은 한 번의 실행이 얼마나 오래 걸렸는지 나타내는 latency와 반환된 hit 수를 남긴다. 여러 chunk가 같은 문서에서 왔을 수 있으므로 hit 수와 별도로 canonical 문서 기준 unique source count도 기록한다. 결과가 있다는 사실과 결과가 질문에 관련 있다는 판단은 서로 다른 값으로 다룬다.

운영 로그에는 사용자의 검색어 원문을 복제한 분석 snapshot을 새로 만들지 않는다. 품질 평가가 필요하면 공개 가능한 합성 query ID와 ground truth를 사용한다. 운영 질의에 클릭이나 사람의 판정이 없다면 관련성을 점수나 결과 개수에서 추측하지 않고 `not_judged`로 둔다.

관측 필드는 검색 순서나 반환 개수를 바꾸지 않는 부가 정보다. 로그 쓰기가 실패해도 검색 응답은 계속되어야 하며, 오류 상세에 토큰이나 홈 디렉터리 같은 비밀 정보를 덧붙이지 않는다. 오래된 행에 새 필드가 없는 것은 정상적인 하위 호환 상태로 읽는다.

점수 분포는 검색 결과가 항상 존재하는 환경에서도 무관한 결과를 찾는 데 도움을 준다. 다만 측정한 후보 임계값을 곧바로 운영 필터로 사용하지 않는다. 고정 corpus에서 양성 질의와 답이 없는 질의를 함께 비교하고, 별도 제품 결정이 있을 때만 검색 정책 변경을 검토한다.
```

#### `EVAL-005`

```markdown
# 장치 백업 런북

장치의 변경분은 15분 주기로 staging 영역에 모아 백업한다. staging은 전송 중 실패가 canonical 원본을 훼손하지 않도록 원본과 분리한다.

한 주기의 백업이 실패하면 원본을 지우거나 성공으로 표시하지 않는다. 실패 내역을 남기고 다음 15분 주기에서 다시 시도하며, 복구 검증이 끝날 때까지 canonical 데이터를 보호한다.
```

#### `EVAL-006`

```markdown
# API 토큰 교체

토큰 교체는 새 토큰을 먼저 발급해 제한된 요청으로 검증하는 순서로 진행한다. 새 자격 증명이 실제 서비스에서 동작하는지 health check로 확인하기 전에는 이전 토큰을 폐기하지 않는다.

health check가 성공하면 이전 토큰을 폐기하고 더 이상 사용할 수 없는지 확인한다. 토큰 값 자체는 문서나 로그에 기록하지 않고 식별 가능한 이름과 교체 상태만 남긴다.
```

#### `EVAL-007`

```markdown
# 렌틸 수프 조리법

냄비에 씻은 붉은 렌틸과 물을 넣고 커민으로 향을 낸다. 끓기 시작하면 불을 낮춰 바닥이 눌어붙지 않도록 가끔 저어 준다.

렌틸이 부드럽게 풀어질 때까지 25분 동안 끓인다. 마지막에 농도를 확인하고 필요한 만큼 물을 더하되, 정해진 핵심 재료인 붉은 렌틸과 커민은 바꾸지 않는다.
```

#### `EVAL-008`

```markdown
# 부산 주말 일정

첫째 날에는 자갈치시장을 둘러본 뒤 주변 도보 구간을 이용한다. 둘째 날에는 해안열차를 타는 일정으로 이동 거리가 겹치지 않게 배치한다.

전체 여행은 2일 동선이다. 이 문서는 부산 주말의 자갈치시장과 해안열차 조합만 다루며 다른 도시의 예약 시간이나 숙박 정보는 포함하지 않는다.
```

#### `EVAL-009`

```markdown
# 바질 관리

바질 화분은 표면만 보고 매일 물을 주지 않는다. 손가락으로 확인했을 때 겉흙 2cm가 말랐을 때 물을 주는 것을 기준으로 삼는다.

물주기는 기온이 오르기 전인 아침에 하고 화분 아래로 물이 빠지는지 배수를 확인한다. 받침에 고인 물은 남겨 두지 않는다.
```

#### `EVAL-010`

```markdown
# 의존성 규칙

업무 규칙은 데이터베이스, 웹 프레임워크, 명령줄 도구 같은 바깥 기술의 세부 구현을 직접 알지 않는다. 의존성은 바깥 장치에서 안쪽 정책으로 향하며, 안쪽 정책은 자신이 필요한 좁은 포트를 정의한다. 바깥 adapter가 그 포트를 구현하면 정책 테스트는 실제 프레임워크 없이도 실행할 수 있다.

도메인 경계는 파일 수를 늘리기 위한 형식이 아니라 상태와 결정의 소유자를 하나로 만드는 수단이다. 저장 형식의 원자성은 저장소 경계가, 실행 중 single-flight는 실행기 경계가 소유한다. 같은 mutable state를 두 모듈에 복제하지 않고 composition root가 production 인스턴스를 한 번만 조립한다.

프레임워크와 업무 규칙을 분리해도 외부 동작은 저절로 보존되지 않는다. 리팩터링 전 characterization test로 공개 반환값, 오류, 초기화 시점과 backend에 전달한 입력을 고정한다. 이후 adapter는 변환을, application core는 use case를, domain policy는 판단을 맡도록 의존 방향을 확인한다.

순환 의존을 끊기 위해 모든 코드를 공유 유틸리티로 옮기지 않는다. 순수 계산만 공용으로 두고 파일 I/O, 환경 설정, cache와 lock은 명시된 소유 경계에 남긴다. 구조 테스트와 사용자 시나리오 테스트를 함께 통과해야 분리가 완료된 것으로 본다.
```

#### `EVAL-011`

```markdown
# 릴리스 체크리스트

릴리스 tag를 만들기 전에 자동 테스트가 통과했는지 확인하고 사용자에게 보이는 변경을 changelog에 기록한다. 결과가 불확실한 검증을 성공으로 표시하지 않는다.

tag 이후 문제가 생길 때 사용할 rollback 절차와 이전 버전을 확인한다. 테스트, changelog, tag, rollback 네 항목이 모두 확인되어야 릴리스 점검을 닫는다.
```

#### `EVAL-012`

```markdown
# 접근 가능한 회의

회의 전에 agenda를 공유해 참여자가 내용을 미리 읽을 시간을 준다. 음성 정보는 captions를 켜서 소리를 듣기 어려운 참여자도 같은 흐름을 따라갈 수 있게 한다.

회의 도구의 주요 동작을 마우스 없이 키보드로 실행할 수 있는지 확인한다. agenda, captions, 키보드 접근은 회의 시작 전에 점검한다.
```

평가 환경은 `BRAIN_CHUNK_SIZE=400`으로 고정한다. validator는 `EVAL-004`와 `EVAL-010`이 현재
`chunkText`에서 각각 2개 이상 chunk가 되는지 확인한다. 이 조건은 duplicate chunk가 top-k에 나타날 수
있는 corpus를 보장하지만 production 정렬이나 결과를 조작하지 않는다.

### Query Contract

`tests/fixtures/retrieval-quality/queries.ko.json`은 UTF-8 JSON이며 최상위 `schemaVersion: 1`과
`queries` 배열을 가진다. 각 항목은 `id`, `kind`, `query`, `relevantDocIds`, `category`,
`rationale`을 가진다. `kind`는 `positive` 또는 `no_match`다. `category`와 `rationale`은 아래 표의 마지막
열 문자열을 둘 다 그대로 사용한다. JSON object key 순서는 `id`, `kind`, `query`, `relevantDocIds`,
`category`, `rationale`로 고정한다. 다음 40개를 정확히 포함한다.

#### Positive: 24

| ID | Query | relevantDocIds | Category |
|---|---|---|---|
| `P01` | 인터넷이 끊긴 동안 쓴 노트는 다시 연결되면 어떻게 동기화하나? | `EVAL-001` | Korean paraphrase |
| `P02` | 동기화 충돌이 났을 때 원문을 덮어쓰지 않는 방법 | `EVAL-001` | near-term paraphrase |
| `P03` | 검색 스키마가 바뀐 뒤 무엇을 다시 만들어야 하나? | `EVAL-002` | Korean paraphrase |
| `P04` | 정본 Markdown을 건드리지 않고 파생 인덱스를 재구축한다 | `EVAL-002` | exact concept |
| `P05` | 새로 캡처한 메모를 사람이 분류하기 전 상태는? | `EVAL-003` | Korean paraphrase |
| `P06` | restricted draft 상태에서 시작하는 캡처 정책 | `EVAL-003` | identifier/keyword |
| `P07` | 검색어 원문 없이 검색 지연과 결과 수를 관측하고 싶다 | `EVAL-004` | Korean paraphrase |
| `P08` | 검색 로그에 고유 출처 수를 남기는 설계 | `EVAL-004` | exact concept |
| `P09` | 장치 백업 작업이 실패하면 언제 다시 시도하나? | `EVAL-005` | Korean paraphrase |
| `P10` | 15분 주기로 staging하는 백업 런북 | `EVAL-005` | number/keyword |
| `P11` | 새 API 토큰 확인 뒤 예전 토큰을 폐기하는 순서 | `EVAL-006` | ordered procedure |
| `P12` | 토큰 교체 후 health check로 확인하기 | `EVAL-006` | mixed keyword |
| `P13` | 붉은 렌틸로 수프를 만들 때 필요한 향신료는? | `EVAL-007` | Korean paraphrase |
| `P14` | 커민을 넣은 렌틸 수프는 몇 분 끓이나? | `EVAL-007` | factual detail |
| `P15` | 자갈치시장과 해안열차를 묶은 이틀 여행 | `EVAL-008` | multi-keyword |
| `P16` | 부산 주말 2일 동선을 찾는다 | `EVAL-008` | Korean paraphrase |
| `P17` | 바질 화분은 흙이 얼마나 말랐을 때 물을 주나? | `EVAL-009` | factual detail |
| `P18` | 아침 물주기와 배수 확인이 필요한 허브 관리 | `EVAL-009` | near-term paraphrase |
| `P19` | 업무 규칙이 프레임워크에 의존하지 않게 하는 원칙 | `EVAL-010` | Korean paraphrase |
| `P20` | 의존성이 안쪽 정책을 향해야 한다 | `EVAL-010` | exact concept |
| `P21` | 릴리스 tag 전에 테스트와 changelog를 확인한다 | `EVAL-011` | ordered procedure |
| `P22` | 배포를 되돌릴 절차까지 포함한 출시 점검표 | `EVAL-011` | Korean paraphrase |
| `P23` | 회의 전에 agenda와 captions를 준비하는 이유 | `EVAL-012` | multi-keyword |
| `P24` | 키보드만으로 참여할 수 있는 회의 접근성 점검 | `EVAL-012` | Korean paraphrase |

#### Explicit no-match: 16

각 항목의 `relevantDocIds`는 반드시 `[]`다. 비슷한 단어가 있는 문서가 있어도 corpus가 질문의 답을
포함하지 않도록 유지한다.

| ID | Query | Category / near-miss target |
|---|---|---|
| `N01` | 파리 3박 일정에서 박물관 예약 시간은? | travel near-miss |
| `N02` | 토마토 모종에 비료를 주는 주기는? | gardening near-miss |
| `N03` | 치아바타 반죽의 발효 온도는? | recipe near-miss |
| `N04` | 윈도우 레지스트리를 백업하고 복원하는 명령은? | backup near-miss |
| `N05` | OAuth refresh token의 만료 시간은? | token near-miss |
| `N06` | GraphQL cursor pagination 응답 형식은? | API near-miss |
| `N07` | PostgreSQL vacuum 비용을 조정하는 방법은? | index/operations near-miss |
| `N08` | 회의실 프로젝터의 HDMI 입력을 바꾸는 방법은? | meeting near-miss |
| `N09` | CSS grid의 모바일 breakpoint는 몇 px인가? | accessibility/web near-miss |
| `N10` | 올해 종합소득세 신고 마감일은 언제인가? | absent current fact |
| `N11` | 첫 하프마라톤을 위한 12주 훈련표 | unrelated plan |
| `N12` | 피아노에서 단3화음을 만드는 음정 | unrelated reference |
| `N13` | 자동차 타이어의 권장 공기압을 확인하는 곳 | unrelated maintenance |
| `N14` | 원화를 유로로 바꾸는 오늘 환율 | absent current fact |
| `N15` | 내일 제주도의 시간별 강수 확률 | absent current fact |
| `N16` | 양자 얽힘을 벨 부등식으로 설명해 줘 | unrelated concept |

`N10`, `N14`, `N15`는 시간이 변하는 사실을 corpus가 추측해서 답하지 않는지를 보는 합성 질의다.
평가 실행은 웹을 조회하지 않으며 이 질문의 실제 답을 문서·snapshot에 기록하지 않는다.

## Functional Requirements

- [x] **FR-001: Fixture Validation (supports Objective 1, 6)** — `retrieval-quality-fixture.test.ts`(green): 13파일 hash 독립 리터럴 일치, 문서 12/양성 24/no-match 16 카운트, 개인정보 0건, `BRAIN_CHUNK_SIZE=400`에서 EVAL-004/EVAL-010 chunk 각 2개 이상.

평가기는 실행 전에 corpus와 query schema를 검증해야 한다.

- 문서 ID와 질의 ID는 중복될 수 없다.
- 정확히 12개 문서와 40개 질의, 그중 양성 24개와 no-match 16개여야 한다.
- 양성 `relevantDocIds`는 모두 corpus에 존재하고 비어 있지 않아야 한다.
- no-match `relevantDocIds`는 반드시 비어 있어야 한다.
- corpus와 질의에서 개인 절대경로, 저장소 외부 비밀값, 실제 개인 식별자를 허용하지 않는다.
- `fixtureHash`는 corpus 12개와 `queries.ko.json` 한 개, 정확히 13개 파일만 입력으로 계산한다. 테스트는
  validator가 실행 중 계산한 값을 다시 기대값으로 사용하지 않고, 검토 후 고정한 독립
  `EXPECTED_FIXTURE_HASH` 리터럴과 비교한다.

- [x] **FR-002: Reproducible Evaluation Runner (supports Objective 1)** — `src/retrieval-quality/runner.ts`(corpus를 ID/파일명 오름차순으로 임시 NOTES_DIR에 복사→`prepareDeterministicIndex` serial 적재→reload된 v5 file 순서 단언→`searchNotes` 순서 보존 측정, hit path→EVAL sourceId 변환·재정렬 없음, snapshot에서 알고리즘/model/index version 읽음, 실행 시각 제외 payload 결정적). 근거: AC-007/AC-009/AC-010.

평가기는 fixture corpus만 별도 임시 색인에 넣어 현재 검색 경로를 호출해야 한다. 사용자의 운영 색인,
운영 JSONL, canonical note를 읽거나 수정하지 않는다. corpus 파일은 ID/파일명 오름차순, 각 파일의
chunk는 현재 `chunkText`가 반환한 순서로 internal evaluation port를 통해 serial하게 임시 색인에 넣는다.
generic production scanner와 concurrent worker 완료 순서에 의존하지 않는다. reload한 실제 v5 index의
file/chunk/sidecar slot 순서가 이 순서와 같은지 검색 전에 검증한다. adapter는 동일 점수를 포함해 production
`searchNotes`가 반환한 hit 순서를 **그대로** 측정하며 별도 재정렬하지 않는다. `NoteHit`에 없는 chunk
ID를 만들거나 production 정렬을 바꾸지 않는다. `retrievalAlgorithm`은 현재 구현을 가리키는 안정된 값
`cosine-full-scan-v1`로 기록한다. `embeddingModel`은 embedding 요청에 실제 전달한 effective model
문자열을 기록하고, `indexFormatVersion`은 평가에 실제 적재된 `BrainIndex.version`을 기록한다. 이 값은
`readRuntimeSnapshot` projection에서 읽고 logger/report에 literal을 복제하지 않는다. 보고서에는 Git
commit, 평가 schema version, runtime/provenance 식별자와 실행 시각을 포함한다. 실행 시각을 제외한 결과
payload는 같은 입력에서 결정적이어야 한다.

- [x] **FR-003: Metrics (supports Objective 2, 3)** — `retrieval-quality-metrics.test.ts`(green): canonical dedup 적용 recall@5/MRR@5(예: `1/2` 사례), nearest-index 분위수 규칙, pairwise ROC-AUC 동점 0.5 규칙, NaN/Infinity 입력 시 평가 오류로 throw.

양성 24개에 대해 다음을 계산한다. recall과 reciprocal rank는 모두 위에서 정의한 canonical top-5
ranking을 입력으로 사용한다.

- `recall@5(q) = |relevantDocIds ∩ canonical top-5 ranking| / |relevantDocIds|`; 전체 값은 macro mean.
- `reciprocalRankAt5(q) = 1 / 최초 관련 canonical source 순위`; canonical top-5 ranking에 없으면 0.
  `mrrAt5`는 양성 24개의 macro mean이다. 예를 들어 raw top 5가 `A(chunk-1), A(chunk-2), B`이고 B가
  정답이면 canonical 순위는 `A, B`이므로 `reciprocalRankAt5 = 1/2`다.
- `uniqueSourceRatio(q) = unique canonical source 수 / 반환된 hit 수`를 top 5에서 계산한다. hit가 없으면
  0이며 전체 40개 질의의 macro mean과 질의별 값을 모두 기록한다.

전체 40개에 대해 top score를 기록하고 양성 24개와 음성 16개로 나눈 분포를 출력한다. 각 분포는
`count`, `missingCount`, `min`, `p25`, `median`, `p75`, `max`를 포함한다. 유한 점수만 분위수 입력에
포함하고 결과 없음은 `missingCount`로 별도 센다. 분위수는 오름차순 배열에서
`round((n - 1) * p)` 인덱스를 사용하는 기존 `query-analysis.ts` 규칙으로 계산하며 보간하지 않는다.
분포에 유한 점수가 하나도 없으면 `count:0`이고 `min`/분위수/`max`는 모두 `null`이다. 검색기가 hit에
NaN 또는 Infinity를 반환하면 결과 없음으로 숨기지 않고 평가 실행 오류로 중단한다.
기존 `analyze().scoreStats`는 빈 표본을 0으로 표현하므로 shape를 그대로 재사용하지 않고 nearest-index
선택 규칙만 공유하거나 동일한 순수 helper로 추출한다. 각 분포는 `count + missingCount`가 각각 24와 16에
일치해야 한다.

ROC-AUC는 top score로 양성과 음성을 구분하는 능력을 계산한다. 결과 없음은 계산 내부에서 모든 유한
점수보다 작은 값으로 취급한다. 새 외부 metric 의존성은 추가하지 않고,
`(positive > negative 쌍 + 0.5 * 동점 쌍) / (positive 수 * negative 수)`의 작은 순수 함수를 구현한다.
고정 예제와 전부 동점인 예제로 결과를 검증한다.

- [x] **FR-004: Additive Search Event Contract (supports Objective 2, 5)** — `search-event-contract.test.ts`(green): legacy/extended 행 공존, result/no-result/error 각 1행, 검색 예외 rethrow, `topScore === topScores[0]`, logger 실패가 성공 응답/원래 예외에 무간섭, `--clean` byte-for-byte 보존, 잘못된 값은 해당 새 필드만 누락.

기존 JSONL 필드는 삭제, 이름 변경, 타입 변경하지 않는다. 기존 `success`도 유지하며 보고 화면과 새
평가 보고서에서는 이를 **결과 반환률**로 부른다. 여기서 보고 화면은 `scripts/query-report.ts`,
`src/report-note.ts`, `src/retro-note.ts`의 사용자 표시 문구만 뜻한다. JSON key `successRate`, 웹 UI와 MCP
응답은 바꾸지 않는다. 새 행에는 다음 additive 필드를 기록한다. 과거 행에는
없을 수 있으므로 reader는 모두 optional로 취급한다.

| Field | Type | Meaning |
|---|---|---|
| `outcome` | `"results_returned"` / `"no_results"` / `"error"` | 실행/결과 상태. 관련성 의미 없음 |
| `relevanceJudgment` | `"relevant"` / `"not_relevant"` / `"not_judged"` | ground truth 판정. 운영 검색 기본값은 `not_judged` |
| `retrievalAlgorithm` | string | 현재 검색 조합을 식별하는 안정된 이름 |
| `embeddingModel` | string | 실제 실행에 사용한 임베딩 모델 식별자 |
| `topScores` | number[] | 순위 1~3의 유한 원점수. 반환 수만큼 최대 3개 |
| `uniqueSourceCount` | non-negative integer | 반환된 top-k hit의 canonical source 수 |

`outcome === "results_returned"`는 hit가 하나 이상이라는 뜻일 뿐이다. production `searchNotes`를 호출하는
fixture 평가도 동일한 운영 logger를 통과하므로 임시 JSONL에는 항상 `not_judged`를 기록한다. fixture
ground truth 판정은 JSONL event가 아니라 evaluation runner의 query result와 보고서에만 붙인다. 운영
logger는 사용자의 클릭/명시 판정 기능이 없는 한 결과 수나 점수로 관련성을 추론하지 않는다. 오류 상세에
질의 원문이나 비밀값을 추가하지 않는다.

새 필드의 기록 범위는 다음으로 고정한다.

| Event | Required new values |
|---|---|
| 운영 `search_notes`, hit 1개 이상 | `outcome: "results_returned"`, `relevanceJudgment: "not_judged"`, 실제 식별자, 최대 3개 `topScores`, `uniqueSourceCount` |
| 운영 `search_notes`, hit 0개 | `outcome: "no_results"`, `relevanceJudgment: "not_judged"`, 실제 식별자, `topScores: []`, `uniqueSourceCount: 0` |
| 운영 `search_notes`, 예외 | 기존 예외를 그대로 다시 던지기 전에 정확히 1행을 `success:false`, `hitCount:0`, `outcome:"error"`, `relevanceJudgment:"not_judged"`, 실제 식별자, `topScores:[]`, `uniqueSourceCount:0`으로 기록 |
| fixture 평가의 임시 `search_notes` event | 운영 `search_notes`와 같은 규칙, `relevanceJudgment:"not_judged"`; 정상 40질의 실행은 임시 JSONL에 질의당 정확히 1행 |
| 기존 `ask_brain` / `capture_note` | 기존 필드·기록 횟수·의미를 그대로 유지하며 041 새 필드는 요구하지 않음 |

새 검색 행에서 기존 `topScore`는 계속 기록하며, 결과가 있으면 `topScore === topScores[0]`, 없거나
오류면 `topScore === null`이어야 한다. 로그 쓰기 실패는 성공한 검색의 반환값을 바꾸지 않고, 검색 자체가
실패한 경우에는 원래 검색 예외를 가리거나 바꾸지 않는다. `query-report --clean`은 분석용 `readRecords`
결과를 재직렬화하지 않고 raw JSONL line을 대상으로 retention을 판정한다. JSON object로 parse되고 유효한
`ts`가 cutoff보다 오래된 행만 제거한다. 최근 행, 해석할 수 없는 `ts`, 필수 필드가 없는 forward-compatible
행, malformed non-empty line은 byte-for-byte 보존한다. 따라서 유효한 새 필드와 미지의 필드도 손실되지
않는다. append와 `--clean`의 기존 동시 실행 경합은 041의 범위 밖이며 새 동기화 구조를 추가하지 않는다.
production 검색은 기존처럼 query event write를 기다리지 않는다. 다만 logger는 pending append를 추적하는
내부 drain seam을 제공하고 evaluation runner/테스트는 임시 JSONL을 읽거나 삭제하기 전에 이를 await한다.
정확한 event 수를 `sleep`이나 임의 polling delay로 맞추지 않는다.
reader가 새 optional 필드의 잘못된 값과 만났을 때는 행 전체를 버리지 않고 해당 새 필드만 `undefined`로
정규화한다. enum 외 값, 빈 식별자, 유한 숫자 최대 3개가 아닌 `topScores`, 음수/비정수
`uniqueSourceCount`가 이에 해당한다. 기존 필드의 관대한 읽기 동작은 바꾸지 않는다.

- [x] **FR-005: Predeclared Measurement Gate (supports Objective 3, 4)** — `retrieval-quality-gate.test.ts`(green): macroRecall/AUC>=0.90 조건, 가장 큰 유한 threshold 선택, 고정 순서 `gate.reasons`, 높은 점수 오답만 반환하는 반례가 `macro_recall_at_5_below_0_90`으로 반드시 fail.

평가기는 전체 40개 top score로 다음 순서로 게이트를 계산한다.

1. 양성 24개의 정답 문서 기준 `macroRecallAt5 >= 0.90`인지 판정한다.
2. `ROC-AUC >= 0.90`인지 판정한다.
3. 각 고유 유한 top score를 `score >= threshold` 비교의 후보로 삼는다.
4. 양성 탐지율(`TP / 24`)이 `>= 0.90`이고 음성 FPR(`FP / 16`)이 `<= 0.10`인 후보만 남긴다.
5. 후보가 여러 개면 가장 큰 유한 threshold를 단일 후보 임계값으로 선택한다.
6. macro recall@5 조건, AUC 조건, 후보 존재 조건을 모두 만족할 때만 `gate: pass`; 그 외에는
   `gate: fail`과 실패 이유를 기록한다.

보고서에는 선택된 threshold, TP/FN/FP/TN, positive detection rate, negative FPR을 기록한다. 여기서
TP/FN은 “양성 질의 점수가 임계값 이상/미만”을 세며 정답 hit 수가 아니다. threshold는 점수 공간이
바뀌면 다시 측정해야 하는 평가 결과이지 영구 설정값이 아니다. 적격 후보가 없으면
`thresholdCandidate` 전체를 `null`로 기록하며 임의 confusion matrix를 만들지 않는다. AUC 조건만
실패하고 적격 threshold는 있으면 후보와 confusion은 보고하되 gate만 `fail`이다.

- [x] **FR-006: Measurement-only Boundary (supports Objective 4)** — 후보 threshold는 report/gate에만 존재하고 검색 경로 인자에 없다(`searchNotes(query,limit?,folder?)`). 근거: AC-007(`retrieval-quality-boundary.test.ts`).

041은 후보 임계값을 검색, recall, ask, MCP 응답, 웹 응답 또는 운영 top-k 처리에 전달하지 않는다.
평가 전후 운영 검색의 hit ID, 순서, 개수, 점수는 동일해야 한다. 결과 필터링은 별도 SDD와 사용자
결정 없이 구현하지 않는다.

- [x] **FR-007: Privacy and Artifact Rules (supports Objective 6)** — `retrieval-quality-privacy.test.ts`(green): 허용 목록 밖 query 원문 0건, 홈 디렉터리 절대경로·비밀 패턴 0건.

- fixture query는 이 문서에 선언한 40개 합성 문자열만 사용한다.
- 실제 검색 로그를 fixture 생성 입력으로 사용하지 않는다.
- 커밋 가능한 보고서는 합성 fixture 결과만 포함한다.
- 실제 개인 검색을 임시 진단할 경우 query 원문과 절대경로를 커밋하지 않고 aggregate만 남긴다.
- snapshot에는 query ID만 사용하고 새 query 원문 복제본을 만들지 않는다.

- [x] **FR-008: Stable CLI and Artifact Lifecycle (supports Objective 1, 4, 6)** — `scripts/retrieval-quality.ts` + `package.json` script `retrieval:quality`. 기본 요약/`--help`/`--json`/`--output`, exit 0(gate 무관)/1(runtime·artifact)/2(usage), same-parent exclusive `wx` 0600 temp+rename·자기 temp만 cleanup, `.git`/eval-input/tracked/symlink/dir target 거부·기존 LocalMind 보고서만 교체, 성공·오류 모두 fixture 전용 임시 산출물 finally 제거. 근거: AC-011(`retrieval-quality-cli.test.ts`), AC-009/AC-010.

041의 canonical 사용자 실행 명령은 package script
`npm run --silent retrieval:quality -- [options]`이다. `--silent`는 npm preamble이 machine-readable stdout에
섞이지 않게 하는 계약 일부다. CLI는 저장소의
고정 fixture와 production embedding/search 경로만 사용하며 임의 fixture root나 test stub을 선택하는 공개
옵션을 제공하지 않는다. 허용 옵션과 동작은 다음과 같다.

| Invocation | stdout | stderr / file effect | Exit |
|---|---|---|---|
| 기본 | 평이한 한국어 요약 1개 | 진단은 stderr, 보고서 파일 생성 없음 | 측정 성공이면 gate pass/fail 모두 `0` |
| `--help` 단독 | 한국어 usage | runner 실행과 파일 생성 없음 | `0` |
| `--json` | JSON 보고서만, 마지막 LF 1개 | 사람용 요약은 출력하지 않음 | 측정 성공이면 `0` |
| `--output <path>` | 기본 요약 또는 `--json`과 함께 JSON | 동일 보고서 bytes를 지정 경로에 원자적으로 기록 | 측정 성공이면 `0` |
| fixture/schema/search/report 실행 오류 | 부분 JSON 없음 | 비밀값·질의 원문 없는 한국어 오류 | `1` |
| 알 수 없는 옵션, 중복 옵션, 값 누락 | 없음 | usage와 평이한 한국어 오류 | `2` |

`--output`은 명시됐을 때만 파일을 만든다. 상대 path는 호출 당시 cwd 기준이며 parent directory는 이미
존재해야 한다. `.git/`, evaluation-input pathspec 내부, Git tracked file, symlink, directory target은
거부한다. target이 없으면 생성할 수 있고, 기존 regular file은 JSON의 `reportType`과 `schemaVersion`이
각각 `"localmind-retrieval-quality"`, `1`인 이전 보고서일 때만 교체할 수 있다.

output temp는 같은 parent에서 이름
`.localmind-retrieval-quality.<target-basename>.<pid>.<crypto.randomUUID()>.tmp`, exclusive `wx`, mode `0600`으로
만든다(POSIX mode를 지원하는 OS 기준). collision이면 새 UUID로 최대 10회 재시도하며, 자기 호출이 실제
생성한 temp만 rename/cleanup한다.
성공과 오류 모두에서 output temp, fixture 전용 index/sidecar/query-log 디렉터리를 `finally`에서 제거한다.
runner 또는 rename이 실패하면 부분 destination을 남기지 않고 기존 보고서 bytes를 유지한 채 exit 1이다.
pre-existing temp-like file은 덮거나 삭제하지 않는다. worktree 내부의 허용된 untracked output은 진단용으로
쓸 수 있지만 보고서가 `outputInsideWorktree:true`, `baselineEligible:false`를 기록한다. 공식 baseline은
stdout 또는 worktree 밖의 명시 경로를 사용한다. 테스트용 고정 embedding stub은 import 가능한 runner
seam으로만 주입하며, 그 보고서는 `embedding.mode:"test_stub"`, `baselineEligible:false`여야 한다.
`--help`를 다른 옵션과 함께 쓰거나 `--output -`을 쓰면 usage error 2다. 문법은 맞지만 parent/target/temp
policy를 통과하지 못하면 artifact error 1이며 stderr는 비밀값이나 전체 절대경로 없이 원인을 설명한다.

## Ownership and 042 Boundary

- 새 순수 계산과 runner/serializer는 `src/retrieval-quality/` 아래에 둔다. CLI는 이를 호출하는 얇은
  `scripts/retrieval-quality.ts`다.
- 041은 `src/query-analysis.ts`의 기존 `QueryLogRecord`/reader와 `src/brain.ts`의 기존 logger/search wrapper를
  최소 확장한다. Retriever, QueryEventWriter, IndexStore 같은 새 production domain을 추출하거나 기존 상태
  소유권을 이동하지 않는다. 그 분해는 042가 소유한다.
- `src/brain.ts`는 041 전용 internal compatibility surface `retrievalEvaluationPort`를 export한다. shape는
  `prepareDeterministicIndex(orderedFixturePaths)`, 기존 production `searchNotes`, `drainQueryEvents()`,
  `readRuntimeSnapshot(retrievalLimit)` 네 함수로 고정한다. runner는 temp env 설정 뒤 이 port를 dynamic
  import한다. `drainQueryEvents()`는 당시 pending append의 settled promise이며 실패를 검색 예외로 승격하지
  않는다.
- `prepareDeterministicIndex`는 caller가 ID/filename 순으로 준 12개 path를 generic scanner 없이 serial로
  처리하되 기존 `chunkText`, production embedding adapter, v5 persistence/save/reload 구현을 그대로 쓴다.
  reload 뒤 `BrainIndex.files`와 sidecar slot이 source/chunk 순서와 일치해야 하며 첫 `searchNotes`의
  `ensureIndexed`는 clean index를 재구축하거나 순서를 바꾸지 않는다. 이 고정은 evaluation index에만
  적용하며 production scanner/concurrency/tie order는 바꾸지 않는다.
- `readRuntimeSnapshot`은 값을 소유하지 않는 immutable projection이다. 현재 owner에서
  `retrievalAlgorithm`, effective embedding model/implementation, actual index format/dimensions, chunk size를
  읽고 caller의 retrieval limit를 합친다. 알고리즘/implementation ID는 각 production owner의 한 상수만
  logger와 projection이 공유한다. 042는 각 값의 owner를 새 domain으로 옮길 수 있지만 port shape와 의미를
  유지하거나 같은 변경에서 041 adapter를 함께 migrate해야 한다.

```ts
type QueryEventDrainResult = Readonly<{
  attempted: number;
  succeeded: number;
  failed: number;
}>; // attempted === succeeded + failed; 직전 drain 이후 enqueue한 event를 세고 이번 drain 뒤 reset

type RetrievalRuntimeSnapshot = Readonly<{
  retrievalAlgorithm: "cosine-full-scan-v1";
  embeddingModel: string;
  embeddingImplementation: "openai-compatible-http-embeddings-v1";
  indexFormatVersion: number;
  embeddingDimensions: number;
  chunkSize: number;
  retrievalLimit: 5;
}>;

type RetrievalEvaluationPort = Readonly<{
  prepareDeterministicIndex(orderedFixturePaths: readonly string[]): Promise<void>;
  searchNotes(query: string, limit?: number, folder?: string): Promise<NoteHit[]>;
  drainQueryEvents(): Promise<QueryEventDrainResult>;
  readRuntimeSnapshot(retrievalLimit: 5): Promise<RetrievalRuntimeSnapshot>;
}>;
```

production 호출자는 drain을 부르지 않는다. evaluation runner는 40개 정상 검색 뒤
`{attempted:40,succeeded:40,failed:0}`을 요구하며 다르면 평가 실행 오류로 처리한다. 검색 자체의 원래 예외가
있는 경로에서는 drain 결과가 그 예외를 대체하지 않는다.

- 구현 순서는 041 -> 042 -> 043이다. 041과 042를 병렬 구현하거나 042의 구조 변경을 041에 선반영하지 않는다.

## Evaluation Report Contract

기계 판독 가능한 JSON 보고서는 다음 top-level shape와 필드명을 정확히 갖는다. schema version을 올리는
후속 SDD 없이 임의 필드를 추가하지 않는다. 정확한 수치는 실행 결과이며 문서에서 선결하지 않는다.
serializer는 아래 표시 순서로 object key를 삽입하고 `JSON.stringify(report, null, 2) + "\n"`의 UTF-8 bytes를
stdout/file 공통 표현으로 사용한다.

```json
{
  "reportType": "localmind-retrieval-quality",
  "schemaVersion": 1,
  "run": {
    "commit": "<full-git-sha>",
    "workingTreeDirty": false,
    "evaluationInputsDirty": false,
    "outputInsideWorktree": false,
    "baselineEligible": true,
    "baselineIneligibilityReasons": [],
    "retrievalAlgorithm": "<runtime-id>",
    "chunkSize": 400,
    "retrievalLimit": 5,
    "embedding": {
      "model": "<effective-runtime-id>",
      "dimensions": 1,
      "implementation": "<stable-code-path-id>",
      "contractFingerprint": "sha256:<hex>",
      "mode": "production"
    },
    "indexFormatVersion": 5,
    "fixtureHash": "<sha256>",
    "syntheticIndexFingerprint": "sha256:<hex>",
    "queryResultFingerprint": "sha256:<hex>",
    "executedAt": "<UTC ISO-8601>"
  },
  "counts": { "documents": 12, "positive": 24, "noMatch": 16 },
  "metrics": {
    "macroRecallAt5": 0.0,
    "mrrAt5": 0.0,
    "meanUniqueSourceRatioAt5": 0.0,
    "resultReturnRate": 0.0,
    "positiveTopScore": {},
    "negativeTopScore": {},
    "rocAuc": 0.0
  },
  "thresholdCandidate": null,
  "gate": { "status": "fail", "reasons": [] },
  "queries": []
}
```

세부 JSON 계약은 다음과 같다.

- `fixtureHash`는 corpus Markdown 12개와 `queries.ko.json` 한 개, 정확히 13개를
  `tests/fixtures/retrieval-quality/` 기준 상대 POSIX path 오름차순으로 읽어
  `relativePath + NUL + fileBytes + NUL`을 차례로 SHA-256에 넣은 소문자 hex다. 절대경로, mtime,
  디렉터리 순서는 입력이 아니다. fixture 디렉터리에 다른 파일이 있으면 validation error다. 테스트의
  기대 digest는 별도 리터럴이며 validator 계산 결과로 즉석 생성하지 않는다.
- `indexFormatVersion`은 평가 index의 numeric `BrainIndex.version`이며 문자열로 직렬화하지 않는다.
- `workingTreeDirty`와 `evaluationInputsDirty`는 fixture validation 뒤, 임시 index/output artifact 생성 전에
  한 번 캡처한 provenance snapshot이다. `workingTreeDirty`는 전체
  `git status --porcelain --untracked-files=all` 출력 존재 여부다.
  `evaluationInputsDirty`는 같은 검사를 `src/`, `scripts/`, `tests/fixtures/retrieval-quality/`,
  `package.json`, `package-lock.json`, `tsconfig.json`, `specs/041-retrieval-quality-contract/goal.md`,
  `specs/041-retrieval-quality-contract/spec.md` pathspec에 한정한 값이다. `baselineEligible`은
  `!evaluationInputsDirty && embedding.mode === "production" && !outputInsideWorktree`다. worktree root는
  `git rev-parse --show-toplevel`의 real path이며 output parent real path로 containment를 판정한다. 충족하지
  못한 이유는 고정 순서 enum 배열 `baselineIneligibilityReasons`에 `"evaluation_inputs_dirty"`,
  `"test_embedding_stub"`, `"output_inside_worktree"` 순서로 필요한 값만
  넣는다. 따라서 사용자 소유의 범위 밖 문서/Makefile 변경은 투명하게 dirty로 기록하되 기준선을 막지
  않는다. 평가 입력이 dirty하거나 stub인 실행도 진단과 gate 계산은 허용하지만 CLI가 “공식 기준선 아님”을
  표시한다.
- `embedding.dimensions`는 평가 index와 query vector에서 확인한 동일한 양의 정수다. `implementation`은
  production HTTP embedding 코드 경로의 고정 ID `"openai-compatible-http-embeddings-v1"`이다.
  `embedding.mode`는 실제 configured service를 사용하면 `"production"`, 동일 HTTP 경로 앞에 deterministic
  test server를 둔 격리 테스트면 `"test_stub"`다. mode는 test harness가 child 최초 import 전에 주입하며
  공개 CLI 옵션이 아니다.
  `contractFingerprint`는 UTF-8
  `mode + NUL + implementation + NUL + model + NUL + dimensions의 10진수`의 SHA-256을
  `sha256:<lowercase-hex>`로 기록한다. embedding endpoint는 hash 형태로도 공개 보고서에 넣지 않으며 key도
  기록하지 않는다. 실제 출력 차이는 아래 index/query result fingerprint가 포착한다.
- `syntheticIndexFingerprint`는 임시 index를 disk에서 다시 읽은 뒤 insertion order의 각 chunk를
  `{sourceId, chunkOrdinal, textSha256, vectorFloat32LeSha256}`로 정규화한 canonical JSON bytes의 SHA-256이다.
  `chunkOrdinal`은 source별 0-based이며 두 내부 digest는 prefix 없는 lowercase hex다. object key는 표시
  순서, array는 insertion order, whitespace는 없고 인코딩은 UTF-8이다. 최종 hash 값은
  `sha256:<lowercase-hex>`다. 임시 절대경로, mtime, sidecar filename은 입력이 아니다. 이 값은 같은
  모델명이라도 실제 생성 벡터가 달라진 실행을 구분한다.
- `queryResultFingerprint`는 query ID 오름차순으로 `id + NUL + outcome + NUL`을 넣고, 각 raw top-5 hit를
  반환 순서대로 `rank의 10진수 + NUL + sourceId + NUL + score의 IEEE-754 Float64LE 8 bytes + NUL`로 넣은
  SHA-256이다. 결과가 없는 query도 id/outcome을 넣는다. 값은 `sha256:<lowercase-hex>`이며 query 원문과
  임시 path는 입력이 아니다. query embedding 또는 provider 출력 변화가 검색 결과에 영향을 주면 이 값과
  report payload가 달라진다.
- score distribution은
  `{count, missingCount, min, p25, median, p75, max}`이며 마지막 다섯 값은 `number | null`이다.
- `queries[].outcome`은 raw hit가 하나 이상이면 `"results_returned"`, 없으면 `"no_results"`다.
  `metrics.resultReturnRate`는 `results_returned` query 수를 40으로 나눈 값이며 relevance나 threshold
  detection을 뜻하지 않는다. search error는 부분 보고서 query로 넣지 않고 실행 오류로 처리한다.
- `thresholdCandidate`는 적격 후보가 없으면 `null`, 있으면
  `{value:number, positiveDetectionRate:number, negativeFpr:number, confusion:{tp:number, fn:number, fp:number,
  tn:number}}`다. 네 count의 합과 분모는 각각 positive 24, no-match 16과 일치해야 한다.
- `gate.reasons`는 필요한 값만 고정 순서로 넣는 enum 배열이다. 정답 검색 실패
  `"macro_recall_at_5_below_0_90"`, AUC 실패 `"roc_auc_below_0_90"`, 적격 threshold 없음
  `"no_eligible_threshold"` 순서다. 여러 조건이 해당하면 이 순서로 필요한 값만 넣는다.
- `queries`는 query ID 오름차순이며 query 원문과 임시 파일 경로를 복제하지 않는다. 각 원소는 아래
  shape다. `hits`는 최대 top 5이고 동일 source의 여러 chunk가 여러 번 나타날 수 있으며 production
  반환 순서를 유지한다.

```ts
type RetrievalQualityQueryResult = {
  id: string;
  kind: "positive" | "no_match";
  relevantDocIds: string[];
  hits: Array<{
    rank: number;       // 1-based
    sourceId: string;   // EVAL-NNN, 절대/임시 path 금지
    score: number;      // finite raw score
    relevant: boolean;
  }>;
  outcome: "results_returned" | "no_results";
  topScore: number | null;
  recallAt5: number | null;         // no_match는 null
  reciprocalRankAt5: number | null; // no_match는 null
  uniqueSourceRatioAt5: number;
  relevanceJudgment: "relevant" | "not_relevant";
};
```

`relevanceJudgment`는 top 5에 ground-truth source가 하나라도 있으면 `relevant`, 아니면
`not_relevant`다. no-match는 항상 `not_relevant`다. 이 값은 fixture 평가 결과에만 쓰며 운영 질의를
자동 판정하는 근거가 아니다.

CLI는 같은 내용을 평이한 한국어로 요약한다. 성공한 측정과 `--help`만 0, 실행/검증 오류는 1, usage
오류는 2다. 품질 게이트 실패는 유효한 측정 결과이므로 기본 평가 명령은 측정을 마치고 0으로 끝낸다. CI에서 품질
게이트를 강제할 필요가 생기면 후속 작업에서 별도 `--enforce-gate` 계약을 추가한다.

## Acceptance Criteria

- [x] **AC-001: Fixed dataset validation -> `retrieval-quality-fixture.test`** (green)

**Given** 저장소의 041 corpus와 query fixture가 있을 때
**When** fixture validator를 실행하면
**Then** 독립 리터럴과 일치하는 13-file canonical hash와 문서 12, 양성 24, no-match 16을 확인하고 다른
fixture 파일은 거부하며, 모든 정답 ID, exact query fields, 개인정보 금지 규칙을 통과하고 400자 chunk
설정에서 EVAL-004/EVAL-010이 각각 2개 이상이다. fixture 한 byte 변경과 추가 파일은 기대 hash/schema
검증을 실패시킨다.

- [x] **AC-002: Positive ranking metrics -> `retrieval-quality-metrics.test`** (green)

**Given** 순위와 정답이 알려진 작은 in-memory 결과표가 있을 때
**When** recall@5, MRR@5, 고유 출처 비율을 계산하면
**Then** raw top 5 안의 중복 chunk는 첫 canonical source만 순위에 남고 손으로 계산한 값과 정확히
일치한다. 특히 `A(chunk-1), A(chunk-2), relevant-B`의 B reciprocal rank는 `1/2`이며 raw top 5 밖 hit로
빈자리를 보충하지 않는다.

- [x] **AC-003: Score distribution and missing results -> `retrieval-quality-metrics.test`** (green)

**Given** 동점, 음수 점수, 결과 없음이 섞인 양성·음성 표본과 별도의 비유한 점수 표본이 있을 때
**When** 분포와 ROC-AUC를 계산하면
**Then** 결과 없음은 `missingCount`에 포함되고 동점 0.5 규칙을 적용한 기대 AUC와 일치하며, 유한 점수가
없는 분포의 통계는 `null`, NaN/Infinity 입력은 명확한 평가 오류가 된다.

- [x] **AC-004: Additive JSONL compatibility -> `search-event-contract.test`** (green)

**Given** 확장 필드가 없는 기존 JSONL 행과 모든 확장 필드가 있는 새 행이 있을 때
**When** 동일 reader로 읽으면
**Then** 두 행 모두 성공하고 기존 필드 값은 바뀌지 않으며 새 필드의 의미가 결과 반환과 관련성을
구분한다. 운영 검색의 결과 있음/없음/예외 matrix는 각각 정확히 1행을 위 계약대로 기록하고, 예외는
같은 오류로 다시 던지며, `ask_brain`/`capture_note`의 기존 기록 횟수와 shape는 바뀌지 않는다. 잘못된
새 필드는 그 필드만 누락되고 행과 기존 필드는 유지된다. 지정된 세 CLI/note renderer는
`successRate`를 “결과 반환률”로 표시하고 JSON key, 웹 UI, MCP snapshot은 기존과 같다. 결과가 있으면
`topScore === topScores[0]`이고, logger append가 실패해도 성공 응답은 동일하며 검색도 실패했으면 원래
검색 예외가 유지된다. `query-report --clean`은 parse 가능한 유효 ts가 30일을 초과한 행만 제거하고,
최근 확장 행과 malformed/필수 필드 없음/해석 불가 ts인 non-empty raw line 및 미지의 필드를
byte-for-byte 보존한다. pending append drain 뒤에는 sleep 없이 기대 행이 모두 관측되고 append 실패
사례는 `{attempted:1,succeeded:0,failed:1}`로 끝난다.

- [x] **AC-005: Passing measurement gate -> `retrieval-quality-gate.test`** (green)

**Given** macro recall@5와 AUC가 각각 0.90 이상이고 한 threshold에서 양성 탐지율 0.90 이상, 음성 FPR
0.10 이하인 고정 점수표가 있을 때
**When** 게이트를 계산하면
**Then** 가장 큰 적격 유한 threshold 하나와 정확한 confusion matrix를 출력하고 `pass`가 된다.

- [x] **AC-006: Failing measurement gates -> `retrieval-quality-gate.test`** (green — 높은 점수 오답만 반환하는 반례가 `macro_recall_at_5_below_0_90`으로 반드시 fail함을 실증)

**Given** 각각 macro recall@5, AUC 또는 threshold 조건을 충족하지 못하는 고정 점수표와, 모든 양성에서
높은 점수의 오답 문서만 반환해 AUC·threshold 조건은 만족하지만 macro recall@5가 0인 점수표가 있을 때
**When** 게이트를 계산하면
**Then** `fail`과 구체적 실패 이유를 출력하며 실행 오류로 취급하지 않는다. 적격 threshold가 없는
사례의 `thresholdCandidate`는 전체가 `null`이고, 높은 점수 오답 사례는
`macro_recall_at_5_below_0_90` 때문에 반드시 실패한다.

- [x] **AC-007: Production retrieval unchanged -> existing search characterization + `retrieval-quality-boundary.test`**
  검증: `src/retrieval-quality-boundary.test.ts` — "실제 sink vs no-op sink: hit ID·순서·개수·점수가 완전히 동일"(실제 temp-file sink와 write-실패 no-op 동치 sink의 hit 시그니처 동일 + drain succeeded=0/failed=N), "searchNotes 시그니처에 threshold consumer가 없다"(검색 반복 결과 동일 → threshold 미전달, 새 env/flag 없음).

**Given** 동일한 임시 운영형 색인과 고정 검색 질의가 있을 때
**When** 실제 temp-file event sink를 쓴 검색과 test harness가 내부 sink만 no-op으로 대체한 검색을 각각
실행하면
**Then** 반환 hit의 ID, 순서, 개수, 점수가 같고 후보 threshold가 검색 경로에 전달되지 않는다.
logging off는 테스트 전용 dependency seam이며 새 production env, CLI flag 또는 사용자 설정을 추가하지
않는다.

- [x] **AC-008: Privacy boundary -> `retrieval-quality-privacy.test`** (green)

**Given** 커밋 대상 fixture, snapshot, sample report가 있을 때
**When** 개인정보 금지 검사를 실행하면
**Then** 홈 디렉터리 절대경로, 알려진 비밀 패턴, 허용 목록 밖의 query 원문이 하나도 없다.

- [x] **AC-009: Reproducible report -> `retrieval-quality-report.test`**
  검증: `src/retrieval-quality-report.test.ts` — 고정 clock/embedding stub로 두 번 생성한 payload(executedAt 제외) deepEqual, 계약 필드 전부(fixtureHash·chunkSize 400·retrievalLimit 5·embedding dims/implementation/contractFingerprint·synthetic/queryResult fingerprint·gate) 존재, test_stub은 baseline ineligible, 격리 임시 git repo로 evaluation-input dirty→`evaluationInputsDirty:true`/`baselineEligible:false`, 범위 밖(Makefile) 변경만이면 `workingTreeDirty:true`여도 eligible, worktree 내부 output은 `outputInsideWorktree:true`/ineligible.

**Given** 동일한 clean/dirty worktree 상태, commit, fixture, 검색 설정과 고정 clock이 있을 때
**When** 평가를 두 번 실행하면
**Then** 실행 시각을 제외한 JSON payload, provenance flags, fixture hash, 순위 지표, threshold, 게이트
판정이 동일하다. evaluation input이 dirty인 실행은 `evaluationInputsDirty:true`,
`baselineEligible:false`와 경고를 가지며 범위 밖 변경만 있으면 `workingTreeDirty:true`여도 eligible하다.
보고서는 chunk size 400, retrieval limit 5, 실제 embedding 차원·implementation·contract fingerprint,
synthetic index/query result fingerprint를 포함하고 test stub 또는 worktree 내부 output 실행은 고정 이유와
함께 baseline ineligible이다. dirty flags는 평가 artifact 생성 전 snapshot이다.

- [x] **AC-010: Isolated production-entry evaluation -> `retrieval-quality-adapter.test`**
  검증: `src/retrieval-quality-adapter.test.ts`(격리 자식 2회 spawn — guard self-test blocked stat/read/write + allow temp 통과, forbiddenAccesses 0건, coverageGaps 0건, 40 query·40 not_judged JSONL, report-only relevance, 두 실행 fingerprint/metrics/threshold/gate/hit-순서 동일, 성공 뒤 index/sidecar/query-log 제거) + `src/retrieval-quality-guard.test.ts`(guard 메커니즘 직접 검증 — EACCES 차단·기록, allow 통과, coverage oracle이 registry 밖 truncateSync를 실제로 gap으로 검출하는 비-공허성). child 진입점 `src/retrieval-quality/isolated-eval-child.ts`는 guard를 brain import 전에 설치.

**Given** 운영 경로를 흉내 낸 금지 prefix 세트와 별도 임시 `HOME`, `NOTES_DIR`, `BRAIN_INDEX`,
`QUERY_LOG`, 고정 embedding stub을 production brain module 최초 import 전에 설정한 격리 자식 프로세스가
있을 때
**When** 서로 다른 두 임시 디렉터리에서 production `searchNotes` entry point로 같은 고정 40개 질의를
각각 평가하면
**Then** 실제 평가 전에 guard self-test가 전용 forbidden sentinel의 stat/read/write를 각각 차단·기록하고
허용 temp sentinel 접근은 통과시킨 뒤 기록을 reset한다. 각 실행에 정확히 40개 결과가 보고되고 두 실행의
hit 순서·순위 지표·fingerprint·threshold·gate가
동일하며 `cosine-full-scan-v1`, 실제 전달한 embedding model, 실제 index
version이 기록되며, test preload/access guard가 운영형 note/index/query-log 금지 prefix를 받는 모든
path-taking sync/callback/promises FS API(`open`, `readFile`, `stat`, `access`, `exists`, `realpath`, `readdir`,
`opendir`, `readlink`, `mkdir`, `appendFile`, stream, `watch`, `writeFile`, `rename`, `unlink`, `rm` 계열 포함)를
가로채고 접근 목록이 0건임을 증명한다. 별도 coverage oracle은 evaluation child가 import하는 production
module의 path-taking FS method가 guard registry에 없으면 테스트를 실패시킨다. 임시 JSONL에는 질의당 정확히 한
건의 `not_judged` event가 있고 평가 보고서에만 fixture relevance가 있다. adapter는 production hit 순서를
재정렬하지 않는다. reload한 v5 index file/chunk key와 sidecar slot은 선언된 serial fixture order이고 첫
search가 이를 rebuild하지 않는다. 성공·의도된 오류 경로 뒤 임시 index, sidecar, query log를 모두 제거한다.

- [x] **AC-011: Stable CLI and atomic output -> `retrieval-quality-cli.test`**
  검증: `src/retrieval-quality-cli.test.ts`(17 케이스) — `--help` 단독 exit0·파일없음, `--help`+옵션/알수없음/중복/값누락/`--output -` usage error 2·stdout 없음, 기본 요약 exit0(gate 무관)·파일없음, `--json` JSON만·마지막 LF 1개·파싱가능·파일없음, `--output` atomic temp+rename·bytes===stdout·mode 0600·temp 잔존 없음, 기존 LocalMind 보고서만 교체·비-LocalMind는 exit1 원본보존, 상위디렉터리 없음/symlink/directory/`.git`·evaluation-input target 거부(exit1), worktree 밖 output `outputInsideWorktree:false`, exclusive temp 사전존재 파일 보존 재시도. CLI `scripts/retrieval-quality.ts` + `package.json` script `retrieval:quality`.

**Given** 고정 runner 결과, gate fail 결과, 인자 오류, runtime 오류와 임시 output 경로가 있을 때
**When** `npm run --silent retrieval:quality -- [options]`의 CLI 계약을 실행하면
**Then** 기본/`--help`/`--json`/`--output` stdout과 stderr가 FR-008과 일치하고 gate fail은 0, runtime 오류는 1,
usage 오류는 2로 끝난다. 파일은 명시한 경우에만 동일 JSON bytes로 temp+rename되고, rename 또는 runner가
실패하면 부분 destination과 temp artifact가 남지 않는다. relative path, missing parent, symlink/directory
target, tracked/evaluation-input target, 기존 LocalMind 보고서 교체도 FR-008 규칙대로 처리한다. exclusive
temp 이름 충돌은 기존 파일을 보존한 채 재시도하고, 실패 시 기존 destination bytes와 호출 전 temp-like
파일이 그대로 남는다.

## Requirement Traceability

| Requirement | Acceptance criteria |
|---|---|
| FR-001 | AC-001, AC-008 |
| FR-002 | AC-001, AC-007, AC-009, AC-010 |
| FR-003 | AC-002, AC-003 |
| FR-004 | AC-004, AC-009 |
| FR-005 | AC-005, AC-006, AC-009 |
| FR-006 | AC-007 |
| FR-007 | AC-001, AC-008, AC-010 |
| FR-008 | AC-009, AC-010, AC-011 |

## Open Questions

없음. 041 결과를 CI blocking gate 또는 운영 결과 필터로 승격하는 일은 명시적 non-goal이며, 별도
사용자 결정과 SDD 없이는 수행하지 않는다.
