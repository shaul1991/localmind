# Plan — Phase 5

1. CI matrix·permission·timeout·gate order를 요구하는 contract test를 먼저 추가해 Linux-only workflow에서 RED를 확인한다.
2. workflow를 Ubuntu/macOS × Node 20/22/24로 최소 수정해 GREEN을 만든다.
3. transport parity와 safe-deploy/clean-recover targeted suites를 실행한다.
4. support matrix 문서와 상위 roadmap을 실제 범위·증거 한계에 맞춘다.
5. 전체 frozen gate, independent review, no-drift 뒤 하나의 `[verified]` commit으로 닫는다.
