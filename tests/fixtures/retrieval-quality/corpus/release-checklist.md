---
id: EVAL-011
title: 릴리스 체크리스트
type: reference
status: active
visibility: shared
updated_at: "2026-01-01T00:00:00Z"
---

# 릴리스 체크리스트

릴리스 tag를 만들기 전에 자동 테스트가 통과했는지 확인하고 사용자에게 보이는 변경을 changelog에 기록한다. 결과가 불확실한 검증을 성공으로 표시하지 않는다.

tag 이후 문제가 생길 때 사용할 rollback 절차와 이전 버전을 확인한다. 테스트, changelog, tag, rollback 네 항목이 모두 확인되어야 릴리스 점검을 닫는다.
