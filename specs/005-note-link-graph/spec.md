# Spec: Note Link Graph

상위: [goal](goal.md)

## Scope

`ensureIndexed()` 인덱싱 과정에서 노트 본문의 위키링크(`[[target]]`, `[[target|alias]]`)를
추출해 노트 간 1-hop 관계를 인덱스에 반영하고, 새 MCP 도구 `note_links`로 outgoing/incoming
링크를 조회한다.

## Context

`brain.ts`의 `ensureIndexed()`는 변경된 각 파일의 전체 텍스트를 이미 읽어 청크/임베딩한다
(`fs.readFileSync(full, "utf8")`). 이 시점에 위키링크를 함께 파싱하면 추가 IO가 없다.
`BrainIndex.files`는 `key(label/relpath) → FileEntry` 구조이며, 위키링크 타겟도 같은 키
네임스페이스(`label/relpath`, 확장자 제거)로 해석 가능하다.

검증용 vault 샘플에서 확인된 Obsidian 위키링크 타겟 형식(둘 다 지원해야 함):
- `[[폴더/하위폴더/노트명]]` (경로, 확장자 없음)
- `[[노트명]]` (bare 파일명, 확장자 없음)

## Functional Requirements

- **FR-1 (위키링크 추출)**: `ensureIndexed()`가 파일 텍스트를 읽을 때 `[[target]]` 또는
  `[[target|alias]]` 패턴을 정규식으로 추출하고, `target`을 trim해 원본 문자열 목록으로 저장한다.
  → goal: Objective

- **FR-2 (인덱스 스키마 확장)**: `FileEntry`에 `linksOut: string[]`(추출된 원본 타겟 문자열,
  미해결 포함) 필드를 추가한다. `INDEX_VERSION`을 3으로 올려 기존 v2 인덱스는 전체 재인덱싱된다.
  → goal: Constraints (스키마 변경 시 버전 관리)

- **FR-3 (링크 타겟 해석)**: 추출된 `target` 문자열을 `idx.files`의 키(`label/relpath`,
  확장자 제거 비교)와 basename 매칭한다. 동일 폴더(같은 `label`) 내 매칭을 우선하고, 없으면
  전체 vault에서 첫 매칭을 선택한다. 매칭되는 파일이 없으면 미해결(unresolved)로 표시한다.
  → goal: Objective, Risks (타겟 모호성·미해결 링크)

- **FR-4 (note_links 도구 — outgoing)**: 새 MCP 도구 `note_links`가 노트 경로(`label/relpath`)를
  입력받아 해당 노트의 `linksOut`을 해석한 결과(경로 + 해석 성공 여부)를 반환한다.
  → goal: Objective, Expected outcome

- **FR-5 (note_links 도구 — incoming/backlink)**: `note_links`는 동시에 incoming(이 노트를
  링크하는 다른 노트들) 목록도 반환한다. 전체 인덱스를 순회하며 각 파일의 `linksOut`이 대상
  노트로 해석되는 파일들을 수집한다.
  → goal: Objective, Expected outcome

- **FR-6 (고정 토큰 응답)**: `note_links` 응답에는 노트 경로 목록만 포함하고 노트 본문 텍스트는
  포함하지 않는다.
  → goal: Success metrics (고정 토큰 비용)

- **FR-7 (미해결 링크 표시)**: 해석되지 않은 링크는 결과에 `(미해결)` 표시와 함께 원본 타겟
  문자열을 그대로 보여준다. 도구는 에러를 내지 않는다.
  → goal: Risks (미해결 링크)

## Acceptance Criteria

- **AC-1 (outgoing)**: Given 노트 A 본문에 `[[노트B]]`가 있고 노트B가 실제 vault에 존재할 때,
  When `note_links("A의 경로")`를 호출하면,
  Then outgoing 목록에 노트B의 경로가 해석된 상태로 포함된다.

- **AC-2 (incoming/backlink)**: Given 노트 A가 `[[노트B]]`를 링크할 때,
  When `note_links("B의 경로")`를 호출하면,
  Then incoming 목록에 노트A의 경로가 포함된다.

- **AC-3 (엣지 — 별칭 링크)**: Given 본문에 `[[노트B|표시 텍스트]]` 형식이 있을 때,
  When 링크를 추출하면,
  Then 타겟은 "노트B"로 정규화되고 표시 텍스트("표시 텍스트")는 무시된다.

- **AC-4 (엣지 — 미해결 링크)**: Given 노트 본문에 `[[존재하지않는노트]]`가 있을 때,
  When `note_links`를 호출하면,
  Then 해당 항목이 outgoing 목록에 `(미해결) 존재하지않는노트`로 표시되고 도구는 에러를 내지 않는다.

- **AC-5 (엣지 — 링크 없는 노트)**: Given 위키링크가 전혀 없는 노트일 때,
  When `note_links`를 호출하면,
  Then outgoing/incoming 모두 빈 배열이며 "연결된 노트 없음" 메시지를 반환한다.

- **AC-6 (엣지 — 동일 basename 다중 매칭)**: Given 서로 다른 폴더(label)에 같은 파일명(basename)을
  가진 노트가 2개 존재할 때,
  When 그 basename을 가리키는 `[[...]]` 링크를 해석하면,
  Then 링크가 포함된 노트와 같은 폴더(label) 내 노트를 우선 매칭한다. 같은 폴더에 없으면
  전체 vault에서 첫 매칭(인덱스 순회 순서)을 사용한다.

- **AC-7 (엣지 — 존재하지 않는 노트로 조회)**: Given 인덱스에 없는 노트 경로로
  `note_links`를 호출하면,
  Then 에러 텍스트("노트를 찾을 수 없음")를 반환하고 도구가 throw하지 않는다.

## Open questions

- ~~Obsidian `aliases` frontmatter를 통한 별칭 매칭은 미포함(Non-goal) — 추후 필요 시 별도 spec.~~
- ~~backlink(incoming) 계산을 인덱싱 시점에 사전 계산할지, 조회 시점에 on-demand 순회할지는
  plan에서 성능 측면을 고려해 결정한다 (초기엔 on-demand로 단순하게 시작 예정).~~
