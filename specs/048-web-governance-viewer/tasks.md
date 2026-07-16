# Tasks: 웹 거버넌스 뷰어 — 규칙·스킬·페르소나 조회

> 모델 이력 — 작성: Opus 4.8 · 검토: Opus 4.8(critic) · 구현(예상): 미정(Sonnet/Opus — /goal 시 확정)

<!-- THIN (R2). 근거·서술은 → plan §… / → plan F-n / → design §… 백포인터. F-1…F-8 인용만, 재조사 금지. -->

백엔드(조회 API)는 잘 명세 = worker/backend-dev. 프런트는 **design.md 확정·사용자 확인 후** frontend-dev
(specs/026 게이트). UI 시각·컴포넌트·상태전이는 **design.md가 정본**.

## 불변식 (I-n)

- **I-1 read-only.** 편집·삭제·배포·토글 등 상태변경 컨트롤을 페이지 어디에도 두지 않는다(유일 상호작용=읽기·리더닫기). → FR-6, AC-6, design §3.7
- **I-2 XSS 규율.** 모든 동적 텍스트(이름·설명·경로·전문)는 `el()`/`textContent`. innerHTML에 데이터 주입 금지. → FR-8, design §3.3
- **I-3 토큰·컴포넌트 재사용.** 기존 `style.css :root` var·`el/card/table/badge/chip/.skeleton/.error-state/.note-link/.reader-*` 재사용. 하드코딩 색·새 디자인 언어 금지(신규 CSS는 `.badge.managed` 1줄만). → F-2·F-8, design §2
- **I-4 경로 안전.** **스킬 전문은 SKILL.md 파일 read → skillsDir 화이트리스트**(`..`·절대경로·심링크 차단 + realpath 재검, F-7 미러). **규칙·페르소나 전문은 레지스트리 name 조회**(메모리 본문 — 경로 입력 없음, traversal 구조적 불가; 미존재 name 거부). → FR-7, AC-7
- **I-5 nav 흡수.** 에이전트 페이지를 거버넌스로 대체하되 `agents→governance` 리다이렉트 별칭 유지(레거시 해시 보호). → design §0 OQ-1, §3.7
- **I-6 조회 전용 로직.** 규칙 로드·중복검사는 `loadRules`(F-4) 재사용, 재발명 금지. → F-4

## 사실 출처
plan `§확정 사실 표(F-1…F-8)` = 유일 사실 출처. **재조사 금지, 인용만.**

## Phase 0 — Live-Verify → plan §Phase 0
- [ ] **T001** F표 재확인(경미 — 이미 grounded). → 전제

## Phase 1 — 스킬 카탈로그(백엔드) → plan §Phase 1
- [ ] **T010** `src/agents/skills.ts`에 `listSkills()` export — `skillsDir()` 하위 SKILL.md 열거 + frontmatter `name`/`description` 파싱(`parseDoc`식, YAML 의존 없음) + managed 마커 유무. → plan F-5
      → 단위 테스트: 열거·파싱·managed 구분(RED: managed 마커 없는 dir는 `managed:false`). *(FR-3 기반)*

## Phase 2 — 수집 로직(백엔드) → plan §Phase 2
- [ ] **T020** `src/ui-status.ts` `rulesStatus()` — `loadRules()` 결과를 JSON화(**overlays Map→객체 직렬화**, OQ-4), base/overlay·order·problems·warnings 포함. → plan F-4
      → 단위: base+overlay 병합·problems 전달·Map 직렬화. *(FR-2·5)*
- [ ] **T021** [P] `skillsStatus()` — `listSkills()` 래핑(목록+설명+managed). *(FR-3)*
- [ ] **T022** 전문 조회 — 규칙·페르소나는 **로드된 레지스트리 name 조회**(메모리 본문 RuleDoc.content/Persona.prompt, F-4/F-6 — 경로 입력·재read 없음, 미존재 name 거부). **스킬만 SKILL.md 파일 read + 경로 안전**(skillsDir 화이트리스트 `..`·절대·심링크 차단 + realpath 재검, F-7 미러, I-4). → plan F-4·F-6·F-7
      → 단위: 스킬 traversal **거부**(RED: `..` 통과하면 실패) + 규칙·페르소나 미존재 name **거부**. *(FR-7, AC-7)*

## Phase 3 — 엔드포인트(백엔드) → plan §Phase 3
- [ ] **T030** `routes/ui.ts`에 `wrap()`으로 `/rules`·`/skills` 목록 + `/rule?…`·`/skill?…`·**`/agent?name=`**(페르소나 전문, OQ-3) 배선. `ui-server.ts` `defaultUiDeps()`에 rulesDir/skillsDir/agentsDir 주입. → plan F-3
      → 통합: 무토큰 요청 → **401**(RED: 인증 없이 200이면 실패). *(FR-1·4·8, AC-8)*

## Phase 4 — 프런트(design.md 게이트 이후) → plan §Phase 4 · design §3
> **선행**: design.md 사용자 확인 전 착수 금지(specs/026, F-8).
- [ ] **T040** 라우팅 — `PAGES`에 `governance` 추가·`agents` 제거·`route()`에 `agents→governance` 별칭(I-5). index.html nav "에이전트"→"거버넌스"(`#/governance`) 교체. → design §3.7
- [ ] **T041** `pageGovernance()` — h2+안내 + 3 SectionCard(규칙→스킬→페르소나) 세로 스택, 각 독립 loading→success|error|empty(`card()` 헬퍼). → design §1·3.1
- [ ] **T042** 각 섹션 loader + **HealthSummary**(problems/warnings 0=`badge ok`, 있으면 `badge warn "문제 N건"`+상세 — **AC-5는 섹션 레벨만**; problems 규칙은 목록에서 제외되므로 per-row 신호 없음) + GovernanceList(규칙=이름·계층·순서 / 스킬=이름·설명·ManagedBadge / 페르소나=기존 테이블+이름 note-link, 클릭→전문). → design §3.2·3.3·3.5·3.6, AC-2·3·4·5
- [ ] **T043** `GovernanceReader` — 노트 리더(`.reader-*`·Esc·오버레이·포커스 복원·aria-modal) 일반화, `openGovReader({title,subtitle,loader})`로 3부류 전문 렌더(pre.note-body, textContent). → design §3.4, I-2
- [ ] **T044** [P] `style.css`에 `.badge.managed { background: var(--color-primary); }` **한 줄만**(I-3). → design §2

## Phase 5 — read-only·nav 검증 → plan §Phase 5
- [ ] **T050** read-only 확인 — 상태변경 컨트롤 0개(버튼=읽기·리더닫기뿐, I-1). `agents→governance` 별칭 동작(I-5). *(AC-6)*

## Phase 6 — dogfood(통합 실증) → plan §Phase 6
- [ ] **T060** `make ui` 실행 → 거버넌스 페이지에서 활성 규칙 전체·스킬·페르소나 목록·problems 경고(섹션 레벨)·클릭 드릴인 전문(3부류)·다크모드 육안 확인.

### Dogfood 관측 기준
- **AC-2/3/4** — 규칙·스킬·페르소나 목록 렌더 + 각 클릭 시 전문 리더 오픈(3부류 일관, OQ-3).
- **AC-5** — 중복 name 등 problems 주입 시 해당 섹션에 `badge warn`+사유; 정상 시 "무결성 정상"(ok).
- **AC-6** — 편집/삭제/배포 컨트롤 0개.
- **AC-7** — `/ui/api/rule?path=../…` 류 거부.
- **AC-8** — 무토큰 `/ui/api/rules` → 401.

## Definition of Done
- [ ] I-1~6 불변식 준수(read-only·textContent·토큰재사용·경로안전·nav별칭·loadRules재사용).
- [ ] AC-1~8 각 `spec.md`에 `[x]`+근거(단위/통합/dogfood). 미충족은 미체크+사유.
- [ ] 백엔드 단위 테스트 green(listSkills·rulesStatus·skillsStatus·경로안전·401).
- [ ] **ux-reviewer가 design.md 대비 점검**(토큰·상태가시성·접근성·read-only·XSS) → critic 최종 게이트.
- [ ] self-review clean → 검증 표기 → 커밋 → CI 감시.

## Open questions (착수 전/중)
- OQ-2 skillsDir 화이트리스트(Phase 2) · OQ-4 overlays 직렬화 형식(T020). (OQ-1·3은 design.md 해소.)
