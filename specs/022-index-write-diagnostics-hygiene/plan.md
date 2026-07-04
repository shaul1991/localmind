# 022 — 색인 쓰기·진단 위생 (how)

goal: [goal.md](goal.md) · spec: [spec.md](spec.md)

## 도메인 경계

- **색인 도메인(src/brain.ts)** — dirty 판정·말미 저장 게이트는 `doEnsureIndexed` 한 곳에만.
  `saveIndex`/`loadIndex`/`removeFromIndex`/021 워커 루프·finally/020 프루닝 블록은 불변.
  고아·부재 라벨 분류는 읽기 전용 export로 추가(단일 소스) — 재색인을 유발하지 않는다.
- **진단 진입점(scripts/doctor.sh)** — 라우팅 판정을 유효값 판정으로 교체(021 reindex.sh와
  동일 소스), 라벨 요약은 TS 리더 호출 + 렌더만. 분류 로직을 셸에서 재구현하지 않는다
  (019 "판정 단일 소스 = TS").

## 영향 모듈

| 모듈 | 변경 |
|---|---|
| `src/brain.ts` | `doEnsureIndexed`: pending 커밋 수·프루닝 삭제 수로 `dirty` 산출 → 말미 `saveIndex`를 `if (dirty)`로 게이트(FR-1·2). 021 진행 저장·finally, 020 프루닝 블록은 그대로. 읽기 전용 `indexLabelReport()` export 추가(FR-4 — FOLDERS + 색인 라벨 집계 + readdir 부재 판정, 임베딩 무유발) |
| `scripts/index-labels.ts` (신규) | `indexLabelReport()`를 호출해 JSON 출력하는 얇은 래퍼(reindex.ts 패턴). doctor가 `node --import tsx/esm`로 실행 |
| `scripts/doctor.sh` | 라우팅 판정을 `read_env_val OLLAMA_API_BASE "${LOCALMIND_ENV_FILE:-$DIR/.env}"` 유효값 검사로 교체 + `litellm.config.yaml` grep 가지 제거(FR-3) + 라벨 요약 렌더(FR-4, 실패 시 조용한 생략·exit 0) |
| `src/brain.test.ts` | AC-1~5 + AC-1b(saveProbe 확장: 무변경/스탬프-only/변경/삭제/후퇴 각 케이스의 저장 카운터, 021 회귀 재확인) |
| `scripts/notes-dir.test.sh` | AC-6~9 + AC-8b(`run_doctor` 하니스 재사용: 라우팅 오탐·죽은 가지 배선·라벨 안내(MCP 유/무 양쪽)·부재 폴더 미생성·조용한 생략) |
| `docs/faq.md` · `docs/usage.md` | "무변경 검색은 색인을 다시 쓰지 않아요"·"doctor가 정리 대상 라벨을 보여줘요" 한 줄씩 |

## 구현 스케치

```
// brain.ts — doEnsureIndexed
// (1) 삭제 카운트: 020 프루닝 블록에서 delete할 때마다 세거나, 블록 후 크기 차이로.
//     명료성 위해 삭제 시 deletedCount++ (folder-없는 자가치유 삭제 포함).
// (2) 커밋 판정: pending.length > 0 이면 성공 경로에서 전량 커밋되므로 committed = pending.length>0.
const dirty = pending.length > 0 || deletedCount > 0;
lastReindexSummary = summary;      // 요약은 dirty와 무관하게 항상 최신(020 반환 계약 유지)
if (dirty) saveIndex(idx);         // FR-1 — clean이면 생략(무변경 검색이 113MB를 다시 안 씀)
return idx;
```

주의점:

- **pending>0이면 반드시 저장**: 021 진행 저장이 스로틀돼 마지막 배치 커밋이 디스크에 없을
  수 있다 — pending>0을 dirty에 포함해 말미 저장이 최종 커밋을 마저 기록한다. 진행 저장이
  0회였든 N회였든 무관하게 성립(FR-2).
- **삭제 카운트 위치**: 020 프루닝 블록(대상 라벨 내 삭제·`pruneSet` 삭제·folder-없는
  자가치유 삭제)의 각 `delete idx.files[key]`에서 카운트. 후퇴(`REINDEX_FALLBACK`) 경로는
  프루닝 블록에 진입하지 않으므로 삭제 0 — 신규 커밋 없으면 clean(AC-4).
- **스탬프-only는 dirty 아님**: `idx.embeddingModel = EMB_MODEL`(무-op 재세팅)과 `idx.dims`
  (임베딩 구간에서만 세팅 → pending>0에 종속)는 dirty 산출에 넣지 않는다. `dims`는 이미
  pending으로 커버되고, `embeddingModel` 무-op은 저장 트리거가 아니다(spec Open q1).
- **요약은 항상 갱신**: `lastReindexSummary`는 저장 생략과 무관하게 항상 최신으로 둔다 —
  reindex()가 clean이어도 고아·부재 요약을 정상 반환해야 한다(020 계약 불변).
- **indexLabelReport() 무유발**: `ensureIndexed`/`doEnsureIndexed`를 부르지 않는다(재색인·
  임베딩 유발 금지). `loadIndex()`(읽기·캐시) + FOLDERS + `readdirSync` 부재 판정만으로
  분류 — **mkdir 금지**: doEnsureIndexed의 첫 실행 부트스트랩(`mkdirSync`)을 상속하면
  부재 라벨을 진단하다 폴더를 만들어 읽기 전용 계약이 깨진다(AC-8이 폴더 미생성을
  어서션). 손상·구형 포맷이면 `loadIndex`가 빈 색인을 돌려 라벨 0 → doctor는 조용히 생략.
  이 read-only 분류는 020 doEnsureIndexed의 요약 로직과 정의를 공유하되 스캔과 분리된
  독립 함수다(둘 다 최소로 유지해 드리프트 억제 — spec 알려진 한계 3).

- **doctor 라우팅 교체**:
```
# 기존(68~71): litellm.config.yaml·.env raw grep — 주석 오탐 + 죽은 가지
# 교체:
env_file="${LOCALMIND_ENV_FILE:-$DIR/.env}"
ollama_base="$(read_env_val OLLAMA_API_BASE "$env_file")"
route="docker"; route_label="Docker Ollama (litellm:4000 → ollama:11434)"
case "$ollama_base" in *host.docker.internal*)
  route="host"; route_label="호스트 Ollama (...)";;
esac
```
  read-env.sh는 이미 source됨(doctor.sh 9행). `LOCALMIND_ENV_FILE` 격리가 정합 섹션(132행)과
  통일돼 `run_doctor` 하니스로 격리 테스트 가능.

- **doctor 라벨 렌더 — NOTES_DIR 해석을 정합 섹션 밖으로 hoist(리뷰 중대 1)**:
```
# 주의: 기존 eff_nd는 [노트 폴더 정합] 섹션(if [ -n "$mcp_nd" ] 블록) 안에서만 정의된다.
# 그대로 쓰면 MCP 미등록 사용자에게 set -u unbound → 2>/dev/null이 삼켜 영구 침묵(FR-4
# 무효화)이거나, 빈 NOTES_DIR가 리더의 brain 자체 폴백을 켜 전 라벨이 고아로 오분류된다.
# 해석을 블록 밖으로 올려 MCP 유무와 무관하게 유효값을 얻는다:
eff_nd="$(resolve_notes_dir "${LOCALMIND_ENV_FILE:-$DIR/.env}")"
eff_nd="${eff_nd:-$HOME/.localmind}"
# (기존 정합 섹션도 이 값을 재사용 — 이중 해석 제거)
if have node; then
  labels_json="$(NOTES_DIR="$eff_nd" node --import tsx/esm "$DIR/scripts/index-labels.ts" 2>/dev/null || true)"
  # labels_json 파싱: 고아 → 라벨·수·정리 명령 / 부재 → "폴더 없음"만.
  # 리더 실패(빈 문자열)뿐 아니라 고아·부재 0건({orphans:[],missing:[]})도 침묵 —
  # 섹션 자체를 출력하지 않는다(FR-4 확정).
fi
```
  exit 0 유지(진단 성공 = 0, 프롬프트 ✗ 방지 — 기존 166행 계약). MCP 미등록 동작은
  AC-8b가 고정한다(LOCALMIND_MCP_CONFIG를 없는 경로로 주입).

- **구현 주의(리뷰 노트 — 비차단)**: (a) hoist된 `eff_nd` 대입은 반드시 [노트 폴더 정합]
  섹션 **앞**에 두고 섹션 내부의 중복 해석을 제거한다 — 순서가 뒤바뀌면 `set -u`에서
  unbound로 정합 섹션이 깨진다. 라벨 렌더가 정합 블록 밖에 있음을 grep 배선 어서션으로
  고정 권장. (b) `run_doctor` 하니스는 현재 BRAIN_INDEX를 넘기지 않는다 — AC-8/8b용으로
  하니스 시그니처를 확장해야 리더까지 환경 상속이 성립한다.

## 단계 (TDD)

1. **실패 테스트** — brain.test.ts에 AC-1~5(무변경 저장 0, 변경·삭제·후퇴 케이스, 021 회귀
   재확인). notes-dir.test.sh에 AC-6~9(라우팅 오탐·배선·라벨 안내·조용한 생략).
2. **구현 ①** — brain.ts dirty 게이트 + `indexLabelReport()` export + scripts/index-labels.ts.
   AC-1~5 green.
3. **구현 ②③** — doctor.sh 라우팅 유효값 판정 교체·죽은 가지 제거 + 라벨 렌더. AC-6~9 green.
4. **회귀** — 전체 스위트(특히 020·021 하니스) + typecheck. green.
5. **문서** — faq/usage 한 줄씩.
6. **self-review** — 독립 크리틱(적대적) 리뷰, 결함 0까지 반복(AGENTS.md 규약). 검증 분리:
   "dirty 판정이 실변경을 놓치는 경로(진행 저장 스로틀·후퇴·folder-없는 엔트리·single-flight
   합류), doctor 라벨 조회의 재색인 유발 여부·오탐"을 찾으러 간다.

## 테스트 전략

- **저장 카운터 검증(AC-1~5)**: 021의 `runSaveProbe`(자식 프로세스 + HTTP 임베딩 스텁 +
  `_saveRunCountForTest`) 하니스를 재사용·확장한다. AC-1은 **두 개의 자식 프로세스**로
  결정화: 첫 프로세스가 색인 파일을 만들고(저장 발생), 두 번째 프로세스(카운터 0에서 시작)가
  같은 색인 파일을 무변경 재색인 → `saves === 0`을 어서션(디스크 색인엔 이미 스탬프가 있어
  스탬프-only 전이도 없음 → 순수 clean). 벽시계 의존 없음.
- **변경/삭제/후퇴(AC-2·3·4)**: 두 번째 프로세스 전에 fixture 파일을 수정/삭제하거나
  `REINDEX_FALLBACK=1`로 실행. `makePruneFixture`(020)·`makeBatchFixture`(021) 재사용.
- **021 회귀(AC-5)**: 021 AC-1·2·4를 그대로 재실행(별도 추가 없이 기존 스위트 green으로 갈음
  하거나, dirty 게이트 삽입 후 021 describe 블록 재확인). dirty 게이트가 변경 있는 경로를
  건드리지 않음을 고정.
- **doctor(AC-6~9)**: `run_doctor` 하니스(`HOME`·`LOCALMIND_ENV_FILE`·`LOCALMIND_MCP_CONFIG`
  주입) 재사용. AC-6은 임시 `.env`에 주석 host URL + 유효값 docker/host 3케이스. AC-7은
  doctor.sh 소스 grep(배선). AC-8은 임시 색인 JSON fixture(고아 `old` + 부재 `gone`) +
  `BRAIN_INDEX` 주입 + NOTES_DIR 임시 폴더. AC-9는 색인 경로 부재·손상 JSON. 모두 문자열
  매칭·RC 검사로 결정적.
- 검증 분리(AGENTS.md): 기계적 실행(Sonnet)과 별개로, 적대적 리뷰(Opus)는 "clean 오판으로
  실변경 유실"과 "라벨 조회의 재색인 유발"을 찾으러 간다.

## 모델 역할 배치

- 스펙·플랜 정의, 최종 적대적 리뷰: 최상위 티어(🔖).
- 구현: dirty 게이트는 국소 변경이나 "실변경 유실" 파장이 있어 신중 — 촘촘한 스펙 하에
  루틴 구현 티어 가능하되 리뷰로 상쇄. doctor 배선·라벨 렌더는 저위험.
- 배선·문서: 저위험 기계 작업.
