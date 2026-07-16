# Plan: Brain 도메인 책임 분해

<!-- 어떻게(how) 만드는가. 상위: [goal](goal.md) · [spec](spec.md) -->

## 접근 요약

strangler 방식으로 현재 `src/brain.ts`의 책임을 하단 의존성부터 한 경계씩 옮긴다. 먼저 기존
동작을 특성 테스트와 export manifest로 동결하고, 구조상 새로 생기는 의존 규칙은 실패하는
architecture test를 먼저 작성한다. 이후 FolderConfig·QueryEvent I/O → IndexStore → Indexer →
Retriever·Capture → RAG 순으로 이동하며 각 단계마다 전체 Brain 회귀를 실행한다.

리팩터가 끝난 `src/brain.ts`는 production singleton을 한 번 조립하고 기존 함수를 위임·re-export하는
composition root다. 내부 모듈은 facade를 import하지 않는다. 테스트용 인스턴스는 factory로
생성하되 production 기본 인스턴스와 환경 평가 시점을 바꾸지 않는다.

## 도메인 경계 (DDD)

### 경계와 역할

| 경계 | 책임 | 명시적 비책임 |
|---|---|---|
| FolderConfig | 폴더 env parsing, label map, index/query-log path, direct-Brain 설정의 consumer별 snapshot/getter | agent registry/runtime env, 색인 load/save, 스캔 정책 |
| IndexStore | JSON·sidecar hydration/persistence, v4 migration, cache/stat, lock, disk merge, atomic commit, sidecar heal/GC | 폴더 scan, embedding, prune/rebind 판단 |
| Indexer | single-flight, scan, chunk·embedding orchestration, dirty/save 결정, prune/rebind, summary, watcher-triggered indexing | 저장 포맷·락 구현, 검색 scoring |
| MarkdownScanner | Markdown filesystem 순회와 hidden/root-memory/agents/skills/mirror 제외 정책 | index mutation, chunking, capture 정책 |
| IndexDiagnostics | index label count, orphan/missing read model과 empty/corrupt 조용한 생략 | mkdir, reindex, embedding, index save |
| Retriever | ensure-indexed 이후 query embedding, scoring, filter/sort/limit, hit·link 조회 | 색인 저장, RAG prompt, 이벤트 파일 I/O |
| Capture | 캡처 생성·충돌 회피·frontmatter·태그·validation, 목록·메타·trash/delete 수명주기 | 검색 알고리즘, 색인 저장 세부 |
| RAG | retrieval context, synth prompt/call, source mapping, cross-model verification | 검색 scoring, JSONL append |
| QueryEvent adapters | Sink는 041 event append/실패 격리, Reader는 configured path를 기존 `readRecords`에 공급 | record parsing 복제, 성공 의미 재해석, 검증 상한 판단 |
| Brain facade | production dependency 조립, 기존 export 위임/re-export | 도메인 로직, 두 번째 mutable state |

### 유비쿼터스 언어

- **Store state**: 디스크 색인·sidecar와 그것을 반영한 프로세스 cache/stat 상태.
- **Index run state**: 한 번의 scan/embed/prune/rebind 실행과 single-flight promise.
- **Hydration**: JSON·sidecar 또는 v4 inline vector를 현재 인메모리 `BrainIndex`로 읽는 과정.
- **Commit**: 락 아래 최신 디스크 내용을 병합하고 새 sidecar와 JSON 참조를 원자적으로 게시하는 과정.
- **Rebind**: 동일 label의 기록된 폴더 경로와 현재 설정 경로가 달라진 상태. 기본 preserve,
  명시적 adopt가 기존 계약이다.
- **Fallback prune guard**: 폴더 탐색 실패나 fallback 설정 때문에 확인하지 못한 항목을 삭제하지
  않는 보호 규칙.
- **Compatibility facade**: 기존 소비자에게 같은 API를 보이되 정책은 소유하지 않는 경계.

### 의존 방향

```text
brain.ts (composition root)
  ├── RAG ───────────────> Retriever ──> Indexer ──> IndexStore ──> FolderConfig
  │       └──────────────> QueryEventReader / QueryEventSink
  ├── Capture ───────────> Indexer/IndexStore, FolderConfig, QueryEventSink
  └── public helpers ────> owning boundary

Indexer / Capture ───────> MarkdownScanner
brain facade ────────────> IndexDiagnostics ──> IndexStore / FolderConfig / directory probe

shared pure utilities <── IndexStore / Indexer / Retriever / Capture
gateway + embedding ports <── Indexer / Retriever / Capture / RAG
```

역방향 import와 내부 모듈의 `brain.ts` import를 금지한다. Retriever가 RAG를 모르고,
IndexStore가 Indexer·Retriever·Capture를 모르게 한다.

## 영향 모듈

- **수정**: `src/brain.ts` - 기존 export를 유지하는 facade/composition root로 축소.
- **신규**: `src/brain/` 아래 `config.ts`, `index-store.ts`, `indexer.ts`, `retriever.ts`,
  `capture.ts`, `rag.ts`, `query-events.ts`, `markdown-scanner.ts`, `diagnostics.ts`, `note-utils.ts`, `types.ts`.
- **테스트**: 기존 `src/brain*.test.ts` 특성 테스트를 보강하고 `src/brain-boundaries.test.ts`에
  export manifest·의존 방향·상태 단일 소유 검사를 추가한다.
- **무변경**: 색인 fixture 포맷, MCP/API route 및 호출부, `query-analysis.ts`의 041 계약,
  환경변수·문서화된 사용자 동작, `Makefile`.

`note-utils.ts`에는 순수 파싱·chunk·link·frontmatter 보조만 둔다. Markdown filesystem I/O는
`markdown-scanner.ts`, 그 밖의 I/O나 module-level mutable state는 해당 소유 경계에 둔다. `types.ts`는
순환을 끊기 위한 공유 타입만 담고 실행 로직을 두지 않는다.

## Internal Interfaces

내부 이름은 아래로 고정하되 public export로 노출하지 않는다.

환경 평가는 변수명이 아니라 **현재 소비 경로** 기준으로 다음처럼 보존한다.

- **direct Brain module-load snapshot (FolderConfig)**: `HOME`, `NOTES_DIR`, `REINDEX_FALLBACK`, `BRAIN_INDEX`, `EMBEDDINGS_URL`,
  `EMBEDDINGS_KEY`/`LITELLM_MASTER_KEY`, `EMBEDDINGS_MODEL`, `LOCALMIND_URL`, `LOCALMIND_API_KEY`,
  `MCP_DEFAULT_MODEL`, `BRAIN_CHUNK_SIZE`, `QUERY_LOG`, `BRAIN_LOCK_STALE_MS`.
- **direct Brain call-time getter (FolderConfig)**: `EMBED_RETRIES`, `EMBED_TIMEOUT_MS`, `BRAIN_BATCH`, `BRAIN_SAVE_INTERVAL`,
  `BRAIN_CONCURRENCY`, `REINDEX_ADOPT_REBIND`, `REINDEX_PRUNE_LABELS`, `BRAIN_TAG_TIMEOUT_MS`,
  `BRAIN_CAPTURE_TAGS`, `CAPTURE_VALIDATE_TIMEOUT_MS`, `BRAIN_VERIFY`, `BRAIN_VERIFY_DAILY_LIMIT`,
  `BRAIN_VERIFY_TIMEOUT_MS`, `BRAIN_LIBRARIAN`, `WATCH_DEBOUNCE_MS`.
- **기존 agent path resolver의 call-time 평가 (소유권 이동 금지)**: `agentsDir()`/`skillsDir()`가 읽는
  `HOME`, `NOTES_DIR`, `LOCALMIND_AGENTS_DIR`, `LOCALMIND_SKILLS_DIR`. MarkdownScanner는 매 scan에서 이
  함수를 호출하고 결과를 snapshot하지 않는다.
- **기존 persona runtime의 call-time 평가 (소유권 이동 금지)**: `personaChat()`이 읽는
  `LOCALMIND_URL`, `LOCALMIND_API_KEY`. Capture curator와 RAG의 persona 경로는 이 함수를 그대로 사용하고
  direct Brain fallback의 module-load gateway 상수와 합치지 않는다.

구현 직전 Brain과 위 agent 모듈의 `process.env` 사용 목록을 다시 추출해 누락을 확인한다. 이 분류를 더 깔끔하게 보이도록
통일하는 것은 동작 변경이므로 금지한다.

```ts
interface IndexStore {
  load(): BrainIndex;
  save(index: BrainIndex): void;
  invalidateCache(): void;
  resetForTest(): void;
  setAfterJsonParseHookForTest(fn: (() => void) | null): void;
  readonly saveRunCount: number;
}

interface Indexer {
  ensureIndexed(): Promise<BrainIndex>;
  reindex(): Promise<{ files: number; chunks: number; summary: ReindexSummary | null }>;
  remove(key: string): void;
  watch(): { close(): void };
  resetForTest(): void;
  readonly runCount: number;
}

interface MarkdownScanner {
  list(dir: string, isRoot?: boolean, rootEntries?: import("node:fs").Dirent[]): string[];
}

interface IndexDiagnostics {
  labelReport(): {
    orphans: { label: string; files: number }[];
    missing: { label: string; dir: string; files: number }[];
  };
}

interface Retriever {
  search(query: string, limit?: number, folder?: string): Promise<NoteHit[]>;
  links(notePath: string): Promise<NoteLinks | null>;
}

interface QueryEventSink {
  append(record: QueryLogRecord): void;
}

interface QueryEventReader {
  read(): QueryLogRecord[] | null;
}
```

- 실제 `QueryLogRecord`와 041의 additive 필드는 `query-analysis.ts`/041 정본을 그대로 import한다.
- `QueryEventReader.read()`는 FolderConfig의 query-log path로 기존 `readRecords(path)`를 호출하고 결과를
  그대로 반환한다. RAG verifier는 그 결과를 기존 `countVerifyOnDay`에 전달한다. `readRecords`를
  이동·복제하거나 `query-analysis.ts`의 다른 소비자를 바꾸지 않으며, RAG는 path나 `fs`를 직접 받지 않는다.
- `IndexStore.load()`가 반환하는 인메모리 객체의 mutation semantics를 임의로 복사 방식으로
  바꾸지 않는다. 기존 특성 테스트로 현재 alias/cache 동작을 먼저 고정한다.
- `IndexStore.invalidateCache()`는 hydrated cache와 cached stat만 비우며 note entry를 삭제하거나 counter를
  바꾸지 않는다. `IndexStore.resetForTest()`는 cache/stat와 save counter를 현재 seam처럼 초기화하고,
  `Indexer.resetForTest()`는 run counter만 초기화한다. facade `_resetIndexCacheForTest()`는 두 reset을
  차례로 호출한다. 진행 중 single-flight와 JSON parse hook은 현행처럼 이 reset 대상이 아니다.
- facade `_setAfterJsonParseHookForTest`, `_saveRunCountForTest`, `_indexRunCountForTest`는 각각 위 Store/Indexer
  owner에 위임해 기존 공개 seam의 동기 반환과 효과를 보존한다.
- facade `listMarkdown()`은 하나의 production MarkdownScanner에 위임한다. Indexer와 Capture/listing도
  같은 scanner를 주입받으며 별도 순회·제외 정책을 복제하지 않는다. 기본 `isRoot=true`, caller-supplied
  `rootEntries`, 하위 readdir 실패 무시를 포함한 현재 signature와 동작을 보존한다.
- facade `indexLabelReport()`는 IndexDiagnostics에 그대로 위임한다. Diagnostics는 IndexStore의 read와
  FolderConfig, 주입된 read-only directory probe만 사용하고 scanner/indexer를 호출하지 않는다.
- `Capture`와 `RAG`는 class 여부와 관계없이 factory로 dependency를 받되, facade의 production
  singleton에서 정확히 한 번 생성한다.
- gateway·embedding 호출은 현재 helper를 포트로 감싸기만 하고 요청 payload·timeout·fallback은
  옮기지 않는다.

## 단계 (task 분해 가능)

- [ ] **0. 선행 게이트 확인**: 041 문서의 FR·AC 체크, 테스트 green, self-review clean을 확인한다.
  미완료면 042 구현을 시작하지 않는다. 현재 worktree와 export manifest를 기록하고 사용자 변경을
  보존한다.
- [ ] **1. 기준선과 특성 테스트 동결**: 공개 export/type fixture, 설정 평가·오류·stderr,
  v4→v5, v5 sidecar 경합·heal, multi-process merge, save throttle, single-flight,
  fallback prune, rebind, capture collision, watcher/delete, search/RAG, 041 event를 테스트로
  고정한다. 기존 테스트가 이미 증명하는 AC는 중복하지 말고 AC→테스트 추적표를 만든다.
- [ ] **2. 실패하는 구조 테스트 작성**: 내부 모듈 존재, 금지 import, 순환 0, 상태 선언의 유일
  소유, facade의 정책 분기 금지를 검사하는 `brain-boundaries` 테스트를 먼저 작성하고 현재 구조에서
  실패함을 확인한다.
- [ ] **3. 하단 경계 추출**: 공유 타입·순수 note utilities, FolderConfig, QueryEventSink/Reader,
  MarkdownScanner를 이동한다. 환경값 평가 시점, scanner 제외/실패 동작, query log 디렉터리 lazy 준비,
  write failure 격리를 snapshot과 오류 주입 테스트로 보존한다.
- [ ] **4. IndexStore·Diagnostics 추출**: v4/v5 hydration, sidecar, cache/stat/load snapshot,
  migration/heal flags, 파일 락·stale 처리, disk merge, atomic save/GC, 기존 테스트 seam을 하나의
  store로 이동하고 read-only label diagnostics를 연결한다. 이 단계에서는 scan·embedding·prune 코드를
  이동하지 않으며 AC-16의 mutation count는 0이어야 한다.
- [ ] **5. Indexer 추출**: single-flight와 scan/seen/dirty, embed batch, save 조건,
  prune/rebind·summary, remove/watch/reindex를 이동한다. watcher와 직접 호출이 같은 production
  Indexer 인스턴스를 사용함을 동시성 테스트로 증명한다.
- [ ] **6. Retriever와 Capture 추출**: 검색 scoring/filter/order/hit mapping과 link 조회를
  Retriever로 옮긴다. 캡처·태그 TTL·검증·파일 충돌·노트 목록/meta/trash/delete는 Capture
  경계로 옮긴다. 공개 함수는 facade에서 동일 인스턴스로 위임한다.
- [ ] **7. RAG 추출 및 facade 마감**: 합성 prompt/call, source, verifier·일일 상한과 이벤트
  기록을 RAG로 옮긴다. `brain.ts`에는 import, production 조립, 위임/re-export와 기존 테스트 seam
  연결만 남긴다.
- [ ] **8. 통합 검증**: typecheck/build/전체 테스트를 실행하고 사본 v4/v5 색인으로
  무재임베딩, 분해 전후 search/capture/ask/API·MCP snapshot을 비교한다. 원본 사용자 색인은
  실증 입력으로 직접 수정하지 않는다.
- [ ] **9. 적대적 self-review**: 별도 컨텍스트 리뷰어가 FR·AC 1:1, 데이터 손실·경합,
  초기화 순서, 오류 처리, 불필요한 abstraction, 041 최신 계약을 점검한다. 실질 결함 수정 후
  다시 검토하고, 기계적 문서 체크는 마지막 한 라운드로 묶는다.
- [ ] **10. 검증 표기와 완료**: clean이면 `goal.md` 성공 지표, `spec.md` FR·AC, 이 문서의 단계·
  테스트 표에 `[x]`와 근거를 남긴다. `/goal 042` 완료 규약에 따라 commit/push 및 CI watch를
  수행한다.

## 테스트 전략

### 원칙

- 구조 변경 전 기존 특성 테스트는 기준선 green을 기록한다. 구조 규칙은 현재 단일 모듈에서
  실패하는 테스트를 먼저 만들고 최소 추출로 통과시킨다.
- 파일·HOME·색인은 임시 디렉터리와 자식 프로세스로 격리한다. 실제 사용자 노트, 실제 질의
  로그, 기본 `~/.localmind`를 읽기·수정하는 테스트를 금지한다.
- embedding/gateway/시계는 결정적 stub을 사용한다. “재임베딩 없음”은 호출 횟수 0으로, 저장
  억제는 기존 run-count seam으로 판정한다.
- 분해 전 기준값은 fixture/snapshot으로 동결하되 개인 데이터나 시크릿을 저장하지 않는다.

| AC | 테스트 레벨 | 방법 | 상태 |
|---|---|---|---|
| AC-1 | 타입·단위 | export manifest + 기존 import 소비 fixture typecheck | [ ] |
| AC-2 | 단위·자식 프로세스 | import 후 env 변경 matrix로 direct Brain, 기본/persona RAG, curator, scanner agent/skill 제외 경로 비교 | [ ] |
| AC-3 | 통합 | v4 정상·손상 fixture load/save, embedding calls=0 | [ ] |
| AC-4 | 통합 | 정상·누락·손상 sidecar와 after-JSON-parse 경합 seam | [ ] |
| AC-5 | 다중 프로세스 | 같은 index에 서로 다른 update 저장 후 합집합·vector 검증 | [ ] |
| AC-6 | 동시성 단위 | watcher+호출자 병렬 요청, index run count=1 | [ ] |
| AC-7 | 통합 | missing/unreadable/fallback 폴더와 prune 요청 matrix | [ ] |
| AC-8 | 통합 | rebind 기본 preserve와 명시 adopt 각각 검증 | [ ] |
| AC-9 | 단위·통합 | 동시각·동명 capture, validation/tag/cache/index 결과 | [ ] |
| AC-10 | 통합 | watcher create/update/delete debounce + trash 상대경로 | [ ] |
| AC-11 | 단위·snapshot | 고정 adapters로 hit/prompt/source/verifier/result 비교 | [ ] |
| AC-12 | 단위·통합 | 041 event matrix + append 실패가 use case를 막지 않음 | [ ] |
| AC-13 | 단위 | unchanged/dirty/migration/heal별 save run count | [ ] |
| AC-14 | 정적 구조 | import graph, 금지 import, mutable state owner, facade 검사 | [ ] |
| AC-15 | 전체 회귀 | `npm run typecheck`, `npm run build`, `npm test`; 필요 시 기존 integration 명령 | [ ] |
| AC-16 | 단위·통합 | empty/corrupt/orphan/missing label report parity, mkdir/reindex/embed/save=0 | [ ] |

## Self-review Gate

리뷰어는 “동작 보존”이라는 설명을 신뢰하지 말고 다음 결함을 찾는다.

1. facade export가 빠졌거나 type-only/value export가 뒤바뀌지 않았는가.
2. 환경변수 읽기와 singleton 생성 순서가 바뀌어 테스트·프로덕션 동작이 달라지지 않았는가.
3. IndexStore cache/stat/migration state 또는 Indexer single-flight가 복제되지 않았는가.
4. 락 획득 후 최신 디스크 병합, sidecar commit·GC, v4 hydration에 경합 창이 생기지 않았는가.
5. scan 실패 라벨, fallback, rebind preserve가 삭제로 오판되지 않는가.
6. watcher, capture, delete, search가 서로 다른 Indexer/Store 인스턴스를 쓰지 않는가.
7. 041 이벤트 의미·필드·건수 또는 로그 실패 격리가 달라지지 않았는가.
8. 정책 변경·성능 개선·새 의존성이 리팩터에 섞이지 않았는가.

## Open questions

없음. 구현 중 경계를 넘는 정책 문제가 드러나면 042를 확장하지 말고 별도 SDD 후보와 근거를
남긴다.
