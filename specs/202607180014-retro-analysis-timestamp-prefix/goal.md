# Goal: retro-analysis의 spec 참조 파서를 timestamp 프리픽스에 대응시킨다

## Background — 배경

specs 폴더 프리픽스가 3자리 일련번호(`001-`)에서 생성 시점 timestamp(`YYYYMMDDHHmm`,
충돌 시 `…ss` 14자리)로 전환됐다(PR #26, 후속 정합 PR #28). 그러나 워크플로 회고 집계 모듈
`src/retro-analysis.ts`는 spec 참조를 **`\d{3}`(정확히 3자리)로 하드코딩**해 파싱한다:

- `parseCommits` — 커밋 제목에서 spec cadence 집계(5개 정규식이 `\d{3}` 고정)
- `collectDecisionNotes` — decision 노트의 spec 참조 수집(`\bspecs\/(\d{3}[\w-]*)`)

`make retro`(회고 리포트, specs/032)는 이 집계로 "어느 spec을 얼마나 다뤘나(cadence)"와
"미해결 Open questions가 어느 spec에 남았나"를 보여준다.

## Problem — 문제

timestamp 프리픽스 spec은 `\d{3}` 뒤 단어경계(`\b`)가 4번째 숫자에서 실패하므로 **cadence 집계에서
전부 조용히 누락**된다(오집계가 아니라 순수 누락 — false positive 0). decision 노트 참조는 `\d{3}`
뒤 `[\w-]*`가 나머지를 삼켜 **3자리 cadence 키와 스키마가 어긋난다**(예: `202607180014-slug` →
키 `202607180014-slug`, cadence 키는 3자리).

지금은 **잠복** 상태다 — timestamp 프리픽스 spec 폴더가 아직 0개라 현재 `make retro`는 정확하다.
그러나 이 규약이 timestamp를 정본으로 굳혔으므로 **첫 timestamp spec이 만들어지는 순간부터
회고 리포트가 손상**되기 시작한다.

## Objective — 목표

`retro-analysis`의 spec 참조 파싱이 **레거시 3자리와 timestamp(12·14자리) 프리픽스를 모두** 인식해,
timestamp 전환 이후에도 cadence·OQ·decision 참조 집계가 정확하게 유지되게 한다.

## Expected outcome — 기대 결과

timestamp 프리픽스 spec을 커밋·decision 노트·spec 폴더에서 참조할 때, `make retro` 리포트가
그 spec을 3자리 레거시와 동일하게 cadence·OQ 대시보드에 반영한다.

- [x] timestamp 프리픽스가 포함된 커밋 제목 집합을 `parseCommits`에 넣으면 해당 spec이 `specCadence`에
      집계된다(레거시 3자리와 혼재해도 각각 정확).
- [x] timestamp 프리픽스를 참조하는 decision 노트가 `collectDecisionNotes`에서 올바른 키로 수집된다
      (cadence 키 스키마와 일치).
- [x] 기존 3자리 참조 집계는 회귀 없음(현행 032 테스트 전부 green 유지).
- [x] `make retro`를 실제 실행해 timestamp spec이 리포트에 나타남을 관측(도그푸드).

## Non-goals — 비목표

- retro 리포트의 **렌더링/서식 개편**(`src/retro-note.ts`) — 파싱 인식 범위만 넓힌다.
- 검색 품질 집계(`query-analysis`) — 이 작업과 무관.
- 레거시 3자리 spec 폴더의 **마이그레이션** — 레거시는 그대로 인식 대상으로 둔다.
- 커밋 메시지 규약 자체의 변경 강제 — 파서가 실측 형식에 맞춘다(반대 아님).

## Constraints — 제약

- `retro-analysis`는 **순수 집계 모듈**(IO 없음 — 텍스트/객체 입력만)이라는 032의 경계를 지킨다.
- TDD: 실측 커밋/노트 형식을 픽스처로 고정하고 실패 테스트 먼저.
- 커밋 scope 문법의 **실측 형식**을 근거로 한다(추측된 형식에 맞추지 않는다 — 아직 timestamp
      커밋이 없으므로 형식 결정은 Open question, 아래 spec에서 확정).

## Stakeholders — 이해관계자

단일 사용자(localmind를 설치한 개인 누구나 — 비개발자 포함). 회고 리포트 소비자.

## Risks — 리스크

- **형식 미확정 리스크**: timestamp 커밋 참조의 실제 형식(`specs/{ts}-slug` vs `({ts})` vs 단축)이
  아직 관례로 굳지 않아, 잘못된 형식에 맞추면 다시 드리프트한다 → spec에서 형식을 먼저 확정.
- **키 스키마 혼재**: cadence 키가 3·12·14자리 혼재가 되면 리포트 정렬·표기가 흔들릴 수 있다 →
  키 정규화 규칙을 spec AC로 고정.
