---
title: Self-review round 4 merged report
audience: both
---

# Self-review round 4

- candidate-id: `d399c9966caa8a6325c4710aac113f3a49dbdb8d`
- round: `4`
- independence: `isolated-context` — 두 reviewer 결과 병합
- blockers: `0`
- approval-needed: `false`
- completion: `complete-clean`

## 5축 판정

- 추적성: FR-1~12와 AC-1~12가 구현·테스트·versioned evidence에 연결됐다.
- 커버리지: 정상/손상/exact-five, no-path, malicious, bundle-root/file symlink, lifecycle, critic recheck를
  검증했다.
- 정확성: read-only validator의 ID·참조·상태 검증과 managed/unmanaged 수렴이 정확하다.
- 단순성/보안: root symlink 수정은 validator 2줄과 계약·회귀 테스트로 국소적이며 report-only/docs-only
  경계를 유지한다.
- 사실 정확성: Android는 `contested`, 계정 entitlement는 `unverified`이며 mutable 표본을 공식 문서로
  재확인했다.

## 독립 재현 결과

- 전체 테스트: `959/959` pass.
- focused: reviewer별 `20/20` pass와 관련 계약 test green.
- build: exit 0.
- base 대비 `git diff --check`: exit 0.
- Innerview pack: `sources=24 evidence=24 claims=15 coverage=14/15`.
- malicious pack: `sources=1 evidence=1 claims=1 coverage=1/1`.
- bundle-root symlink와 개별 file symlink: 각각 exit 1.
- no-path: write/open 0, before/after clean hash 동일.
- reviewer 파일 변경: 0건.

## Non-blocking advisories

- 부모 구성요소 lstat/realpath/TOCTOU 방어는 쓰기 workflow 계약 소유다. validator까지 기계 강제하려면
  별도 path-preflight helper나 `--project-root` 계약을 후속 SDD로 검토할 수 있다.
- critic provenance에 executor/run ID와 시각을 추가하면 장기 감사성이 높아진다.
- 존재하지 않는 leaf 경로의 안전한 생성 순서를 문서에서 더 결정적으로 명문화할 수 있다.
