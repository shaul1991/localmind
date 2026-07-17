# Tasks: 페르소나/모델 바인딩 온보딩

> 모델 이력 — 작성: Fable 5 · 구현: 미정
> 상위: [goal](goal.md) · [spec](spec.md) · [plan](plan.md)

이 문서는 **지시서**다 — 설명·근거·기각 대안은 [plan](plan.md)이 정본이며 여기서는 백포인터로만
가리킨다. 구현자는 각 task 착수 전에 백포인터 대상 절을 읽는다.

## 확정 사실 — 재조사·복붙 금지

plan **"확정 사실 표" F-1~F-14**(근거 파일:라인 포함)를 그대로 쓴다. 구현 중 같은 사실을
다시 조사하거나 이 문서에 복제하지 않는다. 특히 자주 쓰는 것:

- 저장·격리: F-1(데이터 폴더) · F-8(백업 gitignore 시드) · F-9(JSON은 색인 제외)
- 스킬 파이프라인: F-3(3타깃) · F-4(catalog `workflows`) · F-5(중립성 스캔) · F-6(activation 렌더)
- 검증 재료: F-2(빈 레지스트리 = 정상) · F-10(페르소나 정의 `targets.*.model`) · F-12(모델 형식 규칙)
- 회귀 지점: F-13(워크플로 이름 하드코딩 테스트 2곳)

## 불변식 (구현 전 숙지 — 위반 = 결함)

- **I-1** 바인딩(`_bindings/`)은 **어떤 경우에도 백업 커밋에 들어가면 안 된다.** gitignore 시드가
  유일한 격리 장치다 — `scripts/backup.sh:33`·`scripts/backup-init.sh:98` **양쪽** 갱신. → plan F-8·D-1
- **I-2** packaged 스킬 본문·description·텍스트 자원에 provider명·구체 모델 토큰·런타임 전용
  도구명 **0건** — F-5 스캔이 배포를 기계적으로 실패시킨다. 구체 예시는 `docs/`(스캔 밖)에만. → plan D-2·F-5
- **I-3** 부분 설정은 유효하다 — 일부 tiers/roles만 있어도 **전체 무효화 금지**, 미설정 항목에만
  부재 규칙 적용. → spec FR-7③ · AC-6
- **I-4** 레지스트리에 없는 페르소나명은 **저장 금지**(저장 전 검증·재선택 유도). → spec FR-7① · AC-7
- **I-5** 소비 시 자기 runtime-id와 **정확 일치하는 파일만** 읽는다 — 다른 런타임 파일 대독 금지,
  불일치 시 기존 파일 목록 표면화 + 부재 규칙. → spec FR-6 · AC-5 · plan D-5
- **I-6** 바인딩 부재 시 **side-effect 발생 전 안내 후 미진행이 기본** — 진행은 사용자의 명시적
  "이번만" 선택일 때만(저장 없음·임시 진행 명시). → plan D-4 · AC-3
- **I-7** 격리 위임이 실제로 일어나는 런타임에서 실행 모델 정본은 **페르소나 정의
  `targets.*.model`**이다 — 바인딩 `tiers`는 fallback 대행·직접 선택 지점용. 이 우선순위를
  계약 문서에 명문화한다(이중 정본 금지). → plan D-3 · F-10
- **I-8** `tiers`의 미지 등급 키는 오류, `roles` 키는 자유(스키마가 역할 집합을 고정하지 않음 —
  051 몫). → plan D-1 스키마

## DoD (전체 완료 정의)

- [ ] spec AC-1~9 전부 green — 단위(`binding.test.ts`) + 스킬 계약 정적 + 셸 + 도그푸드(Phase 5)
- [ ] 회귀 green: `npm test` 전체 + `bash scripts/backup.test.sh` + F-13 목록 갱신 반영
- [ ] `npm run build`(tsc) clean
- [ ] 도그푸드 완료(Phase 5) + self-review clean + 세 문서 검증 표기(AGENTS.md 규약 5)

---

## Phase 0 — Live-Verify 게이트 확인 (worker, 착수 시 1회)

- [x] **T0.1** 확인만(코드 없음): 이 slice의 "낡을 수 있는 사실" = 구체 모델명인데, 산출물에는
      모델명이 0건이어야 하며 F-5 스캔이 이를 기계 강제함을 확인한다. 런타임별 위임 능력은
      단정하지 않고 세션 capability 판정에 위임. → plan Phase 0 · D-2
      외부 라이브 검증 태스크 없음 — 이 확인을 self-review 보고에 1줄 명시.

## Phase 1 — 바인딩 계약 모듈 (worker) — TDD

- [x] **T1.1 (RED)** `src/agents/binding.test.ts` 신규 — 아래 케이스를 먼저 작성.
      **RED 기대**: `binding.ts` 부재로 import 단계에서 전 케이스 실패(`ERR_MODULE_NOT_FOUND` 류).
      검증: `node --import tsx/esm --test src/agents/binding.test.ts` → 전부 fail 확인.
      케이스(AC 1:1 — plan "테스트 전략" 표):
      - AC-2: `mergeBinding` — 일부 항목만 수정한 patch 적용 시 나머지 항목 보존
      - AC-3: `resolveTier`/`resolveRole` — 미설정 항목에 대해 **부재 사유 포함 결과** 반환
        (throw로 워크플로를 죽이지 않음 — I-6의 단위 특성화)
      - AC-5: `loadBinding("runtime-a")` — `_bindings/`에 `runtime-b.json`만 있을 때 b를 읽지
        않고 부재 결과 + 기존 파일 목록 반환 (I-5)
      - AC-6: tiers 1개·roles 1개만 있는 부분 바인딩 — `validateBinding` 유효 판정, 설정 항목
        resolve 성공 + 미설정 항목만 부재 사유 (I-3. **핀 유효성**: 부분 설정을 전체 무효로
        구현하면 이 테스트가 실패해야 한다)
      - AC-7: `validateBinding(raw, personaNames)` — 레지스트리 밖 persona명 → **저장 불가 오류**
        반환(무효 바인딩이 유효 판정되면 실패하는 핀 — I-4)
      - AC-8: 빈 `personaNames`([]) — tiers 검증 정상, roles 단계 건너뜀 판정(F-2 규약 재사용)
      - AC-9: 추천 밖 자유 모델 식별자(F-12 형식 내) 저장 허용 + F-12 형식 위반 문자는 거부
      - I-8: 미지 tier 키(`"ultra"` 등) → 오류 / 임의 role 키는 허용
      - D-3: `resolveRole` 결과가 `{persona, tier}` 경유로 `tiers[tier].model`을 해석
- [x] **T1.2 (GREEN)** `src/agents/binding.ts` 신규 — plan "영향 모듈" 표의 심볼 그대로:
      zod 스키마(plan D-1 스키마 블록: `schemaVersion`·`runtime`·`updatedAt`·`tiers`·`roles`) ·
      `bindingsDir()`(F-1 데이터 폴더 아래 `_bindings/`) · `loadBinding(runtimeId)` ·
      `validateBinding(raw, personaNames)` · `resolveTier`/`resolveRole` · `mergeBinding`.
      모델 형식은 F-12 규칙 **재사용**(`registry.ts:72-74` — export 필요 시 registry에서 export,
      정규식 복제 금지). 의존은 `registry.ts`만(plan DDD 경계 — `skills.ts`/`config.ts` 참조 금지).
      검증: `node --import tsx/esm --test src/agents/binding.test.ts` 전부 green →
      `npm run build` clean. (신규 테스트는 `npm test` 글롭 `src/agents/*.test.ts`에 자동 포함)

## Phase 2 — 온보딩 스킬 패키지 (worker, T1.2의 계약 확정에 의존)

- [x] **T2.1 (RED — F-13 회귀 핀)** `templates/skills/catalog.json`의 `workflows`에
      `"localmind-binding": { "activation": "explicit", "sideEffects": "mutating" }` 추가만 먼저.
      **RED 기대**: `npm test`에서 기존 두 하드코딩 목록 테스트가 배열 불일치로 실패해야 한다 —
      `src/agents/skills.test.ts:80`(seed 결과 4개 이름 deepEqual)·
      `src/agents/commands.test.ts:478`(invocationReport logicalId 목록 deepEqual).
      실패하지 않으면 핀이 죽은 것 — 원인 조사가 우선(진행 금지).
- [x] **T2.2 (GREEN)** 두 테스트의 기대 목록에 `localmind-binding` 추가(정렬 위치:
      `["goal-ready", "localmind-binding", "localmind-rules", "sdd-implement", "sdd-self-review"]`).
      explicit 렌더(deny-implicit metadata) 검증은 기존 explicit 스킬(`sdd-implement`) 테스트
      패턴 재사용 — `localmind-binding`에 대해 3타깃 enforcement(F-6: Claude/공용
      runtime-enforced · Gemini instruction-level) 케이스 1개 추가.
      검증: `npm test` green.
- [x] **T2.3** `templates/skills/localmind-binding/SKILL.md` 신규 — 온보딩·재설정 워크플로 지침
      (plan "영향 모듈" 표 그대로): 활성화 확인(explicit) → runtime-id 도출·**사용자 확정**(D-5)
      → 등급별 추천 초안 제시(**세션의 최신 지식으로 제안 + "추천은 낡을 수 있고 정본은 사용자
      확정 값" 고지** — FR-2①) → 레지스트리 나열·역할별 후보 추천·확정(FR-2③) → 검증(I-4:
      무효 페르소나 재선택 유도 / FR-7②: 모델 가용성 미검증 고지 / AC-8: 빈 레지스트리 건너뜀
      안내 / I-3: 부분 설정 허용) → 저장(`_bindings/<runtime-id>.json`, D-1 스키마) → 저장 요약을
      평이한 한국어로 표시(AC-1). 재설정(AC-2)은 같은 스킬 재실행: 기존 값 표시 → 항목 선택
      수정 기본(D-6) → `mergeBinding` 의미와 동일하게 나머지 보존.
      **I-2 준수**: 본문에 provider명·모델명·런타임 도구명 금지(F-5). frontmatter는 기존
      packaged 스킬 관례(managed-by marker 등)를 따른다.
- [x] **T2.4** `templates/skills/localmind-binding/references/binding-contract.md` 신규 —
      **소비 규약 정본**(051이 스킬 본문에 반영할 계약, 중립 서술 — I-2 적용): 파일 위치
      (`<데이터 폴더>/_bindings/<runtime-id>.json`) · D-1 스키마 · runtime-id 도출·정확 일치
      규칙(D-5, I-5) · 부재 시 정책(D-4, I-6 — "이번만" 예외 포함) · 페르소나 fallback(FR-5:
      비독립 명시·중단 금지) · **모델 우선순위 명문화**(I-7: 페르소나 정의 `targets.*.model` >
      바인딩 tiers). **T1.2 함수 의미와 1:1** — 드리프트 = 결함(plan Phase 2).
- [x] **T2.5** `templates/skills/localmind-binding/references/binding.example.json` 신규 —
      D-1 스키마 형태의 플레이스홀더 예시(`"<모델 식별자>"` — 구체 모델명 0건, I-2).
- [x] **T2.6 (정적 AC 검증 + 스캔 핀 확인)** 스킬 계약 정적 테스트에 `localmind-binding` 케이스
      추가: AC-1(추천 낡음 고지·확정·요약 지시 존재) · AC-3/AC-4(계약 문서에 D-4 부재 문구·
      FR-5 비독립 문구 존재) · AC-7/AC-8(재선택 유도·건너뜀 안내 지시 존재) ·
      **AC-9(모델 가용성 미검증 고지 지시 존재)** · **I-7(계약 문서에 "페르소나 정의 model >
      바인딩 tiers" 우선순위 명문 존재)** — 기존
      `skill-contract.test.ts`/`skills.test.ts` 정적 검증 패턴 재사용(plan 테스트 전략 ②).
      **중립성 스캔 핀 유효성 확인**: packaged 전수 스캔(F-5)에 `localmind-binding`이 포함되는지
      확인하고, 로컬에서 본문에 모델 토큰을 임시로 심어 배포/계약 테스트가 **실패하는 것**을
      1회 관찰 후 되돌린다(관찰 결과를 self-review에 기록 — 커밋 금지).
      검증: `npm test` green + `npm run build` clean.

## Phase 3 — 백업 격리 배선 (worker) `[P]` — Phase 1·2와 독립, 병렬 가능

- [x] **T3.1 (RED — 회귀 핀)** `scripts/backup.test.sh`에 케이스 추가: 백업 대상 폴더에
      `_bindings/test.json`을 만들어 backup 실행 → 커밋에 `_bindings/`가 포함되지 않아야 성공.
      **RED 기대**: 시드 추가 전에는 `_bindings/test.json`이 커밋에 들어가 이 케이스가 실패해야
      한다(실패하지 않으면 핀이 아무것도 안 잡는 것 — 진행 금지).
      검증: `bash scripts/backup.test.sh` → 신규 케이스 fail 확인.
- [x] **T3.2 (GREEN)** gitignore 시드 목록에 `'_bindings/'` 추가 — **두 곳 모두**(I-1):
      `scripts/backup.sh:33`의 for 목록 + `scripts/backup-init.sh:98`의 for 목록. → plan F-8 · D-1
      ⚠️ 주의: 두 목록은 "동일 유지가 규약"이나 **현재 이미 다르다**(backup.sh에만
      `.brain-index.json.vec-*`·`query-log.jsonl`, backup-init.sh에만 `.DS_Store`) — 기존 차이를
      건드리지 말고(외과적) `_bindings/`만 양쪽에 추가한다.
      검증: `bash scripts/backup.test.sh` 전부 green.

## Phase 4 — 문서 (worker, Phase 1~3 확정에 의존)

- [x] **T4.1** `docs/workflows.md` 수정 — 온보딩 사용법·바인딩 개념·재설정(사람용 문서 —
      **여기서만** 구체 런타임 이름·모델명 예시 허용, F-5 스캔 밖). 런타임마다 따로 설정하는
      이유(가용 모델 상이 — goal Risks "격리 개념의 오해") 1문단 포함.
      **runtime-id 정규 표 포함**(예: 각 런타임 제품 → 권장 kebab-case id) — D-5 자기도출이
      완전 결정적이지 않은 것을 보완해 표기 드리프트를 줄인다(critic 경미 (c)). 스킬 계약 문서
      (스캔 대상)엔 못 넣으므로 사람용 docs가 이 표의 집이다.
- [x] **T4.2** `AGENTS.md` "실행 등급 배치" 절에 1~2줄 추가 — 예고했던 optional adapter가
      `localmind-binding`(온보딩 스킬 + `_bindings/` 바인딩)으로 구체화됐다는 포인터.
      → plan 영향 모듈. (외과적 변경 — 절의 다른 문장 수정 금지)

## Phase 5 — 도그푸드 + self-review (worker 실행 · 최종 판정 격리 리뷰어)

- [ ] **T5.1 (도그푸드 — AC-1·2)** `make skills-deploy`(= `npm run skills:deploy`)로 배포 →
      실제 온보딩 1회 실행: runtime-id 확정·추천 고지·요약 표시 관찰, `_bindings/<runtime-id>.json`
      생성 확인(AC-1) → 재실행해 항목 선택 수정·나머지 보존 관찰(AC-2) → 추천 밖 모델 식별자
      입력 시 미검증 고지 관찰(AC-9).
- [ ] **T5.2 (도그푸드 — AC-3·5·4)** 바인딩 파일을 옮긴 뒤 소비 규약 시나리오: side-effect 전
      안내·미진행 관찰(AC-3, I-6) → 가능한 런타임에서 격리 관찰(AC-5: 타 런타임 파일 대독 없음)
      → 위임 능력 없는 런타임에서 fallback·"비독립" 명시 관찰(AC-4 — **불가 환경이면 보고에
      명시**, plan Phase 5). 지침 수준(instruction-level) 행동은 여기서만 실증됨을 보고에 명시.
- [ ] **T5.3 (백업 격리 도그푸드 — AC-5 후반)** 실제 `make backup`(또는 backup.sh) 1회 실행 후
      백업 repo 커밋에 `_bindings/` 부재 확인(I-1의 실환경 실증 — T3.1 셸 테스트의 라이브 짝).
- [ ] **T5.4 (self-review)** sdd-implement 규약 5 — 격리 리뷰어(불가 시 비독립 명시)로 점검 5범위
      수행 → clean 후 spec FR/AC·plan 단계·goal Success metrics 검증 표기(`[x]` + 근거, 미충족은
      사유 부기) → 커밋·push·CI 감시(`gh run watch <run-id> --exit-status`, 전체 sha).

---

## AC 커버리지 (요약 — 정본은 plan "테스트 전략" 표)

| AC | 커버 task |
|---|---|
| AC-1 최초 설정 | T2.3(지시) · T2.6(정적) · T5.1(도그푸드) |
| AC-2 재설정 | T1.1/T1.2(mergeBinding) · T2.3 · T5.1 |
| AC-3 미설정 실행 | T1.1/T1.2(resolve 부재 사유) · T2.4·T2.6(정적) · T5.2 |
| AC-4 페르소나 fallback | T2.4·T2.6(정적) · T5.2(가능 환경 한정) |
| AC-5 런타임 격리 | T1.1/T1.2(loadBinding) · T3.1/T3.2(셸) · T5.2·T5.3 |
| AC-6 부분 설정 | T1.1/T1.2 |
| AC-7 무효 페르소나 | T1.1/T1.2 · T2.3·T2.6(정적) |
| AC-8 빈 레지스트리 | T1.1/T1.2 · T2.3·T2.6(정적) |
| AC-9 추천 밖 모델 | T1.1/T1.2 · T5.1 |
