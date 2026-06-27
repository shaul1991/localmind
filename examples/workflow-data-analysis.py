"""
데이터 분석가 워크플로우 — 질문+스키마 → SQL 초안 → 결과 해석/리포트. 데이터는 로컬에만.
  make up && pip install openai && python examples/workflow-data-analysis.py
"""
from openai import OpenAI

client = OpenAI(base_url="http://localhost:4000/v1", api_key="sk-local")


def chat(prompt, system="너는 데이터 분석을 돕는 어시스턴트다. 한국어로 간결히."):
    r = client.chat.completions.create(
        model="sonnet", messages=[{"role": "system", "content": system}, {"role": "user", "content": prompt}]
    )
    return r.choices[0].message.content.strip()


SCHEMA = "orders(id, user_id, amount, created_at, status)"
QUESTION = "지난달 결제 완료(status='paid') 주문의 일별 매출 합계"

# 1) 자연어 + 스키마 → SQL 초안
sql = chat(f"스키마: {SCHEMA}\n질문: {QUESTION}\n→ PostgreSQL SQL만 (코드블록으로)")
print("## 1) SQL 초안\n" + sql)

# 2) (가짜) 결과를 붙여 해석/리포트 — 실제론 쿼리 실행 결과를 넣는다
MOCK_RESULT = "2026-06-01: 1,200,000 / 06-02: 980,000 / 06-03: 2,400,000 (이벤트일)"
report = chat(f"다음 일별 매출 결과를 3줄로 해석하고 이상치를 짚어줘:\n{MOCK_RESULT}")
print("\n## 2) 결과 해석\n" + report)

print("\n💡 워크플로우: 지표정의를 NOTES_DIR → chat으로 SQL 초안 → 결과 붙여 해석/리포트 → 헷갈리면 ask_brain")
