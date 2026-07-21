---
audience: both
---

# plan — 살아있는 기억

> **경로 전제**: 이 plan의 파일 경로는 **great-reduction(A+B) 이후** 기준이다 — 도구 3개
> (capture_note·search_notes·whoami)만 남은 mcp-server.ts와 슬림화된 brain.ts 위에 얹는다.
> A+B 구현이 파일을 이동/개명하면 구현 착수 시점의 실경로로 정합한다.

## 도메인 경계 (DDD)

- **Decision** (신규 Value 구조): `choice`(불변) · `why`(불변) · `Assumption[]`. Assumption =
  `fact` + `volatility(high|low)` + `lastVerified(ISO)`. 노트 frontmatter로 직렬화 — 노트가
  Aggregate Root(파일 1개 = 결정 1개), 별도 저장소 없음.
- **Briefing** (신규 읽기 모델): 힌트 → 관련 결정 요약 + 낡음 신호. 상태 없음 — 조회 시 계산.
- **유비쿼터스 언어**: 결정(decision)·전제(assumption)·휘발성(volatility)·재검증(re-verify)·
  브리핑(brief)·낡음 신호(stale signal). vision §4·§5의 용어를 그대로 쓴다.

## 영향 모듈

| 모듈 | 변경 |
|---|---|
| 노트 frontmatter 파싱/직렬화 (brain.ts 내 노트 계열) | Decision 스키마 파싱·검증·직렬화 추가 |
| src/mcp-server.ts | capture_note 입력 스키마 확장 · brief 도구 등록 · search_notes/brief 응답에 신호 부가 |
| src/decision.ts (신규) | Decision 파싱·검증·낡음 판정(staleness) 순수 함수 — IO 없음 |
| docs/usage.md·mcp.md | 결정 캡처·brief 연결(CLAUDE.md 한 줄)·재검증 관례 안내 (AC-12) |
| .env.example | BRIEF_STALE_DAYS (기본 30) |

## 단계

1. **P0 — Decision 도메인 (TDD)**: decision.ts 순수 함수 — 파싱·검증(AC-3)·직렬화(AC-1 구조)·
   낡음 판정(AC-7·8·10의 판정 로직). 실패 테스트 먼저.
2. **P1 — capture 확장**: capture_note 스키마 확장 + 비정형 경로 비회귀(AC-2)·단일 호출
   완결(AC-11).
3. **P2 — brief 도구**: 등록·힌트 검색(현행 스택 재사용 — OQ-C2)·요약 조립·빈 브리핑(AC-5·6).
4. **P3 — 낡음 신호**: search_notes·brief 응답 부가(AC-7·8)·깨진 frontmatter 내성(AC-9)·
   재검증 반영(AC-10)·기존 노트 비회귀(AC-4).
5. **P4 — docs·도그푸드·self-review**: AC-12 문서, 실제 결정 노트로 brief 도그푸드, 격리
   self-review.

## 테스트 전략 (AC → 레벨)

- 단위(decision.ts): AC-1 구조·AC-3 검증·AC-7/8/10 판정 로직.
- 통합(mcp-server 계약 테스트, 임시 노트 폴더): AC-2·4·5·6·9·11 + 신호 부가의 응답 형태(AC-7).
- 문서/도그푸드: AC-12 + Success metrics의 brief 실증.
- **§6 불변식은 AC-6·7(본문 무변)·9·11이 테스트로 강제** — 비차단·사이드이펙트 성립.
