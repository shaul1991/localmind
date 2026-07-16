# Review Findings — Round 5 (Linux CI 실패 교정 + 형제 함수 취약점 제거)

## Review Context

- 날짜: 2026-07-17 (Asia/Seoul)
- 계기: PR #21 (feat/044) CI **FAILURE** (node 20·22, GitHub ubuntu Linux). macOS 로컬은 통과.
- 재현 환경: **실제 Linux(home-server, `/tmp/044t` 격리 클론)** — Docker `node:22-bookworm` pull 마찰로
  Docker 대신 실기 Linux를 사용. 운영 스택 불침(임시 클론 + 격리 node_modules).
- 리뷰어: 구현 세션(진단·수정) + **독립 critic**(적대적 재검, 분리 컨텍스트).
- 판정: **clean** — 치명·중대 0, 양 플랫폼 전체 스위트 green(**823/823** macOS·Linux 각각), tsc clean, 회귀 0.

## 실패 5건의 근본 원인 (실기 Linux 실증)

| # | 실패 테스트 | 성격 | 근본 원인 |
|---|---|---|---|
| A | `reconcile.test.ts` — prune: rename 직전 target이 unmanaged로 바뀌면 problem | **제품 버그** | Linux `rm`+재생성이 **같은 inode 재사용** → `targetInode(target) !== inodeBefore` 검사 우회 → unmanaged 사용자 것을 managed로 오인·삭제 |
| B | `bootstrap-guide.test.mjs:127` — 심링크 경로 서버 기동 | 테스트 버그 | Linux `fs.rmSync(link)`가 심링크를 따라가 디렉토리로 보고 **EISDIR** (macOS는 심링크 자신 unlink) |
| C1–3 | `workflow-lifecycle.test.mjs` R4-05 — backup/restore/recover(미러 보류) | 테스트 버그 | 3개 `backup-assets.sh` 호출이 `LOCALMIND_ENV_FILE` 미지정 → **저장소 ambient `.env`** 의존. dev 머신(.env 有)은 통과, 클린 체크아웃(CI, .env 無)은 `resolved=""` → agents(앞선 recover 테스트가 공유 `home`에 시드한 19 페르소나)가 backup-assets.sh guard #2(NOTES_DIR 후퇴)에 걸려 `FAIL=1`→`exit 1` |

## 수정

### R5-01 (제품, 데이터 유실) — inode 재사용 우회 방어를 4개 mutation 지점에 추가
`src/agents/reconcile.ts`. 검증-후·rename-전 race에서 target이 unmanaged로 교체될 때, inode 비교만으로는
Linux inode 재사용(또는 in-place 덮어쓰기)을 못 막는다. 교체된 unmanaged 대상은 **managed 마커가 없으므로**
inode 검사 **앞에** `if (!o.ownedBy(target)) return { status: "problem", ... }`를 둔다(둘 다 필요:
ownedBy=unmanaged 교체를 inode 무관하게 / inode=owned지만 다른 인스턴스인 정상 race를 잡음).

- `pruneManagedDirectory` · `pruneManagedFile` — CI 실패(A)가 직접 겨냥한 지점.
- `replaceManagedDirectory` · `replaceManagedFile`의 **업데이트 경로** — **critic이 실증한 형제 취약점**.
  당초 "형제는 생성(inodeBefore=null) 케이스라 다르다"는 가설은 **틀렸다**: replace는 생성·업데이트 두
  경로를 갖고, 업데이트 경로(inodeBefore non-null)는 prune과 동일한 bare inode 비교뿐이었다. critic이
  독립 프로브로 재현: managed v1 시드 → target을 unmanaged로 in-place 덮어씀 → `status="updated"` +
  **사용자 unmanaged 파일 파괴**. CI 실패엔 없던(어떤 테스트도 이 경로를 inode-재사용으로 찌르지 않음)
  선존 결함이나 동일 심각도라 미봉으로 남기지 않고 제거.
- recover 계열(`recoverManaged*`)은 안전 — target **부재**(`targetInode!==null` 존재 검사)를 보므로
  inode 매칭이 아니라 재사용과 무관(critic 확인).

### R5-02 (테스트) — 심링크 정리 cross-platform
`bootstrap-guide.test.mjs`: `fs.rmSync(link, {force:true})` → `fs.unlinkSync(link)`. unlink는 대상을
따라가지 않고 심링크 자신만 제거(대상 `real`은 다음 줄에서 삭제). link는 try 이전 무조건 생성돼 finally에서
항상 존재하므로 force 관용 상실 무해.

### R5-03 (테스트) — 헤르메틱화
`workflow-lifecycle.test.mjs`: 공유 `notesEnvFile`(격리 `NOTES_DIR`)를 3개 `backup-assets.sh` 호출에
주입해 ambient 저장소 `.env` 의존 제거. `backup-assets.sh`의 guard #2(exit 1)는 **의도된 설계**(미설정
fallback에서 미러 거부)이지 버그가 아니다 — 테스트를 결정적으로 만드는 것이 올바른 교정(반창고 아님, critic 확인).

## 회귀 핀 (신규 4, RED 유효성 실증)

| 핀 | 위치 | RED 유효성 |
|---|---|---|
| prune file: inode 재사용 방어 | `reconcile.test.ts` (AC-20) | **Linux 실기**에서 수정 전 실패 실증 |
| update file / update dir: in-place 교체 방어 | `reconcile.test.ts` | **macOS 결정적** 실패 실증(in-place라 inode 보존, 플랫폼 무관) |
| (기존) prune dir 핀 | `reconcile.test.ts` (R1-08) | Linux 수정 전 실패 → 후 통과 |

update 핀은 in-place 덮어쓰기로 inode를 결정적으로 보존해 **양 플랫폼에서 결정적**(prune 핀은 Linux 조건부).

## 검증

- macOS(m5) `npm test`: **823/823** · `tsc` clean.
- Linux(home-server 실기) `npm test`: **823/823**.
- 이전 실패 5건 → 0. 회귀 0. 신규 핀 4개 전부 수정 전 RED·수정 후 GREEN 확인.
- critic 급소 5개 판정: Fix 정확성/커버리지/심링크/헤르메틱/핀 유효성 — 형제 취약점(R5-01 replace) 외 clean.
