"""
Anthropic SDK로 localmind의 /v1/messages 사용 — base_url만 교체.
  pip install anthropic && python examples/chat-anthropic.py
"""
from anthropic import Anthropic

# localmind는 :8787 에서 /v1/messages 를 Anthropic 호환으로 제공. 키는 무시되지만 SDK가 요구.
client = Anthropic(base_url="http://localhost:8787", api_key="not-needed")

msg = client.messages.create(
    model="claude-sonnet-4-6",   # 또는 "sonnet"
    max_tokens=512,
    system="너는 간결하게 답하는 어시스턴트다.",
    messages=[{"role": "user", "content": "Anthropic 호환 엔드포인트를 한 문장으로 설명해줘"}],
)
print(msg.content[0].text)
