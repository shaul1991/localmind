---
audience: both
tier: 2
tier-rationale: 하드 신호 다중 해당 — 크로스커팅(전 계층 제거·이동), 계약 변경(MCP 도구 표면 17→3), 전역 빌드·배포 구조 변경. escalate 불필요(자명한 Tier 2).
---

# goal — great-reduction (재개편 Phase A+B 통합: 메타 추출 + 표면 축소)

## Background
product-vision.md(2026-07-21 확정)이 localmind를 "살아있는 why 저장소"로 재정의했다.
rebuild-plan.md가 전 자산을 판정한 결과: 코어 ~5k줄에 메타 ~17k줄이 얹혀 있고, MCP 도구
17개 중 실사용은 2개, 외부 로컬 서비스 의존 2개(openmemory·게이트웨이)는 사용 0이다.

## Problem
(도구 수 정정: 초판의 "17개"는 오기 — 등록 도구 실측 15개, spec FR-3·r1 렌즈① advisory 반영.)
repo의 대부분이 비전의 Non-goal(§7 — how·방법론 계층)이다. 무게는 설치·이해·유지보수
마찰이 되고, 죽은 도구 표면은 AI 호스트의 도구 선택을 오염시키며, 미사용 서비스 의존은
설치 장벽이다. 단, 메타 계층은 사용자의 전 프로젝트 거버넌스로 **살아있으므로** 삭제가
아니라 이주가 필요하다.

## Objective
rebuild-plan Phase A+B를 한 슬라이스로 집행한다: 메타 계층을 별도 repo(`sdd-toolkit`)로
**무중단 추출**하고, MCP 도구를 3개(capture_note·search_notes·whoami)로 축소하고,
openmemory·게이트웨이 의존을 제거해 — repo를 vision과 일치시킨다.

## Expected outcome
- localmind = 코어만: 노트 capture·검색·주입 기반·백업/동기화. src 절반 이하로 감량.
- 사용자 워크플로(rules·skills·페르소나 배포) 무중단 — 집만 이사.
- 외부 서비스 의존 2개 제거(임베딩 1개만 잔존 — Phase D 판정 대상).

## Success metrics
- MCP 도구 목록 == 정확히 3개.
- localmind에 src/agents·templates(메타) 잔재 0, 추출 repo에서 배포 실동작.
- 전 스위트 green(양쪽 repo), 코드에서 openmemory/게이트웨이 참조 0.

## Non-goals
- 신규 기능(결정 스키마·brief·리마인드) — Phase C 슬라이스(202607211621-living-memory).
- 임베딩 존폐 — Phase D 판정 후(사용자 게이트). 단 판정이 이 슬라이스 내 도착하면 편입 가능.
- specs/ 71개 이동·삭제 — 역사는 동결 보존(rebuild-plan §3).
- 추출 repo의 원격(GitHub) 생성 — 로컬 git repo까지가 이 슬라이스, 원격 push는 사용자 게이트.

## Constraints
- vision §6 불변식 준수(이 슬라이스는 제거·이동만 — 새 개입 흐름 금지).
- 무중단: 추출 전후로 `~/.claude/localmind-rules.md` 배포·스킬 배포가 동일 동작.
- 노트 데이터·`.localmind/` 데이터 폴더 무접촉. 파괴적 삭제 없음(git 역사 보존 — 가역).

## Stakeholders
단일 사용자(설치한 개인 누구나 — 비개발자 포함). 추출 repo는 SDD 워크플로 사용자용.

## Risks (critic A3 반영: 교차기기 한계 — 무중단은 추출 기기(M5) 기준. 다른 기기의 메타
배포 *갱신*은 sdd-toolkit 원격 생성·셋업(OQ-1 게이트) 전까지 정지되나, 이미 배포된 산출물은
잔존해 동작한다.)
- 배포 파이프라인 절단 실수 → 전 프로젝트 워크플로 영향 (완화: AC-3 배포 생존 도그푸드).
- 코어↔메타 숨은 결합 → 빌드 파손 (완화: coupling.md 절단선 실측 후 집행).
- 타임어택 압박 → 검증 생략 유혹 (완화: 게이트 불변 — 시간 초과 시 상태 보고가 규칙).

## Success metrics 달성 표기 (2026-07-22, self-review r3 clean)
- [x] MCP 도구 목록 == 정확히 3개 (AC-1, smoke:mcp 라이브)
- [x] 메타 잔재 0·sdd-toolkit 배포 실동작 (AC-3·5 — 원격 github.com/shaul1991/sdd-toolkit 생성됨)
- [x] 전 스위트 green(양쪽)·openmemory/게이트웨이 참조 0 (AC-2·4)
