# 023 — 색인 포맷 확장: 벡터 바이너리 사이드카 (how)

goal: [goal.md](goal.md) · spec: [spec.md](spec.md)

## 도메인 경계

이 스펙은 **색인 영속 계층(디스크 인코딩과 그 전이)** 만 바꾼다.

- 바뀌는 것: 디스크 포맷(v4→v5), `loadIndex`/`saveIndex`/`mergeIndexFromDisk`/`resetIndex`의
  사이드카 왕복, 마이그레이션 분기.
- **불변(경계 밖)**: 인메모리 `BrainIndex`는 벡터를 보유한다 → 검색(`cosine`,
  `searchNotesInternal`)·`noteLinks`·`resolveLink`·capture/watch/delete·세션·페르소나
  런타임은 손대지 않는다. 020 프루닝 가드(라벨 스코프·후퇴 보류)와 021 저장 스로틀은
  그 위에 얹혀 그대로 동작한다. `doEnsureIndexed`의 스캔·프루닝 로직도 불변(라벨↔경로
  바인딩은 024).

핵심 불변식: **"디스크 인코딩 ↔ 인메모리 표현" 분리** — 사이드카는 인메모리 벡터를
디스크에 싣고 내리는 인코딩일 뿐, 인메모리 이후 로직은 v4와 동일한 데이터를 본다.

## 영향 모듈 (구체 경로)

- `src/brain.ts` — 정본. 변경 지점:
  - `INDEX_VERSION` 4 → 5.
  - 인터페이스: `IndexedChunk`(디스크 표현에 `slot`, 인메모리에 `vector` 유지 — 직렬화
    경계에서 분리), `BrainIndex`에 `vectorFile?` 추가.
  - 사이드카 경로/generation 헬퍼: `sidecarPath(gen)`, `newGen()`, `gcSidecars(keepGens)` 신설
    (`INDEX_PATH` 인접, `LOCK_PATH`/temp 명명 관례 계승). **GC는 현재 + 직전 세대를
    유예(keep=2)** — 락 없는 reader가 옛 gen 참조를 쥔 채 GC당하는 경합 흡수(FR-2).
  - `loadIndex`: v5 분기(JSON 파싱 → 사이드카 읽어 slot→vector 부착 → 헤더·범위 검증).
    **사이드카 부재 시 JSON 1회 재파싱** — `vectorFile`이 새 gen이면 양성 경합으로 그것을
    읽고, 재시도 후에도 실패면 FR-3 자가치유(영향 파일 제거). v4 분기(FR-4 무재임베딩
    마이그레이션), 그 외 버전/손상 = 기존 재빌드. `notifyReindexOnce`로 안내.
  - `saveIndex`: FR-2 순서(reload-merge → 사이드카 temp+rename → JSON temp+rename 커밋 →
    keep=2 초과분 GC → 캐시 갱신). JSON 직렬화 시 벡터를 slot으로 치환하는 인코더, 사이드카
    Float32 버퍼 빌더 추가.
  - `mergeIndexFromDisk`: 디스크 항목을 채택할 때 그 벡터를 디스크 사이드카에서 읽어
    인메모리에 실어야 함 → reload-merge에서 "디스크 JSON+사이드카 → 인메모리(벡터 부착)"
    로더를 거친 뒤 병합. `dims` 병합 관례 계승.
  - `resetIndex`: 빈 v5 기록 시 사이드카도 정리(GC).
- `scripts/reindex.ts` — 요약 출력에 마이그레이션·자가치유 안내 추가(평이한 한국어).
- `src/brain.test.ts` — 신규 AC 하니스. 유틸 추가: `readSidecarHeader(path)`,
  `seedV4Index(idxPath, {key,text,vector})`, `vecFileCount(dir)`,
  `_afterJsonParseHookForTest`(아래 테스트 전략). 기존 `withEmbedStub`·`runReindexCli`·
  `runSaveProbe`·`makePruneFixture`·`indexKeys`·`_saveRunCountForTest` 재사용.
- 위생: `.gitignore`와 `scripts/backup*.sh`(및 backup 시드 제외 목록)에 사이드카 패턴
  `.brain-index.json.vec-*`(및 임의 `${BRAIN_INDEX}` 인접 `*.vec-*`) 제외를 기존
  `.brain-index.json` 제외와 나란히 추가. `docs/`(usage/faq/reference)에 업그레이드 후
  재시작·롤백 재임베딩 안내 한 줄.

## 사이드카 포맷·명명 (확정 세부)

- 파일명: `path.join(dirname(INDEX_PATH), basename(INDEX_PATH) + ".vec-" + gen)`.
  `gen`은 단조 증가 성격의 유니크 문자열(타임스탬프 base36 + pid + 카운터; temp는
  `.tmp-<pid>` 접미로 pid 충돌 방지 — 021 self-review 결함 5 관례 계승).
- 헤더: 16바이트 = magic `"LMV1"`(4) + dims uint32 LE(4) + count uint32 LE(4) + reserved(4).
- 본문: `count × dims` Float32 LE. slot i의 벡터 = 본문 `[i*dims, (i+1)*dims)`.
- `dims`는 `BrainIndex.dims`와 일치해야 하며 로드 시 대조(FR-3). files가 비면 사이드카·
  `vectorFile` 생략.

## 원자성 논증 (FR-2) — writer 간과 reader-writer 간을 분리해서 보장

**Writer 간(락)**: JSON이 사이드카를 **단방향 참조**하고 JSON rename만이 커밋점이므로:

- 사이드카 rename 후 JSON rename 전에 중단 → 디스크 JSON은 여전히 **이전** `vectorFile`을
  가리킴 → 정합(신규 사이드카는 미참조 고아, 다음 저장 GC).
- JSON rename 후 이전 gen GC 전에 중단 → 신규 커밋 완료, 이전 gen은 keep=2 유예 범위 →
  다음 저장 GC.
- 락(`acquireLock`, stale 타임아웃)으로 쓰기 직렬화 + reload-merge로 다중 프로세스 유실
  방어 — 013/021 기제 그대로, 사이드카 로드만 추가.

**Reader-writer 간(유예 + 재시도)**: `loadIndex`는 락을 잡지 않는다(성능·기존 설계).
v4에선 단일 JSON read가 원자적이라 이 경합이 없었지만, 사이드카 분리는 "JSON 읽기 →
사이드카 읽기" 2-read를 만든다. reader가 옛 gen 참조를 쥔 사이 writer가 커밋+GC하면
ENOENT — 이를 (a) GC keep=2 유예(직전 세대 보존)로 창을 줄이고, (b) 부재 시 JSON 1회
재파싱(새 gen 채택)으로 흡수한다(FR-3). 이 경합을 자가 치유로 오판하면 전량 재임베딩이
유발되므로 구분이 필수다(AC-3b). 잔여 위험(stale 락 동시 저장의 dangling)은 goal Risks에
정직 표기 — 자가 치유로 수렴, 데이터 유실 없음.

## 단계 (의존 순서)

1. **포맷 분리 도입** — `INDEX_VERSION=5`, `IndexedChunk` 디스크/인메모리 분리(slot↔vector
   인코더/디코더), `BrainIndex.vectorFile`, 사이드카 헬퍼, `loadIndex`/`saveIndex`의
   사이드카 왕복. 검색·merge가 인메모리 벡터라 무변경임을 확인. → AC-1·AC-2·AC-4.
2. **원자성·GC·자가치유** — generation·커밋 순서·keep=2 GC·헤더/범위 검증·재시도 규정·
   손상 자가치유, reload-merge에 사이드카 로드 통합, 교차버전 병합 가드 유지.
   → AC-3·AC-3b·AC-5·AC-6·AC-7.
3. **마이그레이션** — `loadIndex` v4 분기(무재임베딩 변환), 손상 폴백. → AC-8·AC-9.
4. **배선·위생·문서** — gitignore/백업 시드 사이드카 제외, docs 업그레이드/롤백 안내.
5. **self-review** — AGENTS.md 규약대로 분리 컨텍스트 서브에이전트 독립 리뷰(결함 캐기).
   범위: FR·AC 1:1 추적, 엣지(부분 손상·reader 경합·다중 프로세스·마이그레이션), 경계/
   에러처리 버그, 불필요한 복잡도·보안.

의존: 1 → 2 (원자성은 포맷 위에), 1 → 3 (마이그레이션은 v5 저장 경로 필요), 1~3 → 4.

## 테스트 전략

- **하니스**: 기존 관례 100% 재사용 — 자식 프로세스 격리(`~/.localmind` 미오염),
  `withEmbedStub`(HTTP 임베딩 스텁 `[1,0,0,0]`, `calls()` 계측), `BRAIN_INDEX`/`NOTES_DIR`
  주입, `runReindexCli`/`runSaveProbe`, `makePruneFixture`/`makeBatchFixture`, `indexKeys`,
  `_saveRunCountForTest`/`_indexRunCountForTest`.
- **신규 유틸**: `readSidecarHeader`(매직·dims·count·바이트 길이 검증), `seedV4Index`
  (`version:4` + 인라인 벡터 JSON 작성 → 마이그레이션 입력), `vecFileCount`(디렉토리의
  `*.vec-*` 개수 → GC 검증).
- **결정성**: dims=4 스텁으로 사이드카 바이트가 결정적. 마이그레이션·자가치유는
  `calls()` 증감으로 "재임베딩 유무"를 결정적으로 판정(020 AC-2·021 AC-3 패턴).
- **원자성**: 크래시 주입은 불가 → **불변식으로 근사**: (a) `vectorFile`이 가리키는 파일이
  항상 존재, (b) 저장 2회 이상 후 `*.vec-*` **2개 이하**(keep=2 — 현재+직전 세대만, AC-3와
  동일 기준), (c) 별도 프로세스 로드가 디스크만으로 전 벡터 복원(AC-4). 이 세 불변식으로
  커밋점 단일성을 간접 검증.
- **AC-3b의 결정적 재현 seam**: "JSON 파싱 후 ↔ 사이드카 읽기 전" 사이에 옛 gen 삭제 +
  새 gen/새 JSON 배치를 끼워 넣으려면 loadIndex의 그 경계에 테스트 훅이 필요하다 —
  신규 유틸에 `_afterJsonParseHookForTest`(테스트 전용, 프로덕션 no-op) 추가. 훅 없이
  fixture만으로는 "JSON이 옛 gen을 가리킨 채 파일만 소실" 상태밖에 못 만들어 AC-5(손상)
  경로와 구분되지 않는다. 대안: 재시도 판별 함수(부재+JSON 전진 → 새 gen 채택 /
  부재+JSON 불변 → 자가치유)를 단위로 직접 검증.
- **다중 프로세스**(AC-7): 013 AC-11 스타일 — 두 자식 프로세스가 같은 `BRAIN_INDEX`를
  로드 후 각자 다른 파일 저장 → 최종 색인+사이드카에 양쪽 벡터 복원 가능.
- **성능(크기·시간)**: 스텁으론 방향성만(벡터 배열 부재 = AC-1). 배수는 도그푸드 실측 —
  Success metrics의 측정법(동일 코퍼스, 콜드 `loadIndex`/`saveIndex` wall-clock, `wc -c`)을
  스펙에 고정하고 구현 시점 실측은 자연스러운 전체 재색인 기회로 미룬다(021 선례).
- **회귀**: `npm test`(단위·격리) + `LOCALMIND_INTEGRATION=1 npm test`(임베딩 서버 필요)
  전체 green. 특히 020(프루닝 가드)·021(저장 스로틀)·013(다중 프로세스·모델 교체) 스위트가
  사이드카 도입 후에도 유지되는지.

## 가정

- 대상 플랫폼은 모두 little-endian(Float32 LE) — 헤더 표식으로 방어, 불일치 시 자가치유.
- 업그레이드 시 사용자가 MCP 클라이언트를 재시작한다(다중 버전 혼재 스래싱 완화는 문서
  안내 기본 — goal Risks / spec Open Q6).

## 모델 역할 배치

- 스펙·플랜 정의, 최종 적대적 리뷰: 최상위 티어(🔖) — 포맷·원자성은 파장이 크다.
- 구현: 사이드카 왕복·원자성은 판단이 필요한 신규 로직 — 상위 티어. 마이그레이션·배선·
  문서는 촘촘한 스펙 하에 루틴 구현 티어 가능.
- 배선·문서: 저위험 기계 작업.
