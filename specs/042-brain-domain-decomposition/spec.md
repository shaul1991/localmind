# Spec: Brain 도메인 책임 분해

<!-- 무엇을(what) 만드는가. 상위: [goal](goal.md) -->

<!-- 검증 표기: 구현·self-review가 clean으로 닫히면 FR·AC를 [x]로 바꾸고 테스트 근거를
     옆에 적는다. 미충족 항목은 체크하지 않고 사유를 남긴다. -->

## Scope

현재 Brain 모듈의 동작을 폴더/설정, 색인 저장소, 색인 실행기, 검색기, 캡처·노트 수명주기,
RAG 합성·검증, 질의 이벤트 싱크로 분리한다. 기존 `src/brain.ts`는 모든 공개 export를
그대로 제공하는 호환 facade와 단일 composition root로 유지한다.

## Context

- 현재 모듈은 약 1,800줄이며 설정 해석부터 파일 시스템 감시, 색인 저장, 검색, 캡처,
  답변 생성·검증, 질의 로그까지 담당한다.
- 색인 v5는 JSON과 바이너리 vector sidecar를 함께 사용한다. v4는 벡터를 재생성하지 않고
  v5 인메모리 표현으로 읽은 뒤 다음 저장에서 영속화한다.
- 프로세스 내 캐시·single-flight와 프로세스 간 파일 락·병합이 함께 데이터 일관성을 지킨다.
- 안전한 색인 정리는 스캔 성공 라벨, fallback 모드, 명시적 orphan prune, 폴더 rebind
  보존·수락 규칙에 의존한다.
- 041은 검색 질의 이벤트의 의미와 additive 필드를 정본화한다. 이 작업은 그 기록 계약을
  바꾸지 않고 독립 싱크로 옮긴다.

## Functional Requirements

- [ ] **FR-1 (호환 facade)**: `src/brain.ts`는 기존의 모든 값·함수·타입 export와 각 함수의
  signature, 동기/비동기 형태를 그대로 제공하고 내부 구현의 유일한 조립 지점이 된다.
  facade 자체에는 도메인 정책이나 별도의 mutable 상태를 두지 않는다.
  → goal: Objective / Success metrics 1
- [ ] **FR-2 (폴더·설정 경계)**: 노트 폴더 목록, label 조회, 색인·로그 경로와 Brain 관련
  직접 환경 설정의 해석·기본값을 FolderConfig가 소유한다. 현재 module-load 상수는 한 번만 평가하고
  현재 use-case 호출 시 읽는 값은 getter로 매번 평가한다. 단, 기존 `agents/registry.ts`, `skills.ts`,
  `runtime.ts`가 호출 시 해석하는 agent 경로와 persona gateway 설정은 그 모듈의 기존 소유권·시점을
  유지하고 FolderConfig로 복제하지 않는다. 추출한 다른 Brain 경계는 `process.env`를 직접 읽거나 같은
  기본값을 다시 해석하지 않는다.
  → goal: Objective / Constraints
- [ ] **FR-3 (IndexStore 상태 소유)**: 색인 JSON 읽기·쓰기, v4→v5 무재임베딩 hydration,
  v5 sidecar 읽기·세대 생성·자가치유·정리, 원자적 교체, 파일 락, 저장 시 최신 디스크 병합,
  캐시·stat snapshot·migration flag를 IndexStore가 단독 소유한다.
  → goal: Objective / Success metrics 2·3·5
- [ ] **FR-4 (Indexer 실행 소유)**: 프로세스 내 single-flight, 폴더 scan, 변경·삭제 판정,
  임베딩 배치, fallback prune guard, orphan prune, rebind preserve/adopt, reindex summary,
  watcher가 촉발하는 재색인을 Indexer가 단독 소유한다. Indexer는 저장 세부를 IndexStore의
  인터페이스로만 사용한다.
  → goal: Objective / Success metrics 2·3
- [ ] **FR-5 (Retriever 경계)**: 질의 embedding, 현재 cosine 점수·folder filter·정렬·limit,
  `NoteHit` 매핑과 링크 조회를 Retriever가 소유한다. 현재 검색 알고리즘과 결과 순서·필드·
  오류를 바꾸지 않는다.
  → goal: Objective / Non-goals
- [ ] **FR-6 (Capture·노트 수명주기 경계)**: 캡처 파일명 충돌 회피, frontmatter·태그 처리,
  캡처 검증, 태그 vocabulary TTL, 노트 목록·메타 파싱·휴지통 이동·삭제와 색인 무효화의
  오케스트레이션을 한 경계가 소유한다. 파일 내용·경로·결과 union을 보존한다.
  → goal: Objective / Success metrics 2·4
- [ ] **FR-7 (RAG 합성·검증 경계)**: context 구성, 기존 강제 규칙, 답변 모델 호출, 출처
  매핑, 교차 모델 검증·일일 상한·skip/warn 판단을 RAG 경계가 소유한다. 프롬프트, 모델 선택,
  timeout, 사용자 응답을 바꾸지 않는다.
  → goal: Objective / Non-goals
- [ ] **FR-8 (QueryEvent I/O 경계)**: 041에서 확정한 search·ask·capture 이벤트 record를
  JSONL로 기록하는 경로 준비, 직렬화, append와 기록 실패 격리를 `QueryEventSink`가 소유한다. 읽기
  전용 `QueryEventReader`는 FolderConfig의 path를 기존 `query-analysis.ts#readRecords`에 공급하는 얇은
  adapter이며 파일 parsing/I/O를 복제하지 않는다. RAG는 이 포트로 일일 검증 상한 자료를 얻는다.
  검색 성공과 관련성 성공의 의미를 혼합하거나 기존 필드를 재해석하지 않는다.
  → goal: Objective / Constraint 041
- [ ] **FR-9 (단방향 의존성과 단일 상태)**: 의존 방향은 composition root → use-case 경계 →
  Indexer/Retriever/Store·설정·이벤트 싱크 순으로만 흐른다. 내부 모듈은 facade를 import하지
  않고, cache·lock·single-flight·tag vocabulary·verification counter에 각각 하나의 상태
  정본만 존재한다.
  → goal: Success metrics 3 / Risks
- [ ] **FR-10 (Scanner와 순수 유틸리티 보존)**: `listMarkdown`의 filesystem 순회와 hidden/root
  `memory.md`/agents/skills/mirror 제외 정책은 상태 없는 MarkdownScanner가 소유하고 Indexer·Capture가
  같은 포트를 사용한다. chunk 분할, 링크 추출·해결, frontmatter 생성·파싱 같은 순수 로직은 별도
  유틸리티로 재사용하되 기존 export와 결과를 그대로 유지한다.
  → goal: Objective / Non-goals
- [ ] **FR-11 (무마이그레이션 배포)**: 기존 v4/v5 fixture와 실제 v5 색인은 별도 변환 명령,
  전량 재색인 또는 임베딩 재생성 없이 새 구조에서 사용 가능해야 한다.
  → goal: Success metrics 4·5 / Constraints
- [ ] **FR-12 (구조적 테스트 가능성)**: 각 경계는 실제 파일 시스템·embedding·gateway·시계·
  이벤트 싱크를 기존 방식과 호환되는 좁은 포트로 주입할 수 있어야 하며, 프로덕션 기본 배선은
  현재 동작과 동일해야 한다. 기존 reset/counter/JSON-parse-hook seam은 facade가 해당 Store/Indexer
  owner에 위임하고, 테스트 전용 공개 export를 새로 일반 API로 확장하지 않는다.
  → goal: Expected outcome / Constraints
- [ ] **FR-13 (IndexDiagnostics read model)**: `indexLabelReport()`의 label count, orphan 판정,
  missing-directory 진단과 empty/corrupt index의 조용한 생략을 IndexDiagnostics가 소유한다. Store의
  read, FolderConfig와 read-only directory probe만 사용하고 mkdir, reindex, embedding, index save를
  촉발하지 않는다. facade는 결과를 그대로 위임한다.
  → goal: Success metrics 1·2·4 / Non-goals

## Compatibility Surface

다음 `src/brain.ts` 공개 표면은 이름, 타입, 인자 기본값, 반환형을 변경하지 않는다.

| 범주 | 유지할 공개 표면 |
|---|---|
| 폴더·색인 | `NoteFolder`, `notesFolders`, `brainIndexPath`, `FileEntry`, `BrainIndex`, `loadIndex`, `saveIndex`, `ReindexSummary`, `reindex`, `listFolders`, `indexLabelReport`, `notesDir` |
| 순수/색인 보조 | `listMarkdown`, `chunkText`, `extractLinks`, `resolveLink`, `removeFromIndex`, `watchNotes` |
| 검색·링크 | `NoteHit`, `searchNotes`, `ResolvedLink`, `NoteLinks`, `noteLinks` |
| 캡처·노트 | `CaptureResult`, `collectTagVocab`, `extractSearchQuery`, `createNoteFile`, `buildNoteFrontmatter`, `capture`, `listNotes`, `NoteMeta`, `parseNoteMeta`, `NotesListing`, `listNotesWithMeta`, `moveToTrash`, `DeleteNoteResult`, `deleteNote` |
| RAG | `BrainAnswer`, `askBrain` |
| 기존 테스트 seam | `_setAfterJsonParseHookForTest`, `_resetIndexCacheForTest`, `_indexRunCountForTest`, `_saveRunCountForTest`, `_resetTagVocabCacheForTest` |

구현 직전 현재 `src/brain.ts`의 export 목록을 자동 추출해 위 표와 대조한다. 041 완료 과정에서
additive export가 생겼다면 그것도 동일하게 facade에 유지하며 이 표를 함께 갱신한다.

## State Ownership Contract

| 상태/정책 | 유일 소유자 | 다른 경계의 허용 접근 |
|---|---|---|
| 폴더 목록·label map·경로·module-load 설정 snapshot와 call-time 설정 getter | FolderConfig | 읽기 전용 조회 |
| agent/skill 경로와 persona gateway call-time env | 기존 registry/skills/runtime 모듈 | Scanner/Capture/RAG가 기존 resolver 호출 |
| hydrated index cache·disk stat/load snapshot | IndexStore | `load`/invalidate 포트 |
| file lock·stale 판단·disk merge·atomic save | IndexStore | `save` 요청만 |
| sidecar generation·header·GC·heal·v4 migration flag | IndexStore | hydration 결과와 진단만 |
| single-flight promise·scan/seen/dirty·reindex summary | Indexer | `ensureIndexed`/`reindex` 호출 |
| prune/rebind 요청 해석과 보호 정책 | Indexer | 결과 summary 조회 |
| tag vocabulary TTL | Capture | reset 테스트 seam |
| RAG 검증 일일 사용량 판단 | RAG verifier | 검증 결과만 |
| JSONL directory-ready·event append | QueryEventSink | typed event 기록 |

## Acceptance Criteria

- [ ] **AC-1 (공개 계약)**: Given 구현 직전의 `src/brain.ts` export manifest와 타입 소비 fixture,
  When 분해 후 facade를 import하고 typecheck하면, Then export 누락 0건이고 모든 호출 signature·
  기본값·동기/비동기 형태가 동일하다. → FR-1·10
- [ ] **AC-2 (설정·출력·평가 시점 호환)**: Given 동일 env의 고정 fixture와 import 뒤 env를 바꾸는
  consumer별 matrix, When 분해 전후 폴더 목록·경로·오류·stderr·공개 반환값, 기본 RAG, persona RAG,
  curator tagging과 scanner 제외 판정을 비교하면, Then direct-Brain module-load 값은 import 당시 값, direct call-time
  getter와 기존 agent registry/runtime resolver는 다음 호출의 변경값을 반영해 바이트/구조 차이가 없다.
  → FR-1·2·11
- [ ] **AC-3 (v4→v5 무재임베딩)**: Given 정상 v4 inline-vector fixture와 손상 벡터 edge
  fixture, When load 후 기존 저장 흐름을 실행하면, Then 정상 벡터는 재임베딩 호출 없이 v5
  JSON+sidecar로 보존되고 손상 항목의 현재 자가치유 동작도 동일하다. → FR-3·11
- [ ] **AC-4 (v5 sidecar 경합·자가치유)**: Given 정상·누락·header 불일치 sidecar와 JSON
  parse 직후 다른 세대가 commit되는 fixture, When IndexStore가 load/save하면, Then 현재 재파싱,
  세대 채택, 자가치유, 이전 세대 정리 불변식이 동일하다. → FR-3
- [ ] **AC-5 (다중 프로세스 병합)**: Given 두 격리 프로세스가 같은 색인을 읽고 서로 다른
  노트를 갱신하며 저장 순서를 경합시키면, When 둘 다 종료한 뒤 새 프로세스가 색인을 읽으면,
  Then 양쪽 항목과 벡터가 남고 lock·stale-lock 처리 및 sidecar 참조가 유효하다. → FR-3·11
- [ ] **AC-6 (single-flight)**: Given watcher와 둘 이상의 호출자가 동시에 색인을 요청하면,
  When 첫 실행이 완료될 때까지 겹쳐 호출하면, Then 실제 scan/embedding 실행은 1회이고 모두 같은
  완료 결과를 받는다. → FR-4·9
- [ ] **AC-7 (scan·fallback prune guard)**: Given 일부 폴더가 없거나 읽기 실패하고 fallback
  설정이 활성화된 fixture, When 재색인하면, Then 스캔에 성공하지 않은 라벨의 기존 항목을 지우지
  않으며 등록 라벨은 orphan prune 요청으로도 삭제되지 않고 summary가 현재와 동일하다. → FR-4
- [ ] **AC-8 (rebind 보존·수락)**: Given 같은 label의 기록 경로와 현재 경로가 다른 색인,
  When 기본 재색인과 명시적 수락 재색인을 각각 실행하면, Then 기본은 옛 항목을 보존·보고하고
  수락은 새 경로를 채택해 옛 항목을 현재 규칙대로 제거·보고한다. → FR-4
- [ ] **AC-9 (캡처 충돌·검증)**: Given 같은 시각·제목으로 반복되는 캡처와 태그·검증 성공/실패
  fixture, When capture를 연속 실행하면, Then 파일을 덮어쓰지 않고 현재 이름 충돌 회피,
  frontmatter, validation status, 태그 vocabulary cache, 색인 갱신 결과를 보존한다. → FR-6
- [ ] **AC-10 (watcher·삭제)**: Given 생성·수정·삭제 watcher 이벤트와 명시적 delete 요청,
  When debounce 이후 처리하면, Then 파일 존재 시 재색인, 부재 시 색인 제거, 명시적 삭제 시
  상대경로를 보존한 휴지통 이동과 공개 result union이 현재와 동일하다. → FR-4·6
- [ ] **AC-11 (검색·RAG 호환)**: Given 고정 embedding·gateway·verification adapter와 동일
  색인, When search와 ask를 실행하면, Then hit 순서·score·source, 합성 프롬프트, 검증
  pass/warn/skipped, 사용자 응답 및 오류 동작이 기준값과 동일하다. → FR-5·7
- [ ] **AC-12 (041 이벤트 계약)**: Given search 결과 있음/없음, ask 검증 세 상태, capture 검증
  상태와 로그 쓰기 실패, When 각 use case를 실행하면, Then 041의 event schema·필드 의미·기록
  횟수를 그대로 지키고 로그 실패는 사용자 기능을 실패시키지 않는다. → FR-8
- [ ] **AC-13 (저장 억제 회귀)**: Given 변경 없는 연속 검색·색인과 실제 변경이 있는 실행,
  When 저장 횟수를 계측하면, Then 변경 없는 실행은 기존처럼 저장하지 않고 dirty/migration/
  sidecar heal이 있을 때만 저장한다. → FR-3·4
- [ ] **AC-14 (경계 강제)**: Given 내부 dependency graph와 상태 선언 정적 검사, When 전체
  소스를 분석하면, Then 순환 의존 0개, 내부 모듈의 `src/brain.ts` import 0개, 상태 소유권 표의
  중복 선언 0개이고 facade는 조립·위임·re-export 외 정책 분기를 갖지 않는다. → FR-1·9·12
- [ ] **AC-15 (전체 회귀·무재색인)**: Given 기존 단위·통합 테스트와 사본 v5 fixture,
  When typecheck/build/전체 테스트 및 분해 전후 실증을 실행하면, Then 모두 green이고 fixture의
  임베딩 호출·전량 재색인 0회, 공개 MCP/API snapshot 차이 0건이다. → FR-11·12
- [ ] **AC-16 (index label 진단 호환)**: Given empty/corrupt index, orphan label, 읽을 수 있는 등록
  폴더와 읽을 수 없는 등록 폴더 fixture, When 분해 전후 `indexLabelReport()`를 호출하면, Then 구조와
  순서가 같고 empty/corrupt는 빈 결과이며 mkdir/reindex/embed/save 호출은 모두 0회다. → FR-13

## Open questions

없음. 이 작업은 동작 보존 리팩터이므로 구현 중 발견한 정책 변경 필요사항은 임의로 함께
처리하지 않고 별도 스펙 후보로 기록한다.
