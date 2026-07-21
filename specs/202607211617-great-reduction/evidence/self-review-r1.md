---
candidate-id: b3b6dd89e4769ff459bff4a310efc4d4abcb2c91
round: 1
independence: 격리(렌즈별 fresh critic 5, 병렬 — merged report 1건 = round 1)
blockers: 4
advisories: 15
approval-needed: false
completion: blocked
lenses: [traceability, coverage, correctness, simplify-security, live-verify]
duration-minutes: 11
---

# self-review round 1 — merged report (렌즈 병렬 5축)

candidate `b3b6dd8`, diff origin/main...HEAD (297파일 +1780/-31143). 렌즈①(추적성) clean ·
②(커버리지) blocker 1 · ③(정확성) blocker 2 · ④(단순화·보안) blocker 2 · ⑤(Live-Verify) clean.
교차 중복 제거 후 **blocker 4**:

## Blockers

| # | 검출 렌즈 | 내용 | 수정 |
|---|---|---|---|
| B1 | ② | `buildNoteFrontmatter`(Keep·FR-4가 만진 태그 경로)의 유일 결정적 테스트가 Extract 파일(retro-analysis.test)에 얹혀 소멸 — 특수문자 이스케이프(R5) 등 3단언 무방비 | 3단언을 `src/brain.test.ts`로 이관(순수 relocation) |
| B2 | ③+④ | `setup.sh`(온보딩 진입점)가 삭제된 스크립트 4종(ensure-master-key:71·embed:145·claude-token:176·ui:336) 실행 + 죽은 게이트웨이 `:4000` 최대 180초 폴링 + 제거된 make 타깃 안내 문구 8곳 — exit 127 실증 | 임베딩 블록을 Ollama 직결 온보딩으로 재작성·죽은 호출/폴링/문구 제거 |
| B3 | ④ | `scripts/brain-report.ts:15`가 삭제된 `src/agents/runtime` import — `make report` 크래시(exit 1 실증). coupling.md가 이 consumer를 누락 | 페르소나 해석부 절단 → 집계-only 발행, `make report` 도그푸드 |
| B4 | ③ | `mcp-install.sh`·`mcp-desktop.sh`가 `EMBEDDINGS_KEY` 미전달 → 신규 설치에서 3도구 전부 실패(무키 기동 재현: capture·search isError). 선재 결함(202607211015 유입)이나 이 감축이 직결을 유일 경로화하며 활성 승격 + brain.ts:749 에러 문구가 제거된 게이트웨이 지칭 | `${EMBEDDINGS_KEY:+…}` 패스스루 추가·에러 문구 EMBEDDINGS_KEY 기준 교체 |

## Advisories (동일 배치에서 수정하는 것)

재발 방지: AC-2 grep 패턴에 삭제 스크립트 basename·`:4000` 추가(spec amendment r1-1).
잔재 정리: brain.ts:78 기본 EMB_URL `:4000`→`:11434`(형제 doctor.sh와 정합) ·
.env.example stale 키(OPENMEMORY_*·"게이트웨이 :4000" 안내) 정리·EMBEDDINGS_* 활성화 ·
reindex.ts:8·mcp-install.sh:62,65·update.sh:42·clean.sh:48 죽은 문구 ·
resolveLink dead export 제거+brain.test 헤더 주석 정정 · docs/reference.md `multilingual-e5`
→ 실존 모델명(렌즈⑤ T1 404 확인) · 문서 정합 3건(tasks T2.1에 r0-4 부기·goal 도구 수 정정·
bootstrap-guide Keep 판정 명시).

보류(advisory 잔여 — 수정 안 함·정직 기록): mcp-install의 LITELLM_MASTER_KEY 패스스루는
기존 설치 하위호환 폴백으로 존치(brain.ts EMB_KEY 폴백 체인 유지) · MCP 핸들러 래퍼
커버 공백(렌즈②)은 후속 백로그 · compose `EMBEDDING_MODEL` 단수/복수 불일치는 pre-existing
라인으로 후속.

## 판정
blocker 4 수정 → **round 2 전량 재검증**(보수형 — verdict 승계 없음, 모든 matrix 행 재검증)
후 clean 시 완료.
