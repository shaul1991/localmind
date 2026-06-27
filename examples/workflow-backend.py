"""
백엔드/풀스택 워크플로우 — 메터드 API 호출부를 localmind로 바꾸고 교차 모델로 검토.
  make up && pip install openai && python examples/workflow-backend.py
"""
from openai import OpenAI

client = OpenAI(base_url="http://localhost:4000/v1", api_key="sk-local")  # base_url만 교체
LOG = "사용자가 결제 단계에서 3초 이상 지연 후 이탈. 외부 PG 응답 타임아웃으로 추정."


def chat(prompt, model="sonnet", system="간결하게 한국어로 답하라."):
    r = client.chat.completions.create(
        model=model, messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}]
    )
    return r.choices[0].message.content.strip()


# 1) 기존 OpenAI 호출부: base_url/api_key만 바꾸면 그대로 동작 (비용 0)
print("요약(claude):", chat(f"한 문장 요약: {LOG}"))

# 2) 모델명만 바꿔 교차 검토 — 같은 코드, 다른 두뇌
print("요약(codex) :", chat(f"한 문장 요약: {LOG}", model="gpt-5.5"))

# 3) 분류 같은 배치 잡도 CI에서 0원으로 상시 반복
print("분류        :", chat(f"bug/perf/infra 중 하나로만 분류(단어만): {LOG}"))

print("\n💡 워크플로우: 호출부 base_url 교체 → 로컬 단위테스트 → CI 잡도 localmind → 막히면 Cursor `ask`로 교차검토")
