# Design: 웹 거버넌스 뷰어 — 규칙·스킬·페르소나 조회

> 모델 이력 — 작성: Opus 4.8(designer) · 검토: Opus 4.8(ux-reviewer/critic) · 구현(예상): 미정

> 디자인·UI/UX 작업의 사전 정의 문서(specs/026 게이트). **이 문서가 완성되고 사용자 확인을
> 받기 전에는 UI 구현에 착수하지 않는다.** 값·정의가 코드와 검증의 기준(정본)이다.
> 이 페이지는 기존 SPA(specs/034·038·039)의 **토큰·컴포넌트를 재사용**한다 — 새 디자인
> 언어를 도입하지 않는다.

---

## 0. Open questions 해소 (결정 + 근거)

### OQ-1 — 기존 "에이전트" nav를 거버넌스로 **대체한다** (별도 유지 아님)

- **결정**: 사이드바의 `에이전트`(`#/agents`) 항목을 **`거버넌스`(`#/governance`)로 교체**하고,
  기존 페르소나 뷰(`pageAgents`)를 거버넌스 페이지의 **페르소나 섹션으로 흡수**한다. `#/agents`
  라우트는 제거하되, 북마크 보호를 위해 라우터에서 `agents → governance`로 **리다이렉트 별칭**만
  남긴다(코드 1줄, UI 노출 없음).
- **근거**: goal이 "기존 에이전트 페이지를 이 허브로 **흡수·확장**한다"고 명시. 페르소나를 두 곳
  (에이전트 페이지 + 거버넌스 섹션)에 두면 **중복·드리프트**가 생기고, "한 뷰에 정합"이라는
  Objective와 정면 충돌한다. nav 항목 수를 늘리지 않아(5개 유지) 사이드바 복잡도도 그대로다.
- **기각한 대안**: (a) 둘 다 유지 — 같은 데이터가 두 화면에 → 사용자가 "어디서 보나" 혼란 +
  유지보수 이중화. (b) 에이전트를 거버넌스의 **하위 탭**으로만 — nav에서 페르소나 발견성 저하,
  그리고 규칙·스킬과 대등한 3섹션 구조를 탭이 깨뜨림(§1 참조).

### OQ-3 — 페르소나 섹션도 **동일한 전문 드릴인**을 갖는다 (목록 전용 아님)

- **결정**: 페르소나 항목도 규칙·스킬과 **똑같이 클릭 → 전문(.md) 읽기** 드릴인을 제공한다.
  기존 `pageAgents`의 배포 상태 테이블은 유지하되, 이름을 클릭하면 페르소나 정의 전문이
  우측 리더 패널에 열린다.
- **근거**: 이 페이지 전체의 정신모델은 "**목록 + 클릭해 전문 읽기**"다(규칙·스킬이 그렇다).
  페르소나만 클릭 불가면 사용자가 "왜 이건 안 열리지?"로 예측이 깨진다 — 일관성(직관성 원칙)이
  최우선. 페르소나 정의는 그 자체가 프롬프트 전문이라 **읽을 가치가 있는 콘텐츠**다.
- **비용/전제**: 페르소나 전문 읽기용 read-only content 엔드포인트(`/ui/api/agent?name=…`,
  경로 안전 미러)가 **plan.md에 신규로 필요**하다. 이는 규칙·스킬 전문 엔드포인트와 동일한
  경로 안전 패턴(FR-7)이므로 한계비용이 작다. (API 형태 확정은 plan/아키텍트 소유 — 이 문서는
  **표시 계약**만 가정한다: `{ content: string }`.)

---

## 1. 디자인 시스템 패턴

- **패턴**: **좌측 사이드바 페이지 + 세로로 쌓인 3개 섹션 카드(스택드) + 우측 슬라이드 리더
  패널(드릴인)**.
  - 페이지(`#/governance`)는 `main` 안에 `h2 거버넌스` + 안내문 + **3개 독립 섹션 카드**
    (규칙 → 스킬 → 페르소나)를 세로로 쌓는다. 각 섹션은 기존 `card(title, loader)` 헬퍼로
    렌더돼 **카드별로 독립 loading→success|error|empty** 상태를 갖는다(한 섹션이 실패해도
    다른 섹션은 정상 표시 — 상태 가시성).
  - **목록→전문 드릴인**은 노트 브라우저(specs/038)의 **우측 슬라이드 리더 패널**
    (`.reader-overlay`/`.reader-panel`)을 재사용한다. 목록의 항목 이름은 `.note-link` 버튼
    (리포트 페이지 패턴)으로, 클릭 시 리더가 열려 전문 마크다운을 `pre.note-body`로 보여준다.
  - **무결성(건강) 표시**는 각 섹션 **헤더 아래 요약 라인**으로 둔다 — 문제 0이면
    `badge ok "무결성 정상"`, 있으면 `badge warn "문제 N건"` + 상세 목록. 섹션별 독립이라
    카드 로딩 모델과 정합한다(전 섹션 로딩을 기다리는 전역 배너를 만들지 않는다).
- **근거(직관성·상태 가시성)**:
  - **스택드(탭 아님)** — Objective가 "규칙·스킬·페르소나를 **한눈에 보고 한 뷰에 정합**". 탭은
    한 번에 한 섹션만 보여 "한눈에"를 깨고, 무결성 문제를 다른 탭 뒤에 숨긴다. 스택드는
    스크롤만으로 전부 발견 가능.
  - **기존 리더 패널 재사용** — 사용자가 이미 노트에서 학습한 상호작용(클릭→우측 패널→Esc 닫기,
    포커스 복원)을 그대로 재사용해 **학습 비용 0**. 새 모달·라우트를 만들지 않는다.
  - **섹션별 독립 건강 표시** — loadRules problems, 페르소나 problems, 스킬 problems가 서로
    출처가 다르고 로딩도 독립적 → 각 섹션이 자기 문제를 자기 자리에서 표면화하는 것이 가장
    추적 가능(어느 섹션의 문제인지 즉시 안다).
- **기각한 대안**:
  - **상단 탭 네비게이션(규칙|스킬|페르소나)** — 위 "한눈에" 위배 + 무결성 은폐. 기각.
  - **전역 상단 무결성 배너(3섹션 집계)** — 3섹션 데이터가 모두 로드돼야 집계 가능 → 독립
    카드 로딩 모델과 충돌, 한 섹션이 느리면 배너 전체가 지연. 기각(섹션별 요약으로 대체).
  - **인라인 확장(아코디언으로 목록 안에서 전문 펼치기)** — 긴 마크다운이 목록을 밀어내
    스캔성을 해치고, 노트 브라우저와 다른 상호작용이 되어 일관성 상실. 기각(리더 패널 채택).

### 페이지 골격(레이아웃)

```
main (#/governance)
├─ h2  "거버넌스"
├─ p.dim  "활성 규칙·스킬·페르소나를 조회해요. 읽기 전용 — 편집·배포는 터미널의 make/CLI로."
├─ SectionCard "규칙"      → [건강요약] + [규칙 목록: 이름·계층·순서·항목경고]  →클릭→ 리더
├─ SectionCard "스킬"      → [건강요약] + [스킬 목록: 이름·설명·관리배지]        →클릭→ 리더
└─ SectionCard "페르소나"  → [건강요약] + [페르소나 목록: 이름·설명·배포상태]    →클릭→ 리더
        (우측 슬라이드) GovernanceReader — 전문 마크다운(pre.note-body)
```

---

## 2. 디자인 토큰 (기존 style.css `:root` + dark override 재사용 — 신규 토큰 없음)

정본은 style.css의 `:root`(specs/034 design.md §2). 아래는 **이 페이지가 소비하는 토큰과 상태
매핑**이다. dark-mode는 동일 var 이름을 `@media (prefers-color-scheme: dark)`가 자동 대체하므로
값을 하드코딩하지 않고 **var() 참조만** 쓴다.

| 토큰(var) | 라이트 값 | 용도(이 페이지) |
|---|---|---|
| `--color-bg` | `#f8fafc` | 페이지 배경, `pre.note-body` 배경, cmd chip 배경 |
| `--color-surface` | `#ffffff` | 섹션 카드·리더 패널 배경, chip 배경 |
| `--color-border` | `#e2e8f0` | 카드·표·리더 경계선, 스켈레톤 펄스색 |
| `--color-text` | `#0f172a` | 본문 텍스트 |
| `--color-text-dim` | `#64748b` | 설명·메타·`.dim`·`.hint`·경로(mono dim) |
| `--color-primary` | `#2563eb` | active nav, 링크(`.note-link`), 포커스 링, **localmind 관리 배지** |
| `--color-on-primary` | `#ffffff` | primary 배경 위 텍스트 |
| `--radius-card` | `10px` | 카드·패널·chip 모서리 |
| `--space-xs/sm/md/lg` | `4/8/16/24px` | 간격 스케일(그대로) |
| `--font-page-title` | `600 20px` | `h2 거버넌스` |
| `--font-title` | `600 18px` | 섹션 카드 제목(h3), 리더 제목 |
| `--font-body` / `--font-mono` / `--font-caption` | `14/1.6` · `13 mono` · `12` | 본문 / 이름·경로 / 메타·배지 |

### 상태 → 토큰 매핑 (필수)

| UI 상태 | 시각/토큰 | 재사용 클래스 |
|---|---|---|
| **loading** | `--color-border` 펄스 바 | `.skeleton` (`@keyframes pulse`) |
| **success(정상)** | `--color-ok`(`#15803d`) | `badge.ok` — "무결성 정상", "배포됨" |
| **error(불러오기 실패)** | `--color-error`(`#b91c1c`) | `.error-state` + `.hint`(dim) — 복구 안내 |
| **empty(항목 없음)** | `--color-text-dim` | `.dim` 문구 |
| **warning(무결성 문제)** | `--color-warn`(`#b45309`) | `badge.warn` — "문제 N건", 항목별 경고 |
| **idle/neutral(범주 라벨)** | `--color-idle`(`#475569`) / 중립 chip | `badge.idle`, `.chip` — base/overlay·"대상 아님" |
| **managed(localmind 관리)** | `--color-primary` | `badge.managed`(신규 kind, 아래 주) |

> **`badge.managed` 주**: 기존 `badge`는 kind→토큰 매핑 컴포넌트다(`.badge.ok{background:var(--color-ok)}`
> …). "localmind 관리분" 구분(FR-3)을 위해 **같은 패턴의 kind 하나**를 추가한다:
> `.badge.managed { background: var(--color-primary); }`. 이는 **기존 토큰(`--color-primary`) 재사용**이며
> 새 색/디자인 언어가 아니다 — 배지 컴포넌트의 kind 확장일 뿐. 색만으로 뜻을 싣지 않도록
> 텍스트("localmind")를 항상 병기한다(접근성 — 기존 배지 규약과 동일).

---

## 3. 컴포넌트 정의 (변형 · 상태 · 화면 상태 전이)

> API 응답 형태는 plan/아키텍트 소유. 아래 "표시 계약"은 이 디자인이 **가정하는 최소 필드**다.

### 3.1 SectionCard — 섹션 컨테이너 (규칙 / 스킬 / 페르소나)

- **목적**: 한 거버넌스 부류의 목록 + 무결성 요약을 담는 독립 카드.
- **변형**: `rules` | `skills` | `personas`. 셋 다 동일 골격, 목록 컬럼만 다름.
- **구현**: 기존 `card(title, loader)` 헬퍼로 생성 — 카드별 독립 상태를 헬퍼가 보장.
- **상태 전이**:
  - `idle → loading`: `card()`가 즉시 `.skeleton` 2줄 표시.
  - `loading → success`: loader가 `[건강요약 라인, 목록]` wrap 반환.
  - `loading → empty`: 항목 0건 → `.dim` "표시할 규칙/스킬/페르소나가 없어요 — <복구 안내>"
    (예: 스킬 empty → "make skills-deploy가 기본 스킬을 심어줘요").
  - `loading → error`: loader throw → `card()` catch가 `.error-state` + `.hint`("make ui로 다시
    켤 수 있어요") 표시. `AuthError`면 `showKeyGate`(기존 전역 처리).
- **표시 계약**: 각 섹션 loader는 각자 리스트 엔드포인트 1개를 호출(`/ui/api/rules`·`/skills`·
  `/agents`). 401 → 기존 AuthError 흐름.

### 3.2 HealthSummary — 섹션 무결성 요약 (warning 표면화)

- **목적**: 해당 섹션의 problems/warnings를 **건강 신호**로 표면화(FR-5, AC-5).
- **위치**: SectionCard 본문 **최상단**(목록보다 먼저 — 문제를 먼저 본다).
- **변형/상태**:
  - `ok`: problems·warnings 길이 0 → `badge("ok","무결성 정상")` 한 줄. 상세 없음.
  - `warning`: 1건 이상 → `badge("warn", \`문제 ${n}건\`)` + 아래 상세 목록
    (`.error-state`의 자식 `.hint` 라인들, 각 라인 = `대상: 사유`). 예: `개인정보-보호: 중복 name`,
    `foo.md: 빈 본문`.
- **상태 전이**: 데이터 로드 완료 시점에만 결정(로딩 중엔 SectionCard 스켈레톤이 대신). 새로
  고침 없음(read-only 스냅샷) — 최신화는 페이지 재방문/새로고침.
- **표시 계약**: 규칙 = `loadRules().problems`·`.warnings` 그대로. 페르소나 = 기존 `a.problems`
  (파일·사유). 스킬 = 있으면 동일 형태(없으면 항상 `ok`).

### 3.3 GovernanceList — 항목 목록 (클릭 가능 행)

- **목적**: 부류별 항목을 `table(headers, rows)`로 나열, 이름 클릭 → 전문 드릴인.
- **변형/컬럼**:
  - **규칙**: `[이름, 계층, 순서]` — 이름=`.note-link` 버튼(→리더), 계층=LayerIndicator(§3.6),
    순서=order 숫자(mono). *(per-row 무결성 컬럼 없음 — problems 유발 규칙(중복 name·형식 위반·빈
    본문)은 registry가 목록에서 제외하므로 per-row 신호가 불가능. 무결성은 §3.2 HealthSummary(섹션
    레벨)로만 표면화 — AC-5.)*
  - **스킬**: `[이름, 설명, 관리]` — 이름=`.note-link`(→리더), 설명=텍스트, 관리=ManagedBadge(§3.5).
  - **페르소나**: `[이름, 설명, Claude, Codex]` — 기존 `pageAgents` 테이블 유지하되 **이름을
    `.note-link`로 바꿔** 클릭 시 페르소나 전문 리더 오픈(OQ-3). 배포 상태 배지는 그대로.
- **상태 전이**: SectionCard의 success 하위. 항목 이름 클릭 → `idle → GovernanceReader.loading`.
- **XSS 규율**: 모든 셀은 `el()`/`textContent` 경유(이름·설명·경로 포함) — `innerHTML` 금지.

### 3.4 GovernanceReader — 전문 드릴인 (우측 슬라이드 패널)

- **목적**: 선택한 규칙/스킬/페르소나의 **전문 마크다운**을 읽기.
- **재사용**: 노트 브라우저의 `openReader`/`closeReader` 메커니즘(`.reader-overlay`/`.reader-panel`,
  `readerPrevFocus` 포커스 복원, `onReaderEsc`, `role="dialog"` `aria-modal`)을 **일반화**한다 —
  `openGovReader({ title, subtitle, loader })` 형태(엔드포인트만 주입). 노트 전용 `openReader`와
  한 헬퍼로 통합하거나 형제 함수로 둔다(worker 판단, 단 동작·클래스는 동일).
- **변형**: 소스별 subtitle만 다름(규칙=규칙 파일 경로, 스킬=SKILL.md 경로, 페르소나=페르소나
  파일 경로) — 모두 `mono dim`.
- **상태 전이**:
  - `트리거(항목 클릭) → loading`: 패널 즉시 오픈, body=`.skeleton` 2줄, 헤더=이름/경로,
    포커스 이동(닫기 버튼).
  - `loading → success`: content 엔드포인트 반환 → `pre.note-body`에 전문(textContent).
  - `loading → error`: throw → `.error-state` "본문을 못 불러왔어요: <msg> — 다시 시도해 주세요."
    `AuthError` → 리더 닫고 `showKeyGate`(기존 처리).
  - `success|error → closed`: ✕ / Esc / 오버레이 클릭 → 패널 제거, **포커스 복원**(열었던 행).
- **표시 계약**: `GET /ui/api/rule?name=|agent?name=` → 레지스트리 name 조회(메모리 본문),
  `GET /ui/api/skill?…` → SKILL.md 파일 read(경로 안전 FR-7). 응답 `{ content: string }` — 프런트는
  식별자만 넘김(서버 소유).

### 3.5 ManagedBadge — localmind 관리 구분 배지

- **목적**: 스킬이 **localmind가 심은 관리분**인지 사용자 자작인지 구분(FR-3).
- **변형/상태**:
  - `managed`: `badge("managed","localmind")` — `--color-primary` 배경 + 흰 텍스트.
  - `user`(비관리): `badge("idle","사용자")` — 중립 회색. (빈칸 대신 명시 라벨 — "왜 배지가
    없지?" 모호성 제거.)
- **상태 전이**: 정적(데이터의 `managed:boolean`에 따라 렌더). 색+텍스트 병기(접근성).

### 3.6 LayerIndicator — base/overlay 표시 (규칙)

- **목적**: 규칙이 공통 base인지 프로젝트 overlay인지 범주 표시(FR-2, AC-2).
- **변형/상태**(범주 라벨이므로 상태 배지 아닌 **중립 chip**):
  - `base`: `chip` "base(공통)".
  - `overlay`: `chip` "overlay: <project>" — 프로젝트명 병기. 프로젝트명 미상이면 "overlay".
- **근거**: base/overlay는 성공/실패 같은 **상태가 아니라 분류**다 → 색 상태배지(ok/warn)를
  쓰면 의미 오염. 중립 chip + 텍스트가 정확. 색으로 뜻을 싣지 않음(접근성).
- **상태 전이**: 정적(`layer` 필드에 따라 렌더).

### 3.7 GovernancePage — 페이지 셸 & 라우팅

- **목적**: 3 SectionCard를 세로로 조립하고 nav/router에 연결.
- **라우팅 변경(OQ-1)**: `PAGES`에 `governance: pageGovernance` 추가, `agents` 제거. `route()`에
  `agents → governance` 별칭(레거시 해시 보호). index.html nav: `에이전트` 링크를
  `<a href="#/governance" data-page="governance">거버넌스</a>`로 교체.
- **상태 전이**: 페이지 진입 → 3 SectionCard가 각자 독립 로드(§3.1). 페이지 이탈 시
  `route()`의 `closeReader()`가 열린 리더 정리(기존 로직 재사용, gov 리더 포함).
- **read-only 불변식(FR-6, AC-6)**: 이 페이지 전체에 편집·삭제·배포·토글 컨트롤을 **두지
  않는다**. 유일한 상호작용은 (1) 항목 클릭→읽기, (2) 리더 닫기. `button`은 리더 닫기(✕)와
  `.note-link`(읽기)뿐 — 상태 변경 버튼 0개.

---

## 4. 에이전트 실행 프롬프트

### worker(frontend-dev/구현)에게

```
localmind 웹 SPA(public/ui/)에 읽기 전용 "거버넌스" 페이지를 구현하라. 정본은
specs/048-web-governance-viewer/{goal,spec,design}.md 이며, 이 design.md의 토큰·컴포넌트
정의가 UI 기준이다. plan.md의 엔드포인트/서버 계약을 따르되, 화면 표시·상태는 이 문서대로 한다.

[불변 제약 — 위반 시 결함]
- 빌드리스 vanilla-JS SPA. 프레임워크·번들러 도입 금지. 해시 라우터(#/governance) 사용.
- 모든 동적 텍스트는 el()/textContent 경유. innerHTML에 데이터 주입 절대 금지(XSS 규율).
- 기존 토큰(style.css :root의 var)·컴포넌트(el, card, table, badge, chip, .skeleton,
  .error-state, .note-link, .reader-overlay/.reader-panel)를 재사용한다. 새 색·새 디자인 언어
  금지. 하드코딩 색상값 금지 — 반드시 var(--color-*) 참조.
- 읽기 전용: 편집·삭제·배포·토글 등 상태변경 컨트롤을 페이지 어디에도 두지 않는다.

[구현 범위]
1. 라우팅: PAGES에 governance 추가, agents 제거, route()에 agents→governance 별칭 리다이렉트.
   index.html 사이드바 nav의 "에이전트" 링크를 "거버넌스"(#/governance, data-page="governance")로
   교체. (OQ-1: 에이전트 페이지는 거버넌스로 흡수 — 별도 유지 안 함.)
2. pageGovernance(): h2 "거버넌스" + 안내 p.dim + 3개 SectionCard(규칙→스킬→페르소나)를
   card(title, loader) 헬퍼로 세로 스택. 각 섹션은 독립 loading→success|error|empty.
3. 각 SectionCard loader:
   - 규칙: GET /ui/api/rules. 본문 최상단에 HealthSummary(problems+warnings 0이면
     badge("ok","무결성 정상"), 있으면 badge("warn","문제 N건") + .hint 상세 라인들). 이어
     table(["이름","계층","순서"]) — 이름은 .note-link(클릭 시 규칙 전문 리더),
     계층은 base→chip "base(공통)" / overlay→chip "overlay: <project>", 순서=order(mono).
     (per-row 무결성 컬럼 없음 — problems 규칙은 목록에서 제외되므로 §3.3대로 섹션 HealthSummary로만.)
   - 스킬: GET /ui/api/skills. HealthSummary(동일 규약, 문제 없으면 ok). table(["이름","설명",
     "관리"]) — 이름=.note-link(SKILL.md 전문 리더), 관리=managed면 badge("managed","localmind")
     아니면 badge("idle","사용자").
   - 페르소나: GET /ui/api/agents(기존 재사용). 기존 pageAgents 테이블 유지하되 이름 셀을
     .note-link로 바꿔 페르소나 전문 리더를 연다(OQ-3). Claude/Codex 배포 배지·미배포 안내·
     a.problems 표시(=HealthSummary warning)는 그대로.
4. GovernanceReader: 노트 리더(openReader/closeReader, .reader-overlay/.reader-panel, Esc·오버레이
   닫기, readerPrevFocus 포커스 복원, role="dialog" aria-modal)를 일반화해 openGovReader({title,
   subtitle, loader})로 재사용. loader는 GET /ui/api/rule|skill|agent?… → {content}를 받아
   pre.note-body에 textContent로 렌더. loading=skeleton, error=.error-state, 401=닫고 showKeyGate.
5. badge kind 'managed' 추가: style.css에 .badge.managed { background: var(--color-primary); }
   한 줄만(다른 색·규칙 추가 금지). 색+텍스트 병기.

[상태 가시성 — 필수]
- 각 섹션 loading(skeleton)·success·empty(.dim + make 복구 안내)·error(.error-state + .hint)를
  모두 구현. 무결성 문제는 반드시 warning으로 표면화(숨은 상태 금지).
- API 타임아웃/서버다운은 기존 api() 헬퍼가 처리하는 문구를 그대로 노출.

[TDD] AC-1~AC-8(spec.md)을 테스트로 1:1 매핑. 특히 AC-5(중복 name 등 problems 주입 시 그 항목이
warning으로 표면화), AC-6(상태변경 컨트롤 0개), AC-7(경로 traversal 거부), AC-8(무토큰 401).
구현 후 도그푸드: make ui로 실제 렌더·클릭·리더 오픈·다크모드까지 육안 확인.
```

### ux-reviewer(점검)에게

```
구현된 "거버넌스" 페이지(public/ui/, #/governance)를 specs/048의 design.md와 대조 점검하라.
결함을 찾으러 가는 자세로(자기확증 편향 배제) 아래를 확정 판정한다.

[토큰·디자인 일관성]
- 하드코딩 색상값이 있는가? 모든 색은 var(--color-*) 참조여야 한다(라이트/다크 자동 대응 확인 —
  prefers-color-scheme: dark에서 대비·가독성 깨짐 없어야).
- 새 디자인 언어(신규 색·컴포넌트 스타일)를 도입했는가? badge.managed 외 신규 CSS가 정당한가.
- 3섹션이 기존 card/table/badge/chip 패턴과 시각적으로 정합하는가(노트·설정 페이지와 이질감 0).

[상태 가시성 — 핵심]
- 각 섹션의 loading(skeleton)·empty(.dim+안내)·error(.error-state+복구 hint)가 실제로 보이는가.
  (서버 끄고 재현, 빈 데이터 재현.)
- 무결성 문제가 warning으로 표면화되는가 — 중복 name 등 problems를 주입했을 때 해당 항목/섹션에
  badge warn + 사유가 뜨는가(AC-5). 정상일 때 "무결성 정상"(ok)이 뜨는가. 숨은 상태 없어야.

[상호작용·접근성]
- 규칙·스킬·페르소나 모두 이름 클릭 시 리더가 열리고 전문이 뜨는가(OQ-3 일관성 — 한 섹션만
  클릭 불가면 결함). 리더가 Esc·오버레이·✕로 닫히고 포커스가 열었던 행으로 복원되는가.
- .note-link·리더 닫기 버튼에 focus-visible 링이 보이는가. role="dialog"/aria-modal이 있는가.
- 색만으로 뜻을 싣는 곳이 없는가(모든 배지·chip이 텍스트 병기).

[read-only 불변식]
- 편집·삭제·배포·토글 등 상태변경 컨트롤이 하나라도 있는가(있으면 즉시 결함 — AC-6). 유일한
  버튼은 읽기(.note-link)와 리더 닫기여야 한다.

[XSS 규율]
- 규칙·스킬·페르소나 이름/설명/경로/전문이 textContent로 렌더되는가. innerHTML에 데이터가
  들어가는 경로가 하나라도 있으면 치명 결함으로 보고.

명백한 결함은 재현 방법과 함께, 트레이드오프성 사안은 사용자 판단용으로 분리 보고하라.
접근성·상태가시성·추적성이 미적 완성도와 충돌하면 전자가 우선이다(AGENTS.md 디자인 원칙).
```

---

## 5. 토큰 확장 참고 (선택 — 미적용)

이 페이지는 신규 토큰을 만들지 않고 style.css `:root` 정본만 소비한다. 토큰 표가 커져 관리가
버거워지면 W3C DTCG `tokens.json`으로 옮길 수 있으나(design.template §5), **현 시점 불필요** —
기존 34번 스펙 토큰 세트로 충분하고, CI 강제도 아니다. design.md가 토큰 정본이라는 위계는 불변.
