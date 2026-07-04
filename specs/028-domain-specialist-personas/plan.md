# Plan: 바이브 코딩용 도메인 스페셜리스트 페르소나 세트 (how)

goal: [goal.md](goal.md) · spec: [spec.md](spec.md)

## 접근 요약

새 메커니즘을 만들지 않는다 — 016 레지스트리(파싱·검증·렌더·배포)와 026 시드
(seedAgents fill-missing)를 그대로 재사용하고, **콘텐츠만 추가**한다(페르소나 정본 9 +
가이드 템플릿 1 + AGENTS.md 절 + critic/worker 소폭 편집 + personas.md 갱신). 026이
brain.ts·backup 무변경으로 페르소나를 추가한 것과 동일 스코프. "완화 게이트"는 코드 게이트가
아니라 **페르소나 preamble + 규약 문서**로 강제한다(design.md식 강제와 달리, 부재 시 진행을
막지 않고 "명시하고 진행").

## 도메인 경계

- **레지스트리 도메인(src/agents/)**: 코드 무변경 — seedAgents·loadRegistry·렌더 불변.
  테스트만 갱신(TEN→19 상수 + 028 describe 블록).
- **콘텐츠(templates/·docs/·AGENTS.md)**: 페르소나 정의·가이드 템플릿·규약 — 코드 아님.
- **불변**: 017 런타임 위임(도메인 dev 자동 개입 없음), 019 asset-mirror(가이드 백업 배관
  없음), brain.ts 인덱스(가이드 제외 없음 — 검색 대상 유지), 016 렌더러·Codex 타깃.

## 영향 모듈

| 파일 | 변경 | 내용 |
|---|---|---|
| `templates/agents/{backend-dev,frontend-dev,ios-dev,android-dev,infra,data-platform,auth-dev,dba}.md` | 신규 | FR-1 — 016 스키마(중첩 targets, model: opus, tools 없음) + 4절 + 완화 게이트. frontend-dev에 design.md 게이트 계승 |
| `templates/agents/security-reviewer.md` | 신규 | FR-2 — model: opus, tools: Read,Grep,Glob,Bash. ux-reviewer 패턴(도메인 리뷰, 최종은 critic) |
| `templates/agents/critic.md` | 수정 | FR-2b — description에서 보안 도메인 트리거 양도 + body 핸드오프 1줄 |
| `templates/agents/worker.md` | 수정 | FR-5 — 비소유에 도메인 위임 1줄 + 기존 design.md 게이트 문구의 UI 소유 분할(웹→frontend-dev, 모바일→ios/android-dev, 도메인 미지정 UI만 worker — 리뷰 결함 4). description 불변 |
| `templates/guides/guide.template.md` | 신규 | FR-3 — 4섹션(스택·컨벤션·금지사항·참조) |
| `AGENTS.md` | 수정 | FR-4 — "바이브 코딩 — 도메인 스페셜리스트" 절(완화 게이트 + `cp` 가이드 안내 + 명시 위임 시작) |
| 노트 폴더 `agents/{critic,worker}.md`(정본 — 이 기기) | 수정 | FR-2b·FR-5를 templates와 동일하게 직접 1회 반영(기존 사용자는 시드가 안 덮으므로 — 026 선례). 신규 9종은 시드로 자동 전파 |
| `docs/personas.md` | 수정 | FR-7 SSoT 19종 + 바이브 코딩 무대 + 도메인 축 재조정 + 어휘 배정 |
| `docs/agents.md` | 판단 | 페르소나 카탈로그를 나열한다면 9종 추가(구현 시 확인 — 없으면 생략) |
| `src/agents/seed.test.ts` | 수정 | 026 `TEN`→`NINETEEN`(또는 목록 상수) + "정확히 10종"→19 회귀 갱신 |
| `src/agents/*.test.ts`(028 블록) | 신규/수정 | AC-1~10 |
| `scripts/*.test.sh`(배선 grep) | 판단 | AC-6 게이트 grep을 어느 셸 테스트에 얹을지 구현 시 판단(신규 파일 지양) |

## 페르소나 설계 (콘텐츠 정본 — 구현 시 spec 배정표 + 아래 요지 그대로)

- **공통(구현 8종)**: model opus(바이브 코딩 = 명세 부재 구현 — goal Constraints), tools 라인 없음. 소유=도메인 구현·테스트. 비소유=구조/
  경계→architect, 요구 발굴→interviewer, 최종 게이트→critic, 보안 리뷰→security-reviewer,
  + 인접 도메인 핸드오프(배정표). 원칙=완화 게이트 문구 + "모호하면 멈추고 반환"(worker
  규율) + 도메인별 모범 사례 강조점. 출력형식=변경 파일 + AC/요구 충족 + 테스트 결과 +
  적용한 가이드 유무.
- **완화 게이트 표준 문구(전 도메인 dev 원칙에 동일)**: "작업 전 `<노트 폴더>/guides/
  {domain}.md`를 확인한다. 있으면 그 스택·컨벤션·금지사항을 따른다. 없으면 일반 모범
  사례로 진행하되 '도메인 가이드 없음 — 일반 관례로 진행'을 보고에 명시한다."
- **frontend-dev 추가**: design.md가 있으면 그 정의를 따른다(디자인 정의는 designer, 사용성
  점검은 ux-reviewer). worker의 design.md 게이트를 도메인판으로 계승.
- **security-reviewer**: model opus 고정(다운시프트 금지 🔖). "결함을 찾으러 간다" 규율
  (critic·ux-reviewer와 동일, 도메인만 보안). 소유=취약점·위협 모델링·시큐어 코딩·공급망.
  비소유=인증 구현→auth-dev, 수정→도메인 dev, 최종 판정→critic. 검증 도구 체인은
  ux-reviewer식으로 "가능한 최상위 증거로 검증하고 한계 명시"(스캔 결과가 있으면 해석,
  없으면 정적 리뷰 + 미검증 명시).
- **critic 편집(FR-2b)**: description "보안·정확성 리뷰" → 보안 도메인 트리거 제거(예:
  "정확성·추적성 리뷰"). body에 "깊은 보안 도메인 리뷰(위협 모델링·취약점 스캔 해석)는
  security-reviewer의 몫 — 최종 게이트에서 명백한 보안 결함은 여전히 잡는다" 1줄.

## 단계 (TDD)

1. **실패 테스트** — AC-1(파싱·19종), AC-2(4절·핸드오프), AC-3(어휘 서로소 pairwise 문자열),
   AC-4(critic 양도), AC-5(모델 티어), AC-6(가이드 템플릿·게이트 grep), AC-7(시드·멱등),
   AC-8(worker 경계), AC-9(위생), AC-10(personas.md). seed.test.ts 026 상수(TEN→19)
   갱신을 회귀로 함께.
2. **콘텐츠** — 신규 9종 정본(016 스키마) + 가이드 템플릿 작성. **동봉 전 개인화·특정 스택
   지칭 전수 검토**(AC-9 의미 판단분). description은 작성 후 AC-3 문자열 검사를 먼저 돌려
   서로소 확인.
3. **기존 정본 편집** — critic(FR-2b) + worker(FR-5): templates/agents + 노트 폴더 정본
   양쪽 동일 반영.
4. **규약·SSoT** — AGENTS.md 바이브 코딩 절 + personas.md 19종 재조정.
5. **회귀** — 기존 registry/deploy 테스트 + 026 시드 테스트(상수 갱신) + 전체 스위트 green.
6. **self-review** — 독립 크리틱 + codex 교차(018), clean까지. 검증 관점: 어휘 서로소
   (특히 critic↔security-reviewer, worker↔backend-dev, ios↔android의 "앱"), 시드 멱등,
   완화 게이트 문구가 design.md식 강제로 오해되지 않는지, 위생.

## 주의점 (설계 검토에서 발견)

- **critic 실측 충돌(FR-2b 필수)**: critic 현행 description이 "보안·정확성 리뷰"를
  claim한다(templates/agents/critic.md:3). security-reviewer 도입 시 정면 충돌 — 반드시
  양도해야 AC-3/4가 통과. 이건 028이 기존 페르소나를 수술하는 유일 지점.
- **정본 스키마(026 F1 계승)**: 정본은 중첩 `targets:` 블록. top-level model/tools는
  loadRegistry가 REJECTED. sample-persona.md 형식을 따를 것.
- **구현자 tools 관례**: worker는 tools 라인이 없다(기본 도구 셋 = 구현 가능). 구현 8종도
  동일하게 tools 생략. 리뷰어(security-reviewer)만 tools 명시(쓰기 없음 — critic/ux-reviewer
  동형).
- **가이드 시드 금지**: 도메인 가이드 파일은 시드하지 않는다(범용 백엔드 가이드가 없음).
  seedAgents는 `templates/agents/`만 스캔하므로 `templates/guides/`는 자동으로 시드 대상
  아님 — 별도 가드 불필요. 사용자는 `cp`로 시작(AGENTS.md 안내).
- **"앱" 공유 위험어**: ios/android(/hybrid) 배정 noun은 "iOS 앱"·"안드로이드 앱"처럼
  플랫폼 noun 결합. bare "앱"을 배정 noun으로 쓰지 말 것(AC-3 서로소 깨짐).
- **UI 소유 분할(결함 4)**: worker.md의 026 게이트 문구가 "UI 구현은 worker"를 여전히
  주장하므로 FR-5에서 반드시 재조정 — 게이트(design.md 확정 후)는 유지하되 소유를
  frontend/ios/android-dev와 분할. frontend·ios·android-dev 본문에 "design.md 강제 게이트가
  완화 게이트보다 우선" 공존 규칙 명문화.
- **worker↔도메인 dev 잔여 tie**: 어휘 서로소로 대부분 해소되나 "그냥 구현해줘"는 잔여.
  라우팅 실동작은 테스트 불가(정직한 한계 — spec 명시). worker body 위임 문구가 유일한
  완화.
- **가이드 백업 갭**: ~/.localmind/guides는 019 asset-mirror 대상도 git 저장소도 아니라
  기본 위치면 미백업. 028 범위 밖 — Open q. AGENTS.md 안내에서 "git 노트 저장소에 두면
  백업됨"을 부기.

## 테스트 전략

- 시드·배포: 026 seed.test.ts 관례(임시 폴더 fixture) 재사용 + TEN→19 상수 갱신.
- 어휘 서로소(AC-3): 배정표를 데이터로 둔 **full pairwise**(양방향 — 기존이 신규 noun을
  품는 역방향 포함) 정적 문자열 검사(결정적·빠름). 인접 핸드오프(AC-2)도 도메인별 필수
  목록을 데이터로. 라우팅
  실동작은 Claude 내부라 미검증(정직한 한계 — 026과 동일).
- 게이트·가이드(AC-6): grep — 완화 게이트의 실효는 규약 준수에 달려 있음을 spec이 인정.

## 모델 역할 배치

- 페르소나 정본·규약 문구(어휘 배정·경계): 최상위 티어 🔖(라우팅 품질을 결정 — 여기가
  틀리면 아래가 다 틀림).
- 시드 테스트 상수 갱신·SSoT 표: 루틴/저위험 기계 작업(sonnet/haiku).
- 도메인 dev 런타임 티어는 opus(사용자 결정 — spec 배정표), 이 plan의 "작성 작업" 티어와 별개.
- self-review: opus + codex 교차(다운시프트 금지).
