# Plan: Session & Index Accuracy

상위: [goal](goal.md) · [spec](spec.md)

## 접근 요약

세 독립 트랙. **트랙 A(세션)**: `session.ts` 안에서 완결 — auto 경로의 prefix 해시
기제를 explicit 경로에 재사용하고, commit·resume의 무방어 지점(빈 id, tools 서명)을
막는다. 라우트는 tools 서명 전달만 추가. **트랙 B(색인)**: `brain.ts`의 `chunkText`
분할, 인덱스 스키마에 임베딩 메타 추가(버전 bump), 저장 경로에 락+병합. **트랙 C(도구)**:
`deleteNote`·`capture` 입력 경계 강화. 모든 트랙이 기존 시그니처를 유지해 호출부 파급이
없다.

## 도메인 경계 (DDD)

- **트랙 A — 세션 도메인(application)**: "이어 쓸 수 있는 대화"의 판정 규칙을
  '개수 일치'에서 '내용(prefix) 일치'로 강화한다. 판정 로직은 `session.ts`에 응집 —
  라우트(interface)는 판정 결과만 소비한다.
- **트랙 B — second-brain 색인의 불변식**: ① 노트의 모든 텍스트는 색인에 반영된다
  ② 색인은 자기가 어떤 임베딩으로 만들어졌는지 안다 ③ 색인 파일의 갱신은 프로세스 수와
  무관하게 유실이 없다.
- **트랙 C — 노트 수명주기의 경계**: 도구가 만질 수 있는 파일은 "노트(.md, 비숨김)"뿐.
- **유비쿼터스 언어**:
  - *prefix 검증(prefix check)*: 기존 대화 메시지열의 정규화 해시가 새 요청의 앞부분과
    일치하는지 확인
  - *tools 서명(tools signature)*: tools 정의 배열의 정규화 해시 — 세션 생성 시점과
    비교하는 기준
  - *색인 메타(index meta)*: 인덱스에 기록된 임베딩 모델명·차원
  - *reload-merge*: 저장 직전 디스크 변경을 감지하면 다시 읽어 엔트리를 병합 후 쓰는 규칙

## 영향 모듈

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `src/session.ts` | 수정 | explicit 경로 prefix 검증(FR-1), 빈 cliSessionId 미저장(FR-2), tools 서명 저장·비교(FR-3) |
| `src/routes/chat.ts` · `src/routes/messages.ts` | 수정 | 세션 준비 호출에 tools 서명 전달, `!sess.resumeId` 조건을 세션 판정 결과 기반으로 교체 |
| `src/brain.ts` | 수정 | `chunkText` 분할(FR-4), 인덱스 메타+버전 bump(FR-5), 저장 락+reload-merge(FR-6), `deleteNote` 제한(FR-7), `capture` 배타 생성(FR-8) |
| `src/mcp-server.ts` | 수정 | `delete_note` 거부 사유 문구(한국어)만 — 스키마 불변 |
| `src/session.test.ts` | 수정 | AC-1~4 (explicit 검증·빈 id·tools 서명) |
| `src/brain.test.ts` | 수정 | AC-5~12 (분할·메타·병렬·거부·충돌) |
| `docs/reference.md` | 수정 | explicit 모드 설명에 prefix 검증 추가(편집된 히스토리는 새 세션) |

## 단계 (task 분해 가능)

### 트랙 A — 세션
1. **`session.ts` 정규화 해시 재사용 확인**: auto 경로의 메시지 정규화·해시 함수를
   explicit 경로에서 호출 가능한 형태로 추출(이미 분리돼 있으면 그대로 사용 — 새 코드
   최소화, spec Open questions).
2. **FR-1**: explicit 세션 엔트리에 prefix 해시를 저장하고, resumable 판정에
   `개수 조건 && prefix 해시 일치`를 요구. 불일치 → fresh(전체 히스토리).
   실패 테스트 먼저: AC-1 혼입 재현 → 통과.
3. **FR-2**: commit에서 `cliSessionId`가 비면 엔트리를 저장하지 않는다(또는 기존 엔트리
   삭제) — "resume 불가능한 세션은 기억하지 않는다". AC-3.
4. **FR-3**: 세션 엔트리에 tools 서명 저장. resume 판정 시 서명 불일치면 **fresh**
   (기본안 — spec Open questions). 라우트에서 tools 지시문 주입 조건을
   `toolsOn && !sess.resumeId`에서 "fresh인 모든 경우"로 정리(fresh면 항상 최신 지시문이
   들어가므로 FR-3이 자연 충족). AC-4.

### 트랙 B — 색인
5. **FR-4 `chunkText`**: 초과 문단을 버리는 `slice`를 분할 루프로 교체 — 줄/문장 경계
   우선, 없으면 `MAX_CHUNK` 고정 창. 순수 함수라 property 스타일 테스트가 쉽다(AC-6:
   임의 입력에서 "청크 ≤ MAX_CHUNK ∧ 내용 유실 0" 불변식). `INDEX_VERSION` bump.
6. **FR-5 인덱스 메타**: 인덱스 루트에 `{ embeddingModel, dims }` 기록. 로드 시 현재
   설정과 불일치 → 캐시 무효화 + 전체 재색인 + 한국어 사유 로그. AC-7·8.
7. **FR-6 락 + reload-merge**: 저장 함수에서
   ① `.brain-index.json.lock`을 `fs.openSync(lock, "wx")`로 획득(실패 시 대기·재시도,
   락 파일 mtime이 타임아웃(예: 10s) 초과면 stale로 간주하고 강제 획득) —
   ② 락 안에서 디스크 파일 stat이 로드 시점과 다르면 다시 읽어 엔트리 병합
   (경로 키 기준, 해시 다르면 파일 mtime 최신 쪽) — ③ 기존 temp+rename 원자 쓰기 —
   ④ 락 해제. AC-11은 자식 프로세스 2개로, AC-12는 죽은 락 파일을 미리 만들어 검증
   (기존 `runCaptureProbe` 자식 프로세스 격리 패턴 재사용).

### 트랙 C — 노트 도구
8. **FR-7 `deleteNote`**: 확장자 `.md` 확인 + 상대경로 세그먼트 중 `.` 시작 거부.
   기존 `..` 탈출 거부에 회귀 테스트 추가. AC-9.
9. **FR-8 `capture`**: `writeFileSync(..., { flag: "wx" })` + `EEXIST` 시 `-2`, `-3` …
   접미로 재시도. AC-10.

### 공통
10. **문서**: `docs/reference.md` explicit 모드 표에 prefix 검증 동작 한 줄 추가.
11. **도그푸드**: 라이브 스택에서 ① 같은 `user` 값으로 서로 다른 두 대화를 보내 혼입이
    없는지 ② 긴 로그 문단 캡처 후 꼬리 검색 ③ Claude Code + Cursor 동시 접속 상태에서
    양쪽 캡처 → 양쪽 검색 확인.

## 테스트 전략

| AC | 테스트 레벨 | 방법 |
|----|-------------|------|
| AC-1·2 (prefix 검증) | 단위 | `session.ts` 순수 로직 — 커밋 후 다른/같은 prefix로 판정 확인 |
| AC-3 (빈 id 폴백) | 단위 | 빈 cliSessionId commit → 다음 판정이 fresh(전체 전송)인지 |
| AC-4 (tools 후행 추가) | 단위 + 라이브 | 서명 불일치 → fresh 판정(단위) · 실제 tool_calls 왕복(도그푸드) |
| AC-5 (긴 문단 검색) | 통합(격리) | 자식 프로세스 격리 vault — 5,000자 문단 캡처 → 꼬리 문구 검색 |
| AC-6 (분할 불변식) | 단위 | `chunkText` 순수 함수 — 경계값(정확히 MAX, MAX+1, 개행 없는 초장문) |
| AC-7·8 (모델 메타) | 통합(격리) | 인덱스 생성 → 설정 바꿔 재로드 → 재색인·메타 확인 |
| AC-9 (거부) | 통합(격리) | 비-.md·숨김·`../` 각각 거부 + 파일 잔존 확인 |
| AC-10 (capture 충돌) | 통합(격리) | 같은 초 2회 캡처 → 파일 2개 |
| AC-11 (병렬 무유실) | 통합(격리) | 자식 프로세스 2개 동시 색인 → 병합 결과 검증 |
| AC-12 (stale 락) | 통합(격리) | 고아 락 파일 생성 → 저장이 타임아웃 내 완료 |

## Open questions

- 락 타임아웃 값(기본안 10s)과 재시도 간격 — 구현 중 CPU 임베딩의 실제 저장 소요를 보고
  확정(저장은 임베딩과 분리된 짧은 구간이라 10s면 충분할 것으로 추정).
- FR-3에서 fresh 폴백 대신 resume+재주입이 가능한지 — claude/codex CLI가 resume 시
  시스템 프롬프트 변경을 허용하는지 구현 중 확인(허용하면 토큰 절약 유지).
- `INDEX_VERSION` bump로 인한 전체 재색인 안내를 어디에 노출할지 — MCP 도구 응답 vs
  stderr 로그(기본안: 둘 다, 첫 검색/캡처 응답에 한 줄).
