# 컨텍스트 맵: {{프로젝트}} — 경계와 관계

> 소유: 아키텍트(architect)가 갱신합니다. 이 프로젝트의 진입점 — 어떤 경계 맥락(bounded
> context)들이 있고 서로 어떤 관계인지, 관련 문서가 어디 있는지를 담습니다.

## 1. bounded context 목록

| 이름 | 책임 한 줄 |
|---|---|
| {예: 주문} | {예: 구매 요청의 생성과 상태 관리} |
| {예: 결제} | {예: 외부 결제사 연동과 결제 상태} |

## 2. 컨텍스트 관계

실용 3종으로 표기합니다 — 의존(A가 B를 부름) · 상하류(upstream/downstream — 상류 변경이
하류를 깨뜨림) · 공유(shared kernel — 모델을 공동 소유). 심화 관계 유형은 DDD 원전 참조.

- {예: 주문 → 결제 — 상하류(결제가 상류): 결제 응답 형태가 바뀌면 주문이 깨진다}

## 3. 관련 문서

- API 계약: [api-contract.md](api-contract.md) · 환경: [environments.md](environments.md) ·
  용어집: [ubiquitous-language.md](ubiquitous-language.md)
- 디자인 토큰 정본: {예: specs/012-checkout/design.md} — **여기 복제 금지, 위치만 가리킵니다**
  (design.md가 정본).
