# Plan: 프로젝트별 계약 저장소 — DDD 차용 (how)

goal: [goal.md](goal.md) · spec: [spec.md](spec.md)

## 접근 요약

새 메커니즘을 만들지 않는다 — 028이 `guides/`를 노트 폴더 하위 콘텐츠로 세운 것을 그대로
따라, **`projects/{project}/`를 콘텐츠 규약으로만 추가**한다(백업·인덱스·배포 파이프라인
전부 무변경 — brain.ts 제외 목록 미추가로 인덱스 포함, git 백업 자동 편입). 산출물은
**콘텐츠뿐**: 계약 템플릿 4종 + AGENTS.md 절 + 기존 페르소나 7종 본문 최소 수술 + docs 갱신.
026/027 design.md 정본 위계와 028 완화 게이트를 **조합**한 게이트를 규약 문서·페르소나
preamble로 강제한다(코드 게이트 아님 — 부재는 진행, 드리프트는 결함).

## 도메인 경계

- **레지스트리·런타임 코드(src/)**: 무변경 — seedAgents·loadRegistry·렌더·brain.ts 인덱스
  불변. 테스트만 갱신(seed.test.ts에 029 describe 블록 추가, ALL 19종 불변 회귀).
- **콘텐츠(templates/·docs/·AGENTS.md·templates/agents/)**: 계약 템플릿·규약·페르소나 본문 —
  코드 아님.
- **불변**: 016 렌더러·시드 함수, 017 런타임 위임(계약 자동 로딩 없음), 019 asset-mirror
  (계약 백업 전용 배관 없음 — 노트 폴더 하위라 공짜), 026/027 design.md 정본(토큰 복제 금지),
  028 도메인 가이드·완화 게이트·9종 페르소나. 페르소나 **description 전부 불변**(신규 트리거 0).

## 영향 모듈

| 파일 | 변경 | 내용 |
|---|---|---|
| `templates/contracts/context-map.template.md` | 신규 | FR-2 — bounded context·관계·관련 문서 포인터(design.md 위치) |
| `templates/contracts/ubiquitous-language.template.md` | 신규 | FR-2 — 엔트리 형식(용어·정의·bounded context·금지 동의어) + 갱신·충돌 규율 |
| `templates/contracts/api-contract.template.md` | 신규 | FR-2 — 엔드포인트·요청·응답·상태 코드 + 드리프트 규칙 |
| `templates/contracts/environments.template.md` | 신규 | FR-2 — 환경·URL·env 이름 + **시크릿 금지 경고**(최상단) |
| `AGENTS.md` | 수정 | FR-3·7 — "프로젝트 계약 저장소" 절(2축·식별·게이트 조합·시크릿 금지·`cp`·localmind 예외) |
| `templates/agents/architect.md` | 수정 | FR-4 — 소유에 context-map·용어집 소유 1줄(기존 "유비쿼터스 언어" 실체화, 기존 문구 불변) |
| `templates/agents/backend-dev.md` | 수정 | FR-4 — 소유에 api-contract 소유 + 동시 갱신 1줄 |
| `templates/agents/infra.md` | 수정 | FR-4 — 소유에 environments 소유 + 시크릿 금지 1줄 |
| `templates/agents/frontend-dev.md` | 수정 | FR-5 — 원칙에 계약 소비 확인 1줄(design.md 게이트 문구 불변) |
| `templates/agents/ios-dev.md` | 수정 | FR-5 — 원칙에 계약 소비 확인 1줄 |
| `templates/agents/android-dev.md` | 수정 | FR-5 — 원칙에 계약 소비 확인 1줄 |
| `templates/agents/designer.md` | 수정 | FR-6 — 토큰 복제 금지·design.md 포인터 1줄 |
| 노트 폴더 `agents/{architect,backend-dev,infra,frontend-dev,ios-dev,android-dev,designer}.md`(이 기기 정본) | 수정 | 시드가 기존 정본을 안 덮으므로(026 선례) templates와 동일하게 직접 1회 반영 |
| `docs/agents.md` | 수정 | FR-8 — "프로젝트 계약 저장소" 절(소유 매트릭스·시크릿 경고·localmind 예외) |
| `docs/personas.md` | 수정 | FR-8 — 계약 소유 각주(로스터 불변) |
| `src/agents/seed.test.ts`(029 블록) | 신규/수정 | AC-1~10. ALL 19종 불변 회귀 |

> **시드 없음**: 계약 템플릿은 `templates/contracts/`에 두고 seedAgents는 `templates/agents/`만
> 스캔하므로 자동 시드 대상이 아니다(028 guides와 동일 — 별도 가드 불필요). 사용자는 `cp`로 시작.

## 계약 문서 스키마 (콘텐츠 정본 — 구현 시 spec FR-2 + 아래 요지)

- **context-map.md**: ① bounded context 목록(이름·책임 한 줄) ② 관계 — **실용 3종만**
  (의존·상하류(upstream/downstream)·공유(shared kernel)), 원어는 평이한 한국어 병기(리뷰
  경미 6 — conformist·anti-corruption layer 등 전체 패턴 나열은 "실용 차용" 초과라 제외,
  심화는 DDD 원전 참조 각주로) ③ 관련 문서 포인터
  (api-contract·environments·ubiquitous-language + **design.md 위치** — 토큰 복제 금지) ④ 소유:
  architect. 프로젝트 진입점 겸용.
- **ubiquitous-language.md**: 표 형식 — `용어 | 정의 | bounded context | 금지 동의어 | 근접어
  구분`. 헤더에 규율: architect 소유, 전 페르소나 제안 가능, 같은 단어가 컨텍스트마다 다르면
  bounded context 한정으로 **병기**(bare 용어는 크로스 컨텍스트 소통 금지), 해소 불가 충돌은
  architect가 근거와 함께 판정(요구 모호 시 interviewer).
- **api-contract.md**: 엔드포인트별 — 메서드·경로·요청 형태·응답 형태·상태 코드·에러 표면.
  헤더에 드리프트 규칙(계약 정본, owner=backend-dev가 API 변경 시 동시 갱신, 소비자 불일치=결함).
- **environments.md**: **최상단 경고 박스**("⚠️ 시크릿 값 절대 금지 — 이 파일은 백업 저장소에
  커밋됩니다. 실제 값은 프로젝트 `.env`(git-ignore)에, 여기엔 환경변수 **이름**과 용도만").
  환경별(로컬·스테이징·프로덕션) 서비스 URL·env 이름 표. 소유: infra.

## 페르소나 수술 (최소 — 028 완화 게이트에 계약 확인 얹기)

- **표준 소비 문구(소비자 UI dev 3종 원칙에 동일)**: "작업 전 프로젝트 `projects/<project>/`의
  `api-contract.md`·`environments.md`를 확인한다. 있으면 계약을 정본으로 따르고(코드 불일치는
  드리프트 결함 — 계약이 이긴다), 없으면 일반 관례로 진행하되 '계약 문서 없음 — 일반 관례로
  진행'을 명시한다. 충돌 시 표면화하고 사용자 결정을 요청한다."
- **소유 문구(owner 3종 소유 절)**: architect=context-map·ubiquitous-language 소유·갱신·판정,
  backend-dev=api-contract 소유·동시 갱신, infra=environments 소유·시크릿 금지. 전부 **기존
  소유/비소유 문구에 1줄 추가**(제거·재배치 금지 — 회귀 안전).
- **designer(FR-6)**: 토큰 복제 금지 + design.md 정본 포인터 1줄(026 방어).
- **description 전부 불변**: 신규 트리거 어휘를 만들지 않는다(부분 문자열 함정 — bare "토큰"·
  "환경"·"계약" 등이 기존 description과 충돌할 위험 원천 차단). 라우팅은 명시 위임 + 보편
  규칙(AGENTS.md)으로.

## 단계 (TDD)

1. **실패 테스트(seed.test.ts 029 블록)** — AC-1(계약 템플릿·섹션), AC-2(시크릿 금지·백업
   경고), AC-3(owner 소유 + architect 기존 단언 불변 회귀), AC-4(게이트 조합·충돌·식별),
   AC-5(소비자 확인 + frontend design.md 문구 불변 회귀), AC-6(용어집 규율), AC-7(토큰
   포인터), AC-8(파싱 19종 불변 + description 트리거 부재), AC-9(localmind 예외), AC-10(위생).
2. **콘텐츠** — 계약 템플릿 4종 작성. **동봉 전 개인화·특정 스택·시크릿 예시 값 전수 검토**
   (AC-10 의미 판단분 + AC-2 시크릿). environments 경고 박스 최우선.
3. **페르소나 본문 편집** — templates/agents 7종 + 노트 폴더 정본 7종 동일 반영(기존 문구
   불변 확인 — architect "화면 상태 전이"·frontend design.md 게이트 회귀).
4. **규약·docs** — AGENTS.md 계약 절 + docs/agents.md 절 + personas.md 각주.
5. **회귀** — 기존 registry/deploy/seed 테스트 green(19종 불변) + 028 어휘 서로소 테스트
   불변(description 미편집이므로 자동 통과) + 전체 스위트.
6. **self-review** — 독립 크리틱 + codex 교차(018), clean까지. 검증 관점: 시크릿 금지 실효
   (environments 템플릿에 실제 값 예시가 새지 않는지), description 불변(트리거 어휘 미도입),
   게이트 조합이 design.md식 강제로 오해되지 않는지(부재는 완화), architect/frontend 기존
   단언 회귀, localmind 예외 명확성.

## 주의점 (설계 검토에서 발견)

- **시크릿 유출이 최대 위험**: environments.md는 노트 폴더 → 백업 커밋(docs/agents.md §7).
  템플릿에 실제 값 형태 예시(`API_KEY=sk-...`)를 **절대 넣지 않는다** — 이름·용도만. 경고
  박스를 최상단에. **1차 방어는 단계 2의 사람 전수 검토**이고 AC-2 grep(2구문 + 접두)은
  보조 가드일 뿐이다 — grep을 완결 가드로 표기하지 않는다(리뷰 중대 1). 이것이 029의
  유일한 안전 결함 원천.
- **description 불변 필수**: bare "계약"·"환경"·"토큰"·"용어"는 기존 description과 부분 문자열
  충돌 위험(026 AC-2·028 AC-3 실증 클래스). 029는 신규 트리거 0 — 본문·AGENTS.md·템플릿에만
  계약 어휘를 둔다. AC-8이 편집 7종 description의 계약 어휘 부재를 grep으로 고정(단,
  backend-dev의 기존 description 원문 실측을 기준으로).
- **기존 단언 회귀(seed.test.ts 실측)**: architect 본문은 "화면 상태 전이"/"시스템 데이터
  흐름"을(026 AC-1b), frontend는 design.md 게이트를 담는다 — 029 편집은 **추가만** 하고
  이 문구를 건드리지 않는다. AC-3·AC-5가 불변 회귀로 잡는다.
- **정본 스키마 불변(026 F1)**: 본문만 편집 — frontmatter(중첩 targets)는 손대지 않는다.
  loadRegistry는 frontmatter만 검증하므로 본문 편집은 파싱에 무영향(AC-8 problems 0).
- **guides/ vs projects/ 형제 결정 근거**: `guides/projects/` 하위안은 도메인 가이드(도메인
  축)와 프로젝트 계약(프로젝트 축)을 한 우산에 뭉개 2축 구분을 흐린다 → 형제로 분리해 직교
  축을 명확히(028 "역할 축 vs 도메인 축"과 동형). 둘 다 firstNotesDir 하위라 백업·인덱스
  이득은 동일.
- **게이트 조합의 오해 방지**: "부재=완화"와 "존재 시 불일치=결함"은 모순이 아니다 —
  design.md는 "정의 없이 구현 금지"(강제)지만, 계약은 "없으면 진행하되 있으면 정본"(028+026
  조합). 문서·페르소나 문구가 이 조합을 명확히 구분해야 한다(self-review 관점).
- **localmind 자체 예외**: 이 저장소에 `projects/localmind/`를 만들지 않는다 — specs/가 계약
  (goal/spec/plan + design.md). 계약 저장소는 외부 바이브 코딩용. AGENTS.md·docs에 명문화.

## 테스트 전략

- 계약 템플릿·게이트·소유·용어집(AC-1~7·9): repo 파일 grep(결정적·빠름). 완화 게이트·
  드리프트·식별의 실효는 규약 준수 의존 — spec이 인정(코드 강제 아님).
- 파싱·트리거 서로소(AC-8): loadRegistry 19종 불변 + 편집 description의 계약 어휘 부재 grep
  (신규 트리거 미도입 정적 확인). 라우팅·식별 실동작은 Claude 내부라 미검증(정직한 한계 —
  026·028 계승).
- 위생(AC-10)·시크릿(AC-2): grep. 자기충돌은 027 AC-7 방식(위생 패턴 담는 테스트 파일 제외).
  environments 템플릿의 URL 예시에 쿼리스트링 `=`를 쓰지 않는다(AC-2 보조 grep과의 오탐
  충돌 회피 — 재검 관찰).
- 회귀: 기존 seed/registry/deploy 테스트 green + 028 어휘 서로소 불변(description 미편집).

## 모델 역할 배치

- 계약 템플릿·규약 문구·소유 매트릭스·경계: 최상위 티어 🔖(라우팅·소유·안전이 여기서 갈림 —
  여기가 틀리면 아래가 다 틀림).
- seed.test 회귀·docs 표: 루틴/저위험 기계 작업(sonnet/haiku).
- 계약 문서의 **런타임 작성**은 각 owner 페르소나 티어(architect·backend-dev·infra opus —
  028 배정), 이 plan의 "저술 작업" 티어와 별개.
- self-review: opus + codex 교차(다운시프트 금지).
