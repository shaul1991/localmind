# change: brief 구형식 결정 노트 관대한 폴백

## Why (배경·문제)

2026-07-23 회고 실측: brief는 신형식 결정(frontmatter `type: decision` + `decision.choice/why`,
living-memory specs/202607211621)만 파싱하는데, 볼트의 결정 노트 84건(구형식 `tags: ["decision"]`
82건 + 형식 불일치 2건) 중 **파싱되는 노트가 0건**이다. 결과적으로 brief("새 세션이 과거 결정을
가지고 시작하게 하는 도구")가 출시 이후 항상 "결정 노트가 없습니다"를 반환했다 — 도구의 존재
목적이 데이터 공백으로 무효화된 코어 결함이다.

구형식 82건의 구조는 균질하지 않다(실측: `## 선택` 절 보유 12건뿐). 구조 파싱 복원은 15%만
커버하고, 전량 마이그레이션은 Tier 2(마이그레이션 하드 신호)다. 사용자 결정(2026-07-23):
**관대한 폴백** — 구조를 강요하지 않고 제목+발췌로라도 보이게 한다.

## What (변경)

- `decision.ts`에 순수 함수 `parseLegacyDecisionNote` 추가: 첫 frontmatter의 `tags`에
  `"decision"`이 있거나 `type: decision`인데 신형식 파싱이 실패한 노트를 제목+발췌로 환원.
- `mcp-server.ts`의 brief: 신형식 결정 뒤에 구형식 결정을 `□ (구형식)` 블록으로 부가하고,
  구형식 존재 시 "전제(낡음 신호) 미기록" 안내 1줄을 덧붙인다. 신형식만 있을 때의 출력은
  기존과 동일(회귀 없음).
- `search_notes`의 낡음 신호 경로는 불변(구형식은 전제가 없어 신호 대상 아님 — 외과적 변경).

## Acceptance Criteria

- [x] AC-1 (회귀): 신형식 결정만 hit되는 경우 brief 출력이 기존 형식과 동일하다 — 기존 테스트
      (AC-5·6·10) green 유지. *(검증: 기존 brief 스위트 green + legacy 0건이면 body 조립 경로가
      기존과 동일한 문자열)*
- [x] AC-2: `tags: ["decision"]` 구형식 노트가 hit되면 brief에 `(구형식)` 표기 + 제목 + 발췌 +
      노트 경로로 나타난다. *(검증: decision.test 단위 + mcp-server.test "AC-2·3" probe)*
- [x] AC-3: 구형식 항목에는 전제·⏳ 낡음 신호를 표기하지 않고, 구형식 존재 시 "전제(낡음 신호)
      미기록" 안내 1줄을 부가한다. *(검증: "AC-2·3" probe — ⏳ 부재 + 안내 문구 assert)*
- [x] AC-4: `decision` 태그 없는 일반 노트는 여전히 결정으로 표기되지 않는다(빈 브리핑 안내
      유지). *(검증: 단위 + "AC-4" probe)*
- [x] AC-5: frontmatter가 없거나 깨진 노트는 조용히 건너뛴다(기존 AC-9 계승). *(검증: 단위 —
      frontmatter 없음·깨진 YAML → null + 기존 "AC-4·9" probe green 유지)*
- [x] AC-6: 신형식+구형식 혼재 시 신형식(3층·신호)이 먼저, 구형식이 뒤에 온다. *(검증:
      "AC-6·7" probe — 순서·합산 건수 assert)*
- [x] AC-7: `type: decision`이지만 3층이 깨진 노트(choice/why 누락)도 폴백으로 표기된다(결정
      의도 손실 방지). *(검증: 단위 + "AC-6·7" probe)*

## 티어 근거

**Tier 1.** 국소 행동 변경(brief 출력 확장) — 계약(도구 스키마)·데이터 모델·직렬화 불변,
마이그레이션·보안·전역 상태 아님(하드 신호 없음). 결정적 테스트로 전체 커버 가능하고 가역적
(검증가능성 축 지지). 문서는 본 change.md 단일, critic은 in-session 적대 자기검증 1라운드.

## 검증 기록 (self-review 후 기입, 2026-07-23)

- TDD RED→GREEN: 신규 단위 8건 + probe 3건 — RED(3 fail) 확인 후 구현, GREEN.
- 전체 스위트: `npm test` 188 tests / 188 pass / 0 fail · `make check`(tsc) 통과.
- dogfood(실볼트, stdio 직결·tsx로 src 실행 — dist 무변): hint "localmind 재개편 순수 실험
  회고" → **구형식 결정 4건**(전면 재개편·홈서버 정리·순수 실험·방향 결정 B)이 제목+발췌+경로로
  표기, "전제(낡음 신호) 미기록" 안내 부가. 수정 전 동일 hint는 "결정 노트가 없습니다"였다.
  QUERY_LOG는 scratchpad로 격리(도그푸드 오염 방지 — 후속 PR 주제의 실천).
- in-session 적대 자기검증 1라운드(**비독립 명시** — 순수 실험 기간, 격리 위임 없이 현 세션
  재검토): blocker 0. 경미 관찰 2건(비차단): hit당 노트 2회 읽기(≤8건), 제목·헤딩 모두 없는
  노트의 경로 중복 표기(코스메틱).
