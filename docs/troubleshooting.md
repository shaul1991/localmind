# 문제 해결 (Troubleshooting)

> 잘 안 될 때 증상별 해결. 자주 묻는 질문(설치·연동·성능·약관)은 👉 [FAQ](faq.md).

| 증상 | 원인 / 해결 |
|---|---|
| `make health`에서 임베딩 `000`/비정상 | 임베딩 엔진이 꺼져 있음 — `brew services start ollama`(맥) 또는 `docker compose up -d`. 첫 기동은 모델 pull(bge-m3 ~1.2GB)로 **수 분** 걸릴 수 있음. |
| 노트 첫 인덱싱이 느림 | bge-m3 CPU 임베딩이 바닥(이후 증분이라 빠름). 급하면 GPU/TEI로 `EMBEDDINGS_URL` 교체. 한국어면 **다국어 모델만**(nomic 등 영어 전용 금지). |
| 임베딩 모델 변경 후 검색 이상 | 모델 게이트가 자동으로 빈 인덱스 폴백 → `make reindex`로 전체 재색인. |
| 업데이트했는데 도구 목록이 예전 그대로(예: `brief`가 안 보임) | 열려 있던 Claude Code 창은 시작 시점에 띄운 예전 서버를 계속 씀 — `make update`나 `make mcp-install` 뒤에는 **Claude Code를 완전히 종료했다 다시 시작**해야 새 도구가 나타남. |
