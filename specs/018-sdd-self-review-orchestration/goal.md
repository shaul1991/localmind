# Goal: SDD Self-Review Orchestration — 크리틱 교차 검증 배관

> **044 확장/대체 포인터**: specs/044(공급자 중립 AI 워크플로 자산)가 provider/model-specific orchestration(FR-1/4), old `/goal` 기본 trigger(FR-6), Claude-only fallback(FR-7), Claude-only copy(FR-8), provider-specific 문서(FR-10)를 **대체**한다. FR-2/3의 structured transport/output, FR-5의 report-only ownership, FR-6의 optional adapter toggle은 **유지**된다. FR-8의 backup/index/unmanaged invariants·FR-9 speckit 불가침은 044 FR-11/13이, plain observability·toggle·judgment 문서 의무는 044 FR-12/13이 **흡수**한다. `localmind-review` binary와 cross-review API는 optional adapter로 보존된다. 과거 검증 체크는 다시 쓰지 않는다.

## Background — 배경

specs/016으로 페르소나 정의를 정본 관리·배포하고, specs/017로 localmind 런타임(지식
워크플로우)이 페르소나에게 자동 위임하게 됐다. 이 작업은 3단계 로드맵(레지스트리 →
런타임 위임 → **오케스트레이션**)의 **마지막 단계**로, 개입 무대를 지식 워크플로우에서
**SDD 워크플로우**로 옮긴다.

계기는 실측된 경험이다. specs/017 스펙을 만들 때 사람이 손으로 "인터뷰어·아키텍트·크리틱
3중 검토 → 사용자 결정 → 반영 → 크리틱 재검" 사이클을 두 번 돌렸고, 특히 **크리틱을
Claude(Opus)와 Codex(GPT) 두 계열로 교차**시키니 한 모델 계열이 놓치는 맹점이 드러났다.
docs/personas.md는 이 교차 검증을 self-review 규약(AGENTS.md `/goal` 5단계)의 정식
배관으로 만드는 것을 018의 범위로 지정했다(2026-07-03 인터뷰).

`/goal`의 self-review 단계는 이미 "생략 불가"로 존재하지만, 지금은 구현 컨텍스트와 같은
Claude 계열 안에서만 돈다 — 교차 검증(Codex)은 사람이 매번 손으로 붙여야 한다. 018은
이 손작업을 배관한다.

## Problem — 문제

- **self-review의 교차성이 수동이다**: `/goal` self-review는 Claude 단독으로 돌아, 같은
  모델 계열의 맹점을 공유한다. Codex 교차는 사람이 매번 `codex exec`를 손으로 붙여야 하고,
  산출을 파싱해 결함으로 정리하는 것도 수작업이다.
- **교차 크리틱의 산출이 구조화돼 있지 않다**: 손으로 받은 Codex 리뷰는 자유 텍스트라,
  "무엇이 차단 결함이고 무엇이 조언인지"를 사람이 다시 읽어 분류해야 게이팅에 쓸 수 있다.
- **배관을 담을 자산의 관리처가 없다**: 이 교차 검증을 재현·배포·백업할 정본 자산(스킬·
  스크립트)의 관리 방식이 016 Open question으로 미뤄져 있었다.

## Objective — 목표

`/goal`의 self-review 단계에서 **크리틱 교차 검증이 자동으로 발화**하게 배관한다:
Claude(Opus) 크리틱과 **localmind가 소유하는 Codex 교차 검증 스크립트**를 함께 돌려,
서로 다른 모델 계열이 구현·spec을 적대적으로 검토하고, 그 결과를 **구조화된 산출 계약**
(차단 결함·조언 분리)으로 병합해 보고한다. 조율은 Claude Code 스킬이, Codex 교차는
localmind 소유 스크립트가 맡는 **하이브리드**로 구성한다.

## Expected outcome — 기대 결과

- `/goal` self-review 단계가 Claude 단독이 아니라 **두 모델 계열의 교차 검증**으로 돈다 —
  손으로 Codex를 붙이던 작업이 사라진다.
- 교차 크리틱의 산출이 `{판정, 차단 결함[], 조언[]}` 구조로 나와, 차단 결함은 수정
  대상으로 게이팅되고 조언은 보고만 된다 — 사람이 자유 텍스트를 재분류할 필요가 없다.
- 배관 자산(조율 스킬·Codex 스크립트)이 데이터 폴더 정본으로 관리되고, 기존 백업에
  실려 새 기기에서 복사 배포로 재현된다 — 016 Open question이 닫힌다.

## Success metrics — 성공 지표

- self-review 시점에 Claude 크리틱과 Codex 교차 스크립트가 **둘 다 발화**하고, 서로 다른
  백엔드가 쓰였음이 산출에 드러난다(테스트로 재현).
- 교차 크리틱 산출이 `{판정, 차단 결함[], 조언[]}` 스키마를 만족한다(스키마 불준수 응답은
  검증 생략으로 처리되고 self-review 자체는 실패하지 않는다).
- Codex 미설치·크리틱 페르소나 부재·스키마 불준수 어느 경우에도 **Claude 단독 self-review는
  정상 완수**되고, 교차가 빠진 사유만 표시된다.
- 교차 발화를 환경변수 하나로 끌 수 있다.
- 배관 자산이 `make backup`에 포함되고, 복사 배포가 마커 없는 사용자 파일을 건드리지 않는다.

## Non-goals — 비목표

- **SDD 전 단계 팬아웃**(specify/plan/tasks 각 단계의 페르소나 서브에이전트 위임) —
  이번 범위 아님. 교차 검증(self-review)에서 감을 확보한 뒤 **후속 스펙**으로 다룬다.
- **기존 speckit SKILL 대체·은퇴** — speckit-{specify,plan,tasks} 등과는 **공존**한다(표면이
  겹치지 않음). 018은 이들을 수정·삭제하지 않는다. 패턴(4팬아웃·boundary preamble) 계승은
  docs/personas.md 소관.
- **Codex 병렬 구현 워커** — docs/personas.md의 "교차 검증만 먼저" 결정을 계승, 보류.
- **수정→재검 반복 루프의 자동화** — 크리틱은 결함을 **보고**만 한다. 수정·재검 반복은
  `/goal` 흐름(AGENTS.md 5단계)이 소유하며, 차단 결함 배열이 그 루프의 종료 신호가 된다.
- **훅 기반 완전 자동 트리거** — `/goal` self-review 단계 내 기본 발화까지만. 파일 저장
  훅 등 무대 밖 자동 발화는 이번 범위 아님.
- **페르소나 구성 변경·레지스트리 스키마 확장** — docs/personas.md·016 소관.

## Constraints — 제약

- **self-review 규약이 우선한다**: 교차 검증(Codex)이 불가능해도 `/goal` self-review 자체는
  규약상 생략 불가다 — Claude 단독으로라도 반드시 수행되고, 교차가 빠진 사유만 표시된다.
  (017 런타임의 "완전 무음 폴백"과 다른 지점 — self-review는 항상 수행된다.)
- **본래 기능 불가침**: 배관·발화·복사 배포는 기존 speckit 스킬과 사용자가 직접 만든
  파일을 건드리지 않는다(016 managed 마커 불가침 원칙 계승).
- **추가 요금 없음**: Codex 교차는 구독 CLI(`codex exec`) 경유 — 메터드 API 금지.
- **비개발자가 이해할 수 있는 표시·메시지·문서.**
- **정본-파생 일관성**: 배관 자산의 정본은 데이터 폴더 하나뿐이고, 배포는 변환 없는
  복사다 — 파생을 고치지 말고 정본에서 고친다.

## Stakeholders — 이해관계자

- 단일 사용자(설치한 개인 누구나 — 비개발자 포함). SDD 흐름(`/goal`)을 쓰는 사용자는
  교차 검증 효과를, Codex를 설치하지 않은 사용자는 Claude 단독 self-review를 얻는다.

## Risks — 리스크

- **self-review 지연·쿼터 잠식**: 교차 검증은 self-review에 Codex LLM 호출을 더한다
  (017 실측: codex 경유 1회 ~12k 토큰·수십 초) → 끄기 env + 시간 상한으로 통제한다.
- **교차 크리틱 오판**: Codex가 정상 구현에 차단 결함을 붙일 수 있다 → 판단은 사람에게
  남고, 산출에 "추정"·근거를 명시한다. 차단/조언 분리로 게이팅 부담을 낮춘다.
- **스키마 불준수 응답**: Codex가 자유 텍스트를 반환하면 파싱이 깨진다 → 관대한 추출
  후 실패 시 그 검증만 생략(017 `parseVerdict` 계열 — 답변을 볼모로 잡지 않음).
- **복사 배포 충돌**: Claude Code 스킬 위치에 동명 사용자 파일이 있으면 덮어쓸 위험 →
  managed 마커 있는 것만 갱신·경고(016 FR-5 계승).
- **speckit 표면 충돌**: 공존 결정이 실제로 겹치지 않는지 도그푸드로 확인해야 한다.
