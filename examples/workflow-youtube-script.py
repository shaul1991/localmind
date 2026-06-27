"""
유튜브 대본 워크플로우 — 한 편의 대본이 나오기까지의 실무 흐름을 localmind로.

  채널 보이스(기억) → 주제 → 아웃라인 → 후킹 인트로 3안 → 첫 섹션 대본 초안

실행:
  make up
  pip install openai
  python examples/workflow-youtube-script.py "집중력을 높이는 5가지 습관"

전부 로컬·메터드 API 0원. 채널 톤은 mem0 기억으로 일관 유지하고, 과거 대본은
NOTES_DIR로 두면 search_notes로 재활용할 수 있다(아래 팁 참고).
"""
import sys
import json
import urllib.request
from openai import OpenAI

GW = "http://localhost:4000/v1"          # 통합 게이트웨이(채팅+임베딩)
KEY = "sk-local"                          # LITELLM_MASTER_KEY
OM = "http://localhost:8767/api/v1/memories"  # 메모리(mem0)
USER = "localmind"                        # 시드된 사용자(채널마다 따로 두려면 OPENMEMORY_USER 시드)
MODEL = "sonnet"

client = OpenAI(base_url=GW, api_key=KEY)

# 채널 규칙 — 최초 1회 기억에 저장해 두면 다음 실행에도 같은 톤이 유지된다.
CHANNEL_VOICE = (
    "친근한 반말 톤, 과장 광고 표현 금지, 3분 내외 분량, "
    "첫 5초 후킹 필수, 시청자를 '여러분'으로 호칭"
)


def _post(url, payload, timeout=60):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"}
    )
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read())


def get_channel_voice():
    """기억에서 '채널 보이스'만 회상; 없으면 저장하고 기본값 사용(메모리 미가동 시에도 동작).
    한 사용자에 다른 기억이 섞여 있어도 prefix로 필터링한다. 실제 채널은 전용 user_id 시드 권장."""
    try:
        res = _post(f"{OM}/semantic", {"user_id": USER, "query": "채널 보이스 톤 규칙", "limit": 10}, 30)
        voices = [m["memory"] for m in res.get("results", []) if "채널 보이스" in m.get("memory", "")]
        if voices:
            return voices[0].replace("채널 보이스:", "").strip()
        _post(f"{OM}/", {"user_id": USER, "text": "채널 보이스: " + CHANNEL_VOICE, "infer": False})
    except Exception:
        pass
    return CHANNEL_VOICE


def chat(system, user):
    r = client.chat.completions.create(
        model=MODEL,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
    )
    return r.choices[0].message.content.strip()


def main():
    topic = sys.argv[1] if len(sys.argv) > 1 else "집중력을 높이는 5가지 습관"
    voice = get_channel_voice()
    print(f"📺 채널 보이스: {voice}\n🎯 주제: {topic}\n" + "=" * 64)

    # 1) 아웃라인
    outline = chat(
        f"너는 유튜브 대본 작가다. 채널 보이스: {voice}",
        f"'{topic}' 영상의 섹션 아웃라인을 5개 항목으로, 각 항목에 한 줄 설명을 붙여줘.",
    )
    print("\n## 1) 아웃라인\n" + outline)

    # 2) 후킹 인트로 3안 (첫 5초가 이탈을 가른다)
    hooks = chat(
        f"채널 보이스: {voice}",
        f"'{topic}' 영상의 첫 5초 후킹 인트로를 서로 다른 3안으로(각 1~2문장).",
    )
    print("\n## 2) 후킹 인트로 3안\n" + hooks)

    # 3) 첫 섹션 대본 초안 (아웃라인을 실제 나레이션으로)
    script = chat(
        f"너는 유튜브 대본 작가다. 채널 보이스: {voice}. 나레이션 대본 형식으로 써라.",
        f"아래 아웃라인의 '첫 번째 섹션'을 30초 분량 대본으로.\n주제: {topic}\n아웃라인:\n{outline}",
    )
    print("\n## 3) 첫 섹션 대본 초안\n" + script)

    print("\n" + "=" * 64)
    print("💡 다음 단계")
    print("  - 과거 대본을 NOTES_DIR에 .md로 두면 search_notes/ask_brain으로 재활용")
    print("  - 채널 톤·금지표현을 remember로 더 쌓으면 매번 일관성↑")
    print("  - 섹션 2~5도 같은 패턴으로 반복 — 전부 0원")


if __name__ == "__main__":
    main()
