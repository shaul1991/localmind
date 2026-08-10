---
title: "LocalMind Core Roadmap — Phase 0~6"
audience: both
status: active — 2026-08-09 사용자 승인
---

# LocalMind Core Roadmap

> **결론:** LocalMind는 더 많은 자동 연구보다 `설치의 진실성 → 정본·색인 내구성 → 측정 가능한 검색 → 정확한 brief → 이식 가능한 운영 → 제한된 자율 개선` 순서로 코어 사용자 여정을 완성한다.

## 북극성 사용자 여정

지원 환경의 새 기기와 새 AI 세션에서 다음 흐름을 재현할 수 있어야 한다.

1. `setup`이 준비 상태를 거짓 없이 판정한다.
2. `whoami`로 올바른 두뇌와 허용된 폴더를 확인한다.
3. `capture_note`가 요청한 Markdown 정본에 한 번만 저장한다.
4. `search_notes`가 유효한 출처와 함께 다시 찾는다.
5. `brief`가 관련 선택·이유·전제를 중복 없이 전달한다.
6. 새 기기나 장애 복구 뒤에도 같은 정본에서 흐름을 재현한다.

## 제품 불변식

- Markdown 노트가 정본이고 색인은 재생성 가능한 파생물이다.
- 모든 실행 방식은 MCP를 사용한다. 한 기기는 로컬 stdio, 여러 기기는 단일 정본의 원격 HTTP를 사용한다.
- 한 기기 사용에 서버를 요구하지 않으며, 여러 writable brain을 자동 생성하지 않는다.
- readiness·경계·인증·출처 무결성은 fail closed 한다.
- 정본 저장 뒤 파생 색인 갱신 실패는 저장 실패로 위장하지 않는다.
- 실제 개인 노트·질의·비밀값은 공개 artifact와 fixture에 넣지 않는다.
- 측정 없이 vector DB·reranker·knowledge graph 같은 플랫폼을 추가하지 않는다.
- `main`은 CI와 사람의 PR 검토를 통과한 변경만 받는다.

## Phase 0 — 정본 정합과 기준선

- 북극성 여정, Phase 범위, 종료 게이트를 저장소 정본으로 고정한다.
- 각 Phase는 독립 `[verified]` 커밋으로 유지한다. Phase 0·1은 선행 PR로 병합했고,
  Phase 2~6은 후속 feature branch와 Draft PR에서 순서대로 제출한다.
- **종료:** 범위·커밋 구조·공통 검증이 재현 가능하게 문서화된다.

## Phase 1 — 첫 유용 결과의 신뢰성

- setup의 거짓 성공을 제거한다.
- unknown folder 저장을 fail closed 한다.
- durable capture와 indexing 미확인을 구분한다.
- malformed embedding 응답을 거부한다.
- **종료:** `setup → whoami → capture → search → brief` 격리 smoke가 성공하고 오저장·중복저장·malformed vector 수용이 0건이다.

## Phase 2 — 정본·색인·복구 내구성

- 색인 손상·부분 쓰기·동시 저장에서도 Markdown 정본을 보존한다.
- clean-room backup→recover→reindex를 자동 검증한다.
- local/remote canonical brain이 조용한 split-brain을 만들지 않는다.
- **종료:** clean-room recover와 persistence fault suite가 성공하고 정본 손실·삭제 재등장이 0건이다.

## Phase 3 — 측정 가능한 검색

- 기존 공개 합성 corpus와 production retrieval 경로를 일급 회귀 명령으로 연결한다.
- 품질, no-match, 출처, 지연, 재현 manifest를 함께 보고한다.
- v1은 positive relevance 회귀를 차단하고 latency는 비차단 관측으로 남긴다. relevance threshold가 없는 no-match 오탐은 수치로 드러내고 후속 개선한다.
- 개선 순서는 chunk/metadata → hybrid → 제한적 rerank → 마지막에 저장 엔진 검토다.
- **종료:** 같은 버전·fixture의 결과가 결정적으로 재현되고 CI가 기준선 회귀를 차단한다.

## Phase 4 — 정확한 brief와 살아있는 결정

- `choice`, `why`, `assumptions`, 검증 시점, supersession을 구분한다.
- 관련 주제를 다시 접촉할 때만 stale assumption을 비차단으로 알린다.
- project/folder scope 밖의 기억을 주입하지 않는다.
- **종료:** 합성 multi-project fixture에서 중복 현재 결정과 scope 누출이 0건이다.

## Phase 5 — 이식성·운영·보안

- macOS/Linux, Node 20·22·24, local stdio/remote HTTP 계약을 고정한다.
- self-host 문서는 Tailscale을 쉬운 기본 예시로 추천하되 WireGuard·ZeroTier도 허용한다.
- CI-green merged SHA, 비권한 실행, protocol health, rollback을 검증한다.
- **종료:** clean host install/recover와 운영 negative suite가 지원 행렬에서 성공한다.

## Phase 6 — evidence-gated 자율 개선

- 결정 대체·유지·전제 재검증을 append-only 이력으로 남긴다.
- 민감 원문 대신 최소 집계 신호와 재현 가능한 결함으로 다음 후보를 제안한다.
- 4시간 무한 루프 대신 목표당 최대 5회, 구현 WIP 1개, 명시적 trigger를 유지한다.
- **종료:** speculative/meta 후보가 자동 구현으로 넘어가지 않고 사람의 merge gate가 유지된다.

## 공통 완료 조건

각 Phase는 실패 테스트를 먼저 관찰한 뒤 최소 구현으로 통과시키고, 관련 suite와 전체 suite를 실행한다. 최종 PR은 Node 20·22·24 CI, TypeScript tests, shell tests, typecheck, build, diff check, 독립 보안·로직·동시성 리뷰 blocker 0을 충족해야 한다.

## 범위 밖

- 사용자 가치와 직접 연결되지 않은 연구 프레임워크·critic·persona 확장
- 단일 기기에 서버 강제
- active-active 다중 정본 동기화
- 측정 전 vector DB·RAG 플랫폼 교체
- 실제 개인 데이터 기반 공개 benchmark
- 자동 merge 또는 `main` 직접 push
