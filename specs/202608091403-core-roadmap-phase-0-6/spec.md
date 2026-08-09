# Spec — LocalMind 코어 중장기 개선 Phase 0~6

## 공통 불변식

1. Markdown 파일이 정본이고 색인은 재생성 가능한 파생물이다.
2. 한 기기에서는 로컬 stdio MCP, 여러 기기에서는 단일 정본의 원격 HTTP MCP를 사용하며 도구 의미는 동일하다.
3. core readiness·정본 경계·인증·source fidelity는 fail closed 한다.
4. 정본 파일 저장 뒤 파생 색인 갱신 실패는 durable success와 degraded indexing을 구분한다.
5. 실제 개인 노트·질의·토큰·절대경로는 fixture, 로그, 공개 문서에 포함하지 않는다.
6. 검색 알고리즘과 저장 엔진은 측정 결과가 필요성을 증명할 때만 바꾼다.
7. 자동 개선은 goal당 최대 5회차, 구현 WIP 1개, 사람의 merge gate를 유지한다.

## Phase Acceptance Criteria

### Phase 0 — 기준선
- 북극성 사용자 여정과 Phase 0~6의 범위·종료 게이트가 저장소 정본 문서로 존재한다.
- 일곱 Phase를 일곱 커밋으로 누적하고 하나의 PR로 제출하는 규칙이 명시된다.

### Phase 1 — 첫 유용 결과의 신뢰성
- setup은 필수 readiness 실패를 성공으로 표시하지 않는다.
- 명시한 unknown folder에는 파일을 만들지 않는다.
- durable capture와 indexing 미확인을 구분해 중복 저장을 방지한다.
- malformed embedding 응답은 결과나 색인을 만들지 않고 실패한다.

### Phase 2 — 정본·색인·복구 내구성
- clean-room backup→recover→reindex 검증이 자동화된다.
- 색인 손상은 정본을 건드리지 않고 탐지·재생성된다.
- local/remote canonical brain 계약이 split-brain을 조용히 만들지 않는다.

### Phase 3 — 검색 품질 회귀 게이트
- 공개 합성 corpus를 production retrieval 경로로 실행하는 일급 명령이 있다.
- 품질·no-match·출처·지연·manifest가 machine-readable report로 나온다.
- CI가 기준선보다 나쁜 회귀를 차단한다.

### Phase 4 — brief와 decision lifecycle
- brief는 선택·이유·전제·검증 시점을 구분하고 중복·대체된 결정을 정리한다.
- stale 신호는 관련 주제를 다시 접촉할 때 비차단으로 제공된다.
- project/folder 경계를 넘는 주입을 허용하지 않는다.

### Phase 5 — 이식성·운영·보안
- 지원하는 Node/OS/transport 계약과 clean-host 절차가 문서·테스트로 고정된다.
- self-host 문서는 Tailscale을 쉬운 기본 예시로 권장하되 WireGuard·ZeroTier를 허용한다.
- CI-green merged SHA, 비권한 실행, health, rollback 불변식을 회귀 검증한다.

### Phase 6 — evidence-gated living memory
- decision supersession과 assumption revalidation 이력이 append-only로 남는다.
- 개선 후보는 민감 원문이 아닌 최소 집계 신호와 재현 가능한 evidence로 제안된다.
- 4시간 무한 루프 대신 bounded goal과 명시적 trigger/cadence 계약을 제공한다.

## PR Acceptance Criteria

- `origin/main` 이후 정확히 7개의 Phase 커밋이 순서대로 존재한다.
- Node 20·22·24 CI, 전체 TypeScript/shell tests, typecheck, build, diff check가 성공한다.
- 독립 보안·로직·동시성 리뷰 blocker가 0이다.
- 모든 GitHub 리뷰·인라인 코멘트·미해결 스레드를 확인하고 유효한 지적을 수정·검증·회신한다.
- Draft PR로 제출하며 사람이 merge한다.

## 중단 조건

특정 Phase가 재현 가능한 결함·측정 기준·독립 fixture를 만들 수 없거나 정본 손실·개인 데이터 노출 위험을 허용해야만 구현 가능한 경우 그 Phase에서 멈추고 범위를 축소한다. 후속 Phase로 건너뛰어 완료로 표시하지 않는다.
