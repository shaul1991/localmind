---
audience: both
---

# spec — local-first 기본 재확정

## FR (Functional Requirements)

### FR-1 — 하이브리드 위상 선언·복귀 절차 (Objective 1·3)

- `README.md` 연결 표(또는 인접 절)와 `docs/home-server.md` 서두에 위상을 명시한다:
  **기본 = 각 기기 로컬(stdio, `make mcp-install`) · 원격(http, specs/045) = 노트를 중앙
  1대에 두는 사용자용 옵션**. 기존 로컬 서사(F-21~24)는 재작성하지 않는다(이미 정본) —
  위상 문장 추가만.
- `docs/home-server.md`에 **복귀 절차 절 신설**: 원격 이관 사용자가 로컬로 되돌아오는 단계
  — ① `.env`에서 `MCP_TRANSPORT`·`MCP_AUTH_TOKEN`·`MCP_HTTP_*` 제거(F-9 역방향) ② 임베딩
  엔진 기동(`make embed` 또는 Ollama 직결 구성) ③ `make update`(pull·빌드·재색인) ④
  `make mcp-install`(Claude Code)·`make mcp-desktop`(Desktop) ⑤ 검증(whoami·recall) ⑥ 원격
  등록 정리(선택). 각 단계는 M5 실증(FR-4)과 1:1 대응해야 한다.

### FR-2 — Ollama 직결 일급 문서화 (Objective 2)

- `.env.example`에 `EMBEDDINGS_URL`·`EMBEDDINGS_MODEL`·`EMBEDDINGS_KEY` 항목을 주석 예시로
  추가한다 — 기본(litellm :4000/v1 경유)과 **Ollama 직결**(`http://localhost:11434/v1` +
  로컬 모델명) 두 경로를 병기.
- **키 처리(보수 확정)**: 코드 가드(F-19 — 키 없으면 throw)는 **변경하지 않는다**. Ollama
  직결 시 더미 키 사용을 문서에 명시("Ollama는 인증을 검사하지 않으므로 임의 비어있지 않은
  값"). 가드 완화(무인증 엔드포인트 허용)는 보안 표면 변경이라 이번 범위에서 제외 —
  Open question으로 이월.
- **배선(신설 — critic C-1)**: `.env`의 `EMBEDDINGS_URL`·`EMBEDDINGS_MODEL`은 현재 설치
  스크립트·reindex에 전달되지 않아 죽은 노브다(실측 — mcp-install.sh·mcp-desktop.sh는
  NOTES_DIR·키만, reindex.sh도 동일, Makefile은 .env 비-include). `scripts/mcp-install.sh`·
  `scripts/mcp-desktop.sh`·`scripts/reindex.sh`가 **설정된 경우에만** 두 변수를 자식 env로
  전달하도록 배선한다 — 미설정 시 현행과 바이트 동일 거동(하위호환·src/ 무변경 유지).
- **변수 이름 구분(critic C-3)**: `.env.example`의 기존 `EMBEDDING_MODEL`(단수 — 도커
  게이트웨이/ollama pull용)과 신규 `EMBEDDINGS_MODEL`(복수 — brain의 임베딩 요청 model
  필드)은 다른 레이어의 다른 변수 — 주석으로 레이어 차이를 명확히 구분한다.
- U-4·U-5의 실증 결과(FR-4)를 반영해 문서를 확정한다 — 실증 전 단정 금지(Live-Verify).

### FR-3 — M5 로컬 두뇌 복원 (Objective 4 — 도그푸드 겸 절차 실증)

M5에서 FR-1 복귀 절차를 **그대로 실행**하며 각 단계를 기록한다:

- Ollama 재기동(`brew services start ollama` — 모델 bge-m3 보존 확인), 임베딩 경로 확정
  (U-5 실증: litellm 없이 직결 성립하면 직결, 아니면 `make embed` 경유 — 실측이 결정).
- `.env` 로컬 구성(NOTES_DIR — 벌트 노트 폴더들, F-12 라벨 문법)·재색인(`make reindex`,
  소요 시간 기록)·`make mcp-install`·`make mcp-desktop`.
- 원격 등록(`localmind-remote`)은 검증 완료까지 **병행 유지**(Constraints).
- 기기 노트(devices/shaulm5local.md) 갱신 — "홈서버 두뇌만" 절을 실상으로.

### FR-4 — 검증·실증 (Objective 4)

- 로컬 stdio `whoami`·`search_notes`(재색인된 노트 대상 recall)·`capture_note`(로컬
  query-log 기록 확인)가 동작한다.
- **오프라인 등가 검증**: 원격 MCP를 사용하지 않는 상태(로컬 도구만)로 recall이 성립함을
  관찰한다.
- Desktop: `make mcp-desktop` 후 설정 파일에 localmind stdio 항목이 등록됨을 확인하고,
  실제 Desktop 도구 노출은 **사용자 확인**으로 닫는다(AI가 Desktop UI를 직접 관찰 불가 —
  정직 표기).
- U-4(bge-m3 모델명 실동작)·U-5(litellm 우회 성립)를 실증해 결과를 FR-2 문서에 반영한다.

## Acceptance Criteria

### AC-1 (FR-1) 위상 선언·복귀 절차
- Given 개정된 README.md·docs/home-server.md
- When 텍스트를 검사하면
- Then 하이브리드 위상 문장(로컬 기본·원격 옵션)과 복귀 절차 6단계가 존재하고, 전체 테스트
  스위트가 비회귀 green이다(대상 3파일 전용 계약 테스트는 없음 — 비회귀 확인이 실질).

### AC-2 (FR-2) Ollama 직결 문서화
- Given 개정된 .env.example
- When 텍스트를 검사하면
- Then EMBEDDINGS_URL·EMBEDDINGS_MODEL·EMBEDDINGS_KEY 예시(litellm 경유 + Ollama 직결 병기,
  더미 키 안내)가 있고, 내용이 FR-4 실증 결과와 일치한다(코드 가드 무변경 — diff에 src/ 없음).

### AC-3 (FR-3) M5 복원 실행 기록
- Given M5에서 복귀 절차 실행
- When evidence(restore-log)를 검사하면
- Then 절차 문서의 각 단계와 실행 기록이 1:1 대응하고(드리프트 0), 재색인 소요·색인 파일
  생성(.brain-index)·기기 노트 갱신이 기록돼 있다.

### AC-4 (FR-4) 로컬 동작 검증
- Given 복원된 M5
- When 로컬 stdio로 whoami·search_notes·capture_note를 실행하면
- Then 셋 다 성공하고, capture가 **로컬** query-log.jsonl에 기록되며(측정 루프 복원),
  search가 재색인된 벌트 노트를 회수한다.

### AC-5 (FR-4) Desktop 등록
- Given `make mcp-desktop` 실행 후
- When claude_desktop_config.json을 검사하면
- Then localmind stdio 항목(node dist/mcp.js + env)이 존재한다(기존 서버 보존 — F-8).
  실제 Desktop UI 노출은 사용자 확인 항목으로 보고에 명시.

### AC-6 (FR-4) U-4·U-5 실증
- Given M5 복원 과정
- When 임베딩 경로를 구성·실행하면
- Then Ollama 직결(bge-m3) 성립 여부와 litellm 필요 여부가 실행 결과로 확정되고, 그 결과가
  .env.example·복귀 절차 문서에 반영된다(불성립 시 fallback 경로 문서화 — 은폐 금지).

### AC-7 (FR-2) EMBEDDINGS_* 배선 — 3경로 전수
- Given `.env`에 `EMBEDDINGS_URL`·`EMBEDDINGS_MODEL`이 설정된 상태
- When `make mcp-install`(Claude Code 등록 env)·`make mcp-desktop`(Desktop config JSON env)·
  `make reindex`(자식 env)를 각각 실행하면
- Then 세 경로 모두에 두 변수가 전달된다 — mcp-install은 등록 결과, **mcp-desktop은
  `claude_desktop_config.json`의 `mcpServers.localmind.env`에 포함**, reindex는 실행 관찰.
  미설정 시에는 세 경로 모두 현행과 동일 거동(기존 사용자 무영향 — 스위트 green + 등록/
  config **바이트 동일**).

## Open questions

- **OQ-1 (키 가드 완화)**: 무인증 로컬 엔드포인트(Ollama) 직결 시 EMBEDDINGS_KEY를 optional로
  완화할지 — 보안 표면 변경이라 이번 제외, 더미 키 UX가 실사용에서 거슬리면 별도 슬라이스.
- **OQ-2 (원격 등록 정리)**: M5 검증 후 `localmind-remote` 등록을 제거할지 병행 유지할지 —
  사용자 확인 항목(비가역 아님, 언제든 재등록 가능).
- **OQ-3 (타 기기 M1)**: 같은 절차의 M1 적용 시점 — 이 spec 범위 밖, 절차 문서 재현성으로
  담보.

## 검증 결과 (2026-07-21, self-review round 1 clean)

- [x] FR-1/AC-1 — 위상 선언(README·home-server)·복귀 절차 6단계, 스위트 1042 green
- [x] FR-2/AC-2·7 — .env.example 실증 반영(레이어 구분)·3경로 배선(픽스처+실전 — Desktop
  config env·Claude Code 등록·재색인 bge-m3가 전달 증명), unset 바이트 동일 리뷰어 재현
- [x] FR-3/AC-3 — M5 복원 restore-log ↔ 절차 1:1(치환 사유 부기), 재색인 1200파일/13m26s
- [x] FR-4/AC-4·5·6 — 로컬 stdio whoami·search(0.573)·capture→로컬 query-log 41줄(측정 루프
  복원), Desktop config 등록(UI 노출은 사용자 확인), U-4·U-5 실증 확정(bge-m3/1024차원 직결)
- self-review: r1 clean(격리, blockers 0, advisories 3 — A-1 즉시 처리·A-3 부기·A-2 이월)
