# Plan: Persona Runtime Delegation

상위: [goal](goal.md) · [spec](spec.md)

> 2026-07-03 페르소나 리뷰 반영: 아키텍트(순환 불변식·query-report 재구조화·로깅 이동·
> 타입 단일화), 크리틱(교차 퇴화 차단·로그 단일 레코드·mcp-server 정정), 인터뷰어
> (부재 무음·표시 정책·비용 상한).

## 접근 요약

016 레지스트리를 그대로 소비하는 얇은 런타임 유틸(`src/agents/runtime.ts`)을 하나 두고,
brain의 세 지점(askBrain 합성·검증, capture 태깅)이 그것을 호출한다. 모든 위임 호출은
기존 게이트웨이 `/v1/chat/completions` 경유 — 크리틱의 codex 모델명을 넘기면 Router가
codex CLI로 라우팅해 교차 백엔드 검증이 된다. LLM 의존 로직은 순수 함수(프롬프트 조립·
판정 파싱·경고 부착)로 분리하고, 통합 테스트는 **스텁 게이트웨이**로 결정적으로
검증한다 — brain.test.ts의 기존 패턴(child process + `http.createServer` +
`LOCALMIND_URL` 재지정, `runQueryLogProbe`)을 그대로 계승한다(새 인프라 금지).

## 도메인 경계 (DDD) · 불변식

- **agents 컨텍스트**(016)가 "페르소나 해석·호출"까지 소유 확장: `runtime.ts`
  (resolvePersona · personaChat). second-brain(brain.ts)은 "언제 누구를 부르는가"만 안다.
- **불변식(순환 방지)**: `runtime.ts`는 **brain.ts를 import하지 않는다.** 게이트웨이
  설정(`LOCALMIND_URL`·`LOCALMIND_API_KEY`)은 runtime이 **자체적으로 env에서 읽는다**
  (brain.ts의 private 상수를 꺼내오려고 import하면 brain→runtime→brain 순환이 생긴다 —
  상수 2개 중복이 순환보다 싸다).
- 유비쿼터스 언어: **위임(delegation)** — 페르소나의 지침·모델로 게이트웨이 호출을
  대신 시키는 것. **판정(verdict)** — 크리틱 검증의 구조화 결과(`{ok, issues[]}`).
  **개입 표시** — 응답에 붙는 문제·생략·태그 알림(정상은 무음).

## 핵심 설계

### 페르소나 해석·호출 (`src/agents/runtime.ts`, FR-1)

```ts
resolvePersona(name): Persona | null       // 매 호출 loadRegistry() — 핫리로드, 부재·문제 시 null
personaChat(persona, opts): Promise<string | null>
// opts: { user, systemPrefix?, prefer?: "codex"|"claude", effortOverride?, timeoutMs }
// - 모델 선택: prefer 대상 우선 → 다른 대상. 반환값에 사용 대상(backend)을 포함해
//   호출부가 교차 여부를 판단할 수 있게 한다
// - effortOverride: 자동 검증의 강등(medium)용 — 페르소나 정의를 덮는다(FR-4)
// - AbortSignal.timeout — 초과·실패 시 null (호출부가 생략 처리)
// - systemPrefix가 페르소나 본문 앞 — 런타임 강제 규칙이 항상 이긴다
```

### 지점별 배선

| 지점 | 위치 | 동작 | 끄기(env) | 상한 |
|---|---|---|---|---|
| 사서 합성 | `brain.ts askBrain()` | librarian 있으면 model=사서 모델(claude 대상 우선, 없으면 codex), system=강제 규칙+사서 본문. 없으면 기존 경로·**무음** | `BRAIN_LIBRARIAN=off` | 없음(본기능) |
| 크리틱 검증 | askBrain 합성 성공 직후 | 아래 "검증 파이프라인" | `BRAIN_VERIFY=off` | `BRAIN_VERIFY_TIMEOUT_MS`(60000) · `BRAIN_VERIFY_DAILY_LIMIT`(50) · effort는 자연 강등(FR-4① — 게이트웨이가 effort를 전달하지 않음) |
| 큐레이터 태깅 | `brain.ts capture()` | 태그 어휘+본문 → 태그 제안(어휘 비면 "보수적으로 2개 이하" 지시) → frontmatter `tags` 기록 → 응답에 태그 표시. 부재 시 무음 | `BRAIN_CAPTURE_TAGS=off` | `BRAIN_TAG_TIMEOUT_MS`(30000) |
| 분석가 리포트 | `scripts/brain-report.ts` | 집계(공유 모듈) + analyst 해석 → 리포트 노트. analyst 부재 시 집계만 | (실행형) | 없음 |

### 검증 파이프라인 (FR-3·4, AC-3~8)

1. **전제 확인**: 합성 실패·무히트면 검증하지 않는다. `critic` 부재면 **무음** 생략.
2. **교차 판정**: 합성에 쓴 백엔드(claude/codex)와 **다른 백엔드**의 크리틱 대상을
   고른다. 없으면 검증하지 않고 `ℹ 검증 생략(교차 모델 없음)` 표시 — 동종 검증으로
   위장 금지(크리틱 리뷰 중대-1).
3. **일일 상한**: 오늘 자 쿼리 로그에서 `verify` 필드가 있는 레코드 수를 세어(별도
   상태 파일 없이 로그가 곧 카운터) 상한 도달 시 `ℹ 검증 생략(일일 상한)` 표시.
4. **호출**: effort는 전송하지 않는다 — 게이트웨이 경유는 codex CLI 기본 강도(자연
   강등, FR-4①; 크리틱 재검에서 "미전송 필드로 위장 금지" 확정). 프롬프트는 "답변의
   **구체적 사실 주장·수치·날짜·인용**이 출처 청크와 일치하는지만 검사하라. 일반
   서술·종합·연결은 검사 대상이 아니다"를 강제 prefix로.
5. **판정 파싱**: 응답에서 JSON `{ok, issues[]}`을 관대하게 추출(코드펜스·전후 텍스트
   허용). 파싱 실패 = 생략 처리(답변을 볼모로 잡지 않음).
6. **표시**: 경고 시 답변 뒤 구분선 + `⚠ 검증(critic): …항목… — 교차 모델의 추정이며
   최종 판단은 사용자 몫. (거슬리면 BRAIN_VERIFY=off)`. **통과는 무음**(로그만).
7. **로그**: `logAsk`를 **검증 완료 후로 이동**해 단일 레코드에 `verify:
   "pass"|"warn"|"skipped"`를 싣는다(AC-15). 같은 레코드에 **합성에 쓴 모델과 사서
   개입 여부**(`model`, `persona`)도 기록한다 — 응답은 무음이어도 로그로 감사 가능
   (크리틱 재검 경미-2: goal의 관측 제약 충족). env로 끈 지점은 verify 필드 자체가
   없고, 런타임 생략은 `skipped`다(AC-14/15 구분). 합성 HTTP 실패·무히트 조기 반환
   경로에서도 각각 한 번 기록되도록 재배선한다(이중 기록·누락 금지 — 크리틱 리뷰
   중대-2, 아키텍트 C). 일일 상한 카운트는 비동기 append 특성상 ±1 오차를 허용한다
   (단일 사용자·저위험 — 크리틱 재검 경미-3 수용).

### 태깅·어휘 (FR-5, AC-9~11)

- 태그 어휘: 최근 수정 노트 frontmatter `tags` 스캔(상한 200개 파일), **프로세스 내
  TTL 캐시(5분)** — 매 capture 전수 스캔 방지(아키텍트 E). 스캔 실패·빈 어휘 모두
  정상 진행.
- 기록 순서: 노트 파일 생성(기존 `createNoteFile`, 배타적 생성) → 태그 제안 →
  frontmatter에 `tags` 삽입 재기록 → 색인은 최종본으로 1회. 태깅은 capture 시 1회뿐 —
  재색인은 파일을 수정하지 않으므로 수동 편집 태그가 보존된다(AC-11).

### 리포트 (FR-6·7, AC-12·13)

- 파일: 첫 노트 폴더 `reports/query-report-<ISO주>.md` — 주 표기는 **ISO 8601
  week-year**(`%G-W%V`; 연말·연초 경계 오류 방지, 크리틱 리뷰 경미-3). 같은 주 재실행은
  같은 파일 갱신.
- 집계 창: **최근 7일**의 로그(전체 누적이 아님 — 매주 리포트가 달라지게). 표본 10건
  미만이면 "데이터 부족" 본문.
- frontmatter `type: report` — 구분용 표식(색인은 됨 — recall 노출은 사용자 결정).
- `make report`(실행)·`make report-cron`(주 1회 등록 안내, backup-cron.sh 패턴).

## 영향 모듈

- **신규** `src/agents/runtime.ts` (+ `runtime.test.ts`) — 해석·호출·타임아웃·대상 선택.
- **신규** `src/query-analysis.ts` — **집계·분석 순수 모듈**: 로그 read → 결과 객체
  (`{successRate, topFailures, gapWords, suggestions, sampleCount, verifyStats}`) +
  `QueryLogRecord` 타입의 **단일 export**(현재 brain.ts와 query-report.ts에 중복 정의된
  것을 통합 — 아키텍트 B·D). ※ `scripts/query-report.ts`는 top-level 실행 스크립트라
  지금 그대로는 import 불가 — 계산부를 이 모듈로 옮기고 CLI는 렌더만 남긴다.
  **집계 창·최소 표본은 파라미터**(`{days, minSamples}`)다 — CLI는 기존값(30일/20건)을
  유지해 출력 회귀가 없어야 하고, 리포트 노트는 7일/10건을 쓴다(크리틱 재검 경미-1:
  하드코딩하면 둘 중 하나가 깨진다).
- **수정** `scripts/query-report.ts` — 얇은 CLI 렌더 진입점으로 전환(출력 동일 유지).
- **신규** `scripts/brain-report.ts` — 같은 순수 모듈 + analyst 해석 → 노트 markdown 렌더.
- **수정** `src/brain.ts` — askBrain(사서 합성·검증 파이프라인·logAsk 이동), capture
  (태깅·`CaptureResult`에 `tags` 필드 추가), logQuery verify 필드.
- **수정** `src/mcp-server.ts` — **ask_brain 경로는 무변경**(경고 블록을 answer 문자열에
  임베드). **capture 경로는 변경 필요**: `CaptureResult.tags` 렌더 추가(크리틱 리뷰
  중대-3 — "전체 무변경"은 성립하지 않음을 명시).
- **수정** `Makefile` — `report`·`report-cron` 타깃. **신규** `scripts/report-cron.sh`.
- **수정** `docs/agents.md`(런타임 위임 절 — 고정 slug·끄는 법·태그 수정법·리포트
  백업 주의)·`docs/reference.md`(env 6종) ·README 한 줄.

## 단계 (task 분해 가능)

1. **runtime.ts TDD** — resolvePersona 핫리로드·무음 폴백(AC-2 단위), personaChat 대상
   선택·backend 반환(AC-6·7 단위)·effortOverride·타임아웃·실패 null(AC-5 단위).
   스텁 게이트웨이 헬퍼는 brain.test.ts 기존 패턴 재사용.
2. **query-analysis.ts 추출** — 집계 순수 모듈 + QueryLogRecord 단일화 + query-report.ts
   얇은 렌더 전환(기존 출력 회귀 테스트). ※ 3단계의 verify 통계·5단계의 노트 렌더가
   모두 이 모듈에 의존하므로 검증(3)보다 먼저.
3. **사서 합성** — askBrain 배선 + 강제 규칙 prefix + `BRAIN_LIBRARIAN=off` + 부재 무음.
   (AC-1·2·14)
4. **크리틱 검증** — 위 파이프라인 1~7(logAsk 이동 포함: 합성 실패·무히트 경로 각 1회
   기록 보장). (AC-3~8·14·15)
5. **큐레이터 태깅** — 어휘 수집+캐시, capture 배선, CaptureResult.tags + mcp-server
   렌더, 수동 태그 보존. (AC-9·10·11·14)
6. **분석가 리포트** — brain-report.ts + `make report` + 데이터 부족·analyst 부재 분기.
   (AC-12·13)
7. **report-cron** — 주기 등록 안내 스크립트. (FR-7)
8. **문서** — agents.md·reference.md·README. (FR-10)
9. **도그푸드** — 실 vault·실 LLM 체크리스트: ① 사서 모델 변경이 다음 호출에 반영,
   ② **게이트웨이가 크리틱의 codex 모델명을 codex 백엔드로 라우팅하는지**(코드 밖 가정 —
   아키텍트 지적; 안 되면 AC-5 생략 경로로 흡수되는지 함께 확인), ③ 출처 밖 수치를
   유도한 질문에 경고가 붙는지, ④ 통과 시 무음인지, ⑤ 캡처 태그·수동 수정 보존,
   ⑥ 리포트 생성·recall 회수, ⑦ 상한값(60s/30s/50회) 체감 적정성 → 이 plan에 결과 기록.

## 테스트 전략

- **단위**: 판정 JSON 파싱(깨진 응답 포함), 경고 블록 포맷, 교차 백엔드 판정, 일일
  상한 카운트(로그 기반), 태그 frontmatter 삽입·보존, 어휘 수집·캐시, resolvePersona
  폴백, query-analysis 집계.
- **통합(스텁 게이트웨이, 결정적)**: AC-1(요청 body의 모델·프롬프트 검사), AC-2(마커
  전무), AC-3/4(스텁이 warn/pass 판정 반환), AC-5(스텁 지연·5xx), AC-6/7(요청 모델명·
  생략 표시), AC-8(로그 시딩 후 상한), AC-9/10/11(태깅), AC-14(env off), AC-15(레코드
  수·verify 필드). 자식 프로세스 + 임시 NOTES_DIR 패턴 재사용.
- **통합(LOCALMIND_INTEGRATION=1, 실 LLM)**: 사서 합성·크리틱 검증 end-to-end 각 1건.
- **수동 도그푸드**: 단계 9 체크리스트.

## 도그푸드 실측 결과 (2026-07-03, 단계 9)

- ① **핫리로드**: librarian 모델을 sonnet→opus로 수정 후 즉시 ask_brain — 재시작 없이
  로그에 `model: opus, persona: librarian` 기록. 답변 스타일도 페르소나 지침(회수 실패
  인정·시도한 검색어 보고·"서가" 용어)을 실제로 따름.
- ② **codex 라우팅 가정 해소**: 게이트웨이 `/v1/chat/completions`에 `gpt-5.5` 요청 →
  codex CLI가 응답(정상 라우팅). 크리틱 교차 검증이 실 환경에서 end-to-end 동작 —
  `verify: "pass"` 기록 확인.
- ③④ 경고 경로는 스텁 게이트웨이 테스트로 결정적 검증(실 LLM으로는 통과 무음 확인).
- ⑤ **태깅**: 실 캡처에서 curator(haiku)가 `["도그푸드","테스트"]` 부여·frontmatter 기록·
  인덱싱 확인(임시 노트는 휴지통 처리).
- ⑥ **리포트**: `make report`가 analyst 해석(표본 부족 명시·수치 근거·가설) 포함 노트
  생성, 직후 검색에서 1위로 회수. `make report`에 게이트웨이 키 전달 추가(reindex 패턴).
- ⑦ **상한 체감**: 검증(effort는 codex 기본값 — 프로필 high는 `codex exec -p` 전용이라
  게이트웨이 경유 자동 검증은 자연히 강등됨)이 답변에 수십 초를 더함 — 기본값
  60s/30s/50회 유지. 참고: codex 경유 1회 프롬프트 토큰 ~12k.

## Open questions

- ~~상한 기본값~~ → 도그푸드 실측 후 초기값(검증 60s·태깅 30s·일일 50회·캐시 TTL 5분)
  유지로 확정. 장기 사용에서 불편하면 env로 조정.
- capture 동기 태깅 지연이 크면 "비동기 태깅(다음 색인 때 부여)" 전환을 후속 스펙으로.
