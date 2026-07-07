# Goal: Gemini CLI 백엔드 — 구독 OAuth 0원 경로

> **⚠️ WITHDRAWN (2026-07-07) — 착수 안 함.** 이 스펙의 전제(gemini CLI의 개인 Google OAuth
> 무료 티어)가 **2026-06-18부로 종료**됐다. Google이 개인용 gemini CLI/Code Assist OAuth를 닫고
> Antigravity 제품군으로 통합 — 무료·AI Pro·Ultra 개인 계정의 "Sign in with Google"이 차단됐다
> (로그인 시 *"This client is no longer supported for Gemini Code Assist for individuals"*). 대체재
> **Antigravity CLI(`agy`)**는 OAuth key-less는 되나 **구조화 스트리밍(stream-json)·usage 봉투가
> 없고 non-TTY 출력 버그 + 에이전트 우선** 설계라 localmind 텍스트 백엔드로 부적합(라이브 검증
> 2026-07-07). 따라서 **CLI-OAuth-0원 경로는 현재 실현 불가** → 폐기. **Gemini는 035(API 키)가
> 이미 커버.** 근거: [Google deprecation 문서](https://developers.google.com/gemini-code-assist/docs/deprecations/code-assist-individuals),
> gemini-cli issue #28229. 교훈: 문서(README)에 기능이 있어도 "현재 작동"을 날짜로 검증해야 한다
> (Live-Verify — 이 스펙이 그 반례로 남는다).

<!-- 아래는 폐기 전 원안. 결정 이력 보존용으로 남긴다. -->

<!-- 왜(why) 이 작업이 존재하는가. 구현 세부(스키마·API·파일경로·구현 단계)는 넣지 않는다. -->

> **조사 기반·Live-Verify 주의**: 아래 CLI 사실은 공식(github.com/google-gemini/gemini-cli, T1)
> 기준 2026-07 확인분이다. `--output-format stream-json`의 **정확한 이벤트 스키마**(텍스트 델타·
> usage·세션 id 필드)는 gemini CLI 설치+OAuth 로그인 후 **Phase 0 스파이크로 실측** 후 확정한다.

## Background — 배경

035에서 Gemini를 **API 키(OpenAI 호환 엔드포인트)** 경로로 추가했다. 한편 **gemini CLI**는
**Google 계정 OAuth**로 인증하는 **더 후한 무료 티어**(60 req/분·1,000 req/일·Gemini 3·1M 컨텍스트)를
제공하고, `gemini -p "…" -m <model> --output-format stream-json`으로 **claude/codex와 동일한 NDJSON
헤드리스 구동**이 된다(T1). 즉 localmind의 "**구독 인증 CLI 0원**" 명제에 가장 순정으로 맞는 경로다.

## Problem — 문제

- 035 API 키 경로는 **키 관리가 필요**하고 무료 한도가 낮다(과부하 503도 잦음 — 035 Phase 0).
- gemini CLI OAuth는 **키 없이 더 후한 무료 한도**를 주지만 localmind가 이 경로를 쓸 수 없다.
- claude/codex는 CLI 구독으로 도는데 Gemini만 API 키에 묶여 있어 일관성·0원 정합이 약하다.

## Objective — 목표

**gemini CLI를 세 번째 백엔드의 두 번째 구동 방식으로 추가**한다. codex처럼 `gemini` 바이너리를
`--output-format stream-json`으로 구동하는 **OAuth 어댑터**를 만들고, **`GEMINI_MODE`(cli|api)
설정 토글**로 `gemini` 라우팅이 CLI 또는 API(035) 중 **하나**를 쓰게 한다.

## Expected outcome — 기대 결과

- `GEMINI_MODE=cli`일 때 `model: "gemini-2.5-flash"`(또는 `gemini:…`) 요청이 gemini CLI로
  처리되어 **스트리밍**·**usage**가 온다(OAuth, 키 불필요).
- `GEMINI_MODE=api`면 035 API 경로가 그대로(회귀 0).
- gemini CLI 미설치·미로그인 시 스택·다른 백엔드는 정상, gemini 요청에만 평이한 오류.

## Success metrics — 성공 지표
<!-- 측정 가능한 성공 기준. self-review clean 후 달성한 지표는 [ ]→[x]로 표기,
     미달성은 체크하지 않고 사유 부기(은폐 금지). -->
- [ ] `GEMINI_MODE=cli`에서 Gemini 요청이 OAuth로 스트리밍 응답을 반환한다(실증 도그푸드).
- [ ] CLI 응답에 입력·출력 토큰 usage가 집계된다(stream-json에서 추출).
- [ ] `GEMINI_MODE` 토글로 cli↔api 전환이 되고, api 모드는 035 동작 유지(회귀 0).
- [ ] gemini CLI 미설치/미로그인 시 스택 기동·claude/codex 정상, gemini 요청만 평이한 오류.
- [ ] 기존 테스트 스위트 green 유지.

## Non-goals — 비목표
<!-- 이번 범위에서 제외하는 것. (필수) -->
- **cli·api 동시 활성** — 토글로 한쪽만(사용자 결정). 별도 프리픽스 동시 사용은 후속.
- **API 키를 CLI에 쓰기** — v1 CLI 경로는 **OAuth 전용**(키 경로는 035가 담당).
- **도구/함수 호출·멀티모달** — 후속(035 계승).
- **컨테이너 안에서 OAuth 브라우저 로그인** — 로그인은 호스트에서 1회(codex 패턴), 컨테이너는
  인증 파일 마운트 재사용.

## Constraints — 제약
<!-- 기술·운영·일정·외부 의존 제약. (필수) -->
- **OAuth = 호스트 gemini CLI 전제**: 사용자가 `gemini` 설치 + `gemini`(브라우저) 1회 로그인.
  codex(`~/.codex` 마운트)와 동일 패턴으로 인증 디렉터리(추정 `~/.gemini`)를 컨테이너에 마운트.
- **기존 어댑터 계약 준수**: `src/backends/types.ts`의 `Backend` 구현(claude/codex와 동형).
- **시크릿 금지**: OAuth 자격은 CLI가 파일로 관리 — 마운트만, 저장소 커밋 금지.
- **비개발자 오류 메시지**: 미설치·미로그인·한도(429)는 평이한 한국어.
- **Live-Verify**: stream-json 이벤트 스키마·`-p` vs stdin·resume 플래그는 Phase 0 실측 후 사용.

## Stakeholders — 이해관계자

- 단일 사용자(설치한 개인 누구나). gemini CLI를 OAuth로 쓰는(또는 쓰려는) 사용자.

## Risks — 리스크

- **stream-json 스키마 미확정**: 텍스트 델타·usage·세션 id 필드가 claude와 다를 수 있음 →
  Phase 0에서 실측(gemini CLI 설치+로그인 필요 — 미충족 시 v1 보류).
- **CLI 성숙도·변경**: gemini CLI가 활발히 바뀜 → 어댑터 경계에 파싱 격리.
- **컨테이너 OAuth 마운트**: 인증 파일 위치·형식이 codex와 다를 수 있음 → Phase 0 확인.
- **usage 부재 가능성**: CLI stream-json이 토큰 usage를 안 줄 수 있음 → 그러면 근사/미제공 명시.
- **resume 지원 불명**: 체크포인트 방식이 CLI 세션 id로 노출되는지 미확인(best-effort).

> 출처 등급: 헤드리스·stream-json·OAuth 무료한도·`-m`·checkpointing = 공식 gemini-cli `[T1]`
> (2026-07). 이벤트 스키마 세부는 미문서화 → Phase 0 실측이 정본.
