# Tasks: /localmind-rules — 거버넌스 규칙 저작·관리 커맨드

> 모델 이력 — 작성: Opus 4.8 · 검토: Opus 4.8(critic) · 구현(예상): 미정(Sonnet/Opus — /goal 시 확정)

<!-- THIN (R2). 근거·서술은 → plan §… / → plan F-n 백포인터. 사실 재조사 금지 — F-1…F-7 인용만. -->

산출물 주축은 **순수 프롬프트 스킬** `templates/skills/localmind-rules/SKILL.md`(슬래시 커맨드 로직 = 프롬프트 본문). 도메인 로직 신설 없음 — `loadRules`(F-1)·`make rules-deploy`(F-4) 재사용. 검증은 **dogfood 시나리오**(Phase 6가 통합 실증). 헬퍼 CLI(`scripts/rules-check.ts`)는 **조건부**(OQ-6 — 인프롬프트 파싱 불안정 시에만).

---

## 불변식 (I-n) — 구현자가 틀리기 쉬운 정확성 지점

- **I-1 게이트는 쓰기·배포 *이전*에 발화한다.** 충돌/고아를 감지하고도 조용히 적용 금지 — 파일 write·deploy 는 게이트 통과(사용자 선택) 후에만. → AC-3·5, plan §Phase 1
- **I-2 충돌 자동 해소 금지.** LLM이 조정안을 *봉합*하지 않는다 — 게이트 필수, 조정 선택(예외 절·overlay·재서술·취소)을 사용자에게 올린다. → goal Non-goal, FR-3
- **I-3 링크 파싱은 위키 `[[name]]` *와* 마크다운 `](name.md)` 둘 다 커버.** 코퍼스 실측 마크다운 94 vs 위키 11 — 마크다운형 누락 시 대다수 고아를 놓친다. `## 관련` 항목 포함. → F-2, AC-5
- **I-4 base vs overlay 를 *매번* 묻는다.** 추측·기본값 금지(overlay 승 의미 보존). → FR-5, AC-6
- **I-5 배포는 managed 산출물만 건드린다.** rules-deploy 불변식 보존(관리 바이트만 교체·problems>0면 prune skip·폴더 없으면 생성 안 함·device 절대경로 금지). 사용자 파일 불가침. → F-4, AC-8
- **I-6 규칙 로드는 `loadRules` 재사용.** 규칙 파싱·중복 검사를 재발명 금지. → F-1, FR-6
- **I-7 중복 name 은 조용히 덮지 않는다.** `loadRules`의 problems 격리(F-1)를 저작 후 재실행해 확인 — 덮어쓰기 방지. → AC-7
- **I-8 배포 분기 정확**: base→`rules:deploy --no-repo`(글로벌), overlay→해당 repo `rules:deploy`(in-place). cwd가 대상 repo 아니면 안내(OQ-5). → F-4, AC-8
- **I-9 인터뷰 5단계는 게이트와 무관하게 *매* 변경에 강제.** 재진술·검수 전 write/deploy 금지 — 게이트 없는 단순 변경도 즉시 실행 금지(재귀 거버넌스 = 이 기능의 본질). → AC-9, FR-8

---

## Phase 0 — Live-Verify (전제) → plan §Phase 0
- [ ] **T001** 스킬 seed/deploy 경로(F-5)·rules-deploy 플래그(F-4)를 현행 코드로 재확인(경미 — 이미 grounded). 어긋나면 F-표 갱신 후 진행. → I-5·I-8

## Phase 1 — 커맨드 흐름(SKILL.md) = 5단계 인터뷰 매핑 → plan §Phase 1
- [ ] **T010** `templates/skills/localmind-rules/SKILL.md` 신규 — frontmatter 마커 `managed-by: localmind (skill: localmind-rules)`(F-5) + 커맨드 프롬프트 골격: load(F-1) → 의도 파악·재진술 → 초안 → 충돌/고아 게이트 → 배치 확인 → 저작 → 구조 검사 → 배포 제안. → AC-1·2·9, I-1
- [ ] **T011** 프롬프트 내 "규칙 전체 로드" 단계 명시 — `loadRules(~/.localmind/rules)` 재사용(base+overlays), 변경 제안 *전* 참조. → AC-1, F-1, I-6
- [ ] **T012** 프롬프트 내 interview-protocol 5단계(질문→답→재진술→검수→진행) 명문화 — 재진술·검수 전 적용 금지. → AC-2·9, I-1

## Phase 2 — 의미 충돌 감지 (게이트) → plan §Phase 2
- [ ] **T020** 프롬프트에 "충돌 감지" 절 — `loadRules` 본문 전량을 LLM이 읽고 새/편집 규칙과의 모순 추론(키워드 아닌 의미). 충돌 시 게이트로 조정 선택(예외 절·overlay·재서술·취소) 제시, **선택 전 write 금지**. → AC-3, I-1·I-2
- [ ] **T021** 무충돌 경로 — 헛된 게이트 없이 배치·저작으로 진행(오탐 억제 지침). → AC-4
- [ ] **T022** 스캔 범위 결정(OQ-1: 전 규칙 vs 관련성 필터) — 착수 시 확정, 기본=전량. → spec OQ-1

## Phase 3 — 링크 고아 검사 (게이트) → plan §Phase 3
- [ ] **T030** 프롬프트에 "고아 검사" 절 — remove/개명 대상에 대해 전 규칙 본문의 링크 파싱: **`[[name]]` + `](name.md)` + `## 관련`**(I-3). 의존 규칙 발견 시 게이트로 목록 제시, 확인/재연결 전 진행 금지. → AC-5, F-2, I-1·I-3
- [ ] **T031** [조건부, OQ-6] 인프롬프트 파싱이 불안정하면 `scripts/rules-check.ts` 신규 — 링크 의존·problems 리포트(결정론적). 도입 시 이 헬퍼는 **실제 단위 테스트**(위키/마크다운 두 형식 파싱, 고아 케이스). 기본=미도입(순수 프롬프트). → plan OQ-6, F-2

## Phase 4 — 배치·저작·구조 검사 → plan §Phase 4
- [ ] **T040** 프롬프트에 "배치 확인" 절 — base/overlay를 매번 질의(I-4), 선택 레이어에 write. → AC-6, FR-5
- [ ] **T041** 프롬프트에 "저작" 절 — 확정 규칙을 기존 포맷 `.md`로 작성(kebab name·Why/How/관련). frontmatter는 선택(F-3). → AC-7, FR-6
- [ ] **T042** 프롬프트에 "구조 검사" 절 — 저작 후 `loadRules` 재실행해 problems 0(중복 name 격리) 확인, 중복은 덮지 않고 사용자에게 표면화. → AC-7, F-1, I-7

## Phase 5 — 배포 제안 → plan §Phase 5
- [ ] **T050** 프롬프트에 "배포 제안" 절 — base→`npm run rules:deploy -- --no-repo`, overlay→대상 repo에서 `rules:deploy`(cwd 불일치 시 안내, OQ-5). managed만 건드림 명시(I-5). → AC-8, F-4, I-8
- [ ] **T051** [P] data 폴더 seed 배선 — `make skills-deploy`로 `~/.localmind/skills/localmind-rules/`→`~/.claude/skills/` 복사 경로 확인(F-5). → 배포 가능성

## Phase 6 — dogfood (통합 실증) → plan §Phase 6
- [ ] **T060** 이 커맨드로 **hotfix 규칙을 실제 저작** — no-work-without-doc(F-7)와 충돌 게이트를 거쳐 조정(예외 절/overlay)까지 관측. 전 AC 통합 실증. → plan §Phase 6

### Dogfood 관측 기준 + 시나리오 (RED/verify 대체)
- **AC-3 (충돌 게이트)** — 시나리오: "hotfix는 먼저 고치고 사후 문서화" 규칙 저작 요청. 관측: 커맨드가 `no-work-without-doc`(F-7)와의 모순을 *스스로* 짚고 게이트 발화 → 조정 4선택 제시 → **선택 전 파일 미생성** 확인.
- **AC-4 (무충돌, 오탐 없음)** — 시나리오: 기존 규칙과 겹치지 않는 신규 규칙(예: 새 도메인 관례) 저작. 관측: 충돌 게이트 *없이* 배치→저작 진행.
- **AC-5 (고아 게이트)** — 시나리오: 마크다운 링크로 참조되는 규칙(예: `no-work-without-doc` — sdd-default-flow 등이 `](name.md)`로 참조) 제거 요청. 관측: 고아 검사가 **마크다운형 의존까지** 목록화(I-3) → 확인 전 미적용.
- **AC-7 (중복 name 음성)** — 시나리오: 기존 name과 겹치는 규칙 저작 시도. 관측: 저작 후 `loadRules` problems>0로 격리·**미덮어씀** 표면화(happy-path T042와 별개 음성 실증).
- **AC-8 (배포 분기·managed-only)** — 시나리오: base 규칙 저작 후 배포 제안 수락. 관측: `--no-repo` 글로벌 배포 제안 + 실행 시 managed 섹션 밖 사용자 파일 diff 0(I-5).

---

## Definition of Done
- [ ] SKILL.md 골격(T010) + 5단계·충돌·고아·배치·저작·구조검사·배포 절 전부 포함, `make skills-deploy`로 배포 가능(T051).
- [ ] I-1…I-8 불변식이 프롬프트 문구로 강제됨(게이트 선발화·자동해소 금지·양형식 링크·매번 배치질의·managed-only·loadRules 재사용·중복 격리·배포 분기).
- [ ] Phase 6 hotfix dogfood 4시나리오(AC-3·4·5·8) 관측 통과 — 게이트 발화·오탐 없음·고아 목록·managed 불변.
- [ ] AC-1…AC-9 각 항목 `spec.md`에 `[x]` + 검증 근거(시나리오/실증) 표기, 미충족은 미체크+사유(은폐 금지).
- [ ] (헬퍼 도입 시만) `scripts/rules-check.ts` 단위 테스트 green.
- [ ] self-review clean → 세 문서 검증 표기 → 커밋(self-review 요약 포함) → CI 감시.

## Open questions (착수 전/중 해소)
- OQ-1 충돌 스캔 범위(전량 기본) · OQ-2 edit=in-place vs remove+add · OQ-4 managed 문구/`order:` 편집 대상 여부 · OQ-5 cwd≠대상 repo 배포 안내 · OQ-6 순수 프롬프트 vs `rules:check` 헬퍼(기본=프롬프트, T031 조건부).

---

주요 경로:
- 신규(정본): `templates/skills/localmind-rules/SKILL.md`
- 조건부 신규: `scripts/rules-check.ts`
- 재사용(수정 없음): `src/rules/registry.ts`(`loadRules`) · `scripts/rules-deploy.ts` · `make rules-deploy`·`make skills-deploy`
