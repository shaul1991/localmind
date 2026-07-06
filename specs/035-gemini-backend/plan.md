# Plan: Gemini 백엔드 (OpenAI 호환 경로)

<!-- 어떻게(how) 만드는가. spec의 FR을 코드 변경으로 매핑한다. 상위: [goal](goal.md) · [spec](spec.md) -->

> **미숙지 영역 — Phase 0 먼저**: Gemini는 우리가 처음 붙이는 제공자이고 Google이 API·정책을
> 자주 바꾼다. 그래서 **Phase 0(조사·스파이크)로 실측 검증**한 뒤 본 구현으로 간다. Phase 0
> 결과는 spec Open questions를 해소·개정하는 입력이다.

## 접근 요약
<!-- 핵심 기술 접근 1~2단락. -->

Gemini는 CLI가 아니라 **HTTP**로 붙인다 — Google의 **OpenAI 호환 엔드포인트**
(`/v1beta/openai/chat/completions`, T1)에 `fetch`로 요청한다. localmind가 이미 OpenAI 포맷을
말하므로, 네이티브 `contents` 매핑 없이 **얇은 프록시**에 가깝다. 백엔드 층은 "포트(Backend)
하나에 어댑터 3종(CLI claude/codex + HTTP gemini)"이 된다. Gemini는 stateless라 `resumeId`는
항상 미반환 — 멀티턴 연속성은 요청에 실린 full messages로 달성한다. 라우터·config·호환 레이어는
`gemini` 인지하도록 **외과적으로만** 넓힌다.

## 도메인 경계 (DDD)
<!-- bounded context·도메인 모델·유비쿼터스 언어. 변경이 닿는 도메인 경계. -->

- **Backend(포트)**: `src/backends/types.ts` — 불변. Gemini 어댑터가 이 포트를 구현.
- **어댑터(infrastructure)**: `src/backends/gemini.ts`(신규) — Google OpenAI 호환 API가 외부
  시스템, 이 파일이 유일 접점. HTTP 호출·SSE 파싱·usage 추출·오류 분류를 여기 격리(표면 변동
  리스크 국소화).
- **라우터(application 조립)**: `src/backends/router.ts` — `gemini` 인지 추가.
- **composition**: `src/config.ts` — `GEMINI_*` env를 읽어 어댑터에 주입(안쪽은 env 무지).
- 유비쿼터스 언어: 기존 "backend/adapter/usage" 그대로. 신규 용어 없음(glossary 무변경).
  Gemini/OpenAI 호환 고유어는 어댑터 내부에만 존재.

## 영향 모듈
<!-- 수정/신규 파일·경로. (예: 수정 X, 신규 Y, 무변경 Z) -->

- **신규** `src/backends/gemini.ts` — Gemini HTTP 어댑터(`createGeminiBackend`).
- **신규** `src/backends/gemini.test.ts` — 요청 구성·SSE 파싱·usage·오류 분류 단위 테스트
  (HTTP·스트림은 fake 주입).
- **수정** `src/backends/router.ts` — 반환 유니언에 `"gemini"` 추가, `gemini` 패턴·`gemini:`
  프리픽스·`byName`·생성자 배선.
- **수정** `src/config.ts` — `GEMINI_API_KEY`·`GEMINI_DEFAULT_MODEL`·`GEMINI_BASE_URL` 파싱.
- **수정** `.env.example` — `GEMINI_*` 플레이스홀더+안내(0원=Flash, 키 발급 위치).
- **무변경(확인만)** `src/routes/{chat,messages}.ts` — 같은 `Backend.run`을 타므로 원칙상
  무변경. 단 stateless 백엔드(resumeId 미반환)에서 **멀티턴 히스토리가 온전히 전달되는지**
  Phase 0에서 확인하고, 누수 있으면 최소 수정.

## 단계 (task 분해 가능)
<!-- 순서·의존이 드러나게. self-review clean 후 완료된 단계는 [ ]→[x]로 표기. -->
- [ ] 0. **조사·스파이크 (Phase 0)**: 실제 `GEMINI_API_KEY`로 OpenAI 호환 엔드포인트를 직접
      호출(curl/작은 스크립트)해 확인: ① `stream:true`+`include_usage` 스트리밍 SSE 형태와
      **usage가 실제로 실려 오는지**, ② system+멀티턴 messages 동작, ③ 429/403 오류 형태,
      ④ localmind `routes/chat.ts`가 백엔드에 넘기는 입력이 **전체 히스토리를 담는지**,
      ⑤ **무료 티어의 정확한 flash 모델 ID·가용**(2026-07 세대 = Gemini 3.x — models 페이지/
      AI Studio로 `GEMINI_DEFAULT_MODEL` 확정, 기억 아닌 라이브 확인).
      → 결과를 spec Open questions에 반영(확정/개정). **호환 vs 네이티브 최종 판정.**
- [ ] 1. **요청 구성 TDD**: localmind 입력(system·prompt/messages) → OpenAI 호환 `messages`
      배열 구성 순수 함수. 실패 테스트(FR-3, 멀티턴 순서·system 포함) → 구현.
- [ ] 2. **SSE·usage 파싱 TDD**: 호환 SSE 청크에서 텍스트 delta 추출 + 최종 usage→토큰 매핑.
      fake 스트림으로 실패 테스트(AC-4 청크 2+, AC-5 토큰>0) → 구현. (Phase 0에서 확인한
      실제 청크 형태를 픽스처로 사용.)
- [ ] 3. **오류 분류 TDD**: 401/403/429/5xx → `BackendError`(AC-9, 429는 무료 한도 안내).
      키 미설정 경로(AC-8) 실패 테스트 → 구현.
- [ ] 4. **어댑터 조립** `gemini.ts`: 1~3을 `Backend.run` async generator로 결선(`fetch`
      스트리밍, Bearer 인증). resumeId 항상 미반환.
- [ ] 5. **라우터·config 배선**: `detectBackend`에 `gemini` 추가(AC-1·2), 유니언 확장,
      기본 모델 폴백(AC-7), `GEMINI_*` env 주입. claude/codex 회귀 확인(AC-3).
- [ ] 6. **`.env.example` 안내**(FR-5) + **호환 경로 폴백 검증**(무변경 확인, 필요 시 최소
      수정) + **도그푸드**: 실키로 스택 기동해 2턴 스트리밍·usage 실증(AC-1·4·5·6). 무료 RPM이
      낮으니 호출 최소화.

## 테스트 전략
<!-- 각 AC를 어느 레벨 테스트(단위/통합/E2E)로 검증할지. TDD로 작성.
     상태 컬럼은 self-review clean 후 [x] green(또는 실증 근거)으로 채운다. -->
| AC | 테스트 레벨 | 방법 | 상태 |
|---|---|---|---|
| AC-1 라우팅 | 통합 | 라우터가 `gemini-3.5-flash`→Gemini 선택(fake 어댑터 서버 테스트) | [ ] |
| AC-2 프리픽스 | 단위 | 라우터 프리픽스 파싱 | [ ] |
| AC-3 회귀 | 단위/통합 | 기존 router 테스트 green 유지 | [ ] |
| AC-4 스트리밍 | 단위 | fake SSE(Phase 0 실형태 픽스처) → 조각 2+ | [ ] |
| AC-5 usage | 단위 | fake 최종 usage 청크 → 토큰>0 | [ ] |
| AC-6 멀티턴 | 통합/도그푸드 | 2턴 요청 구성 + 실키 도그푸드 1회 | [ ] |
| AC-7 기본모델 | 단위 | 모델 공백 → Flash 폴백 | [ ] |
| AC-8 키 미설정 | 단위/통합 | 키 없이 기동 성공 + Gemini 요청만 오류 | [ ] |
| AC-9 오류 | 단위 | fake 429/403 → BackendError 분류 | [ ] |

- HTTP·SSE는 **fake(주입된 fetch/스트림)** 로 검증 — 실제 Google 호출은 Phase 0 스파이크 +
  도그푸드 1회로 한정(외부 의존·무료 한도 회피, 헌법 §8 Fake 원칙).
- Phase 0에서 캡처한 **실제 SSE 청크·usage·오류 응답**을 테스트 픽스처로 승격(추측 금지).
- 도그푸드: 실키로 2턴 스트리밍·usage 관찰(헌법 §8 "테스트 green + 도그푸드"). 무료 RPM 낮음.

## Risk register (조사 기반)
- **호환 레이어 beta**: usage·파라미터 거동이 문서와 다를 수 있음 → Phase 0 실측, 픽스처 고정,
  공백 크면 네이티브 승격.
- **무료 티어 변동**: Pro 무료 제외(2026-04)·할당량 축소·429 흔함 → 기본 Flash, 429 명시 안내.
- **API 표면 변동**: 어댑터 경계 격리로 국소화.

## Open questions
<!-- plan 차원의 미결정(드라이버 선택·배치 등). Phase 0가 해소. -->
- `fetch` 스트리밍 SSE 파서를 자체 구현할지, `util/`에 재사용 스트림 유틸이 있는지 착수 시
  확인(`spawnNdjson`은 프로세스용이라 부적합 — 중복 회피).
- 호환 vs 네이티브 최종 결정 = Phase 0 산출.
- `gemini-map` 순수함수 분리 여부는 크기로 판단(작으면 인라인).
