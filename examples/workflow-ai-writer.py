"""
AI 글 작성가 워크플로우 — 문체 가이드(기억) → 초안 → 리라이트. 원고는 로컬에만.
  make up && pip install openai && python examples/workflow-ai-writer.py
"""
import json
import urllib.request
from openai import OpenAI

client = OpenAI(base_url="http://localhost:4000/v1", api_key="sk-local")
OM = "http://localhost:8767/api/v1/memories"
USER = "localmind"
STYLE = "존댓말, 한 문단 3문장 이내, 전문용어는 괄호로 풀어 설명, 과장 금지"


def remember(text):
    try:
        urllib.request.urlopen(urllib.request.Request(
            OM + "/", data=json.dumps({"user_id": USER, "text": text, "infer": False}).encode(),
            headers={"Content-Type": "application/json"}), timeout=60)
    except Exception:
        pass


def chat(system, user):
    return client.chat.completions.create(
        model="sonnet", messages=[{"role": "system", "content": system}, {"role": "user", "content": user}]
    ).choices[0].message.content.strip()


# 1) 문체 가이드 저장(1회) — 이후 일관 유지
remember("문체 가이드: " + STYLE)

# 2) 초안
topic = "재택근무 생산성을 높이는 법"
draft = chat(f"문체 가이드: {STYLE}", f"'{topic}' 블로그 도입부 한 문단")
print("## 초안\n" + draft)

# 3) 리라이트(톤 통일)
rewrite = chat(f"문체 가이드: {STYLE}. 더 간결하게.", f"다음을 문체 가이드에 맞게 다듬어줘:\n{draft}")
print("\n## 리라이트\n" + rewrite)

print("\n💡 워크플로우: 문체가이드 remember → 초안 chat → 자료노트 ask_brain 근거보강 → 리라이트로 톤 통일")
