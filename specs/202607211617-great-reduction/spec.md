---
audience: both
---

# spec — great-reduction (메타 추출 + 표면 축소)

정본 참조: goal.md(why) · docs/rebuild-plan.md(처분 판정) · inventory.md(파일 단위 전수) ·
coupling.md(절단선 34개 실측). 이 spec은 그 판정들을 FR/AC로 고정한다.

## FR

- **FR-1 메타 계층 추출** *(goal: Objective·vision §7)* — inventory.md의 Extract 판정 전부
  (src 44파일 ~16.9k줄 · scripts 11 · templates/ 48 전부 · docs 5)를 신규 로컬 repo
  `~/personal/shaul1991/sdd-toolkit`으로 이전하고 localmind에서 제거한다. 이전은 파일 복사
  + 원본 삭제(git 역사는 localmind에 보존 — 가역).
- **FR-2 배포 무중단** *(goal: Constraints)* — 추출 후 sdd-toolkit에서 rules·skills·페르소나
  배포가 현행과 동일 동작한다(정본 데이터 폴더 `~/.localmind/` 경로 불변). `make update`
  (localmind)는 메타 배포 호출을 절단하고 코어(pull·빌드)만 수행한다.
- **FR-3 도구 표면 15→3** *(goal: Success metrics — critic 실측 정정: 등록 도구는 15개(17은
  오기))* — mcp-server의 등록 도구가 정확히 `capture_note`·`search_notes`·`whoami`. 나머지
  12개(도구 코드·스키마·테스트)는 제거
  (메타 3종은 sdd-toolkit이 필요 시 자체 수용 — 이 슬라이스는 이전 의무 없음, 코드는 git 역사에).
- **FR-4 게이트웨이 스택 제거** *(rebuild-plan §1·정정 절)* — 서버 서브시스템(~15파일)·
  docker-compose 스택·관련 Makefile 타깃(~14)·CI docker build·npm dev/start/smoke 제거.
  `suggestTags`는 제거하고 capture의 태그는 호출자(AI)가 공급한다(현행 인자 그대로 — 자동
  제안만 소멸).
- **FR-5 openmemory 제거 + 데이터 회수** *(rebuild-plan §1·§8)* — remember/recall/
  list_memories/delete_memory 및 :8767 참조 제거. 제거 **전에** 기존 memory export를 1회
  실행해 노트로 회수(데이터 손실 0). 회수 대상이 0건이면 그 사실을 evidence에 기록.
- **FR-6 문서·빌드 정합** *(goal: Expected outcome)* — README·docs(Keep 12) 개정: 제거된
  도구·서비스·make 타깃 언급 0(단 specs/·CHANGELOG 등 역사 문서 제외). package.json
  scripts·deps에서 제거 대상 잔재 0(express 등 게이트웨이 전용 dep 제거).
- **FR-7 비침습 불변식** *(vision §6)* — 이 슬라이스는 제거·이동만 수행하며 새 개입 흐름
  (게이트·차단 알림·필수 사람 태스크)을 추가하지 않는다.

## Acceptance Criteria (Given-When-Then — 테스트 1:1)

- [x] **AC-1** Given 빌드된 localmind, When MCP 서버에 도구 목록 질의, Then 정확히 3개
  (capture_note·search_notes·whoami)만 반환. *(테스트: mcp-server.test 개정)*
- [x] **AC-2** Given localmind 소스 트리, When `src scripts Makefile package.json docker* ci.yml`
  에서 `openmemory|:8767|:8787|ask_brain|suggestTags|embed\.sh|claude-token|ensure-master-key|:4000|(^|[^a-z-])up\.sh`
  grep **및** package.json에서 `@anthropic-ai/sdk|"openai"` grep, Then 매치 0(게이트웨이 스택
  12파일 잔존은 AC-5의 Remove 목록 대조가 잡는다 — critic B2 반영. ~~express·@types/express~~는
  대상에서 제외 — 절제 실측에서 mcp-http(Keep, mcp-serve-http.sh)가 실사용 확인, amendment
  r0-1. 삭제 스크립트 basename·:4000은 r1 self-review B2가 grep 사각으로 실증해 추가 —
  amendment r1-1).
  *(테스트: 소스 grep 검증 — 결정적 스크립트)*
- [x] **AC-3** Given sdd-toolkit repo, When 배포 명령 실행(dogfood), Then 배포 산출물 **전량** —
  rules 글로벌 2(`~/.claude/localmind-rules.md`·`~/.codex/AGENTS.md`) + skills 3런타임
  (`~/.claude/skills`·`~/.agents/skills`·`~/.gemini/commands`) + 페르소나(`~/.claude/agents`·
  Codex 타깃) — 이 추출 전(localmind 배포)과 동등. Claude 런타임 3계열은 기준 스냅샷 대조,
  Codex/Gemini 계열은 localmind 배포 코드 소멸 전 교차 배포 해시 수렴으로 판정(critic B1 반영).
  *(evidence: 배포 전후 diff 관찰)*
- [x] **AC-4** Given 양쪽 repo, When 각자 전체 스위트 실행, Then green. localmind 스위트에
  Extract된 테스트 잔존 0. *(테스트: 스위트 자체)*
- [x] **AC-5** Given localmind 트리, When inventory.md Extract/Remove 목록 대조, Then 잔재
  파일 0 + Keep 목록 전부 존재. *(evidence: 대조 스크립트 출력)*
- [x] **AC-6** Given 재빌드된 localmind stdio 서버, When whoami→capture_note(태그 호출자
  공급)→search_notes 실호출(dogfood), Then 3개 모두 정상 + `.localmind/query-log.jsonl`
  기록 증가. *(evidence: 실행 로그)*
- [x] **AC-7** Given openmemory 데이터, When 회수 절차 실행, Then export 건수 == 회수 노트
  건수(0건이면 0 기록). *(evidence: 회수 로그)*
- [x] **AC-8** Given 이 슬라이스의 전체 diff, When 변경 유형 검토, Then 추가된 사용자 개입
  지점 0(제거·이동·문서 개정만). *(critic 렌즈 판정)*

## 결정 기록 (인벤토리 애매 6건의 확정)

| 항목 | 확정 | 근거 |
|---|---|---|
| 게이트웨이 스택 ~2.9k줄 | **Remove** | rebuild-plan §1 우선(정정 절 반영) — stdio 단독 위상 확정(2026.07.8) |
| 관측 UI(ui-status 등) | ~~Keep·절제~~ → **Remove (amendment r0-2)** | 절제 실측: 실체가 거버넌스 뷰어(specs/048)로 메타 결합 100% — 코어 관측은 CLI 리포트(query-report·brain-report)가 담당 |
| embed.sh | ~~Keep~~ → **Remove (amendment r0-3)** | 절제 실측: 실체가 게이트웨이 스택 오케스트레이터 — 임베딩 경로 자체(brain.ts·reindex·Ollama 직결)는 무변경 존치 |
| bootstrap-guide | **Extract → 판정 결과 Keep** | 워커 내용 판정: 코어 설치 안내(비개발자 온보딩 가이드)로 확인 → Keep(style.css 1파일 복원 포함 — r1 렌즈① advisory로 명시 기록) |
| claude-token | **Remove** | 게이트웨이 종속 |
| memory-export/import | **회수 1회 사용 후 Remove** | FR-5 절차 내장 |
| 문서 계약 테스트 7개(delegation.test 등) | **Extract** | 검증 대상(templates·goal-impl 규약)이 sdd-toolkit으로 가므로 동행 — sdd-toolkit이 검증 대상 문서 사본을 자체 보유. localmind AGENTS.md는 이번 슬라이스 무변경(후속 감량 후보로 보고) |

## Matrix amendments (freeze 후 개정 기록 — 절제 실측 기반, 2026-07-21)

| # | 개정 | 이유(실측) | 영향 AC | evidence 재실행 |
|---|---|---|---|---|
| r0-1 | AC-2에서 express·@types/express 제외 | mcp-http(Keep 표면, scripts/mcp-serve-http.sh)가 실사용 | AC-2 | grep-check 최신 패턴으로 실행됨(PASS) |
| r0-2 | 관측 UI 계열 Keep·절제 → 전체 Remove | 거버넌스 뷰어(specs/048) 실체 — 메타 결합 100%, 코어 관측은 CLI 리포트 소관 | AC-5 | tree-check 개정 목록으로 실행됨(PASS) |
| r0-3 | embed.sh Keep → Remove | 실체가 게이트웨이 오케스트레이터(임베딩 경로는 무변경 — D 게이트 판정 준수) | AC-2·5 | 동상(PASS) |
| r0-4 | config.ts·types.ts 부분 절단 → 전체 Remove, examples/·research-evidence-pack 픽스처 제거(인벤토리 누락 자산) | 절제 후 소비자 0 실측·픽스처는 sdd-toolkit 보유 확인 | AC-4·5 | 스위트·tree-check PASS |
| r1-1 | AC-2 grep 패턴에 `embed\.sh\|claude-token\|ensure-master-key\|:4000` 추가 | r1 self-review B2 — setup.sh의 삭제 스크립트 호출·유령 :4000 폴링이 기존 패턴의 사각이었음(실증) | AC-2 | grep-check 신패턴 재실행(r1 수정 후 PASS) |
| r2-1 | AC-2 grep 패턴에 `(^\|[^a-z-])up\.sh` 추가(신규 embedding-up.sh는 하이픈 선행으로 제외) + 설치 마법사(COMMANDS.up)를 embedding-up.sh(임베딩 엔진 켜기)로 재정의, 죽은 백엔드 토큰 단계(claude/gemini)를 EMBEDDINGS_KEY 단일 항목으로 교체, prereq 게이트를 "Node + (ollama 또는 Docker)"로 완화 | r2 전량 재검증 B-NEW — make guide 마법사가 삭제된 up.sh를 spawn(exit 127, README 권장 온보딩 경로 파손). 재발 방지: COMMANDS 스크립트 실존 단언 테스트 추가 | AC-2·5 | grep-check r2 패턴 재실행(PASS)·위저드 테스트 18/18 |

부수 신고: 셸 테스트 8개를 신세계 거동 단언으로 갱신(약화 아님 — update.test는 "메타 배포
미호출"을 단언), device-sync-receive 검증 게이트를 페르소나 seed→MCP 표면 테스트로 교체,
bootstrap-guide용 style.css 1파일 복원. 렌즈 critic이 이 amendment 4건+부수 신고를 실코드로
재검증한다(도장찍기 금지).

## Open questions
- ~~게이트웨이 backends Keep/Remove 모순~~ → 정정 완료(rebuild-plan 정정 절).
- ~~OQ-1 sdd-toolkit 원격(GitHub) 생성~~ → **사용자 게이트 통과·집행 완료(2026-07-22)**:
  `github.com/shaul1991/sdd-toolkit` private 생성·main push — OQ-4(교차기기 갱신)의 원격
  조건 충족(M1 셋업은 후속).
- OQ-2 localmind AGENTS.md 자체 감량 — 후속 슬라이스(이번엔 무변경).
- ~~OQ-3 임베딩 존폐~~ → **사용자 게이트 통과(2026-07-21): "판정만 기록, 제거는 후속"** —
  실험 판정(동률·제거 권고)은 search-experiment evidence에 기록, 임베딩 스택은 이 슬라이스
  에서 무변경 유지, 제거는 별도 후속 슬라이스.
- OQ-4 교차기기 한계(critic A3) — sdd-toolkit이 로컬 repo 한정인 동안 다른 기기(M1)의 메타
  배포 갱신은 원격 생성·셋업 전까지 정지(현행 배포 산출물은 잔존해 동작 — 갱신만 정지).
  OQ-1 게이트와 함께 해소.
