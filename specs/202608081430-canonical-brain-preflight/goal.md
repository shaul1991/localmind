# Goal — 원격 LocalMind 정본 preflight

## 문제
Claude Code의 local/project/user scope에 같은 `localmind` 이름으로 서로 다른 stdio/HTTP 등록이 남으면 연결은 성공해도 잘못된 second-brain을 조용히 선택할 수 있다. 기존 `whoami`는 hostname과 절대경로를 노출해 원격 identity 계약으로 부적합하다.

## 사용자 가치
단일 사용자(설치한 개인 누구나 — 비개발자 포함)와 위임받은 AI가 검색·저장 전에 올바른 홈서버 정본인지 확인하고, 잘못된 두뇌 쓰기를 차단한다.

## 범위
Claude Code 한 클라이언트의 읽기 전용 preflight, 공개 안전한 deployment id, 원격 문서 정합만 다룬다. 설정 자동 수정·다른 클라이언트 adapter·structured source envelope는 제외한다.

## 근거
`localmind-research-lab/reports/drafts/2026-08-08-canonical-brain-and-verifiable-sources.md`의 `implementation-candidate`.
