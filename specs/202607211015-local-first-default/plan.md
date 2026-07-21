---
audience: both
---

# plan — local-first 기본 재확정

## 도메인 경계

- **repo 트랙(문서·구성·설치 스크립트)** — README·docs/home-server.md·.env.example +
  **scripts/ 배선 3파일**(mcp-install·mcp-desktop·reindex — EMBEDDINGS_* 옵션 패스스루,
  설정 시에만 전달·미설정 시 현행 동일). **src/ 코드 무변경**(키 가드 보존 — spec FR-2
  보수 확정). 통상 규약 7(branch→PR).
- **기기 트랙(M5 실환경)** — .env·Ollama·색인·MCP 등록·기기 노트(사용자 벌트). repo 커밋
  대상 아님 — evidence(restore-log)로 관찰 기록이 유일한 versioned 근거(202607202152 이중
  트랙 관례).
- **불변** — 홈서버 서비스·http 전송 코드·기존 로컬 stdio 경로(F-2~F-9) 전부 무변경.

## 확정 사실 표 (재조사 금지 — 인용만; 근거: 사실 지도 조사 2026-07-21)

| F | 사실 |
|---|---|
| F-2/F-4/F-5 | 로컬 stdio는 045에서 무변경 — dist/mcp.js 겸용 진입점, 기본 stdio |
| F-6 | 로컬 두뇌 env: NOTES_DIR·EMBEDDINGS_URL(기본 :4000/v1)·EMBEDDINGS_KEY(필수 가드)·EMBEDDINGS_MODEL |
| F-7/F-8 | make mcp-install(Claude Code stdio)·make mcp-desktop(Desktop JSON 병합, 기존 보존) |
| F-10~12 | 재색인: make reindex(scripts/reindex.sh — NOTES_DIR 해석)·색인은 첫 폴더/.brain-index.json·NOTES_DIR 쉼표·라벨 문법 |
| F-15/F-16 | backup/restore/recover 체인 완비 |
| F-18~20 | 임베딩은 OpenAI 호환 HTTP — Ollama /v1 직결 코드상 가능, 키는 더미로 가드 통과. .env.example에 EMBEDDINGS_URL 미기재 |
| F-21~24 | README·usage·mcp.md 이미 로컬 서사, home-server.md는 원격을 비추천 옵션으로 문서화 |
| U-4/U-5 | Ollama 모델명 실동작·litellm 우회 성립 — **미확인, FR-4 실증 대상** |

## 영향 모듈

| 트랙 | 경로 | 변경 |
|---|---|---|
| repo | `README.md` | 하이브리드 위상 1~2문장(FR-1) — 기존 문구 무변경·추가만 |
| repo | `docs/home-server.md` | 위상 문장 + 복귀 절차 절 신설(FR-1) |
| repo | `.env.example` | EMBEDDINGS_* 예시 — litellm/Ollama 직결 병기 + EMBEDDING_MODEL(단수)와 레이어 구분 주석(FR-2, 실증 후 확정) |
| repo | `scripts/mcp-install.sh`·`scripts/mcp-desktop.sh`·`scripts/reindex.sh` | EMBEDDINGS_URL·EMBEDDINGS_MODEL 옵션 패스스루(설정 시에만 — FR-2 배선, AC-7) |
| 기기 | M5 `.env`·Ollama·색인·MCP 등록 | FR-3 복원 실행(관찰 기록) |
| 기기 | `<사용자 노트 벌트>/devices/<기기>.md` | 기기 노트 갱신(사용자 벌트 — 보고 명시) |
| repo | `specs/202607211015-local-first-default/evidence/` | restore-log·실증 기록 |

## 단계

0. ✅ **Phase 0 — EMBEDDINGS_* 배선(FR-2 일부, AC-7)**: scripts 3파일 패스스루 + 하위호환
   확인(미설정 시 diff 없음·스위트 green). Phase 1의 .env 기반 실증이 이 배선을 전제.
1. ✅ **Phase 1 — M5 복원 실증(FR-3·4 전반)**: 절차 초안대로 실행하며 기록 — Ollama 기동 →
   U-5 실증(직결 vs litellm) → .env 구성 → 재색인 → mcp-install/mcp-desktop → 검증(AC-4·5)
   → U-4 확정. **실증이 문서보다 먼저**(Live-Verify — 문서에 미검증 단정 금지).
2. ✅ **Phase 2 — 문서 확정(FR-1·2)**: 실증 결과로 README·home-server.md·.env.example 작성.
   복귀 절차 = 실행 로그의 정리본(1:1, AC-3).
3. ✅ **Phase 3 — self-review·closure**(r1 clean): preflight → 격리 self-review(§7A) → 문서 검증 표기 →
   commit/push/PR. 기기 트랙은 PR 밖임을 본문 명시(이중 트랙 관례).

## 테스트 전략

- [x] 계약(unit): AC-1·2 — 기존 문서 계약 스위트 green + 신규 문구 존재는 수동/스위트 혼합
  (문서 추가는 기존 AC-17 등 비회귀 확인이 핵심).
- [x] 실행 관찰(도그푸드): AC-3·4·5·6 — M5 실환경 실행 로그가 evidence(결정적 재현은 불가한
  실환경 작업 — 관찰 기록·명령 출력 캡처가 근거, degraded 아닌 성격).
- [x] Live-Verify: U-4·U-5는 실증 전 문서 단정 금지.

## Verification matrix

| AC | 검증 방법·레벨 | 최소 evidence | 통과·종료 조건 | 상태 |
|---|---|---|---|---|
| AC-1 | 텍스트 검사 + 전체 스위트 | 문서 인용·테스트 로그 | 위상 문장·복귀 6단계 존재, 스위트 비회귀 green | ✅ r1 clean |
| AC-2 | 텍스트 검사 + diff 검사 | .env.example 인용·git diff | EMBEDDINGS_* 병기·더미 키 안내·src/ 무변경 | ✅ r1 clean |
| AC-3 | 실행 기록 대조 | evidence/restore-log.md | 절차↔실행 1:1·재색인 소요·색인 생성·기기 노트 갱신 기록 | ✅ r1 clean |
| AC-4 | 실행 관찰(M5 로컬 stdio) | 명령 출력 캡처 | whoami·search·capture 성공 + 로컬 query-log 기록 | ✅ r1 clean |
| AC-5 | 파일 검사 + 사용자 확인 | config JSON 인용 | localmind stdio 항목 존재(UI 노출은 사용자 확인 명시) | ✅ r1 clean |
| AC-6 | 실행 실증 | 실증 출력 캡처 | U-4·U-5 확정 + 문서 반영(불성립 시 fallback 문서화) | ✅ r1 clean |
| AC-7 | 실행 관찰 + 스위트 | 등록 결과·**Desktop config JSON 인용**·재색인 env 관찰·테스트 로그 | 3경로(설치·Desktop·재색인) 설정 시 전달·미설정 시 바이트 동일 | ✅ r1 clean |

모든 AC가 정확히 한 행. AC-3~6은 실환경 관찰(결정적 테스트 아님 — 성격 명시). 첫 dogfood
직전 freeze 대상.
