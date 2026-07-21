---
audience: both
tier: 1-experiment (read-only 실험 — 코드·데이터 무변경, 산출물은 evidence뿐)
---

# goal — 검색 스택 실험 (OQ-V2: 임베딩 존폐 판정 근거)

- **Background**: product-vision(§8 OQ-V2)이 검색의 목적을 "why(결정) 소환"으로 좁혔다.
  현행 임베딩 검색(Ollama bge-m3·cosine-full-scan)은 이 좁은 목적에 과한 스택일 수 있고,
  체감 품질 문제("나오는데 원하는 게 아님")가 임베딩 유사도의 특성일 가능성이 제기됐다.
- **Problem**: 임베딩 유지/제거는 설치 마찰(Ollama 의존)·재색인 비용(~13분)·아키텍처 복잡도를
  좌우하는 갈림인데, 판단 근거가 체감뿐이다.
- **Objective**: 실쿼리(서버 87건 + 로컬 42건 로그)로 [A 임베딩] vs [B 구조 검색 베이스라인]을
  나란히 비교해 **판정 권고안**을 생산한다. 최종 결정은 사용자 게이트.
- **Success metrics**: 대표 쿼리 ≥15개에 대해 양쪽 top-5 비교표 + A승/B승/무 집계 + 권고안
  1개가 evidence로 존재.
- **Non-goals**: 검색 코드 변경(great-reduction 슬라이스 소관), ground-truth 라벨셋 구축,
  하이브리드 구현.
- **Constraints**: read-only — 노트·색인·프로덕션 query-log 무오염(실험 호출은 QUERY_LOG를
  스크래치로 격리). 신규 의존성 0. vision §6 비침습 불변식은 **해당 없음**(사용자 흐름을
  건드리는 기능이 아님 — read-only 실험).
- **Stakeholders**: 단일 사용자(설치한 개인 누구나 — 비개발자 포함. 임베딩 제거 시 설치
  마찰이 급감하므로 이해관계 직접).
- **Risks**: judge 단일(LLM 1회 판정)·라벨 부재 → 권고의 확신도를 낮춰 표기, 뒤집을 신호를
  명시.
