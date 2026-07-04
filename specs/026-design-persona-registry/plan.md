# Plan: 디자인·UI/UX 페르소나 확장 (how)

goal: [goal.md](goal.md) · spec: [spec.md](spec.md)

## 접근 요약

새 메커니즘을 만들지 않는다 — 016 레지스트리(파싱·검증·렌더·배포)와 018 스킬 시드
관례(templates → 데이터 폴더, 기존 보호)를 그대로 재사용하고, 콘텐츠(페르소나 정본 2 +
design.md 템플릿 + AGENTS.md 절 + personas.md 갱신)와 시드 한 단계만 추가한다.
"정의 없이 구현 금지"는 코드 게이트가 아니라 **문서 규약 + 페르소나 preamble**로
강제한다(SDD 규약 6과 같은 방식 — 사람이 아니라 에이전트가 읽고 따르는 규칙).

## 도메인 경계

- **레지스트리 도메인(src/agents/)**: 시드 로직 추가(deploy 진입점) — 파싱·검증·렌더는
  불변. 스킬 시드(skills.ts의 `seedSkills` — 실제 함수명, 리뷰 N2)의 fill-missing 부분만 채택해 대칭 구현(update-managed 분기는 채택 안 함 — 리뷰 N3).
- **콘텐츠(templates/·docs/·AGENTS.md)**: 페르소나 정의·템플릿·규약 — 코드 아님.
- **불변**: 017 런타임 위임(새 페르소나 자동 개입 없음), 016 렌더러·타깃. 기존 8종 정본은 불변이되 worker만 FR-4 게이트 1줄 추가(리뷰 N5 정정).

## 영향 모듈

| 파일 | 변경 | 내용 |
|---|---|---|
| `templates/agents/designer.md` | 신규 | FR-1 정본 — **016 정본 스키마(중첩 targets: 블록, sample-persona.md 형식)** + 소유/비소유/원칙/출력형식 |
| `templates/agents/ux-reviewer.md` | 신규 | FR-2 정본(동일 스키마) |
| `templates/agents/{architect,critic,interviewer,researcher,worker,librarian,analyst,curator}.md` | 신규 | FR-5 — 기존 8종 정본을 templates로 동봉(신규 사용자 시드용, F3). worker에는 FR-4 게이트 문구 포함 |
| `templates/sdd/design.template.md` | 신규 | FR-3 사전 정의 템플릿(패턴·토큰·컴포넌트·프롬프트 4절) |
| `src/agents/seed.ts`(신규 — 또는 skills.ts 대칭 위치) | 신규 | FR-5 `seedAgents()`: templates/agents → 노트 폴더 agents/, 없는 파일만(prune 없음, 기존 보호). **deployAgents()·MCP deploy_agents는 시드하지 않음** — skills 관례(seedSkills→deploySkills 스크립트 2단계) 대칭(F8) |
| `scripts/agents-deploy.ts`(기존 진입점) | 수정 | seed→deploy 순차 호출(F8 — skills-deploy.ts 대칭) |
| `AGENTS.md` | 수정 | FR-4 "디자인·UI/UX 작업" 절(사전 정의 → 확인 → 실행, design.md 부재 시 알림) |
| 노트 폴더 `agents/worker.md`(정본 — 이 기기) | 수정 | FR-4 게이트 문구를 templates와 동일하게 직접 1회 반영(기존 사용자는 시드가 안 덮으므로 — 백업으로 기기 동기화). 신규 사용자는 templates 시드로 자동 전파(F4 해소) |
| `templates/agents/sample-persona.md` → `templates/sample-persona.md` | 이동 | N1 — agents/ 스캔(시드·AC-1)에서 샘플 제외. docs/agents.md의 cp 경로 갱신 |
| `docs/agents.md` | 수정 | R1 — seed-on-deploy 동작 서술(신규 10종 자동 시드·시드 정본은 편집 가능·재시드 미덮음, 렌더 산출물과 구분) |
| `docs/personas.md` | 수정 | FR-6 SSoT 10종 갱신 + 디자인 무대 지도 + 어휘 배정 |
| `src/agents/deploy.test.ts`(또는 registry.test.ts) | 수정 | AC-1~4 |
| `scripts/reliability-wiring.test.sh` 등 배선 테스트 | 판단 | AC-5 grep(어느 셸 테스트에 얹을지 구현 시 판단 — 신규 파일 지양) |

## 페르소나 설계 (콘텐츠 정본 — 구현 시 이 표 그대로)

| | designer | ux-reviewer |
|---|---|---|
| targets.claude.model | opus (정의 = 축소 불가능한 추론) | opus (검증 다운시프트 금지) |
| targets.claude.tools | Read, Grep, Glob (구현 금지의 도구적 강제) | Read, Grep, Glob, Bash (재현 검증) |
| 소유 | 패턴 선택·토큰 체계·컴포넌트 정의(화면 상태 전이 포함 — 시스템 데이터 흐름은 architect, F5 경계) · 실행 프롬프트 작성 | 사용성·design.md 대비 일관성·상태 가시성 공백·접근성 기본 |
| 비소유(핸드오프) | 구현→worker · 사용성 판정→ux-reviewer · 요구 발굴→interviewer · 최종 게이트→critic | 수정→worker · 시스템 재정의→designer · 최종 판정→critic |
| 내장 원칙 | 직관성·상태 가시성·디버깅 용이성 우선(미학과 충돌 시), design.md 게이트 | "결함을 찾으러 간다" 자세(critic과 동일 규율, 도메인만 디자인) |
| description 어휘 | 디자인 시스템·디자인 토큰·컴포넌트 정의·화면 정의 | UX 리뷰·사용성·접근성·토큰 준수 |

트리거 어휘 금지 목록(AC-2): "self-review"(스킬), "결함 검증·품질 게이트"(critic),
"설계·경계 판단"(architect) — description에 등장 금지. 본문에서는 핸드오프 설명에 한해 허용.

## 단계 (TDD)

1. **실패 테스트** — AC-1(템플릿 파싱 유효성), AC-2(어휘 비충돌 문자열 검사), AC-3·4
   (시드·멱등·보호 — 임시 폴더 fixture), AC-5(grep), AC-6(personas.md 표).
2. **콘텐츠** — 신규 정본 2(016 스키마) + 기존 8종 templates 동봉(worker 게이트 포함,
   **동봉 전 개인화 전수 검토** — 개인 절대경로·특정 개인 지칭 제거, 리뷰 N4/AC-5b) +
   design.md 템플릿 작성 + sample-persona 이전(N1).
3. **시드 구현** — seedAgents 별도 함수 + agents-deploy 스크립트에서 seed→deploy(F8).
4. **규약·SSoT** — AGENTS.md 절, worker 정본 편집, personas.md 갱신.
5. **회귀** — 기존 registry/deploy 테스트 + 전체 스위트 green.
6. **self-review** — 독립 크리틱 + codex 교차(018 스킬), clean까지. 검증 관점: lane
   상호배타(특히 ux-reviewer↔critic 경계 문구), 시드가 기존 정본을 절대 덮지 않는지,
   어휘 충돌.

## 주의점 (직접 검토 + 독립 크리틱 리뷰에서 발견)

- **정본 스키마 오인(F1 — 맹점 실증)**: 초안이 렌더 산출물(~/.claude/agents/*.md의 flat
  frontmatter)을 보고 정본 형식을 적었다 — 정본은 중첩 `targets:` 블록이며 top-level
  model/tools는 loadRegistry가 REJECTED 처리한다. 구현 시 반드시
  templates/agents/sample-persona.md 형식을 따를 것.
- **신규 사용자 부트스트랩(F3)**: seedAgents 도입 전까지 기존 8종은 어떤 신규 사용자에게도
  전파된 적이 없다(개발 기기 데이터에만 존재). 026이 10종 전부를 templates에 동봉해 이
  갭을 함께 해소한다 — 기존 사용자 정본은 절대 덮지 않음.

- **어휘 자기모순 해소됨**: FR-1 초안의 "UI 설계" 어휘가 AC-2 금지어("설계" — architect
  트리거)와 충돌 → "화면 정의"로 교체. 구현 시 description 작성 후 AC-2 문자열 검사를
  먼저 돌려 확인할 것.
- **design.md 살포 방지 — 해소됨**: scaffold_sdd(src/scaffold.ts:56)는 명명 파일
  3종(goal/spec/plan.template.md)만 복사한다(실사). `templates/sdd/design.template.md`를
  나란히 둬도 일반 스펙 스캐폴드에 들어가지 않는다 — 위치 확정.

## 테스트 전략

- 시드·배포: 기존 deploy.test.ts 관례(임시 HOME/폴더 fixture) 재사용 — templates 경로는
  skills.ts처럼 모듈 상대 해석이므로 실제 templates/agents를 읽는 케이스와 임시 정본
  fixture 케이스를 분리.
- 어휘 비충돌(AC-2): 정적 문자열 검사(빠르고 결정적) — 라우팅 실동작은 Claude Code 내부라
  테스트 불가(정직한 한계, 이전 분석과 동일).
- 게이트(AC-5): grep — 게이트의 실효는 규약 준수에 달려 있음을 스펙이 인정(코드 강제 아님).

## 모델 역할 배치

- 페르소나 정본·규약 문구: 최상위 티어(🔖 — 페르소나 정의는 이후 모든 위임의 품질을 결정).
- 시드 코드·테스트: 루틴 구현 티어 가능(스킬 시드 관례 복제).
- SSoT 표 갱신: 저위험 기계 작업.
