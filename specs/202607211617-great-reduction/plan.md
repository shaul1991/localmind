---
audience: both
---

# plan — great-reduction

## 도메인 경계
- **코어(잔존)**: 노트 capture·검색·색인(임베딩 경로)·기기 식별·백업/동기화·query 측정·상태 관측.
- **메타(추출)**: SDD 스킬·페르소나·rules·retro(self-review 집계)·critic 인프라 → sdd-toolkit.
- **소멸**: 게이트웨이 서버 서브시스템·openmemory 클라이언트·미사용 도구 표면.
경계의 정본: inventory.md(파일 단위) + coupling.md(절단선 34개). 두 문서가 tasks의 지도다.

## 영향 모듈
src/(44 Extract·부분 절단 다수)·scripts/(11 Extract·8 Remove)·templates/ 전부·docs/ 5 Extract·
Makefile·package.json·docker-compose*·.github/workflows/ci.yml·README. 신규: `~/personal/
shaul1991/sdd-toolkit`(repo 초기화·이전 파일·자체 스위트·자체 README/Makefile).

## 단계 (tasks.md가 phase로 구체화)
1. **P0 안전망**: openmemory 데이터 회수(FR-5 — 제거 전 선행 필수), 현행 배포 산출물 스냅샷
   (AC-3 비교 기준: `~/.claude/localmind-rules.md` 등 해시).
2. **P1 추출**: sdd-toolkit repo 생성(git init) → Extract 목록 복사 + 최소 하네스(package.json·
   tsconfig·vitest·Makefile: deploy 계열 타깃) → sdd-toolkit 스위트 green + 배포 dogfood(AC-3).
3. **P2 절제**: localmind에서 Extract·Remove 삭제, 부분 절단(mcp-server 도구 14개·brain의
   suggestTags/게이트웨이 절·ui-status 메타 import·update.sh 메타 호출·Makefile·package.json·
   docker·CI) — coupling.md 절단선 순서대로.
4. **P3 정합**: 문서 개정(README·docs 12)·AC-2/AC-5 결정적 검증 스크립트 실행·전 스위트 green.
5. **P4 도그푸드·검증**: 재빌드 stdio 실호출(AC-6)·검증 matrix 채움.
6. **P5 self-review**: preflight → 격리 렌즈 critic → clean → commit·push·PR.

P1과 P2는 순차(추출 확인 후 절제 — 데이터 안전). P2 내부는 워커 병렬 가능(파일 겹침 없는
절단선끼리). P3 문서는 P2와 부분 병렬.

## 테스트 전략
- AC-1·4: 기존 스위트 개정(단위·통합) — 도구 목록 단언, Extract 테스트 이동 후 양쪽 green.
- AC-2·5: 결정적 검증 스크립트(grep·목록 대조) — 재실행 가능, evidence에 출력 보존.
- AC-3·6·7: 도그푸드(실행 관찰) — evidence 파일로 기록.
- AC-8: critic 렌즈 판정(diff 유형 검토).
- DB/외부 엔진 무관(파일시스템만) — 엔진 패리티 해당 없음.

## verification matrix

| AC | 검증 방법 | evidence | 종료 조건 |
|---|---|---|---|
| AC-1 | mcp-server.test 도구 목록 단언 | 스위트 출력 | green |
| AC-2 | grep 검증 스크립트 | evidence/grep-check.txt | 매치 0 |
| AC-3 | 배포 전후 산출물 diff | evidence/deploy-parity.md | 동등 확인 |
| AC-4 | 양 repo `npm test` | evidence/suites.md | 둘 다 green |
| AC-5 | inventory 대조 스크립트 | evidence/tree-check.txt | 잔재 0·Keep 전존 |
| AC-6 | stdio 실호출 로그 | evidence/dogfood.md | 3도구 정상+로그 증가 |
| AC-7 | 회수 로그 | evidence/memory-recovery.md | export==회수(또는 0) |
| AC-8 | critic diff 유형 검토 | merged report | 개입 지점 0 |
