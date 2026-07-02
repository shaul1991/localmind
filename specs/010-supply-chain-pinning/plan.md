# Plan: Supply Chain Pinning

상위: [goal](goal.md) · [spec](spec.md)

## 접근 요약

조사(현재 latest가 가리키는 버전, install.sh 버전 지원, litellm 태그 체계) → 버전 문자열
고정 → 전체 스택 재빌드·재기동 검증의 3단계다. 코드 로직 변경은 없고 인프라 선언만
바뀌므로, 검증의 무게중심은 라이브 스택 도그푸드(`make up`+`make smoke`)에 있다.

## 도메인 경계 (DDD)

- **인프라(배포 선언) 도메인**: 앱 코드·도메인 로직 무변경. Dockerfile·compose라는
  선언 파일과 그 주석(운영 문서)만 다룬다.
- **유비쿼터스 언어**:
  - *고정(pinning)*: 외부 아티팩트 참조를 불변 식별자(구체 버전 태그)로 명시
  - *갱신 커밋(update commit)*: 버전 문자열 변경만 담은, 리뷰 가능한 단일 커밋

## 영향 모듈

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `Dockerfile` | 수정 | claude 설치 버전 고정, codex 버전 고정, 베이스 이미지 고정 수준 적용, (가능 시) 비-root |
| `docker-compose.yml` | 수정 | ollama·litellm 태그 고정 + 갱신 안내 주석 |
| `docker-compose.host.yml` / `gpu.yml` | 확인/수정 | 이미지 참조 있으면 동일 고정 |
| `BACKLOG.md` | 수정 | "고정 버전 주기 갱신" 운영 항목 추가 (goal Risks의 방치 방지) |

## 단계 (task 분해 가능)

1. **버전 조사**: 현재 가동 중 스택에서 실버전 확인 —
   `docker image inspect ollama/ollama:latest`·litellm 컨테이너의 버전 라벨,
   litellm ghcr 태그 체계(semver 태그 존재 여부), `@openai/codex`의 현재 설치 버전,
   claude install.sh 내용에서 버전 파라미터 지원 여부.

2. **compose 고정(FR-1)**: 조사된 버전으로 `ollama/ollama:<ver>`,
   `ghcr.io/berriai/litellm:<ver>` 교체 + FR-5 갱신 안내 주석. host/gpu override 확인.

3. **Dockerfile 고정(FR-2·3·4)**:
   - codex: `npm install -g @openai/codex@<ver>`
   - claude: install.sh 버전 인자 지원 시 `bash -s -- <ver>` 형식, 미지원 시 대안 구현
   - 베이스: `node:24-slim` → 고정 수준 결정(FR-4 트레이드오프 주석 포함)

4. **비-root 조사(FR-6)**: `USER node` 적용 시 claude(/root/.local/bin)·codex 전역 설치·
   `~/.codex` 마운트(compose가 `/root/.codex`로 마운트) 경로가 깨지는지 확인.
   적용 가능하면 경로 조정과 함께 적용, 복잡도가 크면 근거 주석 남기고 보류
   (compose 볼륨 경로도 함께 바꿔야 하므로 파급 범위를 보고 판단).

5. **검증(도그푸드)**: `docker compose build --no-cache` → `make up` → `make health` →
   `make smoke` → `claude --version`/`codex --version` 컨테이너 내 확인(AC-2·3).

6. **BACKLOG 운영 항목 추가**: "분기별(또는 필요 시) 고정 버전 갱신 — 갱신 절차는 각 파일
   주석 참조" 한 줄.

## 테스트 전략

| AC | 테스트 레벨 | 방법 |
|----|-------------|------|
| AC-1 (가변 태그 0건) | 정적 검사 | grep으로 latest/main-latest 부재 확인 |
| AC-2 (스택 회귀 없음) | 라이브 도그푸드 | make up → health → smoke 통과 |
| AC-3 (CLI 버전 확인) | 라이브 | 컨테이너 내 `claude --version`·`codex --version` 출력 = 고정 버전 |
| AC-4 (갱신 단일 지점) | 정적 검사 | 각 아티팩트의 버전 문자열이 파일 1곳에만 존재 확인 |
| AC-5 (비-root 결정) | 문서 확인 | 적용 diff 또는 보류 근거 주석 존재 |

## Open questions

- litellm이 semver 태그를 제공하지 않으면(main-<sha> 형태만) 어떤 식별자를 쓸지 — sha 태그
  고정이 차선(주석에 사람이 읽을 버전 병기).
- CI의 docker build job은 고정 버전 pull로 시간이 늘 수 있음 — gha 캐시가 있어 실질 영향
  작을 것으로 예상하나 실측 확인.
