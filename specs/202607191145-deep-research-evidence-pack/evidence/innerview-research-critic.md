---
title: Innerview research final critic raw result
audience: both
---

# Innerview research final critic 원문

## 최초 검수 원문

> 실행 상태: 독립 fresh critic, read-only, 파일 수정 없음.

## Critic result: FAIL — 1 blocker

### Blocker

- **법률 문구 과잉 확정:** “처리방침·민감정보·위탁/국외이전·AI 표시·무료후기 표시·사고대응이 모두
  필수”는 서비스의 실제 데이터, 처리자 관계, 국외 이전, 자동화 수준, 후기의 대가성에 따라 적용 여부가
  달라진다. 이를 일괄 의무로 확정하지 말고, **사실관계별 적용성 체크리스트 + 출시 전 한국 변호사/
  개인정보 전문가 검토 필요**로 수정해야 한다. 자동화 결정·의료 적용도 동일하게 조건부이며 법률
  자문으로 표현하면 안 된다.

### Advisories

- **Android:** 현재 `contested` 처리가 정확하다. AGP 9.2는 Gradle 9.4.1/JDK 17을 공식 요구하지만,
  Kotlin의 KGP 호환표는 2.4.x를 AGP 9.1까지로 표시하는 반면 Android 공식 예시는 AGP 9.2 +
  KGP 2.3.21을 제시한다. “완전 호환”을 선언하지 말고 built-in Kotlin 최소 프로젝트의
  sync/build/test 스파이크가 GREEN일 때만 핀을 확정하라.
- **Next.js BFF:** `apps/web`에 UI와 Route Handler BFF를 함께 두고, 핵심 backend를 별도 deployable로
  유지하는 권고는 과잉이 아니다. Next.js도 BFF를 지원하지만 full backend replacement가 아니라고
  명시한다. 다만 “유일한 구조”로 확정하지 말고 별도 web-BFF 프로세스를 운영 격리 대안으로 남겨야 한다.
- **Outbox:** same-transaction 기록, atomic claim, lease/reclaim, idempotency는 타당한 설계 권고다.
  deterministic order는 공정성·재현성 보조이지 정확성 보장으로 쓰지 말라. exactly-once 표현 금지는
  유지하고 retry/backoff, poison-message 격리, retention·관측성도 후속 설계에 포함하라.
- **OpenAI:** `gpt-5.6-sol` 존재는 공식 확인됐다. 다만 계정별 entitlement는 별도 런타임 확인이
  필요하다. Responses API 기본 application-state 보존은 30일이므로 개인정보 설계에서 단순 미확정으로만
  두지 말고 기본값과 ZDR/MAM 예외를 명시하라.
- **CI:** Xcode 26.6·Swift 6.3 자체는 공식 확인됐지만 GitHub-hosted runner 탑재 여부는 미검증이다.
  runner image 확인 전 필수 CI job을 그 버전에 고정하지 말라.

### Corrected verdict

기술 스택, outbox, Alembic 실 PostgreSQL 검증, CI 분리 방향은 조건부 승인 가능하다. Android는
명시적으로 contested + 스파이크 gate를 유지해야 하며, 법률 의무를 조건부 적용성으로 고치기 전에는
구현 전 조사 보고를 통과시킬 수 없다.

**Independence:** 독립 fresh critic, read-only, 파일 수정 없음. 원 lane의 전체 ledger가 아닌 제공된 핵심
draft와 공식 live source를 검수했으므로 원문별 인용 완전성 평가는 제한적이다.

## 수정 후 재검 원문

> PASS — blocker 0. 법률 적용은 사실관계 기반 출시 gate로 적절히 조건화됐고, Android 충돌도
> contested 관계로 명시됐다.

## 원문 provenance

- 최초 검수와 재검은 동일한 격리 read-only critic의 출력이다.
- 이 파일은 실행 transcript의 critic 결과를 줄바꿈만 정규화해 보존한다. 의미를 요약하거나 판정을
  바꾸지 않았다.
