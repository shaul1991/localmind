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

```bash
git clone https://github.com/shaul1991/localmind && cd localmind
make setup      # 👈 이거 하나 — 준비물·진단·설치·연결을 단계별 안내
```

설치가 끝나면 두 가지로 씁니다:

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
- 📜 **약관**: 본인 구독으로 내 머신에서 나 혼자 쓰는 건 허용됩니다(Anthropic의 *"ordinary,
  individual usage"*). **서비스화하거나 타인 요청을 내 구독으로 처리하면 API 키 인증으로
  전환**해야 합니다. ([근거](https://code.claude.com/docs/en/legal-and-compliance))

## 라이선스

[MIT](LICENSE)
