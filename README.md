# cli2port

로컬에 설치된 **Claude Code CLI** / **Codex CLI**를 **OpenAI · Anthropic API 호환 HTTP 서버**로 노출합니다.

기존에 OpenAI/Claude API를 호출하던 코드의 `base_url`만 cli2port로 바꾸면, 실제 API 대신 로컬 CLI(구독 인증)가 요청을 처리합니다. 별도 API 키 발급·과금 없이 CLI 구독을 API처럼 쓰는 것이 목표입니다.

OpenAI SDK(`/v1/chat/completions`)와 Anthropic SDK(`/v1/messages`)를 **모두** 그대로 붙일 수 있습니다.

```
클라이언트 (OpenAI SDK / Anthropic SDK)
      │  POST /v1/chat/completions  또는  /v1/messages
      ▼
   cli2port  ──(모델명 라우팅)──▶  claude -p / codex exec
      │                                   │
      ◀────── SSE / JSON 응답 변환 ◀───────┘
```

## 동작 방식

1. OpenAI 형식 요청(`messages`, `stream`, ...)을 받습니다.
2. `model` 필드로 백엔드를 결정합니다 (claude vs codex).
3. `messages`를 시스템 프롬프트 + 단일 프롬프트로 평탄화해 해당 CLI를 `-p`/`exec` 비대화형 모드로 실행합니다.
4. CLI의 JSON/스트리밍 출력을 OpenAI 형식(`chat.completion` / `chat.completion.chunk` SSE)으로 변환해 돌려줍니다.

CLI는 **순수 텍스트 생성기**로 동작합니다 — claude는 `--tools ""`로 모든 내장 도구를 끄고, codex는 `-s read-only`로 격리하며, 둘 다 임시 디렉토리에서 실행해 프로젝트 설정(CLAUDE.md 등)이 섞이지 않습니다.

## 요구 사항

- Node.js >= 20
- 로그인된 `claude` CLI (`claude` 가 PATH에 있어야 함)
- 로그인된 `codex` CLI (codex 백엔드를 쓸 경우)

## 설치 및 실행

```bash
npm install

# 개발 모드 (코드 변경 시 자동 재시작)
npm run dev

# 프로덕션
npm run build
npm start
```

기본적으로 `http://127.0.0.1:8787` 에서 대기합니다. 설정은 환경변수로 변경합니다 (`.env.example` 참고).

## 사용 예시

### curl

```bash
curl http://127.0.0.1:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "sonnet",
    "messages": [{"role": "user", "content": "안녕하세요"}]
  }'
```

### OpenAI Python SDK

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:8787/v1",
    api_key="not-needed",   # CLI2PORT_API_KEY를 설정했다면 그 값
)

resp = client.chat.completions.create(
    model="sonnet",                       # → claude 백엔드
    messages=[{"role": "user", "content": "한 줄로 자기소개 해줘"}],
)
print(resp.choices[0].message.content)

# 스트리밍
for chunk in client.chat.completions.create(
    model="gpt-5.5",                      # → codex 백엔드
    messages=[{"role": "user", "content": "1부터 5까지 세줘"}],
    stream=True,
):
    print(chunk.choices[0].delta.content or "", end="")
```

### OpenAI Node SDK

```ts
import OpenAI from "openai";
const client = new OpenAI({ baseURL: "http://127.0.0.1:8787/v1", apiKey: "not-needed" });
const res = await client.chat.completions.create({
  model: "claude-sonnet-4-6",
  messages: [{ role: "user", content: "hello" }],
});
```

### Anthropic SDK (`/v1/messages`)

OpenAI뿐 아니라 공식 Anthropic SDK도 그대로 붙습니다. `base_url`만 cli2port로 바꾸면 됩니다.

```python
from anthropic import Anthropic

client = Anthropic(
    base_url="http://127.0.0.1:8787",
    api_key="not-needed",   # CLI2PORT_API_KEY를 설정했다면 그 값 (x-api-key 헤더로 전송됨)
)

msg = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    system="간결하게 답해줘",
    messages=[{"role": "user", "content": "한 줄로 자기소개 해줘"}],
)
print(msg.content[0].text)

# 스트리밍
with client.messages.stream(
    model="sonnet",
    max_tokens=256,
    messages=[{"role": "user", "content": "1부터 5까지 세줘"}],
) as stream:
    for text in stream.text_stream:
        print(text, end="")
```

> `model`에 `codex:gpt-5.5` 처럼 지정하면 Anthropic 포맷으로 **codex 백엔드**를 호출할 수도 있습니다.

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

> codex의 사용 가능 모델은 로그인 계정에 따라 다릅니다. 계정이 지원하지 않는 모델을 지정하면 400 오류가 반환됩니다. 기본값은 `~/.codex/config.toml`의 모델과 맞춰 두는 것을 권장합니다.

## 엔드포인트

| 메서드 | 경로 | 포맷 | 설명 |
|---|---|---|---|
| POST | `/v1/chat/completions` | OpenAI | 채팅 완성 (스트리밍/비스트리밍) |
| POST | `/v1/messages` | Anthropic | 메시지 (스트리밍/비스트리밍) |
| GET | `/v1/models` | OpenAI | 모델 목록 |
| GET | `/health` | — | 헬스체크 (인증 불필요) |

인증(`CLI2PORT_API_KEY` 설정 시)은 OpenAI식 `Authorization: Bearer <키>` 와 Anthropic식 `x-api-key: <키>` 헤더를 모두 허용합니다.

## 설정 (환경변수)

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `8787` | 포트 |
| `HOST` | `127.0.0.1` | 바인딩 호스트 |
| `CLI2PORT_API_KEY` | (없음) | 설정 시 `Authorization: Bearer <키>` 필수 |
| `DEFAULT_BACKEND` | `claude` | 라우팅 실패 시 기본 백엔드 |
| `CLAUDE_DEFAULT_MODEL` | `sonnet` | claude 기본 모델 |
| `CODEX_DEFAULT_MODEL` | `gpt-5.5` | codex 기본 모델 |
| `CLAUDE_BIN` | `claude` | claude 실행 파일 경로 |
| `CODEX_BIN` | `codex` | codex 실행 파일 경로 |
| `REQUEST_TIMEOUT_MS` | `300000` | 요청 타임아웃(ms) |
| `LOG_LEVEL` | `info` | `debug`/`info`/`warn`/`error` |

## 검증

서버를 띄운 뒤 공식 OpenAI SDK 기반 스모크 테스트를 실행합니다.

```bash
npm run dev                          # 다른 터미널에서 서버 실행

# OpenAI 엔드포인트(/v1/chat/completions)
MODEL=sonnet  npm run smoke          # claude 백엔드
MODEL=gpt-5.5 npm run smoke          # codex 백엔드

# Anthropic 엔드포인트(/v1/messages)
MODEL=sonnet        npm run smoke:anthropic   # claude 백엔드
MODEL=codex:gpt-5.5 npm run smoke:anthropic   # codex 백엔드
```

## 현재 제한 사항 (MVP)

- **Function calling / tools**: 미지원. OpenAI `tools` 필드는 무시됩니다 (CLI의 내장 도구는 의도적으로 비활성화).
- **멀티모달**: 이미지 등 비텍스트 입력은 자리표시자로 치환됩니다.
- **대화 맥락**: 멀티턴 `messages`는 `User:/Assistant:` 라벨로 평탄화해 전달합니다 (세션 영속화 아님).
- **토큰 수**: CLI가 보고하는 값을 그대로 전달하므로, CLI 내부 시스템 프롬프트 토큰이 `prompt_tokens`(`input_tokens`)에 포함됩니다.
- `temperature`, `max_tokens` 등 일부 샘플링 파라미터는 CLI가 지원하지 않아 무시될 수 있습니다.
- **Anthropic 스트리밍**: `input_tokens`는 스트림 시작 시점(`message_start`)에 0으로 보내고, 최종 `message_delta`에서 실제 값을 채웁니다(SDK가 이를 합산해 최종 usage를 계산).

## 라이선스

MIT
