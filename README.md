# localmind

[![CI](https://github.com/shaul1991/localmind/actions/workflows/ci.yml/badge.svg)](https://github.com/shaul1991/localmind/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-brightgreen)](package.json)
[![Local-first](https://img.shields.io/badge/local--first-my%20files-blue)](docs/concepts.md)

> **localmind는 "AI와 함께 쌓는 나만의 기억 계층"입니다.** 🧠
>
> 어떤 AI 앱(Claude Code·Claude Desktop·Cursor…)에서든 대화의 부산물로 **결정·지식·맥락이
> 내 `.md` 노트로 저장**되고, 어느 기기·어느 세션에서든 **의미로 다시 찾아** 이어서 시작합니다.
> 노트는 전부 **내 컴퓨터의 파일**이고, git으로 백업·동기화됩니다.

처음이라 용어가 낯설다면 → 👉 **[5분 비유로 이해하기](docs/concepts.md)** 부터 보세요.

---

## 무엇을 해주나요?

- 📝 **기억해 둡니다** — 대화 중 "이거 기록해둬" 하면 AI가 노트로 저장합니다(`capture_note`).
  왜 그렇게 결정했는지(why)가 가장 값진 기록입니다.
- 🔍 **의미로 찾아줍니다** — "그거 뭐였지?" 하면 내 노트를 의미 기반으로 검색합니다(`search_notes`).
- 🖥️ **기기를 넘어 다닙니다** — 노트는 git 백업/복구로 어느 기기에서든 같은 기억(`whoami`로 확인).
- 🔒 **전부 로컬** — 데이터는 내 컴퓨터에만. 중앙 서버·공유 계정·클라우드 저장 없음.

## 누구를 위한 건가요?

**개발자가 아니어도 됩니다.** AI 앱에 한 번 연결하면, 그다음부터는 평범한 대화로 씁니다 —
"기록해둬 / 찾아줘". 내 지식·결정이 내 컴퓨터에 차곡차곡 쌓이는 **나만의 두뇌**가 생깁니다.

---

## 시작하기

> **`make setup` 명령 하나**가 준비물 점검·설치·연결을 한국어로 한 단계씩 안내해 줍니다.
> 막히면 [FAQ](docs/faq.md)를 보세요.

**준비물**: [Node.js ≥ 20](https://nodejs.org/) · 임베딩 엔진 [Ollama](https://ollama.com)
(맥: `brew install ollama`, 컨테이너 대안: `docker compose up -d`).

```bash
git clone https://github.com/shaul1991/localmind && cd localmind
make setup      # 👈 이거 하나 — 준비물·진단·설치·연결을 단계별 안내
```

임베딩 설정(.env — `make setup`이 안내):

```bash
EMBEDDINGS_URL=http://localhost:11434/v1   # Ollama 직결
EMBEDDINGS_MODEL=bge-m3
EMBEDDINGS_KEY=dummy
NOTES_DIR=~/my-notes                        # 내 .md 노트 폴더(쉼표로 여러 개)
```

> 🖥️ **터미널이 처음이라 막막하다면** — clone 후 `make guide`를 실행하면 **브라우저에 시각적 설치
> 가이드**가 열립니다. 배지로 준비물 상태를 보고, 단계별 명령을 [복사]해 붙여넣기만 하면 돼요.

**설치가 끝나면 → 👉 [첫 사용 튜토리얼 (5분)](docs/tutorial.md)**

**MCP로 연동할 수 있는 앱과 설정법**

| 앱(MCP 호스트) | 연동 한 줄 |
|---|---|
| **Claude Code** | `make mcp-install` |
| **Claude Desktop** | `make mcp-desktop` — 설정 자동 병합·백업(붙여넣기 불필요) |
| **Cursor · Cline** | `make mcp-config` → 출력된 JSON을 설정 파일에 붙여넣기 |

- 내 `.md` 노트 폴더를 두뇌로 삼으려면 명령 뒤에 `NOTES_DIR=/내/노트/폴더`(쉼표로 여러 개).
- 적용 전 미리보기 `DRY_RUN=1 make mcp-desktop` · **도구 3종**·환경변수 상세 → [MCP로 붙이기](docs/mcp.md).
- 기본은 **기기마다 로컬(stdio)**. 원격(http) 옵션도 있어요 → [홈서버 가이드](docs/home-server.md).

---

## 📚 더 알아보기

**처음이라면 (비개발자 우선)**
- 🎓 [첫 사용 튜토리얼(5분)](docs/tutorial.md) — MCP 연결 → 첫 노트 적재 → 찾아보기
- 🧩 [비유로 이해하기](docs/concepts.md) — 5분에 큰 그림
- ❓ [자주 묻는 질문(FAQ)](docs/faq.md) — 설치·연동·백업·성능
- 📖 [사용법](docs/usage.md) — 매일 "기록해둬 / 찾아줘"

**더 파고들기 (개발자)**
- 🛠️ [레퍼런스](docs/reference.md) — 동작 원리·색인·환경변수
- 🔌 [MCP로 붙이기](docs/mcp.md) — Cursor/Claude Desktop/Cline 연동 + 도구 3종
- 💾 [백업 · 복구](docs/backup.md) — 내 노트를 git repo로, 새 기기 한 줄 복구
- 🏠 [홈서버(옵션)](docs/home-server.md) — 원격 MCP로 여러 기기에서 한 두뇌 쓰기
- 📐 [Product Vision](docs/product-vision.md) — 이 프로젝트가 지향하는 것("살아있는 why 저장소")
- 🩺 [문제 해결](docs/troubleshooting.md) — 잘 안 될 때 증상별 해결

> 🧰 SDD 워크플로·페르소나·규칙 배포 등 **AI 개발 방법론 도구**는 별도 저장소(`sdd-toolkit`)로
> 분리됐습니다(2026-07 great-reduction — [rebuild-plan](docs/rebuild-plan.md) 참고).

---

## 🔒 안전한가요? (개인 전용)

**이 도구는 내 PC에서 나 혼자 쓰는 용도입니다.** 노트·색인·검색 전부 로컬 파일이고, 외부로 나가는
것은 임베딩 호출(기본: 같은 컴퓨터의 Ollama)뿐입니다. 원격(http) 모드를 켤 때만 토큰 인증이 활성화됩니다.

## 라이선스

[MIT](LICENSE) — "있는 그대로(AS IS)" 무보증.
