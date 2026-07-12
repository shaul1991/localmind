---
id: EVAL-005
title: 장치 백업 런북
type: reference
status: active
visibility: shared
updated_at: "2026-01-01T00:00:00Z"
---

# 장치 백업 런북

장치의 변경분은 15분 주기로 staging 영역에 모아 백업한다. staging은 전송 중 실패가 canonical 원본을 훼손하지 않도록 원본과 분리한다.

한 주기의 백업이 실패하면 원본을 지우거나 성공으로 표시하지 않는다. 실패 내역을 남기고 다음 15분 주기에서 다시 시도하며, 복구 검증이 끝날 때까지 canonical 데이터를 보호한다.
