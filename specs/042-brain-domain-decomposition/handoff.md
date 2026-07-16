# Handoff: Brain 도메인 책임 분해 구현 프롬프트

아래 전문을 구현 모델에 그대로 전달한다.

```text
당신은 localmind의 Brain 도메인 리팩터를 맡은 senior TypeScript engineer다. 목표는 새 기능이
아니라 데이터 보호 계약을 유지하면서 `src/brain.ts`의 책임과 상태 소유권을 분리하는 것이다.
작은 동작 차이도 개선으로 간주하지 말고 회귀로 취급하라.

## 선행 조건

1. 저장소 루트의 `AGENTS.md`와 세션 컨텍스트 프로필을 먼저 읽어라.
2. `specs/042-brain-domain-decomposition/{goal,spec,plan}.md`를 순서대로 읽어라.
3. `specs/041-retrieval-quality-contract`의 구현·테스트·self-review가 clean이고 문서 체크가
   완료됐는지 확인하라. 아니면 코드를 수정하지 말고 차단 사유를 보고하라.
4. 데이터 계약의 배경으로 `specs/013-*`, `020-*`, `021-*`, `022-*`, `023-*`와 현재
   `src/brain.ts`, `query-analysis.ts`, 기존 Brain 테스트를 읽어라. 문서와 현재 코드가 충돌하면
   추측하지 말고 표면화하라.
5. `git status --short`를 기록하고 기존 사용자 변경을 보존하라. 특히 이 작업은 `Makefile`을
   수정하지 않는다.

## 고정 범위

- `src/brain.ts`를 호환 facade/composition root로 남긴다.
- 내부 경계는 FolderConfig, IndexStore, Indexer, Retriever, Capture+note lifecycle,
  RAG synthesis/verification, QueryEventSink/Reader, MarkdownScanner, IndexDiagnostics와 순수 note
  utilities다.
- `src/brain/` 아래 plan.md에 정한 파일명과 의존 방향을 사용한다.
- 기존 공개 export, 이름, signature, 기본값, sync/async 형태, 테스트 seam을 모두 유지한다.
- 기존 호출자는 계속 `src/brain.ts`에서 import한다. 호출부를 새 내부 파일로 대량 전환하지 마라.

## 절대 변경 금지

- index v5 JSON·binary sidecar wire format, 헤더, 세대/GC, atomic commit, lock protocol
- v4→v5 무재임베딩 정책과 손상 자가치유 정책
- 검색 embedding/scoring/filter/sort/limit 및 결과 필드·순서
- scan, fallback prune, orphan prune, rebind preserve/adopt 정책
- capture 파일명·frontmatter·태그·validation·trash/delete 동작
- RAG prompt, 모델 선택, timeout, verifier 규칙·일일 상한·사용자 출력
- 환경변수 이름·기본값·읽는 시점, stderr/오류 문구, API/MCP 응답
- 041 QueryLogRecord 의미와 필드; 신규 외부 의존성; 성능 최적화; 실제 사용자 데이터 migration

이 중 하나를 바꿔야만 분해가 가능해 보이면 즉시 중단하고 근거와 최소 재현을 보고하라. 별도
정책 변경을 042에 몰래 포함하지 마라.

## 상태 소유권

- FolderConfig만 folders/label map/index path/query log path/env 평가를 소유한다.
- FolderConfig는 plan.md의 direct-Brain module-load 설정은 한 번만, direct call-time 설정은 getter마다
  읽는다. 기존 agent path resolver와 persona runtime의 call-time env 소유권은 옮기거나 snapshot하지
  않는다. 모든 소비 경로의 `process.env`를 구현 직전 다시 대조한다.
- IndexStore만 hydrated cache, cached stat/load snapshot, migration/heal flags, file lock,
  disk merge, JSON/sidecar hydration·commit·GC를 소유한다.
- Indexer만 indexingInFlight, scan/seen/dirty, prune/rebind requests, last summary와 watcher가
  촉발하는 재색인 실행을 소유한다.
- Capture만 tag vocabulary TTL cache를 소유한다.
- RAG verifier만 검증 사용량 판단을 소유한다.
- QueryEventSink만 log directory-ready와 append I/O를 소유한다. `QueryEventReader`는 FolderConfig의
  path로 기존 `query-analysis.ts#readRecords`를 호출하는 adapter이며 parsing/I/O를 이동·복제하지 않는다.
  RAG verifier는 이 reader로 `countVerifyOnDay` 입력을 얻고 query-log path나 `fs`를 직접 소유하지 않는다.
- facade에는 위 상태를 복제하지 않는다. watcher, search, capture, delete, reindex가 production에서
  같은 Store/Indexer singleton을 사용하게 배선한다.
- MarkdownScanner만 `listMarkdown` filesystem 순회와 hidden/root-memory/agents/skills/mirror 제외를
  소유한다. Indexer와 Capture/listing, facade export가 같은 scanner를 사용하고 `note-utils.ts`에는 I/O를
  넣지 않는다.
- IndexDiagnostics가 `indexLabelReport()`의 label count와 orphan/missing 판정을 소유한다. Store read,
  FolderConfig와 read-only directory probe만 쓰며 mkdir/reindex/embed/save를 절대 호출하지 않는다.
- `_resetIndexCacheForTest()`는 Store의 cache/stat/save-counter reset과 Indexer run-counter reset에 함께
  위임한다. 진행 중 single-flight와 JSON parse hook은 현행처럼 reset하지 않는다. 나머지 counter/hook
  seam도 plan.md의 정확한 owner로 위임한다.

## TDD 실행 순서

1. 구현 직전 `src/brain.ts` export manifest를 생성해 spec.md Compatibility Surface와 대조하고,
   041에서 늘어난 export가 있으면 문서를 갱신하라.
2. 기존 테스트를 돌려 기준선 결과를 기록하라. 기존 실패가 있으면 분리해 보고하고 원인을
   숨기지 마라.
3. spec AC-1~16을 기존 테스트에 매핑하라. 없는 특성 테스트만 추가한다. 특히 다음은 반드시
   결정적으로 재현한다.
   - import 뒤 env 변경 시 direct Brain snapshot/getter, 기본/persona RAG, curator, scanner agent/skill path matrix
   - v4 정상·손상 load/save, embedding call 0
   - v5 sidecar 누락·header 손상·JSON parse 직후 세대 교체
   - 두 자식 프로세스의 서로 다른 update가 최종 합집합으로 병합됨
   - watcher+직접 호출 single-flight 실행 1회
   - missing/unreadable/fallback label 보존, 등록 label prune 차단
   - rebind 기본 preserve와 명시 adopt
   - 동시각·동명 capture collision과 validation/tag cache
   - watcher create/update/delete, 명시 delete의 상대경로 trash
   - empty/corrupt/orphan/missing `indexLabelReport`, 모든 mutation call 0
   - search/RAG snapshot과 041 search/ask/capture event matrix
   - unchanged save 억제와 dirty/migration/heal save
4. 현재 구조에서 실패하는 architecture test를 먼저 작성하라. 내부 모듈 존재, 순환 0,
   내부의 facade import 0, mutable state owner 유일성, facade의 정책 분기 부재를 검사한다.
5. pure types/utilities, FolderConfig, QueryEventSink/Reader, MarkdownScanner를 먼저 옮기고 전체 Brain
   테스트를 돌려라.
6. IndexStore를 옮긴다. cache/lock/sidecar/migration을 쪼개 서로 다른 singleton으로 만들지 마라.
   이 단계에서는 scan/prune/rebind를 건드리지 않는다. 전체 테스트를 돌려라.
7. Indexer를 옮긴다. single-flight/scan/embed/save decision/prune/rebind/summary/watch를 한
   production 인스턴스에 둔다. 전체 테스트를 돌려라.
8. Retriever, Capture+note lifecycle을 옮기고 공개 facade 위임을 연결한다. 전체 테스트를 돌려라.
9. RAG synthesis/verification을 옮기고 QueryEventSink/Reader를 연결한다. facade에는 조립·위임·
   re-export만 남긴다. 전체 테스트를 돌려라.
10. typecheck/build/전체 테스트와 격리 fixture 실증을 실행하라. 원본 사용자 index/notes/query
    log를 테스트 입력으로 쓰거나 수정하지 마라.

특성 테스트가 처음부터 green인 것은 정상이다. 새 경계의 구조 테스트는 추출 전 red를 확인하고
green으로 만든다. 리팩터 중 테스트를 약화하거나 snapshot을 새 출력에 맞춰 무비판적으로
갱신하지 마라.

## 내부 계약

plan.md의 `IndexStore`, `Indexer`, `Retriever`, `QueryEventSink`, `QueryEventReader` 인터페이스를
사용한다. 내부
인터페이스는 public API로 re-export하지 않는다. `types.ts`에는 공유 타입만, `note-utils.ts`에는
순수 함수만 둔다. gateway/embedding/fs/time은 기존 동작을 감싸는 좁은 포트로 주입하되 payload,
timeout, fallback은 수정하지 않는다.

`IndexStore.load()`의 object identity/mutation semantics가 불명확하면 현재 동작을 특성 테스트로
확정한 뒤 그대로 유지하라. 더 깔끔해 보인다는 이유로 clone·immutable 변환을 도입하지 마라.

## 필수 검증

- 저장소 package scripts를 확인한 뒤 최소 `npm run typecheck`, `npm run build`, `npm test`를
  실행한다. 기존 integration test 명령이 있으면 필요한 로컬 서비스 조건을 확인해 함께 실행한다.
- 샌드박스 소켓 권한 등 환경 때문에 실패하면 코드 실패와 구분해 정확한 명령·오류를 보고하고,
  가능한 비소켓 단위 테스트는 끝까지 실행한다.
- export manifest diff, import graph, state-owner 검사 결과를 남긴다.
- 사본 v4/v5 fixture에서 embedding calls=0과 index/sidecar 유효성을 증명한다.
- 고정 adapter로 search hit, RAG prompt/result, 041 event, MCP/API snapshot diff=0을 증명한다.

## Live-Verify Facts

이 리팩터는 외부 프로토콜을 새로 정의하지 않는다. Node/TypeScript 또는 외부 SDK의 현재 동작에
의존하는 새 주장을 코드·문서에 넣어야 한다면 최신 공식 T1 문서로 라이브 검증하라. 검증할 수
없으면 확정하지 말고 Open question과 검증 task로 남겨라. 기억이나 이전 대화를 근거로 단정하지
마라.

## 적대적 self-review (생략 금지)

구현 완료 선언 전에 구현 컨텍스트와 분리된 reviewer에게 “결함을 찾으라”고 요청하라. 다음을
모두 점검한다.

1. spec의 모든 FR·AC가 구현과 테스트에 1:1 연결되는가.
2. facade의 type/value export, default arg, sync/async, 초기화 순서가 정말 같은가.
3. cache/stat/migration, lock/merge/sidecar, single-flight/summary 상태가 중복되지 않았는가.
4. multi-process race, sidecar generation race, scan failure, fallback, rebind에서 데이터 손실이
   가능한가.
5. watcher/search/capture/delete/reindex가 같은 production singleton을 공유하는가.
6. 로그 실패가 검색·캡처·RAG를 실패시키거나 041 의미가 바뀌지 않았는가.
7. 새 순환 의존, 불필요한 abstraction, 보안·경로 traversal·시크릿 노출 문제가 생기지 않았는가.
8. 변경 가능한 외부 사실을 최신 공식 문서로 검증했는가.

실질 결함은 수정하고 다시 review하라. 문구·체크 같은 기계적 수정은 모아 마지막 한 라운드로
검토한다. clean일 때만 goal 성공 지표, spec FR·AC, plan 단계·테스트에 `[x]`와 구체적 근거를
남긴다. 미충족은 체크하지 말고 사유를 쓴다.

`/goal 042` 작업이므로 clean 후 AGENTS.md 규약에 따라 self-review 요약을 포함해 commit/push하고,
전체 SHA로 CI run을 찾아 `gh run watch <run-id> --exit-status`로 감시한다. CI 실패만 즉시 알리고
감시 프로세스를 정리한다. clean이 아니면 commit하지 말고 치명·중대 finding과 차단 조건을
보고한다.

## 완료 보고 형식

- 변경한 책임 경계와 facade 호환 방식
- AC별 테스트/실증 근거 및 전체 명령 결과
- export/import/state ownership 검사 결과
- 무재임베딩·무데이터마이그레이션 증거
- 독립 self-review finding과 수정 라운드, 잔여 위험
- commit SHA, push 상태, CI 결과(또는 환경 차단 사유)
```
