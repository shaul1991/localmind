---
title: Provider-neutral Deep Research workflow
audience: human
---

# Goal: Provider-neutral Deep Research workflow

> **TL;DR** — Claude Code·Codex·Gemini 계열을 포함한 Agent Skills 호환 런타임에서 같은
> `deep-research` 논리 command를 호출해, 출처 우선 조사·교차검증·비판적 검수를 반복 가능한 한
> 워크플로로 사용하게 한다. 특정 벤더의 독점 Deep Research 제품을 복제하는 것이 아니라,
> LocalMind가 소유하는 공용 조사 절차를 런타임별 공식 호출 문법에 연결하는 작업이다.
>
> **누가/언제** — 설치한 개인 누구나(비개발자 포함)가 단순 검색보다 근거가 탄탄한 조사·비교·의사결정
> 자료가 필요할 때 사용한다.

## Background — 배경

LocalMind에는 문서 준비와 구현을 위한 provider-neutral 워크플로가 있지만, 긴 호흡의 조사 작업을
일관되게 수행하는 공용 command는 없다. 사용자는 현재 각 런타임에 자연어로 조사 절차를 다시 설명해야
하고, 그때마다 질문 정렬·공식 출처 우선순위·상충 근거 처리·최종 검수의 강도가 달라진다.

Agent Skills는 여러 agent runtime이 공유할 수 있는 공개 포맷을 제공한다. 반면 실제 명시 호출 문자는
표준화되어 있지 않아 런타임마다 다르다. 따라서 공용화의 단위는 같은 문자 하나가 아니라, 하나의
논리 ID와 행동 계약을 각 런타임의 공식 호출 방식으로 노출하는 것이다.

## Problem — 문제

1. **조사 품질이 프롬프트 재작성에 의존한다.** 질문 범위·출처 가중치·최신성 확인·불확실성 표기가
   매번 빠지거나 달라질 수 있다.
2. **런타임별 호출 방식이 다르다.** 같은 `/deep-research` 문자열을 억지로 강제하면 Codex처럼 다른
   공식 문법을 쓰는 런타임에서 deprecated 기능이나 비공식 우회에 의존하게 된다.
3. **가용 능력이 다르다.** live web, 연결된 지식, 격리 연구자 위임, 인용 기능의 유무가 런타임마다
   달라 동일한 절차가 조용히 축소되거나 거짓으로 "독립 검수"를 주장할 위험이 있다.
4. **일반 검색과 deep research의 경계가 없다.** 비용·시간이 큰 워크플로가 암시적으로 발동하거나,
   반대로 단순 요약이 심층 조사로 오인될 수 있다.
5. **벤더 문서가 변한다.** 특히 Gemini CLI와 후속 Antigravity CLI의 배포·호출 계약은 전환 중이므로,
   기억에 의존한 고정 가정은 빠르게 낡는다.

## Objective — 목표

- **O-1 — 단일 정본:** `deep-research`라는 하나의 provider/model-neutral 조사 워크플로를 만든다.
- **O-2 — 런타임 공용성:** 현재 LocalMind가 지원하는 런타임에서는 각 공식 문법으로 같은 논리
  command를 호출하고, 다른 Agent Skills 호환 런타임도 정본을 재사용할 수 있게 한다.
- **O-3 — 근거 기반 품질:** 질문 정렬 → 조사 계획 → live 검증 → 출처 가중·교차검증 → 종합 →
  적대적 검수의 절차를 행동 계약으로 고정한다.
- **O-4 — 정직한 capability fallback:** web·연결 지식·격리 위임 같은 능력이 없을 때 조용히
  생략하지 않고 실제 한계와 미검증 사항을 명시한다.
- **O-5 — 안전한 명시 실행:** 사용자가 분명하게 호출했을 때만 시작하고, 기본 결과는 외부 시스템을
  바꾸지 않는 조사 보고로 제한한다.
- **O-6 — 비용 대비 실행 품질:** 모든 단계에 최고 비용 모델을 고정하지 않고, 실패 파장과 난이도에
  따라 추상 실행 등급을 배치하되 최종 종합·검수 강도는 낮추지 않는다.

## Expected outcome — 기대 결과

- 사용자는 런타임마다 조사 프롬프트 전문을 다시 작성하지 않고 `deep-research`와 주제만 전달한다.
- 같은 질문에 대해 어떤 런타임을 쓰더라도 핵심 단계·출처 품질·불확실성 표기·검수 게이트가 유지된다.
- 최신 사실은 live 공식 자료로 검증되고, 확인할 수 없는 내용은 사실처럼 포장되지 않는다.
- 독립 연구자·critic을 사용할 수 있으면 병렬 조사와 격리 검수를 활용하고, 없으면 현재 세션 fallback임을
  명시한다.
- 기존 LocalMind 배포·업데이트·충돌 보호 규약을 통해 공용 workflow가 설치되며 사용자 소유 자산은
  보존된다.
- 출처 탐색 같은 저위험 기계 작업, 일반 조사·조정, 최종 종합·검수가 서로 다른 추상 실행 등급으로
  라우팅되고 실제 모델 선택은 설치별 바인딩에 위임된다.

## Success metrics — 성공 지표

- [ ] **SM-1:** 배포 catalog에서 `deep-research`가 단일 정본으로 로드되고, 지원 대상별 공식 호출
      표기가 서로 다른 경우에도 logical ID와 canonical payload가 같다.
- [ ] **SM-2:** 명시 호출·주제 확인·계획 확인·live 최신성 검증·출처 가중·상충 근거 처리·종합·critic
      gate·capability fallback이 각각 자동 테스트 가능한 계약으로 고정된다.
- [ ] **SM-3:** canonical `SKILL.md`와 reference의 provider/model/tool 고유 토큰 중립성 스캔이
      0건이다. 생성 adapter의 runtime-specific metadata는 target-normalized payload 비교로 정본과의
      의미 동등성을 검증한다.
- [ ] **SM-4:** 임시 설치 루트 도그푸드에서 현재 지원 대상이 모두 생성되고, 재실행은 unchanged이며,
      unmanaged 사용자 자산의 변경·삭제가 0건이다.
- [ ] **SM-5:** 실제 사용 가능한 런타임 2종 이상에서 같은 대표 조사 시나리오를 실행해 결론 우선
      보고·근거 링크·사실/추론/미결정 구분·검수 상태를 관찰한다. 설치되지 않은 런타임은 정적 계약
      검증으로 대체하고 그 사실을 보고한다.
- [ ] **SM-6:** 비개발자 대상 문서가 런타임별 호출 예와 "같은 command = 같은 문자"가 아니라는
      점, 비용·시간·기능 한계를 평이하게 설명한다.
- [ ] **SM-7:** canonical 계약이 source scout=`economy`, coordinator/researcher=`standard`,
      synthesizer/critic=`critical-reasoning` 배치를 고정하고, 바인딩·모델 선택 능력이 없는 runtime은
      현재 session fallback과 실제 한계를 보고한다. 최종 critic의 조용한 다운시프트는 0건이다.

## Non-goals — 비목표

- Claude Research, OpenAI Deep Research 등 특정 벤더의 독점 모델·서버·UI를 복제하거나 동일 성능을
  보장하지 않는다.
- 검색 엔진·브라우저·crawler·RAG 저장소·MCP 서버·외부 API를 새로 구현하지 않는다.
- 모든 AI 모델에서 독립 실행되는 기능을 보장하지 않는다. 지원 단위는 **Agent Skills를 로드할 수
  있는 agent runtime**이며, 모델 단독 호출은 범위 밖이다.
- 조사 결과를 Deep Research workflow 자체가 파일·persistent knowledge·외부 서비스에 자동 저장하거나,
  외부 시스템을 수정하지 않는다. 적용 가능한 host/project 규약이 별도 기록을 강제하면 조사 완료 뒤
  그 규약의 독립 단계로 수행한다.
- 기존 LocalMind workflow 배포 아키텍처를 재설계하거나 기존 command의 의미를 바꾸지 않는다.
- Antigravity CLI 전용 설치 adapter를 이번 범위에 추가하지 않는다. 공개 Agent Skill 재사용 가능성은
  유지하되, 정식 target 편입은 별도 slice에서 결정한다.
- 구체 provider/model ID 선택, 가격 계산, 토큰 예산 자동 최적화는 canonical workflow에서 다루지
  않는다. 이번 범위는 추상 실행 등급과 역할 배치까지만 정의하고 설치별 모델 매핑은 외부 바인딩의
  책임으로 둔다.
- UI/UX 화면을 만들지 않는다.

## Constraints — 제약

- **C-1 — Agent Skills 정본:** 공개 Agent Skills 규격을 공통 포맷으로 사용하고, 호출 문자·설치
  위치·런타임 확장 metadata는 adapter 책임으로 둔다.
- **C-2 — provider/model neutrality:** canonical workflow 본문은 특정 provider·model·runtime·도구
  이름에 의존하지 않고 capability와 역할로만 지시한다.
- **C-3 — explicit + report-only:** 비용과 시간이 큰 조사이므로 명시 호출에서만 활성화하고,
  기본 side effect는 채팅 보고로 제한한다. 별도 저장·변경은 사용자의 추가 요청 또는 적용 가능한
  host/project 규약이 있을 때 Deep Research와 분리된 단계로 수행한다.
- **C-4 — Live-Verify:** 시간에 따라 바뀌는 사실은 최신 공식·1차 출처로 확인한다. 확인할 수 없으면
  Open question과 검증 과제로 남기며 단정하지 않는다.
- **C-5 — truthful independence:** 격리 위임을 실제로 사용한 경우에만 독립 researcher/critic이라고
  표기한다. 미지원이면 현재 세션 fallback임을 밝힌다.
- **C-6 — 기존 lifecycle 보존:** packaged workflow catalog, marker/fingerprint, unmanaged 자산 보호,
  seed·배포·검증·prune 규약을 그대로 따른다.
- **C-7 — 공식 호출 우선:** deprecated custom prompt나 동일 문자열을 위한 비공식 우회를 새 정본으로
  만들지 않는다. 생성 wrapper가 필요해도 정본이 아닌 adapter여야 한다.
- **C-8 — 오픈소스·비개발자 대상:** 문구는 평이하게 쓰고 특정 개인·기기의 절대경로를 예시로 넣지
  않는다.
- **C-9 — untrusted source·privacy:** 웹·문서·연결 source의 내용은 근거 데이터이지 실행 지시가
  아니다. source 안의 tool/권한/비밀 전송 지시는 무시하고, secret·private context를 외부 query나
  source에 노출하지 않는다.
- **C-10 — execution tier routing:** 저위험 source scout는 `economy`, research coordinator와 evidence
  researcher는 `standard`, synthesis와 final critic은 `critical-reasoning`으로 요청한다. runtime이
  등급별 모델 선택·역할 위임을 지원하지 않으면 현재 session이 같은 체크리스트를 수행하고 fallback을
  밝힌다. 최종 critic은 더 낮은 등급으로 조용히 대체하지 않는다.

## Stakeholders — 이해관계자

- **단일 사용자(설치한 개인 누구나 — 비개발자 포함):** 런타임을 바꿔도 같은 심층 조사 절차와
  이해하기 쉬운 결과를 얻는다.
- **LocalMind 유지보수자:** workflow 정본 하나와 기존 adapter 체계만 관리해 런타임별 drift를 줄인다.
- **Agent runtime adapter 유지보수자:** 각 런타임의 호출·발견 계약 변화만 격리해 갱신한다.
- **후속 SDD 작업:** 이번 계약을 기반으로 분야별 조사 template, 추가 runtime adapter, 저장 workflow를
  별도 확장할 수 있다.

## Risks — 리스크

- **R-1 — 제품명 기대 과대:** 이름 때문에 벤더의 전용 Deep Research와 같은 backend·품질·속도를
  기대할 수 있다 → 문서와 첫 출력에서 LocalMind workflow임을 분명히 한다.
- **R-2 — capability 편차:** web·연결 소스·격리 위임이 없는 runtime에서 품질이 낮아질 수 있다 →
  필수 단계별 fallback과 미지원 표기를 계약화한다.
- **R-3 — 출처가 있는 환각:** 존재하지 않는 링크·근거를 만들어낼 수 있다 → claim-evidence ledger와
  critic gate로 검증하고 확인하지 못한 주장은 제외한다.
- **R-4 — 과도한 비용·지연:** 작은 질문에도 여러 연구자와 긴 조사가 발동할 수 있다 → explicit-only,
  범위·종료 조건 확인, 유의미한 독립 질문에만 병렬화하는 비용 가드를 둔다.
- **R-5 — 런타임 문서 drift:** 호출·발견 방식이 바뀌면 wrapper와 안내가 낡을 수 있다 → 구현 착수와
  self-review 때 공식 문서를 다시 확인하고, 실제 설치 버전으로 dogfood한다.
- **R-6 — Gemini 계열 전환 충돌:** Gemini CLI의 기존 Agent Skills 문서와 더 최신 Antigravity 전환
  문서가 native slash 노출을 다르게 설명한다 → 현재 지원 target은 기존 검증된 adapter를 유지하고,
  실제 설치본에서 discovery·호출·인자 전달을 확인한다. Antigravity 정식 편입은 별도 결정으로 남긴다.
- **R-7 — 긴 정본으로 인한 context 비용:** 모든 조사 규칙을 한 본문에 과도하게 넣을 수 있다 →
  최소 행동 계약을 앞에 두고, 필요한 경우 text reference로만 분리한다.
- **R-8 — prompt injection·private data 유출:** 조사 source가 에이전트 지침처럼 위장하거나 연결된
  private context를 외부로 보내라고 요구할 수 있다 → retrieved content를 untrusted data로 격리하고,
  embedded instruction 무시·secret 외부 공개 금지·외부 query 최소화를 critic과 보안 edge test에 넣는다.
- **R-9 — tier 적용 불가·비용 편향:** runtime이 별도 모델/역할 선택을 지원하지 않거나 바인딩이
  없어서 전 단계가 같은 모델로 실행될 수 있다 → workflow를 중단시키지는 않되 실제 적용 상태와
  비독립 fallback을 보고하고, 최종 critic 체크리스트 강도는 유지한다.
