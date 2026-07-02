# Plan: CI Test Gate

상위: [goal](goal.md) · [spec](spec.md)

## 접근 요약

ci.yml build job에 테스트 2단계(npm test, 셸 테스트)를 추가하고, 순수 로직 3모듈의
테스트 파일을 신규 작성한다. 기존 테스트 러너(node:test + tsx)와 테스트 스타일
(describe/it, 한국어 시나리오명)을 그대로 따른다. 외부 의존이 없는 모듈들이라
mock 프레임워크 없이 순수 함수 호출로 테스트한다.

## 도메인 경계 (DDD)

- **품질 게이트(quality gate) 도메인**: 코드 도메인이 아니라 개발 파이프라인의 관문.
  기존 코드 로직은 일절 변경하지 않는다(외과적 원칙 — 테스트와 CI 설정만 추가).
- **유비쿼터스 언어**:
  - *게이트(gate)*: 실패 시 머지를 막는 CI 필수 단계
  - *비통합 테스트*: 임베딩 서버·인증 CLI 없이 실행 가능한 테스트(CI 대상)
  - *통합 테스트*: `LOCALMIND_INTEGRATION=1` 전용(CI 제외, 로컬 전용)

## 영향 모듈

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `.github/workflows/ci.yml` | 수정 | `npm test` + 셸 테스트 단계 추가, 통합 테스트 제외 주석 |
| `src/transform.test.ts` | 신규 | contentToText/flattenMessages/flattenAnthropic 단위 테스트 |
| `src/tools.test.ts` | 신규 | parseToolCalls/normalize* 단위 테스트 |
| `src/session.test.ts` | 신규 | SessionStore/extractExplicitId/prepareSession 단위 테스트 |
| `src/` 기존 코드 | 무변경 | (테스트를 위해 export 추가가 필요한 경우에만 최소 수정) |

## 단계 (task 분해 가능)

1. **`src/transform.test.ts`**: FR-3 시나리오. 특히 `contentToText`의 tool_use/tool_result
   재귀 렌더링, `flattenMessages`의 "마지막이 assistant가 아니면 `Assistant:` 유도 접미"
   동작을 고정.

2. **`src/tools.test.ts`**: FR-4 시나리오. `parseToolCalls`의 관대한 파싱(코드펜스 제거,
   첫 균형 JSON 추출)이 핵심 — 정상/펜스/앞뒤 잡음/불균형 JSON 케이스. `tools.ts`에서
   테스트에 필요한 함수의 export 여부 확인(이미 export돼 있으면 그대로).

3. **`src/session.test.ts`**: FR-5 시나리오. `prepareSession`은 config·store를 인자로 받는
   순수 구조라 mock Config 객체로 충분. TTL 테스트는 `updatedAt` 직접 조작 대신 ttlMs=1 +
   실제 대기(수 ms)로 단순하게.

4. **`ci.yml` 수정**: build job에
   ```yaml
   - run: npm test
   - run: for t in scripts/*.test.sh; do bash "$t"; done
   ```
   추가 + 주석 갱신(FR-6). glob 안정성 우려(spec Open questions)가 있으면 `npm test`
   스크립트를 `--test src/` 디렉토리 지정으로 바꾸는 것도 이 단계에서 판단.

5. **로컬 전체 검증**: `npm test` + 셸 테스트 로컬 통과 확인 → push 후 CI 3개 매트릭스
   green 확인(AC-2·AC-6은 CI 실행 결과로 검증).

## 테스트 전략

| AC | 테스트 레벨 | 방법 |
|----|-------------|------|
| AC-1 (게이트 동작) | CI | 의도적으로 깨진 테스트를 임시 브랜치에 push해 red 확인(또는 로컬에서 실패 종료코드 확인으로 대체) |
| AC-2 (전 매트릭스 green) | CI | push 후 Actions 결과 확인 |
| AC-3 (코드펜스 파싱) | 단위 | tools.test.ts |
| AC-4 (max 초과 제거) | 단위 | session.test.ts |
| AC-5 (consume-once) | 단위 | session.test.ts |
| AC-6 (ubuntu 호환) | CI | 셸 테스트가 ubuntu 러너에서 통과 |

## Open questions

- AC-1 검증 방식: 실제 red를 만들려면 임시 커밋이 필요 — 로컬에서 `npm test` 실패 시
  비-0 종료코드 확인으로 대체 가능(CI는 종료코드로 실패 판정하므로 동등). 구현 시 결정.
