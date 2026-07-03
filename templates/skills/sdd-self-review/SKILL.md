---
name: sdd-self-review
description: /goal 구현 완료 직후의 self-review 오케스트레이션 — Claude 크리틱 서브에이전트(적대 리뷰)와 localmind codex 교차 검증을 함께 돌려 병합 보고한다. self-review, 자기 검토, 교차 검증이 필요할 때 사용.
---
<!-- managed-by: localmind (skill: sdd-self-review) — localmind 정본(데이터 폴더 skills/)에서 배포됨. 수정은 정본에서. -->

# SDD Self-Review — 크리틱 교차 검증 오케스트레이션

`/goal` 구현이 끝나면 이 절차로 self-review를 수행한다. 3단계를 순서대로, 생략 없이.

## 1. Claude 크리틱 적대 리뷰 (필수 — 끄지 않는다)

구현 컨텍스트와 **분리된** 크리틱 서브에이전트(Agent 도구, `critic` 타입이 있으면 그것)를
띄워 적대적으로 점검시킨다. 프롬프트에 반드시 포함할 것:

- 대상: 해당 spec의 FR/AC 목록 + 변경 파일(diff) — 경로를 명시해 직접 읽게 한다.
- 점검 4범주: ① FR/AC가 구현+테스트로 1:1 충족되는지(추적성) ② 유저 시나리오·엣지가
  실제 테스트로 커버되는지 ③ 로직·경계·에러 처리 버그 ④ 불필요한 복잡도·보안.
- 자세: "결함을 찾으러 간다"(자기확증 배제). 테스트를 직접 실행해 재현·실증하게 한다.
- 출력: 심각도(치명/중대/경미)·파일:줄·재현·제안 + 완료 가능/불가 판정.

## 2. localmind codex 교차 검증 (SDD_CROSS_REVIEW=off 로만 끌 수 있음)

**다른 모델 계열**(codex/GPT)의 두 번째 눈이다. 리뷰 프롬프트를 조립해 `localmind-review`에
stdin으로 파이프한다:

```bash
{ echo "## 검토 대상 spec AC"; sed -n '/## Acceptance Criteria/,/## Open questions/p' specs/<NNN>-*/spec.md;
  echo "## 구현 diff"; git diff HEAD~1; } | localmind-review
```

- 프롬프트에는 **spec의 AC 전문 + 관련 파일의 diff 원문**을 담는다 — 요약하지 말되,
  무관한 파일(문서·락파일 등)은 diff에서 제외해 프롬프트를 줄인다. codex high는 콤팩트한
  입력도 4분 안팎이 걸린다(실측) — 입력이 크면 시간 초과로 생략된다.
- 출력이 `codex 교차 검증 생략(사유)`이면 — codex 미설치·프로필 없음·시간 초과 등 — 그대로
  받아들이고 3단계 보고에 **생략 사유를 명시**한다. 재시도·우회하지 않는다.
- `localmind-review`를 찾을 수 없으면(PATH 없음) localmind 저장소의
  `npx tsx src/agents/cross-review-cli.ts`로 대체하고, 그것도 불가하면 "교차 생략(도구 없음)"으로
  보고한다.

## 3. 병합·보고

1·2의 발견을 **하나의 self-review 보고**로 합친다:

- **차단(blocking)**: 어느 쪽이 찾았든 치명·중대 결함과 미충족 AC — `/goal` 5단계의
  수정→재검 루프로 넘긴다(이 스킬은 보고까지만 — 스스로 수정하지 않는다). 수정 후에는
  1단계부터 다시 돈다(clean까지).
- **조언(advisory)**: 참고로 표기만 한다. 수정을 강제하지 않는다.
- **교차 상태를 반드시 명시**: codex가 돌았으면 "교차 검증: claude+codex", 생략됐으면
  "교차 검증: 생략(사유)" — **교차 없이 "교차 검증됨"으로 보고하는 것을 금지**한다.
- 판단이 애매하거나 트레이드오프인 사안만 사용자에게 올린다.

완료 기준: 치명·중대 0 + 테스트 green + AC 전부 충족(미충족분은 사용자에게 명시 보고).
