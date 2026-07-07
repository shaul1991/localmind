# 직군별 워크플로우 — 내 직군, 바로 실행

> 내 일에 localmind가 어떻게 쓰이는지 직군별 예제로 체감하기. 각 직군의 상황→활용→효과는
> 👉 [직군별 유즈케이스(19 페르소나)](../examples/use-cases.md), 모든 예제는 [examples/](../examples/).

`make up` 후 **내 직군 스크립트 하나만 돌리면** localmind 활용이 한 번에 체감됩니다. 전부 실행·검증됨.

| 그룹 | 바로 실행할 워크플로우 |
|---|---|
| **개발** | [백엔드](../examples/workflow-backend.py) · [프론트](../examples/workflow-frontend.mjs) · [앱/모바일](../examples/workflow-mobile-i18n.py) · [게임](../examples/workflow-game-content.py) |
| **데이터/ML** | [ML 엔지니어](../examples/workflow-ml-index.py) · [데이터 분석](../examples/workflow-data-analysis.py) |
| **품질·설계·운영** | [QA](../examples/workflow-qa-testcases.py) · [아키텍트](../examples/workflow-design-review.py) · [인프라/SRE](../examples/workflow-infra-runbook.mjs) |
| **비개발** | [PM](../examples/workflow-pm-spec.py) · [테크니컬 라이터](../examples/workflow-docs-draft.mjs) · [보안](../examples/workflow-security-triage.py) · [연구자](../examples/workflow-research-synthesis.mjs) |
| **콘텐츠** | [AI 글작성](../examples/workflow-ai-writer.py) · [유튜브 대본](../examples/workflow-youtube-script.py) · [유튜브 편집](../examples/workflow-youtube-edit.py) · [썸네일](../examples/workflow-thumbnail-copy.py) · [인플루언서](../examples/workflow-influencer-repurpose.py) |
| **1인 개발** | [풀스택 투어](../examples/workflow-solo-stack.sh) |

## 실제 플로우 예시 — 어떻게 쓰고, 무엇이 쌓이는지
실행 중인 스택에 그대로 태운 두 직군. 응답·저장 데이터 모두 **실제 출력**입니다.

**백엔드 개발자** — 로그 요약 → 분류(perf) → 대응 결정을 노트로 적재 → `NOTES_DIR`에 **.md 정본이 쌓임**(이후 검색·RAG 대상)

![백엔드 플로우](flow-backend.gif)

**기획자(PM)** — 결정을 `remember`로 mem0에 저장 → PRD 초안 → 2주 뒤 `recall`로 **의미 회상**(결정·이유가 **기억으로 쌓임**)

![PM 플로우](flow-pm.gif)
