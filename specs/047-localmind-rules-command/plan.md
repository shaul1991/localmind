# Plan: /localmind-rules — 거버넌스 규칙 저작·관리 커맨드

> 모델 이력 — 작성: Opus 4.8 · 검토: Opus 4.8(critic) · 구현(예상): 미정(Sonnet/Opus — /goal 시 확정)

<!-- how. 도메인 경계·영향 모듈·단계·테스트 전략. -->

## 확정 사실 표 (F-n) — 코드 근거, 하위(tasks·critic) 재조사 금지·인용만

| ID | 확정 사실 | 근거 | 확인 |
|----|----------|------|------|
| F-1 | `loadRules(dir)` → `{base, overlays(Map), problems, warnings}`. 규칙당 `.md` 1개, name=frontmatter/basename, kebab 검증(`NAME_RE`), **중복 name→problems 격리**(임의 채택 안 함). order/name 정렬 | `src/rules/registry.ts` | 코드 2026-07-16 |
| F-2 | registry는 **링크 의존(`[[name]]`·`](name.md)`·`## 관련`)을 파싱하지 않음** — name·order·content만. 링크 고아 검사는 커맨드가 직접 해야 함(OQ-3 해소). **코퍼스 실측: 마크다운형 `](name.md)` 94회 vs 위키형 `[[name]]` 11회 → 둘 다 파싱 필수** | `src/rules/registry.ts` parseDoc + 코퍼스 grep | 코드 2026-07-16 |
| F-3 | frontmatter는 선택(대부분 산문). 최상위 `name:`·`order:`만 읽음(YAML 의존 없음). 본문 빈 규칙은 skip | `src/rules/registry.ts` L50-80 | 코드 2026-07-16 |
| F-4 | 배포 = `make rules-deploy`→`npm run rules:deploy`→`scripts/rules-deploy.ts`. **base=--no-repo 글로벌, overlay=repo in-place**. managed 섹션 불변식(관리 바이트만 교체·problems>0면 prune skip·폴더 없으면 생성 안 함·device 절대경로 금지) | Explore 맵 + `src/rules/deploy.ts` | 2026-07-16 |
| F-5 | 스킬 = `~/.localmind/skills/<name>/SKILL.md`(정본, `templates/skills/`에서 seed)→`make skills-deploy`로 `~/.claude/skills/`에 **그대로 복사**. **SKILL.md 본문=슬래시 커맨드 프롬프트**. 마커 `managed-by: localmind (skill: <name>)` | Explore 맵 + `src/agents/skills.ts` | 2026-07-16 |
| F-6 | 규칙 저작 커맨드 **없음**(net-new). specs/041이 "규칙 생성·편집 방법"을 미해결 OQ로 남김 | Explore 맵 + specs/041 | 2026-07-16 |
| F-7 | 알려진 충돌: 예로 든 hotfix("먼저 고치고 사후 문서화")는 `no-work-without-doc`(변경 전 문서 필수)와 정면 충돌 → 조정 필요 | `~/.localmind/rules/base/no-work-without-doc.md` | 2026-07-16 |

## 도메인 경계 (DDD)

- **핵심 = interface 아티팩트(슬래시 커맨드)** — `rules` 도메인(registry·compose·deploy) 위에 얹는 **얇은
  구동 흐름**이다. 새 도메인 로직을 만들지 않는다(§6 얇은 interface).
- **재사용(불변)**: 규칙 로드·구조 검사 = `src/rules/registry.ts`(`loadRules`) · 배포 = `scripts/rules-deploy.ts`.
- **신규(최소)**: `templates/skills/localmind-rules/SKILL.md`(커맨드 프롬프트) + data 폴더 seed. 링크/충돌
  판단은 **SKILL 프롬프트의 LLM 추론**(의미 충돌)과 **본문 `[[name]]`·`](name.md)` 파싱**(고아)으로 — 가급적 순수
  프롬프트(Read/Glob/Bash 재사용). 인프롬프트 파싱이 불안정하면 소형 `rules:check` 헬퍼 추가(OQ-6).

## 영향 모듈

- **신규**: `templates/skills/localmind-rules/SKILL.md` (+ data 폴더 정본 seed).
- **재사용(수정 없음)**: `src/rules/registry.ts` · `scripts/rules-deploy.ts` · `make rules-deploy`/`skills-deploy`.
- **조건부 신규**: `scripts/rules-check.ts`(링크 의존·problems 리포트) — OQ-6 결과에 따라.

## 단계

- **Phase 0 — Live-Verify**: 스킬 seed/deploy 경로(F-5)·rules-deploy 플래그(F-4)를 현행으로 확인
  (이미 grounded — 경미). *(전제)*
- **Phase 1 — 커맨드 흐름(SKILL.md) = 5단계 인터뷰 매핑**: load(F-1) → 의도 파악·재진술 → 초안 →
  **충돌/고아 게이트** → 배치 확인 → 저작 → 구조 검사 → 배포 제안. *(AC-1·2·9)*
- **Phase 2 — 의미 충돌 감지**: `loadRules` 본문 전량을 LLM이 읽고 새/편집 규칙과의 모순을 추론,
  게이트로 조정 선택 제시(예외 절·overlay·재서술·취소). 무충돌은 헛게이트 없이 진행. *(AC-3·4)*
- **Phase 3 — 링크 고아 검사**: 전 규칙 본문의 링크(**위키 `[[name]]` + 마크다운 `](name.md)`**, `## 관련`
  포함)를 파싱해 제거/개명 대상의 의존을 찾음(F-2: registry 미지원 → 커맨드가 파싱, 마크다운형이 다수).
  깨지면 게이트. *(AC-5)*
- **Phase 4 — 배치·저작·구조 검사**: base/overlay를 묻고(F-4) 규칙 포맷대로 `.md` 저작, `loadRules`
  재실행해 중복 name(F-1) 등 problems 0 확인. *(AC-6·7)*
- **Phase 5 — 배포 제안**: base→`rules:deploy --no-repo`, overlay→repo. managed 아닌 파일 불변(F-4). *(AC-8)*
- **Phase 6 — dogfood**: 이 커맨드로 **hotfix 규칙을 실제 저작** — no-work-without-doc(F-7)와 충돌
  게이트를 거쳐 조정(예외 절/overlay)까지 관측. *(전 AC 실증)*

## 테스트 전략 (AC → 레벨)

| AC | 검증 | 레벨 |
|----|------|------|
| AC-1·2·9 | 커맨드가 규칙 로드·재진술·5단계 준수 | dogfood 시나리오 |
| AC-3 | 충돌 규칙(hotfix↔no-work-without-doc) 저작 → 게이트 발화 | dogfood 시나리오(적대적) |
| AC-4 | 무충돌 규칙 → 헛게이트 없음 | dogfood 시나리오 |
| AC-5 | 링크된 규칙 제거 → 고아 게이트. (rules-check 헬퍼 도입 시) 링크 파싱 | 시나리오 (+ 헬퍼면 단위) |
| AC-6·7 | 배치 질의 + 중복 name 격리 | 시나리오 + `loadRules` 단위 재사용 |
| AC-8 | 배포 분기·managed 불변 | dogfood 시나리오 |

> SKILL은 LLM 프롬프트라 검증 주축은 **dogfood 시나리오**(§8). 헬퍼 CLI를 도입하면 그 부분만 결정론적
> 단위 테스트. hotfix dogfood(Phase 6)가 전 AC의 통합 실증.

## Open questions (plan 유래)

- **OQ-6** — 링크/구조 검사를 **순수 프롬프트**(LLM이 Read/Grep)로 할지, 소형 `rules:check` CLI로 할지.
  기본 = 순수 프롬프트(Simplicity), 인프롬프트 링크 파싱이 불안정하면 헬퍼 승격.
- (spec OQ-1·2·4·5는 spec.md 참조 — 착수 전/중 해소.)

> **상태**: draft. `/goal` readiness 점검 후 착수. 대부분 SKILL.md 저작 + dogfood라, tasks는 커맨드 흐름
> 명세 + hotfix dogfood 시나리오 중심.
