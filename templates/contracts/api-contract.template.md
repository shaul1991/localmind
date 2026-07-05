# API 계약: {{프로젝트}}

> 소유: backend-dev — **API를 바꾸면 이 문서를 같은 작업에서 함께 갱신합니다**(계약이 정본 —
> 코드와 다르면 계약이 이깁니다). 소비: frontend-dev·ios-dev·android-dev.
> 위치: 노트 폴더의 `projects/<프로젝트 이름>/api-contract.md`

## 공통

- 에러 표면: {예: `{"error": {"code": "SNAKE_CASE", "message": "평이한 한국어"}}`}
- 인증 방식: {예: Authorization 헤더 — 상세는 인증 담당(auth-dev) 구현 참조}

## 엔드포인트

### {예: POST /notes}

- 목적: {예: 메모 생성}
- 요청: {예: `{"text": "문자열(필수, 공백만은 불가)"}`}
- 응답: {예: 201 — `{"id", "text", "createdAt"}`}
- 상태 코드: {예: 400 검증 실패 · 413 본문 과대 · 500 서버 오류}
