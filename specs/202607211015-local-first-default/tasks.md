---
audience: both
---

# tasks — local-first 기본 재확정

phase 선언 문법은 `templates/skills/goal-impl/references/tasks-format.md`를 따른다.
주의: Phase 1은 **repo 밖(M5 실환경)** 작업 — files 선언은 repo 산출물(evidence)만.
배리어 검증은 git diff가 아니라 실행 출력·파일 관찰로.

## Phase 0 — EMBEDDINGS_* 배선 (repo — critic C-1)
> depends-on: 없음 · files: `scripts/mcp-install.sh`, `scripts/mcp-desktop.sh`, `scripts/reindex.sh`

- [x] **T0.1** 세 스크립트에 `EMBEDDINGS_URL`·`EMBEDDINGS_MODEL` 옵션 패스스루 추가 —
  **설정된 경우에만** 자식/등록 env로 전달, 미설정 시 현행과 동일(하위호환). 미설정 상태에서
  등록 결과·Desktop config **바이트 동일** + 전체 스위트 green, 설정 상태에서 3경로(설치·
  Desktop config env·재색인) 전달을 각각 관찰로 검증(AC-7 — 3경로 전수).

## Phase 1 — M5 복원 실증 (실환경 — 실증이 문서보다 먼저)
> depends-on: Phase 0 · files: `specs/202607211015-local-first-default/evidence/restore-log.md`

- [ ] **T1.1** Ollama 재기동·모델 확인(`brew services start ollama`, bge-m3 존재) →
  **U-5 실증**: Ollama /v1 직결로 임베딩 1건 호출(curl — 더미 키) 성공 여부. 실패 시
  `make embed`(litellm) 경로로 전환하고 사실 기록.
- [ ] **T1.2** `.env` 로컬 구성(NOTES_DIR 라벨 문법 — 벌트 폴더들, EMBEDDINGS_* — T1.1
  결과대로) → `make update`(pull·빌드) → `make reindex`(**U-4 실증**: EMBEDDINGS_MODEL
  bge-m3 실동작, 소요 시간 기록, .brain-index 생성 확인). 기존 `.env`는 백업 후 수정.
- [ ] **T1.3** `make mcp-install`(Claude Code stdio) + `make mcp-desktop`(Desktop 등록 —
  config JSON 확인, AC-5). 원격 등록은 병행 유지.
- [ ] **T1.4** 검증(AC-4): 로컬 stdio whoami·search_notes(벌트 노트 회수)·capture_note →
  **로컬** query-log.jsonl 기록 확인(측정 루프 복원). 전 과정을 restore-log.md로 기록.
- [ ] **T1.5** 기기 노트(devices/shaulm5local.md) 갱신 — "홈서버 두뇌만" 절을 실상(로컬
  기본 + 원격 옵션 병행)으로. 갱신 요지를 보고에 명시(사용자 벌트).

## Phase 2 — 문서 확정 (repo)
> depends-on: Phase 1 · files: `README.md`, `docs/home-server.md`, `.env.example`

- [ ] **T2.1** README 하이브리드 위상 문장 추가(기존 문구 무변경 — 순수 추가).
- [ ] **T2.2** docs/home-server.md — 위상 문장 + **복귀 절차 절**(Phase 1 실행 로그의 정리본,
  단계 1:1 — AC-3).
- [ ] **T2.3** .env.example — EMBEDDINGS_URL·EMBEDDINGS_MODEL·EMBEDDINGS_KEY 예시(litellm
  경유 + Ollama 직결 병기, 더미 키 안내 — T1.1·T1.2 실증 결과만 기재).
- [ ] **T2.4** 전체 스위트 실행 — 기존 문서 계약 비회귀(AC-1·2의 green 조건).

## Phase 3 — self-review·versioned closure
> depends-on: Phase 1, Phase 2 · files: `specs/202607211015-local-first-default/goal.md`, `specs/202607211015-local-first-default/spec.md`, `specs/202607211015-local-first-default/plan.md`, `specs/202607211015-local-first-default/tasks.md`, `specs/202607211015-local-first-default/evidence/`

- [ ] **T3.1** preflight → 격리 self-review(§7A 예산) — AC-3~6은 evidence 실파일 대조가
  검증 수단임을 리뷰어에 명시.
- [ ] **T3.2** 문서 검증 표기([x]·matrix 상태) → versioned closure. OQ-2(원격 등록 정리)는
  사용자 확인 항목으로 보고에 포함.

## External handoff — tracked checkbox 범위 밖

- feature branch push + PR 생성(기기 트랙은 PR 밖 — evidence가 유일 근거임을 본문 명시).
- PR head CI 감시(full SHA), 최종 보고에 링크·상태.
- Desktop UI 도구 노출 확인(사용자) · OQ-2 원격 등록 정리 여부(사용자).
