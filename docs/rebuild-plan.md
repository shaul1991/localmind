---
title: "localmind 전면 재개편 계획 — vision에서 도출한 감량·재건 마스터플랜"
audience: both
status: draft — 사용자 검토 대기 (2026-07-21)
basis: docs/product-vision.md (모든 처분 판정의 근거)
---

# localmind 전면 재개편 계획

> **TL;DR** — 판정 기준은 하나다: **"why의 저장·소환·주입·생존에 복무하는가?"**
> 이 기준으로 현 자산(src ~29.7k줄·MCP 도구 15개·templates 48파일·scripts 80개·docs 17개)을
> 전수 분류하면 — **남기는 것**은 코어 ~5k줄 + 도구 3개, **추출하는 것**은 메타 계층 전부
> (~17k줄 — 삭제가 아니라 별도 repo로, 크로스 프로젝트 사용처가 살아있으므로), **제거하는
> 것**은 죽은 도구 표면·외부 서비스 의존, **새로 짓는 것**은 vision이 요구하는 3가지(전제
> 스키마·재접촉 리마인드·세션 주입)다. 4단계(A 감량 → B 표면 축소 → C 신규 → D 검색 실험)로
> 진행한다.

---

## 0. 판정 원칙

vision §2·§6·§7에서 도출한 처분 기준:

| 판정 | 기준 |
|---|---|
| **Keep** | why의 저장(capture)·소환(recall)·주입·생존(백업/복구/동기화)에 직접 복무 |
| **Extract** | localmind의 목적이 아니지만 **살아있는 사용처가 있음**(크로스 프로젝트 거버넌스) — 삭제하면 사용자 워크플로가 부서지므로 별도 repo로 이전 |
| **Remove** | 어떤 목적에도 복무하지 않음(사용 실측 0 + 비전 무관) 또는 외부 서비스 의존만 늘림 |
| **Build** | vision이 요구하는데 현재 없음 |

## 1. MCP 도구 표면 — 15개 → 3개 + 신규 (초판 "17"은 오기 — 등록 도구 실측 15)

실측(query-log): 사용된 도구는 `search_notes`(47)·`capture_note`(38) **둘뿐**.

| 처분 | 도구 | 근거 |
|---|---|---|
| **Keep (3)** | `capture_note` `search_notes` `whoami` | 핵심 루프 + 기기 식별(복수 기기 필수) |
| **Remove (4)** | `remember` `recall` `list_memories` `delete_memory` | openmemory(:8767) 별도 서비스 의존 — 사용 0. 노트 capture가 기억의 정본이 된 지 오래 |
| **Remove (2)** | `ask` `ask_brain` | 게이트웨이(:8787) 의존 — 사용 0. "질의응답"은 호스트 AI가 search 결과로 직접 함(모델이 잘하는 일은 모델에게) |
| **Remove (3)** | `list_notes` `note_links` `delete_note` | 사용 0 — 노트 관리는 파일시스템/에디터의 일(AI가 브라우징할 필요 실증 없음). 삭제는 파일 삭제로 |
| **Extract (3)** | `scaffold_sdd` `deploy_agents` `list_agents` | 메타(SDD·페르소나) — Phase A와 함께 이동 |
| **Build** | 결정 capture 확장(전제 필드) · 세션 브리핑(주입) · 전제 재검증 | vision §4·§5·§6-3 |

→ 부수 효과: **openmemory·게이트웨이 두 로컬 서비스 의존이 통째로 사라진다.** 남는 외부
의존은 임베딩 엔드포인트 하나(그것도 OQ-V2 결과에 따라 재평가).

## 2. src — 코어 ~5k줄만 남기고 메타 ~17k줄 추출

| 처분 | 모듈 | 규모(테스트 포함) |
|---|---|---|
| **Keep** | brain.ts(색인·검색·capture — 도구 축소분 제거 후 슬림화)·mcp.ts/mcp-server.ts(도구 3+신규)·notes 계열·composition·**임베딩 경로**·query 측정(query-analysis) | ~5k줄 → 축소 후 더 작아짐 |
| **Extract** | `src/agents/*` 전부(skills·skill-contract·reconcile·commands·seed·deploy·workflow-policy·workflow-docs ~9k줄)·delegation·review-preflight·evidence-schema·retro의 self-review 집계 절 | ~17k줄 |
| **경계 주의** | retro-analysis는 **쪼갠다** — 검색 품질 측정(query-report)은 코어 측정이라 Keep, self-review/커밋 집계는 메타라 Extract | — |
| **정정(2026-07-21 인벤토리 실측)** | LLM 게이트웨이 백엔드 스택(~2.9k줄, ask/ask_brain의 하부)은 §1의 Remove가 정본 — 초판 §2의 "backends Keep"은 임베딩 경로만을 뜻함(모호 표기 정정) | -2.9k줄 |

## 3. templates·scripts·docs

| 자산 | 처분 |
|---|---|
| `templates/` 48파일 전부(agents 페르소나 20·skills·sdd·contracts·guides) | **Extract** — 전부 메타 |
| scripts 중 코어(reindex·backup*·restore*·recover·update·device-sync·mcp-install/desktop/serve-http·query-report) | **Keep** |
| scripts 중 메타(rules-deploy·retro-report·review-preflight·agents 관련 등) | **Extract** |
| docs 코어(README·usage·mcp·backup·faq·troubleshooting·tutorial·concepts·home-server·product-vision) | **Keep** (도구 축소 반영 개정) |
| docs 메타(workflows·personas·agents·flow-*.gif·audit) | **Extract** |
| `specs/` 71개 | **동결 보존** — 역사는 git의 것. 이동·삭제 안 함(추출 repo가 필요 시 참조) |

## 4. 추출의 착지 — 별도 repo (권고) vs 완전 폐기 (사용자 선택)

**권고: `sdd-toolkit`(가칭) 별도 repo로 추출.** 근거 — 메타 계층은 localmind의 목적은
아니지만 **오늘도 사용자의 전 프로젝트에서 살아있다**: rules 배포(`~/.claude/localmind-rules.md`),
goal-ready/goal-impl/sdd-self-review 스킬, 페르소나. 완전 폐기하면 사용자의 크로스 프로젝트
워크플로가 그날로 부서진다. 추출 요건:

- 스킬·rules·페르소나의 **배포 파이프라인이 무중단으로 이전**된다(정본 데이터 폴더
  `~/.localmind/rules`·`skills`는 그대로 — 배포 스크립트의 집만 이사).
- 추출 repo는 자기 거버넌스를 자기가 호스팅한다(자기참조 루프가 localmind 밖으로).
- **완전 폐기를 원하면**: 그것도 유효한 선택 — 단 "AI 모델이 좋아져서 flow는 모델이
  잘한다"(vision §1)를 극한까지 밀는 결정이므로, 스킬 없이 한 주 일해보는 실험 후 결정 권고.

## 5. Build — vision이 요구하는 신규 3종 (형태 스케치)

1. **결정 스키마(§4)**: capture에 `decision` 모드 — 선택/이유/전제(+휘발성) 구조. 기존 노트는
   forward-only(소급 없음).
2. **재접촉 리마인드(§5·§6-2)**: 세션이 다루는 주제와 겹치는 결정 노트의 휘발성 전제를 라이브
   확인 → **비차단 한 줄 신호**. 트리거는 재접촉 우선, 주기 스캔은 retro 보조.
3. **세션 주입(§2-3·§6-3)**: 프로젝트 감지 → 관련 결정·방향 브리핑을 세션 시작 컨텍스트로
   배달. 런타임 중립(파일 생성/MCP/훅 — OQ-V3에서 결정).

## 6. OQ-V2 — 검색 스택 실험 (임베딩 존폐)

체감 문제("나오는데 원하는 게 아님")가 임베딩 유사도의 특성일 가능성. **결정은 실험으로**:
실쿼리 로그 기반으로 [임베딩 검색] vs [구조 검색: 파일명·태그·최근성·전문 grep] A/B —
결정 노트 소환이라는 좁은 목적에서 어느 쪽이 이기는지. 임베딩이 지면 Ollama·재색인·색인
파일까지 통째로 감량(설치 마찰도 급감 — 비개발자 접근성 향상).

## 7. 단계 (순서 논리: 감량 먼저, 신규는 순수해진 몸 위에)

| Phase | 내용 | 산출 |
|---|---|---|
| **A. 메타 추출** | src/agents·templates·메타 scripts·메타 docs → 별도 repo, 배포 무중단 이전, localmind에서 제거 | ~17k줄 감량, repo가 vision과 일치 |
| **B. 표면 축소** | MCP 도구 17→3, openmemory·게이트웨이 의존 제거, brain 슬림화, docs 개정 | 의존 서비스 0~1개 |
| **C. 신규 3종** | 결정 스키마 → 재접촉 리마인드 → 세션 주입 (순서대로 — 뒤가 앞을 소비) | vision 핵심 가치 가동 |
| **D. 검색 실험** | OQ-V2 A/B → 임베딩 존폐 결정 | 형태 최종 확정 |

각 Phase는 별도 SDD 슬라이스(goal-ready → 사용자 확인 → goal-impl)로 진행하고, **모든
슬라이스는 vision §6 불변식(비침습)을 AC로 포함**한다. A와 B는 순서 교환 가능하나 A가
가장 큰 감량이라 먼저 권고. C-1(스키마)은 A·B와 독립이라 병행 가능.

## 8. 리스크·정직 공개

- **메타 추출의 이전 비용** — 배포 파이프라인·계약 테스트가 얽혀 있어 Phase A가 가장 큰
  수술. 무중단 요건(§4) 미충족 시 사용자 전 프로젝트 워크플로 영향.
- **remember/recall 제거** — openmemory에 쌓인 기존 메모리가 있다면 회수 필요(회수 절차를
  Phase B에 포함, 홈서버 정리 때와 동일 패턴).
- **도구 제거의 되돌림** — 전부 git 역사에 남아 복원 가능(비가역 아님).
- **이 계획 자체가 메타 작업이 되는 위험** — 각 Phase를 결과 중심으로 짧게, "재개편을
  재개편하는" 루프 금지. 계획 문서는 이 한 장으로 끝.

---

*근거: product-vision.md(전 절)·자산 인벤토리 실측(2026-07-21)·query-log 사용 분포·이 세션의
재검토 대화. 모든 처분은 draft — 사용자 확정 후 Phase별 SDD로 진행.*
