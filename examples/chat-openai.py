"""
OpenAI SDK로 localmind 채팅 — base_url만 바꾸면 기존 코드 그대로. 메터드 API 0원.
  pip install openai && python examples/chat-openai.py
"""
from openai import OpenAI

client = OpenAI(base_url="http://localhost:4000/v1", api_key="sk-local")

# Claude 백엔드
r = client.chat.completions.create(
    model="sonnet",
    messages=[{"role": "user", "content": "파이썬에서 리스트를 뒤집는 3가지 방법을 코드로"}],
)
print("=== claude(sonnet) ===")
print(r.choices[0].message.content)

# 모델명만 바꾸면 다른 CLI(Codex)로 라우팅 — 같은 코드, 다른 두뇌
r = client.chat.completions.create(
    model="gpt-5.5",
    messages=[{"role": "user", "content": "같은 걸 한 줄로 요약"}],
)
print("\n=== codex(gpt-5.5) ===")
print(r.choices[0].message.content)
