"""
미니 의미검색 RAG — 외부 벡터DB 없이 localmind 임베딩 + 코사인 유사도.
실제 RAG는 보통 mem0/second-brain을 쓰지만, 임베딩 API의 동작을 보여주는 최소 예시.
  pip install openai && python examples/semantic-search.py
"""
import math
from openai import OpenAI

client = OpenAI(base_url="http://localhost:4000/v1", api_key="sk-local")

docs = [
    "localmind는 Claude/Codex CLI 구독을 OpenAI 호환 API로 바꾼다",
    "bge-m3는 다국어 임베딩 모델이라 한국어 의미검색에 강하다",
    "mem0는 대화에서 사실을 추출해 진화하는 기억을 만든다",
    "MCP로 Cursor와 Claude Desktop에서 도구처럼 쓸 수 있다",
    "모든 것이 로컬에서 돌아 메터드 API 비용이 0원이다",
]


def embed(texts):
    res = client.embeddings.create(model="text-embedding-3-small", input=texts)
    return [d.embedding for d in res.data]


def cosine(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb + 1e-9)


doc_vecs = embed(docs)
query = "한국어 의미검색에 좋은 임베딩이 뭐야?"
qv = embed([query])[0]

ranked = sorted(((cosine(qv, dv), d) for dv, d in zip(doc_vecs, docs)), reverse=True)
print(f"질문: {query}\n— 유사도 순 —")
for score, d in ranked:
    print(f"  {score:.3f}  {d}")
