# Spec: 웹 거버넌스 뷰어 — 규칙·스킬·페르소나 조회

> 모델 이력 — 작성: Opus 4.8 · 검토: Opus 4.8(critic) · 구현(예상): 미정(Sonnet/Opus — /goal 시 확정)

<!-- what. 각 FR은 goal 항목 지지. AC는 Given-When-Then. UI 상세는 design.md. -->

## Functional Requirements

- **FR-1** — nav에 **"거버넌스" 페이지**가 추가되고 **규칙·스킬·페르소나** 3섹션을 렌더한다.
  *(goal: Objective)*
- **FR-2** — **규칙 섹션**: base+overlay 전체를 목록(name·base/overlay·order)으로, **항목 클릭 시
  전문(마크다운)** 을 보인다. *(goal: Success metric 1)*
- **FR-3** — **스킬 섹션**: 전체를 목록(name·description)으로, **localmind 관리분을 배지로 구분**,
  클릭 시 **SKILL.md 전문**. *(goal: Success metric 2)*
- **FR-4** — **페르소나 섹션**: 기존 `/agents` 데이터를 같은 페이지에 통합하고, **페르소나 이름 클릭 시
  정의 전문(prompt)을 리더로 연다**(신규 `/ui/api/agent?name=` 전문 엔드포인트, 경로 안전 FR-7).
  *(goal: Success metric 3)*
- **FR-5** — loadRules **problems/warnings를 경고로 표시**한다(중복 name·형식 위반·빈 본문 등).
  *(goal: Success metric 4)*
- **FR-6** — **read-only**: 편집·삭제·배포 컨트롤이 없다. *(goal: Success metric 5 · Non-goal)*
- **FR-7** — 전문 조회의 **식별자 모델**: 규칙·페르소나 전문은 **로드된 레지스트리에서 name 조회**로
  반환(경로 입력 없음 → traversal 구조적 불가; 본문이 이미 메모리 상주 — F-4/F-6). **스킬 전문만
  SKILL.md 파일 read**가 필요하며 이때 **경로 안전**(`..`·절대경로·심링크 차단 + realpath 루트 재검)을
  적용한다. *(goal: Constraint)*
- **FR-8** — 신규 데이터는 **`/ui/api` 엔드포인트**(기존 Bearer 인증 통과) + 프런트는 **textContent**로
  렌더(XSS 규율). *(goal: Constraint)*

## Acceptance Criteria

<!-- self-review clean 후 충족분 [x] + 근거. 미충족은 미체크 + 사유. -->

- [x] **AC-1 (FR-1)** — Given `make ui` 실행, When 거버넌스 nav 클릭, Then 규칙·스킬·페르소나 3섹션이
      렌더된다(`#/governance`).
- [x] **AC-2 (FR-2)** — Given base 규칙 N개, When 규칙 섹션, Then N개가 목록으로 뜨고 base/overlay가
      구분되며, 한 항목 클릭 시 그 규칙 전문(마크다운)이 열린다.
- [x] **AC-3 (FR-3)** — Given 스킬 M개, When 스킬 섹션, Then 목록+설명이 뜨고 **localmind 관리분에 배지**,
      클릭 시 SKILL.md 전문이 열린다.
- [x] **AC-4 (FR-4)** — Given 페르소나, When 거버넌스 페이지, Then 페르소나 섹션이 통합 표시되고,
      **페르소나 이름 클릭 시 그 페르소나 전문(prompt)이 리더에 열린다**.
- [x] **AC-5 (FR-5)** — Given 중복 name 등 problems를 유발하는 규칙 상태, When 규칙 섹션, Then 해당
      problems/warnings가 **경고로 표시**된다(정상 시 경고 없음).
- [x] **AC-6 (FR-6)** — Given 거버넌스 페이지, When 둘러봄, Then 편집·삭제·배포 컨트롤이 **없다**.
- [x] **AC-7 (FR-7)** — Given 스킬 전문 요청에 `..`·절대경로·심링크 류, When 서버 처리, Then **거부**
      (skillsDir 밖 접근 0). **그리고** Given 규칙·페르소나 전문 요청에 **알 수 없는 name**, When 조회,
      Then 미존재 반환(레지스트리 밖 접근 없음).
- [x] **AC-8 (FR-8)** — Given 유효 토큰 없는 요청, When `/ui/api/rules`·`/skills` 및 전문 엔드포인트
      (`/rule`·`/skill`·`/agent`), Then **401**.

## Open questions

- ~~**OQ-1** — 에이전트 nav를 거버넌스로 대체하나 별도 유지하나?~~ **→ 해소(design.md)**: **대체**
  — 에이전트 페이지를 거버넌스 페르소나 섹션으로 흡수, `agents→governance` 리다이렉트 별칭만 유지.
- **OQ-2** — 스킬 전문 읽기의 경로 안전 루트(`skillsDir()`) — 규칙 루트와 별개로 화이트리스트.
- ~~**OQ-3** — 페르소나 섹션도 전문 드릴인을 추가하나?~~ **→ 해소(design.md)**: **추가** — 규칙·스킬과
  동일하게 페르소나도 클릭→전문. **신규 `/ui/api/agent?name=` 전문 엔드포인트 필요**(경로 안전 미러).
- ~~**OQ-4** — overlays(Map) JSON 직렬화 형식?~~ **→ 해소**: `Record<project, RulesStatusItem[]>` 객체로 직렬화(rulesStatus, 단위 테스트 확인).
- ~~**OQ-2** — 스킬 전문 read 경로 안전 루트?~~ **→ 해소**: skillsDir 화이트리스트 + realpath 재검(skillContent, AC-7 테스트).

---

## 검증 결과 (2026-07-16 · /goal 048)

산출물: 백엔드(`listSkills`·`rulesStatus`·`skillsStatus`·전문 조회·5 엔드포인트) + 프런트(거버넌스 페이지·3섹션·리더). **603 테스트 green · tsc clean**. self-review 2축(critic·ux-reviewer, Opus).

| AC | 근거 |
|----|------|
| AC-1 3섹션 | ✅ dogfood(make ui): 규칙·스킬·페르소나 렌더, nav 활성 "거버넌스" |
| AC-2 규칙 목록+드릴인 | ✅ dogfood(hotfix 클릭→전문) + **MAJOR-1 수정**(base/overlay 동명 project 구분) + 회귀 테스트 |
| AC-3 스킬+배지 | ✅ 단위+route 테스트 + dogfood(localmind 배지) |
| AC-4 페르소나+드릴인 | ✅ `personaContent`/`/agent` 테스트 + dogfood(note-link) |
| AC-5 problems/warnings 경고 | ✅ dogfood(빈-본문 규칙 → "문제 1건"+전문) + **MAJOR-2 수정**(warnings 문자열 렌더) |
| AC-6 read-only | ✅ critic 확인(5엔드포인트 GET·컨트롤 0) |
| AC-7 경로 안전 | ✅ 단위+route 테스트 + curl(traversal→400) |
| AC-8 무토큰 401 | ✅ route 테스트(5 엔드포인트) |

self-review: critic 2 MAJOR + 1 MINOR·ux 폴싱 1 → 전부 수정, 재검 clean. 보안(경로안전)·XSS·read-only·노트 리더 회귀 = critic clean.
