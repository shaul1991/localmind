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

### B4. up.sh 헬스체크 하드닝 (PR #3 CodeRabbit, Minor)
- `scripts/up.sh` 헬스 루프의 `curl`에 `--connect-timeout`/`--max-time` 추가(응답 지연 시 짧게 실패).
- 현재도 `|| echo 000`으로 curl 부재·연결거부엔 무한 대기 안 함 → **Minor 하드닝**(보류 가능).
- 원 코멘트: https://github.com/shaul1991/localmind/pull/3#discussion_r3489038453

---

## C. 보류 — 필요성 뚜렷해지면 도입

> **결정(2026-06-29):** 단일 기본 폴더(`~/.localmind`)로 운영한다. 다중 노트의 필요성이
> 뚜렷해질 때 아래를 도입. 다중 폴더 *플럼빙*은 이미 머지됨(backward-compatible — `NOTES_DIR`
> 쉼표로 opt-in)이라 **도입 시 새 빌드 없이 바로 켤 수 있다. 승격/정리 UX만 보류한다.**

### C1. 인박스→폴더 승격(promotion) — *(보류)*
- 모델: 기본 폴더 = **인박스**, 다른 폴더 = **정착지**. 캡처는 인박스에 쌓이고, 가치 있는 것만 승격.
- 도구(추가 필요): `list_notes(folder?)` · `move_note(path,to_folder)` · `delete_note(path)` MCP + brain 함수
- 흐름(L2): "인박스 정리" → 모델이 노트별 목적지 제안 → 사람 승인 → 이동
- 판단 기준: **소속 / 수명 / 스코프 가치** (셋 다 아니면 인박스에 둠). **이동 권장(복사는 인덱스 중복)**
- 도입 트리거: 인박스가 커지고 "특정 주제만 검색"이 반복될 때

---

> 완료 시: 체크박스를 채우고, 검증 끝난 항목은 [ROADMAP.md](ROADMAP.md) 현재(Phase 0)에 반영.
