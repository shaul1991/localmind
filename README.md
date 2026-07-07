# localmind

[![CI](https://github.com/shaul1991/localmind/actions/workflows/ci.yml/badge.svg)](https://github.com/shaul1991/localmind/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)](package.json)
[![Local-first](https://img.shields.io/badge/local--first-127.0.0.1-blue)](docs/concepts.md)
[![Backends: Claude · Codex · Gemini](https://img.shields.io/badge/backends-Claude%20%C2%B7%20Codex%28ChatGPT%29%20%C2%B7%20Gemini-2563eb)](README.md#시작하기)
[![Optimized for macOS + Claude](https://img.shields.io/badge/optimized-macOS%20%2B%20Claude-111111?logo=apple&logoColor=white)](README.md#시작하기)

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

**준비물**: [Docker](https://www.docker.com/) · [Node.js ≥ 20](https://nodejs.org/) · **AI 구독 하나** —
`claude` · `codex`([ChatGPT](https://openai.com/codex/) 구독) · Gemini(Google API 키) 중 아무거나.

> ✅ **최적화 환경**: **macOS(Apple Silicon) + Claude** 조합에 맞춰 최적화·검증돼 있습니다(임베딩은
> Apple Silicon의 Metal 가속 자동 사용). 하지만 **Claude가 없어도 됩니다** — `make setup`에서 주 백엔드를
> **Claude / ChatGPT(codex) / Gemini** 중 골라 시작할 수 있어요(ChatGPT·Gemini만 써도 OK).
> Linux(+NVIDIA GPU)도 동작하며, 가장 매끄러운 경험이 위 조합일 뿐입니다.
>
> ℹ️ **Intel Mac은** ollama의 Metal(GPU) 가속을 못 써서 임베딩이 **CPU로 동작**합니다(2026 기준).
> 그래도 잘 돌아가요 — 무거운 AI 생성은 클라우드(claude/codex/gemini)가 하고, 로컬은 가벼운 임베딩만
> 하므로 실사용엔 무리 없습니다.
>
> 🪟 **Windows는 WSL2로**(⚠️ 미검증): 설치 스크립트가 bash·make 기반이라 PowerShell 네이티브로는 안
> 되고, **WSL2(Ubuntu) 안에서** 진행해야 합니다 — PowerShell에서 `wsl --install` 후 Ubuntu 터미널에서
> 위 명령 그대로. Docker Desktop(WSL2 백엔드)·Claude Code는 Windows를 지원하지만, **localmind 전체
> 흐름은 아직 Windows에서 검증되지 않았어요** — 시도해보고 문제가 있으면 이슈로 알려주세요.

```bash
git clone https://github.com/shaul1991/localmind && cd localmind
make setup      # 👈 이거 하나 — 준비물·진단·설치·연결을 단계별 안내
```

> 🖥️ **터미널이 처음이라 막막하다면** — clone 후 `make guide`를 실행하면 **브라우저에 아주 상세한
> 시각적 설치 가이드**가 열립니다: 준비물(Docker·Node…) 상태를 배지로 보고, 단계별 명령을 [복사]해
> 붙여넣기만 하면 돼요. 그걸 보며 위 `make setup`을 진행하면 됩니다. (Node만 있으면 설치 전에도 열려요.)

**설치가 끝나면 → 👉 [첫 사용 튜토리얼 (5분)](docs/tutorial.md)** — MCP 연결 → 첫 노트 적재 →
찾아보기까지 손으로 따라 하면 바로 감이 옵니다.

그다음부터는 두 가지로 씁니다:

- **개인 두뇌로(대부분의 사용자)** — 내가 쓰는 앱(MCP 호스트)에 한 줄로 붙입니다(아래 표). 붙인 뒤
  채팅창에서 "기억해둬 / 찾아줘 / 내 노트로 답해줘" → [사용법](docs/usage.md).
- **내 코드의 AI 주소로(개발자)** — `http://localhost:8787` 로 `base_url`만 교체 → [레퍼런스](docs/reference.md#api-사용-예시).

**MCP로 연동할 수 있는 앱과 설정법**

| 앱(MCP 호스트) | 연동 한 줄 |
|---|---|
| **Claude Code** | `make mcp-install` |
| **Claude Desktop** | `make mcp-desktop` — 설정 자동 병합·백업(붙여넣기 불필요) |
| **Cursor · Cline** | `make mcp-config` → 출력된 JSON을 설정 파일에 붙여넣기 |

- 내 `.md` 노트 폴더를 두뇌로 삼으려면 명령 뒤에 `NOTES_DIR=/내/노트/폴더`(쉼표로 여러 개).
- 적용 전 미리보기 `DRY_RUN=1 make mcp-desktop` · **도구 13종**·환경변수 등 상세 → [MCP로 붙이기](docs/mcp.md).

**웹으로 둘러보기(선택)** — `make ui` (브라우저 자동으로 열려요)에서 스택 상태·**연결 상태**(무엇이
연결됐고 바꿀 명령은 뭔지)·**내 노트를 카드로** 봅니다(읽기 전용).

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
