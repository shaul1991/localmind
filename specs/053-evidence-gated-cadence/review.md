# Review — Phase 6 closure checklist

## 고정 불변식

1. non-string ID/SHA와 exact schema 밖 raw query/content/path가 event framing 전에 거부된다.
2. bootstrap first, per-goal iteration 1~5, global implementation WIP 1, human authorization gate가 우회되지 않는다.
3. validated/rejected terminal은 validation·lesson·residual-risk를 결속하고 supersede/maintain/revalidate는 append-only다.
4. sequence publish는 no-clobber이고 competing writers가 같은 slot을 둘 다 획득하지 못한다.
5. reader는 501번째 entry에서 중단하고 stored bytes의 canonical equality, 순번, timestamp, exact schema, digest chain, bounded size/count, duplicate key, symlink/hard-link alias를 fail-closed한다.
6. CLI는 event를 stdin으로만 받고 raw ID/content/path를 stdout/stderr에 projection하지 않는다.
7. scheduler, implementation runner, auto-merge가 추가되지 않는다.

## Blocker authority

위 deterministic 불변식 위반, full-suite regression, evidence drift만 blocker다. 전자서명/ACL, hostile root, Windows, detailed artifact storage, long-duration stress와 자동 orchestration은 residual/backlog이다.
