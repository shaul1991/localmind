---
audience: both
---

# plan — critic 효율화: 렌즈 병렬 fan-out + 결정적 사전 게이트 + 텔레메트리

## 도메인 경계

세 층이 섞이지 않게 나눈다.

- **워크플로 계약(instruction)** — 스킬·에이전트 템플릿의 마크다운 텍스트. 렌즈 병렬 절차(FR-1·2),
  preflight 게이트 문구(FR-4), evidence 스키마 명문화(FR-5 일부). 정본은 `templates/` 아래이고
  배포는 기존 deploy 파이프라인(바이트 복사)이 담당 — 이 슬라이스는 배포 메커니즘을 건드리지
  않는다.
- **결정적 검사·집계(코드)** — `src/`의 순수 모듈(IO 없음) + `scripts/` 얇은 진입점. preflight
  검사기(FR-3), retro 집계기(FR-6). LLM 판단 불포함(hermetic).
- **불변 계약(비회귀)** — 라운드 전량 재검증·도장찍기 금지·round 예산·within-run 한정은 이
  슬라이스의 변경 대상이 아니며, 기존 계약 테스트가 green으로 유지되는지로 확인한다(AC-13).

용어(유비쿼터스): **렌즈(lens)** = critic 점검 축 5개 중 하나를 전담하는 관점. **preflight** =
critic 착수 전 결정적 형식 검사. **merged report** = 같은 candidate에 대한 모든 리뷰어 findings의
병합 보고(= round 1개, 기존 정의 그대로).

## 영향 모듈

| 구분 | 경로 | 변경 |
|---|---|---|
| 수정 | `templates/skills/sdd-self-review/SKILL.md` | 2A절 뒤에 렌즈 병렬 실행 절차(FR-1)·병합 규칙(FR-2), 5단계에 preflight 게이트·frontmatter 스키마 준수(FR-4·5) |
| 수정 | `templates/skills/goal-impl/SKILL.md` | self-review 위임 직전 preflight 실행 게이트 1절(FR-4) |
| 신규 | `src/review-preflight.ts` | 순수 검사 모듈: 임시경로 evidence·merged report 필드·matrix 전수 대응(FR-3a·c·d). diff 검사(FR-3b)는 진입점이 `git diff --check` 결과 텍스트를 넘겨 판정만 순수로 |
| 신규 | `src/review-preflight.test.ts` | AC-3~6 단위 테스트(픽스처 기반) |
| 신규 | `scripts/review-preflight.ts` | 얇은 IO 진입점(파일 읽기·git 실행·exit code) |
| 신규 | `scripts/review-preflight.test.mjs` | AC-4·7 통합 테스트(일회용 저장소에서 진입점 실행 — 테스트 러너의 `scripts/*.test.mjs` glob 준수) |
| 수정 | `package.json` | `review:preflight` script 추가 |
| 신규 | `templates/sdd/self-review-evidence.template.md` | FR-5 frontmatter 표준 템플릿(필수 7·선택 2) |
| 수정 | `src/retro-analysis.ts` | self-review evidence 집계 함수 추가(FR-6, 순수 — 텍스트 입력) |
| 수정 | `src/retro-analysis.test.ts` | AC-10~11 단위 테스트 |
| 수정 | `src/retro-note.ts` | "self-review 라운드 집계" 절 렌더(AC-12, 미준수 건수 표기 포함) |
| 수정 | `scripts/retro-report.ts` | evidence 파일 glob·읽기 배선(현행은 spec.md만 읽음) → 순수 집계 함수에 텍스트 전달, RetroAggregate 확장 |
| 수정 | `src/agents/workflow-policy.test.ts` | AC-1·2·8·9 문구 계약 테스트 추가 + 기존 계약 green 확인(AC-13) |
| 수정 | `AGENTS.md` | critic 캐싱 절에 최소 포인터 1~2문장(렌즈 병렬은 round 산정 불변·preflight는 critic 전 게이트) — OQ-3 확정 반영 |

진입점·retro 배선은 기존 3분할 관례(순수 모듈 / 얇은 IO / 렌더)를 그대로 따른다.

## 단계

1. **Phase 1 — preflight 검사 모듈(TDD)**: AC-3~6 실패 테스트 → `src/review-preflight.ts` 구현
   → green. 픽스처는 테스트 내 인라인 텍스트(실제 spec 폴더 의존 금지).
2. **Phase 2 — preflight 진입점·배선**: `scripts/review-preflight.ts` + `package.json` script.
   AC-7은 일회용 픽스처 spec 디렉토리로 통합 검증.
3. **Phase 3 — 텔레메트리(TDD)**: AC-10~12 실패 테스트 → `retro-analysis.ts` 집계 함수·
   `retro-note.ts` 렌더 → green. FR-5 템플릿 작성.
4. **Phase 4 — 스킬·규약 문구**: sdd-self-review·goal-impl 스킬 개정(FR-1·2·4·5), AGENTS.md
   최소 포인터. workflow-policy 계약 테스트 추가(AC-1·2·8·9) + 전체 green(AC-13).
5. **Phase 5 — dogfood**: 이 spec 자체를 대상으로 preflight를 실제 실행해 관찰(자기 적용).
   retro 진입점 실행으로 집계 절 확인.

## 테스트 전략

- 단위(순수 모듈): AC-3·5·6·10·11·12 — 인라인 픽스처, IO 없음. AC-4의 **판정 함수**(diff
  --check 출력 텍스트 → 위반 목록)도 단위로 커버한다.
- 통합(진입점): AC-4·7 — `scripts/review-preflight.test.mjs`가 일회용 디렉토리/저장소에서
  진입점을 실제 실행(위반 트리 비0·정상 트리 0).
- 계약(문구): AC-1·2·8·9·13 — 배포 산출물 텍스트 검사(기존 workflow-policy 관례).
- 도그푸드: Phase 5 — 실제 실행 관찰(테스트 green만으로 완료하지 않음).

## Verification matrix

| AC | 검증 방법·레벨 | 최소 evidence | 통과·종료 조건 | 상태 |
|---|---|---|---|---|
| AC-1 | 계약(unit) — 배포 스킬 텍스트 검사 | workflow-policy 테스트 케이스·실행 로그 | 렌즈 병렬 절차·round 불변 문구 존재, green | ✅ r1 clean |
| AC-2 | 계약(unit) — 배포 스킬 텍스트 검사 | 동일 테스트 실행 로그 | dedup·보수 병합·렌즈 표기 문구 존재, green | ✅ r1 clean |
| AC-3 | 단위 — 인라인 픽스처 | `review-preflight.test.ts` 케이스·로그 | 임시경로 단독 fail·versioned 병기 pass, green | ✅ r1 clean |
| AC-4 | 단위(판정 함수) + 통합(`scripts/review-preflight.test.mjs`) | 양쪽 테스트 로그 | 위반 출력 fail·빈 출력 pass(단위) + 위반 트리 비0·정상 0(통합), green | ✅ r1 clean |
| AC-5 | 단위 — 인라인 픽스처(FR-5 필수 7필드셋) | 테스트 케이스·로그 | 누락 필드명 보고 fail·7필드 pass, green | ✅ r1 clean |
| AC-6 | 단위 — 인라인 픽스처 | 테스트 케이스·로그 | 누락 AC 보고 fail·전수 대응 pass, green | ✅ r1 clean |
| AC-7 | 통합 — `npm run review:preflight` 실제 실행 | 실행 출력·exit code 캡처 | 위반 시 비0·clean 시 0 관찰 | ✅ r1 clean |
| AC-8 | 계약(unit) — 배포 스킬 텍스트 검사 | workflow-policy 테스트 로그 | 게이트·비근거·instruction-level 문구 존재, green | ✅ r1 clean |
| AC-9 | 계약(unit) — 템플릿·스킬 텍스트 검사 | 테스트 로그 | 필수 7·선택 2필드(단일 필드셋)·SKILL §5 개정·준수 문구 존재, green | ✅ r1 clean |
| AC-10 | 단위 — 집계 함수 픽스처 | `retro-analysis.test.ts` 로그 | 라운드·blocker·completion 일치, green | ✅ r1 clean |
| AC-11 | 단위 — 레거시 픽스처 2종(필드 누락·frontmatter 부재) | 테스트 로그 | 예외 없이 미준수 구분 집계(건수 표기), green | ✅ r1 clean |
| AC-12 | 단위 — 렌더 함수(+`scripts/retro-report.ts` 배선은 dogfood로 관찰) | 테스트 로그·retro 실행 출력 | 집계 절 렌더 확인, green | ✅ r1 clean |
| AC-13 | 계약(unit) — 기존 스위트 전체 실행 | 전체 테스트 실행 로그 | 기존 문구 계약 전부 green(회귀 0) | ✅ r1 clean |

모든 AC가 정확히 한 행에 대응한다. 필수 검증 capability 결손 없음(전부 로컬 테스트·실행으로
검증 가능). 이 matrix는 구현 워크플로가 첫 dogfood 직전 freeze할 입력이다.
