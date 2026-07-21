# evidence — T1.3 배포 무중단 parity (AC-3)

- 기준: deploy-baseline.txt (배포 산출물 49파일 sha256 — globals 2·skills·agents)
- 실행: sdd-toolkit에서 `rules:deploy --no-repo`·`skills:deploy`·`agents:deploy` dogfood
  (실행 전 타깃 백업: scratchpad/deploy-backup/)
- 결과: **49파일 중 47 해시 동일**, 차이 2(`skills/goal-impl/SKILL.md`·`skills/sdd-self-review/
  SKILL.md`)
- 차이 원인 판정(결정적): ① 두 repo의 템플릿 소스 diff 없음(SRC-IDENTICAL) ② toolkit 배포 후
  localmind 자신의 `skills:deploy` 재실행 → 전 항목 "변경 없음" ③ 해시 수렴 확인.
  → **toolkit 배포 산출물 == localmind 배포 산출물.** 차이 2건은 기준 스냅샷이 낡아 있었던 것
  (최근 템플릿 개정 후 재배포 누락 상태를 스냅샷) — toolkit이 오히려 최신 정본으로 수렴시킴.
- 판정: **AC-3 충족** — 배포 파이프라인 무중단 이전 실증. codex 글로벌 타깃은 환경 해석상
  orca codex-runtime-home으로 동일하게 해석됨(추출 전과 같은 해석 로직 — deploy.ts 이전분).
