# 문제 해결 (Troubleshooting)

> 잘 안 될 때 증상별 해결. 자주 묻는 질문(설치·연동·성능·약관)은 👉 [FAQ](faq.md).

| 증상 | 원인 / 해결 |
|---|---|
| 채팅 호출이 실패/빈 응답(claude `Not logged in`/`config not found`) | `.env`의 `CLAUDE_CODE_OAUTH_TOKEN` 미설정/만료 → `make claude-token`으로 재발급해 `.env`에 넣고 **`make up`**(컨테이너 recreate; `make restart`는 env 재주입 안 됨). `make secrets`로 설정 여부 확인. (codex는 호스트 `~/.codex` 로그인 필요) |
| `make health`에서 일부 `000`/비정상 | 첫 기동은 모델 pull(bge-m3 ~1.2GB) + OpenMemory 소스 빌드로 **수 분** 걸림 → `make logs`로 진행 확인. 부하 중 임베딩이 멈추면 `make restart`. |
| 포트 충돌(8787/4000/8767) | 이미 쓰는 포트면 `.env`/compose에서 변경하거나 충돌 프로세스 정지. |
| 메모리 `User not found` | `user_id`는 **시드된 사용자**여야 함(기본 `localmind`). MCP 설정의 `OPENMEMORY_USER`를 시드값과 일치시킬 것 — 미설정 시 호스트명으로 떨어져 미시드 상태가 됨. |
| 노트 첫 인덱싱이 느림 | bge-m3 CPU 임베딩이 바닥(이후 증분이라 빠름). 급하면 GPU/TEI로 `EMBEDDINGS_URL` 교체. 한국어면 **다국어 모델만**(nomic 등 영어 전용 금지). |
| 임베딩 모델 변경 후 차원 오류 | `EMBEDDING_DIMS` 맞추고 `make clean`(볼륨 초기화) 후 재기동. |
