# 레퍼런스 (개발자용)

README를 가볍게 유지하기 위해 **상세한 동작·API·설정**을 여기에 모았습니다.
일상 사용은 [사용법](usage.md), 개념은 [비유로 이해하기](concepts.md)를 보세요.

---

## 동작 방식

1. OpenAI 형식 요청(`messages`, `stream`, …)을 받습니다.
2. `model` 필드로 백엔드를 결정합니다 (claude vs codex).
3. `messages`를 시스템 프롬프트 + 단일 프롬프트로 평탄화해 해당 CLI를 `-p`/`exec` 비대화형 모드로 실행합니다.
4. CLI의 JSON/스트리밍 출력을 OpenAI 형식(`chat.completion` / `chat.completion.chunk` SSE)으로 변환해 돌려줍니다.

CLI는 **순수 텍스트 생성기**로 동작합니다 — claude는 `--tools ""`로 모든 내장 도구를 끄고, codex는 `-s read-only`로 격리하며, 둘 다 임시 디렉토리에서 실행해 프로젝트 설정(CLAUDE.md 등)이 섞이지 않습니다.

---

## API 사용 예시

> 케이스별 runnable 예제 모음은 [examples/](../examples/) — Python/Node/Anthropic, 함수호출, 임베딩·의미검색, 메모리, second-brain, LangChain 등.

### curl
```bash
curl http://127.0.0.1:8787/v1/chat/completions -H "Content-Type: application/json" \
  -d '{"model":"sonnet","messages":[{"role":"user","content":"안녕하세요"}]}'
```

### OpenAI Python SDK
```python
from openai import OpenAI
client = OpenAI(base_url="http://127.0.0.1:8787/v1", api_key="not-needed")  # LOCALMIND_API_KEY 설정 시 그 값

resp = client.chat.completions.create(model="sonnet",  # → claude
    messages=[{"role": "user", "content": "한 줄로 자기소개 해줘"}])
print(resp.choices[0].message.content)

for chunk in client.chat.completions.create(model="gpt-5.5",  # → codex, 스트리밍
    messages=[{"role": "user", "content": "1부터 5까지 세줘"}], stream=True):
    print(chunk.choices[0].delta.content or "", end="")
```

### OpenAI Node SDK
```ts
import OpenAI from "openai";
const client = new OpenAI({ baseURL: "http://127.0.0.1:8787/v1", apiKey: "not-needed" });
const res = await client.chat.completions.create({
  model: "claude-sonnet-4-6", messages: [{ role: "user", content: "hello" }] });
```

### Anthropic SDK (`/v1/messages`)
공식 Anthropic SDK도 `base_url`만 바꾸면 그대로 붙습니다.
```python
from anthropic import Anthropic
client = Anthropic(base_url="http://127.0.0.1:8787", api_key="not-needed")  # x-api-key로 전송

msg = client.messages.create(model="claude-sonnet-4-6", max_tokens=1024,
    system="간결하게 답해줘", messages=[{"role": "user", "content": "한 줄로 자기소개 해줘"}])
print(msg.content[0].text)

with client.messages.stream(model="sonnet", max_tokens=256,
    messages=[{"role": "user", "content": "1부터 5까지 세줘"}]) as stream:
    for text in stream.text_stream: print(text, end="")
```
> `model`에 `codex:gpt-5.5`처럼 지정하면 Anthropic 포맷으로 **codex 백엔드**를 호출합니다.

---

## 모델 라우팅

`model` 필드로 백엔드와 실제 모델을 결정합니다.

| 입력 `model` | 백엔드 | CLI 모델 |
|---|---|---|
| `sonnet`, `opus`, `haiku`, `claude-*` | claude | 그대로 전달 |
| `gpt-*`, `o1/o3/o4-*`, `codex`, `gpt-5.5` | codex | 그대로 전달 |
| `claude:<모델>` | claude (강제) | `<모델>` |
| `codex:<모델>` | codex (강제) | `<모델>` |
| `anthropic/<모델>`, `openai/<모델>` | 패턴 매칭 | 프리픽스 제거 후 전달 |
| 그 외/빈 값 | `DEFAULT_BACKEND` | 백엔드 기본 모델 |

> codex 사용 가능 모델은 로그인 계정에 따라 다릅니다. 미지원 모델 지정 시 400. 기본값은 `~/.codex/config.toml`과 맞추길 권장.

## 엔드포인트

| 메서드 | 경로 | 포맷 | 설명 |
|---|---|---|---|
| POST | `/v1/chat/completions` | OpenAI | 채팅 완성 (스트리밍/비스트리밍) |
| POST | `/v1/messages` | Anthropic | 메시지 (스트리밍/비스트리밍) |
| GET | `/v1/models` | OpenAI | 모델 목록 |
| GET | `/health` | — | 헬스체크 (인증 불필요) |

인증(`LOCALMIND_API_KEY` 설정 시)은 OpenAI식 `Authorization: Bearer <키>`와 Anthropic식 `x-api-key: <키>` 둘 다 허용.

---

## 세션 영속화 (컨텍스트 유지)

OpenAI/Anthropic API는 stateless라 보통 매 요청마다 전체 히스토리를 다시 보냅니다. localmind는 대화를 **CLI 세션에 매핑**해, 이어지는 요청에선 `claude --resume`/`codex exec resume`로 **새 턴만 전송**합니다(프롬프트 캐시 활용으로 토큰 절약).

`SESSION_MODE`로 동작을 정합니다.

| 모드 | 동작 |
|---|---|
| `auto` (기본) | 메시지 prefix를 해시로 자동 인식. **클라이언트 변경 불필요** — 히스토리를 append하는 일반 채팅이면 자동으로 이어짐 |
| `explicit` | `x-localmind-session` 헤더(또는 `session_id`/`user`/`metadata.user_id`)가 있을 때만 그 id로 잇기. 가장 견고 |
| `off` | 세션 없이 항상 전체 히스토리 전송 |

```bash
curl http://127.0.0.1:8787/v1/chat/completions -H "Content-Type: application/json" \
  -H "x-localmind-session: my-convo-1" \
  -d '{"model":"sonnet","messages":[{"role":"user","content":"내 이름은 지훈이야"}]}'
```

**auto 모드 주의점**
- 클라이언트가 우리가 준 assistant 응답을 **그대로 다시 보낼 때** prefix가 일치해 이어집니다. 편집/요약해서 보내면 매칭이 깨지고, 이 경우 안전하게 **전체 히스토리로 새 세션**을 만듭니다(틀린 답은 아니고 토큰 절약만 사라짐).
- **재생성·분기 안전**: 같은 prefix가 두 번 오면 첫 번째만 resume(consume-once), 두 번째는 fresh로 복구해 세션 오염 방지.
- 세션 매핑은 인메모리이며 재시작/`SESSION_TTL_MS` 경과 시 사라짐(컨텍스트는 클라이언트 히스토리로 항상 복구 가능).

---

## 함수 호출 (Function Calling, A2 프롬프트 방식 PoC)

OpenAI(`/v1/chat/completions`)·Anthropic(`/v1/messages`) **양쪽** 지원. 모델이 함수 호출이 필요하다고 판단하면 각 포맷의 표준 응답(OpenAI `tool_calls` / Anthropic `tool_use`)을 돌려줍니다.

### OpenAI
```python
tools = [{"type": "function", "function": {
    "name": "get_weather", "description": "Get current weather for a city",
    "parameters": {"type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]}}}]

r = client.chat.completions.create(model="sonnet", tools=tools,
    messages=[{"role": "user", "content": "서울 날씨 알려줘"}])
call = r.choices[0].message.tool_calls[0]      # get_weather({"city":"서울"})

r2 = client.chat.completions.create(model="sonnet", tools=tools, messages=[
    {"role": "user", "content": "서울 날씨 알려줘"}, r.choices[0].message,
    {"role": "tool", "tool_call_id": call.id, "content": "맑음, 25도"}])
print(r2.choices[0].message.content)
```

### Anthropic
`tools`는 `{name, description, input_schema}`, 결과는 `user` 메시지의 `tool_result` 블록.
```python
tools = [{"name": "get_weather", "description": "Get current weather for a city",
    "input_schema": {"type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]}}]

r = client.messages.create(model="sonnet", max_tokens=1024, tools=tools,
    messages=[{"role": "user", "content": "서울 날씨 알려줘"}])
tool_use = next(b for b in r.content if b.type == "tool_use")

r2 = client.messages.create(model="sonnet", max_tokens=1024, tools=tools, messages=[
    {"role": "user", "content": "서울 날씨 알려줘"},
    {"role": "assistant", "content": r.content},
    {"role": "user", "content": [{"type": "tool_result", "tool_use_id": tool_use.id, "content": "맑음, 25도"}]}])
print(r2.content[0].text)
```

**작동 방식 (A2)**: CLI엔 "함수 스펙을 받아 호출만 내뱉고 멈추는" 모드가 없으므로, `tools` 스펙을 시스템 프롬프트에 주입하고 모델이 약속된 JSON(`{"tool_calls":[...]}`)으로 출력하게 한 뒤 파싱해 각 포맷으로 변환합니다.

**한계 (PoC)**
- 프롬프트 기반이라 **100% 보장 아님**(형식 벗어나면 일반 텍스트 처리).
- `tools`가 있으면 **버퍼링**(전체 출력을 봐야 도구 호출 판별 → 토큰 단위 스트리밍 아님). 없으면 실시간 스트리밍.
- claude는 충실히 따르지만 **codex는 더 에이전트적**이라 자체 도구로 다른 답을 낼 수 있음.

---

## 임베딩 게이트웨이 (gateway 프로파일)

localmind는 채팅(생성)만 다룹니다 — CLI는 **임베딩**을 못 하기 때문입니다. 임베딩이 필요한 소비자(supermemory 같은 RAG 시스템)를 위해 **임베딩 서버(Ollama+bge-m3)** 와 **통합 게이트웨이(LiteLLM)** 를 opt-in 프로파일로 제공합니다.

```
소비자 ──(base URL 하나)──▶ LiteLLM 게이트웨이 (:4000)
                              ├─ /v1/embeddings        → ollama (bge-m3)
                              └─ /v1/chat/completions  → localmind → claude/codex CLI
```

소비자는 **base URL 하나**(`http://<host>:4000/v1`)만 바라보면 임베딩은 로컬 모델로·채팅은 CLI 구독으로 자동 분기됩니다.

```python
from openai import OpenAI
c = OpenAI(base_url="http://localhost:4000/v1", api_key="sk-local")  # LITELLM_MASTER_KEY
c.embeddings.create(model="text-embedding-3-small", input="텍스트")   # → ollama bge-m3 (1024차원)
c.chat.completions.create(model="claude-sonnet-4-6", messages=[{"role":"user","content":"안녕"}])  # → claude
```

**라우팅** (`litellm.config.yaml`): 임베딩 모델명(`text-embedding-3-*`, `ada-002`, `bge-m3`) → ollama bge-m3 / 그 외 → localmind. 다른 임베딩 모델명을 쓰면 `model_list`에 한 줄 추가(없으면 채팅으로 잘못 라우팅).

**주의**: 색인·쿼리는 같은 임베딩 모델이어야 함(모델 변경 시 전체 재색인 + 차원 맞추기). GPU/대량 색인이면 ollama 대신 HF TEI/Infinity로 `api_base`만 교체.

---

## 메모리 서비스 (OpenMemory, memory 프로파일) — REST

게이트웨이 위에 **OpenMemory(mem0)** 를 얹어 **메터드 API 0원** 메모리/RAG를 띄웁니다. OpenMemory의 LLM(사실 추출)·임베더를 모두 게이트웨이로 돌려 claude + bge-m3로 동작합니다.

```
OpenMemory(:8767) ──▶ LiteLLM 게이트웨이
   add/list/search    ├─ 임베딩 → ollama(bge-m3)
                      └─ 추출 LLM → localmind → claude/codex
 Postgres + pgvector (메타데이터 + 벡터)
```
> 게시 이미지가 pgvector 미지원 + 읽기 버그라, **최신 소스 빌드 + localmind 패치**(`openmemory/`)를 적용. `make up` 시 `openmemory-init` 사이드카가 pgvector 테이블을 차원(1024)에 맞춰 선생성하고 모델을 게이트웨이로 설정.

```bash
# 추가 (claude가 사실 추출) — user_id는 OPENMEMORY_USER
curl -X POST http://localhost:8767/api/v1/memories/ -H "Content-Type: application/json" \
  -d '{"user_id":"localmind","text":"내 강아지 초코는 오이를 좋아한다.","infer":true}'
# 목록
curl "http://localhost:8767/api/v1/memories/?user_id=localmind&size=20"
# 검색(키워드)
curl -X POST http://localhost:8767/api/v1/memories/filter -H "Content-Type: application/json" \
  -d '{"user_id":"localmind","search_query":"강아지","size":10}'
```

**검증된 동작 / 한계**
- ✅ 쓰기(추출→bge-m3 임베딩→pgvector) · 읽기(목록/필터) · 의미 회상(mem0 `search()`).
- `user_id`는 `OPENMEMORY_USER`로 **시드된** 사용자여야 함(임의 id는 "User not found").
- **자동 카테고리화 비활성**(OpenAI json_schema 강제가 CLI 경로에서 안 됨 — 메모리 기능엔 무관).
- mem0 추출 프롬프트를 **입력과 같은 언어 + 주어 생략**으로 패치 → 한국어 입력은 한국어로 저장.
- OpenMemory는 단일 워커라 동시 add가 몰리면 직후 요청이 잠깐 밀릴 수 있음.
- 임베딩 모델 변경 시 `EMBEDDING_DIMS` 맞추고 `make clean`(볼륨 삭제)으로 초기화.

---

## MCP 서버 — 환경변수

`dist/mcp.js`(stdio)를 MCP 호스트에 등록할 때(또는 `make mcp-install`이 자동 설정):

| 변수 | 기본값 | 설명 |
|---|---|---|
| `OPENMEMORY_USER` | `localmind` | 메모리 소유자 id (스택 시드 값과 **일치해야** remember/recall 동작) |
| `NOTES_DIR` | `~/.localmind` | second-brain 노트 폴더(정본). **쉼표로 여러 폴더**: `work=/notes/work,life=/notes/personal`(라벨 생략 시 폴더명). 검색/RAG는 기본 전체, 도구의 `folder`로 한정 |
| `LOCALMIND_URL` | `http://localhost:8787` | ask가 호출할 localmind |
| `LOCALMIND_API_KEY` | (없음) | localmind 인증 시 |
| `OPENMEMORY_URL` | `http://localhost:8767` | remember/recall 대상 |
| `MCP_DEFAULT_MODEL` | `sonnet` | ask / ask_brain 기본 모델 |
| `BRAIN_INDEX` | `<NOTES_DIR>/.brain-index.json` | 임베딩 인덱스 위치 |
| `EMBEDDINGS_URL` | `http://localhost:4000/v1` | 노트 임베딩(게이트웨이) |
| `EMBEDDINGS_MODEL` | `text-embedding-3-small` | (게이트웨이가 bge-m3로 매핑) |
| `BRAIN_BATCH` / `BRAIN_CONCURRENCY` / `BRAIN_CHUNK_SIZE` | `32` / `4` / `2000` | 인덱싱 튜닝 |

**인덱싱 성능**: 첫 인덱싱은 노트 전체를 임베딩(증분·resumable이라 이후엔 변경분만). bge-m3 CPU가 바닥이라 더 빠르게:
- **bge-m3 + GPU/전용 임베딩 서버(TEI/Infinity)** 로 `EMBEDDINGS_URL` 교체(한국어 품질 유지·가속, 권장).
- 더 가벼운 모델은 **반드시 다국어**(multilingual-e5, snowflake-arctic-embed2) — `nomic-embed-text` 등 영어 전용은 한국어 검색 품질↓.
- 모델 변경 시 `EMBEDDING_DIMS` 조정 + 재인덱싱.

---

## 설정 (게이트웨이 전역 환경변수, `.env`)

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `8787` | 포트 |
| `HOST` | `127.0.0.1` | 바인딩 호스트 |
| `LOCALMIND_API_KEY` | (없음) | 설정 시 `Authorization: Bearer <키>` 필수 |
| `CLAUDE_CODE_OAUTH_TOKEN` | (없음) | claude 백엔드 인증(`make claude-token` 발급) |
| `DEFAULT_BACKEND` | `claude` | 라우팅 실패 시 기본 백엔드 |
| `CLAUDE_DEFAULT_MODEL` / `CODEX_DEFAULT_MODEL` | `sonnet` / `gpt-5.5` | 백엔드 기본 모델 |
| `CLAUDE_BIN` / `CODEX_BIN` | `claude` / `codex` | CLI 실행 파일 경로 |
| `REQUEST_TIMEOUT_MS` | `300000` | 요청 타임아웃(ms) |
| `SESSION_MODE` | `auto` | 세션 영속화 (`off`/`explicit`/`auto`) |
| `SESSION_TTL_MS` / `SESSION_MAX` | `3600000` / `1000` | 세션 매핑 보관/최대 |
| `LITELLM_MASTER_KEY` | `sk-local` | 게이트웨이 인증 키 |
| `OPENMEMORY_USER` / `OPENMEMORY_PORT` | `localmind` / `8767` | 메모리 시드 사용자 / 포트 |
| `LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error` |

전체 목록·주석은 [`.env.example`](../.env.example) 참고.

---

## Docker 상세

이미지에 `claude`·`codex` CLI가 함께 설치됩니다. 인증:
- **claude** — `.env`의 `CLAUDE_CODE_OAUTH_TOKEN`을 컨테이너에 주입(`make claude-token` 발급). `~/.claude.json` 파일 마운트는 macOS Keychain·atomic-rename 문제로 쓰지 않습니다.
- **codex** — 호스트 `~/.codex`를 디렉터리째 마운트해 재사용.

```bash
docker compose up -d --build     # 채팅 API만(프로파일 생략) · 전체 스택은 make up
docker compose --profile gateway up -d --build          # + 임베딩
docker compose --profile gateway --profile memory up -d # + 메모리 (= make up)
```

비-Docker 로컬 실행: `make dev`(watch) 또는 `make build && npm start`. 기본 `http://127.0.0.1:8787`.

> claude는 glibc 네이티브 바이너리라 베이스 이미지는 Debian 계열(`node:24-slim`). 인증 토큰 갱신을 컨테이너가 호스트 파일에 다시 쓰므로 볼륨은 RW.

---

## 검증 (세분 스모크)

기본 묶음은 `make smoke`(API+MCP+brain). 백엔드·엔드포인트별 변형:
```bash
make dev                                      # 다른 터미널에서 서버
MODEL=sonnet  npm run smoke                    # OpenAI · claude
MODEL=gpt-5.5 npm run smoke                    # OpenAI · codex
MODEL=sonnet        npm run smoke:anthropic    # Anthropic · claude
MODEL=codex:gpt-5.5 npm run smoke:anthropic    # Anthropic · codex
MODEL=sonnet npm run smoke:tools               # OpenAI tools
MODEL=sonnet npm run smoke:anthropic:tools     # Anthropic tool_use
```

**CI** (`.github/workflows/ci.yml`): push/PR마다 typecheck & build(Node 20·22·24) + docker build. 스모크는 인증 CLI가 필요해 CI 미실행(로컬 수동).

---

## 현재 제한 사항 (MVP)

- **Function calling**: 양쪽 엔드포인트에서 A2 프롬프트 방식 PoC로 지원(위 참고).
- **멀티모달**: 이미지 등 비텍스트 입력은 자리표시자로 치환.
- **대화 맥락**: 세션 영속화로 CLI 세션 resume. 매칭 실패/`off`면 멀티턴을 `User:/Assistant:` 라벨로 평탄화해 전체 전달.
- **토큰 수**: CLI 보고값 그대로 전달(CLI 내부 시스템 프롬프트 토큰이 `prompt_tokens`에 포함).
- `temperature`/`max_tokens` 등 일부 샘플링 파라미터는 CLI가 지원 안 해 무시될 수 있음.
- **Anthropic 스트리밍**: `input_tokens`는 `message_start`에서 0, 최종 `message_delta`에서 실제값(SDK가 합산).
