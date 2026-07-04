# Plan: 디자인 툴·검증 연동 (how)

goal: [goal.md](goal.md) · spec: [spec.md](spec.md)

## 접근 요약

새 메커니즘·새 코드를 만들지 않는다. 026이 세운 디자인 lane 위에 **문서·페르소나 본문**
으로 도구·검증 layer를 얹는다. 외부 도구(Figma·Playwright)는 **안내만** 하고 localmind가
설치·등록·번들하지 않는다 — 010 공급망 핀 고정 원칙과 opt-in 성격 때문(아래 판단 근거).
"검증이 실제로 동작한다"는 코드 게이트가 아니라 **문서 정확성 + 페르소나 규율**로 성립
하며, AC는 grep·파싱으로만 결정적으로 판정한다(라이브 동작은 정직한 미검증 한계).

## 단계 0 — 의존 게이트 (착수 전 필수)

026이 머지돼 `templates/agents/ux-reviewer.md`·`templates/sdd/design.template.md`가
존재하는지 확인하고, **026이 실제로 시드한 `targets.claude.tools` 값을 읽어 AC-2 비교
기준(baseline)으로 기록**한다(리뷰 결함 7 — 리터럴 하드코딩 대신 실측 대조. 주의:
baseline은 **편집 전 시점에 고정한 외부 앵커**여야 한다 — 같은 파일을 다시 읽어
비교하면 항상 참인 tautology가 된다). 없으면 **중단하고 사용자에게 026 선행을 알린다**(문서 없이 편집
금지 — AGENTS.md 규약 6의 의존판). 026 미머지 상태에서 027 파일 참조는 전부 무효.

## 핵심 판단 — 설치 vs 안내 (Playwright/Figma MCP)

**결정: 안내만. localmind는 외부 디자인 MCP를 설치·등록·번들하지 않는다.**

근거:
1. **공급망(010 원칙)** — `npx @playwright/mcp`(미고정)·커뮤니티 Figma(T4)를 자동설치하면
   localmind가 미고정·미보증 업스트림을 보증하게 된다. 010이 `latest` 태그 0건까지 요구한
   저장소에서 자동설치는 원칙 위반. Figma 공식(T1)조차 OAuth·유료 계정 의존이라 대행 부적합.
2. **opt-in·전제조건** — Playwright는 실행 중 UI, Figma 실무는 유료 seat가 전제. 기본
   설치는 이 전제 없는 사용자에게 스코프 크리프.
3. **선례** — localmind는 자기 MCP 서버조차 **침묵 자동등록이 아니라 명시적
   `make mcp-install` opt-in 호출로만** 등록한다(scripts/mcp-install.sh — 설치 과정에 끼워
   넣지 않음). 3rd-party는 더더욱 안내에 그친다(리뷰 결함 6 정정: mcp-install은 등록을
   수행하지만 사용자가 명시 호출할 때만).
4. **비용 대비** — 대행하면 probe·버전 핀·에러·uninstall 표면이 생기는데, opt-in·환경의존
   도구엔 과한 유지비. → docs 1줄 안내로 충분.

기각한 대안: (a) 번들·자동설치 → 위 1~4로 기각. (b) 안내형 헬퍼 make 타깃(mcp-install
대칭) → 지금은 과함, 디자인 검증 빈도가 오르면 Open question 1로 승격. **채택: docs 안내 +
버전 핀 권장 문구.**

## 도메인 경계

- **콘텐츠(templates/·docs/)**: 페르소나 본문·설치 안내·템플릿 섹션 — 코드 아님. 027 산출의
  대부분.
- **레지스트리 도메인(src/agents/)**: **불변.** 파싱·검증·렌더·배포·시드(026 seedAgents)를
  건드리지 않는다. ux-reviewer 프론트매터도 불변(도구 최소성) — 본문만 편집.
- **불변(026 소유)**: designer·ux-reviewer의 소유/비소유 lane 경계, design.md 정본 위계,
  personas.md SSoT 구성, AGENTS.md 디자인 게이트 절. 027은 layer만 얹고 재정의하지 않는다.

## 영향 모듈

| 파일 | 변경 | 내용 |
|---|---|---|
| `templates/agents/ux-reviewer.md`(026 생성) | 수정(본문만) | FR-1 검증 도구 체인 절 — 계층 0(산출물 전무 한계 명시)/계층 1(제공 스크린샷 대조)/계층 2 opt-in 전제·구동 주체/design.md 불일치=결함. **프론트매터 불변**(AC-2) |
| `docs/agents.md` | 수정 | FR-2·3 "디자인 검증 도구 연동 (opt-in)" 절 — 정본 위계·드리프트 규칙, Figma(월 6회 경고·OAuth 연결), Playwright(실행 UI 전제·연결 명령·비대행 근거), 커뮤니티 서버 경고 |
| `templates/sdd/design.template.md`(026 생성) | 수정 | FR-4 tokens.json(DTCG) 이행 선택 섹션 — Style Dictionary 1줄, CI 강제 아님 |
| 노트 폴더 `agents/ux-reviewer.md`(정본 — 이 기기) | 수정 | FR-1 본문을 templates와 동일하게 직접 1회 반영(시드는 기존 정본 안 덮음 — 026 seedAgents fill-missing 특성, 백업으로 기기 동기화). 신규 사용자는 templates 시드로 자동 전파 |
| `scripts/*.test.sh`(기존 배선 테스트) | 수정 | AC-1·3·4·5·6 grep, AC-5 자동설치-부재 회귀 grep. 어느 셸 테스트에 얹을지 구현 시 판단 — 신규 파일 지양 |
| `src/agents/*.test.ts`(026 registry/deploy 테스트) | 수정(선택) | AC-2 파싱 회귀 — 기존 케이스에 ux-reviewer 편집 후 problems 0 재확인 |

**personas.md·AGENTS.md는 원칙적으로 불변**(026 소유). ux-reviewer에 opt-in 검증 도구가
생겼다는 한 줄 교차링크가 필요하면 personas.md 무대 지도에 각주로만 — 구현 시 판단
(SSoT 재구성은 026 몫, 027은 최소 개입).

## 콘텐츠 설계 (구현 시 이 골격대로)

**ux-reviewer.md 본문 추가 절 골격:**
- `## 검증 도구 체인` → 계층 0(산출물 전무 — design.md 정적 리뷰 + "실제 구현 미검증"
  한계 명시) / 계층 1(제공된 스크린샷 Read → design.md 토큰·상태·접근성 대조 — 외부
  설치·실행 UI 불필요) / 계층 2(Playwright MCP·Claude in Chrome, 전제: 실행 중 로컬 UI +
  구동 주체: 메인 세션/명시 부여 — 서브에이전트 tools 밖) / 판정(design.md 불일치 = 결함,
  design.md가 기준).

**docs/agents.md 추가 절 골격:**
- `## N. 디자인 검증 도구 연동 (opt-in)`
  - 정본 위계 규칙(맨 앞): design.md 정본 / Figma·tokens.json 소비자 / 드리프트 시
    design.md 승리.
  - Figma: [경고 첫 줄 — 무료 월 6회 실무 불가] / 연결 명령 / `get_variable_defs`로
    design.md 들여오기(수동 1회) / 커뮤니티 서버 T4 경고.
  - Playwright·Claude in Chrome: [전제 첫 줄 — 실행 UI 필요] / 연결 1줄(버전 핀 권장) /
    비대행 근거(opt-in·공급망).

**design.template.md 추가 섹션 골격:**
- `## 토큰이 커지면: W3C DTCG tokens.json (선택)` — 언제 / 표준(2025.10) / Style Dictionary
  변환 1줄 / "CI 강제 아님, design.md 정본 불변".

## 단계 (TDD)

0. **의존 게이트** — 026 머지·대상 파일 존재 확인(단계 0 위).
1. **실패 테스트** — AC-1(ux-reviewer 본문 grep), AC-2(파싱 회귀), AC-3·4(docs Figma·
   위계 grep), AC-5(전제·비대행 grep + 자동설치 부재 회귀 grep), AC-6(template grep),
   AC-7(위생 grep).
2. **콘텐츠** — ux-reviewer 본문 절 + docs/agents.md 연동 절 + design.template.md 섹션
   작성. **오픈소스 위생 전수 검토**(개인 절대경로·특정 개인 지칭 제거 — AC-7, 026 N4 자세).
3. **정본 동기화** — 노트 폴더 `agents/ux-reviewer.md`에 본문 절 직접 1회 반영(기기 정본).
4. **회귀** — 026 registry/deploy 테스트 + 전체 스위트 green(파싱·시드·멱등 불변 확인).
5. **self-review** — 독립 크리틱 + codex 교차(018 스킬), clean까지. 검증 관점: ① 전제조건·
   비용 정직성이 실제 문구로 있는가, ② 정본 드리프트 규칙이 명확한가, ③ 자동설치 금지가
   코드·문서로 지켜지는가, ④ ux-reviewer 도구 최소성(프론트매터) 불변, ⑤ 026 소유 경계
   침범 없음.

## 테스트 전략

- **문서 grep**: 페르소나 본문·docs·template 문자열 검사(빠르고 결정적). 기존 셸 배선
  테스트에 케이스 추가(신규 파일 지양).
- **파싱 회귀**: loadRegistry로 ux-reviewer.md problems 0 재확인 — 본문 편집이 프론트매터·
  파싱을 깨지 않음을 고정(026 하니스 재사용).
- **자동설치 부재 회귀(AC-5)**: `Makefile` 타깃·`scripts/` 비테스트 스크립트(`*.test.sh`
  제외)에 Playwright/Figma `claude mcp add` 코드가 **없음**을 grep으로 고정. **자기충돌
  방지**: positive 테스트의 어서션 문자열은 회귀 패턴과 겹치지 않게(`mcp.figma.com`·
  `@playwright/mcp` 하위문자열 사용 — 리뷰 결함 4).
- **정직한 미검증 한계(AC-7)**: 라이브 외부 도구 동작(OAuth·실행 UI·실제 대조)은 계정·
  네트워크·환경 의존이라 CI 검증 불가 — spec에 한계로 명시(026 "라우팅 실동작 미검증"
  자세 계승, 거짓 기계검증 인상 방지).

## 모델 역할 배치

- 페르소나 본문·정본 위계 규약·안내 문구: **최상위 티어**(🔖 — 검증 규율·정본 위계는
  이후 모든 디자인 검증 품질을 결정. 특히 드리프트 판정·공급망 판단은 파장 큰 추론).
- grep 테스트 작성·배선: 루틴 구현 티어(Sonnet — 명확한 통과 기준).
- 위생 전수 검토(개인정보 제거): 저위험 기계 작업으로 시작하되, "특정 개인 지칭"의 의미
  판정은 사람 검토로(grep 불가 — AC-7).
