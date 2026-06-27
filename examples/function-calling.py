"""
함수 호출(tools) — 모델이 도구를 고르고 인자를 채운다(localmind는 A2 프롬프트 방식).
  pip install openai && python examples/function-calling.py
"""
import json
from openai import OpenAI

client = OpenAI(base_url="http://localhost:4000/v1", api_key="sk-local")

tools = [{
    "type": "function",
    "function": {
        "name": "create_calendar_event",
        "description": "캘린더에 일정을 만든다",
        "parameters": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "일정 제목"},
                "date": {"type": "string", "description": "YYYY-MM-DD"},
                "attendees": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["title", "date"],
        },
    },
}]

r = client.chat.completions.create(
    model="sonnet",
    messages=[{"role": "user", "content": "내일(2026-07-01) 오후 3시에 보경, 지훈이랑 스프린트 리뷰 잡아줘"}],
    tools=tools,
)
msg = r.choices[0].message
if msg.tool_calls:
    for tc in msg.tool_calls:
        print("도구:", tc.function.name)
        print("인자:", json.dumps(json.loads(tc.function.arguments), ensure_ascii=False, indent=2))
        # 여기서 실제 함수를 실행하고 결과를 role:"tool"로 다시 넣으면 멀티스텝 가능
else:
    print("일반 응답:", msg.content)
