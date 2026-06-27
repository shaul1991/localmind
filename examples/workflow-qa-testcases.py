"""
QA/테스트 워크플로우 — 명세 → 구조화 테스트케이스(function-calling) → 실패 로그 분류.
  make up && pip install openai && python examples/workflow-qa-testcases.py
"""
import json
from openai import OpenAI

client = OpenAI(base_url="http://localhost:4000/v1", api_key="sk-local")

SPEC = "로그인: 이메일/비밀번호 입력. 5회 실패 시 계정 10분 잠금. 비밀번호는 8자 이상."

tools = [{
    "type": "function",
    "function": {
        "name": "add_test_cases",
        "description": "테스트 케이스 목록을 만든다",
        "parameters": {
            "type": "object",
            "properties": {
                "cases": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "steps": {"type": "string"},
                            "expected": {"type": "string"},
                            "type": {"type": "string", "enum": ["positive", "negative", "edge"]},
                        },
                        "required": ["title", "steps", "expected", "type"],
                    },
                }
            },
            "required": ["cases"],
        },
    },
}]

# 1) 명세 → 구조화 테스트케이스
r = client.chat.completions.create(
    model="sonnet",
    messages=[{"role": "user", "content": f"다음 명세의 테스트 케이스를 3개 만들어줘:\n{SPEC}"}],
    tools=tools,
)
tc = r.choices[0].message.tool_calls
if tc:
    for c in json.loads(tc[0].function.arguments)["cases"]:
        print(f"[{c['type']}] {c['title']}\n  steps: {c['steps']}\n  expected: {c['expected']}")

# 2) 실패 로그 분류
LOG = "AssertionError: expected lock after 5 attempts but account stayed active"
sev = client.chat.completions.create(
    model="sonnet", messages=[{"role": "user", "content": f"심각도를 P0/P1/P2 중 하나로만: {LOG}"}]
).choices[0].message.content.strip()
print(f"\n실패 로그 심각도: {sev}")

print("\n💡 워크플로우: 명세 → 테스트케이스 JSON → CI에서 실패로그 요약/분류 → 회귀 패턴 remember")
