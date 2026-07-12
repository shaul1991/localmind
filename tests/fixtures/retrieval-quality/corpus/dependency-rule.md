---
id: EVAL-010
title: 의존성 규칙
type: reference
status: active
visibility: shared
updated_at: "2026-01-01T00:00:00Z"
---

# 의존성 규칙

업무 규칙은 데이터베이스, 웹 프레임워크, 명령줄 도구 같은 바깥 기술의 세부 구현을 직접 알지 않는다. 의존성은 바깥 장치에서 안쪽 정책으로 향하며, 안쪽 정책은 자신이 필요한 좁은 포트를 정의한다. 바깥 adapter가 그 포트를 구현하면 정책 테스트는 실제 프레임워크 없이도 실행할 수 있다.

도메인 경계는 파일 수를 늘리기 위한 형식이 아니라 상태와 결정의 소유자를 하나로 만드는 수단이다. 저장 형식의 원자성은 저장소 경계가, 실행 중 single-flight는 실행기 경계가 소유한다. 같은 mutable state를 두 모듈에 복제하지 않고 composition root가 production 인스턴스를 한 번만 조립한다.

프레임워크와 업무 규칙을 분리해도 외부 동작은 저절로 보존되지 않는다. 리팩터링 전 characterization test로 공개 반환값, 오류, 초기화 시점과 backend에 전달한 입력을 고정한다. 이후 adapter는 변환을, application core는 use case를, domain policy는 판단을 맡도록 의존 방향을 확인한다.

순환 의존을 끊기 위해 모든 코드를 공유 유틸리티로 옮기지 않는다. 순수 계산만 공용으로 두고 파일 I/O, 환경 설정, cache와 lock은 명시된 소유 경계에 남긴다. 구조 테스트와 사용자 시나리오 테스트를 함께 통과해야 분리가 완료된 것으로 본다.
