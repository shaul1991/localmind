# Goal: 거버넌스 정본 동기 신선도 표시

> 모델 이력 — 작성: Opus 4.8 · 검토: Opus 4.8(critic) · 구현(예상): 미정(Sonnet/Opus)

<!-- 왜(why). 048 거버넌스 뷰어의 작은 후속 증분. -->

## Background — 배경

localmind는 **중앙집중 MCP 모델**이다 — 노트·메모리 정본은 home-server(`/root/.localmind`, MCP
`localmind-remote`)에 있고 m1/m5는 MCP로 접근한다. 그러나 **규칙/스킬은 하드주입(CLAUDE.md/AGENTS.md)
때문에 각 기기에 로컬 배포가 필수**(specs/041 D1) — MCP 런타임 pull 불가. 그래서 각 기기의
`~/.localmind`는 정본(git `localmind-backup`)의 **로컬 복제본**이고, 048 웹 뷰어는 그 **로컬** 사본을
읽는다(중앙 정본이 아님).

## Problem — 문제

048 뷰어는 로컬 복제본을 보여주지만 **그 복제본이 정본과 얼마나 최신인지(동기 신선도)를 알 수 없다.**
복제본이 정본과 어긋나 있어도(예: home-server가 git 클론이 아니라 규칙 0이던 드리프트) 뷰에선 그냥
"로컬에 있는 것"으로만 보여 **조용한 드리프트**가 된다.

## Objective — 목표

거버넌스 페이지에 **정본 동기 신선도**를 표시한다 — 로컬 `~/.localmind`가 정본(`localmind-backup`)을
**마지막으로 동기화한 시점**과, **git 동기가 아예 안 된 경우 경고**를. 로컬 복제본을 계속 보여주되
(모델 유지), "이게 얼마나 최신인가"를 가시화해 드리프트를 드러낸다.

## Expected outcome — 기대 결과

- 거버넌스 페이지 상단에 "정본 동기: <시점>" 신선도 표시.
- 로컬이 git 클론이 아니거나 origin이 localmind-backup이 아니면 **경고**(home-server식 드리프트 즉시 표면화).
- 사용자가 "지금 보는 규칙이 정본 기준 며칠 전 것인지"를 안다.

## Success metrics — 성공 지표

- [x] 거버넌스 페이지에 로컬 `~/.localmind`의 **마지막 정본 fetch/pull 시점 + HEAD 커밋 시점**이 표시된다.
- [x] 로컬이 **git 동기 아님**(클론 아님/무remote)이면 **경고 배지**로 표면화된다.
- [x] read-only 유지 — 이 표시는 조회일 뿐, 동기화를 수행하지 않는다(동기는 `make update`).

## Non-goals — 비목표

- **웹에서 동기 실행**(pull/update) — 표시만. 동기는 CLI `make update`.
- **live behind-count(원격 fetch)** — 로드마다 네트워크 fetch 금지(느림·부작용). 로컬 신호(FETCH_HEAD·
  HEAD)만. behind-count는 후속 옵션.
- **규칙 배포 모델 변경** — specs/041 로컬 배포 유지. 이건 *신선도 표시*일 뿐.

## Constraints — 제약

- read-only·localhost(048 계승) · 기존 SPA 토큰·컴포넌트 재사용(badge/dim, 신규 디자인 언어 금지).
- 네트워크 fetch 없이 **로컬 git 메타**(`.git/FETCH_HEAD` mtime·HEAD 커밋 date·remote URL)만 사용.
- 대상 = `~/.localmind`(=firstNotesDir, 규칙·스킬 정본의 로컬 복제본 루트).

## Stakeholders — 이해관계자

- **단일 사용자**(설치한 개인 누구나 — 비개발자 포함). 자기 복제본의 신선도를 확인.

## Risks — 리스크

- **"최신"의 거짓 확신**: FETCH_HEAD는 "마지막으로 정본을 *확인*한 때"이지 "정본과 같음"이 아님 →
  문구를 "마지막 동기 확인 시점"으로 정직하게(behind 여부는 미주장).
- git 메타 부재(클론 아님)를 **에러가 아니라 경고**로 — home-server식은 정상적 상태 표시.
