# Plan: 페르소나/모델 바인딩 온보딩

> 모델 이력 — 작성: Fable 5 · 검토: Fable 5(critic) · 구현(예상): 미정

<!-- 어떻게(how) 만드는가. 상위: [goal](goal.md) · [spec](spec.md) -->
<!-- 검증 표기: self-review clean 후 단계·테스트 전략 항목을 [x]로 표기한다(AGENTS.md 규약 5). -->

## 요약 (결론 먼저)

- **바인딩 저장**: `<데이터 폴더>/_bindings/<runtime-id>.json` — 런타임당 파일 1개(JSON,
  schemaVersion 포함). `_` 접두 = 로컬·미커밋 컨벤션. 백업 gitignore 시드에 `_bindings/` 추가.
- **온보딩 진입점**: packaged 워크플로 스킬 **`localmind-binding`** (catalog: `explicit`·`mutating`)
  — 기존 seed→3타깃 배포 파이프라인에 그대로 편입. `localmind-` 접두로 built-in 충돌 회피
  (044 교훈, `localmind-rules` 선례).
- **등급↔역할 관계**: 역할은 **등급을 경유**한다(role → {persona, tier} → tiers[tier].model).
  역할별 모델 직접 지정은 이번에 두지 않는다.
- **부재 시 정책**: 안내 후 **진행 중단이 기본**, 사용자가 그 자리에서 명시적으로 택하면
  "이번만 바인딩 없이 진행"(저장 없음, 보고에 임시 진행 명시) 허용.
- **런타임 자기 식별**: 세션의 자기 보고(instruction-level) — 온보딩이 runtime-id를 도출·사용자
  확정해 파일명+`runtime` 필드에 기록, 소비 시 같은 도출로 정확 일치 파일만 읽는다.
- **계약의 기계 특성화**: `src/agents/binding.ts` 순수 함수(파싱·검증·resolve·merge)가 소비 규약의
  결정적 특성화(044 `evaluateActivation` 선례) — AC의 단위 테스트 수단이다.

## 확정 사실 표 (조사 — 확인일 2026-07-17)

| # | 사실 | 근거 |
|---|------|------|
| F-1 | 데이터 정본 폴더 = 첫 노트 폴더(기본 `~/.localmind`, `NOTES_DIR` 첫 항목으로 재지정 가능) | `src/agents/registry.ts:59-69` |
| F-2 | 페르소나 레지스트리 = `<데이터 폴더>/agents/*.md`, 폴더 없음 = **빈 레지스트리로 정상 반환**(예외 아님) | `src/agents/registry.ts:51-55, 197-206` |
| F-3 | 스킬 정본 = `<데이터 폴더>/skills/`, 배포 타깃 3종 — Claude `~/.claude/skills` · 공용 `~/.agents/skills` · Gemini `~/.gemini/commands`. **공용(.agents) 타깃은 복수 런타임이 공유**한다 | `src/agents/skills.ts:49-71, 542-599` |
| F-4 | 배포 파이프라인 = seed(templates/skills → 데이터 폴더) 후 deploy(데이터 폴더 → 3타깃), 예약 ID는 `templates/skills/catalog.json`의 `workflows` 키가 정한다(현재 4개: goal-ready·sdd-implement·sdd-self-review·localmind-rules) | `src/agents/skills.ts:489-517, 566-567` · `templates/skills/catalog.json:3-8` |
| F-5 | **packaged 스킬은 중립성 스캔을 기계 강제** — 본문·description·텍스트 자원에 provider명(claude/codex/gemini…)·구체 모델 토큰(opus/sonnet/gpt-/…)·런타임 전용 도구명이 1건이라도 있으면 배포 실패 | `src/agents/skill-contract.ts:485-515, 556-564` |
| F-6 | activation `explicit` 스킬은 Claude `disable-model-invocation: true`(runtime-enforced), Codex `agents/openai.yaml`(runtime-enforced), Gemini는 지침 수준(instruction-level) 확인으로 렌더된다 | `src/agents/workflow-policy.ts:16-53` |
| F-7 | 044 활성화 판정(provenance/challenge)은 **정적 characterization 함수 + 스킬 지침**으로 구현돼 있다 — 런타임 hook이 아니라 세션 행동 계약 | `src/agents/workflow-policy.ts:111-140` · `templates/skills/sdd-implement/SKILL.md:16-31` |
| F-8 | `~/.localmind`(노트 폴더)는 그 자체가 git 백업 repo이고, 로컬 전용 파일은 **백업 스크립트의 .gitignore 시드 목록**으로 제외한다(현재 `.brain-index.json*`·`.trash/`·`query-log.jsonl` 등 — `_bindings` 없음) | `scripts/backup.sh:32-35` · `scripts/backup-init.sh:96-100` |
| F-9 | brain 색인은 **`.md` 파일만** 대상 — JSON 바인딩 파일은 색인·recall에 들어가지 않는다 | `src/brain.ts:666, 1707` |
| F-10 | 페르소나 정의(frontmatter)는 이미 **대상 도구별 model**을 가진다(`targets.claude.model`·`targets.codex.model`) — 격리 위임 시 실행 모델의 정본은 페르소나 정의다 | `src/agents/registry.ts:12-28, 76-84` |
| F-11 | 런타임별 호출 표기: Claude `/name` · Codex `$name` · Gemini `auto skill 또는 /name wrapper` | `src/agents/commands.ts:32-45` |
| F-12 | 모델 식별자 형식 규칙이 이미 있다: `^[A-Za-z0-9][A-Za-z0-9._/:\[\]-]*$`(산출물 형식 파괴 문자 차단) | `src/agents/registry.ts:72-74` |
| F-13 | 워크플로 이름 목록을 하드코딩한 기존 테스트가 있다 — 새 packaged 스킬 추가 시 갱신 필요 | `src/agents/skills.test.ts:80` · `src/agents/commands.test.ts:478` |
| F-14 | 서버 설정(`loadConfig`)은 env 기반이며 바인딩과 무관(백엔드 라우팅용) — 바인딩을 env로 두지 않는 근거가 아니라 **별개 관심사**임의 확인 | `src/config.ts:68-101` |

## Open questions 확정 (spec OQ → 결정)

### D-1. 파일 포맷·경로·런타임 분리 — `<데이터 폴더>/_bindings/<runtime-id>.json`

- **경로**: `<데이터 폴더>/_bindings/`(기본 `~/.localmind/_bindings/`). 런타임당 파일 1개
  `<runtime-id>.json`. `_` 접두 = "기본 로컬·미커밋" 컨벤션(헌법 부록 A).
- **동기화 제외(필수 제약)**: `scripts/backup.sh:33`·`scripts/backup-init.sh:98`의 gitignore 시드
  목록에 `_bindings/` 추가 — 노트 폴더가 곧 백업 repo이므로(F-8) 시드가 유일한 격리 장치다.
- **포맷 = JSON**: ① 기존 매니페스트 선례(catalog.json), ② YAML 의존 없이 결정적 파싱(레지스트리가
  자체 파서를 두는 이유와 동일 — specs/010 공급망 고정), ③ `.md`가 아니라서 brain 색인·recall에서
  자동 제외(F-9 — 별도 제외 배선 불필요).
- **런타임 분리 = 파일 단위**: 한 런타임의 설정·수정이 물리적으로 다른 파일을 건드리지 않는다
  (FR-6을 파일 경계로 물리화).
- 기각 대안: (a) 런타임 자체 폴더(`~/.claude/` 등)에 저장 — FR-1(데이터 폴더 아래) 위배, 런타임별
  어댑터 증가. (b) 단일 파일에 런타임별 섹션 — 쓰기 격리가 약하고 부분 손상이 전체를 오염시킨다.

**스키마(FR-1·D-3 반영)**:

```json
{
  "schemaVersion": 1,
  "runtime": "<runtime-id>",
  "updatedAt": "<YYYY-MM-DD>",
  "tiers": {
    "critical-reasoning": { "model": "<모델 식별자>" },
    "standard": { "model": "<모델 식별자>" },
    "economy": { "model": "<모델 식별자>" }
  },
  "roles": {
    "<역할명>": { "persona": "<페르소나 name>", "tier": "critical-reasoning" }
  }
}
```

- `tiers` 키는 3등급의 부분집합 허용(부분 설정 유효 — FR-7③). 미지 등급 키는 오류.
- `roles` 키는 kebab-case 자유(레지스트리처럼 역할 집합을 스키마가 고정하지 않음 — 051이
  소비 역할을 정한다). `persona`는 저장 시점에 레지스트리 존재 검증(FR-7①), `tier`는 3등급 enum.
- `model`은 F-12 형식 규칙 재사용, 가용성은 검증하지 않음(FR-7② — Non-goal).

### D-2. 온보딩 진입점 — packaged 스킬 `localmind-binding`

- **형태**: `templates/skills/localmind-binding/` 스킬 + `catalog.json`에
  `"localmind-binding": { "activation": "explicit", "sideEffects": "mutating" }` 편입.
  기존 seed→3타깃 배포(F-4)·activation 렌더(F-6)를 그대로 탄다 — 새 배포 기계 0.
- **이름 근거**: `localmind-` 접두는 built-in과 충돌하지 않는 검증된 패턴(044 `/goal` 충돌 교훈,
  `localmind-rules` 선례 — F-4). `localmind-setup`은 기각 — 기존 `make setup`(스택 최초 설정)과
  의미 충돌해 비개발자를 오도한다. 재설정(FR-3)도 같은 스킬 재실행으로 처리(진입점 1개).
- **make 타깃/CLI 단독안 기각**: 등급별 추천 초안(FR-2①)은 세션의 최신 모델 지식이 필요하고,
  runtime-id 자기 식별(D-5)은 온보딩이 **런타임 안에서** 돌아야 소비 시점과 일치한다. 정적 CLI는
  둘 다 못 한다.
- **중립성 제약(F-5)**: 스킬 본문에는 런타임·모델 이름을 쓸 수 없다(기계 강제) — 추천 초안은
  "세션이 아는 최신 지식으로 제안 + 낡을 수 있음 고지"로 지시하고, 구체 예시는 repo `docs/`
  (스캔 대상 아님)에 둔다. 이 제약이 goal의 "plan에 모델명 확정 금지"를 구조적으로 보장한다.

### D-3. 등급↔역할 관계 — 역할은 등급을 경유한다

- `roles.<역할> = { persona, tier }` → 실행 모델은 `tiers[tier].model`. 역할별 모델 직접 지정
  필드는 두지 않는다.
- 근거: 모델 정본이 tiers 한 곳(변경 국소화 — 모델 세대 교체 시 3항목만 갱신). AGENTS.md 등급
  추상의 취지("역할과 등급으로 요청") 그대로.
- **페르소나 정의와의 관계(중요, F-10)**: 격리 위임이 실제로 일어나는 런타임에서 서브에이전트의
  실행 모델 정본은 **페르소나 정의의 `targets.*.model`**이다. 바인딩의 `tiers`는 ① 페르소나 위임
  불가 런타임의 현재-세션 대행(FR-5), ② 워크플로가 모델을 직접 골라야 하는 지점에서 쓴다.
  이 우선순위를 소비 규약에 명문화한다(이중 정본 방지).
- 기각 대안: `roles.<역할>.model` 직접 지정 — 모델 출처가 3곳(tiers·roles·페르소나)이 돼 드리프트.
  필요해지면 optional 필드 추가는 additive라 스키마 진화가 안전(후속 여지로만 기록).

### D-4. 부재 시 정책 — 엄격 안내가 기본 + 명시적 1회 예외

- 기본: 필요한 항목이 없으면 **side-effect 전에** 평이한 한국어로 온보딩 실행법을 안내하고
  진행하지 않는다(AC-3).
- 예외: 사용자가 안내에 대해 **명시적으로** "이번만 바인딩 없이 진행"을 택하면 진행하되, 아무것도
  저장하지 않고 보고에 "바인딩 미설정 상태로 진행(임시)"을 명시한다 — goal의 중단 금지 제약과
  "기본 미진행"의 양립점.

### D-5. 런타임 자기 식별 — 세션 자기 보고(instruction-level)

- 온보딩: 세션이 자기 런타임 제품명을 소문자 kebab-case `<runtime-id>`로 도출해 **사용자에게 보여
  확정**받고, 파일명과 `runtime` 필드 양쪽에 기록한다.
- 소비: 같은 규칙으로 자기 id를 도출해 **정확히 일치하는 파일만** 읽는다. 일치 파일이 없으면
  다른 런타임 파일을 대신 읽지 않고(FR-6) `_bindings/`의 기존 파일 목록을 보여주며 부재 규칙
  (D-4)을 적용한다 — id 표기 드리프트(예: 제품명 표기 차이)를 추측 봉합 대신 사용자에게 표면화.
- 근거: 044가 이미 런타임 능력 판정을 세션 자기 보고(instruction-level)로 위임하는 구조(F-6·F-7).
  배포 어댑터가 runtime-id를 주입하는 대안은 기각 — 공용 `.agents/skills` 타깃은 복수 런타임이
  공유하므로(F-3) 타깃당 id 주입이 성립하지 않는다.

### D-6. 재설정 UX — 항목 선택 수정이 기본

기존 바인딩 요약을 보여주고 바꿀 항목만 골라 수정(나머지 보존 — AC-2). 전체 재인터뷰는 사용자가
요청할 때만. 근거: 재설정의 지배적 동기가 "모델 세대 교체"(goal) — 보통 tiers 1~3항목 갱신이다.

## DDD 경계

- **Bounded context**: "워크플로 자산 관리" 컨텍스트(skills/agents 레지스트리·배포)의 하위에
  **설치 바인딩(installation binding)** 개념을 추가한다. 바인딩은 노트(brain)·서버(config) 어느
  컨텍스트에도 속하지 않는다 — 색인 금지(F-9), env 설정 아님(F-14).
- **유비쿼터스 언어**: 실행 등급(tier) · 역할(role) · 페르소나(persona) · 바인딩(binding) ·
  runtime-id · 페르소나 fallback — spec Terminology 그대로, 재정의 없음.
- **데이터 흐름**:
  `templates/skills/localmind-binding` ─seed→ `<데이터 폴더>/skills/` ─deploy→ 3타깃(기존 파이프라인)
  / 온보딩 세션 ─write→ `<데이터 폴더>/_bindings/<runtime-id>.json` ←read─ 워크플로 스킬 세션(051).
  `src/agents/binding.ts`는 이 계약의 결정적 특성화(순수 함수) — 런타임 실행 경로가 아니라
  테스트·후속 도구의 근거(044 `evaluateActivation` 선례, F-7).
- **의존 방향**: `binding.ts`는 `registry.ts`(페르소나 이름 검증)만 참조. `skills.ts`/배포는
  바인딩을 모른다(배포와 바인딩은 직교).

## 영향 모듈

| 경로 | 신규/수정 | 내용 |
|---|---|---|
| `src/agents/binding.ts` | 신규 | 스키마(zod)·`bindingsDir()`·`loadBinding(runtimeId)`·`validateBinding(raw, personaNames)`·`resolveTier`/`resolveRole`(부재 사유 포함 결과)·`mergeBinding`(부분 수정·보존). 모델 형식은 F-12 규칙 재사용 |
| `src/agents/binding.test.ts` | 신규 | AC-2·3·5·6·7·8·9의 결정적 검증(아래 표) |
| `templates/skills/localmind-binding/SKILL.md` | 신규 | 온보딩·재설정 워크플로 지침(중립 — F-5 스캔 통과 필수): 활성화 확인 → runtime-id 확정 → 등급별 추천 초안(낡음 고지) → 레지스트리 나열·역할 확정 → 검증 → 저장 → 요약. 빈 레지스트리 건너뜀·무효 페르소나 재선택·부분 설정 허용 지시 포함 |
| `templates/skills/localmind-binding/references/binding-contract.md` | 신규 | **소비 규약 정본**(051이 스킬 본문에 반영할 계약): 파일 위치·스키마·runtime-id 도출 규칙·부재 시 D-4·페르소나 fallback(FR-5)·페르소나 정의 model 우선순위(D-3). 중립 서술 |
| `templates/skills/localmind-binding/references/binding.example.json` | 신규 | 플레이스홀더 예시(`<모델 식별자>` — 구체 모델명 0건) |
| `templates/skills/catalog.json` | 수정 | `localmind-binding` 항목 추가(`explicit`·`mutating`) |
| `src/agents/skills.test.ts` · `src/agents/commands.test.ts` | 수정 | 하드코딩된 워크플로 이름 목록에 `localmind-binding` 추가(F-13) + explicit 렌더(deny-implicit metadata) 검증은 기존 테스트 패턴 재사용 |
| `scripts/backup.sh` · `scripts/backup-init.sh` | 수정 | gitignore 시드 목록에 `_bindings/` 추가(F-8) |
| `scripts/backup.test.sh`(또는 기존 셸 테스트 관례) | 수정 | 시드 후 `_bindings/`가 백업 커밋에서 제외됨을 검증 |
| `docs/workflows.md` | 수정 | 온보딩 사용법·바인딩 개념(사람용 — 구체 런타임 이름·예시는 여기서 허용) |
| `AGENTS.md` | 수정 | "실행 등급 배치" 절에 1~2줄 — 예고했던 optional adapter가 `localmind-binding`으로 구체화됐다는 포인터 |

바인딩 관련 배선을 **하지 않는 곳**(근거): `scripts/asset-dirs.ts` — 셸 lifecycle이 바인딩 경로를
쓰지 않으므로 노출 불필요. `src/config.ts` — 서버 설정과 별개 관심사(F-14). MCP 도구 — 소비자는
세션의 파일 읽기이므로 도구 추가는 과설계(필요 시 후속).

## 단계 (의존 순서 · 담당)

- [x] **Phase 0 — Live-Verify 게이트 확인** (아키텍트 작성분, 워커가 구현 중 준수):
      계획·스킬·템플릿에 구체 모델명 0건 — F-5 중립성 스캔이 이를 **기계 강제**하므로 별도 외부
      라이브 검증 대상 없음. 런타임별 위임 능력은 단정하지 않고 세션 capability 판정에 위임(044).
      — 확인됨(T0.1).
- [x] **Phase 1 — 바인딩 계약 모듈** (worker): `binding.ts` + `binding.test.ts` (TDD — AC 매핑
      테스트 먼저). D-1 스키마·D-3 resolve·D-4 부재 사유·FR-7 검증 의미를 코드로 고정.
      — 완료(T1.1/T1.2), self-review에서 traversal 가드(NAME_RE) 회귀 4건 보완.
- [x] **Phase 2 — 온보딩 스킬 패키지** (worker, Phase 1의 계약 확정에 의존): SKILL.md +
      references(계약 정본·예시) + catalog 편입 + F-13 테스트 목록 갱신. 계약 문서는 Phase 1
      함수 의미와 1:1이어야 한다(드리프트 = 결함).
      — 완료(T2.1~T2.6).
- [x] **Phase 3 — 백업 격리 배선** (worker, Phase 1·2와 독립 — 병렬 가능): gitignore 시드 +
      셸 테스트.
      — 완료(T3.1/T3.2), 백업 셸 31/0.
- [x] **Phase 4 — 문서** (worker, Phase 1~3 확정에 의존): docs/workflows.md·AGENTS.md 포인터.
      — 완료(T4.1/T4.2).
- [x] **Phase 5 — 도그푸드 + self-review** (worker 실행, 최종 판정은 격리 리뷰어 — sdd-implement
      규약): `make skills-deploy` → 실제 온보딩 1회(AC-1) → 재실행(AC-2) → 바인딩 삭제 후 소비
      규약 시나리오(AC-3) → 가능한 런타임에서 격리(AC-5)·fallback(AC-4) 관찰. 지침 수준 행동은
      여기서만 실증 가능함을 보고에 명시.
      — 완료(T5.1~T5.4), self-review clean.

## 테스트 전략 (AC 1:1)

지침(스킬 본문) 행동은 044 방식의 3층으로 검증한다: ① `binding.ts` 순수 함수 = 계약의 결정적
특성화(단위), ② 스킬 계약 테스트 = 산출물 정적 검증(중립성·catalog 바인딩·deny-implicit 렌더 —
기존 `skill-contract.test.ts`/`skills.test.ts` 파이프라인), ③ 도그푸드 = 세션 행동 실증.

| AC | 레벨 | 방법 |
|---|---|---|
| AC-1 최초 설정 | 정적 + 도그푸드 | 스킬 본문에 추천 고지·확정·요약 지시 존재(정적 텍스트 검증) + Phase 5 실제 온보딩으로 파일 생성·요약 관찰 |
| AC-2 재설정 | 단위 + 도그푸드 | `mergeBinding` 부분 수정·나머지 보존 단위 테스트 + 재실행 도그푸드 |
| AC-3 미설정 실행 | 단위 + 정적 + 도그푸드 | `resolveTier/resolveRole` 부재 사유 반환 단위 + 계약 문서의 D-4 문구 정적 + 도그푸드(무단 진행 0건 관찰) |
| AC-4 페르소나 fallback | 정적 + 도그푸드 | 계약 문서에 FR-5(비독립 명시·중단 금지) 서술 정적 검증 + 위임 능력 없는 런타임에서 도그푸드(가능한 환경에 한함 — 불가 시 보고에 명시) |
| AC-5 런타임 격리 | 단위 + 셸 | `loadBinding`이 다른 runtime-id 파일을 읽지 않음 단위 + `_bindings/` 백업 제외 셸 테스트 |
| AC-6 부분 설정 | 단위 | tiers/roles 부분집합 바인딩 유효 + 설정 항목 resolve 성공·미설정 항목만 부재 사유 |
| AC-7 무효 페르소나 | 단위 + 정적 | `validateBinding`이 레지스트리 밖 이름을 저장 불가 오류로 반환 + 스킬의 재선택 유도 지시 정적 |
| AC-8 빈 레지스트리 | 단위 + 정적 | 빈 `personaNames`에서 tiers 검증은 정상·roles는 건너뜀 판정 단위(F-2의 빈 레지스트리 규약 재사용) + 스킬의 건너뜀 안내 지시 정적 |
| AC-9 추천 밖 모델 | 단위 + 도그푸드 | 자유 모델 식별자(F-12 형식 내) 저장 허용 단위 + 미검증 고지 문구 도그푸드 관찰 |

**검증 결과(2026-07-17)**: 전 AC green(`npm test` 853/0) · 도그푸드(Phase 5) 완료 · self-review clean.

## 가정·리스크

- **가정**: 각 런타임 세션은 자기 제품 정체를 안다(D-5의 전제). 완전 미상 런타임이면 스킬이
  사용자에게 id를 묻는다 — 추측 금지.
- **가정**: 051이 소비할 역할 집합은 051에서 확정한다 — 050 스키마는 역할 키를 고정하지 않아
  051 변경이 스키마에 역류하지 않는다.
- **리스크**: runtime-id 표기 드리프트(같은 런타임을 다른 id로 저장) → 소비 시 목록 표면화 +
  사용자 교정(D-5)으로 완화. 리스크: 지침 수준 규약의 미준수(런타임 hook 아님) → 044와 동일하게
  enforcement 수준을 정직하게 보고하고, 결정적 특성화 테스트로 계약 자체의 모호성을 0으로 유지.
