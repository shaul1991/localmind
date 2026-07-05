# Spec: 바이브 코딩 워크플로우 개정 — 실전 발견 F1~F3 반영 (what)

goal: [goal.md](goal.md) · plan: [plan.md](plan.md)

## Scope

문구 수준 개정 3건: ① 계약 경로에 "노트 폴더" 명시(F1), ② design.md 게이트 무대별
분기(F2 — 사용자 결정 반영), ③ 바이브 프로젝트 design.md 표준 위치 규약화(F3). 대상은
페르소나 본문(templates/agents + 이 기기 정본)·계약 템플릿 헤더·AGENTS.md·docs. 신규
코드·페르소나·문서 종류 없음. F4는 Open question 기록만.

## FR

- **FR-1 (F1 — 계약 경로 "노트 폴더" 명시)** *(goal: Problem F1)* — `projects/<project>/`를
  언급하는 모든 규약 문구를 "**노트 폴더의** `projects/<project>/`"로 조인다:
  - 페르소나 본문 7종: architect·backend-dev·infra(owner 소유 문구), frontend-dev·ios-dev·
    android-dev(소비 확인 문구), **designer**(토큰 포인터 문구의 projects/ 언급 — 리뷰
    결함 5: 동종 이탈 소지).
  - 계약 템플릿 4종 헤더: 위치 안내가 있으면 노트 폴더 표기 확인, 없으면 1줄 추가
    ("위치: 노트 폴더의 `projects/<프로젝트 이름>/`").
  - AGENTS.md 계약 절은 이미 "노트 폴더의 projects/"를 명시 — 불변 확인만.
- **FR-2 (F2 — design.md 게이트 무대별 분기)** *(goal: Problem F2, 사용자 결정)* —
  - AGENTS.md "디자인·UI/UX 작업" 절에 분기 명문화: **SDD 무대(specs/)** 는 기존대로
    "design.md 완성 + 사용자 확인 후 구현"(불변). **바이브 코딩 무대**는 "design.md가
    없으면 designer(정의)를 먼저 거쳐 만든 뒤 **즉시 구현 가능** — 단 design.md를 새로
    만들었다는 사실과 위치를 **보고 맨 앞에 명시**한다(사후 검토 가능성 확보)".
  - **AGENTS.md "바이브 코딩" 절의 게이트 문구도 함께 개정(리뷰 결함 2 — 필수)**: 현행
    "UI 작업은 design.md 게이트가 우선: … 026 디자인 게이트(사전 정의·사용자 확인)가
    완화 게이트보다 우선한다"가 분기 후 자기모순이 된다 — "우선" 원칙은 유지하되 괄호
    내용을 "(사전 정의 — 확인 규칙은 무대별: 디자인 절 참조)"류로 바꿔 분기를 가리키게
    한다. 이 절을 빠뜨리면 바이브 에이전트가 읽는 절에 옛 규칙이 남는다.
  - UI dev 3종(frontend·ios·android) 본문의 design.md 게이트 문구에 동일 분기 반영
    (기존 "없으면 사용자에게 알림"을 바이브 무대에선 "designer 정의 선행 + 생성 명시"로).
  - designer 본문 원칙 1("사용자 확인을 받은 뒤에만 워커에게")에 바이브 무대 단서 추가
    (바이브에서는 정의 완성 즉시 핸드오프 가능 — 생성 명시 조건).
- **FR-3 (F3 — 바이브 design.md 위치 규약화)** *(goal: Problem F3)* —
  - AGENTS.md 계약 절(또는 디자인 절)에 명시: 바이브 코딩 프로젝트의 design.md 표준
    위치는 **노트 폴더의 `projects/<project>/design.md`**(계약 저장소와 동거 — 백업·기기
    동기화·context-map 포인터 정합). SDD 무대는 기존 `specs/{NNN}-{slug}/design.md` 불변.
  - `templates/contracts/context-map.template.md`의 디자인 토큰 포인터 예시를 두 무대
    병기로 갱신({예: specs/012-checkout/design.md 또는 이 폴더의 design.md}).
  - UI dev 3종·designer 본문의 design.md 언급에 바이브 위치 1줄(확인 순서: 프로젝트
    계약 저장소의 design.md).
- **FR-4 (F4 — 관찰 기록)** *(goal: Non-goals)* — 규약 변경 없음. 이 spec의 Open
  questions에 F4(frontend의 서버 훅 수정 회색지대)를 기록한다.

## Acceptance Criteria

> 기존 하니스(src/agents/seed.test.ts) 재사용. AC 라벨 "030 AC-n". 검사 스코프는 029
> 관례(본문 grep은 파일, description 검사는 파싱 필드).

- **AC-1 (FR-1 노트 폴더 명시 — 줄 단위)** Given 페르소나 7종(architect·backend-dev·
  infra·frontend-dev·ios-dev·android-dev·**designer**) 본문, Then `projects/<project>/`를
  포함하는 **각 줄**에 "노트 폴더" 문자열이 함께 있다(줄 단위 검사 — 리뷰 결함 1: 파일
  단위는 5/7이 guides 확인 줄의 기존 "노트 폴더"로 거짓 통과함을 실측. 계약 문구는
  한 줄로 작성돼 있어 줄 단위가 결정적). Given 계약 템플릿 4종, Then **각 파일이
  무조건** "노트 폴더" 위치 안내를 포함한다(조건부 아님 — 현행 템플릿은 projects/
  미언급이라 조건부 검사는 공백 통과, 리뷰 결함 1).
- **AC-2 (FR-2 게이트 분기)** Given AGENTS.md 디자인 절, Then SDD 무대의 불변 앵커
  **"사용자 확인 후 실행"**(무대 고유의 긴 연속 문자열 — 리뷰 결함 3: 짧은 "사용자 확인"은
  바이브 분기 문구와 부분 문자열 충돌로 거짓 통과 가능. **바이브 분기 문구에는 이 정확한
  연속 문자열을 쓰지 않는다**)이 존재하고(회귀), 바이브 무대의 "즉시 구현"과 "맨 앞에
  명시" 취지 문구가 추가돼 있다(grep). Given AGENTS.md **바이브 코딩 절**, Then 게이트
  우선 문구가 **신설 연속 문자열 "확인 규칙은 무대별"을 포함**한다(리뷰 결함 2 + 재검
  잔존-A — 부정 앵커("…원문 부재")는 현행 원문이 라인랩으로 분절돼 있어 grep이 항상
  빈 결과 = 공허 통과. 편집을 강제하는 **긍정 앵커**로 대체: 구현자가 이 연속 문자열을
  한 줄로 새로 쓰지 않으면 red — 라인랩 안전 + 자기모순 문구 제거를 함께 강제). Given UI dev 3종·designer 본문, Then 바이브 분기(정의 선행 +
  생성 명시) 문구가 있고, **designer 원칙 1의 SDD 확인 취지 문구("확인을 받은 뒤에만")가
  불변**이다(리뷰 결함 4 — 회귀 고정. **바이브 단서 문구에는 이 연속 문자열을 쓰지
  않는다** — 재검 잔존-B, SDD 앵커와 동일한 무대 간 어휘 충돌 가드).
- **AC-3 (FR-3 design.md 위치)** Given AGENTS.md와 context-map 템플릿, Then
  `projects/<project>/design.md`(또는 "이 폴더의 design.md") 취지 표기가 있고, SDD 위치
  (`specs/`) 병기가 유지된다(grep).
- **AC-4 (회귀)** Given templates/agents/를 loadRegistry로 파싱하면, Then problems 0 ·
  19종 불변 · 편집된 페르소나 description 불변(계약·디자인 트리거 어휘 미도입 — 029 AC-8
  스코프 계승: 파싱된 description 필드만). frontend-dev의 027 게이트 우선 문구·architect의
  026 경계 문구 등 기존 단언 전체 green(기존 테스트 스위트).
- **AC-5 (위생)** Given 편집된 전 파일, Then `/Users/` 부재·`/home/`은 플레이스홀더만
  (grep — 테스트 하니스 제외, 027 방식).

> **정직한 한계**: 게이트 분기·위치 규약의 실효는 페르소나 규율 의존(CI 미검증 — 026~029
> 계승). F1의 재발 여부는 다음 실전에서 관찰한다.

## Open questions

1. **F4 — frontend의 서버 훅 수정 회색지대**: same-origin 정적 서빙처럼 "frontend를 위한
   서버 코드"의 소유가 모호. 이번엔 표면화+owner 수복으로 무해했음 — 반복되면 backend-dev
   핸드오프 강제 또는 "표면화 조건부 허용"을 명문화.
2. **바이브 design.md 품질 관찰**: 확인 생략으로 정의가 형식화되면 "확인 필수"로 재론
   (goal Risks).
3. **memo-api 미해결 드리프트 4건**: 테스트 산출물 — 계약 원장에 추적 중. 놀이터를 실전
   레퍼런스로 승격할지 폐기할지는 사용자 판단.
