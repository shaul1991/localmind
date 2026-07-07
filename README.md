# localmind

[![CI](https://github.com/shaul1991/localmind/actions/workflows/ci.yml/badge.svg)](https://github.com/shaul1991/localmind/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)](package.json)
[![Local-first](https://img.shields.io/badge/local--first-127.0.0.1-blue)](docs/concepts.md)

> **localmind는 "내 컴퓨터 안에 차린 1인 비서실"입니다.** 🧠
>
> 이미 월정액으로 쓰는 똑똑한 AI(`claude`·`codex` 구독)를 **어떤 앱에서든 불러 쓰고, 내 기억과
> 내 노트를 기억·검색해 주는 개인 비서**로 만들어 줍니다. 전부 **내 컴퓨터 안에서**, **추가 요금 0원**.

처음이라 용어가 낯설다면 → 👉 **[5분 비유로 이해하기](docs/concepts.md)** 부터 보세요.

---

## 무엇을 해주나요?

- 🧠 **기억해 둡니다** — "이거 기억해둬" 하면 저장하고, 나중에 "그거 뭐였지?" 하면 **의미로 찾아줍니다**.
- 📚 **내 노트로 답합니다** — 내 마크다운 노트를 근거로 질문에 답하고 출처를 알려줍니다(RAG).
- 🔌 **어디서든 불러 씁니다** — Cursor·Claude Desktop·Cline 같은 앱에 붙여 도구로 사용.
- 💻 **내 코드에서도** — OpenAI/Anthropic 호환이라, 쓰던 코드의 주소(`base_url`)만 바꾸면 그대로 동작.
- 🔒 **전부 로컬** — 데이터는 내 컴퓨터에만. 중앙 서버·공유 계정 없음.

## 누구를 위한 건가요?

**개발자가 아니어도 됩니다.** 채팅창에서 "기억해둬 / 찾아줘 / 다 보여줘 / 지워줘"만 말하면 됩니다.
설치는 한 번만 하면 되고(아래), 그 다음부터는 평범한 대화로 씁니다. 내 지식·기억이 내 컴퓨터에
차곡차곡 쌓이는 **나만의 두뇌**가 생깁니다.

![localmind 데모](docs/demo.png)

---

## 시작하기

> 설치 과정은 조금 기술적이에요(터미널을 한 번 씁니다). 하지만 **`make setup` 명령 하나**가
> 준비물 점검·설치·연결을 한국어로 한 단계씩 안내해 줍니다. 막히면 [FAQ](docs/faq.md)를 보세요.

**준비물**: [Docker](https://www.docker.com/) · [Node.js ≥ 20](https://nodejs.org/) · `claude` 구독

> ✅ **최적화 환경**: **macOS(Apple Silicon) + Claude 구독** 조합에 맞춰 최적화·검증돼 있습니다
> (임베딩은 Mac의 Metal 가속을 자동 사용). Linux(+NVIDIA GPU)·`codex` 백엔드도 동작하지만,
> 가장 매끄러운 경험은 이 조합입니다. — 임베딩 최적화는 설치 후 `make doctor`로 언제든 점검·전환.

```bash
git clone https://github.com/shaul1991/localmind && cd localmind
make setup      # 👈 이거 하나 — 준비물·진단·설치·연결을 단계별 안내
```

**설치가 끝나면 → 👉 [첫 사용 튜토리얼 (5분)](docs/tutorial.md)** — MCP 연결 → 첫 노트 적재 →
찾아보기까지 손으로 따라 하면 바로 감이 옵니다.

그다음부터는 두 가지로 씁니다:

- **개인 두뇌로(대부분의 사용자)** — Claude Code/Cursor 등에 한 줄로 등록:
  ```bash
  make mcp-install NOTES_DIR=/내/노트/폴더   # 내 .md 노트를 두뇌로
  ```
  등록 후 채팅창에서 "기억해둬 / 찾아줘 / 내 노트로 답해줘" → 자세히는 [사용법](docs/usage.md).
- **내 코드의 AI 주소로(개발자)** — `http://localhost:8787` 로 `base_url`만 교체 → [레퍼런스](docs/reference.md#api-사용-예시).

**웹으로 둘러보기(선택)** — `make ui` → `http://127.0.0.1:8788/ui` 에서 상태·**내 노트를 카드로** 봅니다(읽기 전용).

---

## 📚 더 알아보기

**처음이라면 (비개발자 우선)**
- 🎓 [첫 사용 튜토리얼(5분)](docs/tutorial.md) — 설치 후 MCP 연결 → 첫 노트 적재 → 찾아보기
- 🧩 [비유로 이해하기](docs/concepts.md) — "1인 비서실" 하나로 5분에 큰 그림
- ❓ [자주 묻는 질문(FAQ)](docs/faq.md) — 설치·연동·백업·성능·약관
- 📖 [사용법](docs/usage.md) — 매일 "기억해둬 / 찾아줘 / 다 보여줘 / 지워줘"
- 🧑‍💻 [직군별 워크플로우](docs/workflows.md) — 내 직군에서 바로 써보기(19 페르소나)

**더 파고들기 (개발자)**
- 🛠️ [레퍼런스](docs/reference.md) — 동작 원리·API·세션·함수호출·환경변수
- 🔌 [MCP로 붙이기](docs/mcp.md) — Cursor/Claude Desktop/Cline 연동 + 도구 13종
- 💾 [백업 · 복구](docs/backup.md) — 내 노트·기억을 git repo로, 새 기기 한 줄 복구
- 🎭 [페르소나 에이전트](docs/agents.md) — 역할·모델을 정의해 배포·싱크
- 🩺 [문제 해결](docs/troubleshooting.md) — 잘 안 될 때 증상별 해결

---

## 🔒 안전한가요? (개인 전용)

**이 스택은 내 PC에서 나 혼자 쓰는 용도입니다.** 내 `claude`/`codex` 로그인 + `localhost`(루프백)로만
동작하고, **중앙 서버·공유 계정·원격 접속에 의존하지 않습니다.** 데이터는 전부 내 머신 로컬에만 둡니다.

- 🔑 **공유·회사 노트북이면** `.env`의 `LOCALMIND_API_KEY`를 설정하세요 — 같은 머신의 다른
  프로세스가 무인증으로 구독을 쓰지 못하게. (자세히: [FAQ](docs/faq.md))

## ⚠️ 리스크와 책임 (꼭 읽어주세요)

localmind는 **구독형 CLI(`claude`·`codex`)를 로컬 API처럼 재노출**합니다. 이 형태는 각 제공사
(Anthropic·OpenAI 등) 약관과 닿는 **회색지대**입니다 — 개인 사용은 공식 약관이 허용하는 쪽이지만,
**"절대 안전"이라고 단언할 수 없고, 약관은 언제든 바뀔 수 있습니다.**

- ✅ **안전한 쪽** — 본인 계정으로 **혼자·합리적 사용량**(= *"ordinary, individual usage"*).
- ❌ **하면 안 됨 (계정 정지·약관 위반 위험)** — 계정 공유 · 접근 재판매 · 봇/스케줄러 대량 호출 ·
  rate limit 우회 · 공개 서비스 백엔드 · **타인 요청을 내 구독으로 처리**. 이런 용도라면
  **정식 API 키 인증으로 전환**하세요.
- 🛡️ 각 제공사 약관을 주기적으로 확인하고([Claude Code Legal & compliance](https://code.claude.com/docs/en/legal-and-compliance) — 정책은 변경 가능),
  노트·기억은 백업해 두세요(계정에 문제가 생겨도 로컬 데이터는 안전).

> **📌 책임은 사용자 본인에게 있습니다.** 이 소프트웨어는 **MIT 라이선스로 "있는 그대로(AS IS)"
> 무보증** 제공됩니다. 각 제공사 **약관 준수 · 계정 상태 · 데이터 · 비용**을 포함해 **사용에 따른 모든
> 결과와 책임은 사용자에게 있으며**, 저자·기여자는 어떤 손해에도 책임지지 않습니다.
> **본인의 판단과 책임하에 사용하세요.**

더 자세한 리스크·안전 사용 패턴 → 👉 [FAQ › 리스크(약관·계정 안전)](docs/faq.md#6-리스크--약관계정-안전)

## 라이선스

[MIT](LICENSE) — "있는 그대로(AS IS)" 무보증. 위 **⚠️ 리스크와 책임** 절을 꼭 읽어주세요.
