"""
썸네일 작업자 워크플로우 — 영상 핵심 → 썸네일 문구 A/B → 잘된 패턴 기억.
(이미지 생성은 안 함. localmind는 문구·컨셉 담당, 그림은 별도 툴.)
  make up && pip install openai && python examples/workflow-thumbnail-copy.py
"""
import json
import urllib.request
from openai import OpenAI

client = OpenAI(base_url="http://localhost:4000/v1", api_key="sk-local")
OM = "http://localhost:8767/api/v1/memories"
USER = "localmind"


def remember(text):
    try:
        urllib.request.urlopen(urllib.request.Request(
            OM + "/", data=json.dumps({"user_id": USER, "text": text, "infer": False}).encode(),
            headers={"Content-Type": "application/json"}), timeout=60)
    except Exception:
        pass


VIDEO = "아침 루틴 5가지로 생산성을 2배 올린 경험담"
copy = client.chat.completions.create(
    model="sonnet",
    messages=[{"role": "user", "content":
               f"'{VIDEO}' 영상의 썸네일 문구 5안(각 3~6자, 클릭 유도 강한 후킹 단어 위주)"}],
).choices[0].message.content.strip()
print("## 썸네일 문구 A/B 5안\n" + copy)

# 잘 먹힌 패턴을 다음 영상에서 참고하도록 축적
remember("썸네일 패턴: 숫자 + 강한 동사(2배, 끝내기) 조합이 클릭률 좋았음")
print("\n💡 워크플로우: 영상 핵심 요약 → 문구 A/B 다수 → 제목↔썸네일 조합 → 잘된 패턴 remember → 다음에 recall")
