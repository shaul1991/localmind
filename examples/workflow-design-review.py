"""
기술 리드/아키텍트 워크플로우 — 같은 설계를 claude·codex 양쪽에 물어 다중 관점 리뷰 후 종합.
  make up && pip install openai && python examples/workflow-design-review.py
"""
from openai import OpenAI

client = OpenAI(base_url="http://localhost:4000/v1", api_key="sk-local")

DESIGN = (
    "주문 서비스를 모놀리스에서 분리하려 한다. 동기 REST 대신 Kafka 이벤트로 재고/배송과 통신. "
    "트랜잭션은 사가(saga) 패턴. 이 설계의 위험과 대안을 평가해줘."
)


def review(model):
    r = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": "시니어 아키텍트로서 위험 2가지와 대안 1가지를 간결히 한국어로."},
            {"role": "user", "content": DESIGN},
        ],
    )
    return r.choices[0].message.content.strip()


claude = review("sonnet")
codex = review("gpt-5.5")
print("## claude(sonnet) 관점\n" + claude)
print("\n## codex(gpt-5.5) 관점\n" + codex)

# 종합 — 두 의견을 합쳐 결정 초안 (한 모델에게 합의/차이를 정리시킴)
synth = client.chat.completions.create(
    model="sonnet",
    messages=[{"role": "user", "content": f"두 리뷰의 공통 위험과 상충점을 정리하고 결정 권고 1줄:\n[A]\n{claude}\n[B]\n{codex}"}],
).choices[0].message.content.strip()
print("\n## 종합 & 결정 권고\n" + synth)

print("\n💡 워크플로우: 양쪽 모델 ask → 의견 비교 → 결정·근거 capture_note(ADR) → 분기마다 ask_brain 회상")
