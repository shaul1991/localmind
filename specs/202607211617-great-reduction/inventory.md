---
audience: ai
type: inventory
basis: docs/rebuild-plan.md §0(판정 원칙)·§1(도구)·§2(src)·§3(templates·scripts·docs)
date: 2026-07-21
---

# 파일 단위 전수 처분 명세 (great-reduction)

판정: **Keep**(코어 존속) / **Extract**(별도 repo 이전) / **Remove**(삭제 — git 역사로 복원 가능) /
**개정**(존속하되 내용 수정) / **애매**(§8 — 확정 금지, 사람/메인 판정 필요).
"부분"=파일 존속하되 내부 절단.

## 1. src/ — 코어 (Keep)

| 파일 | 판정 | 근거 |
|---|---|---|
| brain.ts (1962) | Keep·부분 | 색인·검색·capture 코어. listNotes/noteLinks/deleteNote 등 Remove 도구 지원부 절단 |
| brain.test.ts (2165) | Keep·부분 | 절단부 테스트 동반 삭제 |
| mcp.ts (53) | Keep | stdio 엔트리 |
| mcp-server.ts (475) | Keep·부분 | 도구 17→3(capture_note·search_notes·whoami)+신규. Remove 9·Extract 3 절단 |
| mcp-server.test.ts (135) | Keep·부분 | 동반 |
| mcp-http.ts (172) + .test (153) | Keep | serve-http 원격 옵션(local-first의 옵션 경로) |
| mcp-transport.ts (36) + .test (36) | Keep | 전송 공통 |
| config.ts (101) + .test (36) | Keep·부분 | 게이트웨이·openmemory 설정 키 정리 |
| query-analysis.ts (212) + .test (176) | Keep | 코어 측정(query-log) — vision §9 측정 루프 |
| report-note.ts (61) | Keep·부분 | query/brain-report 발행 — retro 참조부 절단 |
| search-event-contract.test.ts (244) | Keep | 검색 이벤트 스키마 계약(코어 측정) |
| eval-metrics.ts (89) + .test (74) | Keep | 검색 품질 지표 |
| retrieval-quality/* 9파일 (~1.7k) | Keep | 검색 품질 평가 하니스 — Phase D(OQ-V2 실험)의 도구 |
| retrieval-quality-*.test 9파일 (~1.2k) | Keep | 동반 |
| types.ts (83) | Keep·부분 | 공용 타입 — 게이트웨이 전용 타입 절단 |
| util/proc.ts (88)·util/log.ts (25) | Keep | 공용 유틸 |

**소계 Keep: 31파일 ≈ 9.4k줄** (부분 절단 후 축소 예상)

## 2. src/ — 메타 (Extract)

| 파일군 | 판정 | 근거 |
|---|---|---|
| agents/* 24파일 (~11.9k): skills·skill-contract·reconcile·commands·seed·deploy·workflow-policy·workflow-docs.test·registry·binding·cross-review(+cli)·runtime·verify-targets·tier-classification.test·reentry-guard.test | Extract | 페르소나·스킬·워크플로 전부 메타 |
| rules/* 9파일 (~1.0k): deploy·registry·render·compose·index (+tests) | Extract | rules 배포 파이프라인 |
| retro-analysis.ts (306) + .test (743) | Extract | self-review/커밋 집계 — query 측정은 이미 query-analysis.ts로 분리돼 있어 Split 불필요, 통째 이전 |
| retro-note.ts (169)·retro-guard.ts (21) | Extract | retro 발행 |
| review-preflight.ts (291) + .test (377) | Extract | critic preflight |
| evidence-schema.ts (54) | Extract | self-review evidence SSoT (소비자가 전부 메타) |
| scaffold.ts (100) + .test (312) | Extract | scaffold_sdd 도구 본체 |
| delegation.test.ts (477)·execution-policy.test.ts (62)·governance-status.test.ts (222) | Extract | 위임·실행등급·거버넌스 계약 |
| ui-status.ts (544) + .test (271) | Extract | agents/skills/rules 상태 표면 — 메타 의존 100% |

**소계 Extract: 44파일 ≈ 16.9k줄**

## 3. src/ — Remove

| 파일 | 판정 | 근거 |
|---|---|---|
| notes-browser.test.ts (128) | Remove | list_notes/note_links/delete_note(사용 0) 테스트 |
| (brain.ts·mcp-server.ts 내부의 remember/recall/list_memories/delete_memory·ask/ask_brain·list_notes/note_links/delete_note 지원부) | Remove·부분 | rebuild-plan §1 Remove 9종 |

※ 게이트웨이 스택은 §8 애매로 이관(계획 문서 내부 모순).

## 4. scripts/ 80파일

| 판정 | 파일 |
|---|---|
| **Keep (37)** | backup.sh(+test)·backup-init·backup-cron(+test)·backup-assets(+test)·backup-extras(+test)·restore-assets(+test)·restore-extras(+test)·recover.sh·trash.sh(+test)·purge.sh(+test)·clean.sh·update.sh(+test)·device-sync.sh·device-sync-receive.sh·device-sync-e2e.test·device-sync-pipeline.test·mcp-install.sh(+test)·mcp-desktop.sh(+test)·mcp-serve-http.sh·notes-connect.sh(+test)·reindex.sh·reindex.ts·query-report.ts(+test)·brain-report.ts·report-cron.sh·retrieval-quality.ts·embed-bench.ts(Phase D까지)·index-labels.ts·asset-dirs.ts·doctor.sh·setup.sh·install-wizard.mjs(+test)·lib/notes-dir.sh·lib/read-env.sh·notes-dir.test·read-env.test·pinning.test·reliability-wiring.test·smoke-brain.ts·smoke-mcp.ts |
| **Extract (11)** | agents-deploy.ts·skills-deploy.ts·rules-deploy.ts·init-sdd.ts·retro-report.ts(+test)·retro-cron.sh·review-preflight.ts(+test.mjs)·verify-targets.ts·workflow-lifecycle.test.mjs |
| **Remove (8)** | memory-export.ts·memory-import.ts(openmemory — B에서 회수 후)·ensure-master-key.sh·master-key.test.sh(litellm)·smoke.ts·smoke-anthropic.ts·smoke-tools.ts·smoke-anthropic-tools.ts(게이트웨이 스모크 — §8 게이트웨이 판정에 종속) |
| **애매 (6)** | up.sh(docker 게이트웨이)·ui.sh·ui-stop.sh(관측 UI)·claude-token.sh(게이트웨이 인증)·embed.sh(litellm 경유 — 직결로 불필요?)·bootstrap-guide.mjs(+test)(가이드 성격) → §8 |

(파일 수 검산: 37+11+8+6+테스트 병기 포함 = 80 전수 — 병기 표기로 개수 압축)

## 5. templates/ 48파일 — 전부 Extract

| 디렉토리 | 파일 수 | 판정 |
|---|---|---|
| agents/ | 19 | Extract (페르소나) |
| skills/ | 14 | Extract (goal-ready·goal-impl·sdd-self-review 등) |
| sdd/ | 9 | Extract (goal/spec/plan/design 템플릿) |
| contracts/ | 4 | Extract (바이브 계약 템플릿) |
| guides/ | 1 | Extract |
| sample-persona.md | 1 | Extract |

## 6. docs/ 18파일 + Makefile + package.json + 루트

| 자산 | 판정 |
|---|---|
| docs: backup·home-server·product-vision·rebuild-plan·demo.png | Keep |
| docs: concepts·faq·mcp·reference·troubleshooting·tutorial·usage | Keep·개정 (도구 축소·게이트웨이/openmemory 제거 반영) |
| docs: agents.md·personas.md·workflows.md·flow-backend.gif·flow-pm.gif | Extract |
| docs: architecture-business-logic-audit-2026-07.md | 보존(역사 — specs 동결과 동일 취급) |
| Makefile Keep 타깃 | install·build·check·setup·smoke·health·doctor·clean·purge·uninstall·trash-*·backup*·restore·recover·update·device-sync·reindex·query-report·query-log-clean·report·report-cron·mcp-install·mcp-uninstall·mcp-config·mcp-desktop·mcp-serve-http·notes-connect·init-env·guide(애매) |
| Makefile Extract 타깃 | agents-deploy·skills-deploy·rules-deploy·init-sdd·retro·retro-cron·review-preflight |
| Makefile Remove/애매 타깃 | memory-export·memory-import(B)·embed(litellm)·token·secrets·claude-token(게이트웨이)·dev·up·up-quiet·down·restart·ps·logs(docker/게이트웨이)·ui·ui-bg·ui-stop(관측 UI) → §8 종속 |
| package.json scripts | Keep: build·typecheck·test(글롭 개정 — agents/rules 제거)·mcp·reindex·query-report·brain-report·retrieval:quality·smoke:brain·smoke:mcp·memory:*(B까지) / Extract: agents:deploy·rules:deploy·skills:deploy·init-sdd·retro-report·review:preflight / 애매: dev·start·ui·smoke(게이트웨이)·smoke:anthropic*·smoke:tools |
| dependencies | Keep: @modelcontextprotocol/sdk·yaml·zod / 애매: express(게이트웨이+UI 전용 — 게이트웨이 Remove+UI 판정 시 제거 가능) |
| devDependencies | Keep: tsx·typescript·@types/node / 애매: @anthropic-ai/sdk·openai(게이트웨이·스모크 전용 추정)·@types/express(express 동행) |
| 루트 | README·AGENTS.md(메타 절 대거 이전)·BACKLOG·ROADMAP·CHANGELOG: Keep·개정 / CLAUDE.md·GEMINI.md 스텁: Keep·개정 / tsconfig: Keep / package-lock: 재생성 / .github/workflows/ci.yml: Keep·개정(메타 테스트 경로 제거) / docker-compose{,.gpu,.host}.yml: 개정(litellm·openmemory 서비스 제거 — 게이트웨이 판정 §8 종속) |
| specs/ 71폴더 | 동결 보존 (rebuild-plan §3) |

## 7. 요약 통계

| 판정 | src | scripts | templates | docs | 대략 규모 |
|---|---|---|---|---|---|
| Keep(·부분·개정) | 31파일 ≈9.4k줄 | 37 | 0 | 12 | 코어 존속 |
| Extract | 44파일 ≈16.9k줄 | 11 | 48 | 5 | 별도 repo |
| Remove | 1파일+내부 절단 | 8 | 0 | 0 | git 역사 복원 가능 |
| 애매(§8) | 게이트웨이 ≈2.9k줄+UI | 6 | 0 | 0 | 판정 대기 |

## 8. 판정 애매 — 확정 금지, 사람/메인 판정 필요

1. **게이트웨이 스택 (~2.9k줄)** — index.ts·server.ts(+test)·session.ts(+test)·routes/{chat,messages,models}·tools.ts(+test)·transform.ts(+test)·types-anthropic.ts·**backends/* 7파일**: rebuild-plan **내부 모순** — §1은 ask/ask_brain Remove·"게이트웨이 의존이 통째로 사라진다", §2 Keep 목록에는 "backends" 명시. backends의 유일 소비자가 게이트웨이이므로 §1을 따르면 스택 전체 Remove(동행: smoke 4종·claude-token.sh·dev/start·docker 게이트웨이 서비스·express·@anthropic-ai/sdk·openai). §2를 따르면 존속. **권고: §1 우선(Remove) — 사용 0 실측과 vision 정합. 단 계획 문서 정정 필요.**
2. **관측 UI 계열** — ui-server.ts(+test)·routes/ui.ts·connection-status.ts(+test)·ui.sh·ui-stop.sh: 노트/상태 관측(코어 성격)이나 rules/skills(메타) import 혼재. 메타 의존 제거 후 축소 Keep vs Remove — vision §9 "측정 표면" 관점 판정 필요.
3. **embed.sh** — litellm 경유 전제(직결 전환으로 불필요 추정) vs 문서 참조 잔존.
4. **bootstrap-guide.mjs(+test)·make guide** — 온보딩 가이드(코어) vs 페르소나 안내 포함(메타) — 내용 확인 후 부분 개정.
5. **claude-token.sh·make token/secrets** — 게이트웨이 인증 유틸: 판정 1에 종속.
6. **memory-export/import** — Remove 확정이나 **시점**은 Phase B 회수 완료 후(순서 제약).
