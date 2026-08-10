# Review — Phase 4 brief/decision lifecycle

## 동결 범위

optional same-folder supersedes, hit-local active resolution, active-only stale signal, multi-root brief folder isolation, legacy compatibility만 평가한다. global registry, project ACL, 자동 note mutation, append-only audit는 후속 범위다.

## RED→GREEN

- resolver와 MCP lifecycle/scope 기능 부재: RED → targeted GREEN
- supersedes 저장 누락: RED → YAML roundtrip GREEN
- multi-root folderless brief가 양쪽 결정을 섞음: RED → search 전 fail-closed GREEN
- superseded stale 결정이 signal 생성: RED → active-only GREEN
- cycle participant의 제3자 edge가 다른 결정을 숨김: RED → cycle outgoing 전체 무효화 GREEN
- 오래된 source가 더 새로운 target을 숨김: RED → capture date ordering으로 GREEN
- structured choice/fact와 legacy title newline이 brief block·stale marker를 위조함: RED → bounded single-line projection GREEN

## 잔여 위험

- superseder가 현재 top hit에 없으면 이전 결정은 자동으로 숨겨지지 않는다. v1은 전 vault scan보다 fail-safe 중복을 선택한다.
- hand-edited missing/cross-scope/cycle metadata는 원문을 자동 수정하지 않고 무시한다.
- project identity와 append-only supersession audit는 Phase 6에서 별도로 다룬다.

## 최종 gate

최신 docs-inclusive candidate의 전체 gate와 독립 검토 후 기록한다.
