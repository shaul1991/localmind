# Plan — Phase 4 brief/decision lifecycle

1. **RED:** resolver export, supersedes roundtrip, scope boundary가 없어 unit/MCP test가 실패한다.
2. **GREEN:** optional schema·canonical path validator·same-folder capture gate를 추가한다.
3. **GREEN:** hit-local resolver를 brief/search stale path에 연결한다.
4. **RED→GREEN:** cycle participant의 제3자 outgoing edge와 과거→미래 edge가 결정을 숨기는 반례를 추가해 fail-safe한다.
5. **RED→GREEN:** structured choice/fact와 legacy title newline이 brief heading·stale marker를 위조하는 반례를 bounded single-line projection으로 닫는다.
6. 기존 decision/MCP suite → 전체 Node → typecheck/build → shell/Bash/diff gate를 실행한다.
7. docs-inclusive frozen candidate를 범위 제한 독립 검토한 뒤 정확히 하나의 Phase 4 `[verified]` commit으로 닫는다.
