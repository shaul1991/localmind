# 024 — 라벨↔경로 바인딩 (how)

goal: [goal.md](goal.md) · spec: [spec.md](spec.md)

## 도메인 경계

- **색인 도메인(src/brain.ts)** — `bindings` 필드(additive), 기록·재바인딩 판정·수락은
  `doEnsureIndexed`의 기존 스캔·프루닝 루프에 분기로 얹는다. `loadIndex`/`saveIndex`의
  포맷은 불변(선택 필드 통과), reload-merge에 `bindings` 병합 규칙 한 줄.
- **진입점(scripts/reindex.sh · Makefile)** — `REINDEX_ADOPT_REBIND` 명시 전달만
  (020 `REINDEX_PRUNE_LABELS` 배선과 동일 패턴).
- **불변(경계 밖)**: 검색·capture·watch·removeFromIndex, 020 프루닝 가드·후퇴 보류,
  021 저장 스로틀, 색인 버전.

## 영향 모듈

| 모듈 | 변경 |
|---|---|
| `src/brain.ts` | `BrainIndex.bindings?: Record<string,string>` 추가(버전 불변). `doEnsureIndexed`: 대상 라벨 바인딩 기록(FR-1 — **후퇴 시 기록 금지**), 재바인딩 판정(FR-2 — 기록 경로 vs 현재 realpath), 프루닝 루프에 재바인딩 보존 분기 + `REINDEX_ADOPT_REBIND` 수락 분기(FR-3 — 제거 판정은 **seen 여부**, **수락은 scanned 성공 라벨에서만**). `mergeIndexFromDisk`에 `ours.bindings[l] ??= disk` 병합(FR-4). `ReindexSummary`에 `rebinds: {label, recordedPath, currentPath, preserved}[]`·`rebindAdopted: {label, removed}[]`·수락 보류 사유 추가 |
| `scripts/reindex.ts` | 요약 출력에 재바인딩 보존·수락·보류 안내(평이한 한국어, 수락 명령 제시) |
| `scripts/reindex.sh` | `REINDEX_ADOPT_REBIND` 명시 전달(AC-9) |
| `Makefile` | reindex 타깃 변수 전달 |
| `src/brain.test.ts` | AC-1~8(기존 makePruneFixture·withEmbedStub·runReindexCli 재사용 — 재바인딩은 NOTES_DIR의 경로만 바꿔 2차 프로세스 실행) |
| `scripts/notes-dir.test.sh` | AC-9 배선 어서션(020 PRUNE 케이스 옆에 동일 패턴) |
| `docs/faq.md` | "노트 폴더를 옮기면 어떻게 되나요" Q 1건 |

## 구현 스케치

```
// doEnsureIndexed — 스캔 루프에서 scanned 라벨 확정 후
if (!REINDEX_FALLBACK) {
  adopt = REINDEX_ADOPT_REBIND 파싱(쉼표·트림·빈 항목 제거)
  for f of FOLDERS where scanned.has(f.label):
    current = canonPath(f.dir)                    // realpathSync || lexical
    recorded = idx.bindings?.[f.label]
    if (recorded && recorded !== current) {
      if (adopt.has(f.label)) rebindAdopt.add(f.label)   // 수락 — scanned 안이므로 안전(FR-3)
      else rebindPreserve.add(f.label)                    // 보존 + 요약 안내(FR-2)
    }
    if (!rebindPreserve.has(f.label)) (idx.bindings ??= {})[f.label] = current  // FR-1
    // 보존 라벨은 기록도 미갱신 — 수락 전까지 recorded 유지(반복 안내 근거)
  // adopt 중 scanned 밖(미마운트)·비재바인딩·미지 라벨 → 보류/무시 사유 수집(AC-5·6)
}

// 프루닝 루프(020 블록) — 분기 추가
if (label ∈ scanned && !seen.has(key)) {
  if (rebindPreserve.has(label)) preservedCount[label]++   // FR-2 보존(삭제 안 함)
  else delete idx.files[key]                                // 기존 020 FR-1 (수락 라벨 포함)
}
```

주의점:

- **후퇴 가드 위치**: 바인딩 기록·판정·수락 전부 `if (!REINDEX_FALLBACK)` 안(020 프루닝
  블록과 동일 게이트) — AC-7의 "bindings 불변"이 이 배치로 보장된다.
- **보존 라벨의 바인딩 미갱신**: 보존 중에는 recorded를 유지해야 다음 재색인에서도
  재바인딩 안내가 반복된다(수락 전까지). 갱신하면 1회 안내 후 스테일 항목이 침묵 속에
  남는다.
- **canonPath 정합**: TS 내부 비교에만 쓰이므로 셸 canon_path와의 정합은 정확성 전제가
  아니라 향후 doctor 연동 대비 정렬(023 초안 가정 계승).
- **라벨 유니크화**: parseFolders가 충돌 라벨에 `-2` 접미를 붙이므로 bindings 키는 항상
  유니크 라벨 — 충돌 없음.

## 단계 (TDD)

1. **실패 테스트** — brain.test.ts AC-1~8, notes-dir.test.sh AC-9.
2. **구현** — bindings 필드·기록·판정·보존/수락 분기·병합·요약. green.
3. **배선·문서** — reindex.sh·Makefile·faq. green.
4. **회귀** — 전체 스위트(특히 020 프루닝·021 스로틀·013 다중 프로세스) + typecheck.
5. **self-review** — 독립 크리틱 적대 리뷰(결함 0까지). 검증 분리: "보존 분기가 020
   프루닝을 잘못 넓히는 경로, 수락의 scanned 게이트 우회, 병합에서 bindings 유실"을
   찾으러 간다.

## 테스트 전략

- 재바인딩 재현: makePruneFixture로 색인 구성 → 폴더를 rename → NOTES_DIR만 새 경로로
  바꿔 2차 자식 프로세스 실행(기존 관례 그대로 — 신규 하니스 불필요).
- 수락·경계·미마운트: env 조합(REINDEX_ADOPT_REBIND 변형)과 디렉토리 제거로 결정적 구성.
- 병합(AC-8): 013 AC-11 패턴 — 두 자식 프로세스가 같은 BRAIN_INDEX에 서로 다른 라벨 저장.
- 요약 안내는 reindex CLI stdout 문자열 매칭(020·021 패턴).

## 모델 역할 배치

- 스펙·플랜 정의, 최종 적대적 리뷰: 최상위 티어(🔖).
- 구현: 프루닝 루프 분기·병합은 촘촘한 스펙 하에 루틴 구현 티어 가능(파장은 020 가드가
  이미 흡수) — 리뷰로 상쇄.
- 배선·문서: 저위험 기계 작업.
