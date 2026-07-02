# Plan: Local Security Hardening

상위: [goal](goal.md) · [spec](spec.md)

## 접근 요약

두 독립 트랙으로 나뉜다. **트랙 A(Host 검증)**: `server.ts`에 미들웨어 하나 추가 —
허용 목록은 config로 파싱해 주입. **트랙 B(soft-delete)**: `brain.ts`의 `deleteNote()`
내부 구현을 unlink→rename(.trash/ 이동)으로 교체하고, Makefile에 휴지통 관리 타겟 추가.
두 트랙 모두 기존 도구·라우트 시그니처를 유지하므로 호출부 파급이 없다.

## 도메인 경계 (DDD)

- **트랙 A — HTTP 경계(interface) 레이어**: 요청이 도메인에 닿기 전의 관문. 인증
  미들웨어와 같은 층위에 Host 검증을 추가한다.
- **트랙 B — second-brain 도메인의 노트 수명주기**: "삭제"의 의미를 '영구 제거'에서
  '휴지통 보관'으로 재정의한다. 완전 삭제는 도메인 밖(사람의 make 명령)으로 밀어낸다.
- **유비쿼터스 언어**:
  - *허용 호스트(allowed host)*: Host 헤더 검증을 통과하는 호스트명 집합
  - *휴지통(trash)*: 노트 폴더 내 `.trash/` — 인덱싱·백업에서 제외되는 보관소
  - *soft-delete*: 원위치에서 제거하되 휴지통에 보존하는 삭제

## 영향 모듈

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `src/config.ts` | 수정 | `allowedHosts: string[] \| null`(null=`*`) 파싱 추가 |
| `src/server.ts` | 수정 | `hostGuardMiddleware` 추가(/health 제외, auth보다 앞) |
| `src/brain.ts` | 수정 | `deleteNote()` 내부를 .trash/ 이동으로 교체 |
| `src/mcp-server.ts` | 수정 | `delete_note` 응답 문구(휴지통 안내)만 갱신 |
| `Makefile` | 수정 | `trash-list`·`trash-empty` 타겟 추가, backup의 .gitignore 시드에 `.trash/` 추가 |
| `README.md`, `docs/faq.md`, `.env.example` | 수정 | 공유 머신 API 키 안내(FR-3), 휴지통 설명 |
| `src/server.test.ts` | 신규 | Host 검증 단위 테스트(supertest 없이 http 요청 또는 express 핸들러 직접 호출) |
| `src/brain.test.ts` | 수정 | soft-delete AC 테스트 추가 |

## 단계 (task 분해 가능)

### 트랙 A — Host 검증
1. **`config.ts`**: `LOCALMIND_ALLOWED_HOSTS` 파싱 —
   기본 목록 `["localhost","127.0.0.1","[::1]","localmind","host.docker.internal"]`은 항상
   포함하고, 설정값은 **기본 목록에 추가**(콤마 분리)한다. `*` 단독이면 null(검증 끔).
   교체 방식 금지 — 사용자가 `localmind`를 빠뜨리면 컨테이너 내부 litellm 호출이 차단돼
   게이트웨이가 조용히 깨진다(spec FR-2).
2. **`server.ts`**: 미들웨어 —
   ```ts
   const host = (req.headers.host ?? "").replace(/:\d+$/, ""); // 포트 제거
   if (allowed && !allowed.includes(host)) → 403 { error: {...한국어 안내} }
   ```
   IPv6 `[::1]:8787` 형태의 포트 제거가 정규식에 걸리는지 주의(`[::1]`는 대괄호 유지).
   `/health` 라우트 등록을 미들웨어보다 앞에 둬 예외 처리(AC-4).
3. **테스트**: node:test에서 `app`을 임시 포트에 listen 후 `fetch`로 Host 헤더 변조 요청
   (AC-1~4). supertest 의존성 추가 없이 내장 fetch 사용.

### 트랙 B — soft-delete
4. **`brain.ts` `deleteNote()`**: `fs.unlinkSync(full)` →
   ```ts
   const rel = path.relative(f.dir, full);            // 폴더 내 상대경로 보존 (AC-9)
   const trashDir = path.join(f.dir, ".trash");
   let dest = path.join(trashDir, rel);               // .trash/sub/note.md
   fs.mkdirSync(path.dirname(dest), { recursive: true });
   if (fs.existsSync(dest)) dest = 충돌 회피(-<타임스탬프> 접미);  // AC-7
   fs.renameSync(full, dest);
   ```
   반환 타입을 `boolean` → `{ ok: boolean; trashedTo?: string }`으로 확장할지, boolean을
   유지하고 mcp-server에서 고정 안내만 할지 — 시그니처 유지 제약(goal)에 따라 **후자**
   기본, 복구 안내에 구체 경로가 필요하면 확장을 재검토.
5. **`mcp-server.ts`**: `delete_note` 성공 응답을 "휴지통(.trash/)으로 이동 — 복구는
   파일을 원위치로, 완전 삭제는 make trash-empty" 문구로 갱신하고, 도구 description의
   "Deletes the file; cannot be undone" 문구도 soft-delete 의미로 함께 갱신(spec FR-4).
6. **`Makefile`**: `trash-list`(각 노트 폴더의 .trash/ 내용 나열),
   `trash-empty`(확인 프롬프트 후 삭제 — 기존 스크립트의 `confirm()` 패턴 재사용,
   비대화 환경에서는 `FORCE=1` 요구). backup 타겟의 .gitignore 시드 라인에 `.trash/` 추가(FR-6).
7. **테스트**: AC-5~7 — 임시 vault에서 자식 프로세스 격리 방식(기존 `runCaptureProbe`
   패턴 재사용)으로 deleteNote 동작 검증.

### 공통
8. **문서(FR-3)**: README 보안 절·faq.md·.env.example 주석 보강.
9. **도그푸드**: 라이브 스택에서 litellm 경유 채팅(`make smoke`)이 Host 검증에 걸리지
   않는지 확인(goal Risks의 컨테이너 서비스명 케이스) — **이 검증이 트랙 A의 핵심 관문**.

## 테스트 전략

| AC | 테스트 레벨 | 방법 |
|----|-------------|------|
| AC-1 (rebinding 차단) | 단위 | 임시 listen + fetch(Host: evil) → 403 |
| AC-2 (정상 보존) | 단위 + 라이브 | fetch(Host: localhost/localmind) → 200 계열, make smoke |
| AC-3 (허용 목록 구성) | 단위 | env 바꿔 서버 생성 → 통과/차단/`*` 확인 |
| AC-4 (health 예외) | 단위 | fetch(/health, Host: evil) → 200 |
| AC-5 (soft-delete) | 통합(격리) | 자식 프로세스로 capture→delete→.trash 존재+검색 미노출 확인 |
| AC-6 (복구) | 통합(격리) | .trash→원위치 이동→reindex→검색 노출 확인 |
| AC-7 (이름 충돌) | 통합(격리) | 동일명 2회 삭제 → 휴지통 파일 2개 확인 |
| AC-8 (백업 제외) | 셸 | 백업 .gitignore 시드 후 git status에 .trash 미포함 확인 |
| AC-9 (하위폴더 경로 보존) | 통합(격리) | sub/note.md 삭제 → .trash/sub/note.md 존재 확인 |

## Open questions

- `deleteNote` 반환 시그니처 확장 여부(단계 4) — 구현 시 mcp 응답에 휴지통 실경로가
  필요한지로 판단.
- Host 미들웨어에서 Host 헤더가 아예 없는 요청(HTTP/1.0 등) 처리 — 기본 거부가 안전하나
  헬스체크 도구 호환을 확인 후 결정.
