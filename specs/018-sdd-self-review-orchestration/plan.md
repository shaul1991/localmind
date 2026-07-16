# Plan: SDD Self-Review 오케스트레이션

> **044 확장/대체 포인터**: specs/044가 `sdd-self-review`를 공급자 중립 canonical `SKILL.md`로 이관하고 다중 target 배포를 소유한다. 018의 optional cross-review adapter(`localmind-review`)와 report-only 소유 경계는 유지되며, provider-specific trigger/copy/docs는 044로 대체된다. 과거 검증 체크는 그대로 둔다.

상위: [goal](goal.md) · [spec](spec.md)

> 2026-07-03 인터뷰 결정 7건 위에 서 있다. goal/spec은 인터뷰어 페르소나가, 이 plan은
> 아키텍트 페르소나가 초안했고 코디네이터가 FR/AC 번호를 정렬했다(018 방식의 부트스트랩).

## 설계 근거 · 기각한 대안

1. **크리틱 교차 트랜스포트 = `codex exec -p critic`(직접 CLI), 게이트웨이(017 runtime.ts) 재사용 기각.**
   근거: SDD 자기검증은 크리틱의 **high reasoning + 스키마 강제 출력**이 핵심인데, 게이트웨이
   경유(`/v1/chat/completions`)는 (a) reasoning_effort를 벗기고(017 FR-4 자연 강등), (b)
   `--output-schema`를 걸 수단이 없다. 프로필의 high는 `codex exec -p` 전용 경로다(017 FR-4·
   personas.md에서 확정). → 같은 `critic` 페르소나를 **무대별 다른 트랜스포트**로 부르는 것이
   이 스펙의 구조적 핵심이다(런타임=게이트웨이 / SDD=codex exec).

2. **스킬 배포 = 별도 모듈(`src/agents/skills.ts`), 016 `deploy.ts`에 얹기 기각.**
   근거: 스킬은 **디렉토리 verbatim 복사**, 페르소나는 **단일 파일 다중 타깃 렌더**(claude .md +
   codex .config.toml + agents/.toml). 형태가 달라 한 함수로 통합하면 분기가 는다. 공유하는 것은
   `MANAGED_MARKER` 규약과 "비교 후 쓰기·미관리 보호·prune" **규율**뿐 — 이건 이미 export된
   상수 하나로 충분하다. 안정적인 016 코드를 리팩터하지 않는다(외과적).
   **기각한 더 큰 추상화**: 제네릭 `managed-sync` 엔진 추출 — 소비자 2개·형태 상이로 조기 추상화
   (한 번 쓰는 유연성 금지, 시니어가 과하다고 볼 자리).

3. **output-schema = 모듈 상수→임시파일, 별도 `.json` 패키징 기각.**
   근거: `tsc`는 `.json`을 `dist/`로 복사하지 않아 빌드/패키징 배선이 늘어난다. 스키마는 ~20줄
   상수로 충분하고, 스크립트가 실행 시 tmp에 써서 `--output-schema <tmp>`로 넘기면 패키징 무관.

4. **폴백 = 비차단 + 가시적 생략 사유**(017 런타임의 *무음* 생략과 의도적으로 다름).
   근거: 자기검증 단계에서 codex가 안 돌 때 Claude가 "교차 검증됨"으로 오인하면 안 된다 —
   생략은 **보고에 노출**하되 흐름은 막지 않는다(016/017의 "실패가 본래 기능을 막지 않는다"는
   유지, "무음"만 뒤집는다).

5. **수정→재검 루프 비소유** — 도구는 1회 검증·구조화 보고까지(결정 4). 근거: 루프를 도구에 넣으면
   `/goal` 오케스트레이션(AGENTS.md 5단계)과 이중 소유가 된다.

## 접근 요약

두 산출물 + 한 배포 경로로 구성한다. ① **스킬**(`SKILL.md`) — `/goal` self-review 단계에서
Claude가 읽어 "Claude 크리틱 서브에이전트(Opus) 적대 리뷰 → localmind codex 교차 스크립트 →
병합·보고" 3단계를 오케스트레이션한다. ② **codex 교차 스크립트** — localmind가 소유·배포하는
얇은 CLI(`localmind-review`)로, stdin의 리뷰 프롬프트를 `codex exec -p critic --output-schema`로
넘겨 `{verdict, blocking[], advisory[]}`를 강제 파싱해 돌려준다. ③ **배포** — 스킬 정본은
데이터 폴더(`<data>/skills/`)에 두고(016처럼 백업 자동 편입), 016 managed 마커 규약을 재사용해
**변환 없이** `~/.claude/skills/`로 복사·prune한다. codex 미설치·프로필 미배포·스키마 불준수·
타임아웃은 모두 **비차단 생략**(사유 표시)으로 흡수해 `/goal` 흐름을 막지 않는다.

## 도메인 경계 (DDD) · 불변식

- **agents 컨텍스트**(016/017)가 "SDD 무대의 크리틱 교차 호출"과 "localmind 소유 스킬 배포"까지
  소유를 확장한다. 새 모듈 둘:
  - `cross-review.ts` — `codex exec -p critic` 트랜스포트(스키마·파싱·폴백·병합 렌더). **runtime.ts와
    별개** — runtime은 게이트웨이(effort 벗김), cross-review는 codex exec(프로필 high 유지). 둘 다
    `critic`을 부르지만 무대·전송이 다르다.
  - `skills.ts` — 스킬 정본 해석·시드·verbatim 복사·prune.
- **불변식**:
  - `cross-review.ts`·`skills.ts`는 **brain.ts를 import하지 않는다**(017과 동일 — 순환 방지).
  - 스킬 배포는 **변환 0**: 정본 파일 바이트를 그대로 복사한다(페르소나 렌더와 다름). managed
    마커는 **정본 SKILL.md에 이미 존재**하고 복사돼 나간다(주입·재작성 없음).
  - 마커 없는 대상 파일(사용자 직접 생성/포크)은 **불가침** — 016 `writeManaged`/`isManagedFor`
    규율과 동일.
  - 폴백은 **exit 0 + 사유 문자열** — 검증 도구가 `/goal`을 실패시키지 않는다.
  - **정본⊂백업 스코프**: `skillsDir()` 기본값은 항상 첫 노트 폴더 하위다 — `make backup`이
    노트 폴더를 통째로 커밋하므로 정본이 자동 편입된다(AC-12의 구조적 근거).
    `LOCALMIND_SKILLS_DIR`로 노트 밖을 가리키면 백업 편입이 깨질 수 있음을 문서에 경고한다.
- **유비쿼터스 언어**: **교차 검증(cross-review)** — 구현을 크리틱이 codex(gpt-5.5 high)로 적대
  리뷰. **판정(verdict)** — `pass|advise|block`. **차단(blocking)/권고(advisory)** — 4범주 태그
  (`traceability`·`coverage`·`correctness`·`simplicity-security`)가 붙은 항목. **생략(skip)** —
  전제 미충족으로 codex 단계를 안 돈 상태(사유 표시, 비차단).

## 핵심 설계

### 산출 계약 스키마 (결정 3)

`cross-review.ts`의 상수 `CROSS_REVIEW_SCHEMA`(JSON Schema) — 실행 시 tmp 파일로 써서
`codex exec --output-schema <tmp>`에 넘긴다:

```jsonc
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "verdict":  { "type": "string", "enum": ["pass", "advise", "block"] },
    "blocking": { "type": "array", "items": { "$ref": "#/$defs/finding" } },
    "advisory": { "type": "array", "items": { "$ref": "#/$defs/finding" } }
  },
  "required": ["verdict", "blocking", "advisory"],
  "$defs": {
    "finding": {
      "type": "object", "additionalProperties": false,
      "properties": {
        "category": { "type": "string",
          "enum": ["traceability", "coverage", "correctness", "simplicity-security"] },
        "detail":   { "type": "string" }
      },
      "required": ["category", "detail"]
    }
  }
}
```

정합 규칙: `blocking[]`이 비지 않으면 `verdict=block`로 정규화(파싱 후 보정). 4범주는 AGENTS.md
self-review 점검 범위 4가지와 1:1 대응.

### codex 교차 스크립트 (`src/agents/cross-review.ts` + `cross-review-cli.ts`)

```
runCrossReview(input: { prompt: string }): Promise<CrossReviewResult>
// CrossReviewResult = { status: "ok"|"skipped"; skipReason?: string;
//                       verdict?, blocking[], advisory[] }
```

절차:
1. **전제 확인**(순서대로, 실패 시 `skipped` + 평이한 한국어 사유):
   - `SDD_CROSS_REVIEW=off` → `생략(비활성화)`.
   - codex 바이너리 부재(`config.codexBin` 확인) → `생략(codex 미설치 — codex CLI를 설치하세요)`.
   - `<codexHome>/critic.config.toml` 부재 → `생략(critic 프로필을 찾을 수 없음 — 레지스트리에
     critic 정의가 있는지 확인 후 'make agents-deploy')`. (프로필 부재의 원인은 미배포일 수도,
     레지스트리에 정의가 없는 것일 수도 있다 — 한쪽 처방만 안내하면 틀린 처방이 된다(크리틱
     경미-1). codexHome 해석은 016의 `defaultCodexHome`를 export해 재사용.)
2. **호출**: `codex exec -p critic --output-schema <tmpSchema> -o <tmpOut> --skip-git-repo-check
   -s read-only -c approval_policy="never"` + 리뷰 프롬프트를 stdin으로. tmp 파일명에는
   pid·랜덤 접미사를 넣어 병렬 실행 경합을 막는다(크리틱 경미-4). `AbortSignal.timeout
   (SDD_CROSS_REVIEW_TIMEOUT_MS)`. (codex.ts 백엔드의 exec 플래그 관례를 따르되 여기선 `--json`이
   아니라 `--output-schema/-o` 경로.)
3. **파싱**: `tmpOut` 읽어 JSON.parse → 스키마 shape 검증(zod). 실패·빈 출력·타임아웃·비정상 종료 →
   `skipped` + 사유(`생략(교차 검증 결과 해석 실패)` / `생략(시간 초과)`). **답변/흐름을 볼모로
   잡지 않는다**(017 parseVerdict 관대 처리와 같은 정신, 단 SDD는 사유를 노출).
4. **정규화·렌더**: `blocking` 비지 않으면 verdict=block. 사람이 읽는 병합용 markdown 블록을
   `renderCrossReview(result)`로 만든다(SKILL이 그대로 보고에 인용).

`cross-review-cli.ts`(bin `localmind-review`): stdin 전량 읽어 `runCrossReview` → `renderCrossReview`
결과를 stdout으로. **항상 exit 0**(비차단). 스킬이 이 명령을 Bash로 호출한다.

### 스킬 내용 골격 (`templates/skills/sdd-self-review/SKILL.md`, 결정 2·6)

`audience: ai` 형식(명령형·모호성 0). `/goal` self-review 단계에서 발화되는 오케스트레이션 지침:

```
1. Claude 크리틱 서브에이전트(Opus) 적대 리뷰 — Agent/Task 도구로 분리 컨텍스트를 띄워
   AGENTS.md 4범주(FR/AC 추적성·테스트 커버리지·정확성·단순화/보안)를 "결함을 찾으러 간다"는
   자세로 점검. (이 단계는 AGENTS.md 5단계의 필수 self-review 그 자체 — 끄지 않는다.)
2. localmind codex 교차 검증 — 변경 대상 spec의 AC + 구현 diff 요약을 리뷰 프롬프트로 조립해
   `localmind-review`에 stdin으로 파이프. 결과({verdict, blocking[], advisory[]} 또는 생략 사유)를
   받는다. (이 단계만 SDD_CROSS_REVIEW=off로 끌 수 있고, 생략돼도 1단계는 유지된다.)
3. 병합·보고 — 1·2의 발견을 합쳐 단일 self-review 보고를 낸다. blocking(어느 쪽이든) →
   /goal 5단계의 수정→재검 루프로 넘긴다(도구는 여기까지). advisory → 참고로 표기. codex가
   생략됐으면 "codex 교차: 생략(사유)"를 보고에 명시 — "교차 검증됨"으로 위장 금지.
```

**speckit 기존 스킬과 표면 비겹침**(결정 5): 이 스킬은 self-review 단계 전용이며, tasks 분해·구현
지시는 하지 않는다.

### 스킬 배포 (`src/agents/skills.ts`, 결정 7)

경로 해석(registry.ts `agentsDir()` 미러):
- `skillsDir()` — 정본. `LOCALMIND_SKILLS_DIR` > `<첫 노트 폴더>/skills` > `~/.localmind/skills`.
- 배포 타깃 — `LOCALMIND_CLAUDE_SKILLS_DIR` > `~/.claude/skills`.

두 hop 모두 016 managed 규율(비교 후 쓰기·미관리 skip):
- **seedSkills()**: `templates/skills/*`(패키지 동봉 정본) → `<data>/skills/*`. 부재 시 생성,
  managed 사본이면 갱신(localmind가 스킬을 소유하므로 버전업 반영), 미관리(사용자 포크)면 보존.
  **prune 없음**(데이터 폴더는 사용자 공간).
- **deploySkills()**: `<data>/skills/*` → `<claude-skills>/*`. 디렉토리 verbatim 복사(SKILL.md +
  형제 파일), skip-unmanaged, **prune**(정본에서 사라진 managed 스킬 디렉토리 제거). 대상 도구
  미설치(`~/.claude` 부재) 시 016처럼 skip 사유 반환(폴더 임의 생성 금지).

managed 판정 단위 = 스킬 디렉토리의 `SKILL.md`에 `managed-by: localmind (skill: <name>)` 마커
존재 여부. `deployAgents`와 동일한 `DeployResult`/`formatDeployResult` 모양으로 결과 보고(비개발자
한국어).

## 영향 모듈

- **신규** `src/agents/skills.ts` (+ `skills.test.ts`) — `skillsDir()`·seed·verbatim 배포·prune.
- **신규** `src/agents/cross-review.ts` (+ `cross-review.test.ts`) — 스키마 상수·`runCrossReview`·
  파싱·폴백·`renderCrossReview`.
- **신규** `src/agents/cross-review-cli.ts` — bin `localmind-review` 진입점(stdin→run→stdout, exit 0).
- **신규** `scripts/skills-deploy.ts` — thin CLI(agents-deploy.ts 미러, seed+deploy 호출·결과 출력).
- **신규** `templates/skills/sdd-self-review/SKILL.md` — 스킬 정본(managed 마커 포함, verbatim 시드).
- **수정** `src/agents/deploy.ts` — `defaultCodexHome`를 export(코드home 해석 재사용). 그 외 무변경.
- **수정** `src/brain.ts` — `listMarkdown` 제외에 `skillsDir()` 추가(line 370 옆, agents/와 동일하게
  skills/를 색인·검색에서 제외). `skillsDir` import.
- **수정** `package.json` — `bin.localmind-review` = `dist/agents/cross-review-cli.js`(기존 `tsc`가
  자동 컴파일 — 빌드 설정 무변경), `scripts`에 `skills:deploy`·`cross-review`(편의) 추가. 테스트
  glob(`src/agents/*.test.ts`)은 신규 테스트를 이미 포괄(무변경).
- **수정** `Makefile` — `skills-deploy` 타깃(agents-deploy 미러). (cross-review는 스킬이 부르므로
  make 타깃은 선택.)
- **수정** `docs/agents.md`(스킬 배포·self-review 오케스트레이션 절)·`docs/reference.md`
  (env 3종: `SDD_CROSS_REVIEW`·`SDD_CROSS_REVIEW_TIMEOUT_MS`·`LOCALMIND_SKILLS_DIR`)·README 한 줄.
- **무변경** `src/agents/runtime.ts`(별개 트랜스포트) · `src/mcp-server.ts`(MCP 도구는 이번 범위 밖 —
  Open questions).

## 단계 (task 분해 가능, TDD 순서)

1. **cross-review 순수부** — 스키마 상수, verdict 정규화(blocking→block), zod shape 검증,
   `renderCrossReview`, 파싱 실패/빈 출력 폴백. codex 무의존 단위 테스트. (AC-2·AC-5·AC-6)
2. **cross-review-cli + codex 스텁 통합** — stdin→exec→`-o` 파싱. codex 바이너리를 **스텁 스크립트**
   로 재지정(스키마 준수 JSON을 out 파일에 쓰는 tiny bash)해 결정적 검증. 전제 폴백(off·미설치·
   프로필 부재)·타임아웃·항상 exit 0. (AC-1의 codex 절반·AC-3·AC-4·AC-7·AC-8)
3. **skills.ts** — `skillsDir()`, seed(부재/갱신/미관리 보존), deploy(verbatim·skip-unmanaged·prune·
   대상 미설치 skip). 임시 폴더 통합 테스트(deploy.test.ts 패턴). (AC-9·AC-10·AC-11)
4. **skills-deploy CLI + package/Makefile 배선** — bin·scripts·make 타깃.
5. **SKILL.md 정본 작성** — 3단계 오케스트레이션(managed 마커 포함). templates 시드 경로 검증.
6. **brain.ts skills/ 색인 제외** — 제외 테스트(skills/ 하위 .md가 검색에 안 뜸). (AC-13)
7. **문서** — agents.md·reference.md·README.
8. **도그푸드** — 아래 체크리스트 → 결과를 이 plan에 기록.

## 테스트 전략

- **단위**(codex/실LLM 무의존): 스키마 shape 검증, verdict 정규화, 병합 렌더, 파싱 관대/실패 폴백,
  `skillsDir()`/`sk{ills}` 마커 판정.
- **통합(codex 바이너리 스텁, 결정적)**: cross-review-cli를 자식 프로세스로 실행하고 `config.codexBin`
  을 스텁 스크립트로 재지정 — 정상 출력 파싱, off·미설치·프로필 미배포·스키마 불준수·타임아웃 각
  폴백, exit 0 보장. skills 배포는 임시 `<data>`·`<claude-skills>` 디렉토리로 created/unchanged/
  skipped-unmanaged/pruned 전이 검증(deploy.test.ts 미러).
- **통합(실 codex, 게이트)**: `LOCALMIND_INTEGRATION=1`에서 `codex exec -p critic --output-schema`
  end-to-end 1건(스키마 준수 실측).
- **도그푸드**: 단계 8 체크리스트.

## 도그푸드 체크리스트 (단계 8)

- [ ] `make skills-deploy` → `~/.claude/skills/sdd-self-review/SKILL.md` 생성 · 재실행 unchanged ·
      정본 삭제 후 prune · 사용자 직접 생성 스킬 불가침 · 정본 편집 후 재배포 반영.
- [ ] 실제 `/goal {NNN}` self-review에서 스킬 발화 → ① Claude 크리틱 서브에이전트 리뷰 ②
      `localmind-review` 실행(실 codex gpt-5.5 **high** 확인 — 프로필 강도가 사는지) ③ 병합 보고.
- [ ] codex 미설치/critic 프로필 미배포 환경 → 비차단 생략 + 사유 표시(흐름 안 막힘).
- [ ] `SDD_CROSS_REVIEW=off` → codex 단계만 생략, Claude 크리틱 리뷰(1단계)는 유지.
- [ ] blocking 발견 시 `/goal` 5단계 수정→재검 루프로 인계되는지(도구는 보고까지만).
- [ ] 실측: codex 1회 프롬프트 토큰·소요시간(017 실측 ~12k 토큰 참고) → `SDD_CROSS_REVIEW_TIMEOUT_MS`
      기본값 확정(초안 180000).
- [ ] speckit 기존 스킬과 발화·표면 비충돌.
- [ ] **AC-1 나머지 절반**: 실 `/goal` self-review에서 Claude 크리틱 + codex 스크립트가 둘 다
      발화하고 병합 보고에 두 백엔드가 표기되는지(스킬 지침은 강제력이 없어 자동 테스트 불가 —
      여기서만 검증).
- [ ] **AC-12**: `make backup` 후 백업 저장소에 `skills/` 정본 포함 확인 → 임시 폴더에 복원 후
      `make skills-deploy`로 동일 스킬 재현.

## 도그푸드 실측 기록 (2026-07-03, 1차 — 구현 중)

- **018이 018을 교차 검증**: 구현 직후 `localmind-review`에 018 spec AC + cross-review.ts를
  파이프 → 실 codex(gpt-5.5 high)가 **226초** 걸려 판정 `block` — ① spec "문자열 태그" ↔
  구현 `category` enum 불일치(→ 구현 채택, spec 정정), ② 레지스트리에서 critic 삭제 후
  스테일 프로필로 몰래 실행되는 구멍(→ 레지스트리 확인 추가 + 회귀 테스트) 발견.
  **교차 검증이 첫 실전에서 진짜 결함 2건을 잡음.**
- 대형 diff 프롬프트는 280s에도 시간 초과 → 기본 타임아웃 180s→**300s** 상향, SKILL에
  "관련 diff만 조립" 지침 추가.
- `make skills-deploy` 실배포: 시드→배포→멱등 재실행 확인, 배포 스킬이 Claude Code 세션에
  실제 로드됨(sdd-self-review 노출). 백업 스코프: vault git에 `skills/` 미추적 확인(다음
  backup에 자동 편입).
- 비차단 계약 실증: 시간 초과 시 `{"status":"skipped","skipReason":"시간 초과"}` + exit 0.

## 도그푸드 실측 기록 (2026-07-03, 2차 — self-review 단계, AC-1 병합 절반)

**018의 self-review를 018의 SKILL 절차 그대로 수행**했다(자기 적용):

- ① Claude 크리틱 서브에이전트 적대 리뷰 → 중대 1건(비숫자 timeout env → NaN →
  spawnSync RangeError 크래시, FR-7 위반) **재현 실증** + 경미 2건 발견 → 수정(파싱
  가드 + 전체 try/catch 흡수 + 회귀 테스트 3건) → 재검 **완료 가능**(쓰기 불가 TMPDIR
  임의 throw까지 skip 흡수 확인).
- ② codex 교차: 1차(구현 중)는 226초에 `block` 판정으로 결함 2건 적중, 2차(재검)는
  300초 시간 초과로 **생략 — 사유를 숨기지 않고 보고에 명시**(스킬 규칙 "재시도·우회
  금지" 준수). codex high의 소요시간 분산이 큼(226s~300s+) — 상한 300s 유지, 필요 시
  env로 연장.
- ③ 병합 보고: 두 계열의 발견을 하나로 — AC-1의 "둘 다 발화·병합" 절반이 이 실행으로
  검증됨. **교차 상태 명시**: 1차 claude+codex 성립, 2차 재검은 claude 단독(codex 생략).
- AC-12 **종결**(2026-07-03 21:01 실환경): 사용자가 `make backup` 실행 → 백업 저장소
  커밋(db846c4)에 `skills/sdd-self-review/SKILL.md` + `agents/`(8개) + `reports/` 편입
  확인. 새 기기 재현 경로 = recover → agents-deploy + skills-deploy.

## Open questions

- **스킬→스크립트 호출 핸들**: bin `localmind-review`의 PATH 가용성(전역 설치/`npx`) vs 절대경로
  주입 — 도그푸드로 확정. 스킬은 다른 프로젝트(init-sdd 이식처)에서도 도므로 전역 핸들이 필요.
- **리뷰 프롬프트 조립 소유**: Claude가 stdin으로 AC+diff 조립(권장 — 이미 컨텍스트 보유) vs
  스크립트가 `NNN`+`git diff` 자체 조립. 권장안으로 시작, diff 범위(working tree vs HEAD vs staged)는
  도그푸드에서 조정.
- **타임아웃 기본값**: 180s 제안(codex high는 게이트웨이 verify 60s보다 무겁다) — 실측 후 확정.
- **skills-deploy를 agents-deploy에 통합할지**: 사용자 명령 수 최소화 vs 관심사 분리. 별도 유지로
  시작, setup.sh에서 둘 다 부르는 것으로 편의 보완 검토.
- **deploy_skills / cross-review MCP 도구**: 이번 범위는 CLI(make·bin)만. MCP 표면화는 효용 확인 후
  후속.
