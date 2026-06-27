# ROADMAP

cli-gateway의 진화 방향을 기록한다. 핵심 비전:

> **지금은 개인용 MVP. 목표는 "개인 + 회사/팀 shared" 하이브리드** — 한 시스템을
> 개인 공간으로도, 팀 공유 공간으로도 쓸 수 있게 한다. 팀 전환은 *재작성이 아니라
> 덧붙이기(additive)* 가 되도록 지금 구조를 잡는다.

---

## 현재 (Phase 0 — 개인 MVP) ✅

repo 하나로 도는 완결형 로컬 AI 스택. 전부 로컬, 메터드 API 0원, 단일 사용자.

- **LLM API** — OpenAI(`/v1/chat/completions`)·Anthropic(`/v1/messages`) 호환, claude/codex CLI 라우팅
- 세션 영속화, 함수 호출(tool_calls / tool_use)
- **임베딩 게이트웨이** — LiteLLM + ollama(bge-m3)
- **메모리** — OpenMemory(mem0) + Postgres/pgvector (소스 빌드 + 패치)
- **second-brain** — `.md` 노트 RAG (capture_note/search_notes/ask_brain)
- **MCP 서버** — ask · remember/recall · 노트 도구 (stdio)
- Docker(profiles: gateway/memory), CI

---

## 목표 구조 (개인 + 팀 하이브리드)

```
                  ┌─ personal space   (user_id:나,   내 노트 폴더)
사용자 ─ MCP/API ──┤
                  └─ shared  space    (user_id:team, 공유 노트 repo)
   인증:  LiteLLM 가상 키 (멤버별 키·예산·rate limit)
   추론:  claude/codex CLI 계정 풀 (라운드로빈)
   접근:  tailnet 사설 호스팅
```

한 시스템에 **스코프(personal | shared | both)** 만 추가하면 개인·팀 둘 다 된다:
`recall(query, scope=...)`, `search_notes(query, scope=...)`.

---

## forward-compatibility (왜 지금 구조가 팀에 맞나)

| 레이어 | 현재 원시값 | 개인 → 팀 전환 |
|---|---|---|
| 메모리(mem0) | `user_id` 스코핑 | 개인=`user_id:나`, 공유=`user_id:team-x`. **이미 분리 가능** |
| 인증 | LiteLLM 게이트웨이 | LiteLLM **가상 키**(멤버별) — DB 모드만 켜면 됨 |
| chat/임베딩 | 공유 HTTP 서비스 | 본질적으로 멀티유저, 인증만 얹으면 됨 |
| 접근 | `0.0.0.0` + tailnet | 공유 서버 원격 접속 준비됨 |
| 노트(brain) | `NOTES_DIR` 단일 | 개인 폴더 + 공유 폴더 다중 소스 + 스코프 → 확장 필요 |
| CLI 구독 | 개인 1계정 | **계정 풀링**(라운드로빈) → 팀 규모의 핵심 작업 |

→ 대부분 이미 멀티유저 가능. 새로 만들 건 **① 네임스페이스 ② 가상 키 ③ 계정 풀링** 셋.

---

## 단계별 로드맵

### Phase 1 — 멀티유저 기반 (네임스페이스/스코프)
- 메모리·노트에 **scope(personal | shared)** 1급 도입. `user_id` 규약 정리(개인 vs `team:*`).
- second-brain이 **다중 노트 소스**(개인 폴더 + 공유 repo)를 인덱싱하고 스코프로 검색.
- MCP 도구에 `scope` 파라미터 추가.

### Phase 2 — 팀 인증 (LiteLLM 가상 키)
- LiteLLM 프록시 **DB 모드** 활성화 → 멤버별 키, 예산, per-user rate limit, 사용량 추적.
- cli-gateway/openmemory 인증을 게이트웨이 키로 통일.

### Phase 3 — CLI 계정 풀링 (한도 확장)
- claude/codex **여러 로그인을 라운드로빈** + 한도 소진 시 자동 전환.
- (선택) 한도 초과 시 실제 API로 오버플로 폴백.
- ⚠️ 공유 구독은 ToS/한도 제약이 본질 — 아래 "제약" 참고.

### Phase 4 — 공유 second-brain + 원격 MCP
- 공유 노트 = git repo(팀 KB). 사용자별/공유 격리.
- MCP를 **HTTP/SSE transport**로도 노출 → 원격 멤버가 URL+키로 접속(tailnet).
- 관측: LiteLLM 사용량 대시보드, 백업/복원.

---

## 유지 원칙 (팀 문을 막지 않도록)

- 단일 유저를 **하드코딩하지 않기** — `user_id`/scope를 항상 명시적으로.
- 인증은 **게이트웨이 레이어(LiteLLM)** 에 모으기 — 앱마다 흩지 않기.
- 노트는 **파일 + git 정본** 유지 — 공유 repo만 추가하면 팀 지식됨.
- 인덱스·DB는 **파생(disposable)** — 정본(노트/메모리 export)에서 재생성 가능하게.

---

## 백업 (git 기반)

"파일이 정본, DB/인덱스는 파생" 철학 → GitHub(또는 사설 git) 백업이 자연스럽다.

- **노트(.md)** → git repo, `git push` = 백업. `.brain-index.json`은 `.gitignore`(파생).
- **메모리(mem0)** → Postgres라 git-native 아님 → **마크다운/JSON export**를 git에 커밋(예정).
- 복원: 노트/메모리 파일 → import → 인덱스/DB 재생성.

> 개인 단계에선 개인 repo, 팀 단계에선 개인 repo + 공유 repo로 분리.

---

## 알려진 제약

- **공유 CLI 구독**: 1계정 = rate limit(5시간·주간) + 1인 소유. 팀을 한 계정으로 흘리면
  한도 소진 + ToS 소지. → Phase 3(계정 풀링)와 per-user rate limit으로 완화하되,
  대규모는 한계가 있음(개인/소팀 우선).
- **임베딩 throughput**: bge-m3 CPU가 바닥. 대량 인덱싱은 가벼운 모델/GPU/TEI로 `EMBEDDINGS_URL` 교체 권장.
- **자동 카테고리화**: OpenAI 구조화 출력 의존이라 CLI 경로에선 비활성(메모리 기능엔 무관).
