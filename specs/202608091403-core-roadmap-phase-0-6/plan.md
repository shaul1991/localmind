# Plan — LocalMind 코어 중장기 개선 Phase 0~6

## 구현 순서

1. **Phase 0:** `docs/core-roadmap.md`와 canonical spec 5종으로 북극성 여정·범위·게이트를 고정한다.
2. **Phase 1:** setup readiness → capture destination → durable capture status → embedding integrity를 수직 TDD로 구현한다.
3. **Phase 2:** 색인 복구 검증 → clean-room recover → canonical brain parity를 수직 TDD로 구현한다.
4. **Phase 3:** 공개 fixture runner → metrics/manifest → CI gate를 수직 TDD로 구현한다.
5. **Phase 4:** brief precision → supersession → stale-on-contact와 scope isolation을 수직 TDD로 구현한다.
6. **Phase 5:** 지원 행렬·self-host 보안 문서와 운영 fault fixture를 구현한다.
7. **Phase 6:** append-only lifecycle과 privacy-preserving evidence/cadence 계약을 구현한다.
8. 각 Phase diff를 독립 spec/품질/보안/동시성 관점에서 검토하고 blocker를 해당 Phase
   `[verified]` 커밋 전에 닫는다.
9. Phase 0·1은 선행 PR로 병합하고, Phase 2~6의 정확히 5개 `[verified]` 커밋은 후속
   feature branch에 누적해 한국어 Draft PR로 제출한다.
10. 각 PR full SHA의 CI와 GitHub 모든 리뷰 표면을 확인하고 사람의 명시적 승인으로만 merge한다.

## 공통 TDD

각 동작은 `RED → 기대 실패 확인 → 최소 GREEN → 관련 suite → 전체 suite` 순서를 지킨다. persistence·transport·backup 경계는 임시 HOME/NOTES_DIR/QUERY_LOG와 합성 데이터로 격리한다.

## 공통 검증

```bash
npm ci
npm run typecheck
npm test
npm run build
for t in scripts/*.test.sh; do bash "$t" || exit 1; done
git diff --check
```

실제 외부 계정·개인 노트·운영 홈서버는 테스트에 사용하지 않는다.
