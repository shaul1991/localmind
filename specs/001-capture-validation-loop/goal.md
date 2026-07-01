# Goal: Capture Validation Loop (캡처 직후 재검색 검증)

## Background — 배경

localmind의 `capture_note` 는 `.md` 파일 저장 + 임베딩 인덱싱까지 포함한다.
그러나 현재는 파일 쓰기와 인덱스 갱신이 성공했다는 로그만 있을 뿐,
실제로 "방금 저장한 내용이 `search_notes` / `recall` 로 검색 가능한가"를 확인하는
구조가 없다. 이 검증 공백이 Loop 2(검증 루프) 도입의 출발점이다.

## Problem — 문제

- `capture_note` 가 HTTP 200을 반환해도 임베딩 실패·청크 누락·인덱스 stale 등의 이유로
  나중에 `search_notes` 에서 해당 내용이 히트되지 않을 수 있다.
- 사용자는 저장됐다고 믿고 지나가지만, 실제로는 기억이 사라진 상태다.
- 문제는 나중에 (`ask_brain` 오답, `recall` 누락) 뒤늦게 발견되며 원인을 알기 어렵다.

## Objective — 목표

`capture_note` 완료 직후 저장된 내용이 검색 가능한 상태인지 자동으로 확인하고,
실패 시 즉시 사용자에게 알린다. "저장 성공 = 검색 가능"을 보장한다.

## Expected outcome — 기대 결과

- `capture_note` 응답에 "캡처 완료 + 인덱싱 확인됨" 또는 "캡처 완료 + 인덱싱 실패(경고)" 가 포함된다.
- 인덱싱 실패 시 reindex 재시도가 자동으로 한 번 수행된다.
- 사용자는 캡처 즉시 "이 내용이 나중에 검색된다"는 확신을 얻는다.

## Success metrics — 성공 지표

- `capture_note` 후 즉시 핵심 키워드로 `search_notes` 재검색 시 히트율 ≥ 95%
- 인덱싱 실패 시 경고가 응답에 포함되는 비율 = 100%
- 재시도 후 복구율 측정 가능(로그 기반)

## Non-goals — 비목표

- 검색 품질(관련성 순위) 개선은 이번 범위 밖
- `remember`(OpenMemory) 레이어의 검증은 이번 범위 밖 — `search_notes` / `ask_brain` RAG 레이어만
- 캡처 내용의 의미적 정확성(hallucination) 검증은 002에서 다룸

## Constraints — 제약

- 재검색은 MCP stdio 응답 안에서 완료돼야 함 (추가 왕복 HTTP 없이 프로세스 내에서)
- 지연 증가는 허용 범위: 재검색 1회 추가 ≤ 500ms (임베딩 벡터화 포함)
- localmind 스택(게이트웨이 :4000 / 임베딩)이 떠 있는 상태에서만 동작 — offline 시 graceful fallback
- TypeScript, 기존 `brain.ts` 모듈 패턴 유지

## Stakeholders — 이해관계자

- 단일 사용자(설치한 개인 누구나 — 비개발자 포함) — 개인 second-brain 신뢰성 향상

## Risks — 리스크

- 재검색 키워드 추출 품질: 노트 내용에서 핵심 키워드를 잘못 뽑으면 false negative 발생
- 재시도 중 임베딩 서버 다운: 재시도도 실패하는 케이스를 graceful하게 처리해야 함
- 성능: 캡처가 잦을 경우 재검색 누적 지연이 체감될 수 있음
