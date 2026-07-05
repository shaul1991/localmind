# Spec: Supply Chain Pinning

상위: [goal](goal.md)

## Scope

`Dockerfile`·`docker-compose*.yml`의 외부 아티팩트 참조를 버전 고정으로 바꾸고, 갱신
절차를 파일 내 주석으로 문서화한다. 비-root 실행은 조사 후 적용 또는 근거 있는 보류.

## Context

- `Dockerfile:28`: `curl -fsSL https://claude.ai/install.sh | bash` (버전 미지정),
  `npm install -g @openai/codex` (버전 미지정), 베이스 `node:24-slim` (마이너 미고정).
- `docker-compose.yml:37`: `ollama/ollama:latest` · `:61`: `ghcr.io/berriai/litellm:main-latest`.
- `docker-compose.yml:83`: `pgvector/pgvector:pg16` — 메이저 고정돼 있음(양호, 참고 기준).
- npm 앱 의존성: `package-lock.json` + `npm ci` — 이미 고정(무변경).

## Functional Requirements

- **FR-1 (compose 이미지 태그 고정)**: `ollama/ollama`·`ghcr.io/berriai/litellm` 이미지를
  현재 검증된 구체 버전 태그로 고정한다. `docker-compose.host.yml`/`gpu.yml` override에
  이미지 참조가 있으면 함께 고정한다.
  → goal: Objective, Success metrics (가변 태그 0건)

- **FR-2 (claude CLI 설치 고정)**: Dockerfile의 claude 설치를 버전 명시 방식으로 바꾼다.
  공식 install.sh의 버전 파라미터 지원 여부를 조사해: 지원하면 버전 인자 사용, 미지원이면
  대안(버전 명시 바이너리 다운로드 + 체크섬 검증 등) 중 가장 유지보수 가능한 것을 택한다.
  → goal: Objective, Risks

- **FR-3 (codex CLI 설치 고정)**: `npm install -g @openai/codex`에 구체 버전을 명시한다.
  → goal: Objective

- **FR-4 (베이스 이미지 고정 수준 결정)**: `node:24-slim`을 어느 수준(24 메이저 유지 vs
  24.x.y 풀 버전)으로 고정할지 결정하고 적용한다 — 보안 패치 자동 수용과 재현성의
  트레이드오프를 주석으로 기록.
  → goal: Expected outcome

- **FR-5 (갱신 절차 주석)**: 각 고정 지점 옆에 "이 버전을 올리려면: <확인 명령/링크> 확인
  후 이 값을 바꾸고 make up으로 검증" 형식의 짧은 갱신 안내 주석을 단다(비개발자 배려).
  → goal: Constraints

- **FR-6 (비-root 실행 조사)**: 컨테이너 비-root 실행 가능성을 조사한다. claude CLI 설치
  경로(/root/.local/bin)·~/.codex 마운트 등 제약을 확인해 적용 가능하면 적용, 불가하면
  근거를 spec/코드 주석에 남기고 보류한다(결정 자체가 산출물).
  → goal: Expected outcome (선택 확장)

## Acceptance Criteria

- **AC-1**: Given 수정된 compose·Dockerfile,
  When `grep -rn "latest" docker-compose*.yml Dockerfile`을 실행하면,
  Then 가변 태그(latest/main-latest) 참조가 0건이다.

- **AC-2**: Given 고정된 버전으로,
  When `make up`(전체 스택 기동) 후 `make health`·`make smoke`를 실행하면,
  Then 기존과 동일하게 통과한다(회귀 없음).

- **AC-3**: Given Dockerfile의 claude/codex 설치 라인,
  When 이미지를 빌드하면,
  Then 명시된 버전의 CLI가 설치된다(`claude --version`/`codex --version`으로 확인).

- **AC-4 (엣지 — 갱신 시나리오)**: Given 파일 내 갱신 안내 주석,
  When 버전 문자열 하나를 바꾸고 재빌드하면,
  Then 다른 파일 수정 없이 새 버전이 적용된다(고정 지점이 한 곳에만 존재).

- **AC-5 (비-root 결정 기록)**: Given FR-6 조사 완료 후,
  Then 적용됐거나, 보류 근거가 Dockerfile 주석(또는 이 spec의 Open questions 갱신)으로
  남아 있다.

## Open questions

- ~~이미지 digest(sha256) 고정: 태그는 업스트림이 재푸시하면 내용이 바뀔 수 있어 digest가
  더 강하지만, 갱신 마찰이 커진다. 1차는 태그 고정으로 하고 digest는 실익이 확인되면 후속.~~
- litellm은 `main-latest` 외 어떤 태그 체계(semver?)를 제공하는지 조사 필요(구현 시 확인).
- claude install.sh의 버전 파라미터 공식 지원 여부 — 구현 시 스크립트 내용 확인 후 결정.
