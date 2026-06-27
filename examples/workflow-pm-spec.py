"""
PM/기획 워크플로우 — 피드백을 기억에 저장 → 스펙 초안 생성 → 결정 회상.
(비개발자라면 같은 흐름을 Claude Desktop+MCP의 remember/recall로도 그대로 — mcp-clients.md)
  make up && pip install openai && python examples/workflow-pm-spec.py
"""
import json
import urllib.request
from openai import OpenAI

client = OpenAI(base_url="http://localhost:4000/v1", api_key="sk-local")
OM = "http://localhost:8767/api/v1/memories"
USER = "localmind"  # 실제론 본인 OPENMEMORY_USER


def remember(text):
    try:
        body = json.dumps({"user_id": USER, "text": text, "infer": True}).encode()
        urllib.request.urlopen(urllib.request.Request(OM + "/", data=body, headers={"Content-Type": "application/json"}), timeout=60)
    except Exception:
        pass


def chat(prompt):
    return client.chat.completions.create(model="sonnet", messages=[{"role": "user", "content": prompt}]).choices[0].message.content.strip()


# 1) 회의/고객 피드백을 기억에 저장 (다음에 recall 가능)
remember("결제 화면에서 쿠폰 적용 단계를 한 화면으로 합치기로 결정함(2026-06 스프린트)")

# 2) 스펙(PRD) 초안 생성
prd = chat("'쿠폰 적용 단계 통합' 기능의 간단한 PRD 초안: 배경/요구사항 3개/완료조건 2개")
print("## PRD 초안\n" + prd)

print("\n💡 워크플로우: Claude Desktop+MCP 연결 → 피드백 remember → 스펙 초안 chat → '왜 그렇게?'는 recall/ask_brain")
