# evidence — T0.1 openmemory 데이터 회수 (AC-7)

- 일시: 2026-07-21 (great-reduction Phase 0)
- 서비스: openmemory `http://localhost:8767` — **기동 중** (`/api/v1/memories/` 정상 응답)
- export 방법: `npx tsx scripts/memory-export.ts <scratchpad>/memory-export.md` (user_id `localmind`)
- **export 건수: 13** (스크립트 출력 "내보냄: 13개 메모리")
- 회수 노트: `~/personal/shaul-brain/second-brain-private/inbox/2026-07-21-openmemory-recovery.md`
  — 1파일 통합, frontmatter 포함, **13건 전량 수록**
- 대조: export 13 == 회수 노트 항목 13 → **AC-7 충족** (데이터 손실 0)
- 내용 성격: localmind 초기 도그푸드 기록(6건)·@ttsc/graph 참고(3건)·pkpk spec-first 규칙(3건)·기기 잡정보(1건)
- 판정: openmemory 코드 제거(Phase 2) 진행 가능. 서비스 자체의 중지/제거는 이 슬라이스 범위 밖
  (사용자 로컬 서비스 — 보고에 부기).
