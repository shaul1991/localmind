# Spec: Session & Index Accuracy

상위: [goal](goal.md)

## Scope

(1) explicit 세션 경로에 prefix 내용 검증 + 세션 수명주기 방어(빈 CLI 세션 id, tools
변경 감지). (2) 청크 분할 유실 제거 + 인덱스에 임베딩 메타(모델·차원) 기록 + 다중
프로세스 인덱스 쓰기 안전. (3) `delete_note` 대상 제한, `capture_note` 파일명 충돌 방지.

## Context

- `src/session.ts:70` `extractExplicitId()`: `x-localmind-session` 헤더 → `session_id` →
  `user` → `metadata.user_id` 순으로 explicit id 채택.
- `src/session.ts:108-125` explicit 경로: `entry.messageCount <= messages.length`만으로
  resumable 판정(내용 미검증) → `messages.slice(entry.messageCount)`로 접합. auto 경로는
  prefix 해시 + consume-once로 방어함(같은 파일 상단) — 이 기제를 재사용할 수 있다.
- `src/session.ts:123` commit: `cliSessionId: cliSessionId || resumeId || entry?.cliSessionId || ""`
  — CLI가 세션 id를 안 주면 `""`가 저장되고, 다음 턴에 resumable로 판정되면서
  `resumeId=""`(falsy)라 백엔드는 fresh 실행 → 잘린 메시지만 전달(맥락 유실).
- `src/brain.ts:181` `chunkText()`: `p.length > MAX_CHUNK ? p.slice(0, MAX_CHUNK) : p` —
  초과분을 버린다.
- `src/brain.ts:251-259, 367-377`: 인덱스 엔트리에 임베딩 모델·차원 기록 없음
  (`INDEX_VERSION`만). 차원이 다른 벡터 간 코사인은 NaN.
- `src/brain.ts:665-676` `deleteNote()`: 폴더 탈출(`..`)은 거부하지만 확장자·숨김 경로
  검사 없음.
- `src/brain.ts:401-421` `capture()`: 파일명 타임스탬프가 초 해상도 + `writeFileSync`에
  `wx` 없음 → 같은 초 동일 제목이면 덮어씀.
- `src/brain.ts:139-154, 286-358`: 인덱스 캐시·single-flight·원자적 쓰기(temp+rename)는
  **프로세스 내** 한정. 프로세스 A·B가 각각 로드→수정→저장하면 마지막 쓰기가 이긴다.
- `src/routes/chat.ts:133`, `src/routes/messages.ts:117`: `if (toolsOn && !sess.resumeId)`
  — resume 경로에서는 tools 지시문(A2 프롬프트)을 주입하지 않는다.
- 테스트 현황: `session.test.ts`는 auto 경로 중심, explicit 경로의 내용 검증·빈 id는
  무테스트. `chunkText`·`deleteNote` 경로 거부·다중 프로세스도 무테스트.

## Functional Requirements

### 트랙 A — 세션

- **FR-1 (explicit prefix 검증)**: explicit 세션이 resume되려면 메시지 개수 조건에 더해
  **기존 대화 prefix의 내용 일치**(auto 모드와 같은 정규화 해시)가 성립해야 한다.
  불일치면 접합하지 않고 전체 히스토리로 새 세션을 만든다. `user` 등 기존 id 소스는
  유지한다(2026-07-03 결정: 호환 보존 + 검증 추가).
  → goal: Objective(1), Success metrics, Constraints
- **FR-2 (빈 CLI 세션 id 방어)**: CLI가 세션 id를 반환하지 않은 턴은 resume 가능한
  세션으로 저장하지 않는다 — 다음 턴은 전체 히스토리 전송으로 폴백해 맥락이 유실되지
  않아야 한다(auto·explicit 공통).
  → goal: Objective(1)
- **FR-3 (tools 변경 감지)**: 세션 생성 시점과 tools 정의(목록·스키마)가 달라진 resume
  요청에서 함수호출이 침묵 실패하지 않아야 한다 — tools 서명(정규화 해시)을 세션에
  저장하고, 달라지면 최신 tools 지시문이 적용되게 한다(재주입 또는 fresh 세션 — 방식은
  plan에서 확정).
  → goal: Objective(1), Expected outcome

### 트랙 B — 색인

- **FR-4 (청크 분할 유실 0)**: `MAX_CHUNK` 초과 문단은 잘라 버리지 않고 분할한다.
  분할 후 어떤 청크도 `MAX_CHUNK`를 초과하지 않으며, 원문의 모든 텍스트가 청크
  합집합에 포함된다. 인덱스 버전을 올려 기존 인덱스는 1회 자동 재색인한다
  (재색인 사유를 로그로 안내).
  → goal: Objective(2), Expected outcome, Constraints
- **FR-5 (임베딩 메타 기록)**: 인덱스에 임베딩 모델명과 차원을 기록한다. 로드 시 현재
  설정과 다르면 해당 인덱스를 자동 재색인하고, 그 사유("임베딩 모델이 바뀌어 다시
  색인합니다")를 평이한 한국어로 안내한다. 차원이 다른 벡터 간 유사도 계산이 발생하지
  않아야 한다.
  → goal: Objective(2), Expected outcome
- **FR-6 (다중 프로세스 쓰기 안전)**: 여러 프로세스가 같은 `.brain-index.json`을 갱신할
  때 다른 프로세스가 먼저 저장한 엔트리(임베딩)가 유실되지 않아야 한다: 저장 직전 디스크
  파일이 로드 시점 이후 변경됐으면 다시 읽어 **병합** 후 쓰고, 쓰기 구간은 **파일 락**
  (stale 타임아웃 포함, 외부 의존성 없이)으로 직렬화한다. 락 보유 프로세스가 비정상
  종료해도 다른 프로세스가 유한 시간 안에 진행할 수 있어야 한다.
  → goal: Objective(2), Expected outcome, Constraints, Risks

### 트랙 C — 노트 도구

- **FR-7 (delete_note 대상 제한)**: `delete_note`는 확장자가 `.md`인 파일만 대상으로
  하고, 경로의 어느 세그먼트든 `.`으로 시작하면(숨김 파일·폴더: `.trash/`,
  `.brain-index.json` 등) 거부한다. 거부 메시지는 평이한 한국어로. 기존 폴더 탈출 거부는
  유지하고 이번에 회귀 테스트로 고정한다.
  → goal: Objective(3), Expected outcome
- **FR-8 (capture 파일명 충돌 방지)**: 같은 초에 같은 제목으로 `capture_note`를 여러 번
  호출해도 먼저 저장된 노트가 덮어써지지 않는다(배타적 생성 + 충돌 시 고유 접미).
  → goal: Objective(3)

## Acceptance Criteria

- **AC-1 (혼입 차단)**: Given explicit id `U`로 대화 A(user/assistant 3개)가 커밋된 상태에서,
  When 같은 `U`로 **내용이 다른** 5개 메시지의 새 대화 B를 보내면,
  Then resume되지 않고(증분 접합 없음) 전체 히스토리가 새 세션으로 전송된다.
- **AC-2 (정상 연속 보존)**: Given 같은 상태에서,
  When 대화 A의 prefix를 그대로 유지한 채 새 user 메시지를 덧붙여 보내면,
  Then 기존처럼 resume되어 새 턴만 증분 전송된다.
- **AC-3 (빈 CLI id 폴백)**: Given CLI가 세션 id를 반환하지 않은 턴이 커밋된 상태에서,
  When 다음 턴을 보내면,
  Then 이전 맥락이 유실되지 않는다(전체 히스토리 전송으로 폴백 — 잘린 메시지만 fresh
  실행되는 일이 없다).
- **AC-4 (tools 후행 추가)**: Given tools 없이 세션이 만들어진 뒤,
  When 다음 턴에 tools를 추가해 보내면,
  Then 함수호출 지시문이 적용되어 `tool_calls`(OpenAI)/`tool_use`(Anthropic) 응답이
  정상 생성될 수 있다.
- **AC-5 (긴 문단 검색)**: Given 빈 줄 없는 5,000자 문단(끝부분에 고유 문구 포함)을
  캡처하면,
  Then 문단 **끝부분의 고유 문구**가 `search_notes`로 검색된다.
- **AC-6 (분할 불변식)**: Given 임의 텍스트에 대해 `chunkText`를 실행하면,
  Then 모든 청크가 `MAX_CHUNK` 이하이고, 원문에서 공백을 제외한 모든 내용이 청크
  합집합에 존재한다(내용 유실 0).
- **AC-7 (모델 교체 안전)**: Given 모델 X(차원 d1)로 만든 인덱스가 있는 상태에서,
  When 임베딩 모델 설정을 Y(차원 d2≠d1)로 바꿔 검색하면,
  Then NaN·무의미 결과 대신 자동 재색인이 수행되고 이후 검색이 정상 동작한다.
- **AC-8 (인덱스 메타 기록)**: Given 새로 만든 인덱스 파일을 열면,
  Then 임베딩 모델명과 차원이 기록되어 있다.
- **AC-9 (비-.md 거부)**: Given 노트 폴더에 `.brain-index.json`·`data.txt`가 있는 상태에서,
  When `delete_note`로 각각을 지목하면,
  Then 둘 다 거부되고(평이한 한국어 안내) 파일은 그대로 남는다. `../` 탈출 경로도
  동일하게 거부된다(기존 동작 회귀 고정).
- **AC-10 (capture 충돌)**: Given 같은 초 안에,
  When 같은 제목으로 `capture_note`를 2회 호출하면,
  Then 노트 파일 2개가 모두 존재한다(덮어쓰기 없음).
- **AC-11 (병렬 색인 무유실)**: Given 프로세스 2개가 같은 인덱스를 로드한 뒤,
  When 각자 서로 다른 파일을 색인해 저장하면,
  Then 최종 인덱스에 두 파일의 엔트리가 모두 존재한다.
- **AC-12 (stale 락 진행)**: Given 락 파일만 남기고 죽은 프로세스가 있는 상태에서,
  When 다른 프로세스가 인덱스를 저장하면,
  Then 유한 시간(타임아웃) 안에 저장이 완료된다(영구 대기 없음).

## Open questions

- FR-3의 방식: resume 유지 + 시스템 지시문 재주입이 CLI resume 의미론과 충돌하면
  fresh 세션 폴백이 안전 — plan의 기본안은 "tools 서명 불일치 시 fresh"이며 구현 중
  재주입이 가능하면 전환.
- FR-6의 병합 규칙: 같은 파일 경로의 엔트리가 양쪽에서 갱신됐을 때 어느 쪽을 이길지 —
  기본안은 해시가 다른 쪽 중 mtime이 최신인 쪽(파일 내용 기준이라 어느 쪽이든 수렴).
- FR-4의 분할 경계: 고정 창(문자 수) vs 문장 경계 우선 — 기본안은 문장/줄 경계를
  우선하되 없으면 고정 창, overlap은 이번 범위에서 도입하지 않음(품질 튜닝은 후속).
- AC-1·2의 테스트에서 auto 모드의 정규화 해시 함수를 explicit에 재사용할 수 있는지 —
  가능하면 새 코드 최소화(plan에서 확인).
