# 022 — 색인 쓰기·진단 위생 (what)

goal: [goal.md](goal.md) · plan: [plan.md](plan.md)

## 용어

- **무변경 갱신** — `doEnsureIndexed` 1회 실행에서 신규/갱신 임베딩 커밋(pending)도, 프루닝·
  삭제도 0건인 경우. 검색·캡처·링크가 유발하는 색인 갱신의 대다수(코퍼스가 안 바뀌었을 때).
- **dirty** — 이번 실행에서 `idx.files`에 실제 변경이 생김: (a) 임베딩 커밋(신규·해시 변경
  파일), 또는 (b) 프루닝·명시 정리(`REINDEX_PRUNE_LABELS`)·folder-없는 자가치유로 인한
  삭제. dirty가 아니면(clean) 말미 저장을 생략한다.
- **유효값 판정** — `.env` 파일을 raw grep하지 않고 `read_env_val KEY`(주석·비활성 라인
  제외, 라인 앵커 `^KEY=`)로 읽은 활성값으로 판정. 021 FR-3과 동일.
- **고아 라벨 / 부재 라벨** — 020 정의 계승. 고아 = 색인엔 있으나 지금 NOTES_DIR에 등록되지
  않은 라벨(정리 안내 대상). 부재 = 등록됐지만 `readdir` 실패로 열 수 없는 라벨(보존 대상,
  정리 안내 아님).

## FR

- **FR-1 무변경 말미 저장 생략** *(goal: Objective 1, Success metrics)* — `doEnsureIndexed`의
  말미 `saveIndex(idx)`는 이번 실행이 **dirty일 때만** 수행한다. dirty 판정 기준은
  `idx.files`의 추가·삭제라는 사실 하나: (a) pending에서 커밋된 파일이 1개 이상, 또는
  (b) 프루닝(대상 라벨 내 삭제)·명시 정리(`REINDEX_PRUNE_LABELS`)·folder-없는 자가치유로
  삭제된 키가 1개 이상. 둘 다 0이면 clean — 말미 저장을 생략한다. clean이면 색인 파일은
  바이트 단위로 불변이어야 한다(mtime·내용 그대로).

- **FR-2 dirty 판정의 경계** *(goal: Constraints, Risks)* — 판정은 보수적이며 021·020과
  정합한다:
  - **021 진행 저장**(성공 경로, brain.ts 워커 루프의 스로틀 저장)은 dirty 게이트와 무관하게
    그대로다 — 그 저장이 일어났다는 것 자체가 커밋이 있었다는 뜻(pending>0)이므로 이번 실행은
    dirty다. 진행 저장 후 말미 저장은 마지막 배치 커밋을 마저 기록해야 하므로 **pending>0이면
    말미 저장을 반드시 수행**한다(스로틀로 놓친 최종 커밋 보존).
  - **021 finally 저장**(오류 경로, `!completed`)은 불변 — 오류로 중단되면 `doEnsureIndexed`가
    말미(FR-1 게이트)에 도달하지 않으므로 dirty 게이트의 영향 밖이다.
  - **020 후퇴 재색인**(`REINDEX_FALLBACK`)은 프루닝을 전면 보류하므로 삭제는 0이다. 후퇴
    재색인에서 신규 커밋도 없으면 clean → 말미 저장 생략(무변경 후퇴 재색인은 아무것도 쓰지
    않는다). 후퇴 중 신규 임베딩이 있으면 pending>0 → dirty → 저장.
  - **embeddingModel/dims 스탬프-only 변화는 dirty로 세지 않는다**(파일 변경 없이 스탬프만
    바뀐 경우). `idx.dims`는 임베딩 구간(pending>0)에서만 설정되므로 파일 변경에 종속돼 이미
    dirty에 포함된다. `idx.embeddingModel` 무-op 재세팅은 저장을 만들지 않는다. 스탬프가 없던
    구형 색인(pre-스탬프)에서 스탬프만 추가되는 경우의 취급은 **Open questions 1** — 이번
    기본은 "스탬프-only는 저장 안 함"(무-op 재세팅과 동일 취급, 첫 실제 변경 시 함께 영속).

- **FR-3 doctor 라우팅 유효값 판정** *(goal: Objective 2)* — `doctor.sh`의 라우팅 판정을
  raw grep에서 021 FR-3과 동일한 **`read_env_val OLLAMA_API_BASE` 유효값에
  `host.docker.internal` 포함 여부**로 바꾼다. 판정 입력 env 파일은
  `${LOCALMIND_ENV_FILE:-$DIR/.env}` 하나(정합 섹션이 이미 쓰는 해석과 통일 — 라우팅 판정도
  `LOCALMIND_ENV_FILE` 격리를 존중해야 테스트 격리가 성립하고 개발 머신의 실제 `.env`를 읽지
  않는다). `litellm.config.yaml` grep 가지는 **제거**한다 — 모든 `api_base`가
  `os.environ/OLLAMA_API_BASE` 참조라 리터럴 `host.docker.internal`이 존재할 수 없는 죽은
  가지다. 유효값이 host면 호스트 표시, 아니면(주석에 host URL이 있어도) Docker 표시.

- **FR-4 doctor 고아·부재 라벨 안내** *(goal: Objective 2, Background 3)* — doctor는
  고아·부재 라벨을 읽기 전용으로 안내한다. 분류(고아 = 색인 라벨 ∖ 등록, 부재 = 등록됐으나
  readdir 실패)는 **TS 단일 소스**에서 계산한다 — doctor는 셸 정본(`resolve_notes_dir`)으로
  해석한 NOTES_DIR를 TS 리더에 넘기고, 리더는 brain의 FOLDERS 파서 + 색인 라벨 집계로
  분류해 JSON을 돌려주며, doctor는 렌더만 한다(분류 로직 셸 재구현 금지). 규칙:
  - 고아 라벨: 라벨명·항목 수·"보존 중"·정리 명령(`REINDEX_PRUNE_LABELS=<라벨> make reindex`)
    안내(020 FR-4·reindex.ts 문구와 정합).
  - 부재 라벨: "폴더를 열 수 없어 보존 중" 안내만 — **정리 명령을 내지 않는다**(020 FR-4와
    동일: 가드가 지킨 것을 사용자 손으로 지우게 하면 안 됨).
  - **MCP 등록과 무관하게 동작**: 라벨 조회에 쓰는 NOTES_DIR 해석(`resolve_notes_dir` →
    기본값 폴백)은 [노트 폴더 정합] 섹션(MCP 등록이 있을 때만 실행) **밖으로 분리**한다 —
    현재 doctor의 `eff_nd`는 그 섹션 안에서만 정의되므로 그대로 쓰면 MCP 미등록 사용자
    (Codex만 사용·mcp-install 전)에게 이 기능 전체가 조용히 무효화되고, 빈 NOTES_DIR가
    리더에 전달되면 brain의 자체 폴백으로 실제 라벨 전부가 고아로 **오분류**된다(오탐
    금지 위반). 해석된 유효값(빈 값이면 기본 `~/.localmind`)을 항상 리더에 넘긴다.
  - **읽기 전용·무유발**: 이 조회는 재색인·임베딩을 유발하지 않는다(색인 파일 읽기 +
    readdir만 — **mkdir 등 폴더 생성 금지**: doEnsureIndexed의 부트스트랩 mkdir를
    상속하면 부재 라벨을 진단하다 폴더를 만들어 읽기 전용 계약이 깨진다). 색인 파일
    없음·JSON 파싱 실패·node 부재 시 **조용히 생략**(오탐 금지), doctor는 exit 0을
    유지한다. 고아·부재가 모두 0이면 **침묵**(섹션 자체를 출력하지 않음 — 없는 문제를
    만들어 알리지 않는다).

- **FR-5 그 외 저장·경로 불변** *(goal: Non-goals, Constraints)* — `removeFromIndex`·capture의
  단건 즉시 저장, `saveIndex` 자체(원자적 temp+rename·락·reload-merge), 021 진행 저장 스로틀·
  finally 오류 보강, 020 프루닝·후퇴 가드·요약 반환은 변경하지 않는다. 변경이 있는
  재색인의 저장 횟수·최종 색인 내용은 기존과 동일하다.

## 알려진 한계 (스코프 밖 — 정직한 문서화)

- FR-1은 "쓸지 말지"만 다룬다. 저장이 필요할 때의 비용(113MB 전량 직렬화)은 그대로다 —
  포맷 개편(벡터 사이드카 등)은 023.
- FR-4의 라벨 조회는 색인 파일을 파싱한다(`loadIndex` 경유 또는 동등). 113MB 색인에서 파싱
  비용이 수 초일 수 있다 — 벡터까지 메모리에 올리므로 순간 메모리도 든다. 여기에 리더
  실행 자체의 고정 비용이 더해진다: `node --import tsx/esm`가 brain.ts의 전체 모듈
  그래프(agents·skills·runtime 등)를 컴파일·로드하므로 색인 크기와 무관하게 수 초가
  기본이다. `folder` 필드만 뽑는 경량 추출·크기 상한은 Open questions 3. 이번 기본은
  단순 파싱 + 실패 시 조용한 생략.
- FR-4의 등록/부재 분류는 doctor가 넘긴 NOTES_DIR와 brain FOLDERS 파서에 의존한다. 셸·MCP의
  NOTES_DIR가 갈라진 상태(doctor [노트 폴더 정합]가 잡는 그 상태)에서는 셸 유효값 기준으로만
  분류한다 — MCP 등록 기준 분류는 이번 범위 밖(정합 섹션이 별도로 경고).

## Acceptance Criteria

각 AC는 테스트와 1:1 매핑한다. 색인 저장 횟수는 `_saveRunCountForTest` 카운터로, doctor
출력은 `run_doctor` 하니스로 검증한다. 시간 의존·플레이키 어서션 없음(모두 자식 프로세스의
결정적 상태·카운터·문자열 매칭). 경로 예시는 플레이스홀더(`/home/<user>/...`).

- **AC-1 (FR-1)** Given 파일 N개를 색인해 색인 파일이 만들어진 상태에서, When **내용을 하나도
  바꾸지 않고** 같은 색인 파일을 대상으로 재색인(별도 자식 프로세스)하면, Then 그 프로세스의
  색인 저장 횟수는 **0회**다(무변경 → 말미 저장 생략). 색인 파일 mtime·내용은 불변이다.
- **AC-1b (FR-2 스탬프-only 회귀 고정)** Given `embeddingModel` 스탬프가 없는 색인
  파일(구형 — fixture로 스탬프 필드를 제거해 구성)을, When 무변경 재색인하면, Then 저장
  횟수는 0회다(스탬프-only 전이는 dirty가 아님 — 현 기본 정책의 회귀 고정, 정책 변경 시
  이 AC가 드리프트를 잡는다).
- **AC-2 (FR-1)** Given AC-1의 색인 상태에서 파일 1개의 내용을 바꾸고, When 재색인하면, Then
  저장이 최소 1회 발생하고 그 파일이 색인에 반영된다(변경 → dirty → 저장).
- **AC-3 (FR-1)** Given 대상 폴더에서 파일 1개를 삭제하고(프루닝 대상), When 재색인하면,
  Then 그 키가 색인에서 제거되고 저장이 발생한다(삭제 → dirty → 저장).
- **AC-4 (FR-2, 020 정합)** Given 후퇴 신호(`REINDEX_FALLBACK=1`)로 한 번 재색인해 폴백
  폴더 파일이 색인된 상태에서, When **같은 후퇴 재색인을 무변경으로 다시** 실행하면, Then
  저장 횟수는 0회다(후퇴 + 무변경 → 삭제 보류 + 커밋 없음 → clean). 첫 후퇴 재색인에서 신규
  파일이 있으면 저장이 발생한다.
- **AC-5 (FR-5, 021 회귀)** Given 8배치 이상이 필요한 변경 재색인, When 기본 간격으로
  실행하면, Then 021 AC-1의 저장 상한(≤2회)과 AC-2(간격 0 → 배치마다)·AC-4(결과 동일성)가
  그대로 성립한다(dirty 게이트가 변경 있는 성공 경로 저장을 없애지 않음 — 021 스위트 green
  유지).
- **AC-6 (FR-3)** Given `.env`에 주석 라인 `# OLLAMA_API_BASE=...host.docker.internal...`과
  유효값 `OLLAMA_API_BASE=http://ollama:11434/v1`이 함께 있을 때(LOCALMIND_ENV_FILE로 주입),
  When `make doctor`를 실행하면, Then "현재 라우팅"이 **Docker**로 표시된다(주석 host URL
  오탐 없음). 유효값이 `host.docker.internal`이면 호스트로 표시된다.
- **AC-7 (FR-3, 죽은 가지)** Given doctor.sh 소스, Then 라우팅 판정은
  `read_env_val OLLAMA_API_BASE`를 쓰고 `litellm.config.yaml`를 grep하지 않는다(배선
  어서션 — 021 reindex.sh 판정과 동일 소스임을 고정).
- **AC-8 (FR-4)** Given 색인 파일에 고아 라벨 `old`(등록 밖)의 항목과, 등록됐지만 폴더가 없는
  부재 라벨 `gone`이 있는 상태(BRAIN_INDEX·NOTES_DIR를 하니스로 주입), When `make doctor`를
  실행하면, Then 출력에 `old`의 라벨명·항목 수·정리 명령(`REINDEX_PRUNE_LABELS`)이 나오고,
  `gone`은 "폴더 없음/보존" 안내만 나오며 정리 명령이 **안** 나온다. RC는 0이다. 그리고
  부재 라벨 `gone`의 폴더가 **생성되지 않았음**을 함께 어서션한다(읽기 전용 계약).
- **AC-8b (FR-4, MCP 미등록)** Given AC-8과 같은 색인·NOTES_DIR 상태에서 **MCP 설정
  파일이 없을 때**(LOCALMIND_MCP_CONFIG를 없는 경로로 주입 — [노트 폴더 정합] 섹션이
  아예 실행되지 않는 구성), When `make doctor`를 실행하면, Then 고아·부재 라벨 안내가
  AC-8과 동일하게 출력된다(라벨 진단이 MCP 등록 유무에 종속되지 않음). RC는 0이다.
- **AC-9 (FR-4, 오탐 금지)** Given 색인 파일이 없거나(경로 부재) JSON이 손상됐을 때, When
  `make doctor`를 실행하면, Then 고아·부재 라벨 안내가 출력되지 않고(없는 문제를 만들지 않음)
  RC는 0이다. node가 없어 조회 불가한 경우도 동일하게 조용히 생략한다.

## Open questions

1. **구형 색인 스탬프 영속**: `embeddingModel` 스탬프가 없던 색인(pre-스탬프 v4)에서 파일
   변경 없이 스탬프만 추가되는 경우, 이번 기본은 저장하지 않는다(무-op 취급). 이 경우
   `saveIndex`의 merge 가드(`disk.embeddingModel === idx.embeddingModel`)가 다중 프로세스에서
   잠시 병합을 건너뛸 수 있다. "그 사이엔 병합할 변경이 없다"는 근거에는 예외가 하나 있다 —
   `removeFromIndex`(단건 삭제)는 구형 색인을 스탬프 없이 그대로 저장할 수 있어, 다른
   프로세스가 그 삭제의 병합을 건너뛸 수 있다(022 이전에는 clean 실행의 말미 저장이
   스탬프를 조기 영속시켜 이 창이 좁았다 — 022가 창을 넓힌다). 스킵되는 것이 삭제뿐이라
   다음 스캔의 프루닝으로 재수렴하므로 실유실은 없다고 판단하나 **미실증(추정)**이다.
   "깔끔함"을 위해 스탬프-only 전이를 1회 저장으로 승격할지(총 O(1) 추가 쓰기, 자동
   테스트는 어려움) — 관찰 후 결정. 현 기본의 회귀는 AC-1b로 고정.
2. **검색 외 진입점의 dirty 기여**: capture 경로도 `ensureIndexed`를 거치는데, 캡처 자체는
   단건 즉시 저장(FR-5 불변)이고 그 뒤 검색성 조회의 말미 저장이 dirty 게이트를 탄다. 캡처
   직후 첫 검색이 무변경으로 판정돼 저장을 생략하는 것이 캡처 반영과 어긋나지 않는지
   (캡처는 자기 경로에서 이미 저장했으므로 일치) — 미실증, 회귀 스위트로 커버되나 명시 확인
   필요.
3. **라벨 조회 비용 상한**: FR-4가 113MB 색인을 파싱하는 비용. `folder` 필드만 스트리밍
   추출(벡터 미적재)하거나, 색인 크기 상한을 두고 초과 시 "색인이 커서 라벨 요약을
   생략했어요"로 안내할지. macOS 기본에 `timeout` 부재라 외부 타임아웃은 비이식적 — TS 리더
   자체의 크기 가드가 현실적. 초기값 관찰 후 결정.
4. **doctor 라벨 안내의 섹션 배치**: 0건 침묵은 FR-4에서 확정했다(섹션 미출력). 남는 것은
   출력 시의 배치 — [노트 폴더 정합] 섹션에 합칠지 새 [색인 라벨] 섹션으로 둘지(단, FR-4의
   MCP 무관 동작 요건상 정합 섹션 **안**에 넣을 수는 없다 — 별도 섹션이 자연스러움).
