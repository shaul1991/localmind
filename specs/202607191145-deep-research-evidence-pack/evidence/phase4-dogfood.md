---
title: Phase 4 integration and Innerview dogfood evidence
audience: both
---

# Phase 4 — 통합·도그푸드

> **결론** — 전체 회귀와 실제 Innerview 구현 전 조사, 별도 evidence pack 생성·검증이 모두
> 성공했다. 조사 final critic이 법률 적용 문구의 과잉 확정 1건을 잡았고, 사실관계별 적용성 gate로
> 수정한 뒤 blocker 0으로 재검을 통과했다.

## 전체 회귀

- `npm test` — 954/954 pass.
- `npm run build` — exit 0.
- `git diff --check` — exit 0.
- lifecycle E2E는 temp roots에서 일곱 workflow의 seed→deploy→redeploy, managed drift 복원,
  unmanaged byte 보존, recover/restore, wrapper 적격 target 검증을 실행했다.

## Research dogfood

- run ID: `R-001`
- brief: 2026-07-19 기준 Innerview localhost 제품 목표가 구현 착수 가능한지, 기술 스택·신뢰성
  아키텍처·한국 개인정보/AI 경계를 공식 1차 자료로 검증한다.
- lanes: 기술 스택, 아키텍처/CI, 한국 법·정책의 격리 read-only 연구자 3개.
- final critic: 별도 격리 read-only reviewer.
- critic round 1: 법률상 의무를 실제 데이터 흐름과 무관하게 일괄 확정한 문구 1건 blocker.
- 수정: 수집 항목·처리자 관계·국외이전·자동화 수준·후기 대가성을 먼저 확정하고, 사실관계별
  적용 통제를 한국 법률/개인정보 전문가가 검수하는 출시 gate로 조건화.
- critic recheck: PASS, blocker 0.

핵심 결과는 PostgreSQL 18.4·Python 3.14.6·Node 24 LTS·Next.js 16.2·Xcode 26.6/Swift 6.3·
`gpt-5.6-sol`의 공식 확인, Android KGP/AGP 문서 충돌과 built-in Kotlin spike, outbox
lease/idempotency, 실 PostgreSQL migration, 채널별 CI 분리, 개인정보/AI 적용성 gate다.

## Evidence pack dogfood

- 명시된 임시 경로: `/tmp/innerview-research-pack.Xho3vV`
- exact files: `report.md`, `sources.jsonl`, `evidence.jsonl`, `claims.jsonl`, `run-manifest.json`
- validator: `valid: sources=24 evidence=24 claims=15 coverage=14/15`
- 미커버 1건은 계정별 `gpt-5.6-sol` entitlement를 의도적으로 `unverified`로 남긴 claim이다.
- pack 외 자동 HOME/Documents 선택, 자동 open, 외부 쓰기 없음.
- Innerview 작업트리의 기존 미추적 `.claude/`, `.codex/`, `.mcp.json`, localhost goal은 변경하지 않았다.

## Capability transparency

OpenAI 공식 문서 MCP는 현재 세션에 없어서 등록했지만 세션 도중 즉시 노출되지는 않았다. OpenAI 관련
주장은 공식 OpenAI 도메인만 사용하는 web fallback으로 검증했다. 다른 lane도 공식 T1/T2 source만
사용했다.
