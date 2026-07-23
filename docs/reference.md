# 레퍼런스 (개발자용)

README를 가볍게 유지하기 위해 **상세한 동작·설정**을 여기에 모았습니다.
일상 사용은 [사용법](usage.md), 개념은 [비유로 이해하기](concepts.md)를 보세요.

> **great-reduction(2026-07)**: 게이트웨이 API(OpenAI/Anthropic 호환 재노출)·메모리 서비스
> (OpenMemory)·페르소나/스킬 배포는 제거·분리됐습니다. localmind는 이제 **노트 기억 계층**
> (capture·검색·brief·백업·동기화 + MCP 도구 4종)에 집중합니다 — 배경: [product-vision](product-vision.md).

---

## 동작 방식

1. **정본은 노트 파일** — `NOTES_DIR`의 `.md` 파일들. localmind는 어떤 데이터베이스도 정본으로
   삼지 않습니다.
2. **색인은 파생물** — 노트를 청크로 나눠 임베딩(OpenAI 호환 `EMBEDDINGS_URL` — 기본은 로컬
   Ollama의 bge-m3)하고, 첫 노트 폴더의 `.brain-index.json`(+벡터 사이드카)에 저장합니다.
   파일 해시 기반 증분 갱신이라 변경분만 다시 임베딩합니다.
3. **검색은 인메모리 코사인** — 개인 지식 규모에는 충분하며, DB·포트 노출이 없습니다.
4. **MCP(stdio)로 노출** — 호스트 AI(Claude 등)가 `capture_note`·`search_notes`·`whoami`를
   도구로 씁니다. 질의 종합·해석은 호스트 AI의 몫입니다(모델이 잘하는 일은 모델에게).

---

## MCP 서버 — 환경변수

`dist/mcp.js`(stdio)를 MCP 호스트에 등록할 때(또는 `make mcp-install`이 자동 설정):

| 변수 | 기본값 | 설명 |
|---|---|---|
| `NOTES_DIR` | `~/.localmind` | second-brain 노트 폴더(정본). **쉼표로 여러 폴더**: `work=/notes/work,life=/notes/personal`(라벨 생략 시 폴더명). 검색은 기본 전체, 도구의 `folder`로 한정 |
| `BRAIN_INDEX` | `<NOTES_DIR>/.brain-index.json` | 임베딩 인덱스 위치 |
| `EMBEDDINGS_URL` | `http://localhost:11434/v1` | 노트 임베딩 엔드포인트(OpenAI 호환) — 기본이 Ollama 직결 |
| `EMBEDDINGS_MODEL` | `text-embedding-3-small` | 임베딩 모델 — **권장: `bge-m3`**(한국어 품질) |
| `EMBEDDINGS_KEY` | (없음) | 임베딩 인증 키 — Ollama 직결이면 `dummy`(값 무시됨) |
| `BRAIN_BATCH` / `BRAIN_CONCURRENCY` / `BRAIN_CHUNK_SIZE` | `32` / `4` / `2000` | 인덱싱 튜닝 |
| `EMBED_TIMEOUT_MS` / `EMBED_RETRIES` | `120000` / `5` | 임베딩 호출 타임아웃·재시도 |
| `QUERY_LOG` | `~/.localmind/query-log.jsonl` | 검색 품질 로그(로컬 전용 — 커밋·백업 제외). 분석: `make query-report`, 정리: `make query-log-clean` |
| `LOCALMIND_AGENTS_DIR` / `LOCALMIND_SKILLS_DIR` | `<첫 NOTES_DIR 폴더>/agents`·`/skills` | **색인 제외** 폴더 판정(노트 폴더 하위의 에이전트 설정 데이터 — 배포·관리는 sdd-toolkit 소관) |

**인덱싱 성능**: 첫 인덱싱은 노트 전체를 임베딩(증분·resumable이라 이후엔 변경분만).
- 맥(Apple Silicon)은 **호스트 네이티브 Ollama**(Metal 가속)가 가장 빠릅니다 — `make doctor`로 진단.
- Ollama를 직접 설치하기 어려운 환경은 `docker compose up -d`(컨테이너, Linux+NVIDIA는
  `-f docker-compose.gpu.yml` 추가).
- 더 가벼운 모델은 **반드시 다국어**(예: snowflake-arctic-embed2 — Ollama 레지스트리에서 pull 가능한 실명 확인) — 영어 전용은
  한국어 검색 품질↓. 모델 변경 시 전체 재인덱싱(`make reindex`)이 필요합니다(모델 게이트가
  자동으로 빈 인덱스 폴백).

## 원격(HTTP) 모드 — 환경변수

기본은 stdio(로컬 전용)입니다. 원격 옵션(`make mcp-serve-http`)을 쓸 때만:

| 변수 | 기본값 | 설명 |
|---|---|---|
| `MCP_TRANSPORT` | `stdio` | `http`로 원격 모드 |
| `MCP_HTTP_HOST` / `MCP_HTTP_PORT` / `MCP_HTTP_PATH` | `127.0.0.1` / `8789` / `/mcp` | 바인딩 |
| `MCP_AUTH_TOKEN` | (필수) | 토큰 없이는 기동 거부 — 두뇌 접근권이므로 유출 주의 |

상세: [MCP로 붙이기 › 원격 모드](mcp.md#원격http-모드--홈서버-중앙집중-specs045) · [홈서버 가이드](home-server.md).

## 검증 (스모크)

```bash
make smoke        # MCP 도구 표면(4종) + brain(capture·검색) 스모크
make health       # 임베딩 엔드포인트 응답 확인
make doctor       # 기기 진단(임베딩 경로·노트 폴더 정합·색인 라벨)
```

## 현재 제한 사항

- 검색은 임베딩 코사인 단일 방식입니다 — 검색 스택 재평가는 진행 중
  ([rebuild-plan §6](rebuild-plan.md) — 실쿼리 A/B 실험 결과 동률, 후속 슬라이스에서 결정).
- Windows 네이티브 미지원(WSL2로는 가능하나 미검증).
