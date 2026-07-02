# Spec: Local Security Hardening

상위: [goal](goal.md)

## Scope

(1) HTTP 서버(`:8787`)에 Host 헤더 허용 목록 검증 미들웨어를 추가하고 공유 머신 안내
문서를 보강한다. (2) `delete_note`를 휴지통(soft-delete) 방식으로 바꾸고 휴지통 관리
명령(`make trash-empty` 등)을 제공한다.

## Context

- `src/server.ts`: express 앱. `authMiddleware`(API 키, 미설정 시 통과)만 존재.
  compose 내부에서 litellm이 `http://localmind:8787/v1`로 호출하므로 Host가
  `localmind:8787`인 정당한 트래픽이 있다(허용 목록에 반드시 포함).
- `src/brain.ts` `deleteNote()`: 경로 검증 후 `fs.unlinkSync` 즉시 영구 삭제 + 재인덱싱.
- `listMarkdown()`은 `.`으로 시작하는 폴더/파일을 인덱싱에서 제외한다 — 휴지통을
  `.trash/`로 두면 인덱스 제외가 자동으로 성립한다.
- `make backup`은 `BACKUP_DIR`(노트 폴더) 전체를 git add — `.gitignore`에 `.trash/` 추가
  필요.

## Functional Requirements

- **FR-1 (Host 헤더 검증)**: 모든 요청(단, `/health` 포함 여부는 AC-4)에 대해 Host 헤더의
  호스트 부분이 허용 목록에 없으면 403을 반환한다. 기본 허용 목록:
  `localhost`, `127.0.0.1`, `[::1]`, `localmind`(compose 서비스명),
  `host.docker.internal`.
  → goal: Objective (DNS rebinding 차단), Risks (컨테이너 내부 호출 보존)

- **FR-2 (허용 목록 구성 가능 — 추가 방식)**: `LOCALMIND_ALLOWED_HOSTS`(콤마 구분)에
  지정한 호스트는 FR-1 기본 목록에 **추가**된다(교체가 아님 — 교체 방식이면 사용자가
  `localmind` 서비스명을 빠뜨렸을 때 컨테이너 내부 litellm 호출이 차단돼 게이트웨이
  전체가 조용히 깨지는 footgun이 된다). `*` 단독 지정 시에만 검증을 끈다(리버스 프록시
  등 고급 구성용).
  → goal: Constraints, Risks (컨테이너 내부 호출 보존)

- **FR-3 (공유 머신 문서 안내)**: README와 docs/faq.md에 "같은 머신을 여러 사람이
  쓰거나 신뢰할 수 없는 프로세스가 돌 수 있으면 `LOCALMIND_API_KEY`를 설정하라"는 안내를
  추가한다(.env.example의 기존 주석 보강 포함).
  → goal: Objective

- **FR-4 (delete_note soft-delete)**: `deleteNote()`가 파일을 영구 삭제하는 대신 해당
  노트 폴더의 `.trash/` 하위로 **폴더 내 상대경로를 보존해** 이동한다
  (`label/sub/note.md` → `<폴더>/.trash/sub/note.md` — basename만 옮기면 원래 하위폴더
  정보가 유실돼 "원위치 복구"가 성립하지 않는다). 같은 위치에 이미 파일이 있으면
  타임스탬프 접미로 충돌을 피한다. 이동 후 재인덱싱으로 검색에서 제외된다. MCP 응답에
  "휴지통으로 이동 — 복구하려면 파일을 원위치로 옮기고, 완전 삭제는 make trash-empty"
  안내를 포함하고, 도구 description의 "cannot be undone" 문구도 soft-delete에 맞게 갱신한다.
  → goal: Objective, Expected outcome

- **FR-5 (휴지통 관리 명령)**: `make trash-list`(휴지통 내용 확인)와
  `make trash-empty`(전체 비우기 — 실행 전 확인 프롬프트)를 제공한다. 휴지통 비우기는
  이 명령으로만 가능하다(MCP 도구로는 불가 — 비가역 작업은 사람 전용).
  → goal: Expected outcome, Non-goals 경계

- **FR-6 (백업 제외)**: `.trash/`가 `make backup`의 git 커밋에 포함되지 않도록 백업
  폴더 `.gitignore`에 추가한다(기존 `.brain-index.json` 제외 로직과 같은 방식).
  → goal: Constraints

## Acceptance Criteria

- **AC-1 (rebinding 차단)**: Given 서버가 기본 설정으로 떠 있을 때,
  When `Host: evil.example.com` 헤더로 `/v1/chat/completions`에 요청하면,
  Then 403이 반환된다.

- **AC-2 (정상 트래픽 보존)**: Given 같은 조건에서,
  When `Host: localhost:8787` 또는 `Host: localmind:8787`(컨테이너 내부)로 요청하면,
  Then 기존과 동일하게 처리된다.

- **AC-3 (허용 목록 구성)**: Given `LOCALMIND_ALLOWED_HOSTS="myproxy.local"`로 기동했을 때,
  When `Host: myproxy.local`과 `Host: localhost`(기본 목록) **둘 다** 통과하고,
  `Host: evil.example.com`은 403이 된다(추가 방식 — 기본 목록 유지).
  And `LOCALMIND_ALLOWED_HOSTS="*"`면 모든 Host가 통과한다.

- **AC-4 (health 예외)**: Given 기본 설정에서,
  When 임의 Host로 `/health`를 호출하면,
  Then 200이 반환된다(민감 동작이 없는 상태 조회 엔드포인트 — 향후 헬스체크·모니터링
  도구가 어떤 Host로 붙어도 호환되도록 예외).

- **AC-5 (soft-delete)**: Given 존재하는 노트에 대해,
  When `delete_note`를 호출하면,
  Then 원위치에서 사라지고 같은 폴더의 `.trash/` 아래 존재하며, `search_notes`에서
  더 이상 검색되지 않는다.

- **AC-6 (복구 가능)**: Given 휴지통에 있는 노트를,
  When 원위치로 되돌리고 재인덱싱하면,
  Then `search_notes`에 다시 검색된다.

- **AC-7 (엣지 — 이름 충돌)**: Given 같은 이름의 노트를 두 번 삭제하면(삭제→재생성→삭제),
  Then 휴지통에 두 파일이 모두 보존된다(덮어쓰기 없음).

- **AC-9 (엣지 — 하위폴더 경로 보존)**: Given `label/sub/note.md` 형태의 하위폴더 노트를
  삭제하면,
  Then 휴지통 내 경로가 `.trash/sub/note.md`로 상대경로가 보존된다.

- **AC-8 (엣지 — 휴지통 백업 제외)**: Given 휴지통에 파일이 있는 상태에서,
  When `make backup`을 실행하면,
  Then `.trash/` 내용이 백업 커밋에 포함되지 않는다.

## Open questions

- Host 검증에서 포트 부분 처리: `Host: localhost:8787`의 포트는 무시하고 호스트만 비교
  (표준 관행) — plan에서 파싱 방식 확정.
- 휴지통 위치: 노트 폴더별 `.trash/`(폴더 단위) vs 첫 폴더 하나로 통합 — 폴더별이
  복구가 직관적이라 기본안이나 plan에서 확정.
- 오래된 휴지통 항목 자동 정리(30일 등)는 이번 범위에 넣지 않음 — trash-list가 오래된
  항목을 표시하는 정도로 시작.
- 이미 휴지통에 있는 파일 경로(`label/.trash/...`)를 `delete_note`로 지목하는 엣지:
  숨김 폴더라 list_notes/search_notes에 노출되지 않아 정상 흐름에선 발생하지 않음 —
  같은 경로 rename(무해한 no-op)이 되는지 구현 시 확인만 하고 별도 처리는 하지 않는다.
