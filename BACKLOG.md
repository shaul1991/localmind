# BACKLOG

**코드는 완료했지만 라이브 스택(docker)이 없어 end-to-end로 검증하지 못한 항목**과
**아직 진행하지 않은 다음 작업**을 모아 둔다. 추후 작업 시 각 항목의 "검증/완료 기준"을
따라 확인하고 체크박스를 채운다.

> 검증 전제: `make up`으로 스택(게이트웨이 :4000 / 채팅 :8787 / 메모리 :8767)이 떠 있어야 한다.
> 일괄 점검: `make health` · `make smoke`.

---

## A. 검증 필요 — 구현 완료, 라이브 스택에서 확인

### A1. 다중 노트 폴더 (folder 스코프) — 커밋 `be19bd0`
- [ ] 두 폴더 지정 `NOTES_DIR="work=/tmp/w,life=/tmp/l"`, 각 폴더에 `.md` 1개씩
- [ ] `make up` 후 `search_notes`(folder 미지정) → 두 폴더 결과 섞임, 출처가 `라벨/파일`
- [ ] `search_notes`/`ask_brain`에 `folder:"work"` → work 노트만
- [ ] `capture_note` `folder:"life"` → life 폴더에 `.md` 생성
- [ ] `whoami` → 폴더 목록(라벨:경로) 표시
- 참고: 기존 v1 인덱스(`.brain-index.json`)는 v2로 자동 1회 재인덱싱(시간 소요 가능)

### A2. 백업 자동화 (`make backup`) — 커밋 `be19bd0`
- [ ] `~/.localmind`(기본 BACKUP_DIR) git init + **private** remote 설정
- [ ] `make backup` → `memory.md` export + 커밋 + push 성공
- [ ] 변경 없이 재실행 → "변경 없음 — 커밋 생략"(멱등)
- [ ] `make backup-cron` 출력 한 줄 crontab 등록 → 다음 주기 로그 확인
- ⚠️ 백업 repo는 Private. `.env`는 `.gitignore`라 안 올라가는지 확인

### A3. 새 기기 복구 (`make recover` / `restore`) — 커밋 `41fcbf2`
- [ ] private repo로 `make restore RESTORE_REPO=<url>` → clone + memory-import + reindex
- [ ] memory-import 멱등(재실행 시 "기존 스킵")
- [ ] 깨끗한 환경에서 `make recover RESTORE_REPO=<url>` 전 과정(설치→기동→헬스대기→복원)
- [ ] 복구 후 `make smoke` 통과 + 노트/기억 동일

### A4. reindex 실데이터 — 커밋 `41fcbf2`
- [ ] 노트 있는 폴더로 `make reindex` → 파일/청크 수 출력, 임베딩 :4000 호출 성공
- (현재 빈 폴더 0건만 확인 — 실제 임베딩 경로 미검증)

### A5. 개인 전용 전환(원격 제거 + 루프백) — 커밋 `46d0f1a`
- [ ] `make up` 정상 + `make smoke`(API/MCP/brain) 통과 — `mcp-http` 제거 후 회귀 없음
- [ ] 포트가 `127.0.0.1`에만 바인딩: 같은 머신 `curl localhost:8787` OK,
      다른 기기/LAN IP로는 접근 불가 확인
- [ ] Cursor / Claude Desktop stdio MCP 정상 동작

### A6. 시크릿 헬퍼 — 커밋 `8f99187`
- [ ] `make secrets`의 구독 인증 점검이 실제 `~/.claude`·`~/.codex` 유무를 정확히 반영
- (로컬 파싱·토큰 발급은 확인됨)

---

## B. 진행 백로그 — 미구현 (다음 로드맵)

### B1. 시크릿 보관 강화
- `make token`에 `.env` 직접 기록(`--write`) 옵션
- OS 키체인(macOS Keychain / libsecret) 연동 — 평문 `.env` 탈피(선택)

### B2. 인덱싱 성능
- GPU/전용 임베딩 서버(TEI/Infinity)로 `EMBEDDINGS_URL` 교체 가이드/프로파일

### B3. 운영 편의
- `make secrets`에 엔드포인트/모델 상태 통합 점검
- 메모리/노트 용량·통계 한눈에 보기

---

> 완료 시: 체크박스를 채우고, 검증 끝난 항목은 [ROADMAP.md](ROADMAP.md) 현재(Phase 0)에 반영.
