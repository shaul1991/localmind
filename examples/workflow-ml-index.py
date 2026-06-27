"""
ML/데이터 엔지니어 워크플로우 — 코퍼스 임베딩 → 인덱스 구축/저장 → 질의.
실제론 FAISS/Chroma에 적재하지만, 파이프라인 모양을 최소로 보여준다.
  make up && pip install openai && python examples/workflow-ml-index.py
"""
import json
import math
from openai import OpenAI

client = OpenAI(base_url="http://localhost:4000/v1", api_key="sk-local")

corpus = [
    "환불은 구매 후 7일 이내 가능하다",
    "배송은 평균 2영업일 소요된다",
    "회원 등급은 최근 1년 구매액으로 정해진다",
    "적립 포인트는 적립 후 1년이 지나면 소멸한다",
]


def embed(texts):
    return [d.embedding for d in client.embeddings.create(model="text-embedding-3-small", input=texts).data]


def cos(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    return dot / (math.sqrt(sum(x * x for x in a)) * math.sqrt(sum(y * y for y in b)) + 1e-9)


# 1) 인덱스 구축 + 저장(어떤 vectorstore로도 대체 가능)
index = [{"text": t, "vec": v} for t, v in zip(corpus, embed(corpus))]
json.dump([{"text": r["text"]} for r in index], open("/tmp/ml-index.json", "w"), ensure_ascii=False)
print(f"인덱스 구축: {len(index)}개 문서 임베딩 완료 (1024d)")

# 2) 질의 → 최근접
q = "환불 며칠까지 돼?"
qv = embed([q])[0]
ranked = sorted(index, key=lambda r: cos(qv, r["vec"]), reverse=True)
print(f"\n질의: {q}")
for r in ranked[:2]:
    print(f"  {cos(qv, r['vec']):.3f}  {r['text']}")

print("\n💡 워크플로우: 코퍼스 임베딩(:4000) → 벡터스토어 적재 → 검색/분류 파이프라인 → 배치 라벨링도 0원")
