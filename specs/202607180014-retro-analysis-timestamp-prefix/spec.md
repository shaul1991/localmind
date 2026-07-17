# Spec: retro-analysis spec 참조 파서 — timestamp 프리픽스 대응

상위: [goal](goal.md)

## Scope

`src/retro-analysis.ts`의 두 파싱 함수가 spec 프리픽스를 인식하는 범위를 **레거시 3자리 →
3자리 + timestamp(12·14자리)**로 넓힌다. 대상은 (1) `parseCommits`의 spec cadence 집계,
(2) `collectDecisionNotes`의 spec 참조 수집. cadence 키 스키마를 두 함수가 일치하게 정규화한다.

## Context

현행 파싱 지점(전부 `\d{3}` 하드코딩):

| 위치 | 정규식 | 대상 |
|---|---|---|
| `retro-analysis.ts:40` | `\bspecs\/(\d{3})\b` | 커밋 제목의 `specs/NNN` |
| `retro-analysis.ts:41` | `\((\d{3})\)` | 제목 말미 `(NNN)` |
| `retro-analysis.ts:47` | `(?::\|,)\s*(\d{3})\b` | `docs(spec):` 나열형 절 시작 |
| `retro-analysis.ts:49` | `\bspecs?\b\W{0,12}(\d{3})\b` | 그 외 커밋의 spec 토큰 인접 |
| `retro-analysis.ts:131` | `\bspecs\/(\d{3}[\w-]*)` | decision 노트의 spec 참조 |

`extractOpenQuestions`는 `f.spec`(폴더명 그대로)을 키로 쓰므로 프리픽스 자릿수에 무관 — **이미
timestamp 대응**(별도 수정 불필요, 회귀 테스트로 확인만).

프리픽스 정본 형식(정합 PR #28 기준): timestamp = `YYYYMMDDHHmm`(12) 또는 `YYYYMMDDHHmmss`(14),
레거시 = 3자리. retro 파서는 activation gate가 아니므로 이 집합을 엄격 검증하지 않고 **느슨하게**
(`specs/` 뒤 3+ 숫자 프리픽스 + 슬러그) 캡처한다 — FR-5 참조(`workflow-policy.ts` `PREFIX_RE` 재사용은
결합 과설계로 철회).

**커밋 참조 형식(2026-07-18 확정, OQ-1)**: timestamp spec은 커밋에서 **`specs/{ts}-slug` 경로형**으로
참조한다. 따라서 timestamp의 1차 인식 경로는 `specs/{prefix}-slug`이며, 3자리 관례의 제목 말미
`(NNN)`형·conventional scope `feat({ts}):`형은 **timestamp에 적용하지 않는다**(레거시 3자리의 기존
`(NNN)`·나열형 인식은 그대로 유지 — 후방호환).

## Functional Requirements

- [x] **FR-1 (cadence 프리픽스 인식)**: `parseCommits`가 커밋 제목의 **`specs/{ts}-slug` 경로형**
      timestamp 참조(12·14자리)를 `specCadence`에 집계한다(OQ-1 확정 형식). 레거시 3자리의 기존
      3형식 인식은 유지한다. → goal: Objective
- [x] **FR-2 (decision 참조 인식·키 일치)**: `collectDecisionNotes`가 timestamp 참조를 수집하고,
      그 키가 `specCadence`와 **같은 규칙**(OQ-2 확정: `specs/` 뒤 폴더 식별자 전체)을 따른다.
      → goal: Objective / Risk(키 스키마 혼재)
- [x] **FR-3 (레거시 무회귀 — 집계 유지)**: 레거시 3자리 spec이 계속 집계된다(누락 없음). 단 OQ-2로
      키가 폴더 식별자로 이관되므로 **키 문자열은 바뀔 수 있고**, 032 기존 테스트는 새 키 규칙에
      맞춰 갱신한다(값 누락이 회귀 — 키 변경은 이관). → goal: Non-goals(레거시 인식 유지) / Success metrics 3
- [x] **FR-4 (오집계 방지 유지)**: 032가 세운 오집계 방어(`docs(spec):` 절 시작만, 그 외는 spec
      토큰 인접 12자 이내, 절 중간 숫자 배제)를 timestamp에도 동일 적용한다. → goal: Constraint
      (실측 형식 근거)
- [x] **FR-5 (느슨·결합 최소 캡처 — Simplicity First 정정)**: `specs/` 경로형 캡처는 `specs/` 뒤
      **숫자 프리픽스(3자리 이상) + 선택적 슬러그**를 폴더 식별자로 잡는다. activation gate처럼 `{3,12,14}`
      집합을 **엄격 검증하지 않는다** — retro는 계수이지 실행 권한 판정이 아니고, 느슨한 매치가
      프리픽스 형식 변화에 더 강건하며 `workflow-policy`(활성화 컨텍스트)와의 결합을 피한다. → goal:
      Risk(재드리프트) / Constraint(순수 집계 경계). (초안의 "workflow-policy PREFIX_RE 재사용"은
      결합 과설계로 철회 — `PREFIX_RE`는 미export·`^…$` 앵커라 부분 매치에 부적합하기도 하다.)

## Acceptance Criteria

- [x] **AC-1 (cadence — 경로형)**: Given 커밋 제목 `... specs/202607180014-slug ...`(OQ-1 확정
      경로형), When `parseCommits`, Then `specCadence`에 그 키가 +1 된다. 반례로 `feat(202607180014):`
      conventional-scope 형은 timestamp 참조로 인정하지 않는다. (FR-1)
- [x] **AC-2 (cadence — 혼재·동일 프리픽스 분리)**: Given 3자리·timestamp 참조가 섞이고 같은 분·다른
      슬러그 두 timestamp spec을 포함한 로그, When `parseCommits`, Then 각 spec이 자기 폴더 식별자 키로
      독립 집계된다(같은 프리픽스라도 분리, 서로 오염 없음). (FR-1·FR-2·FR-3)
- [x] **AC-3 (decision 노트 키 일치)**: Given `specs/202607180014-slug`를 참조하는 `tags:[decision]`
      노트, When `collectDecisionNotes`, Then `specRefs`의 키가 AC-1의 cadence 키(폴더 식별자 전체)와
      **동일 값**이다. (FR-2)
- [x] **AC-4 (레거시 집계 유지)**: Given 032의 기존 3자리 참조 픽스처, When 파싱, Then 각 레거시 spec이
      계속 집계된다(누락 0). 키가 폴더 식별자로 이관되면 032 테스트의 기대 키를 함께 갱신하되, **집계된
      spec 수·매핑이 줄지 않음**을 확인한다. (FR-3)
- [x] **AC-5 (엣지 — 오집계 방지)**: Given `docs(spec): 202607180014 cap 100 chars` 류, When
      `parseCommits`, Then 프리픽스만 집계하고 절 중간 숫자(`100`)는 배제한다. (FR-4)
- [x] **AC-6 (엣지 — timestamp는 specs/ 앵커 필수)**: Given `specs/` 경로 밖의 맨 12·14자리 숫자열
      (예: 이슈번호·해시 일부), When `parseCommits`, Then timestamp spec으로 집계하지 않는다 — timestamp
      참조는 OQ-1 확정대로 `specs/{ts}-slug` 경로형만 인정(레거시 3자리의 바레/나열형 인식과 구분). (FR-5)
- [x] **AC-7 (도그푸드)**: When 실제 `make retro` 실행, Then 이 spec 폴더(timestamp 프리픽스)가
      리포트 cadence/참조에 나타난다. (goal: Success metrics 4)

## 검증 요약 (self-review clean — 2026-07-18)

`src/retro-analysis.test.ts`의 `describe("retro timestamp 프리픽스 대응")` 블록으로 검증. 독립 크리틱
1라운드(격리 서브에이전트)에서 중대 1건(레거시 경로형 이중 키)·경미 3건 발견 → 전부 수정·재검.

| AC | 검증 방법(테스트/실증) |
|---|---|
| AC-1 | `parseCommits`에 `specs/202607180014-add-auth` 경로형 → 폴더 식별자 키 집계. mutation(regex revert)에서 fail 확인. |
| AC-2 | 3자리+timestamp+같은 분 두 슬러그 혼합 로그 → 독립 키. **바레 `041` 중복 부재까지 단언**(중대-1 가드, mutation 확인). |
| AC-3 | timestamp 참조 decision 노트 → `specRefs` == cadence 키(폴더 식별자). 기존 `\d{3}[\w-]*`가 이미 충족. |
| AC-4 | 032 레거시 픽스처 → 집계 누락 0(895/895 green, 기존 값 불변). |
| AC-5 | `docs(spec): 202607180014 cap 100 chars` → 절 중간·비경로 timestamp 배제(키 0). |
| AC-6 | `specs/` 밖 12·14자리 숫자열 → timestamp 미집계. |
| AC-7 | `make retro` 실행 + `parseCommits` 실측: `{"202607180014-retro-analysis-timestamp-prefix":2, "053":1}`. 커밋 후 실 cadence 재확인. |

## Open questions

- ~~**OQ-1 (커밋 참조 형식)**~~ → **확정(2026-07-18): `specs/{ts}-slug` 경로형.** 후보였던
  conventional scope `feat({ts}):`·제목 말미 `({ts})`·단축형은 채택하지 않는다(12자리 `({ts})`는
  노이즈). 레거시 3자리의 기존 3형식 인식은 후방호환으로 유지. → Context "커밋 참조 형식" 절·FR-1·AC-1로 이관.
- ~~**OQ-2 (cadence 키 정규화 규칙)**~~ → **확정(2026-07-18): 폴더 식별자 전체(`{prefix}-slug`)를 키로
  한다.** 프리픽스는 유일하지 않을 수 있어(같은 분·다른 슬러그; 레거시 `041-*` 중복 실재 — PR #28
  모호성과 동일 뿌리) 폴더 식별자 전체로 키해 두 spec을 disambiguate한다. `parseCommits`(cadence)와
  `collectDecisionNotes`(현행 `\d{3}[\w-]*`가 이미 슬러그 포함)를 **같은 규칙**(`specs/` 뒤 폴더
  식별자 전체 캡처)으로 통일한다. → FR-2·AC-2·AC-3에 반영.
- ~~**OQ-3 (리포트 표기)**~~ → **확정(2026-07-18): 키가 폴더 식별자이므로 cadence 표는 식별자
  전체를 그대로 노출한다**(렌더는 Non-goal이라 별도 개편 없음).

### 확정에서 파생된 주의(plan 반영 필요)

- **레거시 키 스키마 변화**: OQ-2로 키가 "3자리 숫자"→"폴더 식별자"가 되면, 커밋이 `specs/041-slug`로
  참조할 땐 `041-slug`, 바레 `specs/041`·`(041)`로 참조할 땐 슬러그가 없어 `041`이 된다 — **같은
  레거시 spec이 참조 형태에 따라 다른 키**가 될 수 있다. AC-4(레거시 무회귀)는 "레거시 spec이 여전히
  집계된다"로 해석하고, 032 기존 픽스처의 기대 키가 바뀌면 **테스트를 새 규칙에 맞춰 갱신**한다(값
  누락이 아니라 키 스키마 이관). plan에서 캡처 규칙(`specs/` 뒤 어디까지 키로 잡나)을 정확히 고정한다.
