"""
인플루언서 워크플로우 — 원본 콘텐츠 1개 → 플랫폼별 리퍼포징(캡션·해시태그).
  make up && pip install openai && python examples/workflow-influencer-repurpose.py
"""
from openai import OpenAI

client = OpenAI(base_url="http://localhost:4000/v1", api_key="sk-local")

ORIGINAL = "오늘 아침 5분 스트레칭만 했는데 하루 종일 집중이 잘 됐다는 경험담"
VOICE = "친근하고 긍정적인 톤, 이모지 적당히, 과장 광고 금지"

for platform, hint in [
    ("인스타그램", "감성적 캡션 + 해시태그 5개"),
    ("유튜브 쇼츠", "후킹 첫 문장 + 짧은 설명"),
    ("X(트위터)", "280자 이내, 해시태그 2개"),
]:
    out = client.chat.completions.create(
        model="sonnet",
        messages=[{"role": "user", "content":
                   f"브랜드 보이스: {VOICE}\n원본: {ORIGINAL}\n→ {platform}용으로 리퍼포징({hint})"}],
    ).choices[0].message.content.strip()
    print(f"## {platform}\n{out}\n")

print("💡 워크플로우: 원본 1개 → 플랫폼별 리퍼포징 → 캡션/해시태그 → 브랜드보이스 remember로 톤 고정 → 응대 초안")
