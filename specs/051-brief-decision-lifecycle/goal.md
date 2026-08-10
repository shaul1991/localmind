# Goal — brief와 decision lifecycle v1

## 결론

Phase 4는 기존 living-memory를 대체하지 않는다. brief가 활성 결정의 선택·이유·전제·마지막 검증 시점을 정확히 보여주고, 같은 notes folder 안의 명시적 대체 관계와 stale-on-contact를 안전하게 적용하는 작은 lifecycle 단위를 완성한다.

## 사용자 가치

- 새 결정이 이전 결정을 대체했는데 brief가 둘 다 현재 결정처럼 보이는 혼동을 줄인다.
- 오래된 전제 알림은 대체된 결정이 아니라 현재 활성 결정에만 붙는다.
- 여러 프로젝트/folder가 연결된 설치에서 다른 범위의 결정이 자동 brief에 섞이지 않는다.

## 범위

- optional `supersedes: [folder/relative-note.md]` 결정 frontmatter
- 동일 folder·현재 관련 hit 안의 chain supersession
- cycle/cross-folder/missing reference fail-safe
- 다중 notes root brief의 explicit folder requirement
- assumption별 `last_verified` 표시
- 기존 단일 root, 일반 capture, legacy decision fallback 보존

## 범위 밖

- 전체 vault를 매번 스캔하는 global lifecycle registry
- 검색 hit 밖 superseder의 자동 발견
- project ID 또는 ACL 신설
- 이전 Markdown 자동 수정·삭제
- append-only lifecycle audit history(Phase 6)
