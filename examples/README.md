# 활용 예시 (examples)

localmind를 **실제로 어떻게 쓰는지** 케이스별 예제 모음입니다. 전부 실행 중인 로컬 스택 기준 — 메터드 API 0원.

## 준비
```bash
make up            # 스택 기동 (게이트웨이+메모리)
make health        # 200 확인
```

## 엔드포인트 한눈에
| 용도 | URL | 키 |
|---|---|---|
| **통합**(채팅+임베딩, drop-in OpenAI) | `http://localhost:4000/v1` | `sk-local` (`LITELLM_MASTER_KEY`) |
| 채팅만(직접) | `http://localhost:8787/v1` | 기본 없음(`LOCALMIND_API_KEY` 설정 시 필요) |
| Anthropic 메시지 | `http://localhost:8787` (`/v1/messages`) | 동일 |
| 메모리(mem0) REST | `http://localhost:8767/api/v1` | 없음 |
| 원격 MCP | `http://<host>:8788/mcp` | `MCP_HTTP_TOKEN` |

> 모델명: `sonnet`·`opus`·`claude-*` → Claude · `gpt-5.5`·`codex:*` → Codex · `text-embedding-3-small`/`bge-m3` → 임베딩.

## 케이스별 예제
| 파일 | 케이스 |
|---|---|
| [chat-openai.py](chat-openai.py) | OpenAI SDK로 채팅 (base_url만 교체) — Python |
| [chat-openai.mjs](chat-openai.mjs) | 〃 Node.js |
| [chat-anthropic.py](chat-anthropic.py) | Anthropic SDK로 `/v1/messages` |
| [chat-streaming.sh](chat-streaming.sh) | 스트리밍(SSE) 응답 |
| [function-calling.py](function-calling.py) | 함수 호출(tools)로 구조화 출력 |
| [embeddings.py](embeddings.py) | 로컬 임베딩(bge-m3) 생성 |
| [semantic-search.py](semantic-search.py) | 임베딩으로 미니 의미검색 RAG(외부 DB 없이) |
| [memory.sh](memory.sh) | 진화하는 기억 remember/recall (mem0) |
| [brain-node.mjs](brain-node.mjs) | second-brain: 노트 저장·검색·RAG를 코드로 |
| [workflow-youtube-script.py](workflow-youtube-script.py) | **끝-to-끝 워크플로우**: 유튜브 대본(보이스 기억→아웃라인→후킹→대본) |
| [langchain-rag.py](langchain-rag.py) | LangChain의 LLM+임베딩을 localmind로 |
| [mcp-clients.md](mcp-clients.md) | Cursor/Claude Desktop/Codex에 MCP 도구 붙이기 |
| [mcp-remote-infra.md](mcp-remote-infra.md) | 서버별 원격 MCP로 인프라 운영 |
| [use-cases.md](use-cases.md) | **직군별 유즈케이스(19개 페르소나)** — 내 직군 카드만 보면 됨 |

## 직군별 워크플로우 (끝-to-끝 실행)
`workflow-*.{py,mjs,sh}` **19종** — 직군마다 실무 흐름을 그대로 돌려본다(상황→단계→결과).
직군 ↔ 스크립트 매핑은 [use-cases.md](use-cases.md)의 "한눈에" 표 참고.
> 예: [workflow-backend.py](workflow-backend.py) · [workflow-infra-runbook.mjs](workflow-infra-runbook.mjs) · [workflow-youtube-script.py](workflow-youtube-script.py) · [workflow-solo-stack.sh](workflow-solo-stack.sh)

## 의존성(예제용)
```bash
pip install openai anthropic langchain langchain-openai   # 필요한 것만
```
