# 역할별 활용 시나리오

localmind를 **누가 어떻게** 쓰면 좋은지. 전부 로컬·메터드 0원·독립 실행.

## 1) 개발자 — 메터드 API를 로컬로 대체
- 사내 도구/스크립트/봇이 OpenAI·Anthropic API를 쓰고 있다면, **`base_url`만 localmind로** 바꿔 비용 0원.
  → [chat-openai.py](chat-openai.py) · [chat-anthropic.py](chat-anthropic.py) · [langchain-rag.py](langchain-rag.py)
- 코딩 중 **교차 모델 상담**: Cursor(Claude)로 작업하다 `ask`로 Codex 의견을, 또는 그 반대.
  → [mcp-clients.md](mcp-clients.md)
- CI/배치에서 LLM 호출(요약·분류·코드리뷰)을 메터드 API 대신 localmind로 → 청구서 0.

## 2) 인프라/SRE — 서버별 두뇌
- 서버마다 독립 인스턴스(`MCP_INSTANCE=서버명`). 스펙·런북·장애 이력을 **그 서버 로컬**에 적재하고,
  노트북에서 서버별 원격 MCP로 질의. → [mcp-remote-infra.md](mcp-remote-infra.md)
- "이 서버 백업 정책 + 최근 장애 정리" 같은 질문을 **그 서버 노트만 근거로** RAG 답변(출처 인용).

## 3) 지식 노동자 — second-brain
- 기존 Obsidian/마크다운 볼트를 `NOTES_DIR`로 가리키면 **마이그레이션 0**으로 RAG.
  → [brain-node.mjs](brain-node.mjs) · [mcp-clients.md](mcp-clients.md)
- `capture_note`로 결정·스니펫·회의록을 쌓고, `ask_brain`으로 "내 지식 기준" 답을 받음.
- 파일이 정본 + git 백업이라 도구(에디터)가 바뀌어도 지식이 살아남음.

## 4) 개인 비서 — 진화하는 기억
- 자연어를 넣으면 사실로 추출·저장하고(`remember`), 의미로 회상(`recall`).
  → [memory.sh](memory.sh)
- 세션이 바뀌어도 "내 배포 요일", "선호 스택" 같은 맥락을 유지.

## 5) 팀 — 탈중앙 공유
- 멤버 각자 자기 머신에서 독립 인스턴스(자기 CLI 로그인). 중앙 계정 공유 없음 → ToS/한도 문제 회피.
- 공유가 필요하면 공유 노트 git repo를 각자 인덱싱하거나, 운영 중인 서버에 원격 MCP로 접속.

## 6) 임베딩 소비자(RAG/검색 시스템) 백엔드
- supermemory·LlamaIndex·Chroma 등 임베딩이 필요한 시스템의 `OPENAI_BASE_URL`을 `:4000`으로.
  → [embeddings.py](embeddings.py) · [semantic-search.py](semantic-search.py)
- 채팅·임베딩이 **한 base_url**(`http://localhost:4000/v1`)로 통합돼 drop-in.

---
> 어디서 시작할지 모르겠다면: `make up` → [chat-openai.py](chat-openai.py)(API 대체) →
> [mcp-clients.md](mcp-clients.md)(코딩 도구에 붙이기) 순서를 추천합니다.
