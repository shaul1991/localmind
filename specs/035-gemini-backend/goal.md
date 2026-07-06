# Goal: Gemini 백엔드 — 세 번째 LLM 제공자

<!-- 왜(why) 이 작업이 존재하는가. 구현 세부(스키마·API·파일경로·구현 단계)는 넣지 않는다. -->

> **조사 기반·미숙지 영역 주의**: Gemini는 이 프로젝트가 한 번도 써보지 않은 영역이다. 아래
> 사실은 공식 문서(ai.google.dev, T1) 기준 **2026-07-06 시점** 확인분이며, Google이 API 표면·
> 무료 정책을 자주 바꾸므로(아래 Risks) **구현 착수 시 스파이크로 재검증**한다(plan Phase 0).
> "완벽한 사양"이 아니라 "검증 경로가 내장된 사양"을 목표로 한다.
>
> **Live-Verify 재검증 로그 (2026-07-06, dogfood)**: Live-Verify Facts 규약을 이 문서 자신에
> 적용해 재검증한 결과 **모델 세대가 낡았음을 발견·교정**했다 — 초안의 `gemini-2.5-flash`는
> 구세대. 현재는 **Gemini 3.x 세대**(`gemini-3.5-flash` 최신 stable, `gemini-3.1-flash-lite`
> stable)가 표준이라 기본/예시를 3.x로 갱신. "Pro 무료 제외(2026-04-01~)"는 교차검증 통과라
> 유지. 정확한 무료 flash 모델 ID·가용은 소스마다 미묘히 달라 Open question으로 남김(단정 금지).

## Background — 배경

localmind는 OpenAI·Anthropic 호환 API를 로컬 제공하되, 뒤편 LLM은 백엔드 어댑터로 처리한다
(`src/backends/`). 현재 백엔드는 `claude`·`codex` 둘뿐이다. 사용자·팀은 Google Gemini를 쓰는
경우가 많고, **Google이 OpenAI 호환 엔드포인트를 제공**(T1)하므로 localmind의 기존 OpenAI
포맷과 정합해 얇게 붙일 여지가 크다.

## Problem — 문제

- localmind 사용자가 Gemini 모델을 고를 방법이 없다 — 요청 model이 Gemini여도 라우터가
  claude/codex로만 판별한다.
- Anthropic·OpenAI 한쪽에 장애·한도·품질 이슈가 있을 때 **대체 제공자**가 없다.
- Gemini 무료 티어(Flash 계열)가 남아 있어도 활용할 수 없다.

## Objective — 목표

localmind에 **Gemini를 세 번째 LLM 백엔드로 추가**한다. v1 연동은 **Google의 OpenAI 호환
엔드포인트**를 1차 경로로 삼아(localmind가 이미 OpenAI 포맷이라 매핑 최소) 스트리밍·usage·
멀티턴을 얻는다. 네이티브 `generateContent` 경로와 Gemini CLI 어댑터는 **후속**으로 남긴다.

## Expected outcome — 기대 결과

- 사용자가 `model: "gemini-3.5-flash"`(또는 `gemini:<model>`)로 요청하면 Gemini가 응답한다.
- 응답이 기존 백엔드와 동일하게 **스트리밍**되고 **usage(토큰)** 가 집계된다.
- 멀티턴 대화가 연속성 있게 이어진다.
- claude/codex 경로는 회귀 없이 그대로 동작한다.

## Success metrics — 성공 지표
<!-- 측정 가능한 성공 기준. self-review clean 후 달성한 지표는 [ ]→[x]로 표기,
     미달성은 체크하지 않고 사유 부기(은폐 금지). -->
- [x] `gemini-2.5-flash` 요청이 OpenAI 호환(`/v1/chat/completions`) 경로에서 스트리밍 응답을
      반환한다. *라우팅 단위 + **Phase 0 라이브 스파이크(2026-07-06)** 실 200 스트리밍 확인.*
- [x] Gemini 응답에 입력·출력 토큰 usage가 0이 아닌 값으로 집계된다. *어댑터 매핑 단위 +
      **Phase 0 라이브 실 usage `{input:17, output:25}`** — beta가 실제로 싣는 것 확정.*
- [x] 2턴 이상 대화에서 문맥이 유지된다. ***Phase 0 라이브 2턴** — 앞 턴 이름을 뒤 턴에서
      정확히 되답("슈얼"). full-history 접근 실동작 확인.*
- [x] claude/codex 기존 테스트 스위트가 100% green 유지(회귀 0). *377개 green + typecheck clean.*
- [x] Gemini 키 미설정 시 스택이 죽지 않고, Gemini 요청에만 평이한 한국어 오류를 반환한다.
      *AC-8 테스트 + 전체 스위트 green.*
- [x] Phase 0 스파이크 결과가 문서(spec/plan)에 반영되어, 미검증 가정이 확정 또는 Open
      question으로 정리됐다. *Phase 0 실행 완료 — spec Open questions 전부 취소선 해소, 기본
      모델 `gemini-2.5-flash` 확정(503 발견).*

## Non-goals — 비목표
<!-- 이번 범위에서 제외하는 것. (필수) -->
- **Gemini CLI 어댑터** — 후속 스펙(036 후보). v1은 HTTP(API) 경로만.
- **네이티브 `generateContent`/`contents` 매핑 경로** — v1은 OpenAI 호환 엔드포인트 우선.
  호환 레이어(beta) 공백이 v1을 막을 때만 대안으로 승격(그 판단은 Phase 0 스파이크에서).
- **도구/함수 호출(function calling)** 파리티 — 후속.
- **네이티브 resume-id 세션** — Gemini는 stateless. 연속성은 full-history 재전송으로 달성.
- **멀티모달 입력·이미지/비디오 생성** — 후속(호환 레이어도 파일 업/다운 미지원, T1).
- **Gemini 임베딩** — localmind 임베딩은 ollama 기반 유지, 별개 관심사.
- **Pro 모델 무료 사용 보장** — 2026-04-01부터 Pro는 무료 티어 제외(아래 Constraints).

## Constraints — 제약
<!-- 기술·운영·일정·외부 의존 제약. (필수) -->
- **0원 명제 유지, 단 무료는 Flash 계열만**: 무료 티어는 2026-04 이후 `flash`·`flash-lite`만
  (Pro 유료). 기본 모델·문서는 Flash를 전제로 한다. [T1 rate-limits/pricing, T3 교차]
- **호환 레이어는 beta**: Google 문서가 "still in beta"로 명시. 파일 업/다운 미지원, 일부
  OpenAI 파라미터 조용히 무시. v1은 채팅·스트리밍·usage로 범위를 좁혀 beta 리스크를 회피.
- **기존 어댑터 계약 준수**: `src/backends/types.ts`의 `Backend` 인터페이스 구현. 라우터·
  호환 레이어의 외과적 변경만.
- **시크릿 금지**: 키는 `.env`(`GEMINI_API_KEY`)로만. `.env.example`엔 플레이스홀더+안내.
- **비개발자 오류 메시지**: 키 미설정·한도 초과(429)는 평이한 한국어로.

## Stakeholders — 이해관계자

- 단일 사용자(설치한 개인 누구나 — 비개발자 포함). Gemini 무료 티어(Flash)를 쓰거나 이미
  Google AI 키가 있는 사용자.

## Risks — 리스크

- **API 표면 변동성(높음)**: Google은 API 표면을 활발히 바꾼다 — OpenAI 호환(beta), 네이티브
  `generateContent`, 신규 "Interactions API"가 공존(T1 조사 중 확인). 우리 지식이 낡을 수
  있으므로 Gemini 세부는 **어댑터 경계에 격리**하고 Phase 0에서 실측 검증한다.
- **무료 티어 축소·한도**: 2025-12 할당량 50-80% 감축, 2026-04 Pro 무료 제외 등 정책이
  자주 바뀐다. Flash 무료도 RPM/RPD가 낮아 **429가 흔하다** → 명시적 오류 매핑 필요.
- **호환 레이어 beta 공백**: 스트리밍 usage·특정 파라미터가 기대와 다를 수 있음 → Phase 0
  스파이크로 확인 후 확정. 공백이 크면 네이티브 경로로 대안 검토.
- **localmind 세션 흐름 정합**: 백엔드가 resumeId를 안 돌려줄 때(stateless) 멀티턴 문맥이
  프롬프트에 온전히 실려 오는지 미확인 → Phase 0 검증 대상.

> 출처 등급: 엔드포인트·인증·스트리밍/usage·beta·파일미지원은 ai.google.dev 공식 문서 `[T1]`
> (2026-07-06). 무료 티어 구체 수치(RPM/RPD)는 공식이 AI Studio 동적 표기라 확정 미제공 →
> 블로그 교차 `[T3~T4]`로 대략만 파악, **실 수치는 사용자 프로젝트의 AI Studio에서 확인**.
