# Spec: SDD Self-Review Orchestration

> **044 확장/대체 포인터**: FR-1/4(provider/model orchestration)·FR-6(old `/goal` trigger)·FR-7(Claude-only fallback)·FR-8(Claude-only copy)·FR-10(provider-specific 문서)는 specs/044가 대체한다. FR-2/3 structured transport/output·FR-5 report-only ownership·FR-6 optional adapter toggle은 유지되고, backup/index/unmanaged·speckit invariants(FR-8/9)와 plain docs(FR-8/9/10)는 044 FR-11/12/13이 흡수한다. canonical `SKILL.md`는 `localmind-review` 이름을 전제하지 않는다(optional adapter로 보존).

상위: [goal](goal.md)

> 2026-07-03 인터뷰 7건 결정 반영: 범위=self-review만 / 실체=하이브리드(스킬+localmind
> Codex 스크립트) / 산출 계약={verdict, blocking[], advisory[]} / 재검 루프=보고만 /
> speckit=공존 / 트리거=/goal 단계 기본 발화+끄기 env / 스킬 싱크=복사 배포.

## Scope

`/goal`의 self-review 단계에 **크리틱 교차 검증**을 배관한다. 구성은 하이브리드다:

| 구성 요소 | 소유 | 역할 |
|---|---|---|
| 조율 스킬 (Claude Code SKILL) | localmind 정본(복사 배포) | self-review 시점에 Claude 크리틱 + Codex 스크립트를 함께 발화·병합·보고 |
| Codex 교차 스크립트 | localmind 소유 코드 | `codex exec -p critic --output-schema`로 Codex 백엔드 검증, 산출 계약 JSON 파싱 |

교차 검증은 `/goal` self-review 단계에서 **기본 발화**하고 환경변수로 끌 수 있다. 크리틱은
결함을 **보고**만 하며(수정·재검 루프는 `/goal` 흐름 소유), 기존 speckit 스킬과는 **공존**한다.

## Context

- **self-review 규약**(AGENTS.md `/goal` 5단계 · governance self-review-after-goal): `/goal`
  구현 후 독립 크리틱이 4범위(① FR/AC 추적성 ② 테스트 커버리지 ③ 정확성 버그 ④ 단순화·
  보안)를 점검하고, 명백 결함은 수정→재검(clean까지), 애매한 것만 사람에게 보고한다.
  현재 이 단계는 Claude 계열 안에서만 돈다.
- **016 레지스트리**: `loadRegistry()`가 페르소나(name·프롬프트·대상별 모델)를 제공하고,
  managed 마커·prune·graceful 미설치·백업 편입 배포 패턴을 이미 갖췄다(FR-5·6·8·9).
- **017 런타임**: `codex exec` 경로가 아닌 게이트웨이 경유로 Codex를 도달했고, 판정 JSON을
  관대하게 추출하는 `parseVerdict`(`{ok, issues[]}`)를 두었다. 018의 교차 스크립트는
  게이트웨이가 아니라 docs/personas.md가 확정한 `codex exec -p <persona> --output-schema`
  **직접 경로**를 쓴다(구조화 산출·reasoning effort 전달 목적 — 017 plan이 "프로필 high는
  codex exec 전용"임을 명시).
- **배관 자산의 정본 위치**: 016 Open question("오케스트레이션 스킬의 정본 관리·싱크")이
  018로 미뤄져 있었다 — 스킬은 Claude Code 전용 형식이라 형식 변환이 없다.

## Functional Requirements

- **FR-1 (교차 검증 조율 스킬)**: `/goal` self-review 단계에서 발화하는 조율 스킬을
  제공한다. 스킬은 ① Claude(Opus) 크리틱과 ② Codex 교차 스크립트(FR-2)를 함께 돌려,
  서로 다른 모델 계열의 검토 결과를 하나로 병합해 보고한다. 병합 결과에는 어느 백엔드가
  참여했는지가 드러난다.
  → goal: Objective(교차 검증 자동 발화), Success metrics(둘 다 발화)

- **FR-2 (Codex 교차 스크립트 — localmind 소유)**: localmind가 소유하는 스크립트가
  `codex exec -p critic --output-schema <스키마>`로 Codex 백엔드 크리틱을 실행하고, 표준
  출력을 산출 계약(FR-3)으로 파싱해 반환한다. 검토 대상(구현 diff·spec의 FR/AC)의 정확한
  조립은 plan에서 확정한다.
  → goal: Objective(localmind 소유 스크립트), Constraints(codex exec — 추가 요금 없음)

- **FR-3 (산출 계약 — 차단/조언 분리)**: 교차 크리틱의 산출은 `{verdict, blocking[],
  advisory[]}` 스키마를 따른다 — `blocking[]`은 명백 결함·AC 미충족(수정 대상),
  `advisory[]`는 조언(보고만). self-review 4범위(추적성·커버리지·정확성·단순화/보안)는
  각 항목의 **`category` enum 필드**로 표기한다 — 첫 도그푸드(2026-07-03, 018이 018을
  교차 검증)에서 codex 크리틱이 "문자열 태그" 초안과 구현의 불일치를 차단 결함으로
  잡았고, enum이 4범주를 스키마 수준에서 강제해 더 결정적이므로 구조화 필드를 채택했다.
  (severity·acId 등 추가 구조화는 여전히 하지 않는다 — 과설계 회피는 유지.)
  정확한 필드·`verdict` enum·스키마 JSON은 plan에서 확정한다.
  → goal: Objective(구조화 산출), Expected outcome(차단은 게이팅·조언은 보고)

- **FR-4 (교차성·독립성)**: 크리틱 검증은 **서로 다른 모델 계열**(Claude 백엔드 vs Codex
  백엔드)로 수행돼 맹점 공유를 피한다(017 교차 원칙 계승). 한쪽 계열만 가용하면(Codex
  미설치 또는 크리틱 페르소나 부재) 가용한 쪽만으로 진행하되, 교차가 성립하지 않았음을
  표시한다 — 동종 검증을 교차로 위장하지 않는다.
  → goal: Objective(다른 모델 계열), Risks(맹점 공유)

- **FR-5 (보고만 — 재검 루프 비소유)**: 크리틱은 결함을 `blocking[]`·`advisory[]`로 **보고**만
  한다. 수정→재검 반복은 이 스펙의 범위가 아니라 `/goal` 흐름(AGENTS.md 5단계)이 소유하며,
  `blocking[]`이 그 루프의 종료 신호(비어 있으면 통과)가 된다. 스킬·스크립트는 스스로
  코드를 수정하거나 재검을 반복하지 않는다.
  → goal: Non-goals(재검 루프 자동화 제외), Objective(차단은 게이팅)

- **FR-6 (트리거 — /goal 단계 기본 발화 + 끄기)**: 교차 검증은 `/goal` self-review 단계에서
  **기본 발화**한다. 환경변수 하나로 교차(Codex) 발화를 끌 수 있으며, 끄면 Claude 단독
  self-review로 동작한다. 파일 저장 훅 등 무대 밖 자동 발화는 하지 않는다.
  → goal: Objective, Success metrics(env 하나로 끄기), Non-goals(훅 자동 제외)

- **FR-7 (graceful 폴백 — self-review는 항상 수행)**: Codex 미설치·크리틱 페르소나 부재·
  스키마 불준수 응답·시간 초과·호출 실패 어느 경우에도 **Claude 단독 self-review는 정상
  완수**되고, 교차가 빠진 사유가 표시된다. (017 런타임의 완전 무음 폴백과 달리, self-review는
  규약상 생략 불가이므로 "codex 교차만 생략, 사유 표시"가 폴백의 형태다.) 스키마 불준수
  응답은 관대한 추출 후 실패 시 그 검증만 생략한다(답변·게이팅을 볼모로 잡지 않음).
  → goal: Constraints(self-review 우선), Risks(스키마 불준수·오판)

- **FR-8 (스킬 정본·복사 배포)**: 조율 스킬의 정본은 localmind 데이터 폴더에 하나 있고,
  배포는 **형식 변환 없이** Claude Code 스킬 위치로 **복사**한다. 016 managed 마커 패턴을
  재사용해 마커 있는 산출물만 갱신·prune하고, 마커 없는(사용자가 직접 만든) 동명 파일은
  건드리지 않고 경고한다. 정본은 기존 `make backup`에 자동 포함되며, 정본 폴더는
  노트 색인·검색에서 제외된다(016 FR-10과 동일 원칙 — 스킬 지침이 recall에 섞이지 않게).
  → goal: Objective(정본 관리·복사 배포·016 Open question 해소), Constraints(정본-파생
  일관성·불가침), Success metrics(백업 포함·마커 불가침)

- **FR-9 (speckit 공존·불가침)**: 018의 배포·발화는 기존 speckit SKILL(specify/plan/tasks
  등)을 수정·삭제·비활성화하지 않는다 — 표면이 겹치지 않는 self-review 무대에서만 동작한다.
  → goal: Non-goals(speckit 대체 제외), Constraints(본래 기능 불가침)

- **FR-10 (문서)**: docs/agents.md(또는 usage.md)에 문서화한다 — 교차 검증이 `/goal`
  self-review에서 발화한다는 것, 끄는 법(환경변수 — **017의 `BRAIN_VERIFY`(런타임 답변
  검증)와 별개 스위치**임을 명시), Codex 미설치 시 동작(Claude 단독),
  스킬 복사 배포와 정본 위치(정본에서 고칠 것), speckit과 공존한다는 것, 크리틱 산출은
  추정이며 판단은 사용자 몫. 비개발자가 이해할 수 있는 평이한 표현으로.
  → goal: Constraints(비개발자·관측 가능), Risks(오판 — 판단은 사용자)

## Acceptance Criteria

- **AC-1 (교차 스크립트 산출의 백엔드 표기)**: Given `critic` 프로필이 배포되고 Codex가
  설치된 환경에서, When 교차 스크립트(`localmind-review`)를 실행하면, Then 산출 계약
  (FR-3)을 따르는 결과가 반환되고 codex 백엔드가 쓰였음이 산출에 드러난다.
  (※ 실 `/goal` self-review에서 Claude 크리틱과 **둘 다 발화·병합**되는 것은 스킬
  지침의 소관이라 자동 테스트로 강제할 수 없다 — plan의 도그푸드 체크리스트가 검증한다.
  스킬은 지침일 뿐 강제력이 없다는 구조적 한계를 문서화한다.)

- **AC-2 (산출 계약)**: Given Codex 교차 스크립트가 스키마를 준수한 응답을 반환할 때,
  When 스크립트가 그 출력을 파싱하면, Then `{verdict, blocking[], advisory[]}` 구조로
  해석되고, 각 항목은 4범주 `category` enum과 `detail`을 갖는다.

- **AC-3 (엣지 — Codex 미설치)**: Given Codex CLI가 설치되지 않은 환경에서, When
  self-review 교차 검증을 발화하면, Then Claude 단독 크리틱으로 self-review가 정상 완수되고
  "교차 생략(Codex 미설치)"이 표시되며, self-review는 실패하지 않는다.

- **AC-4 (엣지 — critic 페르소나 부재)**: Given 레지스트리에 다른 페르소나는 있으나
  `critic` 정의가 없을 때(명시적 제거 — 낡은 배포 프로필이 남아 있어도), When 교차
  검증을 발화하면, Then Codex 교차는 생략되고 사유가 표시되며, Claude 단독 self-review는
  정상 완수된다. (레지스트리가 **아예 비어 있으면** 부트스트랩·새 기기 상황으로 보고
  프로필 존재 확인으로 폴백해 진행한다 — plan의 의도된 트레이드오프. 016 무음 폴백
  정합 — 단 self-review는 항상 수행.)

- **AC-5 (엣지 — 스키마 불준수 응답)**: Given Codex 교차 스크립트가 산출 계약을 만족하지
  않는(파싱 불가) 응답을 반환할 때, When 스크립트가 출력을 해석하면, Then 그 교차 검증만
  생략 처리되고 사유가 표시되며, Claude 결과와 self-review 진행은 유지된다(응답을 볼모로
  잡지 않는다).

- **AC-6 (엣지 — blocking 0·advisory만)**: Given 교차 크리틱 산출의 `blocking[]`이 비어
  있고 `advisory[]`만 있을 때, When 병합 결과를 게이팅에 쓰면, Then self-review는 통과로
  취급되고(수정 강제 없음), advisory 항목은 보고만 된다.

- **AC-7 (보고만 — 재검 루프 비소유)**: Given 교차 크리틱이 `blocking[]`에 결함을 담아
  반환할 때, When 스킬·스크립트가 결과를 처리하면, Then 결함이 보고될 뿐 스킬·스크립트가
  스스로 코드를 수정하거나 재검을 반복하지 않는다(수정·재검은 `/goal` 흐름 소관).

- **AC-8 (트리거·끄기)**: Given 교차 발화를 환경변수로 껐을 때, When `/goal` self-review
  단계가 실행되면, Then Codex 교차는 발화하지 않고 Claude 단독 self-review만 수행된다.

- **AC-9 (스킬 복사 배포)**: Given 조율 스킬 정본이 데이터 폴더에 있을 때, When 배포를
  실행하면, Then 마커가 포함된 스킬이 형식 변환 없이 Claude Code 스킬 위치로 복사되고,
  변경 없이 재실행하면 산출이 동일하다(멱등).

- **AC-10 (엣지 — 복사 대상 사용자 수동 파일)**: Given Claude Code 스킬 위치에 마커 없는
  동명 파일이 이미 있을 때, When 배포를 실행하면, Then 그 파일은 변경되지 않고 "건너뜀"
  경고가 출력되며, 다른 배포는 정상 진행된다.

- **AC-11 (speckit 불가침)**: Given 기존 speckit SKILL이 설치된 환경에서, When 018 배포·
  발화가 수행되면, Then speckit 스킬 파일은 수정·삭제되지 않는다.

- **AC-12 (백업 편입)**: Given 조율 스킬 정본이 데이터 폴더에 있을 때, When `make backup`을
  실행하면, Then 정본이 백업 저장소에 포함되고, 새 환경에서 복원 후 배포하면 동일한 스킬이
  복사된다. (※ 다단계 실환경 시나리오라 자동 테스트 불가 — plan의 도그푸드 체크리스트
  명시 항목으로 검증하고, "정본 기본 경로가 백업 스코프 안"은 plan 불변식으로 단언한다.)

- **AC-13 (정본 색인 제외)**: Given 스킬 정본이 데이터 폴더에 있을 때, When 노트
  재색인 후 스킬 지침의 고유 문구로 검색하면, Then 스킬 정본 파일은 결과에 나타나지
  않는다.

## Open questions

- **Codex 교차 스크립트의 입력 조립** — 검토 대상으로 구현 diff·spec FR/AC·plan 중 무엇을
  어떤 형태로 넘길지는 plan에서 확정(도그푸드로 신호 대비 토큰 비용 확인).
- **`--output-schema` JSON 파일의 정확한 필드·`verdict` enum 값 집합** — plan에서 확정.
- ~~**병합 정책** — Claude 크리틱과 Codex의 `blocking` 판정이 상충할 때(한쪽만 blocking)의
  병합 규칙. 초안은 합집합(둘 중 하나라도 blocking이면 blocking)으로 시작, 도그푸드로 조정.~~
- **스킬 정본의 데이터 폴더 내 위치**(예: `skills/` 하위) — 016 레지스트리 배치(`agents/`)와
  정합하게 plan에서 확정. 색인 제외 필요 여부 포함(016 FR-10 계열).
- **Codex 교차의 시간·횟수 상한** — self-review는 명시 게이팅이라 017 런타임(60s/50회)과
  다를 수 있음. 초기값은 plan, 도그푸드 실측 후 조정.
- ~~**비개발자용 설정 토글**(자연어로 "교차 검증 꺼줘") — 이번엔 환경변수+문서까지. 효용
  확인 후 후속(017 Open question과 동일 계열).~~
