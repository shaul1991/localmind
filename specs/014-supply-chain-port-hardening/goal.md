# Goal: Supply Chain & Port Hardening 완결 (010·011의 사각지대)

## Background — 배경

specs/010(공급망 아티팩트 버전 고정)과 specs/011(로컬 보안 하드닝)은 각각 "재빌드가
어제와 같은 바이트를 낳는다", "루프백 안쪽의 공격 표면을 줄인다"는 원칙을 세웠다.
2026-07-03 인프라 리뷰에서 두 원칙 모두 **가장 민감한 자산이 있는 곳이 적용 범위에서
빠져 있음**이 발견됐다:

- **공급망 사각지대(높음)**: openmemory 이미지(개인 기억 전체를 다루는 컨테이너)가
  `python:3.12-slim` 가변 태그 위에서 mem0 upstream을 **브랜치/커밋 미지정으로 매 빌드
  clone**한다. 010의 회귀 가드(`pinning.test.sh`)는 루트 Dockerfile과 compose만 스캔해
  이 파일을 보지 못한다 — "가변 태그 0건" 테스트가 green인 채로 원칙이 미달성인
  **거짓 확신** 상태다. CI도 이 이미지를 빌드하지 않아 upstream 드리프트로 소스 패치
  (`patch.py`)가 깨져도 사용자의 `make up`/`make recover`에서 처음 발견된다.
- **노출면 사각지대(높음)**: 011이 :8787에 Host 헤더 검증을 넣은 근거(DNS rebinding은
  루프백 바인딩으로 막을 수 없다)는 :8767(OpenMemory REST — 무인증, Host 미검증)과
  :4000(LiteLLM — 기본 마스터 키가 추측 가능한 `sk-local`)에 그대로 성립한다. 악성
  웹페이지가 rebinding으로 개인 기억 전체를 열람·삭제하거나 구독을 소비할 수 있는
  표면이 남아 있다.

## Problem — 문제

- 새 기기 복구(`make recover`)가 upstream의 임의 시점 코드에 의존한다 — 빌드가 아무 때나
  깨질 수 있고, 검토되지 않은 upstream 변경이 개인 기억을 다루는 컨테이너로 직행한다.
- 회귀 가드의 스캔 범위가 원칙의 적용 범위보다 좁다 — 가드가 통과해도 원칙 위반이
  존재할 수 있는 구조 자체가 문제다.
- 같은 위협(DNS rebinding)에 대해 포트마다 방어 수준이 다르다 — 가장 민감한 데이터
  (개인 기억)가 있는 포트가 가장 약하다.

## Objective — 목표

010·011이 세운 원칙을 스택 전체로 완결한다: (1) openmemory 이미지의 베이스와 mem0
소스를 특정 버전에 고정하고, 회귀 가드와 CI의 검증 범위에 편입한다. (2) OpenMemory에
:8787과 동등한 Host 헤더 검증을 넣고, LiteLLM 마스터 키를 설치 시 임의 생성해 추측
불가능하게 한다(2026-07-03 사용자 결정: 패치 + 키 랜덤).

## Expected outcome — 기대 결과

- 클린 재빌드(`--no-cache`)가 시점과 무관하게 같은 mem0 소스 버전으로 수렴한다.
- `pinning.test.sh`가 openmemory/Dockerfile의 가변 태그·무고정 clone을 잡아낸다 —
  가드의 범위와 원칙의 범위가 일치한다.
- CI가 openmemory 이미지 빌드를 검증한다 — 패치 실패가 사용자 기기 전에 CI에서 잡힌다.
- localhost 계열이 아닌 Host 헤더로 :8767에 접근하면 거부된다.
- 새로 설치한 스택의 LiteLLM 마스터 키는 설치마다 다르고 추측 불가능하다.

## Success metrics — 성공 지표

- `docker compose build --no-cache` 2회가 같은 mem0 커밋을 체크아웃한다(빌드 로그 확인).
- openmemory/Dockerfile에 가변 태그를 임시로 되돌리면 `pinning.test.sh`가 실패한다
  (가드 자체의 검증 — negative test).
- `Host: evil.example.com`으로 :8767의 메모리 조회 API를 호출하면 거부된다.
- `make init-env`로 만든 `.env`의 `LITELLM_MASTER_KEY`가 `sk-local`이 아니며, 잘못된
  키로 :4000 호출 시 인증 오류가 난다.

## Non-goals — 비목표

- mem0/openmemory를 fork해 유지하는 것 — 스냅샷 고정 + 주기 갱신(BACKLOG B5)으로 충분.
- apt/pip 패키지 수준의 고정 — 010과 동일하게 범위 밖(베이스 이미지·소스 커밋 고정으로
  1차 방어).
- `pgvector:pg16` 태그 재론 — 010에서 "양호(참고 기준)"로 수용한 결정을 유지한다.
- OpenMemory REST에 API 키 인증 추가 — Host 검증 + 루프백으로 브라우저 경유 원격 공격은
  차단되며, 같은 머신 로컬 프로세스 위협은 011의 공유 머신 안내(API 키는 :8787 층위)와
  동일한 입장을 유지한다.
- MCP 도구·기능 변경 없음 — 이 작업은 인프라 층위만 만진다.

## Constraints — 제약

- mem0 고정은 upstream을 수정하지 않는 방식으로(clone 후 특정 커밋 checkout) — 기존
  sparse checkout 구조와 `patch.py`의 "조용히 지나가지 않고 시끄럽게 실패" 설계를
  유지한다.
- Host 검증 주입은 기존 `patch.py` 메커니즘을 사용한다(새 패치 체계를 만들지 않는다).
- 키 랜덤화 후에도 **스택 내부 소비자들이 전부 같은 키를 공유**해야 한다 — compose의
  litellm·openmemory 환경변수와 호스트 쪽 MCP 프로세스(`src/brain.ts`의 임베딩 호출)가
  모두 `.env`의 단일 값을 읽는 구조를 유지·배선한다.
- 기존 설치 사용자의 `make up` 흐름이 깨지지 않아야 한다(이미 `sk-local`이 적힌 `.env`는
  동작 유지 + 갱신 안내).
- 고정 지점마다 갱신 절차 주석(신버전 확인 명령 → 값 교체 → 검증)을 남긴다 — BACKLOG
  B5(주기 갱신)와 연결.

## Stakeholders — 이해관계자

- 단일 사용자(설치한 개인 누구나 — 비개발자 포함) — 특히 새 기기에서 `make recover`로
  복구하는 사용자, 브라우저를 켜 둔 채 스택을 상시 가동하는 사용자

## Risks — 리스크

- mem0 커밋 고정 후 upstream 보안 픽스를 자동으로 못 받음 — B5의 분기별(또는 보안 공지
  시) 갱신 절차로 완화. "고정과 방치는 다르다"는 B5 원칙을 고정 지점 주석에 명시.
- Host 검증이 정당한 호출을 오차단할 위험 — compose 내부 서비스 간 호출과 호스트
  MCP(127.0.0.1)의 Host 값을 허용 목록에 정확히 반영해야 한다(011에서 겪은 것과 동일한
  리스크 — litellm→localmind 사례의 교훈 재적용).
- 키 랜덤화가 기존 사용자·문서 예제와 어긋날 수 있음 — 예제는 플레이스홀더로 바꾸고,
  `make secrets`류 점검에 키 상태를 노출해 완화.
- OpenMemory가 FastAPI 구조를 바꾸면 Host 패치가 깨질 수 있음 — 커밋 고정으로 upstream
  변화 자체가 통제되고, 깨지면 patch.py가 빌드에서 시끄럽게 실패한다(CI 편입으로 조기
  발견).
