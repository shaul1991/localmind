"""
앱(모바일) 워크플로우 — UI 문구를 여러 로케일로 구조화 생성(function-calling).
  make up && pip install openai && python examples/workflow-mobile-i18n.py
"""
import json
from openai import OpenAI

client = OpenAI(base_url="http://localhost:4000/v1", api_key="sk-local")

tools = [{
    "type": "function",
    "function": {
        "name": "localize",
        "description": "UI 문자열 키를 여러 로케일로 현지화",
        "parameters": {
            "type": "object",
            "properties": {
                "key": {"type": "string"},
                "translations": {
                    "type": "object",
                    "properties": {
                        "ko": {"type": "string"}, "en": {"type": "string"}, "ja": {"type": "string"},
                    },
                    "required": ["ko", "en", "ja"],
                },
            },
            "required": ["key", "translations"],
        },
    },
}]

r = client.chat.completions.create(
    model="sonnet",
    messages=[{"role": "user", "content": "로그인 버튼 키 'login_button'을 ko/en/ja로 현지화해줘"}],
    tools=tools,
)
tc = r.choices[0].message.tool_calls
if tc:
    print(json.dumps(json.loads(tc[0].function.arguments), ensure_ascii=False, indent=2))
else:
    print(r.choices[0].message.content)

print("\n💡 워크플로우: 화면별 키를 모아 일괄 현지화 → Localizable에 반영 → `ask`로 코드 리뷰 → 인앱 AI는 서버 :4000 호출")
