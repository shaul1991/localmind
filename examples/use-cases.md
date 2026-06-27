# 직군별 유즈케이스

"내 직군에선 어떻게 쓰지?"에 바로 답하는 페르소나 모음. 전부 **로컬·메터드 API 0원·독립 실행**.
각 카드: **상황 → 활용 → 워크플로우(실무 단계) → 효과 → 시작(예제)**.

> 한 직군의 **끝-to-끝 실행 가능한 워크플로우**가 궁금하면 → [workflow-youtube-script.py](workflow-youtube-script.py)
> (유튜브 대본가: 채널 보이스 기억 → 아웃라인 → 후킹 3안 → 대본 초안까지 한 번에).

## 한눈에 (직군 → 바로 돌리는 워크플로우)
| 직군 | 핵심 활용 | ▶ 워크플로우 실행 |
|---|---|---|
| 백엔드/풀스택 | 서비스·스크립트의 메터드 API를 로컬로 대체 | [workflow-backend.py](workflow-backend.py) |
| 프론트엔드 | UI 카피·컴포넌트 초안을 키/비용 없이 | [workflow-frontend.mjs](workflow-frontend.mjs) |
| 앱 개발(모바일) | Swift/Kotlin 코드·다국어 문자열·인앱 AI 백엔드 | [workflow-mobile-i18n.py](workflow-mobile-i18n.py) |
| 게임 개발 | NPC 대사·퀘스트 대량 생성·로어 일관성 | [workflow-game-content.py](workflow-game-content.py) |
| 인프라/DevOps/SRE | 서버별 런북·장애기억·운영 RAG | [workflow-infra-runbook.mjs](workflow-infra-runbook.mjs) |
| ML/데이터 엔지니어 | 파이프라인 임베딩·로컬 RAG·배치 LLM 0원 | [workflow-ml-index.py](workflow-ml-index.py) |
| 데이터 분석가 | 민감 데이터 로컬 분석·지표 정의 RAG | [workflow-data-analysis.py](workflow-data-analysis.py) |
| QA/테스트 | 테스트케이스 생성·로그 요약·CI 분류 | [workflow-qa-testcases.py](workflow-qa-testcases.py) |
| 기술 리드/아키텍트 | 다중 모델 설계 리뷰·ADR 적재/검색 | [workflow-design-review.py](workflow-design-review.py) |
| PM/기획(비개발) | 피드백 요약·스펙 초안·결정 회상 | [workflow-pm-spec.py](workflow-pm-spec.py) |
| 테크니컬 라이터 | 문서 초안·내부 노트 검색·일관성 | [workflow-docs-draft.mjs](workflow-docs-draft.mjs) |
| AI 글 작성가 | 초안·리라이트·문체 일관, 원고 로컬 보호 | [workflow-ai-writer.py](workflow-ai-writer.py) |
| 유튜브 대본가 | 아웃라인→대본·후킹 인트로·채널 톤 | [workflow-youtube-script.py](workflow-youtube-script.py) |
| 유튜브 편집자 | 자막→챕터·하이라이트·설명문(텍스트) | [workflow-youtube-edit.py](workflow-youtube-edit.py) |
| 썸네일 작업자 | 썸네일 문구·컨셉 A/B (이미지 생성 X) | [workflow-thumbnail-copy.py](workflow-thumbnail-copy.py) |
| 인플루언서 | 캡션·해시태그·멀티플랫폼 리퍼포징 | [workflow-influencer-repurpose.py](workflow-influencer-repurpose.py) |
| 보안/SecOps | 데이터 미유출·로그 분석·위협 노트 RAG | [workflow-security-triage.py](workflow-security-triage.py) |
| 연구자/지식노동자 | 노트·논문 second-brain·진화 기억 | [workflow-research-synthesis.mjs](workflow-research-synthesis.mjs) |
| 1인 개발/스타트업 | 두뇌 전체 0원(백엔드+비서) | [workflow-solo-stack.sh](workflow-solo-stack.sh) |

---

## 👨‍💻 백엔드 / 풀스택 개발자
- **상황**: 사내 봇·요약·분류 기능이 OpenAI/Anthropic API를 호출해 매달 청구서가 쌓인다.
- **활용**: `base_url`만 `http://localhost:4000/v1`로 바꾼다. 모델명으로 claude/codex 선택. 코딩 중엔 Cursor에서 `ask`로 다른 모델에 교차 상담.
- **워크플로우**: 기존 API 호출부 `base_url`/`api_key` 교체 → 로컬에서 단위 테스트 → CI의 요약·분류 잡도 localmind로 → 구현 막히면 Cursor `ask`로 claude↔codex 교차 검토.
- **효과**: 코드 변경 거의 0으로 **메터드 비용 0원**. 데이터는 로컬에서만.
- **시작**: [chat-openai.py](chat-openai.py) · [function-calling.py](function-calling.py) · [mcp-clients.md](mcp-clients.md)

## 🎨 프론트엔드 개발자
- **상황**: 버튼 문구·빈 상태 카피·컴포넌트 보일러플레이트를 빠르게 뽑고 싶지만 API 키 발급/비용이 번거롭다.
- **활용**: 로컬 엔드포인트로 OpenAI SDK 그대로. 스트리밍으로 즉시 미리보기. Cursor에 MCP를 붙여 `ask`로 접근성 카피 검토.
- **워크플로우**: 컴포넌트/카피를 chat으로 초안 → 스트리밍으로 즉시 미리보기·반복 → Cursor `ask`로 접근성·톤 검토 → 확정 문구는 `capture_note`로 디자인 시스템에 적재.
- **효과**: 키·비용 없이 반복 작업 가속, 사내 문구는 로컬 밖으로 안 나감.
- **시작**: [chat-openai.mjs](chat-openai.mjs) · [chat-streaming.sh](chat-streaming.sh)

## 📱 앱 개발자 (모바일)
- **상황**: iOS/Android 코드 작성과 인앱 AI 기능(요약·분류·챗) 붙이기에 API 키·비용이 걸린다.
- **활용**: IDE/Cursor에 MCP를 붙여 Swift/Kotlin 코드·에러 메시지·다국어 문자열 생성, `ask`로 교차 모델 검토. 인앱 LLM 기능은 서버에 띄운 localmind(`:4000`)를 백엔드로(키 0원).
- **워크플로우**: IDE에 MCP 연결 → 화면별 카피·다국어 `Localizable` 문자열 생성 → `ask`로 Swift/Kotlin 코드 리뷰 → 인앱 AI 기능은 서버 localmind(`:4000`)를 호출하도록 배선.
- **효과**: 개발 가속 + 인앱 AI를 메터드 0원으로 프로토타이핑.
- **시작**: [mcp-clients.md](mcp-clients.md) · [chat-openai.mjs](chat-openai.mjs)

## 🎮 게임 개발자
- **상황**: NPC 대사·퀘스트·아이템 설명을 대량 생성하고 세계관(로어) 일관성을 유지해야 하는데, 반복 API 호출 비용이 쌓인다.
- **활용**: 로컬 chat으로 대사·플레이버 텍스트 생성(반복 호출 0원). `function-calling`으로 구조화된 아이템/퀘스트 JSON. 설정·로어 문서를 `NOTES_DIR`로 두고 `ask_brain`으로 캐릭터·세계관 일관성 체크. 런타임 NPC 대화 백엔드로 `:4000`을 게임 서버에 연결도 가능.
- **워크플로우**: 로어/설정을 `NOTES_DIR`에 적재 → `function-calling`으로 아이템·퀘스트 JSON 대량 생성 → `ask_brain`으로 캐릭터·세계관 모순 검증 → 런타임 NPC 대화는 `:4000` 백엔드로.
- **효과**: 콘텐츠 대량 생성 **비용 0원**, RAG로 세계관 일관성 유지, 미공개 설정이 로컬 밖으로 안 나감.
- **시작**: [function-calling.py](function-calling.py) · [chat-openai.mjs](chat-openai.mjs) · [brain-node.mjs](brain-node.mjs)

## 🛠️ 인프라 / DevOps / SRE
- **상황**: 서버마다 스펙·백업정책·장애 이력이 머릿속/흩어진 메모에 있다.
- **활용**: 서버별 독립 인스턴스(`MCP_INSTANCE=서버명`). `capture_note`로 런북 적재, `remember`로 장애 기록, `ask_brain`으로 "이 서버 한정" RAG. 노트북에서 서버별 원격 MCP로 질의.
- **워크플로우**: 서버별 인스턴스 기동(`MCP_INSTANCE`) → 스펙·런북을 `capture_note` → 장애 발생 시 원인·조치를 `remember` → 회고/온콜 때 `ask_brain`으로 그 서버만 출처와 함께 정리.
- **효과**: 각 서버가 **자기 지식을 로컬에서** 보유. "이 서버 최근 장애 정리"를 출처와 함께 즉답.
- **시작**: [mcp-remote-infra.md](mcp-remote-infra.md) · [memory.sh](memory.sh)

## 🤖 ML / 데이터 엔지니어
- **상황**: RAG·분류·클러스터링 파이프라인이 임베딩 API 비용·레이트리밋에 묶여 있다.
- **활용**: 임베딩을 로컬 bge-m3(다국어, 1024d)로. LangChain/LlamaIndex/Chroma의 base_url만 교체. 대량 배치 LLM 작업도 0원.
- **워크플로우**: 코퍼스를 `:4000`로 임베딩 → 벡터스토어(FAISS/Chroma)에 적재 → 검색/분류 파이프라인 구성 → 대량 라벨링·요약 배치도 한도 걱정 없이 반복.
- **효과**: 임베딩·LLM 호출 **비용·한도 해방**, 한국어 품질 유지.
- **시작**: [embeddings.py](embeddings.py) · [semantic-search.py](semantic-search.py) · [langchain-rag.py](langchain-rag.py)

## 📊 데이터 분석가
- **상황**: 쿼리·집계·리포트를 다루는데, 사내/고객 데이터를 외부 API에 보내긴 부담스럽고 분석 보조는 필요하다.
- **활용**: 로컬 chat으로 SQL/pandas 작성·결과 해석·리포트 초안. 지표 정의·데이터 사전을 `NOTES_DIR`로 두고 `ask_brain`으로 "이 지표 정의가 뭐였지?" RAG. 자유응답·로그 텍스트 분류/군집은 로컬 임베딩으로.
- **워크플로우**: 지표 정의·데이터 사전을 `NOTES_DIR`에 → chat으로 SQL/pandas 초안 → 실행 결과를 붙여 해석·리포트 초안 → 정의가 헷갈리면 `ask_brain`으로 사내 기준 확인.
- **효과**: 민감 데이터가 **로컬을 안 떠나며** 분석 가속, 지표·용어 일관성 유지.
- **시작**: [chat-openai.py](chat-openai.py) · [semantic-search.py](semantic-search.py) · [brain-node.mjs](brain-node.mjs)

## 🔬 QA / 테스트 엔지니어
- **상황**: 테스트 케이스 작성·실패 로그 분류·릴리즈 노트 요약이 수작업.
- **활용**: `function-calling`으로 구조화된 테스트케이스 JSON 생성. CI 스크립트에서 로그 요약·버그 분류를 localmind로(메터드 0원이라 매 빌드 호출 부담 없음).
- **워크플로우**: 명세/유저스토리를 chat에 → `function-calling`으로 테스트케이스 JSON 생성 → CI에서 실패 로그 요약·심각도 분류 → 반복되는 회귀 패턴을 `remember`로 축적.
- **효과**: 반복 분석 자동화 + CI에서 LLM을 **비용 걱정 없이** 상시 사용.
- **시작**: [function-calling.py](function-calling.py) · [chat-openai.py](chat-openai.py)

## 🧭 기술 리드 / 아키텍트
- **상황**: 설계 결정을 혼자 검토하고, ADR/결정 기록이 흩어진다.
- **활용**: `ask`로 같은 설계를 claude·codex 양쪽에 물어 **다중 관점 리뷰**. 결정은 `capture_note`로 ADR화, 나중에 `ask_brain`으로 "왜 이렇게 정했지?" 검색.
- **워크플로우**: 설계안을 claude·codex 양쪽에 `ask` → 상반된 의견을 비교해 결정 → 결정·근거를 ADR로 `capture_note` → 분기/회고마다 `ask_brain`으로 "왜 그렇게 정했지?" 회상.
- **효과**: 1인 검토를 **패널 리뷰**로 격상, 결정의 근거가 검색 가능한 지식으로 축적.
- **시작**: [mcp-clients.md](mcp-clients.md) · [brain-node.mjs](brain-node.mjs)

## 📋 PM / 기획자 (비개발자)
- **상황**: 코드는 안 짜지만 피드백 정리·스펙 초안·지난 결정 회상이 잦다.
- **활용**: **Claude Desktop**에 MCP만 붙이면 끝. `remember`로 결정·맥락 저장, `recall`로 회상, `capture_note`/`ask_brain`으로 기획 노트 RAG. 터미널 몰라도 됨.
- **워크플로우**: Claude Desktop에 MCP 연결(1회) → 회의·고객 피드백을 `remember` → 스펙/PRD 초안을 chat으로 → "그때 왜 그렇게 정했지?"는 `recall`·`ask_brain`으로 즉답.
- **효과**: 개인 비서급 기억 + "우리 그때 왜 그렇게 정했지?"에 즉답. 데이터는 내 노트북에만.
- **시작**: [mcp-clients.md](mcp-clients.md) (Claude Desktop 섹션)

## ✍️ 테크니컬 라이터 / 문서 담당
- **상황**: 문서 초안·용어 일관성·기존 문서 검색에 시간이 든다.
- **활용**: 기존 마크다운 문서 폴더를 `NOTES_DIR`로(마이그레이션 0). `search_notes`로 관련 문단 찾고 `ask_brain`으로 근거 있는 초안. 초안 다듬기는 chat.
- **워크플로우**: 문서 폴더를 `NOTES_DIR`로 지정 → `search_notes`로 이미 쓴 내용 확인(중복 방지) → `ask_brain`으로 근거 있는 초안 → chat으로 용어·톤 통일.
- **효과**: "이미 어딘가 쓴 내용"을 빠르게 재사용, 출처 기반 정확한 초안.
- **시작**: [brain-node.mjs](brain-node.mjs) · [mcp-clients.md](mcp-clients.md)

> 🎬 **콘텐츠 크리에이터 직군 참고**: localmind는 **텍스트·임베딩·기억** 전용입니다(이미지·영상 생성 없음). 아래 직군에선 *대본·카피·아이디어·검색·일관성* 을 담당하고, 그림/영상은 별도 툴과 병행합니다.

## ✍️ AI 글 작성가
- **상황**: 블로그·뉴스레터·카피를 대량 작성/편집하는데 외부 API 비용과 클라이언트 원고 유출이 걱정된다.
- **활용**: 로컬 chat으로 초안·리라이트·톤 조정. 내 문체 가이드·금칙어를 `remember`로 저장해 일관 유지, 자료 노트를 `ask_brain`으로 근거 있는 글. 원고가 로컬을 안 떠남.
- **워크플로우**: 문체 가이드·금칙어를 `remember`(1회) → 주제로 초안 chat → 자료 노트를 `ask_brain`으로 근거 보강 → 리라이트로 톤 통일 → 최종본은 로컬에만.
- **효과**: 무제한 반복 작성 **0원** + 문체 일관 + 클라이언트 기밀 보호.
- **시작**: [chat-openai.py](chat-openai.py) · [brain-node.mjs](brain-node.mjs) · [memory.sh](memory.sh)

## 🎥 유튜브 대본가
- **상황**: 주제 하나로 후킹 인트로·대본·아웃라인을 여러 버전 뽑고 채널 톤을 유지해야 한다.
- **활용**: 로컬 chat으로 아웃라인→대본, 인트로 후킹 3안. 채널 톤·금지표현을 `remember`로, 과거 대본을 `NOTES_DIR`로 두고 `search_notes`로 재활용.
- **워크플로우**: 채널 보이스를 `remember`(1회) → 주제 입력 → 아웃라인 생성 → 후킹 인트로 3안 → 첫 섹션 대본 초안 → 섹션 2~5 반복 → 과거 대본은 `search_notes`로 재활용. **그대로 돌려보는 스크립트** → [workflow-youtube-script.py](workflow-youtube-script.py).
- **효과**: 대본 생산 가속(반복 0원), 채널 보이스 일관.
- **시작**: [workflow-youtube-script.py](workflow-youtube-script.py) · [chat-openai.py](chat-openai.py) · [brain-node.mjs](brain-node.mjs)

## 🎬 유튜브 편집자
- **상황**: 긴 자막/대본에서 챕터·하이라이트·설명문을 뽑는 데 시간이 든다.
- **활용**: 자막(텍스트)을 넣어 **챕터 타임스탬프·하이라이트 후보·영상 설명/제목** 생성. 과거 영상 자막을 임베딩으로 검색해 재사용 클립 탐색.
- **워크플로우**: 자막(srt/txt)을 chat에 → 챕터 타임스탬프·하이라이트 후보 추출 → 영상 설명/제목 후보 생성 → 과거 자막을 임베딩 검색해 재사용할 클립 탐색.
- **효과**: 텍스트 작업(챕터·설명·검색) 자동화. *영상 픽셀 편집은 NLE에서 — localmind는 자막/메타데이터 보조.*
- **시작**: [chat-openai.py](chat-openai.py) · [semantic-search.py](semantic-search.py)

## 🖼️ 썸네일 작업자
- **상황**: 클릭을 부르는 썸네일 **문구·컨셉**을 빠르게 여러 안 뽑고 싶다.
- **활용**: 로컬 chat으로 썸네일 카피·후킹 단어 A/B, 제목↔썸네일 문구 조합. 잘 먹힌 패턴을 `remember`로 축적해 다음에 참고.
- **워크플로우**: 영상 핵심을 chat에 요약 입력 → 썸네일 문구·후킹 단어 A/B 다수 생성 → 제목↔썸네일 조합 추천 → 잘 먹힌 패턴을 `remember`, 다음 영상에서 `recall`로 참고.
- **효과**: 컨셉·문구 브레인스토밍 가속(0원). *이미지 생성은 안 함 — 별도 이미지 툴과 병행, localmind는 문구·아이디어 담당.*
- **시작**: [chat-openai.py](chat-openai.py) · [memory.sh](memory.sh)

## 🌟 인플루언서
- **상황**: 캡션·해시태그·릴스 아이디어를 여러 플랫폼용으로 변주하고 DM/댓글 응대도 잦다.
- **활용**: 로컬 chat으로 캡션·해시태그·플랫폼별 리퍼포징(하나→인스타/유튜브/X). 브랜드 보이스·협찬 가이드를 `remember`로, 콘텐츠 캘린더를 노트로. 응대 초안도.
- **워크플로우**: 원본 콘텐츠 1개 → 플랫폼별 리퍼포징(인스타/유튜브/X) chat → 캡션·해시태그 생성 → 브랜드 보이스를 `remember`로 고정 → DM/댓글 응대 초안.
- **효과**: 멀티플랫폼 콘텐츠 생산 가속 + 톤 일관, 비용 0원.
- **시작**: [chat-openai.py](chat-openai.py) · [memory.sh](memory.sh)

## 🔐 보안 / SecOps
- **상황**: 민감 로그·코드를 외부 API에 보내기 부담스럽다.
- **활용**: **모든 추론·임베딩이 로컬**이라 데이터가 인스턴스를 떠나지 않음(독립 실행). 로그 요약·이상 탐지 보조, 위협/대응 노트를 `remember`·`ask_brain`으로 축적.
- **워크플로우**: 로그·이벤트를 로컬 chat에 → 이상 패턴 요약·분류 → 위협/대응 절차를 `remember` → 사후분석(포스트모템) 때 `ask_brain`으로 정리. 전 과정 데이터가 로컬 유지.
- **효과**: 데이터 거버넌스 위험 ↓, 그러면서 LLM 보조 활용.
- **시작**: [memory.sh](memory.sh) · [mcp-remote-infra.md](mcp-remote-infra.md)

## 🧠 연구자 / 지식노동자
- **상황**: 노트·논문·아이디어가 쌓이는데 연결·회상이 안 된다.
- **활용**: 노트 볼트를 `NOTES_DIR`로 second-brain RAG, 사실은 `remember`로 진화 기억. 파일이 정본 + git 백업이라 도구가 바뀌어도 지식이 살아남음.
- **워크플로우**: 노트·논문 폴더를 `NOTES_DIR`로 → `search_notes`로 관련 발췌 → `ask_brain`으로 종합·연결 → 새 인사이트를 `remember` → `make memory-export`로 git 백업.
- **효과**: "내가 아는 것" 기준의 답 + 출처. 영구·이식 가능한 개인 지식 베이스.
- **시작**: [brain-node.mjs](brain-node.mjs) · 백업: `make memory-export`

## 🚀 1인 개발자 / 소규모 스타트업
- **상황**: 비용·인프라 여력은 없는데 LLM 백엔드, 메모리, RAG가 다 필요하다.
- **활용**: repo 하나 `make up`이면 **API + 임베딩 + 메모리 + second-brain + MCP**가 전부 로컬로. 제품 백엔드로도, 내 개인 비서로도.
- **워크플로우**: `make up` → 제품의 LLM 기능은 `:4000`을 백엔드로 → 내 작업은 MCP(`remember`/`recall`/`ask_brain`)로 비서화 → 노트·기억은 git으로 백업.
- **효과**: 메터드 0원으로 풀스택 AI 능력 확보, 중앙 의존 없음.
- **시작**: [chat-openai.py](chat-openai.py) → [mcp-clients.md](mcp-clients.md)

---
> 어디서 시작할지 모르겠다면: `make up` → 내 직군 카드의 **시작** 링크 하나만 따라가 보세요.
