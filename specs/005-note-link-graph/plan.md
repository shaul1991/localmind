# Plan: Note Link Graph

상위: [goal](goal.md) · [spec](spec.md)

## 접근 요약

`brain.ts`의 `ensureIndexed()` 파일 처리 루프에 위키링크 추출을 통합해 추가 IO 없이
`FileEntry.linksOut`을 채운다. 링크 해석(resolve)과 backlink 수집은 조회 시점(`noteLinks()`)에
on-demand로 수행한다 — 노트 수가 수천 단위라 매 조회마다 전체 인덱스를 순회해도 충분히
빠르며, 초기 구현 단순성을 우선한다(성능 이슈 발생 시 사전 계산 인덱스로 전환 가능하도록
함수 경계를 분리해 둔다). `mcp-server.ts`에 `note_links` 도구를 신규 등록한다.

## 도메인 경계 (DDD)

- **second-brain 도메인 — 관계(relation) 서브도메인**: 노트(Note, key=`label/relpath`)
  간의 명시적 저자 선언 관계를 다룬다. 임베딩 기반 의미 검색(기존 `searchNotes`)과는
  별개의 책임 — "의미가 비슷함"이 아니라 "저자가 명시적으로 링크함"이 그래프의 근거.
- **유비쿼터스 언어**:
  - *정본 링크(authored link)*: 노트 본문의 `[[target]]` 표기 — 저자가 직접 선언한 관계
  - *해석된 링크(resolved link)*: authored link의 target이 실제 vault 파일과 매칭된 상태
  - *미해결 링크(unresolved link)*: target이 vault 내 어떤 파일과도 매칭되지 않은 상태
  - *backlink(incoming)*: 어떤 노트가 대상 노트를 링크하는 역방향 관계

## 영향 모듈

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `src/brain.ts` | 수정 | `extractLinks()`, `resolveLink()`, `noteLinks()` 추가. `FileEntry.linksOut` 필드, `INDEX_VERSION` 3으로 bump |
| `src/mcp-server.ts` | 수정 | `note_links` MCP 도구 신규 등록 |
| `src/brain.test.ts` | 수정 | `extractLinks`/`resolveLink`/`noteLinks` 단위·통합 테스트 추가 |

## 단계 (task 분해 가능)

1. **`brain.ts` — `extractLinks(text: string): string[]`**: 정규식
   `/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g` 로 `[[target]]`/`[[target|alias]]` 매칭, `target`을
   trim해 배열로 반환. frontmatter 영역도 포함해 스캔(위키링크는 보통 본문에만 있지만 제한할
   이유 없음).

2. **`brain.ts` — 인덱스 스키마 확장**: `FileEntry`에 `linksOut: string[]` 필드 추가.
   `INDEX_VERSION`을 `2` → `3`으로 변경(스키마 변경이므로 `loadIndex()`가 자동으로 전체
   재인덱싱 처리 — 기존 버전 체크 로직 그대로 활용).

3. **`brain.ts` — `ensureIndexed()` 통합**: 파일 텍스트를 읽는 시점(`pending` 배열 구성 시)에
   `extractLinks(text)`를 호출해 `linksOut`을 `pending` 항목에 포함. 청크 임베딩 완료 후
   `idx.files[key]` 커밋 시 `linksOut`도 함께 저장.

4. **`brain.ts` — `resolveLink(target: string, fromFolder: string, idx: BrainIndex): string | null`**:
   `target`에서 확장자(`.md`) 제거 후, `idx.files`의 모든 키에 대해 basename(파일명만, 경로 제외)
   비교. 같은 `fromFolder`(label) 내 매칭 우선, 없으면 `Object.keys(idx.files)` 순회 순서상
   첫 매칭. 매칭 없으면 `null`.

5. **`brain.ts` — `noteLinks(notePath: string): Promise<NoteLinks>`** export 함수:
   ```ts
   interface ResolvedLink { target: string; resolved: boolean }
   interface NoteLinks { outgoing: ResolvedLink[]; incoming: string[] }
   ```
   - `ensureIndexed()` 로 최신 인덱스 확보
   - `idx.files[notePath]` 없으면 `null` 반환(노트 없음 — mcp-server에서 에러 메시지로 변환)
   - outgoing: `linksOut`을 `resolveLink`로 매핑해 `{ target, resolved }` 배열 구성
   - incoming: 전체 `idx.files` 순회하며 각 파일의 `linksOut`을 `resolveLink`로 해석했을 때
     `notePath`와 일치하는 파일들의 키를 수집

6. **`mcp-server.ts` — `note_links` 도구 등록**:
   - 입력: `path: z.string()` (예: `"work/note.md"` 형식, `whoami` 출력과 동일 포맷)
   - `noteLinks(path)` 호출 → `null`이면 "노트를 찾을 수 없음" 에러 텍스트
   - outgoing 빈 배열 && incoming 빈 배열이면 "연결된 노트 없음"
   - 그 외엔 `"→ 나가는 링크:\n  - {path}\n  - (미해결) {target}\n\n← 들어오는 링크(backlink):\n  - {path}"` 형식으로 조립

7. **테스트 작성**: AC-1~7 커버. `extractLinks`/`resolveLink`는 순수 함수라 단위 테스트,
   `noteLinks`/도구 전체 흐름은 임시 디렉토리 + 실제 파일 작성 후 통합 테스트
   (`LOCALMIND_INTEGRATION=1`로 임베딩 서버 필요한 부분만 분리, 링크 추출/해석 자체는
   임베딩 없이도 테스트 가능하도록 `resolveLink`를 인덱스 객체 직접 주입받게 설계).

## 테스트 전략

| AC | 테스트 레벨 | 방법 |
|----|-------------|------|
| AC-1 (outgoing) | 통합 | 임시 폴더에 노트 A(`[[B]]` 포함)·B 작성 → 인덱싱 → `noteLinks(A)` outgoing에 B 포함 확인 |
| AC-2 (incoming) | 통합 | 위와 동일 데이터로 `noteLinks(B)` incoming에 A 포함 확인 |
| AC-3 (별칭 링크) | 단위 | `extractLinks("[[노트B|표시 텍스트]]")` → `["노트B"]` 확인 |
| AC-4 (미해결 링크) | 단위 | `resolveLink("존재하지않는노트", folder, idx)` → `null` 확인, `noteLinks` 결과에 `resolved:false` |
| AC-5 (링크 없는 노트) | 통합 | 링크 없는 노트로 `noteLinks` 호출 → outgoing/incoming 모두 빈 배열 |
| AC-6 (동일 basename) | 단위 | 두 폴더에 같은 basename 키를 가진 mock `BrainIndex` 구성 → `resolveLink` 우선순위 확인 |
| AC-7 (존재하지 않는 노트 조회) | 단위 | `noteLinks("nonexistent/path.md")` → `null` 반환 확인, mcp 핸들러가 에러 텍스트로 변환하는지 확인 |

## Open questions

- `extractLinks` 정규식이 코드 블록(\`\`\` 안의 `[[...]]` 같은 리터럴 텍스트) 오탐을 일으킬 수
  있음 — 1차 구현은 단순 정규식으로 시작하고, 실사용 중 오탐이 발견되면 코드펜스 제외 로직 추가.
- on-demand backlink 순회의 실측 성능(수천 파일 규모 vault 기준)이 체감상 느리면 사전 계산
  backlink 맵으로 전환 — 1차 구현 후 실측 필요.
