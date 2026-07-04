# 021 — 색인 저장 성능 (what)

goal: [goal.md](goal.md) · plan: [plan.md](plan.md)

## FR

- **FR-1 진행 저장 시간 스로틀** *(goal: Objective)* — 재색인의 배치 완료 시 진행
  저장은 "마지막 저장 후 `BRAIN_SAVE_INTERVAL`초(기본 10) 경과"일 때만 수행한다.
  `BRAIN_SAVE_INTERVAL=0`이면 매 배치 저장(기존 동작). 실행이 정상 완료되면 마지막에
  항상 저장한다.
- **FR-2 중단-이어감 의미론 불변** *(goal: Constraints)* — 파일 단위 커밋(청크가 모두
  임베딩된 파일만 색인 반영)은 그대로다. 임베딩 오류로 실행이 중단되면 **그때까지
  커밋 완료된 파일 전량이 저장**된다(오류 경로 전용 보강 — 기존의 "마지막 배치까지"
  보다 나빠지지 않으며 실제로는 더 보존적). 정상 완료 경로에는 추가 쓰기를 만들지
  않는다 — 성공 시 색인 전량 쓰기는 기존 말미 저장 1회 그대로다. 강제 종료(SIGKILL
  등)의 유실 상한만 "마지막 진행 저장 이후"로 넓어지고, 재임베딩으로 자가
  치유된다(goal Risks 수용).
- **FR-3 호스트 라우팅 배치 프로파일** *(goal: Problem)* — 재색인 진입점(reindex.sh)은
  임베딩 라우팅이 호스트(GPU)로 판정되면 `BRAIN_BATCH=32`를 기본 주입한다. 판정 입력은
  **reindex.sh가 이미 해석해 둔 `$ENV_FILE`**(`LOCALMIND_ENV_FILE` 격리 존중)에서 읽은
  `OLLAMA_API_BASE` **유효값**에 `host.docker.internal`이 포함되는지 하나다 — 파일 전체
  raw grep은 주석·예시 라인의 host URL에도 반응해 Docker(CPU) 사용자의 배치를 올리는
  오탐이 된다(codex 교차 리뷰 발견). doctor의 litellm.config.yaml 가지는 커밋된
  설정이 `os.environ/OLLAMA_API_BASE` 참조라 리터럴이 존재할 수 없는 죽은 가지이므로
  계승하지 않는다. 사용자가 `BRAIN_BATCH`를 명시하면 그
  값이 항상 우선한다. Docker(CPU) 라우팅이면 주입하지 않는다(기존 8 유지).
  `BRAIN_CONCURRENCY`는 바꾸지 않는다.
- **FR-4 그 외 저장 경로 불변** *(goal: Non-goals)* — removeFromIndex·capture의 단건
  즉시 저장, 원자적 temp+rename 쓰기, 락, reload-merge는 변경하지 않는다.

## Acceptance Criteria

각 AC는 테스트와 1:1 매핑한다. 색인 쓰기 횟수는 테스트 계측 카운터(기존
`indexRunCount` 관례를 따르는 저장 카운터)로 검증한다.

- **AC-1 (FR-1)** Given **8배치 이상**이 필요한 노트 집합(임베딩 스텁, 수 초 내 완료),
  When 기본 간격으로 재색인하면, Then 색인 파일 쓰기는 2회 이하다(진행 저장 0~1회 +
  최종 1회) — 쓰기 횟수가 배치 수에 비례하지 않음을 배치 수와의 격차로 보인다.
  정상 완료 경로에 오류-보강용 추가 쓰기가 없어야 이 상한이 성립한다(FR-2).
- **AC-2 (FR-1)** Given `BRAIN_SAVE_INTERVAL=0`, When 같은 집합을 재색인하면, Then
  배치마다 저장된다(쓰기 횟수 ≥ 배치 수) — 기존 동작으로 복귀 가능. AC-1과의 대비가
  "스로틀이 실제로 쓰기를 줄였다"의 실증이다.
- **AC-3 (FR-2)** Given 특정 노트 내용(마커 텍스트)을 만나면 실패하는 임베딩 스텁 +
  `BRAIN_CONCURRENCY=1`(워커 인터리빙 비결정 제거) + `EMBED_RETRIES=1`, When 재색인이
  비0으로 실패하면, Then 실패 시점까지 커밋된 파일은 색인 파일에 저장되어 있고, 스텁을
  정상으로 되돌린 재실행은 **저장된 파일을 재임베딩하지 않는다**(스텁 호출 계측 —
  나머지만 임베딩).
- **AC-4 (FR-1·2)** Given 재색인이 정상 완료되면, Then 최종 색인 내용(파일·청크
  집합)은 스로틀과 무관하게 동일하다(`BRAIN_SAVE_INTERVAL` 0과 기본값의 결과 비교).
- **AC-5 (FR-3)** Given 호스트 라우팅(.env의 `OLLAMA_API_BASE` 유효값에
  host.docker.internal), When make reindex를 실행하면, Then 재색인 프로세스에
  `BRAIN_BATCH=32`가 전달된다. 사용자가 `BRAIN_BATCH=4`를 명시하면 4가 전달된다.
  호스트 라우팅이 아니면 — **주석·예시 라인에 host URL이 있어도 유효값이 다르면** —
  주입되지 않는다.
- **AC-6 (FR-4)** Given 기존 테스트 스위트(단건 저장·원자성·병합·watcher), When 전체
  실행하면, Then 회귀 없이 green이다.

## 적용 범위 (정직한 한계)

Success metric("쓰기가 시간에 비례")은 **재색인의 진행 저장에 한정**된다. 검색·캡처가
유발하는 색인 갱신 경로의 말미 저장(변경이 없어도 색인 전량 1회 기록)은 이번 범위
밖이며 그대로 남는다 — 개선(무변경 시 저장 생략 등)은 Open questions 4의 별도 후보.

## Open questions

1. 진행 저장 간격의 기본 10초가 적정한가 — 대량 색인에서 저장 1회가 수 초(113MB
   직렬화)일 수 있어, 간격이 저장 소요보다 짧으면 여전히 저장이 지배한다. "간격 또는
   직전 저장 소요 × K 중 큰 값" 같은 적응형이 필요한지(초기값 관찰 후 결정).
2. 벡터를 JSON 숫자 배열 대신 바이너리 사이드카로 분리하는 포맷 개편(저장·로드 모두
   수십 배 여지) — 하위호환 마이그레이션 포함 별도 스펙.
3. 호스트 프로파일에 `BRAIN_CONCURRENCY` 상향도 포함할지 — Ollama NUM_PARALLEL 설정과
   함께 실측 후 판단.
4. 무변경 재색인·검색 경로의 말미 저장 생략(dirty 플래그) — 검색당 색인 전량 쓰기
   제거. 적용 범위 절 참조, 별도 스펙 후보.
5. doctor.sh의 라우팅 표시가 raw grep이라 주석 속 host URL에 "호스트(빠름)"를
   오표시할 수 있다(.env.example 기본 구성에서 실증 — 진단 전용이라 실해는 안내
   오류뿐). FR-3과 같은 유효값 판정으로 정렬하는 후속 후보.
