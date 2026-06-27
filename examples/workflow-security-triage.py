"""
보안/SecOps 워크플로우 — 로그 → 이상 요약·분류 → 위협/대응 기억. 데이터는 로컬에만.
  make up && pip install openai && python examples/workflow-security-triage.py
"""
import json
import urllib.request
from openai import OpenAI

client = OpenAI(base_url="http://localhost:4000/v1", api_key="sk-local")
OM = "http://localhost:8767/api/v1/memories"
USER = "localmind"

LOGS = """
03:11 5 failed logins for admin from 203.0.113.9
03:12 successful login admin from 203.0.113.9
03:13 admin enabled new API key
03:14 outbound 40MB to 198.51.100.7
"""


def remember(text):
    try:
        urllib.request.urlopen(urllib.request.Request(
            OM + "/", data=json.dumps({"user_id": USER, "text": text, "infer": False}).encode(),
            headers={"Content-Type": "application/json"}), timeout=60)
    except Exception:
        pass


def chat(prompt):
    return client.chat.completions.create(model="sonnet", messages=[{"role": "user", "content": prompt}]).choices[0].message.content.strip()


# 1) 이상 요약 + 심각도 분류 (데이터가 외부로 안 나감 — 전부 로컬)
print("## 트리아지 요약\n" + chat(f"보안 로그를 3줄로 요약하고 심각도(low/med/high)와 근거를 붙여줘:\n{LOGS}"))

# 2) 위협/대응 절차를 기억에 축적 (사후분석에서 ask_brain)
remember("위협 패턴: 브루트포스 직후 성공 로그인 + API 키 생성 + 대용량 유출은 계정 탈취 의심 → 키 회수·세션 강제만료")
print("\n💡 워크플로우: 로그 → 이상 요약/분류 → 위협·대응 remember → 포스트모템 때 ask_brain. 전 과정 로컬 유지.")
