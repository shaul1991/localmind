# Spec: /localmind-rules — 거버넌스 규칙 저작·관리 커맨드

> 모델 이력 — 작성: Opus 4.8 · 검토: Opus 4.8(critic) · 구현(예상): 미정(Sonnet/Opus — /goal 시 확정)

<!-- what. 각 FR은 goal 항목을 지지. AC는 Given-When-Then, 테스트와 1:1. -->

## Functional Requirements

- **FR-1** — 커맨드는 행동 전에 **기존 규칙 전체(base + overlay)를 읽어** 참조한다.
  *(goal: Objective — 기존 규칙 읽기)*
- **FR-2** — 커맨드는 사용자의 **의도·맥락을 파악**한다(무엇을 add/remove/edit 하려는가, 그 규칙의
  목적). interview-protocol대로 이해를 재진술하고 검수받은 뒤 진행한다. *(goal: Objective — 의도 파악·재귀 거버넌스)*
- **FR-3** — add/edit 시 **기존 규칙과의 의미적 충돌을 감지**하고, 충돌이면 **검증 게이트**로
  올려 조정 선택(예외 절 · overlay 오버라이드 · 재서술 · 취소)을 제시한다. 사용자 선택 전엔 적용하지
  않는다. *(goal: Success metric 2 · Constraint)*
- **FR-4** — remove/edit 시 다른 규칙의 **링크 의존이 깨지는지(고아) 검사**한다 — 대상은 **위키링크
  `[[name]]` + 마크다운 링크 `](name.md)`**(및 `## 관련` 항목) 둘 다(코퍼스 다수가 마크다운형). 깨지면
  게이트로 올린다. *(goal: Success metric 3)*
- **FR-5** — 새 규칙 저장 시 **base(전역) vs overlay(프로젝트) 배치를 매번 사용자에게 확인**한다.
  *(goal: Success metric 4)*
- **FR-6** — 확정된 규칙을 **기존 포맷대로 `.md`로 저작**한다(kebab name, Why/How/관련 등). 구조 검사
  (중복 name·problems)는 기존 registry를 재사용해 **중복을 조용히 덮지 않는다**. *(goal: Objective · Constraint)*
- **FR-7** — 저작 후 **올바른 배포를 제안**한다(base→`rules-deploy --no-repo` 글로벌, overlay→해당 repo
  `rules-deploy`). 배포 실행 시 **managed 산출물만** 건드리고 사용자 파일은 불가침. *(goal: Success metric 5)*
- **FR-8** — 모든 변경은 **interview-protocol 5단계**(질문→답→재진술→검수→진행)를 따른다.
  *(goal: Objective — 재귀 거버넌스)*

## Acceptance Criteria

<!-- self-review clean 후 충족분은 [x] + 검증 근거(테스트/실증). 미충족은 미체크 + 사유. -->

- [x] **AC-1 (FR-1)** — Given base+overlay에 규칙들이 있음, When `/localmind-rules` 호출, Then 변경 제안
      전에 현행 규칙 전체를 로드해 참조한다. *(dogfood 2026-07-16: base 17개 로드 확인)*
- [ ] **AC-2 (FR-2)** — Given 사용자가 add/remove/edit 의도, When 호출, Then 의도·맥락을 이끌어내고
      **이해를 재진술**한 뒤에야 다음 단계로 간다(즉시 적용 안 함).
- [x] **AC-3 (FR-3, 충돌)** — Given 기존 규칙과 의미적으로 모순되는 새/편집 규칙(예: hotfix ↔
      no-work-without-doc), When 저작, Then **검증 게이트가 충돌을 제시**하고 조정 선택(예외/overlay/
      재서술/취소)을 요구하며, **선택 전엔 파일을 쓰지 않는다**. *(dogfood 2026-07-16: hotfix↔
      no-work-without-doc 의미 충돌 감지 확인 + 게이트/선-write-금지 배선 self-review 검증. 실제 게이트
      발화·조정 선택은 사용자 실사용 시 완결.)*
- [ ] **AC-4 (FR-3, 무충돌)** — Given 충돌 없는 새 규칙, When 저작, Then 헛된 게이트 없이 배치·저작으로
      진행한다(오탐 없음).
- [x] **AC-5 (FR-4)** — Given 다른 규칙이 링크(**위키 `[[name]]` 또는 마크다운 `](name.md)`**)하는
      규칙의 제거/편집, When 적용, Then **고아 검사 게이트가 의존 규칙 목록을 제시**하고 확인/재연결
      전엔 진행하지 않는다. *(dogfood 2026-07-16: no-work-without-doc를 마크다운 링크로 참조하는 규칙
      5개 감지 — 위키만 파싱했으면 0개로 조용히 고아냈을 케이스. 마크다운 파싱(I-3) 실증.)*
- [ ] **AC-6 (FR-5)** — Given 새 규칙 추가, When 배치, Then base/overlay를 **묻고** 선택 레이어에 쓴다.
- [ ] **AC-7 (FR-6)** — Given 확정된 규칙, When 저작, Then 유효한 규칙 파일(kebab name·기대 섹션)이
      생성되고 **중복 name은 registry로 잡혀** 조용히 덮이지 않는다.
- [ ] **AC-8 (FR-7)** — Given 저작·변경된 규칙, When 완료, Then **올바른 배포**(base→--no-repo,
      overlay→repo)를 제안하고, 실행 시 managed 아닌 파일은 불변임을 보인다.
- [ ] **AC-9 (FR-8)** — Given 변경, When 처리, Then **5단계 인터뷰**(재진술·검수 후 진행)를 따른다.

## Open questions

- **OQ-1** — 의미 충돌 스캔 범위: 매번 base+overlay **전 규칙(17+)**인가, 관련성 필터 부분집합인가?
  (비용 vs 커버리지 — 미탐 시 goal Risk 현실화.)
- **OQ-2** — "edit"는 in-place 편집인가 remove+add인가? edit도 충돌 스캔을 전량 재실행하나?
- ~~**OQ-3** — 링크 의존 감지 기제: registry가 링크를 추적하나, 커맨드가 파싱하나?~~ **→ 해소(코드확인
  2026-07-16)**: registry는 링크 미파싱(F-2 확정) → **커맨드가 파싱**. 대상 = **위키 `[[name]]` +
  마크다운 `](name.md)`**(코퍼스 실측 마크다운 94 vs 위키 11 — 마크다운 필수).
- **OQ-4** — 커맨드가 managed 섹션 문구·`order:` frontmatter까지 편집 대상인가, 본문·name만인가?
- ~~**OQ-5** — cwd가 대상 프로젝트가 아닐 때 배포 안내?~~ **→ 해소(2026-07-16)**: SKILL §5가 cwd 불일치
  안내 + overlay명↔repo 폴더명 kebab 일치 조건 안내(self-review D4 반영).

---

## 검증 결과 (2026-07-16 · /goal 047)

산출물: `templates/skills/localmind-rules/SKILL.md`(순수 프롬프트 커맨드) — 배포 완료(`~/.claude/skills/`).
self-review(critic, Opus): MAJOR 1(D1 add-덮어쓰기 데이터소실)·MINOR 3 → 전부 수정, clean.

| AC | 상태 | 근거 |
|----|------|------|
| AC-1·3·5 | ✅ dogfood 실증 | 17규칙 로드 · hotfix↔no-work-without-doc 충돌 감지 · 마크다운 링크 의존 5건 감지 |
| AC-2·9 | ☑ 배선 검증 | §2 재진술·검수 게이트 + 5단계 흐름(self-review OK) |
| AC-4 | ☑ 배선 검증 | §3 게이트가 의미 충돌에만 발화(오탐 억제) |
| AC-6 | ☑ 배선 검증 | §4 배치 매번 질의(I-4) |
| AC-7 | ☑ 배선 검증 | §4 add-전 이름 충돌 검사(D1 수정) — basename 덮어쓰기 차단 |
| AC-8 | ☑ 배선 + 코드대조 | §5 base→`--no-repo`/overlay→repo, deploy.ts 분기 확인 |

> ☑ = 프롬프트 배선 + self-review 정적 검증 완료. **전체 end-to-end 실측**(사용자가 `/localmind-rules`로
> 실제 규칙을 저작 → 게이트 발화 → 조정 선택 → write → 배포)은 **사용자 게이트 결정이 필요**해 미완 —
> 커맨드는 배포됐고 감지·게이트·차단 배선은 검증됨. 규약상 커맨드(=deliverable) 완료.
