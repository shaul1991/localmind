# Goal: Supply Chain Pinning (이미지·설치 스크립트 고정)

## Background — 배경

2026-07-01 품질·보안 평가에서 **보통(M1)** 으로 지목됐다. localmind는 개인이 자기 머신에
설치하는 오픈소스 스택이라, 배포물이 참조하는 외부 아티팩트의 무결성·재현성이 곧 모든
설치 사용자의 보안이다. 현재 세 곳이 미고정 상태다:

- `Dockerfile`: `curl -fsSL https://claude.ai/install.sh | bash` — 버전·체크섬 없이 원격
  스크립트를 그대로 실행.
- `docker-compose.yml`: `ollama/ollama:latest`, `ghcr.io/berriai/litellm:main-latest` —
  가변 태그라 빌드 시점마다 다른 이미지를 받으며, 업스트림 오염 시 무방비.
- 컨테이너가 root로 실행됨(node:24-slim 기본) — 침해 시 피해 반경 확대.

npm 의존성은 `package-lock.json` + `npm ci`로 이미 잘 고정돼 있다.

## Problem — 문제

- 재현성 부재: 오늘 설치한 사용자와 다음 달 설치한 사용자가 다른 ollama/litellm/claude
  CLI를 받는다 — "내 환경에선 되는데" 류 문제와 회귀 원인 추적 불능.
- 공급망 공격 표면: 업스트림(latest 태그·install.sh)이 오염되면 모든 신규 설치가 즉시
  영향을 받고, 사후에 어떤 버전이 설치됐는지 감사(audit)도 불가능하다.

## Objective — 목표

외부에서 받아오는 모든 아티팩트(Docker 이미지 태그, CLI 설치)를 명시된 버전으로 고정하고,
버전 갱신을 의도적인 커밋(리뷰 가능한 diff)으로만 이루어지게 한다.

## Expected outcome — 기대 결과

- docker-compose의 모든 외부 이미지가 구체 버전 태그로 고정된다.
- Dockerfile의 CLI 설치가 특정 버전을 명시해 이루어진다.
- 버전을 올리고 싶으면 파일의 버전 문자열을 바꾸는 커밋 하나로 — 변경 이력이 git에 남는다.
- (선택 확장) 컨테이너 비-root 실행 검토 결과가 기록된다 — 가능하면 적용, 제약(claude
  CLI 설치 경로 등)이 있으면 근거와 함께 보류를 문서화.

## Success metrics — 성공 지표

- `docker-compose*.yml`·`Dockerfile`에서 `latest`/`main-latest` 등 가변 태그 0건.
- 동일 커밋을 두 시점에 빌드해도 같은 외부 아티팩트 버전을 받는다(태그 기준).
- `make up` 전체 흐름이 고정 버전으로 회귀 없이 동작한다.

## Non-goals — 비목표

- 이미지 digest(sha256) 고정까지는 요구하지 않는다 — 태그 고정을 1차 목표로 하고,
  digest 고정은 운영 부담(갱신 마찰) 대비 이득을 Open questions로 남긴다.
- npm 의존성 감사(audit) 자동화·Dependabot 도입은 범위 밖.
- claude/codex CLI의 자동 업데이트 동작 자체를 막는 것은 범위 밖(런타임 동작이며 별개 주제).

## Constraints — 제약

- 고정할 버전은 현재 실사용에서 검증된 버전(현재 latest가 가리키는 버전)을 기준으로 한다.
- `make setup`/`make up`/`make embed` 등 기존 온보딩 흐름이 그대로 동작해야 한다.
- 버전 갱신 절차를 비개발자도 이해할 수 있게 주석으로 파일 안에 남긴다.

## Stakeholders — 이해관계자

- 단일 사용자(설치한 개인 누구나 — 비개발자 포함) — 설치 시점과 무관한 재현성·안전성

## Risks — 리스크

- 고정 버전이 낡으면 보안 패치를 놓칠 수 있음 — "고정"과 "방치"는 다름을 문서에 명시하고,
  주기적 갱신을 BACKLOG 운영 항목으로 남긴다.
- claude CLI 설치 스크립트가 버전 지정 방식을 공식 지원하지 않을 수 있음 — 조사 후
  지원되지 않으면 대안(특정 커밋의 스크립트 고정, 바이너리 직접 다운로드+체크섬)을 비교해
  선택한다.
