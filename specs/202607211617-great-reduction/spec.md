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
- **FR-3 도구 표면 17→3** *(goal: Success metrics)* — mcp-server의 등록 도구가 정확히
  `capture_note`·`search_notes`·`whoami`. 나머지 14개(도구 코드·스키마·테스트)는 제거
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

## AC (Given-When-Then — 테스트 1:1)

- **AC-1** Given 빌드된 localmind, When MCP 서버에 도구 목록 질의, Then 정확히 3개
  (capture_note·search_notes·whoami)만 반환. *(테스트: mcp-server.test 개정)*
- **AC-2** Given localmind 소스 트리, When `src scripts Makefile package.json docker*`에서
  `openmemory|8767|8787|ask_brain|remember|suggestTags` grep, Then 매치 0.
  *(테스트: 소스 grep 검증 — 결정적 스크립트)*
- **AC-3** Given sdd-toolkit repo, When 배포 명령 실행(dogfood), Then
  `~/.claude/localmind-rules.md`·스킬 배포 산출물이 갱신되고 내용이 추출 전과 동등.
  *(evidence: 배포 전후 diff 관찰)*
- **AC-4** Given 양쪽 repo, When 각자 전체 스위트 실행, Then green. localmind 스위트에
  Extract된 테스트 잔존 0. *(테스트: 스위트 자체)*
- **AC-5** Given localmind 트리, When inventory.md Extract/Remove 목록 대조, Then 잔재
  파일 0 + Keep 목록 전부 존재. *(evidence: 대조 스크립트 출력)*
- **AC-6** Given 재빌드된 localmind stdio 서버, When whoami→capture_note(태그 호출자
  공급)→search_notes 실호출(dogfood), Then 3개 모두 정상 + `.localmind/query-log.jsonl`
  기록 증가. *(evidence: 실행 로그)*
- **AC-7** Given openmemory 데이터, When 회수 절차 실행, Then export 건수 == 회수 노트
  건수(0건이면 0 기록). *(evidence: 회수 로그)*
- **AC-8** Given 이 슬라이스의 전체 diff, When 변경 유형 검토, Then 추가된 사용자 개입
  지점 0(제거·이동·문서 개정만). *(critic 렌즈 판정)*

## 결정 기록 (인벤토리 애매 6건의 확정)

| 항목 | 확정 | 근거 |
|---|---|---|
| 게이트웨이 스택 ~2.9k줄 | **Remove** | rebuild-plan §1 우선(정정 절 반영) — stdio 단독 위상 확정(2026.07.8) |
| 관측 UI(ui-status 등) | **Keep, 메타 import만 절제** | 코어 관측(§8 도그푸드 수단) — 게이트웨이 의존 절은 함께 제거 |
| embed.sh | **Keep** | 임베딩 경로는 Phase D 판정 전까지 존치 |
| bootstrap-guide | **Extract** | 내용이 메타 온보딩이면 이동, 코어 설치 안내면 Keep — 워커가 내용 기준 판정·기록 |
| claude-token | **Remove** | 게이트웨이 종속 |
| memory-export/import | **회수 1회 사용 후 Remove** | FR-5 절차 내장 |
| 문서 계약 테스트 7개(delegation.test 등) | **Extract** | 검증 대상(templates·goal-impl 규약)이 sdd-toolkit으로 가므로 동행 — sdd-toolkit이 검증 대상 문서 사본을 자체 보유. localmind AGENTS.md는 이번 슬라이스 무변경(후속 감량 후보로 보고) |

## Open questions
- ~~게이트웨이 backends Keep/Remove 모순~~ → 정정 완료(rebuild-plan 정정 절).
- OQ-1 sdd-toolkit 원격(GitHub) 생성 — 사용자 게이트(머지 보고 시 질의).
- OQ-2 localmind AGENTS.md 자체 감량 — 후속 슬라이스(이번엔 무변경).
- OQ-3 임베딩 존폐 — Phase D(202607211621-search-experiment) 판정·사용자 게이트 대기.
