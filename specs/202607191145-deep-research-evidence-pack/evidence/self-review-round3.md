---
title: Self-review round 3 merged report
audience: both
---

# Self-review round 3

- candidate-id: `7b5fb8ba6cc7da48bb1d6ea846d5949ed7b3befe`
- round: `3`
- independence: `isolated-context` — 두 reviewer 결과 병합
- blockers: `1`
- approval-needed: `true`

## Blocker

AC-8/FR-7: 개별 pack 파일 symlink는 거부했지만 bundle root directory symlink는 validator가 따라가
exit 0을 반환했다. 프로젝트 내부처럼 보이는 경로가 외부/HOME을 가리키면 외부 쓰기를 유효하다고
오인할 수 있었다.

재현: exact-five valid pack을 가리키는 directory symlink를 validator에 전달하면
`valid: sources=2 evidence=2 claims=2 coverage=2/2`가 반환됐다.

## Resolution

- bundle root directory symlink 회귀 테스트와 경로 계약 테스트를 먼저 추가해 `92/94` RED를 확인했다.
- validator가 bundle root symlink를 non-zero로 거부하게 했다.
- 프로젝트 root부터 출력 경로까지 구성요소 lstat, symlink 거부, realpath containment를 workflow 계약에
  명시했다.
- focused contract test `94/94`와 whitespace 검사를 green으로 만들었다.

Round 3 blocker 뒤 사용자의 fresh round 승인을 받고 round 4를 실행한다.
