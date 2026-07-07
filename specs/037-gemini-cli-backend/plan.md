# Plan: Gemini CLI 백엔드 (OAuth, stream-json)

> **⚠️ WITHDRAWN (2026-07-07).** 미착수 — 사유는 [goal.md](goal.md) 폐기 배너 참조.

<!-- 어떻게(how) 만드는가. spec의 FR을 코드 변경으로 매핑한다. 상위: [goal](goal.md) · [spec](spec.md) -->

> **Live-Verify 먼저(Phase 0)**: gemini CLI 설치+OAuth 로그인 후 stream-json 이벤트 스키마·프롬프트
> 전달·인증 경로를 실측한 뒤 파서를 확정한다(아래 수치·필드는 조사분, 확정 아님).

## 접근 요약
<!-- 핵심 기술 접근 1~2단락. -->

codex.ts를 본떠 `gemini` 바이너리를 `spawnNdjson`으로 구동한다(`-m <model>
--output-format stream-json`, system은 프롬프트 앞에 prepend). NDJSON 이벤트에서 텍스트 델타·
usage·(가능하면)세션 id를 추출해 `Backend` 계약을 채운다. 라우터는 `GEMINI_MODE`로 `gemini`
백엔드를 **cli(037) 또는 api(035) 중 하나**로 구성한다 — 둘은 같은 `Backend` 인터페이스라 교체
가능. OAuth 인증은 CLI가 파일로 관리(호스트 로그인 1회 + 컨테이너 마운트, codex 동형).

## 도메인 경계 (DDD)
<!-- bounded context·도메인 모델·유비쿼터스 언어. 변경이 닿는 도메인 경계. -->

- **Backend(포트)**: `types.ts` 불변. cli 어댑터가 구현.
- **어댑터(infrastructure)**: `src/backends/gemini-cli.ts`(신규) — gemini CLI가 외부 시스템,
  이 파일이 유일 접점. stream-json 파싱·인자 구성·오류 분류를 격리.
- **라우터(조립)**: `router.ts` — `GEMINI_MODE`로 gemini 어댑터 선택(cli|api).
- **composition**: `config.ts`(`GEMINI_MODE`·`GEMINI_BIN`) + compose(인증 마운트).
- 유비쿼터스 언어: 기존 backend/adapter/usage/resumeId 그대로. 신규 용어 없음(glossary 무변경).

## 영향 모듈
<!-- 수정/신규 파일·경로. (예: 수정 X, 신규 Y, 무변경 Z) -->

- **신규** `src/backends/gemini-cli.ts` — `createGeminiCliBackend`.
- **신규** `src/backends/gemini-cli.test.ts` — 인자 구성·stream-json 파싱·usage·오류 단위 테스트
  (spawn은 fake 주입 — claude/codex 테스트 방식이 있으면 재사용).
- **수정** `src/backends/router.ts` — `GEMINI_MODE`로 gemini 어댑터 선택(cli|api). `gemini` 판별 불변.
- **수정** `src/config.ts` — `GEMINI_MODE`(cli|api|auto)·`GEMINI_BIN` 파싱.
- **수정** `.env.example` + `docker-compose*.yml` — `GEMINI_MODE` 안내 + OAuth 인증 디렉터리 마운트
  (Phase 0에서 경로 확정 후).
- **무변경** `src/backends/gemini.ts`(035 API) — 토글의 다른 한쪽으로 그대로 재사용.

## 단계 (task 분해 가능)
<!-- 순서·의존이 드러나게. self-review clean 후 완료된 단계는 [ ]→[x]로 표기. -->
- [ ] 0. **Phase 0 스파이크(gemini CLI 설치+OAuth 로그인 필요)**: `gemini -p "안녕" -m
      gemini-2.5-flash --output-format stream-json` 실행해 ① 이벤트 스키마(델타·usage·세션 id)
      ② 프롬프트 `-p` vs stdin ③ 인증 파일 경로(`~/.gemini`?) ④ resume 가능성 ⑤ usage 제공 여부
      실측 → spec Open q 해소, 파서 픽스처 확정. **호스트 gemini CLI·로그인 없으면 v1 보류 보고.**
- [ ] 1. **인자 구성 TDD**: system+prompt+model → CLI 인자(`-m`·`--output-format stream-json`,
      system prepend). 실패 테스트(AC-6) → 구현.
- [ ] 2. **stream-json 파싱 TDD**: Phase 0 실형태 픽스처로 델타 추출 + usage 매핑. 실패 테스트
      (AC-4 델타 2+, AC-5) → 구현.
- [ ] 3. **오류·부재 TDD**: 미설치/미로그인(AC-7)·비정상 종료/인증(AC-8) → `BackendError`.
- [ ] 4. **어댑터 조립** `gemini-cli.ts`: 1~3을 `Backend.run`으로 결선(`spawnNdjson`, resume best-effort).
- [ ] 5. **라우터·config 토글**: `GEMINI_MODE`로 gemini 어댑터 선택(AC-1·2), `GEMINI_BIN`,
      기본값(auto 제안) 확정. api 모드 회귀 확인(AC-3).
- [ ] 6. **compose 마운트 + `.env.example` 안내 + 도그푸드**: OAuth 인증 마운트 배선, cli 모드
      실기기 스트리밍·usage 실증(AC-1·4·5). 미설치 환경은 AC-7로 대체 검증.

## 테스트 전략
<!-- 각 AC를 어느 레벨 테스트(단위/통합/E2E)로 검증할지. TDD로 작성.
     상태 컬럼은 self-review clean 후 [x] green(또는 실증 근거)으로 채운다. -->
| AC | 테스트 레벨 | 방법 | 상태 |
|---|---|---|---|
| AC-1 cli 라우팅 | 통합 | 라우터가 mode=cli→cli 어댑터 선택(fake) | [ ] |
| AC-2 토글 | 단위 | GEMINI_MODE별 어댑터 선택 | [ ] |
| AC-3 회귀 | 단위/통합 | 기존 테스트 green 유지 | [ ] |
| AC-4 스트리밍 | 단위 | fake stream-json(Phase 0 픽스처) 델타 2+ | [ ] |
| AC-5 usage | 단위 | fake usage 이벤트 → 매핑(또는 미제공 명시) | [ ] |
| AC-6 인자 구성 | 단위 | spawn 인자 검증(-m·stream-json·system) | [ ] |
| AC-7 미설치/미로그인 | 단위/통합 | fake spawn 실패 → BackendError | [ ] |
| AC-8 오류 | 단위 | 비0 종료/인증오류 → 분류 | [ ] |

- spawn은 **fake 주입**으로 단위 검증(claude/codex 테스트 하네스 재사용 검토). 실제 `gemini`
  호출은 Phase 0 + 도그푸드 1회로 한정(헌법 §8 Fake·도그푸드).
- Phase 0 실측 stream-json을 **픽스처로 승격**(추측 금지 — Live-Verify).

## Open questions
<!-- plan 차원의 미결정(드라이버 선택·배치 등). Phase 0가 해소. -->
- `GEMINI_MODE` 기본값 = auto(키 있으면 api, 없고 gemini 로그인 있으면 cli) 제안 — Phase 0 후 확정.
- claude/codex 테스트가 spawnNdjson을 어떻게 fake하는지 확인해 재사용(중복 회피).
- OAuth 마운트 경로·형식은 Phase 0 산출.
