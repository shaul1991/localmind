"""
게임 워크플로우 — 아이템을 구조화 JSON으로 생성(function-calling).
로어 일관성 점검은 ask_brain(MCP) 또는 brain-node.mjs 패턴으로.
  make up && pip install openai && python examples/workflow-game-content.py
"""
import json
from openai import OpenAI

client = OpenAI(base_url="http://localhost:4000/v1", api_key="sk-local")

tools = [{
    "type": "function",
    "function": {
        "name": "add_item",
        "description": "게임 아이템 정의를 만든다",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "rarity": {"type": "string", "enum": ["common", "rare", "epic", "legendary"]},
                "effect": {"type": "string", "description": "전투 효과"},
                "flavor": {"type": "string", "description": "세계관 플레이버 텍스트"},
            },
            "required": ["name", "rarity", "effect", "flavor"],
        },
    },
}]

themes = ["얼음 던전의 희귀 무기", "사막 유적의 전설 방어구"]
for t in themes:
    r = client.chat.completions.create(
        model="sonnet",
        messages=[{"role": "user", "content": f"{t} 아이템 하나를 만들어줘"}],
        tools=tools,
    )
    tc = r.choices[0].message.tool_calls
    print(json.dumps(json.loads(tc[0].function.arguments), ensure_ascii=False, indent=2) if tc else r.choices[0].message.content)

print("\n💡 워크플로우: 로어를 NOTES_DIR 적재 → function-calling으로 아이템/퀘스트 JSON 대량 생성")
print("   → ask_brain으로 세계관 모순 검증 → 런타임 NPC는 :4000 백엔드 (brain-node.mjs 참고)")
