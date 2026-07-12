---
id: EVAL-006
title: API 토큰 교체
type: reference
status: active
visibility: shared
updated_at: "2026-01-01T00:00:00Z"
---

# API 토큰 교체

토큰 교체는 새 토큰을 먼저 발급해 제한된 요청으로 검증하는 순서로 진행한다. 새 자격 증명이 실제 서비스에서 동작하는지 health check로 확인하기 전에는 이전 토큰을 폐기하지 않는다.

health check가 성공하면 이전 토큰을 폐기하고 더 이상 사용할 수 없는지 확인한다. 토큰 값 자체는 문서나 로그에 기록하지 않고 식별 가능한 이름과 교체 상태만 남긴다.
