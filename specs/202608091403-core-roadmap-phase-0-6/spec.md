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
- 각 Phase를 독립 `[verified]` 커밋으로 유지한다. Phase 0·1은 선행 PR, Phase 2~6은
  후속 feature branch와 Draft PR로 제출하는 rollout 경계가 명시된다.

### Phase 1 — 첫 유용 결과의 신뢰성
- setup은 필수 readiness 실패를 성공으로 표시하지 않는다.
- 명시한 unknown folder에는 파일을 만들지 않는다.
- durable capture와 indexing 미확인을 구분해 중복 저장을 방지한다.
- malformed embedding 응답은 결과나 색인을 만들지 않고 실패한다.

### Phase 2 — 정본·색인·복구 내구성
- clean-room backup→recover→reindex 검증이 자동화된다.
- 색인 손상은 정본을 건드리지 않고 탐지·재생성된다.
- local/remote canonical brain 계약이 split-brain을 조용히 만들지 않는다.
- JSON 의미 payload와 vector sidecar bytes는 각각 digest로 봉인하고, 비유한 Float32 및 digest 없는
  legacy generation은 신뢰하지 않고 readable canonical Markdown에서 clean rebuild한다. digest가
  유효해도 `folder`·chunk path/text·link가 canonical root label·chunking 결과와 다르면 재생성하고
  검색 반환을 차단한다.
- canonical root 또는 source I/O가 unavailable이면 빈 검색·부분 generation을 성공으로 보고하지
  않으며 confirmed file missing·revision change와 구분한다. legacy/model/dimension clean rebuild는
  기존 durable generation을 전체 scan·embedding·guard 검증 전까지 유지하고 progress/failure save를
  하지 않는다. JSON rename 전후 root/source/deletion guard가 깨지면 이전 JSON bytes로 rollback한다.
- 동일 label binding의 stale writer merge는 load baseline 기준 three-way merge를 사용해 최신 durable
  adopt를 되돌리지 않으며 양쪽 변경 충돌은 fail closed한다. delete/recreate와 same-byte source identity
  ABA는 canonical source와 이전 generation을 보존한다.
- file fsync → no-replace/rename publish → parent-directory fsync 순서를 winner·loser·기존 marker
  observer 모두 지키고 durability 오류를 전파한다.
- embedding·setup·doctor·recover URL의 userinfo/query/fragment는 argv·PTY echo·stderr·MCP content에
  노출하지 않으며 다중 `@` userinfo도 마지막 authority delimiter까지 마스킹한다. C0/DEL control
  character는 parsing·fetch·curl·subprocess·로그 전에 거부한다. 기존 origin도 clone/pull/identity
  비교 전에 검증하고 update는 literal `origin`과 현재 branch ref만 소비한다. recover Git ingress는
  로컬 경로·HTTPS·SSH만 허용하고 remote-helper·unknown scheme·다중 `@` authority를 git/gh 전에 거부한다.
- query-log restore merge는 destination symlink를 따라 외부 파일을 읽거나 교체하지 않는다. watcher close는
  active callback과 open watcher를 drain하되 이미 close event가 발생한 watcher를 다시 기다리지 않는다.
  watcher stderr는 공개-safe label만 사용하고 canonical absolute root나 raw filesystem error를 출력하지 않는다.
- index/marker/vector/lock.guard는 이전 commit에서 추적됐더라도 backup generation에서 제거하고,
  recover 하위 단계 실패는 독립 복원을 계속하되 최종 non-zero와 성공 메시지 억제로 집계한다.

### Phase 3 — 검색 품질 회귀 게이트
- 공개 합성 corpus를 production retrieval 경로로 실행하는 일급 명령이 있다.
- 품질·no-match·출처·지연·manifest가 machine-readable report로 나온다.
- CI가 기준선보다 나쁜 회귀를 차단한다.
- latency는 host variance 때문에 v1에서 비차단 관측값이며, relevance threshold가 없는 현재 no-match FPR은 숨기지 않고 baseline·잔여 위험으로 기록한다.

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

- `main`의 Phase 0·1과 후속 branch의 Phase 2~6이 각각 하나의 독립 `[verified]` 커밋으로
  존재해, 전체 일곱 Phase 경계가 순서대로 추적 가능하다.
- Node 20·22·24 CI, 전체 TypeScript/shell tests, typecheck, build, diff check가 성공한다.
- 독립 보안·로직·동시성 리뷰 blocker가 0이다.
- 모든 GitHub 리뷰·인라인 코멘트·미해결 스레드를 확인하고 유효한 지적을 수정·검증·회신한다.
- Draft PR로 제출하며 사람이 merge한다.

## 중단 조건

특정 Phase가 재현 가능한 결함·측정 기준·독립 fixture를 만들 수 없거나 정본 손실·개인 데이터 노출 위험을 허용해야만 구현 가능한 경우 그 Phase에서 멈추고 범위를 축소한다. 후속 Phase로 건너뛰어 완료로 표시하지 않는다.
