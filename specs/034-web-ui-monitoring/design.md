# Design: 모니터링 웹 UI — 디자인 사전 정의

> 디자인·UI/UX 작업의 사전 정의 문서(specs/026 게이트). **사용자 확인 전 UI 구현 착수 금지.**
> 작성: 디자이너 페르소나. 이 값·정의가 구현과 ux-reviewer 검증의 정본이다.

## 1. 디자인 시스템 패턴

- 패턴: **좌측 고정 내비(상단 브랜드 + 4메뉴) + 콘텐츠 영역, 카드 그리드 기반 대시보드.**
  단일 HTML + 해시 라우팅(#/dashboard, #/config, #/agents, #/reports) SPA.
  (2026-07-06 정정: 별도 상단 헤더 행 없음 — 브랜드는 사이드바 상단. self-review 사소-3 정합.)
- 근거: 페이지 4개·계층 1단 — 사이드바가 "지금 어디"를 항상 보여준다(상태 가시성).
  카드는 영역별 로딩/실패를 **독립적으로** 표면화할 수 있다(한 API 실패가 화면 전체를
  죽이지 않음 — FR-8).
- 기각: 탭 단일 페이지(리포트 본문 스크롤과 충돌), 멀티 HTML 페이지(키 입력 상태·공통
  레이아웃 중복).
- 테마: 라이트/다크 모두 지원 — CSS 변수 + `prefers-color-scheme`. 수동 토글 없음(단순함).

## 2. 디자인 토큰

| 토큰 | 라이트 | 다크 | 용도 |
|---|---|---|---|
| color.bg | #f8fafc | #0f172a | 페이지 배경 |
| color.surface | #ffffff | #1e293b | 카드·사이드바 |
| color.border | #e2e8f0 | #334155 | 구분선·카드 테두리 |
| color.text | #0f172a | #e2e8f0 | 본문 |
| color.text.dim | #64748b | #94a3b8 | 보조 텍스트·라벨 |
| color.primary | #2563eb | #3b82f6 | 링크·활성 내비·새로고침 |
| color.on.primary | #ffffff | #0f172a | primary 배경 위 전경(대비 AA) |
| color.state.ok | #15803d | #22c55e | 정상·최신·배포됨 |
| color.state.warn | #b45309 | #f59e0b | 낡음(behind)·확인 필요 |
| color.state.error | #b91c1c | #ef4444 | 실패·다운·인증 오류 |
| color.state.idle | #475569 | #94a3b8 | 비활성·"git 아님"·미색인 |
| color.on.state | #ffffff | #0f172a | state 배경 위 전경(대비 AA) |
| space.xs / sm / md / lg | 4 / 8 / 16 / 24px | 동일 | 간격 체계 |
| radius.card | 10px | 동일 | 카드·입력 |
| font.body | 14px/1.6 system-ui | 동일 | 본문(외부 폰트 금지) |
| font.mono | 13px ui-monospace | 동일 | 경로·해시·마스킹 값 |
| font.title | 600 18px/1.4 | 동일 | 카드 제목 |
| font.page-title | 600 20px/1.4 | 동일 | 페이지 제목(h2) |
| font.metric | 700 26px/1.3 | 동일 | 큰 숫자(metric) |
| font.caption | 12px/1.5 | 동일 | 보조 텍스트·표 헤더·배지 |

> 2026-07-06 개정(ux-review 반영): 라이트 state 색을 700계로 낮추고 전경 토큰
> (color.on.state / color.on.primary)을 신설 — 12px 굵은 텍스트 기준 WCAG AA(4.5:1) 확보.
> 다크는 밝은 state 색 + 어두운 전경. 폰트 토큰 3종(caption·page-title·metric) 추가.

## 3. 컴포넌트 정의

### StatusCard (상태 카드 — 대시보드 기본 단위)
- 목적: 한 데이터 영역(헬스·인덱스·정본·실패쿼리)의 상태를 독립 표시.
- 변형: default(제목+본문) | metric(큰 숫자+라벨)
- 상태: `loading → success | error | empty` —
  loading=스켈레톤 바(color.border 펄스), success=본문, error=ErrorState 내장,
  empty=idle색 안내문("아직 색인 전이에요").
- 상태 전이: 페이지 진입/새로고침 클릭 → loading → API 응답에 따라 분기. 카드별 독립.

### Badge (상태 배지)
- 목적: up/down·최신/behind·배포됨/안됨을 한 단어로.
- 변형: ok("정상"·"최신"·"배포됨") | warn("2커밋 뒤") | error("꺼짐"·"실패") | idle("git 아님")
- 상태: 정적(데이터 값 표시) — 색은 color.state.* 만 사용, 색+텍스트 병기(색맹 접근성).

### DataTable (목록 — 에이전트·폴더·노트)
- 목적: 라벨/경로/상태 나열. 행 우측에 Badge.
- 변형: default (compact 변형은 1차 미구현 — 필요가 증명되면 추가, 2026-07-06 정리)
- 상태: loading(스켈레톤 3행) → rows | empty("항목이 없어요") | error

### MaskedField (시크릿 표시)
- 목적: 마스킹된 시크릿(앞4자+길이)·설정값 표시. **원문 토글 없음**(서버가 원문을 안 주므로
  UI에도 존재 불가 — 이 부재가 곧 보안 검증 포인트).
- 표시: font.mono, `sk-a… (길이 64)` 형식 + 설정 방법 힌트("바꾸려면: make claude-token").

### ErrorState / KeyGate (실패·인증 화면)
- ErrorState: error색 아이콘+원인+**복구 안내 한 줄**("스택이 꺼져 있어요 — 터미널에서
  make up"). 빈 화면·무한 스피너 금지.
- KeyGate: 최초 접속/401 시 전체 화면 키 입력 폼(비밀번호 타입) — 성공 시 localStorage 저장
  후 원래 페이지로. 실패 시 error색 인라인 메시지("키가 맞지 않아요 — .env의
  LOCALMIND_API_KEY를 확인하세요").

### RefreshButton (명시적 새로고침)
- 목적: repos fetch 등 비용 있는 조회의 사용자 트리거.
- 상태: idle → loading(스피너+비활성) → done(마지막 갱신 시각 갱신) | error.
- 항상 "마지막 확인: HH:MM" 병기(데이터 신선도 가시화 — goal Risks 대응).

## 4. 에이전트 실행 프롬프트

### frontend-dev(구현)에게
```
specs/034-web-ui-monitoring/design.md를 정본으로 public/ui/를 구현하라.
- 토큰은 CSS 변수(:root, prefers-color-scheme)로 1회 선언하고 전부 var() 참조 — 하드코딩 금지.
- 컴포넌트의 상태 전이(loading→success|error|empty)를 정의대로: 카드별 독립, 빈 화면·무한
  로딩 금지, 모든 error에 복구 안내 문구.
- 외부 네트워크 요청 0(폰트·CDN 금지), 프레임워크·빌드 없음(vanilla). 문구는 평이한 한국어.
- API는 spec FR-2의 /ui/api/* 만 호출, Authorization 헤더에 저장된 키를 실어라(401 → KeyGate).
```

### ux-reviewer(점검)에게
```
구현된 UI를 specs/034-web-ui-monitoring/design.md와 대조하라 — ① 토큰 위반(하드코딩 색·간격)
② 상태 가시성 공백(로딩/실패/빈 상태가 없는 데이터 영역, 복구 안내 없는 에러) ③ 접근성 기본
(색+텍스트 병기, 키보드 포커스, 대비) ④ 다크/라이트 양쪽 렌더. 위반은 파일:줄과 함께 보고.
```

## 5. tokens.json (선택)

토큰 20개 미만 — 이 문서가 정본이며 별도 tokens.json은 만들지 않는다(커지면 W3C DTCG로 승격).
