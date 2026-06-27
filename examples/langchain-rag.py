"""
기존 LangChain 파이프라인의 LLM·임베딩을 localmind로 교체 — base_url만 바꿔 메터드 0원.
  pip install langchain-openai && python examples/langchain-rag.py
"""
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

BASE = "http://localhost:4000/v1"
KEY = "sk-local"

llm = ChatOpenAI(base_url=BASE, api_key=KEY, model="sonnet")
emb = OpenAIEmbeddings(
    base_url=BASE, api_key=KEY, model="text-embedding-3-small",
    check_embedding_ctx_length=False,  # 비-OpenAI 엔드포인트라 tiktoken 길이체크 끔
)

# 임베딩 (예: FAISS/Chroma 등 어떤 vectorstore에도 그대로 연결)
vecs = emb.embed_documents(["로컬 RAG 파이프라인", "메터드 API 0원"])
print("임베딩 차원:", len(vecs[0]))

# LLM
print(llm.invoke("LangChain에서 localmind를 백엔드로 쓰는 이점을 한 줄로").content)

# → LCEL 체인, RetrievalQA, Agent 등 기존 LangChain 구성에 llm/emb를 그대로 끼우면 됨.
