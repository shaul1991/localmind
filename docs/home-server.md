# 홈서버 중앙집중 — 휴대폰에서 localmind MCP 쓰기

M1 맥북 같은 개인 기기에서 돌던 localmind를 **항상 켜져 있는 홈서버**에 두고, SSH로 접속해
**휴대폰에서도** 같은 second-brain(노트·메모리·에이전트)을 쓰는 셋업 가이드다.

> **위상**: localmind의 기본은 **기기마다 로컬로 붙는 것**(stdio, `make mcp-install`)이다. 이
> 문서가 다루는 홈서버 중앙집중·원격(http) 접속은 노트를 한 곳에 모아 여러 기기에서 쓰고 싶은
> 사용자를 위한 **옵션**이다 — 기본 사용법은 [README](../README.md)를 참고한다.

> 이 문서의 외부 사실(MCP transport, Claude 모바일 커넥터 지원 등)은 2026-07 시점 공식 문서(T1)로
> 검증했다. 아래 "출처"와 "미확인 항목" 참조. 시간이 지나면 재검증이 필요하다.

---

## 0. 핵심 결론 먼저 (왜 이 방식인가)

localmind의 MCP 서버는 **stdio 전송(로컬 프로세스)** 방식이고, `search_notes`·`capture_note`는
**노트 폴더(NOTES_DIR)의 로컬 파일을 직접** 읽고 쓴다. 즉 **MCP는 노트가 있는 기기에서 돌아야 한다.**

그래서 "휴대폰의 Claude 앱이 원격 MCP에 붙는" 방식보다, **홈서버에서 Claude Code를 돌리고 휴대폰은
그 화면(터미널)에만 붙는** 방식이 가장 견고하다:

- **추천**: 홈서버에 스택 + Claude Code 상시 구동 → 휴대폰은 **Tailscale + SSH 앱 + tmux**로 접속.
  MCP 프로토콜을 **하나도 바꾸지 않는다**(stdio 그대로). ← 이 문서의 본론(§2~§6).
- **비추천(현재)**: Claude 모바일 앱의 "커스텀 커넥터"로 홈서버 MCP에 직접 연결. 공식 기능이지만
  **서버를 공개 인터넷에 노출해야** 하고, localmind에 HTTP 전송을 새로 구현해야 한다(§7).

### 아키텍처(추천 경로)

```
  [휴대폰]  Termius/Blink (SSH+mosh)
      │   Tailscale 사설망(100.x.x.x) — 인터넷에 포트 안 열림
      ▼
  [홈서버 = 상시 켜둔 맥/리눅스]
      ├─ tmux 세션 안에서 → claude (Claude Code CLI)
      │        └─ stdio ─ localmind MCP (dist/mcp.js)
      │                      └─ 로컬 파일 → NOTES_DIR (.md 노트) + 임베딩(Ollama :11434)
      └─ 임베딩 엔진(Ollama — 네이티브 또는 docker compose)
```

휴대폰은 "원격 데스크톱"처럼 홈서버의 터미널을 볼 뿐이고, 실제 연산·파일 접근은 전부 홈서버에서 일어난다.

---

## 1. 선택지 비교

| 경로 | 실현성 | localmind 코드 변경 | 인터넷 노출 | 성숙도 |
|---|---|---|---|---|
| **Tailscale + SSH 터미널** (추천) | 확실 | 없음 | 없음(사설망) | 높음 |
| mcp-proxy/supergateway + Cloudflare Tunnel + 인증 | 가능(복잡) | 필요(HTTP화) | 공개 URL(+인증 필수) | 중 |
| Claude 모바일 앱 커스텀 커넥터(공개 노출) | 요구와 상충 | 필요(HTTP+OAuth) | 공개 노출 | 정식이나 부적합 |
| Anthropic MCP tunnels | **현재 불가** | 필요 | 낮음 | research preview·모바일 미지원 |

근거는 §7과 "출처"에.

---

## 2. 전제조건

- **홈서버**: 항상 켜둘 맥 또는 리눅스 1대. (M1 맥북을 상시 서버로 써도 된다 — 덮개 닫아도 안 자게
  설정하는 법은 §3-C.) Docker가 돌아야 한다.
- **휴대폰**: iOS면 **Blink Shell**(mosh 내장) 또는 **Termius**, Android면 **Termius** 등 SSH 앱.
- **Tailscale 계정**(무료 플랜으로 충분). 홈서버와 휴대폰 양쪽에 앱 설치.
- 홈서버에 localmind가 이미 설치·동작 중이라고 가정한다(아니면 저장소 README의 설치부터).

---

## 3. 홈서버 셋업

### A. 스택 상시 구동

localmind 저장소 폴더에서:

```bash
docker compose up -d          # 임베딩 엔진(Ollama :11434)을 백그라운드로(네이티브 설치도 가능)
make mcp-install              # 이 서버의 Claude Code에 localmind MCP 등록(~/.claude 설정)
make health                   # 임베딩 엔드포인트 확인
```

`docker compose up -d`의 컨테이너는 Docker가 살아 있는 한 자동 재기동된다. 남은 건 **Docker와 서버가
항상 떠 있게** 하는 것(아래 B·C).

### B. 부팅 시 자동 시작 (선택이지만 권장)

- **Docker**: Docker Desktop이면 설정에서 "Start Docker Desktop when you log in"을 켠다. 리눅스는
  `sudo systemctl enable docker`.
- **localmind 스택**: 로그인 후 `docker compose up -d`가 자동 실행되게 하려면 —
  - **macOS(launchd)**: `~/Library/LaunchAgents/`에 `.plist`를 만들어 `RunAtLoad`+`KeepAlive`로
    `docker compose up -d`를 실행. (형식은 Apple "Creating Launch Daemons and Agents" 문서 참고 — 출처.)
  - **Linux(systemd)**: `~/.config/systemd/user/localmind.service`에 `ExecStart=docker compose up -d`,
    `Restart=always`, `WantedBy=default.target`.

> 스택 컨테이너는 이미 재시작 정책을 가지므로, 실무상 "Docker 자동 시작 + 최초 1회 `up -d`"만으로도
> 충분한 경우가 많다. 위 자동화는 재부팅이 잦을 때만.

### C. 맥이 자면 안 된다 (M1 맥북을 서버로 쓸 때 필수)

macOS 내장 `caffeinate`로 슬립을 막는다:

```bash
caffeinate -s        # 전원 연결 상태에서 시스템 슬립 방지(포그라운드 유지)
# 또는 특정 프로세스가 사는 동안만:  caffeinate -w <pid>
```

덮개를 닫아도 계속 돌리려면 `pmset`(전원 관리)도 함께 봐야 한다. **정확한 플래그는 기기에서
`man caffeinate` / `man pmset`로 재확인**하라(버전에 따라 다름 — 미확인 세부는 로컬 man 우선).

---

## 4. Tailscale로 안전한 사설망 연결

목표: 인터넷에 포트를 **하나도 열지 않고**, 휴대폰과 홈서버를 같은 사설망에 넣는다.

1. 홈서버에 Tailscale 설치 후 로그인:
   - macOS: 앱 설치 후 로그인. 또는 `brew install tailscale && sudo tailscale up`.
   - Linux: `curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up`.
2. 휴대폰에 Tailscale 앱 설치 → **같은 계정**으로 로그인.
3. 홈서버의 Tailscale IP 확인: `tailscale ip -4` → `100.x.y.z` 형태. (또는 MagicDNS 이름
   `<서버이름>.<tailnet>.ts.net`.)

이제 휴대폰은 이 `100.x.y.z`로 홈서버에 LAN처럼 접근한다. CGNAT·공유기 뒤여도 뚫린다.

> **왜 Tailscale인가**: SSH를 포함한 모든 TCP를 사설망으로 감싸므로 "인증 없는 MCP 엔드포인트가
> 인터넷에 노출"되는 위험이 원천 차단된다. MCP 스펙도 인증 없는 노출을 경고한다(출처).

---

## 5. 휴대폰 → 홈서버 SSH 접속

1. 홈서버에서 SSH를 켠다:
   - macOS: 시스템 설정 → 일반 → 공유 → **원격 로그인** 켜기.
   - Linux: `sudo systemctl enable --now ssh`.
2. 홈서버에서 **tmux** 설치(`brew install tmux` / `apt install tmux`). 세션이 끊겨도 작업이
   살아 있게 해준다.
3. 휴대폰 SSH 앱에서 새 호스트 등록:
   - Host: `100.x.y.z`(Tailscale IP) 또는 MagicDNS 이름
   - User: 홈서버 사용자명
   - 인증: **SSH 키 권장**(비밀번호보다 안전). 앱에서 키를 만들어 홈서버 `~/.ssh/authorized_keys`에 등록.
4. 접속 후:
   ```bash
   tmux new -s brain     # 처음: 세션 생성 (다음부턴 tmux attach -t brain 로 재접속)
   ```
   - **Blink Shell(iOS)** 등 mosh 지원 앱이면 `ssh` 대신 **mosh**로 붙는 걸 권장 — 이동 중 네트워크가
     바뀌어도 세션이 안 끊긴다.

---

## 6. Claude Code + localmind MCP 실행

tmux 세션 안에서(= 홈서버에서) 그냥 Claude Code를 켜면 된다:

```bash
cd <노트나 작업 폴더>
claude                # localmind MCP가 stdio 하위 프로세스로 자동 기동(§3-A에서 등록함)
```

- `make mcp-install`로 이미 등록돼 있으므로 Claude Code가 뜰 때 localmind 도구(`search_notes`·
  `capture_note`·`whoami`)가 붙는다.
- 노트는 **홈서버의** NOTES_DIR를 쓴다 —
  어느 휴대폰에서 붙든 **같은 중앙 상태**를 본다. 이게 "중앙집중"의 핵심이다.
- tmux 덕에 휴대폰을 꺼도 세션·대화가 홈서버에 살아 있고, 다시 `tmux attach -t brain`으로 이어진다.

---

## 7. (참고) 모바일 앱 원격 커넥터 방식은 왜 지금 안 쓰나

"휴대폰 Claude 앱이 홈서버 MCP에 직접 붙게" 하려면 두 가지 큰 벽이 있다:

1. **localmind에 HTTP 전송이 없다.** 현재 stdio 전용이라, 원격 커넥터용으로 Streamable HTTP 전송을
   새로 구현해야 한다(브릿지 도구 `mcp-proxy`/`supergateway`로 stdio를 HTTP로 감싸는 우회도 가능).
   이건 별도 기능이라 SDD로 다룬다 — **[specs/045-remote-mcp-access](../specs/045-remote-mcp-access/spec.md)**가
   이 HTTP 전송(맥 Claude Code가 `claude mcp add --transport http`로 Tailscale 사설 URL에 직접 접속)을
   정의한다(문서 단계, 구현 미착수). 준비되면 `/goal 045`로 구현.
2. **공식 커스텀 커넥터는 서버가 공개 인터넷에 노출돼야 한다.** Anthropic 공식 문서(T1)가 명시:
   *"VPN 뒤나 방화벽에 막힌 서버는 (본인은 접근돼도) 연결되지 않는다."* 즉 Tailscale 사설망에 숨긴
   홈서버는 이 경로로는 안 붙는다. 공개 노출 + OAuth/인증을 얹는 절충(Cloudflare Tunnel 등)은
   가능하나 구성이 복잡하고 노출면이 커진다.
   - Anthropic이 사설망용으로 낸 **"MCP tunnels"는 research preview이고 claude.ai·모바일 앱에서는
     아직 커넥터로 못 쓴다**(Console 관리 에이전트·Messages API 전용, T1).

**결론**: 지금은 §2~§6(SSH 터미널) 경로가 가장 견고하다. 나중에 localmind에 HTTP 전송을 붙이고
Anthropic의 모바일 커넥터/터널 지원이 성숙하면 재검토할 가치가 있다(그때는 새 spec으로).

---

## 8. 보안 체크리스트

- [ ] 서비스 포트는 기본 **루프백(127.0.0.1)** 바인딩(임베딩 Ollama `11434` 포함) — 공인
      인터넷에 열지 않는다. **예외**: 원격 MCP(mcp-http)를 다른 기기에서 쓸 때만
      `MCP_HTTP_HOST`로 Tailscale 인터페이스에 **명시 바인딩**(opt-in — 코드 기본값은
      `127.0.0.1`)하고, 토큰 인증 + Tailscale ACL·방화벽으로 접근을 제한한다(§7·[MCP 문서의
      http 절](mcp.md) 참조).
- [ ] 원격 접근은 **Tailscale 사설망**으로만. SSH는 **키 인증**(비밀번호 로그인 비활성 권장).
- [ ] `.env`의 `EMBEDDINGS_KEY`·원격 MCP 토큰 등 비밀은 서버에만. 노트 저장소·백업에 절대 커밋 금지.
- [ ] 굳이 공개 노출(§7 절충안)을 택한다면 **인증 없는 MCP 엔드포인트를 그대로 열지 말 것** —
      브릿지(mcp-proxy/supergateway)의 Bearer/OAuth와 Cloudflare Access 정책을 반드시 얹는다.
- [ ] 웹 UI(:8788)는 Host 헤더 검증이 있으나, 노출 시 인증을 확인한다.

---

## 9. 미확인 / 추가 검증이 필요한 항목 (정직 표기)

- Claude **모바일 앱**에서 커스텀 커넥터를 실제로 "추가"하는 UI 절차 — 공식 문서에 모바일 화면 기준
  단계가 명문화돼 있지 않다(원칙적으로 "모든 클라이언트 지원"이라는 문장만 확인).
- `caffeinate`/`pmset`의 최신 정확한 플래그 — 기기에서 `man`으로 재확인 권장.
- Anthropic **MCP tunnels**의 향후 claude.ai/모바일 커넥터 지원 여부·GA 일정 — 로드맵 미공개.
- 브릿지 도구 버전·인증 옵션은 시간에 따라 변한다 — 도입 시 각 저장소 README를 재확인.

---

## 10. 로컬로 되돌아오기 (복귀 절차)

원격(http)·홈서버 중앙집중을 쓰다가 다시 **각 기기 로컬(stdio)** 로 돌아오고 싶을 때의 절차다.
아래 순서 그대로 하면 된다 — 비가역적인 단계는 없다(원격 등록은 언제든 다시 만들 수 있다).

1. **원격 접속 설정 제거** — 이 기기의 `.env`에서 `MCP_TRANSPORT`·`MCP_AUTH_TOKEN`·
   `MCP_HTTP_*`(`MCP_HTTP_HOST`·`MCP_HTTP_PORT`·`MCP_HTTP_PATH`) 항목을 지운다. 애초에 이
   기기의 `.env`에 이 항목들이 없었다면(원격을 Claude Code의 별도 http 등록으로만 썼다면)
   **이 단계는 넘어가도 된다.**
2. **임베딩 엔진을 다시 켠다** — 둘 중 하나를 고른다:
   - **Ollama 직결**: `brew services start ollama`로 Ollama를 켠 뒤, `.env`에
     `EMBEDDINGS_URL=http://localhost:11434/v1` · `EMBEDDINGS_MODEL=<로컬 모델명(예: bge-m3)>` ·
     `EMBEDDINGS_KEY=<아무 비어있지 않은 값>`(Ollama는 이 키의 실제 값을 검사하지 않는다)을 채운다.
   - **컨테이너 Ollama**: `docker compose up -d`(Ollama를 직접 설치하기 어려운 환경의 대안 —
     같은 EMBEDDINGS_URL로 동작).
3. **스택을 최신화하고 다시 색인한다** — `make update`(pull·빌드) 후 `make reindex`를 실행한다.
   노트 양에 따라 수십 분 걸릴 수 있는 1회성 작업이다 — 끝나면 `.brain-index.json`이 다시 채워진다.
4. **MCP를 다시 등록한다** — `make mcp-install`(Claude Code) · `make mcp-desktop`(Claude Desktop).
5. **검증한다** — Claude Code를 재시작한 뒤 localmind 도구(`whoami`·검색)로 로컬에서 잘 붙고
   노트가 회수되는지 확인한다.
6. **(선택) 원격 등록 정리** — 더는 원격을 안 쓰기로 했다면 `claude mcp remove localmind-remote`
   같은 명령으로 등록을 지운다. 나중에 다시 쓸 수도 있으니 지우지 않고 **병행 유지**해도 된다.

---

## 출처 (T1 우선)

- MCP transport 스펙(stdio·Streamable HTTP, SSE 대체·인증 경고): modelcontextprotocol.io
  `/specification/2025-06-18/basic/transports` [T1]
- 커스텀 커넥터(원격 MCP, 공개 인터넷 도달 요구): support.claude.com `/articles/11175166` [T1]
- MCP tunnels(research preview, claude.ai 커넥터 미지원): platform.claude.com
  `/docs/en/agents-and-tools/mcp-tunnels/overview` [T1]
- 브릿지 도구: github.com/sparfenyuk/mcp-proxy, github.com/supercorp-ai/supergateway [T2]
- launchd: Apple "Creating Launch Daemons and Agents" 개발자 문서 [T1/T2]
- SSH+Tailscale+tmux/mosh 모바일 워크플로: 다수 매체 교차검증 [T3]

> localmind 내부 구조 근거: MCP 진입점 `src/mcp.ts`(StdioServerTransport), 도구·env
> `src/mcp-server.ts`, 포트·스택 `docker-compose.yml`·`Makefile`, 웹 UI `specs/034`,
> 다중 기기 동기화 `specs/031`.
