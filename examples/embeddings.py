"""
로컬 임베딩(bge-m3) — OpenAI /v1/embeddings 호환. 메터드 0원, 다국어(한국어 강함).
  pip install openai && python examples/embeddings.py
"""
from openai import OpenAI

client = OpenAI(base_url="http://localhost:4000/v1", api_key="sk-local")

res = client.embeddings.create(
    model="text-embedding-3-small",   # localmind가 bge-m3로 매핑 (1024차원)
    input=["로컬 임베딩", "local embedding", "完全にローカル"],
)
for i, d in enumerate(res.data):
    print(f"[{i}] {len(d.embedding)}차원  앞3개={[round(x, 4) for x in d.embedding[:3]]}")
