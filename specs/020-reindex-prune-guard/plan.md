# 020 — 색인 프루닝 가드 (how)

goal: [goal.md](goal.md) · spec: [spec.md](spec.md)

## 도메인 경계

- **색인 도메인(src/brain.ts)** — 프루닝 판단은 여기 한 곳에만 둔다. 셸(reindex.sh)은
  환경변수를 전달만 하고 판단을 재구현하지 않는다(019 "판정 단일 소스 = TS" 원칙과 동일).
- **진입점(scripts/reindex.sh · Makefile)** — `REINDEX_PRUNE_LABELS`·`REINDEX_FALLBACK`
  전달 배선과 사용자 안내 문구만. 후퇴 여부는 셸이 이미 알고 있으므로(resolve 실패 →
  폴백 사용) 셸이 신호를 세팅한다 — brain이 셸의 해석을 재추론하지 않는다.

## 영향 모듈

| 모듈 | 변경 |
|---|---|
| `src/brain.ts` | `doEnsureIndexed`의 프루닝 블록 교체(FR-1·2·3·5) + 스캔 루프의 폴더 판정을 readdir 기반으로 통일(FR-2) + 재색인 API가 고아·부재 요약 정보를 반환(FR-4) |
| `scripts/reindex.ts` | 반환된 요약 정보 출력(FR-4·AC-6) — 고아 라벨 안내는 이 경로에만 |
| `scripts/reindex.sh` | `REINDEX_PRUNE_LABELS` 명시 전달 + 폴백 사용 시 `REINDEX_FALLBACK=1` 세팅(AC-11) |
| `Makefile` | `reindex` 타깃에 변수 전달(AC-11) |
| `src/brain.test.ts` | AC-1~9 테스트(자식 프로세스 격리 — 아래 테스트 전략) |
| `scripts/notes-dir.test.sh` | AC-11 배선 고정 — REINDEX_PRUNE_LABELS 명시 전달 + **restore 폴백 케이스(REINDEX_FALLBACK_DIR 재할당 경로)에서 REINDEX_FALLBACK=1 전달** 어서션(기존 npm 스텁 run_reindex 하니스 재사용) |
| `docs/usage.md` · `docs/faq.md` | 보존·정리(`REINDEX_PRUNE_LABELS`)·후퇴 보류 안내 1절 |

## 구현 스케치

```
// 스캔 전: 폴더 판정과 스캔이 같은 결과를 쓴다(FR-2 — 갈라지면 AC-3·5 모순)
for f of FOLDERS:
  entries = try readdir(f.dir) → 성공: scanned.add(f.label), entries로 스캔 진행
                               → 실패: missing.add(f.label) + 경로 포함 경고(수집)

// 프루닝(기존 "이번 스캔에서 안 보인 키 전부 삭제" 블록 교체)
fallback = (REINDEX_FALLBACK=1) or (NOTES_DIR 완전 부재로 폴백 FOLDERS 사용)
if fallback:
  // FR-3 — 프루닝·탈출구 보류 + 고아 계산도 하지 않는다(등록 집합 신뢰 불가 —
  // 여기서 고아를 산출하면 후퇴 요약이 전 코퍼스를 "정리하라"고 오인 안내한다).
  // 요약에는 "삭제 반영 보류" 사실만 담는다(AC-1).
else:
  registered = FOLDERS의 라벨 집합(= scanned ∪ missing)
  prune = REINDEX_PRUNE_LABELS 파싱(쉼표 분리·트림·빈 항목 제거)
  for key of idx.files:
    label = idx.files[key].folder            // 라벨 정본 — 키 문자열 파싱 금지
    if label ∈ scanned and !seen.has(key) → delete       // FR-1·AC-4·AC-5
    else if label ∈ prune and label ∉ registered → delete // FR-5·AC-7
  // AC-8·9의 안내는 이 루프가 아니라 별도 패스에서: prune 요청 라벨을
  // registered(→ 무시 사유 안내, AC-8)와 색인 라벨 집합(→ "없어요" 안내, AC-9)에
  // 대조해 요약 정보에 수집한다.
  // 고아 = 색인 라벨 \ registered — 이 분기(정상 구성)에서만 계산(FR-4)

// 요약 정보(고아·부재 = missing·보류·무시 사유)는 반환형 변경 없이 모듈 레벨
// lastReindexSummary에 기록하고(doEnsureIndexed가 설정), 명시적 재색인 API
// (reindex())가 await 후 판독해 돌려준다 — ensureIndexed의 기존 호출자(검색·
// 캡처·링크)로 파급 없음(외과적 변경). 여기서 stdout 출력 금지.
```

주의점:

- **요약 출력 위치**: `ensureIndexed`는 검색·캡처마다 도는 경로다 — 고아 안내를
  거기서 출력하면 매 검색 스팸이고, single-flight 합류 시 요약이 유실돼 AC-6이
  플레이키해진다. 요약 계산은 doEnsureIndexed 내부(프루닝과 같은 idx 스냅샷)에서
  하되 **모듈 레벨 `lastReindexSummary`로만** 올리고(반환형 불변 — ensureIndexed의
  기존 호출자인 검색·캡처·링크로 파급 없음), 출력은 scripts/reindex.ts(명시적
  재색인 경로)만 한다. single-flight 합류로 다른 실행의 요약을 받거나 유실되면
  요약 없이 성공으로 처리(안내 생략은 허용, 잘못된 안내·삭제는 불가).
- **후퇴 판정**: `REINDEX_FALLBACK=1`(셸 폴백)과 brain 자체 폴백(NOTES_DIR 완전
  부재, FOLDERS가 기본 1개로 재계산된 경우) 둘 다 무프루닝. 후자는 MCP 등록 없이
  단독 실행된 경우를 커버한다.
- **라벨 파싱 금지**: 라벨에 `/`가 허용되므로(파서에 문자 제약 없음) 키의 첫 `/`
  조각은 라벨이 아닐 수 있다 — `FileEntry.folder`만 쓴다.
- watcher 단일 파일 삭제(`removeFromIndex`)는 키 단위라 영향 없음 — 회귀 테스트만 유지.
- **구현 중 발견(TDD red로 실측)**: 기존 doEnsureIndexed 진입부의 `ensureDirs()`(전
  등록 폴더 `mkdir -p`)가 부재 폴더를 빈 폴더로 되살려 FR-2를 무력화한다 — 미마운트
  경로가 "존재하는 빈 폴더"로 오판돼 그 라벨이 전량 프루닝된다(마운트 지점에 빈
  디렉토리를 만드는 부작용 포함). 재색인 경로에서는 일괄 생성을 제거하고, **그 라벨의
  색인 키가 하나도 없는 첫 실행에만** 부트스트랩 생성한다(캡처 경로의 ensureDirs는
  유지, watchNotes는 원래 부재 폴더를 건너뜀).

## 단계 (TDD)

1. **실패 테스트** — `src/brain.test.ts`에 AC-1~9 추가. AC-10은 기존 테스트 green으로
   갈음.
2. **구현** — brain.ts 스캔·프루닝 블록 교체 + 재색인 API 요약 반환 + reindex.ts 출력.
   테스트 green.
3. **배선** — reindex.sh(명시 전달 + REINDEX_FALLBACK 세팅)·Makefile 전달 +
   notes-dir.test.sh 배선 어서션(AC-11). green.
4. **문서** — usage/faq에 보존·정리·후퇴 보류 안내.
5. **self-review** — 독립 크리틱(적대적) 리뷰, 결함 0까지 반복(AGENTS.md 규약).

## 테스트 전략

- brain.ts는 FOLDERS·인덱스 경로를 **모듈 로드 시 1회** 확정하므로, "색인 구성 후
  NOTES_DIR를 바꿔 재실행"하는 AC-1~3은 in-process로 불가능하다. 기존 관례(자식
  프로세스 격리 + HTTP 임베딩 스텁 서버)를 그대로 계승한다: 같은 `BRAIN_INDEX`
  파일을 공유하는 자식 프로세스를 NOTES_DIR·REINDEX_FALLBACK·REINDEX_PRUNE_LABELS
  조합만 바꿔 2회 이상 실행하고, 사이사이 색인 JSON을 직접 읽어 키 보존/제거를
  어서션한다. AC-1의 두 트리거는 각각 검증한다 — 자체 폴백(NOTES_DIR 완전 부재)
  브랜치는 폴백이 `$HOME/.localmind`를 스캔하므로 HOME을 임시 디렉토리로 격리해야
  실제 홈을 건드리지 않고 코드 경로가 검증된다.
- 재임베딩 0건(AC-2)은 임베딩 스텁 서버의 호출 횟수 계측으로 검증한다.
- 배선(AC-11)은 셸 어서션(grep 고정) — 판단 로직의 셸 재구현이 없음을 함께 보증.
  make 커맨드라인 변수의 암묵 export에 의존하지 않도록 reindex.sh가 명시적으로
  변수를 넘기는 형태를 고정한다.
- 검증 분리(AGENTS.md): 기계적 테스트 실행과 별개로, 적대적 리뷰는 "가드를 우회하는
  경로(스캔 실패 모드·라벨 경계·single-flight·동시 저장 merge)"를 찾으러 간다.

## 모델 역할 배치

- 스펙·플랜 정의, 최종 적대적 리뷰: 최상위 티어(🔖).
- 구현: 스펙이 촘촘하므로 프루닝 블록 교체는 루틴 구현 티어로 다운시프트 가능.
- 배선·문서: 저위험 기계 작업.
