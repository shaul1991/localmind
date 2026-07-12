# MCP 서버 (도구로 사용)

> localmind를 Cursor·Claude Desktop·Cline 같은 도구(MCP 호스트)에 붙여, 그 도구가
> localmind의 기억·노트·질의 기능을 끌어 쓰게 하는 방법. 처음이라면 [README](../README.md) 참고.

localmind의 능력을 **MCP 도구**로 노출해, MCP 호스트(Claude Desktop / Cursor / Cline 등)가 자기 모델로 돌면서 끌어 쓰게 합니다. (MCP는 호스트의 *모델을 바꾸는 게 아니라* 도구를 줍니다.)

| 도구 | 설명 |
|---|---|
| `whoami` | 이 두뇌 식별 — 어떤 메모리/노트를 쓰는지 |
| `ask` | claude/codex CLI에 교차 질의(다른 모델 상담) → localmind 경유 |
| `remember` | 진화하는 기억에 사실 저장 (mem0: claude 추출 + bge-m3) |
| `recall` | 의미 기반 회상 (mem0 벡터 검색) |
| `capture_note` | second-brain: 마크다운 노트 저장 + 인덱싱 (정본은 `.md`) |
| `search_notes` | second-brain: 내 노트 의미검색(원문·경로) |
| `ask_brain` | second-brain: 내 노트만 근거로 RAG 답변(출처 인용) |
| `note_links` | second-brain: 노트의 위키링크(`[[...]]`) 연결 관계 조회(나가는/들어오는 1-hop) |
| `list_memories` | 쌓인 기억 **전체 열람**(id·내용·날짜) — 둘러보기·삭제 전 id 확인 |
| `delete_memory` | 기억 한 개 **삭제**(id로) |
| `list_notes` | 노트 파일 **목록**(`label/파일`) |
| `delete_note` | 노트 한 개 **삭제**(휴지통 이동 + 재인덱싱) |
| `scaffold_sdd` | SDD 작업 흐름(AGENTS.md 규약 + goal/spec/plan 템플릿)을 다른 프로젝트에 설치 |

> **두 종류의 기억**: `remember/recall`은 mem0의 *진화하는 사실 메모리*, `capture_note/search_notes/ask_brain`은 *내 마크다운 노트(정본) RAG* 입니다.
> **보기·정리(대화로)**: `list_memories`·`delete_memory`·`list_notes`·`delete_note` — "내 기억 다 보여줘", "이거 지워줘"를 채팅창에서 바로. 별도 화면·CLI 불필요.

```
MCP 호스트(Claude Desktop/Cursor/Cline)
   │ stdio
   ▼
localmind MCP 서버 (dist/mcp.js)
   ├─ ask              → localmind :8787 (claude/codex)
   └─ remember/recall  → OpenMemory :8767 (pgvector)
```

## 호스트 설정 (stdio)

**Claude Code** — 한 줄로 등록(절대경로·시드 user 자동, `.env`의 `OPENMEMORY_USER` 사용):
```bash
make mcp-install                       # 기본 NOTES_DIR=~/.localmind
make mcp-install NOTES_DIR=/내/노트/폴더  # 내 .md 노트 폴더로 RAG (쉼표로 여러 개 가능)
# 등록 후 Claude Code 재시작 → localmind 도구 사용. 해제는 make mcp-uninstall
```

**Claude Desktop** — 붙여넣기 없이 한 줄로 자동 연결(설정 파일을 찾아 `localmind` 항목만 병합):
```bash
make mcp-desktop                       # claude_desktop_config.json에 자동 추가
make mcp-desktop NOTES_DIR=/내/노트/폴더  # 내 .md 노트 폴더로 RAG (쉼표로 여러 개)
DRY_RUN=1 make mcp-desktop             # 적용 전 미리보기(쓰지 않음)
# 실행 후 Claude Desktop을 완전히 종료했다 다시 실행 → 설정 재로딩
```
- 기존 다른 MCP 서버는 **보존**하고, 쓰기 전 설정을 **백업**합니다(`*.localmind-bak-*`). 멱등(반복 실행 안전).
- 설정 파일이 손상돼 있으면 **덮어쓰지 않고 중단**합니다. 해제는 config에서 `mcpServers.localmind` 항목을 지우면 됩니다.

**Cursor `.cursor/mcp.json` / Claude Desktop(수동) / Cline** — `make mcp-config`로 채워진 JSON을 출력해 붙여넣기(구조 동일):
```json
{
  "mcpServers": {
    "localmind": {
      "command": "node",
      "args": ["/절대경로/localmind/dist/mcp.js"],
      "env": { "NOTES_DIR": "/내/노트/폴더", "OPENMEMORY_USER": "localmind" }
    }
  }
}
```
- `NOTES_DIR`를 기존 `.md` 노트 폴더로 가리키면 **그 지식으로 바로 RAG**(쉼표로 다중 폴더 가능).
- `OPENMEMORY_USER`는 스택이 시드한 값(기본 `localmind`, `.env`)과 **반드시 일치**해야 `remember/recall`이 동작합니다(불일치 시 `User not found`).

> `NOTES_DIR`·`OPENMEMORY_USER` 등 **MCP 환경변수**와 인덱싱 튜닝은 👉 [레퍼런스 › MCP 환경변수](reference.md#mcp-서버--환경변수).

## 원격(HTTP) 모드 — 홈서버 중앙집중 (specs/045)

위 stdio 방식은 두뇌가 **기기마다 로컬**에 있다. 항상 켜진 홈서버 1대에 두뇌를 두고 **여러 기기가
하나의 두뇌**를 쓰려면 HTTP(Streamable HTTP) 모드로 띄운다. 그러면 어느 기기에서 적재해도 즉시
다른 기기에서 검색된다(동기화 불필요). 전체 그림·휴대폰 접근은 👉 [홈서버 · 휴대폰](home-server.md).

**홈서버에서 기동**(기본 바인딩은 비공개 `127.0.0.1`):
```bash
make mcp-serve-http        # MCP_AUTH_TOKEN이 없으면 생성해 .env에 저장하고 연결법을 안내
```
- 기본 포트 `8789`(`MCP_HTTP_PORT`), 경로 `/mcp`(`MCP_HTTP_PATH`), 호스트 `127.0.0.1`(`MCP_HTTP_HOST`).
- **인증 강제**: 토큰(`MCP_AUTH_TOKEN`) 없이는 기동하지 않는다. 토큰은 **두뇌 접근권**이므로 유출 주의.
- stdio 사용자는 무엇도 바뀌지 않는다 — `MCP_TRANSPORT`가 없거나 `stdio`면 기존 그대로.

**다른 기기(맥)의 Claude Code에서 연결** — 사설망(Tailscale) URL로:
```bash
claude mcp add --transport http localmind http://<홈서버-Tailscale-IP-또는-이름>:8789/mcp \
  --header "Authorization: Bearer <MCP_AUTH_TOKEN>"
```

> ⚠️ **보안**: 기본은 `127.0.0.1`(외부 미개방)이다. 다른 기기 접근은 **Tailscale 같은 사설망**으로
> 하고, 인터넷에 포트를 직접 열지 마라. Claude **모바일 앱의 원격 커넥터**는 서버가 공개 인터넷에
> 노출돼야 해서 이 사설망 구성과 맞지 않는다(휴대폰은 SSH 방식 — [home-server.md](home-server.md)).
> 상시 구동은 launchd/systemd로, 맥을 서버로 쓰면 `caffeinate`로 슬립을 막는다.

**상세 knob**: `MCP_TRANSPORT`(stdio|http), `MCP_HTTP_HOST`·`MCP_HTTP_PORT`·`MCP_HTTP_PATH`,
`MCP_AUTH_TOKEN`. 세션은 `Mcp-Session-Id`로 라우팅되며(미지 세션→404, 세션 없는 비-initialize→400),
인증 실패는 401이다.
