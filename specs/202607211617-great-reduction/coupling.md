---
audience: ai
title: "절단선 지도 — 메타 추출·표면 축소의 결합 지점 전수 (실측)"
date: 2026-07-21
method: "import 문·grep 실측 (추측 0)"
---

# 절단선 지도 (coupling map)

재개편 수술의 결합 지점 전수. 각 항목 = `파일:라인` + 절단 방법 1줄.
범례: [삭제]=코드 제거 · [이동]=추출 repo로 · [수술]=코어에 남기되 절단 후 봉합 필요.

## 1. 코어→메타 import (5지점)

| 지점 | 내용 | 절단 방법 |
|---|---|---|
| `src/brain.ts:14-15` | `agentsDir`(agents/registry)·`skillsDir`(agents/skills) import — 사용은 `brain.ts:661` 한 곳(색인 제외 판정) | [수술] 경로 판정 로직(env override+`firstNotesDir()/agents·skills` 기본값)을 brain 내 상수로 인라인 — 색인 제외 자체는 유지(노트 폴더 안 정본 데이터는 계속 존재) |
| `src/brain.ts:16-23` | agents/runtime의 `personaChat·resolvePersona·pickTarget·pickCrossTarget·modelBackend·parseVerdict` | [수술] 사용처 3곳이 각각 다름 — 아래 3행 참조 |
| ↳ `src/brain.ts:1335-1342` | `suggestTags()`가 **curator 페르소나+게이트웨이**로 태그 제안 — **capture(Keep 핵심 경로)의 일부** | [수술·결정 필요] 태그 제안 기능 제거(캡처 시 호출자 AI가 tags를 직접 넘기는 현행 경로만 유지) 권고 — 게이트웨이 생존의 마지막 인질 |
| ↳ `src/brain.ts:1544-1567` | `verifyAnswer()`가 critic 페르소나+게이트웨이로 답 검증 — askBrain 전용 | [삭제] askBrain 제거와 함께 통째 삭제 |
| ↳ `src/brain.ts:1584-1633` | `askBrain()`이 librarian 페르소나·게이트웨이(`:88-89`·`1621-1622`) 호출 | [삭제] ask_brain 도구 제거와 함께 통째 삭제 |
| `src/mcp-server.ts:13-15` | `scaffold.js`·`agents/registry`·`agents/deploy` import (scaffold_sdd·list_agents·deploy_agents 도구) | [삭제] 도구 3개 절 삭제 → import 자연 소멸 (모듈 본체는 [이동]) |
| `src/ui-status.ts:11-14` | agents registry/deploy/skills + `rules/registry` import (상태 페이지의 페르소나·스킬·rules 섹션) | [수술] 메타 섹션 제거(노트·인덱스·git 섹션만 잔존) — 또는 ui-status 존폐 자체를 Phase B에서 판정 |
| `scripts/asset-dirs.ts:13-14` | backup-assets.sh의 백업 대상 판정이 agents/skills 모듈 import | [수술] 정본(`~/.localmind/{agents,skills}`)은 노트 폴더 하위라 **노트 백업에 자연 포함** — asset-dirs 경유 특별취급 제거 가능. backup.sh 연쇄 확인 필수 |

## 2. 메타→코어 (추출 repo가 가져가야 할 것)

- `src/agents/registry.ts:51-68` — `firstNotesDir()` 폴백(`~/.localmind`) 로직: 추출 repo가 복사 소유.
- `src/rules/registry.ts:44-45` — rulesDir=`firstNotesDir()/rules`: 동일.
- `src/agents/runtime.ts:18` — 게이트웨이 URL 의존: **게이트웨이가 제거되므로 추출 repo의 personaChat 실행 경로는 추출 repo 소관으로 명시**(localmind는 책임지지 않음).
- retro-note→retro-analysis 타입 의존은 메타 내부 폐쇄(코어 유출 없음). 단 `src/report-note.ts`(코어 측정)는 query-analysis만 봄 — 결합 없음 ✓.

## 3. openmemory(:8767)·게이트웨이(:8787) 의존 지점

**핵심 발견: "게이트웨이"는 외부 서비스가 아니라 이 repo 자신의 서버 서브시스템이다.** ask 제거 시 연쇄 사망 범위가 도구 6개가 아니라 **src ~15파일 + docker 스택**:

| 지점 | 내용 | 절단 방법 |
|---|---|---|
| `src/mcp-server.ts:17-21` | GATEWAY_URL·GATEWAY_KEY·OPENMEMORY_URL·MEMORY_USER 상수 | [삭제] (MEMORY_USER→whoami가 hostname만 쓰도록 축소) |
| `src/mcp-server.ts:93-95` | ask → 게이트웨이 chat/completions | [삭제] |
| `src/mcp-server.ts:119-144` | remember·recall → openmemory API | [삭제] |
| `src/mcp-server.ts:293-321` | list_memories·delete_memory → openmemory API | [삭제] |
| `src/mcp-server.ts:45·67` | whoami/configSummary가 gateway·memory URL 보고 | [수술] notes·index 정보만 보고 |
| 게이트웨이 서버 서브시스템: `src/index.ts`·`server.ts`·`routes/{chat,messages,models,ui}.ts`·`backends/{claude,codex,gemini,router,types}.ts`·`session.ts`·`tools.ts`·`transform.ts`·`types.ts`·`types-anthropic.ts`·`config.ts`(port 8787) | ask/ask_brain의 유일한 서버측 | [삭제] — 단 config.ts는 코어 설정 잔존분 분리 후. `npm run dev/start`·`smoke:anthropic*`·`smoke:tools` 동반 삭제 |
| `docker-compose.yml` 서비스 `localmind`(게이트웨이)·`litellm`·`openmemory`·`openmemory-init` | 스택 | [삭제] ollama만 잔존시키거나 컴포즈 자체 제거(임베딩 직결이면 brew ollama로 충분) — Phase B 판정 |
| Makefile `up/up-quiet/down/restart/ps/logs/embed/doctor/health/smoke/memory-export/memory-import/clean/purge` | 스택 운용 타깃 | [수술] 스택 제거 폭에 맞춰 삭제·축소 (memory-export/import는 openmemory 데이터 회수 1회 실행 후 삭제) |
| `src/ui-server.ts:36-38` | 상태 UI가 gateway·memory 헬스 확인 | [수술] 해당 프로브 제거 |

## 4. 빌드·배포 얽힘

| 지점 | 내용 | 절단 방법 |
|---|---|---|
| Makefile `agents-deploy·skills-deploy·rules-deploy·init-sdd·retro·retro-cron·review-preflight` | 메타 타깃 | [이동] 추출 repo Makefile로 |
| `scripts/update.sh:87-97+` | **코어 일상 명령 `make update`가 reindex 후 agents:deploy(이어 skills·rules deploy) 호출** | [수술] update.sh에서 deploy 3종 호출 제거 — 사용자는 추출 repo의 make update를 별도 실행 (무중단 위반 1순위 지점) |
| npm scripts `init-sdd·agents:deploy·rules:deploy·retro-report·skills:deploy·review:preflight` | 메타 | [이동] |
| npm scripts `dev·start·smoke:anthropic·smoke:anthropic:tools·smoke:tools·smoke:mcp(ask 경유 여부 확인)` | 게이트웨이 | [삭제] |
| scripts [이동] 대상: `agents-deploy.ts·rules-deploy.ts·skills-deploy.ts·init-sdd.ts·retro-cron.sh·retro-report.ts(+test)·review-preflight.ts(+test.mjs)·verify-targets.ts·workflow-lifecycle.test.mjs·asset-dirs.ts(§1 수술 후)` | — | [이동] |
| scripts [삭제] 대상(스택): `up.sh·setup.sh·doctor.sh·embed.sh·ensure-master-key.sh·claude-token.sh·smoke-anthropic*.ts·smoke-tools.ts` | 게이트웨이·litellm 전제 | [삭제] (doctor는 ollama 진단 잔존분 분리 검토) |
| tsconfig/dist | tsc 전체 빌드 | 자연 축소(엔트리 정리만: package.json `main`·`bin` 확인) |

## 5. 테스트 얽힘

| 지점 | 내용 | 절단 방법 |
|---|---|---|
| `src/brain.test.ts:928-962` | agents/ 색인 제외 AC-9 테스트 | [수술] §1 인라인 후에도 거동 동일 — 테스트 유지(경로 상수 기준으로 수정) |
| `src/mcp-server.test.ts:18-75` | scaffold_sdd 절 | [이동 또는 삭제] 도구 삭제와 동기 |
| `src/mcp-server.test.ts:76-126` | list/deploy_agents 절 | 동상 |
| `src/mcp-server.test.ts` remember/recall/ask 절 | openmemory·게이트웨이 mock 테스트 | [삭제] |
| CI shell tests 루프 | `scripts/*.test.sh` 전수 실행(nullglob) | 이동하면 자동 축소 ✓ (수정 불요) |
| 본체 없는 문서 계약 테스트: `delegation.test.ts·execution-policy.test.ts·governance-status.test.ts·tier-classification.test.ts·reentry-guard.test.ts·workflow-docs.test.ts·cross-review.test.ts` 등 | AGENTS.md·templates 문구 검증 | [이동] — 단 AGENTS.md 자체가 localmind에 남으므로 **검증 대상 문서의 거처 결정과 동기 필요** |

## 6. 배포 파이프라인 — 무중단 추출 체크리스트

- **정본 데이터는 repo 밖** ✓ — `~/.localmind/{agents,skills,rules}`(노트 폴더 하위, `LOCALMIND_{AGENTS,SKILLS,RULES}_DIR` override). 이사 불필요 — 백업도 노트 repo 백업에 자연 포함.
- **배포 타깃 경로 불변 필수**: `~/.claude/localmind-rules.md`(src/rules/deploy.ts:210)·Claude/Codex/Gemini 설정 — 추출 repo가 동일 경로에 배포하면 소비자(전 프로젝트 CLAUDE.md @import) 무중단.
- 추출 repo가 가져갈 것: `src/agents/*`·`src/rules/*`·`scaffold.ts`·`retro-analysis/note/guard`·`evidence-schema`·`review-preflight`·§5 문서 계약 테스트들·`templates/` 48파일 전부·§4 [이동] scripts·`firstNotesDir` 복사본·docs(workflows·personas·agents·flow-*.gif).
- localmind에 남길 스텁: **없음(권고)** — Makefile 타깃·update.sh 호출 제거. 유일 예외 후보: README에 추출 repo 포인터 1줄.
- 이전 검증(무중단 실증): 추출 repo에서 `make rules-deploy` 실행 → `~/.claude/localmind-rules.md` diff 0 / `skills-deploy` → `/goal-impl` 스킬 파일 diff 0.

## 7. CI

- `.github/workflows/ci.yml:33-40` shell tests 루프 — 자동 축소 ✓.
- `ci.yml:42-57` docker build 2스텝(게이트웨이 이미지·openmemory 이미지) — [삭제] Phase B에서 스택과 동기.
- typecheck/test/build 매트릭스 — 불변.

## 절단 지점 총계: 34 (파일·타깃 단위)

## 위험 top 3

1. **capture의 숨은 인질** — `suggestTags`(brain.ts:1335)가 Keep 핵심 경로(capture) 안에서 curator 페르소나+게이트웨이를 호출한다. 게이트웨이를 지우려면 태그 제안 기능의 제거(또는 대체) 결정이 선행돼야 하며, 놓치면 capture가 런타임에서 조용히 게이트웨이를 찾다 실패한다.
2. **`make update`(코어 일상 명령)가 메타 배포를 내장 호출**(update.sh:93+) — 추출 후 이 절단을 봉합하지 않으면 모든 기기의 일상 최신화가 깨진다(무중단 요건의 1순위 실패 지점). backup-assets.sh의 agents/skills 특별취급도 동류.
3. **게이트웨이 제거의 실제 폭발 반경이 계획서 추정보다 큼** — "도구 2개 제거"가 아니라 서버 서브시스템 ~15파일 + docker-compose 4서비스 + Makefile 스택 타깃 ~14개 + CI docker build + npm dev/start/smoke 동반 정리. Phase B의 작업량·검증 범위를 이 폭으로 재산정해야 한다.
