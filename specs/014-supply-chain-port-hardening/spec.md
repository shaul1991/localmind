# Spec: Supply Chain & Port Hardening 완결

상위: [goal](goal.md)

## Scope

(1) openmemory 이미지의 베이스 이미지·mem0 소스 고정 + `pinning.test.sh` 스캔 범위
편입 + CI 빌드 검증. (2) OpenMemory(:8767)에 Host 헤더 검증 주입(patch.py 경유),
LiteLLM(:4000) 마스터 키 설치 시 랜덤 생성.

## Context

- `openmemory/Dockerfile:4` `FROM python:3.12-slim` — 가변(마이너·패치 롤링) 태그.
- `openmemory/Dockerfile:12` `git clone --depth 1 --filter=blob:none --sparse
  https://github.com/mem0ai/mem0` — 브랜치/커밋 미지정, 매 빌드 upstream HEAD.
  sparse로 `openmemory/` 하위만 가져와 `api/`를 복사한다.
- `openmemory/patch.py` — 소스 문자열 치환 패치. 대상 문자열이 없으면 assert로 빌드
  실패(시끄러운 실패 설계 — 이 관례를 Host 검증 주입에도 따른다).
- `scripts/pinning.test.sh:35-49` — 스캔 대상이 `docker-compose*.yml`과 루트
  `Dockerfile`뿐. `pgvector:pg16`은 allowlist(`:28`).
- `.github/workflows/ci.yml` docker job — `context: .`의 루트 이미지 한 개만 빌드.
- `docker-compose.yml:81,124,125,141,145` — `${LITELLM_MASTER_KEY:-sk-local}` 폴백이
  litellm과 openmemory(API_KEY·OPENAI_API_KEY·LLM_API_KEY·EMBEDDER_API_KEY) 5곳.
- `.env.example:60` `LITELLM_MASTER_KEY=sk-local`.
- `src/brain.ts:54` `EMB_KEY = process.env.EMBEDDINGS_KEY ?? process.env.LITELLM_MASTER_KEY
  ?? "sk-local"` — 호스트 MCP 프로세스도 이 키로 :4000 임베딩을 호출한다. MCP 등록
  (`make mcp-install`/`mcp-config`, `scripts/mcp-install.sh`)이 이 env를 전달하는지가
  키 랜덤화의 관건.
- specs/011 — :8787 Host 검증의 허용 목록·`*` 끄기·추가 방식(교체 금지) 의미론. FR-5는
  이 의미론을 그대로 따른다.
- 호출 경로: :8767은 호스트의 MCP 프로세스(`Host: 127.0.0.1:8767` 또는
  `localhost:8767`)가 주 소비자. compose 내부에서 openmemory를 부르는 서비스는 없음
  (구현 시 재확인). :4000은 localmind 컨테이너(`litellm:4000`)와 호스트 MCP가 소비.

## Functional Requirements

### 트랙 A — 공급망 고정 완결

- **FR-1 (mem0 소스 커밋 고정)**: openmemory/Dockerfile이 mem0 저장소의 **특정 커밋**을
  체크아웃해 빌드한다(`ARG MEM0_COMMIT=<sha>` + clone 후 checkout, sparse 구조 유지).
  고정 지점 옆에 갱신 절차 주석(신버전 확인 명령 → sha 교체 → `make up`·smoke 검증)을
  단다.
  → goal: Objective(1), Constraints(스냅샷 고정·B5 연결)
- **FR-2 (베이스 이미지 고정)**: `python:3.12-slim`을 특정 패치 버전(예:
  `python:3.12.<x>-slim`)으로 고정한다. 010의 루트 Dockerfile 고정과 같은 수준.
  → goal: Objective(1)
- **FR-3 (회귀 가드 범위 일치)**: `pinning.test.sh`의 스캔 대상에
  `openmemory/Dockerfile`을 포함한다 — 가변 태그 검출과 **무고정 clone**(커밋/태그
  지정 없는 `git clone`) 검출을 모두 수행한다. 가드 자체를 검증하는 negative 케이스
  (가변로 되돌리면 실패)를 테스트에 포함한다.
  → goal: Expected outcome, Success metrics
- **FR-4 (CI 빌드 검증)**: CI의 docker job이 openmemory 이미지도 빌드한다 — upstream
  스냅샷 + patch.py가 실제로 빌드되는지를 push/PR마다 검증한다.
  → goal: Objective(1), Expected outcome

### 트랙 B — 노출면 완결

- **FR-5 (OpenMemory Host 검증)**: OpenMemory FastAPI 앱에 Host 헤더 검증을 주입한다
  (기존 patch.py 메커니즘). 의미론은 011과 동일: 기본 허용 목록(`localhost`,
  `127.0.0.1`, `[::1]`, compose 서비스명, `host.docker.internal`)에 환경변수로 **추가**
  (교체 금지), `*` 단독 지정 시에만 끔. 허용 밖 Host는 거부(4xx). 헬스/문서 경로의
  예외 여부는 011 AC-4와 같은 기준(민감 동작 없는 상태 조회만 예외)으로 plan에서 확정.
  → goal: Objective(2), Constraints, Risks(오차단)
- **FR-6 (LiteLLM 키 랜덤 생성)**: `make init-env`(및 `make setup` 경유)가
  `LITELLM_MASTER_KEY`를 설치마다 다른 임의 값(충분한 엔트로피)으로 생성해 `.env`에
  기록한다. compose의 `:-sk-local` 폴백을 제거해 **미설정이면 추측 가능한 키로 뜨지
  않게** 한다(미설정 시 기동 단계에서 `make init-env` 안내와 함께 중단). `.env.example`
  은 플레이스홀더 + 생성 안내 주석으로 바꾼다.
  → goal: Objective(2), Success metrics
- **FR-7 (키 소비자 배선)**: 키 랜덤화 후에도 모든 소비자가 동작한다 — compose 내부
  5곳(단일 변수라 자동), 호스트 MCP 프로세스(`src/brain.ts`)의 `sk-local` 폴백 제거 및
  MCP 등록(`mcp-install`/`mcp-config`)이 `.env`의 키를 env로 전달하도록 배선. 기존
  `.env`에 `sk-local`이 적힌 사용자는 동작이 유지되고, `make secrets`류 점검에서 갱신을
  안내받는다.
  → goal: Constraints(단일 키 공유·기존 사용자 무파손)
- **FR-8 (문서 갱신)**: README 보안 문단과 docs/faq.md 공유 머신 문항에 이번 변경
  (:8767 Host 검증, :4000 키)을 반영하고, 문서·예제의 `sk-local` 노출을 플레이스홀더로
  바꾼다.
  → goal: Expected outcome

## Acceptance Criteria

- **AC-1 (재현 빌드)**: Given 네트워크가 되는 호스트에서,
  When `docker compose build --no-cache`로 openmemory를 2회 빌드하면,
  Then 두 빌드가 같은 mem0 커밋(`MEM0_COMMIT`)을 체크아웃한다(빌드 로그로 확인).
- **AC-2 (가드 범위)**: Given 현재 저장소 상태에서,
  When `scripts/pinning.test.sh`를 실행하면,
  Then 통과한다. And openmemory/Dockerfile의 태그를 `python:3.12-slim`으로, clone을
  무고정으로 임시 되돌린 사본에 대해서는 **실패**한다(negative — 가드 자체 검증).
- **AC-3 (CI 게이트)**: Given CI 워크플로우에서,
  When docker job이 실행되면,
  Then 루트 이미지와 openmemory 이미지가 모두 빌드된다(어느 쪽 실패든 CI 실패).
- **AC-4 (:8767 rebinding 차단)**: Given 스택이 기본 설정으로 떠 있을 때,
  When `Host: evil.example.com` 헤더로 :8767의 메모리 조회 API를 호출하면,
  Then 거부된다(4xx).
- **AC-5 (:8767 정상 보존)**: Given 같은 조건에서,
  When `Host: localhost:8767`/`127.0.0.1:8767`로 기존 MCP 흐름(remember/recall 경유
  REST)을 호출하면,
  Then 기존과 동일하게 동작한다(`make smoke` 회귀 없음).
- **AC-6 (키 랜덤)**: Given `.env`가 없는 상태에서,
  When `make init-env`를 실행하면,
  Then `LITELLM_MASTER_KEY`가 `sk-local`이 아닌 임의 값으로 기록된다. And 서로 다른
  두 번의 생성 결과가 다르다.
- **AC-7 (키 강제)**: Given `.env`에 `LITELLM_MASTER_KEY`가 없는 상태에서,
  When 스택을 기동하면,
  Then 추측 가능한 기본 키로 뜨는 대신, 키 생성 방법을 안내하며 실패한다.
- **AC-8 (오키 거부)**: Given 스택이 랜덤 키로 떠 있을 때,
  When 잘못된 키로 :4000 임베딩을 호출하면,
  Then 인증 오류가 난다. And 올바른 키(호스트 MCP의 `ask_brain`/`search_notes` 경유)로는
  정상 동작한다.
- **AC-9 (기존 사용자 무파손)**: Given `.env`에 `LITELLM_MASTER_KEY=sk-local`이 이미
  적힌 상태에서,
  When `make up`을 실행하면,
  Then 스택이 기존대로 동작하고, 시크릿 점검(`make secrets` 또는 setup 체크리스트)이
  키 갱신을 안내한다.

## Open questions

- ~~`MEM0_COMMIT` 초기 값: 현재 라이브 검증된 스택이 쓰고 있는 upstream 시점의 커밋을
  기준으로 잡는다 — 구현 시 조회해 확정.~~
- ollama 이미지 digest → 버전 태그 교체(BACKLOG A8의 선택 항목): 이번 범위에 넣을지 —
  호스트에서 태그 존재 확인이 되면 FR-3 검증과 함께 처리(1줄), 안 되면 A8에 남긴다.
- :8767 Host 검증에서 OpenMemory의 자체 UI/문서 경로(있다면)의 예외 처리 — 구현 시
  라우트 목록을 보고 011 AC-4 기준으로 확정.
- ~~litellm 컨테이너가 localmind(:8787)를 부르는 역방향 경로에 키가 필요해지는지 —
  현재 없음(확인만).~~
