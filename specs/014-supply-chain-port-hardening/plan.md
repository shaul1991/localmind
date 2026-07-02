# Plan: Supply Chain & Port Hardening 완결

상위: [goal](goal.md) · [spec](spec.md)

## 접근 요약

두 독립 트랙. **트랙 A(공급망)**: openmemory/Dockerfile에 `ARG` 두 개(베이스 버전·mem0
커밋)를 고정하고, `pinning.test.sh`의 스캔 루프에 파일 하나·규칙 하나(무고정 clone
검출)를 추가하고, CI docker job에 빌드 스텝 하나를 더한다. **트랙 B(노출면)**:
patch.py에 Host 검증 주입 패치를 추가하고(011의 config 의미론을 파이썬 쪽에 이식),
`make init-env`에 키 생성을 넣고 compose 폴백을 제거한다. 애플리케이션 코드(src/)
변경은 `brain.ts`의 폴백 제거뿐이다.

## 도메인 경계 (DDD)

- **트랙 A — 빌드 재현성(인프라 경계)**: "이미지 빌드의 입력은 전부 버전이 박힌다"는
  010의 불변식을 스택의 마지막 이미지까지 확장. 검증(가드·CI)의 범위 = 원칙의 범위.
- **트랙 B — 신뢰 경계(perimeter)**: "루프백 안쪽이라도 브라우저는 신뢰 경계 밖"이라는
  011의 위협 모델을 포트 전체에 균일 적용. 키는 '설치 산출물'이지 '코드 상수'가 아니다.
- **유비쿼터스 언어**:
  - *고정 지점(pin point)*: 버전·커밋이 박힌 위치 + 갱신 절차 주석의 쌍
  - *허용 호스트(allowed host)*: 011과 동일 — Host 검증을 통과하는 호스트명 집합
  - *마스터 키(master key)*: LiteLLM 게이트웨이 인증 키 — 스택 내 모든 소비자가
    `.env`의 단일 값을 공유

## 영향 모듈

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `openmemory/Dockerfile` | 수정 | `ARG PYTHON_TAG`(고정 패치 버전)·`ARG MEM0_COMMIT` + checkout, 갱신 절차 주석 (FR-1·2) |
| `openmemory/patch.py` | 수정 | Host 검증 미들웨어 주입 패치 추가 — 대상 문자열 부재 시 assert 실패 유지 (FR-5) |
| `scripts/pinning.test.sh` | 수정 | 스캔 대상에 openmemory/Dockerfile + 무고정 clone 규칙 + negative 케이스 (FR-3) |
| `.github/workflows/ci.yml` | 수정 | docker job에 openmemory 빌드(context: ./openmemory) 추가 (FR-4) |
| `docker-compose.yml` | 수정 | `:-sk-local` 폴백 5곳 제거(변수 필수화), openmemory에 허용 호스트 env 전달 (FR-5·6) |
| `Makefile` / `scripts/up.sh` | 수정 | init-env의 키 랜덤 생성, 기동 전 키 존재 확인·안내 (FR-6) |
| `scripts/mcp-install.sh` | 수정 | MCP 등록 env에 `.env`의 `LITELLM_MASTER_KEY` 전달 (FR-7) |
| `src/brain.ts` | 수정 | `EMB_KEY`의 `"sk-local"` 폴백 제거(미설정 시 명확한 한국어 에러) (FR-7) |
| `.env.example` | 수정 | `sk-local` → 플레이스홀더 + 생성 안내 주석 (FR-6·8) |
| `README.md` / `docs/faq.md` / `docs/reference.md` | 수정 | :8767/:4000 방어 반영, `sk-local` 노출 정리 (FR-8) |
| `scripts/pinning.test.sh` 외 셸 테스트 | 수정/신규 | init-env 키 생성·compose 필수화 검증 (AC-6·7) |

## 단계 (task 분해 가능)

### 트랙 A — 공급망
1. **현재 스냅샷 커밋 확정**: 라이브 검증된 스택이 쓰는 mem0 upstream 시점을 조회해
   `MEM0_COMMIT` 초기 값으로 잡는다(동작이 검증된 코드로 고정 — 새 버전 도입이 아님).
2. **Dockerfile 고정(FR-1·2)**: `ARG PYTHON_TAG=3.12.<x>-slim` + `ARG MEM0_COMMIT=<sha>`,
   clone을 `git clone --filter=blob:none --sparse <url> && git checkout $MEM0_COMMIT`
   구조로(depth 옵션은 특정 커밋 fetch가 가능한 형태로 조정). 고정 지점 주석에 갱신
   절차(B5 형식) 기재.
3. **가드 확장(FR-3)**: 스캔 대상 배열에 `openmemory/Dockerfile` 추가 + "커밋/태그 미지정
   `git clone`" 검출 규칙. 기존 테스트 파일 안에 negative 케이스(임시 사본을 가변으로
   만들어 실패 확인) 추가 — AC-2.
4. **CI(FR-4)**: docker job에 `docker/build-push-action` 스텝 추가
   (`context: ./openmemory`, push: false, gha 캐시). AC-3.
5. **라이브 검증**: `docker compose build --no-cache` 2회 → 같은 커밋 로그 확인(AC-1)
   → `make up`·`make smoke` 회귀 없음.

### 트랙 B — 노출면
6. **Host 검증 패치(FR-5)**: patch.py에 FastAPI 앱 생성 지점을 찾아 Host 검증
   (Starlette `TrustedHostMiddleware` 또는 동등 미들웨어) 주입 — 허용 목록은
   `OPENMEMORY_ALLOWED_HOSTS` env(기본 목록에 **추가**, `*`면 끔 — 011 FR-2 의미론).
   compose에서 이 env를 전달. 헬스성 경로 예외는 라우트 확인 후 011 AC-4 기준 적용.
7. **키 생성(FR-6)**: init-env가 `.env` 생성 시 `LITELLM_MASTER_KEY=sk-lm-<랜덤 32hex>`
   기록(`openssl rand -hex` 또는 `head -c /dev/urandom | od` 폴백 — 기존 스크립트의
   POSIX 관례 유지). compose 폴백 제거 후 `make up` 경로(up.sh)에서 키 부재 시
   "make init-env를 먼저" 한국어 안내 후 중단 — AC-7. 기존 `.env`의 `sk-local`은 그대로
   동작(변수가 있으므로) + `make secrets`/setup 체크리스트에 "기본 키 사용 중 — 갱신
   권장" 표시 — AC-9.
8. **소비자 배선(FR-7)**: `brain.ts` 폴백 제거(미설정 시 "게이트웨이 키가 설정되지
   않았어요 — make init-env" 류 에러), mcp-install이 등록 env에 키 포함(기존
   `OPENMEMORY_USER` 전달과 같은 방식). 잘못된 키 → 임베딩 401 → MCP 응답의 에러
   문구가 비개발자에게 원인을 알려주는지 확인 — AC-8.
9. **문서(FR-8)** + **도그푸드**: 스택 재기동 후 `Host: evil` curl로 :8767 거부(AC-4),
   `make smoke`로 remember/recall·brain 경로 회귀 없음(AC-5) 확인.

## 테스트 전략

| AC | 테스트 레벨 | 방법 |
|----|-------------|------|
| AC-1 (재현 빌드) | 라이브(수동 1회) | `--no-cache` 2회 빌드 로그의 checkout 커밋 비교 — BACKLOG A 항목으로 기록 |
| AC-2 (가드 범위+negative) | 셸(CI) | `pinning.test.sh` 확장 — 현 상태 통과 + 가변 사본 실패 |
| AC-3 (CI 게이트) | CI | 워크플로우 실행에서 두 이미지 빌드 확인 |
| AC-4·5 (:8767 Host) | 라이브 + 스모크 | curl Host 변조 → 4xx · `make smoke` 통과 |
| AC-6 (키 랜덤) | 셸(CI) | 임시 HOME에서 init-env 2회 → 값 상이·`sk-local` 아님 |
| AC-7 (키 강제) | 셸(CI) | 키 없는 `.env`로 up.sh 사전 점검 경로 → 안내 후 비0 종료 |
| AC-8 (오키 거부) | 라이브 | 잘못된 키 curl → 401 · MCP 경유 정상 |
| AC-9 (기존 무파손) | 셸 + 라이브 | `sk-local` `.env`로 점검 통과 + 갱신 안내 노출 |

라이브 항목(AC-1·4·5·8·9 일부)은 구현 완료 시 BACKLOG "A. 검증 필요"에 체크리스트로
등재한다(기존 A8 방식).

## Open questions

- `TrustedHostMiddleware`가 포트 포함 Host를 어떻게 다루는지(스타렛 버전별 차이) —
  구현 시 확인, 필요하면 커스텀 미들웨어(011의 포트 제거 파싱과 동일 규칙)로.
- compose 폴백 제거 시 `docker compose config`가 미설정 변수를 어떻게 처리하는지
  (`${VAR:?메시지}` 필수화 구문 사용 여부) — up.sh 사전 점검과 이중화할지 한쪽만 할지
  구현에서 확정(기본안: compose `:?` + up.sh 친절 안내 이중).
- ollama digest→태그 교체 포함 여부(spec Open questions) — 트랙 A 작업 중 호스트에서
  태그 확인이 되면 1줄로 처리.
