# Goal: 웹 거버넌스 뷰어 — 규칙·스킬·페르소나 조회

> 모델 이력 — 작성: Opus 4.8 · 검토: Opus 4.8(critic) · 구현(예상): 미정(Sonnet/Opus — /goal 시 확정)

<!-- 왜(why). 구현 세부(엔드포인트·컴포넌트·파일경로)는 spec/plan/design으로 미룬다. -->

## Background — 배경

localmind 웹 UI(`make ui` → Express SPA, `127.0.0.1:8788/ui/`, **read-only·localhost**)는 대시보드·노트·
설정·에이전트(페르소나)·리포트 페이지를 제공한다. 그러나 **규칙(rules)·스킬(skills)은 UI에 전혀
노출되지 않는다** — 사람이 "지금 어떤 거버넌스가 활성인가"를 보려면 `~/.localmind/` 파일을 직접
뒤지거나 deploy 명령 출력을 봐야 한다. 방금 `/localmind-rules` CLI로 규칙 *저작*은 생겼지만(specs/047),
*조회*는 여전히 파일 수준이다.

## Problem — 문제

사람이 활성 규칙·스킬·페르소나를 **한눈에 보고 내용까지 확인**할 웹 경로가 없다. 페르소나만 에이전트
페이지에 있고 규칙·스킬은 없어 조각나 있으며, **무결성 문제(중복 name·형식 위반 등)를 볼 방법이
없다** — loadRules가 problems로 잡아도 CLI 배포 때만 스쳐 지나간다.

## Objective — 목표

**통합 "거버넌스" 웹 페이지**(read-only)를 만든다: **규칙·스킬·페르소나**를 한 곳에 묶어, 각각
**목록 + 클릭해 전문(마크다운) 읽기**를 제공하고, **무결성 problems/warnings를 건강 표시**로 표면화한다.
기존 에이전트 페이지를 이 허브로 흡수·확장한다. 저작은 웹에서 하지 않는다(`/localmind-rules` CLI 유지).

## Expected outcome — 기대 결과

- `make ui` → 거버넌스 페이지에서 **활성 규칙·스킬·페르소나 전부**를 보고, 항목 클릭 시 전문을 읽는다.
- **중복 name·형식 위반 같은 드리프트가 경고로 보인다**(건강 대시보드).
- 규칙·스킬·페르소나가 조각나지 않고 한 뷰에 정합.

## Success metrics — 성공 지표

<!-- self-review clean 후 달성분은 [ ]→[x], 미달성은 미체크 + 사유. -->

- [x] 거버넌스 페이지에서 **활성 base+overlay 규칙 전체**가 목록으로 보이고, 클릭 시 전문이 열린다.
- [x] **스킬 전체**(localmind 관리분 구분)가 목록+설명으로 보이고, 클릭 시 SKILL.md 전문이 열린다.
- [x] **페르소나**가 같은 페이지 섹션에 통합돼 보인다(기존 에이전트 페이지 흡수).
- [x] loadRules **problems/warnings가 경고로 표시**된다(예: 중복 name 주입 시 그 항목이 표면화).
- [x] 전 과정 **read-only** — 웹에서 규칙·스킬 편집·삭제·배포 경로가 없다.

## Non-goals — 비목표

- **웹에서 규칙·스킬 저작/편집/삭제/배포**(저작은 `/localmind-rules` CLI 전속 — specs/047).
- **설치 마법사**(별도 서버 `install-wizard.mjs` — 이 페이지는 ui-server SPA 소속).
- **배포 거동·규칙 레지스트리 로직 변경**(조회만 — 기존 loadRules 재사용).
- **원격/비-localhost 노출**(specs/034 read-only·localhost 원칙 유지).

## Constraints — 제약

- **read-only + localhost**(specs/034) · 기존 SPA 패턴 재사용(el/card/table/badge 헬퍼, **XSS 규율:
  동적 텍스트는 textContent만**) · **디자인 토큰(style.css :root) 재사용**.
- **규칙 = `loadRules()` 재사용**(신규 로직 금지). **스킬 = read-only 카탈로그 함수 신규 필요**
  (`skills.ts`엔 deploy/seed만 있음). **페르소나 = 기존 `/agents` 재사용.**
- **전문 파일 읽기는 경로 안전 패턴**(readNoteContent식 `..`·절대경로·심링크 차단 + realpath 재검) 미러.
- **디자인 게이트(specs/026)**: UI 구현 전 `design.md` 작성·사용자 확인 필수.
- 비개발자 사용자 포함(OSS) — 라벨·경고는 평이한 한국어.

## Stakeholders — 이해관계자

- **단일 사용자**(localmind를 설치한 개인 누구나 — 비개발자 포함). 자기 거버넌스를 조회하는 주체.

## Risks — 리스크

- **범위 확대**: "통합"이 기존 에이전트 페이지 재구성을 수반 → 스코프가 단순 신규 페이지보다 큼(에이전트
  페이지 존치/흡수 여부는 design.md에서 확정 — Open question).
- **XSS/경로 traversal**: 규칙·스킬 전문을 렌더링 → textContent·마크다운 처리·경로 안전 미러로 완화.
- **드리프트 미표시**: problems/warnings를 안 보이면 건강 목적이 반감 → Success metric으로 방어.

---

> **상태**: draft. 다음 — `spec.md`(FR→goal·AC) · **`design.md`(designer, specs/026 게이트)** · `plan.md`
> (엔드포인트·listSkills 신규·페이지 재구성 경계) · `tasks.md`. `/goal` 착수 전 readiness + design 확인.
