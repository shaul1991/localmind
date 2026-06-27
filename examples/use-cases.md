# 직군별 유즈케이스

"내 직군에선 어떻게 쓰지?"에 바로 답하는 페르소나 모음. 전부 **로컬·메터드 API 0원·독립 실행**.
각 카드: **상황 → 활용 → 효과 → 시작(예제)**.

## 한눈에
| 직군 | 핵심 활용 | 시작 |
|---|---|---|
| 백엔드/풀스택 | 서비스·스크립트의 메터드 API를 로컬로 대체 | [chat-openai.py](chat-openai.py) |
| 프론트엔드 | UI 카피·컴포넌트 초안을 키/비용 없이 | [chat-openai.mjs](chat-openai.mjs) |
| 인프라/DevOps/SRE | 서버별 런북·장애기억·운영 RAG | [mcp-remote-infra.md](mcp-remote-infra.md) |
| ML/데이터 엔지니어 | 파이프라인 임베딩·로컬 RAG·배치 LLM 0원 | [embeddings.py](embeddings.py) |
| QA/테스트 | 테스트케이스 생성·로그 요약·CI 분류 | [function-calling.py](function-calling.py) |
| 기술 리드/아키텍트 | 다중 모델 설계 리뷰·ADR 적재/검색 | [mcp-clients.md](mcp-clients.md) |
| PM/기획(비개발) | 피드백 요약·스펙 초안·결정 회상 | [mcp-clients.md](mcp-clients.md) |
| 테크니컬 라이터 | 문서 초안·내부 노트 검색·일관성 | [brain-node.mjs](brain-node.mjs) |
| 보안/SecOps | 데이터 미유출·로그 분석·위협 노트 RAG | [memory.sh](memory.sh) |
| 연구자/지식노동자 | 노트·논문 second-brain·진화 기억 | [brain-node.mjs](brain-node.mjs) |
| 1인 개발/스타트업 | 두뇌 전체 0원(백엔드+비서) | [README](README.md) |

---

## 👨‍💻 백엔드 / 풀스택 개발자
- **상황**: 사내 봇·요약·분류 기능이 OpenAI/Anthropic API를 호출해 매달 청구서가 쌓인다.
- **활용**: `base_url`만 `http://localhost:4000/v1`로 바꾼다. 모델명으로 claude/codex 선택. 코딩 중엔 Cursor에서 `ask`로 다른 모델에 교차 상담.
- **효과**: 코드 변경 거의 0으로 **메터드 비용 0원**. 데이터는 로컬에서만.
- **시작**: [chat-openai.py](chat-openai.py) · [function-calling.py](function-calling.py) · [mcp-clients.md](mcp-clients.md)

## 🎨 프론트엔드 개발자
- **상황**: 버튼 문구·빈 상태 카피·컴포넌트 보일러플레이트를 빠르게 뽑고 싶지만 API 키 발급/비용이 번거롭다.
- **활용**: 로컬 엔드포인트로 OpenAI SDK 그대로. 스트리밍으로 즉시 미리보기. Cursor에 MCP를 붙여 `ask`로 접근성 카피 검토.
- **효과**: 키·비용 없이 반복 작업 가속, 사내 문구는 로컬 밖으로 안 나감.
- **시작**: [chat-openai.mjs](chat-openai.mjs) · [chat-streaming.sh](chat-streaming.sh)

## 🛠️ 인프라 / DevOps / SRE
- **상황**: 서버마다 스펙·백업정책·장애 이력이 머릿속/흩어진 메모에 있다.
- **활용**: 서버별 독립 인스턴스(`MCP_INSTANCE=서버명`). `capture_note`로 런북 적재, `remember`로 장애 기록, `ask_brain`으로 "이 서버 한정" RAG. 노트북에서 서버별 원격 MCP로 질의.
- **효과**: 각 서버가 **자기 지식을 로컬에서** 보유. "이 서버 최근 장애 정리"를 출처와 함께 즉답.
- **시작**: [mcp-remote-infra.md](mcp-remote-infra.md) · [memory.sh](memory.sh)

## 🤖 ML / 데이터 엔지니어
- **상황**: RAG·분류·클러스터링 파이프라인이 임베딩 API 비용·레이트리밋에 묶여 있다.
- **활용**: 임베딩을 로컬 bge-m3(다국어, 1024d)로. LangChain/LlamaIndex/Chroma의 base_url만 교체. 대량 배치 LLM 작업도 0원.
- **효과**: 임베딩·LLM 호출 **비용·한도 해방**, 한국어 품질 유지.
- **시작**: [embeddings.py](embeddings.py) · [semantic-search.py](semantic-search.py) · [langchain-rag.py](langchain-rag.py)

## 🔬 QA / 테스트 엔지니어
- **상황**: 테스트 케이스 작성·실패 로그 분류·릴리즈 노트 요약이 수작업.
- **활용**: `function-calling`으로 구조화된 테스트케이스 JSON 생성. CI 스크립트에서 로그 요약·버그 분류를 localmind로(메터드 0원이라 매 빌드 호출 부담 없음).
- **효과**: 반복 분석 자동화 + CI에서 LLM을 **비용 걱정 없이** 상시 사용.
- **시작**: [function-calling.py](function-calling.py) · [chat-openai.py](chat-openai.py)

## 🧭 기술 리드 / 아키텍트
- **상황**: 설계 결정을 혼자 검토하고, ADR/결정 기록이 흩어진다.
- **활용**: `ask`로 같은 설계를 claude·codex 양쪽에 물어 **다중 관점 리뷰**. 결정은 `capture_note`로 ADR화, 나중에 `ask_brain`으로 "왜 이렇게 정했지?" 검색.
- **효과**: 1인 검토를 **패널 리뷰**로 격상, 결정의 근거가 검색 가능한 지식으로 축적.
- **시작**: [mcp-clients.md](mcp-clients.md) · [brain-node.mjs](brain-node.mjs)

## 📋 PM / 기획자 (비개발자)
- **상황**: 코드는 안 짜지만 피드백 정리·스펙 초안·지난 결정 회상이 잦다.
- **활용**: **Claude Desktop**에 MCP만 붙이면 끝. `remember`로 결정·맥락 저장, `recall`로 회상, `capture_note`/`ask_brain`으로 기획 노트 RAG. 터미널 몰라도 됨.
- **효과**: 개인 비서급 기억 + "우리 그때 왜 그렇게 정했지?"에 즉답. 데이터는 내 노트북에만.
- **시작**: [mcp-clients.md](mcp-clients.md) (Claude Desktop 섹션)

## ✍️ 테크니컬 라이터 / 문서 담당
- **상황**: 문서 초안·용어 일관성·기존 문서 검색에 시간이 든다.
- **활용**: 기존 마크다운 문서 폴더를 `NOTES_DIR`로(마이그레이션 0). `search_notes`로 관련 문단 찾고 `ask_brain`으로 근거 있는 초안. 초안 다듬기는 chat.
- **효과**: "이미 어딘가 쓴 내용"을 빠르게 재사용, 출처 기반 정확한 초안.
- **시작**: [brain-node.mjs](brain-node.mjs) · [mcp-clients.md](mcp-clients.md)

## 🔐 보안 / SecOps
- **상황**: 민감 로그·코드를 외부 API에 보내기 부담스럽다.
- **활용**: **모든 추론·임베딩이 로컬**이라 데이터가 인스턴스를 떠나지 않음(독립 실행). 로그 요약·이상 탐지 보조, 위협/대응 노트를 `remember`·`ask_brain`으로 축적.
- **효과**: 데이터 거버넌스 위험 ↓, 그러면서 LLM 보조 활용.
- **시작**: [memory.sh](memory.sh) · [use-cases.md](use-cases.md)

## 🧠 연구자 / 지식노동자
- **상황**: 노트·논문·아이디어가 쌓이는데 연결·회상이 안 된다.
- **활용**: 노트 볼트를 `NOTES_DIR`로 second-brain RAG, 사실은 `remember`로 진화 기억. 파일이 정본 + git 백업이라 도구가 바뀌어도 지식이 살아남음.
- **효과**: "내가 아는 것" 기준의 답 + 출처. 영구·이식 가능한 개인 지식 베이스.
- **시작**: [brain-node.mjs](brain-node.mjs) · 백업: `make memory-export`

## 🚀 1인 개발자 / 소규모 스타트업
- **상황**: 비용·인프라 여력은 없는데 LLM 백엔드, 메모리, RAG가 다 필요하다.
- **활용**: repo 하나 `make up`이면 **API + 임베딩 + 메모리 + second-brain + MCP**가 전부 로컬로. 제품 백엔드로도, 내 개인 비서로도.
- **효과**: 메터드 0원으로 풀스택 AI 능력 확보, 중앙 의존 없음.
- **시작**: [chat-openai.py](chat-openai.py) → [mcp-clients.md](mcp-clients.md)

---
> 어디서 시작할지 모르겠다면: `make up` → 내 직군 카드의 **시작** 링크 하나만 따라가 보세요.
