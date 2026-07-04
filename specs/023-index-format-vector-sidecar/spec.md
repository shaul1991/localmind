# 023 — 색인 포맷 확장: 벡터 바이너리 사이드카 (what)

goal: [goal.md](goal.md) · plan: [plan.md](plan.md)

> 라벨↔경로 바인딩 트랙은 [024](../024-label-path-binding/spec.md)로 분리됨(goal 참조).

## 용어

- **인메모리 표현**: `BrainIndex`가 프로세스 메모리에서 갖는 형태 — 청크는 벡터를 보유한다
  (`IndexedChunk.vector`). 검색(cosine)·병합은 이 형태를 쓴다. **불변**.
- **디스크 인코딩**: 색인이 파일로 저장된 형태 — v5부터 벡터는 JSON이 아니라 사이드카에
  있고 JSON은 slot 참조만 둔다. 이 스펙은 디스크 인코딩과 그 전이(로드·저장·병합·
  마이그레이션)만 바꾼다.
- **사이드카**: 벡터 바이너리 파일. 헤더(매직·dims·count) + Float32(LE) 연속 배열.
  파일명은 `INDEX_PATH` 인접의 generation 파일 `<indexBasename>.vec-<gen>`.

## 포맷 개요 (v4 → v5)

`INDEX_VERSION`을 4 → 5로 올린다. 디스크 스키마 변경(인메모리는 벡터 보유 유지):

```
BrainIndex(v5, on disk):
  version: 5
  embeddingModel?, dims?          (기존)
  vectorFile?: string             (신규 — 현재 사이드카 파일 basename, files가 비면 생략)
  files: Record<key, FileEntry>

FileEntry: { hash, folder, chunks, linksOut }   (구조 불변)
IndexedChunk(on disk): { path, text, slot: number }   (vector 제거 → slot 추가)
IndexedChunk(in memory): { path, text, vector: number[] }  (불변)

사이드카(<indexBasename>.vec-<gen>):
  header: 16바이트 = magic "LMV1"(4) | dims(uint32 LE, 4) | count(uint32 LE, 4) | reserved(4)
  body:   Float32(LE) × dims × count   — slot i의 벡터 = body[i*dims .. (i+1)*dims)
```

단건 저장 비용의 정직한 표기: `capture`·`removeFromIndex` 등 단건 경로의 저장도
사이드카를 **전량 재작성**한다(slot 순차 재할당). v4도 단건 저장이 JSON 전량 재작성이었고
사이드카의 바이트 수가 그보다 작으므로 **비용 회귀는 아니지만**, "단건 저장 = 사이드카
전량 쓰기"는 이 설계의 성질이다(append-only 대안은 Open questions 2).

## FR

각 FR은 goal의 Objective(O1~O2)·Constraints를 지지한다.

- **FR-1 (벡터 분리 저장)** *(goal: O1)* — 청크 벡터는 JSON 인라인 배열이 아니라 사이드카
  바이너리(헤더 + Float32 LE 연속)에 저장한다. 디스크 JSON의 각 청크는 `vector` 대신
  `slot`(사이드카 내 순번)을 갖고, 색인은 `vectorFile`(현재 사이드카 basename)을 기록한다.
  slot은 저장 시 인메모리 청크 순회 순서로 순차 할당한다. **인메모리 표현(벡터 보유)·
  검색(cosine)·folder 스코프는 불변.**
- **FR-2 (2파일 원자적 정합)** *(goal: O1, Constraints)* — 저장은 락 안에서 다음 순서로
  한다: (1) reload-merge(디스크가 로드 시점 이후 바뀌었으면 디스크 JSON+사이드카를 읽어
  병합, 013/021 기제 계승), (2) 신규 generation 사이드카를 temp에 쓰고 rename으로 durable화
  (아직 어떤 JSON도 참조 안 함), (3) `vectorFile`가 그 사이드카를 가리키는 JSON을 temp+rename
  으로 **원자적 교체 = 단일 커밋점**, (4) 커밋 성공 후 오래된 generation 사이드카를 GC하되
  **직전 1세대는 유예한다(keep=2)** — `loadIndex`는 성능상 락을 잡지 않으므로(v4에선 벡터가
  JSON 한 파일에 있어 단일 read로 원자적이었다), 사이드카 분리는 reader에게 "JSON을 읽고
  사이드카를 읽는 사이에 writer가 GC하는" 2-read 경합을 새로 도입한다. keep=2 유예 +
  FR-3의 재시도 규정이 이 경합을 흡수한다. 이 논증은 writer 간(락)과 reader-writer 간
  (유예+재시도) 정합을 **분리해서** 보장한다. 교차 버전·모델 색인은 병합하지 않는다(기존
  가드 유지 — 낡은 벡터 되살림 방지).
- **FR-3 (자가 치유 — 양성 경합과 구분)** *(goal: O1)* — 로드 시 사이드카가 없으면 즉시
  손상으로 판정하지 않고 **JSON을 1회 재파싱**한다 — `vectorFile`이 새 generation을
  가리키면 동시 저장의 양성 경합이므로 그것을 읽는다(자가 치유 아님). 재시도 후에도
  사이드카가 없거나, 헤더 매직·dims 불일치, 또는 slot이 사이드카 범위를 벗어나면(부분
  손상), 영향 파일 항목을 색인에서 제거해 다음 스캔에서 재임베딩되게 하고 사유를 평이한
  한국어로 1회 안내한다(`notifyReindexOnce` 관례). 사이드카 전량 유실이면 전량 재임베딩으로
  귀결(전량 재빌드와 동치, 데이터 유실 없음).
- **FR-4 (무재임베딩 v4→v5 마이그레이션)** *(goal: O2)* — v4 색인(인라인 `vector` 보유)을
  처음 로드하면, **임베딩 호출 없이** 인라인 벡터를 재사용해 v5 인메모리로 변환한다. 다음
  저장(재색인·capture·removeFromIndex의 정상 경로)에서 v5(JSON slot + 사이드카)로
  영속화한다. v4가 손상돼 파싱·변환 불가면 기존 관례(전량 재빌드, 재임베딩)로 폴백하고
  사유를 안내한다.
- **FR-5 (버전 하위호환·롤백·위생)** *(goal: Constraints)* — v5는 `INDEX_VERSION`을 올린다.
  구버전 코드가 v5를 만나는 경우(롤백)를 포함해 다른 버전은 기존 관례대로 재빌드로 자가
  치유하며 데이터 유실이 없다. `saveIndex`의 교차버전·교차모델 병합 스킵 가드는 유지한다.
  사이드카·temp·lock은 `INDEX_PATH` 인접에 두고, 사이드카는 git 추적·백업 시드에서 기존
  `.brain-index.json`과 동일하게 제외한다.

## Acceptance Criteria

각 AC는 테스트와 1:1 매핑한다. 하니스는 기존 관례(자식 프로세스 격리 + HTTP 임베딩 스텁
`withEmbedStub` + `calls()` 계측 + `BRAIN_INDEX`/`NOTES_DIR` 주입 + `indexKeys`)를 쓴다.
스텁 임베딩 차원은 4(`[1,0,0,0]`)로 사이드카를 결정적으로 검증한다. 경로 예시는
플레이스홀더(`/home/<user>/...`)를 쓴다.

- **AC-1 (FR-1)** Given 노트 몇 개를 v5로 재색인하면, Then `.brain-index.json`의 어떤
  청크에도 `vector` 배열이 없고 각 청크에 `slot`이 있으며, `vectorFile`이 가리키는 사이드카
  파일이 존재하고 헤더(16바이트)의 dims=4·count=총 청크 수, 파일 크기 =
  `16 + count×4×4`바이트다.
- **AC-2 (FR-1)** Given AC-1의 v5 색인에서, When `search_notes`를 호출하면, Then
  인메모리 벡터가 사이드카에서 복원되어 정상 히트를 반환한다(cosine 무변경).
- **AC-3 (FR-2 GC)** Given 같은 색인을 3회 저장(재색인)하면, Then `vectorFile`이 가리키는
  사이드카는 존재하고, `INDEX_PATH` 디렉토리의 `<indexBasename>.vec-*` 파일은 **2개
  이하**다(keep=2 유예 — 직전 세대까지만 남고 그 이전은 GC됨).
- **AC-3b (FR-2·3 reader 경합)** Given 프로세스 A가 v5 JSON을 파싱해 `vectorFile`을 얻은
  직후 사이드카를 읽기 전에, 그 사이드카가 삭제되고 JSON이 새 generation으로 교체된
  상황을 재현하면(fixture로 결정적 구성 — 옛 gen 삭제 + 새 gen·새 JSON 배치), When A가
  로드를 계속하면, Then FR-3의 재시도 규정대로 JSON을 재파싱해 새 사이드카를 읽어 전
  벡터를 복원하고, 자가 치유(항목 제거·재임베딩)가 발생하지 않는다.
- **AC-4 (FR-2 정합)** Given 저장 직후 캐시를 무효화(별도 프로세스)하고 로드하면, Then
  디스크(JSON+사이드카)만으로 모든 청크 벡터가 복원되어 검색이 저장 전과 동일하게 동작한다.
- **AC-5 (FR-3 자가 치유)** Given v5 색인의 사이드카를 삭제(또는 헤더 이후를 truncate)한
  뒤, When 재색인하면, Then 영향 파일이 재임베딩되고(`calls()>0`) 이후 검색이 정상이며,
  자가 치유 안내가 stderr에 1회 출력된다.
- **AC-6 (FR-2 교차버전 무병합)** Given 디스크가 v4(또는 다른 모델)인데 인메모리가 v5면,
  When `saveIndex`가 reload-merge를 시도하면, Then 병합하지 않는다(기존 013 가드 회귀 고정).
- **AC-7 (FR-5 다중 프로세스 무유실)** Given 두 프로세스가 v5 색인을 로드한 뒤 각자 다른
  파일을 색인·저장하면, Then 최종 색인(JSON+사이드카)에 두 파일의 벡터가 모두 복원
  가능하게 존재한다(013 AC-11의 사이드카판).
- **AC-8 (FR-4 무재임베딩)** Given v4 JSON(인라인 벡터 `[1,0,0,0]`, `version:4`)을 심어두고,
  When 재색인하면, Then 임베딩 호출이 0건(`calls()==0`)이고 결과가 v5(청크에 `slot`,
  `vectorFile`·사이드카 존재)이며 검색이 정상 동작한다.
- **AC-9 (FR-4 손상 폴백)** Given v4 JSON이 파싱 불가로 손상돼 있으면, When 재색인하면,
  Then 기존 관례대로 전량 재빌드(재임베딩 발생, `calls()>0`)되고 최종 포맷이 v5다.

## Open questions

1. **사이드카 쓰기 전략** — 매 저장 전량 재작성(현 결정) vs append-only + 주기적 compaction.
   021 스로틀과 결합하면 전량 재작성으로 충분하나, 초대형 색인에서 append-only가 저장당
   쓰기량을 더 줄일 여지 — 실측 후.
2. **텍스트 분리** — JSON 잔여 크기의 다음 지배 요인이 청크 `text`라면 별도 파일 분리
   후보. 이번엔 JSON 유지(검색 표시·사람 열람).
3. **즉시 롤백 지원** — 마이그레이션 시 v4 JSON 1부를 `.v4bak`로 보존해 즉시 롤백을
   지원할지. 디스크 2배 일시 점유 vs 재임베딩 회피. 파생물이라 미보존(재임베딩 롤백)이
   현 기본.
4. **fsync 강도** — 사이드카 커밋 전 파일·디렉토리 fsync를 어디까지 할지(내구성 vs 저장
   지연). 최소 "사이드카 rename을 JSON rename보다 먼저"는 확정, fsync 세부는 미결.
5. **인메모리 벡터 표현** — `number[]`(f64) 유지 vs `Float32Array` 전환(메모리 절반, cosine
   무변경 가능). 성능/메모리 이점 vs 변경 파급 — 별도 판단.
6. **다중 버전 혼재 완화** — 구/신 MCP 동시 실행의 재빌드 스래싱을 코드(버전 가드에서 상호
   재빌드 억제)로 완화할지, 문서 안내(업그레이드 후 클라이언트 재시작)로 둘지.
7. **024(바인딩)와의 순서** — 바인딩은 additive 필드라 v4/v5 어느 쪽에도 얹을 수 있다.
   023이 먼저 가면 024는 v5 위에 필드만 추가(버전 불변), 024가 먼저 가면 v4에 얹은 뒤
   023 마이그레이션이 보존. 순서 강제는 없으나 동시 구현은 피한다(같은 저장 경로).
