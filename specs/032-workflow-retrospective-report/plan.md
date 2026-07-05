# Plan: 워크플로우 회고 리포트 (how)

goal: [goal.md](goal.md) · spec: [spec.md](spec.md)

## 도메인 경계

- **회고 집계(신규 lane)**: 작업 방식 프록시 신호를 순수 함수로 집계. query-analysis(검색
  품질)와 직교 — 004/017이 "결과물 품질"을, 032가 "작업 방식"을 관측. 004의 analyze()는
  **소비만** 하고 재구현하지 않는다.
- **해석**: analyst 페르소나(017 위임). 신규 페르소나·트리거 어휘 없음(028 3조건 — "기존
  lane 흡수 불가" 미충족).
- **안전 게이트**: 회고 lane은 읽기 전용 + reports/ 쓰기만. 규약/페르소나/스펙은 불변
  객체로 취급(자기 개정 금지).
- **실행 배관**: report/report-cron과 분리된 retro/retro-cron(별도 관심사·cadence).

## 영향 모듈 (구체 경로)

신규:
- `src/retro-analysis.ts` — 순수 집계(parseCommits·extractOpenQuestions·collectDecisionNotes·
  inventory + 임계 분류). query-analysis의 analyze()/readRecords 재사용.
- `src/retro-note.ts` — 순수 `renderRetro()`(6섹션 + reports/ 주의 + 게이트 고지). report-note의
  isoWeek 등 재사용 가능분 활용.
- `scripts/retro-report.ts` — 얇은 진입점(git spawn·specs 읽기·노트 폴더 glob·analyst 위임·
  reports/ 쓰기). query-report.ts/brain-report.ts 골격 복제.
- `src/retro-analysis.test.ts` — vitest(파싱·수집·임계 결정적 케이스).
- `scripts/retro-report.test.sh` — 통합(fixture git repo/specs/노트 폴더 + 안전 게이트 단언).
- `scripts/retro-cron.sh` — report-cron.sh 복제(마커 `# localmind-retro`).

편집:
- `src/brain.ts`(capture)·`src/mcp-server.ts`(capture_note 스키마) — 선택적 tags 파라미터
  (리뷰 D2 — 하위호환: 미지정 시 기존 `tags: []` 불변, 큐레이터 빈-태그 채움과 무충돌).
- `Makefile` — `retro`·`retro-cron` 타깃(report/report-cron 블록 인접, 동일 문체).
- `package.json` — `retro-report` npm 스크립트(tsx).
- `AGENTS.md` — 결정 로그 규약에 tags `decision` 식별 관례 + OQ 취소선 해결 표기 관례 보강(FR-2·3).
- `templates/agents/analyst.md` — 소유에 회고 해석 1줄(FR-9). 정본은 사용자 데이터라
  repo는 시드만 편집(016/026).
- `docs/agents.md` — §4 위임 표 analyst 행 + §4 리포트 주의에 retro 포함(재검 R3 정정).
- `docs/personas.md` — analyst 확장 반영(구성 근거 SSoT).

재사용(무편집):
- `src/query-analysis.ts`(analyze·readRecords), `src/agents/runtime.ts`(personaChat·
  resolvePersona), `src/brain.ts`(listFolders — 첫 노트 폴더 reports/ 위치).

## 단계 (의존 순서)

1. **순수 집계 모듈 + vitest**(TDD 먼저) — `src/retro-analysis.ts` + `.test.ts`. OQ 헤딩
   변형·취소선 제외(AC-1/2), 결정 노트 수집(AC-3), commit 파싱·3회 임계(AC-4/5). git·IO
   없이 텍스트/객체 입력만 받는 순수 함수 → 완전 결정적.
2. **렌더 모듈 + vitest** — `src/retro-note.ts` `renderRetro()`. 6섹션·제안 표기·게이트
   고지·reports/ 주의(AC-7/10). 순수.
3. **진입점** — `scripts/retro-report.ts`. git spawn(RETRO_REPO/RETRO_SINCE/RETRO_DAYS),
   specs/*/spec.md 읽기, 노트 폴더 glob, analyze() 호출, analyst 위임, reports/ 쓰기.
   **모든 쓰기를 단일 가드 함수로 라우팅**(reports/ prefix 밖이면 throw — FR-7. "물리
   제한"이 아니라 구조적 규율 + 테스트 단언임을 문서·코드 주석에 명시, 리뷰 D4).
4. **통합 셸 테스트** — `scripts/retro-report.test.sh`. mktemp에 fixture git repo(git init +
   커밋)·fixture specs·fixture 노트 폴더 구성 → analyst 부재 경로(AC-8)·엣지(AC-9)·안전
   게이트 실행 전후 대조(AC-6). query-report.test.sh의 assert(pipefail 누출 방지) 계승.
5. **실행 배관** — Makefile retro/retro-cron + scripts/retro-cron.sh + package.json script.
6. **규약·문서·페르소나 편집** — AGENTS.md(FR-3) · analyst.md 시드(FR-9) · docs 2종.
   loadRegistry 회귀(AC-11)·위생(AC-12) 확인.

## 테스트 전략

- **결정적(vitest + 셸 fixture)**: 1~5단계 전부. OQ 파싱은 마크다운 함정(헤딩 접미·취소선·
  중첩 리스트) 케이스를 vitest로 다중 커버. 안전 게이트는 "실행 후 reports/ 외 파일 mtime·
  내용 불변"을 셸로 단언(FR-7의 이빨).
- **페르소나 규율(CI 미검증 — 정직한 한계)**: analyst 해석 품질·"제안까지" 규율의 실효는
  026~031처럼 페르소나 규율에 의존. 스펙이 이 한계를 인정.
- **회귀**: templates/agents loadRegistry(problems 0·19종·description 불변), 기존 스위트
  green. 위생 grep(절대경로 부재).

## 모델 배치 (AGENTS.md)

- 1~5단계 구현·결정적 테스트 = **sonnet**(통과 기준 명확한 잘 명세된 루틴). OQ 파싱 함정은
  스펙이 촘촘하므로 sonnet 수렴 가능(012 근거) — 단 파싱 엣지 케이스를 spec/AC가 열거함이 전제.
- 6단계 규약 문구(자기 개정 게이트·결정 로그 관례) = 파장 큼 → **opus** 검토 권장.
- 해석 런타임 = analyst(sonnet). 최종 self-review·품질 게이트 = **critic(opus, 다운시프트
  금지)** — 특히 FR-7 안전 게이트가 실제로 reports/ 밖을 못 건드리는지 적대적으로 검증.
