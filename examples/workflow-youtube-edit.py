"""
유튜브 편집자 워크플로우 — 자막(텍스트) → 챕터·하이라이트·설명/제목.
(영상 픽셀 편집은 NLE에서. localmind는 자막/메타데이터 보조.)
  make up && pip install openai && python examples/workflow-youtube-edit.py
"""
from openai import OpenAI

client = OpenAI(base_url="http://localhost:4000/v1", api_key="sk-local")

# 실제론 srt/자동자막을 읽어온다. 데모용 짧은 타임스탬프 자막:
TRANSCRIPT = """
00:00 안녕하세요 오늘은 아침 루틴 이야기를 해볼게요
00:30 첫 번째 습관은 기상 후 물 한 잔입니다
01:10 두 번째는 5분 스트레칭이에요
02:00 마지막으로 오늘 할 일 3가지를 적습니다
02:40 작은 습관이 하루를 바꿉니다 구독 부탁해요
"""


def chat(prompt):
    return client.chat.completions.create(
        model="sonnet", messages=[{"role": "user", "content": prompt}]
    ).choices[0].message.content.strip()


print("## 챕터 타임스탬프")
print(chat(f"다음 자막에서 유튜브 챕터 목록(타임스탬프 + 제목)을 만들어줘:\n{TRANSCRIPT}"))

print("\n## 영상 설명 + 제목 후보")
print(chat(f"다음 자막으로 영상 설명(2문장)과 클릭 유도 제목 3안:\n{TRANSCRIPT}"))

print("\n💡 워크플로우: 자막 → 챕터/하이라이트 추출 → 설명/제목 생성 → 과거 자막 임베딩 검색으로 재사용 클립")
