# BACKLOG

> ⚠️ **great-reduction(2026-07-21) 이전에 작성된 백로그입니다.** 게이트웨이·메모리 서비스·페르소나/스킬(메타) 관련 항목은 제거·분리(sdd-toolkit)로 무효화됐을 수 있습니다 — 유효성은 [product-vision](docs/product-vision.md)·[rebuild-plan](docs/rebuild-plan.md) 기준으로 재판정하세요.

**코드는 완료했지만 라이브 스택(docker)이 없어 end-to-end로 검증하지 못한 항목**과
**아직 진행하지 않은 다음 작업**을 모아 둔다. 추후 작업 시 각 항목의 "검증/완료 기준"을
따라 확인하고 체크박스를 채운다.

> 검증 전제: `make up`으로 스택(게이트웨이 :4000 / 채팅 :8787 / 메모리 :8767)이 떠 있어야 한다.
> 일괄 점검: `make health` · `make smoke`.

---

## A. 검증 필요 — 구현 완료, 라이브 스택에서 확인

> **라이브 검증 결과 (2026-06-29, codex 백엔드 / 가동 중 스택):**
> - **A1 ✅** 다중 폴더·`folder` 스코프(전체/work/life)·capture(folder)·`label/파일` 출처 — 실데이터 통과
> - **A2 ✅** `make backup`: memory-export(6건)+커밋+`.gitignore`(.brain-index.json)+멱등
> - **A3 ✅(구성요소)** `make restore`: 로컬 pull + **memory-import 멱등(추가0/스킵6)** + reindex. *full `make recover` 래퍼는 가동 스택 재생성 부담으로 미실행*
> - **A4 ✅** `reindex` 실데이터(3파일/3청크, 실임베딩 bge-m3)
> - **A5 ✅** 스모크 회귀 없음 · 원격 제거(도구 7개·mcp-http 없음) · **루프백 적용**(`make up` 재생성 후 `127.0.0.1`만 바인딩, LAN IP `192.168.0.26:8787`→차단·localhost 200 확인)
> - **A6 ✅** `make secrets` 인증 점검 정확(claude ✗/codex ✓)·`make token` 발급
> - **#7(보너스) ✅** 루트 `memory.md`(백업덤프) 제외 / 하위 폴더 `memory.md` 노트 포함 — 실데이터 확인

### A1. 다중 노트 폴더 (folder 스코프) — 커밋 `be19bd0`
- [x] 두 폴더 지정 `NOTES_DIR="work=/tmp/w,life=/tmp/l"`, 각 폴더에 `.md` 1개씩
- [x] `make up` 후 `search_notes`(folder 미지정) → 두 폴더 결과 섞임, 출처가 `라벨/파일`
- [x] `search_notes`/`ask_brain`에 `folder:"work"` → work 노트만
- [x] `capture_note` `folder:"life"` → life 폴더에 `.md` 생성
- [ ] `whoami` → 폴더 목록(라벨:경로) 표시 *(2026-06-29 검증 노트에 미기재 — 잔여)*
- 참고: 기존 v1 인덱스(`.brain-index.json`)는 v2로 자동 1회 재인덱싱(시간 소요 가능)

### A2. 백업 자동화 (`make backup`) — 커밋 `be19bd0`
- [ ] `~/.localmind`(기본 BACKUP_DIR) git init + **private** remote 설정 *(remote/private 여부는 검증 노트에 미기재 — 잔여)*
- [ ] `make backup` → `memory.md` export + 커밋 + push 성공 *(export·커밋은 확인, push는 미기재 — 잔여)*
- [x] 변경 없이 재실행 → "변경 없음 — 커밋 생략"(멱등)
- [ ] `make backup-cron` 출력 한 줄 crontab 등록 → 다음 주기 로그 확인
- ⚠️ 백업 repo는 Private. `.env`는 `.gitignore`라 안 올라가는지 확인

### A3. 새 기기 복구 (`make recover` / `restore`) — 커밋 `41fcbf2`
- [x] private repo로 `make restore RESTORE_REPO=<url>` → clone + memory-import + reindex *(로컬 pull 기준 구성요소 확인)*
- [x] memory-import 멱등(재실행 시 "기존 스킵") *(추가0/스킵6 확인)*
- [ ] 깨끗한 환경에서 `make recover RESTORE_REPO=<url>` 전 과정(설치→기동→헬스대기→복원)
- [ ] 복구 후 `make smoke` 통과 + 노트/기억 동일

### A4. reindex 실데이터 — 커밋 `41fcbf2`
- [x] 노트 있는 폴더로 `make reindex` → 파일/청크 수 출력, 임베딩 :4000 호출 성공 *(2026-06-29 실데이터 3파일/3청크·실임베딩 확인)*

### A5. 개인 전용 전환(원격 제거 + 루프백) — 커밋 `46d0f1a`
- [x] `make up` 정상 + `make smoke`(API/MCP/brain) 통과 — `mcp-http` 제거 후 회귀 없음
- [x] 포트가 `127.0.0.1`에만 바인딩: 같은 머신 `curl localhost:8787` OK,
      다른 기기/LAN IP로는 접근 불가 확인
- [ ] Cursor / Claude Desktop stdio MCP 정상 동작 *(2026-06-29 검증 노트에 미기재 — 잔여)*

### A6. 시크릿 헬퍼 — 커밋 `8f99187`
- [x] `make secrets`의 구독 인증 점검이 실제 `~/.claude`·`~/.codex` 유무를 정확히 반영 *(claude ✗/codex ✓ 교차 확인)*
- (로컬 파싱·토큰 발급은 확인됨)

### A7. 개인 설정 파일 백업/복원(`BACKUP_EXTRA_FILES`) — specs/006-config-backup-sync
> 순수 로직(경로 검증·상대경로 미러링·충돌 보존)은 `scripts/backup-extras.test.sh`·
> `scripts/restore-extras.test.sh`로 자동 검증됨(임시 디렉토리, 라이브 스택 불필요).
> 아래는 실제 `make backup`/`make restore` 전체 흐름(git commit/push/pull 포함) 확인.
- [ ] `make backup BACKUP_EXTRA_FILES="~/.claude/CLAUDE.md"` → 백업 repo의 `extras/.claude/CLAUDE.md`로 커밋·푸시됨
- [ ] 다른 기기(또는 다른 `HOME`)에서 `make restore` → `~/.claude/CLAUDE.md`로 정상 복원
- [ ] 복원 대상에 이미 다른 내용의 파일이 있을 때 `.bak-<타임스탬프>` 보존 확인
- [ ] `BACKUP_EXTRA_FILES` 미지정 시 기존 `make backup`/`make restore` 동작에 회귀 없음

### A8. 공급망 고정 라이브 검증 — specs/010-supply-chain-pinning
> 정적 회귀 가드(가변 태그 0건·고정 지점 존재)는 `scripts/pinning.test.sh`로 자동 검증됨.
> 아래 AC-2·AC-3은 실제 재빌드가 필요해 라이브(호스트+네트워크)에서 확인한다.
> ✅ **라이브 검증 완료 (2026-07-02, 호스트):** 클린 빌드 44.1s 성공 · make up/health/smoke
> (smoke·smoke:mcp·smoke:brain) 전부 통과 · 컨테이너 CLI 버전 = 고정값 일치. 회귀 없음.
- [x] `docker compose build --no-cache` 성공(node:24.18.0-slim 존재, `@openai/codex@0.142.4`
      존재, `install.sh | bash -s -- 2.1.196`이 지정 버전 설치) — **AC-3** ✅
- [x] `make up` → `make health` → `make smoke` 회귀 없이 통과 — **AC-2** ✅
- [x] 컨테이너 내 `claude --version`=2.1.196 · `codex --version`=0.142.4 · `node`=v24.18.0 확인 — **AC-3** ✅
- [ ] (선택) ollama digest를 `ollama/ollama:0.30.11` 태그로 교체(호스트에서 태그 존재 확인 시 — spec 1차 선호 형태)

### A9. 노트 저장소 연결 라이브 검증 — specs/012-notes-repo-connect
> 순수 로직(파싱·URL/라벨 검증·clone/pull·조립·마스킹·비실행 .env 읽기·FR-17)은
> `scripts/notes-connect.test.sh`(25)·`scripts/read-env.test.sh`(9)로 자동 검증됨(로컬 bare repo, 네트워크 불필요).
> ✅ **부분 라이브 (2026-07-02, 격리 환경):** 실제 `make notes-connect` 진입점 end-to-end 확인 —
> 로컬 bare repo 2개 clone + NOTES_DIR 조립 + 등록 핸드오프 정상, 실제 ~/.claude.json 무손상.
> 아래는 SSH 키·claude 인증이 필요해 사용자 터미널에서 확인(실제 GitHub repo + 실제 claude mcp 등록·setup 흐름).
- [ ] 실제 `NOTES_REPOS="라벨=git@github.com:..."`로 `make notes-connect` → clone + `claude mcp list`에 다폴더 등록 확인
- [ ] 이미 등록된 상태에서 `NOTES_REPOS` 추가 후 `make setup` → 이미 등록됐어도 notes-connect 재연결 제안됨 (AC-20)
- [ ] `NOTES_REPOS` 미설정(빈 값) `make setup` → 기존 단일 폴더 mcp-install 경로 유지, 회귀 없음 (AC-21)
- [ ] 인증 미설정으로 전 저장소 clone 실패 시 → 기본 폴더 등록 폴백 제안 확인 (AC-22)
- [ ] `.env`에 토큰-in-URL 넣고 `make setup`/`notes-connect` → stdout/stderr에 토큰 평문 없음 (AC-23, 실환경 재확인)

### A10. 세션·색인 정확성 라이브 검증 — specs/013-session-index-accuracy
> 순수 로직(prefix 검증·tools 서명·빈 id 방어·chunk 분할·인덱스 메타·락/병합·delete 제한·
> capture 충돌)은 `npm test`(session/brain 단위 + 자식 프로세스 격리)로 자동 검증됨.
> ✅ **라이브 검증 (2026-07-03, 재빌드 스택·실 임베딩):** AC-1(같은 user 두 대화 —
> 암호명 누출 없음)·AC-4(tools 후행 추가 → tool_calls 정상)·AC-5(5,000자 문단 꼬리
> 검색 confirmed) 통과.
- [x] 같은 `user` 값으로 서로 다른 두 대화를 보내 맥락 혼입이 없는지 (AC-1 라이브)
- [x] 첫 턴 tools 없이 → 둘째 턴 tools 추가 시 `tool_calls` 정상 생성 (AC-4 라이브)
- [x] 빈 줄 없는 5,000자 문단 캡처 후 꼬리 문구가 `search_notes`로 검색됨 (AC-5, 실 임베딩)
- [ ] `EMBEDDINGS_MODEL` 교체 후 검색 → 자동 재색인 + 정상 검색 (AC-7, 실 임베딩 — 게이트웨이 라우팅 구성 필요라 잔여)
- [ ] Claude Code + Cursor 동시 접속 상태에서 양쪽 캡처 → 양쪽 검색 (AC-11 라이브 — 사용자 터미널 필요)
- 참고: INDEX_VERSION 3→4 bump — 첫 실행 시 기존 노트 전체 1회 재색인(CPU 임베딩이면 수 분, stderr 안내 있음)
- 잔여(낮음, self-review 결함 6): 임베딩 차원 불일치로 인덱스 reset 직후 이미 진행 중이던
  색인 실행에 합류하면 낡은 인덱스가 한 번 되살아날 수 있음 — 다음 검색에서 다시 reset되어
  수렴하나, 모델 스왑 이벤트가 잦으면 재임베딩 반복. 필요 시 in-flight 무효화 도입.

### A11. 공급망·노출면 완결 라이브 검증 — specs/014-supply-chain-port-hardening
> 정적 가드(openmemory 고정·negative 자기검증·sk-local 폴백 부재)는 `pinning.test.sh`,
> 키 생성·배선은 `master-key.test.sh`로 자동 검증됨.
> ✅ **라이브 검증 (2026-07-03):** 고정 커밋(cd79fa89) fetch·checkout·patch 적용 빌드 성공 +
> CI 동일 빌드 green(재현성 이중 확인) · Host 가드·키 거부·sk-local 무파손 전부 통과.
- [x] 고정 빌드 — 빌드 로그에서 MEM0_COMMIT fetch·checkout + patch.py 전 섹션 적용 확인, CI에서도 동일 커밋 빌드 green(재현성) — **AC-1**
- [x] push 후 CI docker job에서 openmemory 이미지 빌드 green — **AC-3** (run `a19ba9c` success)
- [x] 재기동 후 `Host: evil.example.com` → :8767 **403** · `Host: localhost` → 200 (:8787 evil도 403 — 011 회귀 확인) — **AC-4**
- [x] `make up` → `make smoke`(API·MCP·brain 전부) 회귀 없음 — **AC-5**
- [x] 잘못된 키 `:4000/v1/embeddings` → **400 거부**(litellm 비마스터키 거부 응답) · 정키(sk-local)는 200 — **AC-8**
- [x] 기존 `.env`(sk-local)로 `make up` 정상 + `make secrets`에 "예전 기본값 — 갱신 권장" 표시 — **AC-9**
- 참고: openmemory Host 검증 예외 없음(헬스 폴링은 `127.0.0.1` Host라 기본 목록으로 충분).
  특수 구성은 `OPENMEMORY_ALLOWED_HOSTS`(추가 방식, `*`=끔).

### A12. 백업·복구 신뢰성 라이브 검증 — specs/015-backup-reliability
> 순수 로직(부분 실패·push 안내·purge 가드·MCP 원자성·cron 변수·배선)은
> `backup/purge/mcp-install/backup-cron/reliability-wiring.test.sh`(44+)로 자동 검증됨.
> ✅ **라이브 검증 (2026-07-03, 실 백업 repo):** 스택 OFF 백업 → 노트 커밋·push +
> "부분 완료 — 메모리" 요약 + 비0 종료 · 스택 ON 백업 → 전체 성공 0 종료 · `make up`
> 대기가 채팅 :8787 포함 3포트 확인 후 "준비 완료"(2회 확인).
- [x] 스택 끈 채 `make backup` → 노트 커밋·push + "부분 완료" 요약 + 비0 종료 (AC-1 라이브)
- [x] 스택 켠 채 `make backup` → 메모리+노트 정상, 0 종료 (AC-2 라이브)
- [x] `make up` 첫 대기가 :8787 포함 3포트 확인 후 "준비 완료" (AC-12 라이브)
- [ ] 실기기 `make recover` 전 과정에서 extras 복원 확인 (AC-4 라이브 — A3·A7 잔여와 함께, 새 기기 필요)
- [ ] `make backup-cron`(커스텀 BACKUP_DIR) 실제 등록 → 다음 주기 로그에 변수 반영 확인 (AC-10 라이브 — crontab 등록은 사용자 결정)

### A13. 실패 질의 분석 라이브 검증 — specs/004-failure-query-analysis
> 순수 로직(기록·fire-and-forget·리포트·--clean)은 단위(임베딩 스텁 프로브 3) +
> `query-report.test.sh`(12)로 자동 검증됨. 아래는 실사용 데이터가 쌓인 뒤 확인.
- [x] 실사용(smoke의 search/ask/capture) 후 `~/.localmind/query-log.jsonl`에 레코드 축적 확인 (2026-07-03, 4건)
- [ ] 20건 이상 쌓인 뒤 `make query-report` → 성공률·실패 키워드·노트 갭·제안이 실데이터로 유의미한지
- [x] `make backup` 실행 후 백업 repo 커밋에 query-log.jsonl 미포함 확인(.gitignore 시드 동작, 2026-07-03)
- 참고: 리포트 제안이 유의미해지려면 수 주 사용 필요 — goal의 "데이터가 쌓여야 가치" 전제.

---

## B. 진행 백로그 — 미구현 (다음 로드맵)

### B1. 시크릿 보관 강화
- `make token`에 `.env` 직접 기록(`--write`) 옵션
- OS 키체인(macOS Keychain / libsecret) 연동 — 평문 `.env` 탈피(선택)

### B2. 인덱싱 성능 — 디바이스별 임베딩 백엔드
**배경:** 임베딩(노트 색인)이 색인 속도를 좌우한다. 현재 **어느 기기든 Docker Ollama=CPU**로
고정(청크당 약 1~4s). 최적 백엔드는 기기마다 다르다:
- macOS(Apple Silicon): 호스트 네이티브 Ollama → **Metal GPU** (macOS Docker는 Apple GPU 접근 불가)
- Linux + NVIDIA: Docker에 GPU 지정 → CUDA
- 그 외: CPU

**1단계 — 진단 (완료):** `make doctor`(`scripts/doctor.sh`)가 OS/칩/GPU/호스트 Ollama/현재
라우팅을 감지해 *현재·잠재력·권장*을 출력. 읽기 전용. → 세 분기(Linux CPU·macOS Metal·Linux CUDA) 출력 검증 완료.

**2단계 — 자동 전환 (구현됨 · 실기기 실효 검증만 잔여):** `make embed [BACKEND=auto|host|gpu|cpu]` (`scripts/embed.sh`)
- 구현: litellm `api_base` → `os.environ/OLLAMA_API_BASE` + override 파일로 분기.
  - `host`: `docker-compose.host.yml` — litellm을 `host.docker.internal:11434`로 + `extra_hosts: host.docker.internal:host-gateway`(Linux 호환). **호스트 네이티브 Ollama 전제**(미가동 시 안내 후 중단). Docker ollama 컨테이너는 idle로 둠(완전 제외는 후순위).
  - `gpu`: `docker-compose.gpu.yml` — ollama에 nvidia device reservation + `OLLAMA_NUM_PARALLEL=4`. toolkit 전제, GPU 미감지 시 cpu 폴백.
  - `cpu`/`auto`: 기본. `auto`는 doctor와 같은 감지(macOS arm64→host · Linux+NVIDIA→gpu · 그 외 cpu).
- 검증(2026-06-30, 이 환경 Linux/CPU):
  - [x] override 병합 정합성 — host(`host.docker.internal`+`host-gateway`) / gpu(nvidia+`NUM_PARALLEL=4`), `docker compose config`
  - [x] 분기 — auto→cpu · gpu(미감지)→cpu 폴백 · host(미가동)→안내·중단, DRY_RUN
  - [x] **`os.environ/OLLAMA_API_BASE` 치환 실동작 + 기본 라우팅 회귀 없음** — litellm 재기동 후 임베딩 `dims=1024` 정상
  - [x] 맥북: `make embed BACKEND=host` 적용(2026-07-03) → 실 vault 1,079파일/8,277청크
        재색인 **~15분**(Docker CPU 추정 수 시간 대비) · `make doctor` "✓ 최적 구성" 확인 ·
        `.env` `OLLAMA_API_BASE=host.docker.internal` 영속
  - [ ] Linux+GPU(잔여): toolkit 설치 후 `make embed BACKEND=gpu` → `nvidia-smi`에 ollama 프로세스 · 속도↑
- 영속화(구현됨): `make embed`가 선택을 `.env`의 `OLLAMA_API_BASE`에 기록 → 다음 `make up`도 유지(맥 host는 `host.docker.internal` 기본 해석이라 한 줄로 영속). 온보딩은 `make setup`(점검→진단→embed→연결 점검 체크리스트).
- 후속(잔여): ① host 모드에서 idle ollama 컨테이너까지 제외(profile 분리 — depends_on/STACK 회귀 주의) ② gpu 영속 — `make up` 재기동 시 GPU override 자동 적용(현재 `.env`는 `OLLAMA_API_BASE`만 영속, `deploy`는 미영속)

**부수 — 인덱싱 자료구조 (필요해질 때, 측정 후):**
- 검색 시 변경감지를 해시 대신 `mtime`+크기 1차 필터(노트 *파일 수*가 많을 때)
- 인덱스 벡터 JSON → Float32 바이너리(용량/로딩)
- 전용 임베딩 서버(TEI/Infinity)로 `EMBEDDINGS_URL` 교체 가이드/프로파일
- 트리거: 노트가 수만 청크를 넘거나 검색/색인 지연이 체감될 때

### B3. 운영 편의
- `make secrets`에 엔드포인트/모델 상태 통합 점검
- 메모리/노트 용량·통계 한눈에 보기

### B4. up.sh 헬스체크 하드닝 (PR #3 CodeRabbit, Minor)
- `scripts/up.sh` 헬스 루프의 `curl`에 `--connect-timeout`/`--max-time` 추가(응답 지연 시 짧게 실패).
- 현재도 `|| echo 000`으로 curl 부재·연결거부엔 무한 대기 안 함 → **Minor 하드닝**(보류 가능).
- 원 코멘트: https://github.com/shaul1991/localmind/pull/3#discussion_r3489038453

### B5. 고정 버전 주기 갱신 (specs/010 공급망 고정 — 운영)
- "고정"과 "방치"는 다르다: `Dockerfile`·`docker-compose.yml`에 고정한 외부 아티팩트
  (node·codex·claude·ollama·litellm)를 분기별(또는 보안 공지 시) 갱신한다.
- 갱신 절차는 각 파일의 고정 지점 옆 주석 참조(신버전 확인 명령 → 값 교체 → `make up` 검증).
- 강한 고정 후속: claude install.sh 바이너리 직접 다운로드+체크섬(현재는 버전 인자로 1차 고정),
  이미지 digest 갱신 자동화 검토.

### ~~B6. 실패 질의 분석~~ — specs/004 **구현 완료 (2026-07-03)** → 검증은 A13
- 2026-07-03 문서 재검(Context를 013 이후 기준으로 갱신) 후 구현: 쿼리 로그(JSONL,
  로컬 전용) + `make query-report`/`query-log-clean`. 라이브 확인 항목은 A13.

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
