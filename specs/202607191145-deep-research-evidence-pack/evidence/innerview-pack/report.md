# Innerview 구현 전 심층조사

> 기준일: 2026-07-19 · run: `R-001` · 상태: completed

## TL;DR

현재 방향은 구현 가능하지만 그대로 `spec.md`로 내려가면 안 된다. PostgreSQL 18.4, Python 3.14.6,
Node 24 LTS, Next.js 16.2, Xcode 26.6/Swift 6.3, OpenAI Responses API와 `gpt-5.6-sol`은 공식 자료로
확인됐다(`C-001`, `C-002`, `C-004`). 다만 Android의 명시적 Kotlin Gradle Plugin 2.3.x + AGP 9.2
조합은 공식 문서가 충돌하므로 AGP built-in Kotlin 스파이크가 먼저다(`C-003`).

구현 전에는 outbox lease/idempotency, BFF 책임 경계, 실 PostgreSQL migration 검증, 채널별 CI 분리,
개인정보·민감정보·국외이전·AI 표시의 **적용 사실관계를 확인하는 출시 gate**를 goal/spec에
올려야 한다(`C-006`~`C-013`).

## 핵심 발견

1. PostgreSQL 18.4는 현행 지원 release이고 19는 Beta 2라 18.4 선택을 유지한다(`C-001`).
2. Python·Node·Next·Xcode/Swift의 고정값은 현행 공식 release와 정합한다(`C-002`).
3. Android는 `AGP 9.2.0 + Gradle 9.4.1 + JDK 17 + Compose BOM 2026.06.00`을 기준으로 하되,
   별도 `kotlin-android` plugin 버전은 먼저 고정하지 않는다. built-in Kotlin 빈 앱 spike로
   `assembleDebug`, unit test, instrumented-test task를 확인한다(`C-003`).
4. `gpt-5.6-sol`과 Responses API 지원은 확인됐지만 사용 계정의 entitlement는 실제 smoke request 전
   미검증이다(`C-004`, `C-005`).
5. transactional outbox는 exactly-once가 아니다. 원자적 claim, lease 만료·회수, attempt/dead 상태,
   aggregate version, 논리 작업 idempotency key, consumer 처리 원장이 필요하다(`C-006`).
6. Next.js BFF는 full backend replacement가 아니다. Python core가 도메인·인가를 소유하고 BFF는
   채널 조합·세션 adaptation·표현 변환만 담당한다(`C-007`). web UI와 web BFF를 한 deployable로
   합칠지는 공식 필수사항이 아니라 spec에서 정할 topology 결정이다.
7. migration은 빈 PostgreSQL 18에서 Alembic history를 실제 적용하고 검증한다. SQLite와
   `create_all()`은 migration 정본이 아니다(`C-008`).
8. GitHub Actions의 동일성은 같은 job host가 아니라 같은 표준 명령·계약을 뜻한다. PostgreSQL/Web은
   Ubuntu, iOS는 macOS simulator, Android instrumented test는 managed device로 분리한다(`C-009`).
9. 현재 머신은 Node 26.4와 JDK 26이므로 목표의 Node 24/JDK 17을 toolchain file과 CI setup으로
   고정해야 한다(`C-010`).
10. 실제 베타 전에는 수집 항목·처리자 관계·국외 이전·후기 대가성 등 사실관계를 확정하고,
    그 결과 적용되는 처리방침·민감정보·위탁/제3자 제공·국외이전·AI 표시·후기 표시·사고대응을
    법률/개인정보 전문가와 검수하는 출시 gate가 필요하다(`C-011`, `C-012`).
11. OpenAI API는 기본적으로 학습에 사용되지 않지만 Responses의 application state와 abuse log 보존은
    별개다. 실제 참여자 전송 전 `store:false`, background/tool 미사용, 보존·국외이전 계약을 검증한다
    (`C-013`).
12. 직업 전환 의사결정 지원으로 한정하고 진단·치료·임상 등급을 주장하지 않는다(`C-014`).

## 구현 전 권고 순서

1. goal 수정: Android binding, outbox 불변식, CI 의미, 개인정보/AI 적용성 gate를 반영한다.
2. 세 spike: Android built-in Kotlin 빌드, OpenAI 합성 입력 smoke request, GitHub macOS runner의
   Xcode 26.6 capability probe.
3. toolchain pin: Node 24.x, JDK 17, Python 3.14.6, Xcode 26.6, Gradle wrapper 9.4.1.
4. 그 뒤 `spec.md`와 `plan.md`를 작성한다. 성능 수치, polling interval, batch/lease/dead threshold는
   측정 전 확정하지 않는다.

## 상충·한계·Open questions

- Kotlin의 KGP/AGP 호환표와 Android의 AGP 예시가 충돌한다. 문서 추측 대신 build spike로 닫는다.
- 사용 계정의 `gpt-5.6-sol` 접근권과 GitHub runner의 Xcode 26.6 탑재는 미검증이다.
- web UI와 web BFF의 동일 deployable 여부는 공식 문서가 강제하지 않는다. 사용자 요구와 운영 단순성을
  함께 보고 spec에서 결정한다.
- 이 조사는 법률 자문이 아니다. 실제 사업자·공급자·데이터 흐름·자동화 수준·후기 대가성이 정해진
  뒤 한국 법률/개인정보 전문가가 적용 여부를 검토해야 한다.

## 실행 투명성

세 개의 격리 read-only lane이 기술 스택, 아키텍처/CI, 한국 법·정책을 공식 T1/T2 자료로 조사했다.
OpenAI 공식 문서 MCP는 등록했으나 현재 세션에 즉시 노출되지 않아 공식 OpenAI 도메인만 fallback으로
사용했다. 최종 critic은 별도 격리 컨텍스트에서 수행했다. 저장은 사용자가 승인한 LocalMind 도그푸드
범위에 따라 별도 evidence-pack workflow로 이 임시 경로에만 수행했다.
