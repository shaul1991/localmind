# CHANGELOG

localmind의 주요 변경 이력. 최신이 위.

> 버전 체계: **CalVer `YYYY.MM.MICRO`** — 버전은 **릴리스(PR 머지) 시점** 기준. 확정 규칙은 `AGENTS.md`의 버전·릴리스 절이 정본이다.

## 2026.07.6 — 2026-07-21 — P4: 라운드 간 hermetic evidence 조건부 승계 (specs/202607210545)

- **조건부 승계 규약** — self-review 라운드 전환 시 "적극형 무효화-스킵 미도입"을 조건부로
  개정: **verdict 승계는 여전히 금지**(전량 재검증·도장찍기 금지·2라운드 상한·cross-session
  금지 전부 불변)하되, **hermetic·고비용·수정 diff∩선언 의존=∅**(3조건 전부)인 evidence 실행
  결과만 출처 표기(`승계: rN@<SHA7>`)와 함께 승계 가능. 선언 부재·애매·저비용(스위트·preflight)은
  무조건 재실행(보수 기본). 루트 AGENTS.md + templates/sdd 스캐폴드 + 양 SKILL 동반 개정,
  존재+부재 대칭 핀.
- **judgeEvidenceCarryOver** — 승계 판정 순수 참조 구현(6케이스 + mutation 실증) +
  `carried-from` 텔레메트리(retro §8 승계 컬럼).
- 소급 적용 실증: 202607202152 r1→r2에서 rules-deploy 관찰이 "승계 가능했을 행"으로 판정.
  되돌림 신호(승계 결함 1건 또는 3회 연속 retro 승계 0건) 규약 명기.

## 2026.07.5 — 2026-07-21 — retro 집계 리뷰 형태(lenses) 컬럼 (specs/202607210028)

- self-review 라운드 집계 표에 **형태** 컬럼 추가 — evidence의 선택 필드 `lenses`를 읽어
  라운드 순서대로 `병렬(N)`/`단일` 표기. 렌즈 병렬 vs 단일 리뷰어의 효율 비교(재보정 리듬
  판단 근거)를 표에서 직접 읽는다. lenses는 스키마 미준수 판정에 불참여(선택 필드).

## 2026.07.4 — 2026-07-21 — critic advisory 3건 해소: 집계 tie-break·파서 통일·AC-id 절 스코프 (specs/202607202105)

- **집계 결정성** — self-review 텔레메트리의 최종 completion 선정에서 동일 최대 round가 복수면
  filename 사전순 마지막을 결정적으로 채택(파일 읽기 순서 의존 제거).
- **파서 통일** — retro 집계의 frontmatter 파싱을 preflight와 동일한 yaml.parse로 통일(복합
  YAML 판정 일치). 부수 교정: `blockers: 0`을 누락으로 오판하던 truthy 판정을 `in`+null 체크로.
- **preflight 오검출 제거** — 인라인 `**AC-N**` 추출을 `## Acceptance Criteria` 절 범위로
  한정(산문 절의 회고성 언급이 matrix 대응 요구로 오검출되지 않음).
- Tier 1 lane(change.md) 첫 완주 — TDD 3 AC·in-session 자기검증 1라운드(비독립 명시).

## 2026.07.3 — 2026-07-20 — 거버넌스 재보정: 위험 보정형 확인 루프·불변식 2층·티어 축 (specs/202607202152)

- **확인 루프 위험 보정형 전환** — interview-protocol(rules base)이 검수 대기를 고위험 분기
  (하드 신호·비가역 행동·범위 변경·설계 갈림)에만 강제하고, 저위험은 "이해 요약(생략 불가)+
  권고 제시 후 진행"(decision-by-exception)으로 완화. deep-interview는 권장 기본값 동반 필수 +
  일괄 제시·예외 교정 모드. 근거: deep research(105 에이전트, 3표 적대 검증 — evidence 동봉).
- **goal-impl 불변식/권장 기본 2층** — §4·§4A·§5를 "불변식(재량 불가) 1급 + 수단 세목은 권장
  기본"으로 재서술. 검증 계층(TDD red 관찰·base freshness·round 예산·preflight·DoD·PR·
  Live-Verify)은 문구·의미 무손상(계약 테스트 1019 green으로 기계 확인).
- **티어 트리거 정교화** — AGENTS.md 하드 신호에 비가역성(외부 발행/데이터 파괴/비가역
  마이그레이션) 추가, 검증가능성 보조 축(하드 신호 우선 불변) 명시. AC-17 parity 동반 갱신.
- **재보정 리듬 규칙 신설** — governance-recalibration(rules base): 거버넌스 파라미터는
  retro·모델 세대마다 재검토 제안(사람 결정+ADR), 검증 계층 존재 자체는 비대상.
- **렌즈 병렬 self-review 첫 실전** — r1 5렌즈 격리 critic 동시(중복 finding 0, Live-Verify
  렌즈가 인용 수치 출처 미추적을 검출·철회) → r2 전량 재검증 clean.
- 참고: rules base 실변경은 데이터 폴더 소관(PR diff 밖) — 검증 근거는 spec evidence의 리뷰어
  실파일 대조 로그.

## 2026.07.2 — 2026-07-20 — critic 효율화(렌즈 병렬·preflight·텔레메트리) 외

### critic 효율화 — 렌즈 병렬 fan-out·preflight 게이트·self-review 텔레메트리 (specs/202607201808)

- **렌즈별 병렬 fan-out** — sdd-self-review가 격리 위임 능력이 있을 때 5개 점검 축을 렌즈별
  격리 리뷰어로 동시 실행할 수 있다(선택적 실행 형태, merged report 하나 = round 1개 불변).
  병합 규칙(dedup·심각도 보수 병합·발견 렌즈 표기) 명문화.
- **preflight 게이트** — `npm run review:preflight -- specs/{spec}`가 critic 착수 전 형식
  항목(임시경로 evidence·`git diff --check`·merged report 필수 필드·matrix 전수 대응)을
  결정적으로 검사한다. 통과는 critic 시작의 전제일 뿐 AC green 근거가 아니다.
- **self-review 텔레메트리** — evidence frontmatter 표준 스키마(필수 7필드·선택 2) +
  retro 리포트의 "self-review 라운드 집계" 절(레거시 미준수 forward-only 정직 표기).

### Deep Research evidence pack·적응형 충분성 (specs/202607191145)

- **추적 가능한 조사 원장** — `deep-research`가 run/source/evidence/claim 안정 ID, atomic claim,
  supported·contested·unverified·withdrawn 상태를 사용해 보고와 근거를 재검증 가능하게 연결한다.
- **고정 개수 없는 종료 조건** — 출처 N개 같은 기계적 할당량 대신 직접성·권위·독립성·중요성·상충
  해소로 충분성을 판정하고, 장기 조사는 checkpoint/handoff로 중복 없이 이어간다.
- **분리된 파일 저장 권한** — 기본 `report-only`는 유지하고, 별도 explicit·docs-only
  `research-evidence-pack`만 확인된 새 경로에 정확히 다섯 파일을 쓰고 Python 3.9+ validator로
  구조·참조 무결성을 검사한다. 자동 HOME 선택·덮어쓰기·자동 열기는 하지 않는다.
- **런타임 경계** — Claude·공용 Agent Skill에는 validator까지 배포한다. 실행 파일을 자급할 수 없는
  Gemini generated wrapper는 만들지 않고 `skipped-dependency`로 보고하며, target 검증도 wrapper 적격
  workflow만 요구한다.

### goal-impl 검증 루프 유한화·증거 경계 (specs/202607181125)

- **AC 검증 matrix** — 모든 AC에 검증 방법·레벨, 최소 evidence, 통과·종료 조건, 상태를 1:1로
  연결한다. readiness를 확인하고 첫 dogfood 직전에 동결하며, 이후 단순 evidence 선호는 현재
  blocker로 확장하지 않는다. 재현된 제품·보안 결함과 입증된 종료 조건 오류는 숨기지 않는다.
- **유한한 자동 self-review** — 같은 candidate의 독립 reviewer findings는 merged report 하나를
  round 하나로 센다. 자동 재검은 최대 2 round이고, 이후에는 현재 blocker와 다음 목적을 보고받은
  사용자의 fresh 승인 1개당 추가 round 1개만 허용한다. blocker는 성공이나 완료로 취급하지 않는다.
- **두 base freshness gate** — 파일을 쓰기 전과 최종 self-review 직전에 remote base의 full SHA를
  확인한다. base가 이동하면 정합 후 regression을 재실행하며, 조회·정합 불가는
  `freshness unverified`로 원인·영향과 함께 보고한다.
- **versioned/external 상태 분리** — 최종 commit에서 구현·테스트·문서·publish 준비를 닫고, push 뒤
  PR/CI 상태는 원격 시스템을 SSoT로 삼는다. 상태만 기록하는 후속 commit은 만들지 않으며, 실제 CI
  결함 수정은 새 candidate로 테스트와 남은 round 또는 fresh 승인 review를 다시 통과한다.
- **품질 gate 불변** — TDD, 필수 dogfood, 강한 최종 critic, 전 AC·필수 테스트 green, feature PR
  gate는 약화하지 않는다. 2-round 제한은 `goal-impl` 구현 self-review에만 적용하며 `goal-ready`
  문서 critic과 Deep Research final critic은 각자의 계약을 유지한다.

### Provider-neutral Deep Research 워크플로 (specs/202607172313)

- **공용 논리 command ID** — `deep-research` 하나를 Agent Skills 정본으로 추가했다. Claude Code는
  `/deep-research <topic>`, Codex는 `$deep-research <topic>`, Gemini CLI는 auto skill 또는 생성된
  `/deep-research <topic>` wrapper로 같은 조사 계약을 실행한다.
- **정확한 호출 경계** — Codex의 bare `/deep-research`는 공식 문법이 아니므로 지원·권장하지 않고,
  deprecated Custom Prompts와 `/prompts:deep-research`도 사용하지 않는다.
- **근거·안전 계약** — `explicit`·`report-only`로 brief 확인, live evidence, 상충 근거, final critic,
  결론 우선 보고를 묶었다. isolated/live capability가 없으면 current-session/context-only fallback과
  비독립·미검증 상태를 정직하게 표시하며 final critic을 조용히 다운시프트하지 않는다.
- **범위** — 벤더 first-party Deep Research와 별개이며 전용 backend/model을 복제하지 않는다.
  Agent Skills 호환 runtime용 워크플로이고 모델 단독 실행 대상이 아니다. Gemini CLI는 현재 target,
  Antigravity 전용 adapter는 범위 밖이다. 추상 실행 등급의 실제 model 선택은 설치별 binding이 맡는다.

### specs 폴더 timestamp 프리픽스 정합 (PR #26 후속)

PR #26(3자리 → timestamp 프리픽스 전환)이 남긴 드리프트를 정합하고, 그 과정에서 깨져 있던 main CI를 복구했다.

- **드리프트 정합** — 정본 `AGENTS.md`만 바뀌고 뒤처졌던 곳을 동기화: scaffold 템플릿(`templates/sdd/AGENTS.md` — `make init-sdd` 산출물), `docs/agents.md`, 활성화 정규식(`workflow-policy.ts`의 `validNnn`을 timestamp `^(?:[0-9]{12}|[0-9]{14})$` + 레거시 3자리로 확장), goal-impl 스킬 계약.
- **깨진 CI 복구** — PR #26이 갱신하지 않아 실패하던 문서-계약 테스트 3건을 timestamp 계약에 맞춰 정정(main이 red였다).
- **프리픽스 모호성 가드** — `mkdir`(`-p` 금지)은 경로 충돌만 막고 timestamp 프리픽스는 유일하지 않을 수 있으므로(같은 분·다른 슬러그, 레거시 `041-*` 중복 실재), `goal-impl` 프리픽스 매칭이 2개 이상 폴더에 걸리면 추측하지 않고 사용자에게 묻도록 규약7 1단계에 명문화.
- **후속(별도 슬라이스 필요)** — `src/retro-analysis.ts`의 spec 참조 파서가 `\d{3}` 하드코딩이라 timestamp 프리픽스 spec을 `make retro`가 누락한다(현재는 timestamp spec 0개라 잠복). 스키마 결정이 필요해 별도 SDD 작업으로 분리.

## 2026.07.1 — 2026-07-17 — 버전/릴리스 프로세스 규약 (specs/053)

첫 CalVer 릴리스(`2026.07.0`)를 dogfood하며 합의한 버전/릴리스 프로세스를 성문 규약으로 정착시켰다.

- **버전·릴리스 규약** — AGENTS.md에 「버전·릴리스 — 규약7 이후 (CalVer)」 절 신설. 버전 = 릴리스(PR 머지) 시점 기준, **버전 숫자 확정은 PR 머지 직전**(package.json + CHANGELOG), **git tag는 머지 후 verified main**에. 변경 내용 서술은 작업 중 PR에 누적(관심사 분리).
- **MICRO 산정** — `git fetch --tags` 후 `git tag -l 'YYYY.MM.*' --sort=-v:refname` 수치 +1(태그 우선). hotfix·같은 날 복수 릴리스도 동일 취급(MICRO+1, 채널 없음).
- **릴리스 절차·안전장치** — `git tag <ver> origin/main`(stale HEAD 오태그 방지) · `gh release create --verify-tag`(자동 태그 생성 방지) · gh 계정 확인 · 머지 검증(PR state MERGED + main HEAD 이동).
- goal-ready 스킬에 "버전은 여기서 정하지 않는다" 참조 편입, CHANGELOG 상단 모순 주석 정정.

## 2026.07.0 — 2026-07-17 — SDD 워크플로 자산 정합 (specs 044·050·051·052)

첫 CalVer 릴리스. SDD 구현 워크플로를 **공급자 중립 패키지 스킬**로 통일하고, 실행 등급→모델·역할→페르소나 **바인딩**을 도입했다. 그동안 CHANGELOG에 미기록이던 044·050을 이 릴리스에 함께 정리한다.

### 공급자 중립 워크플로 자산 (specs/044)
- **Claude·Codex·Gemini 3타깃 배포** — 워크플로 자산(스킬·명령)을 provider-neutral 정본으로 시드하고 세 런타임에 배포. **중립성 스캔**이 provider명·구체 모델 ID·런타임 도구명 하드코딩을 기계적으로 차단한다.
- **활성화 게이트(execution grant)** — side effect 전 실행 권한 판정(런타임 provenance + 정확히 3자리 인자, 또는 일회용 확인 문구).

### 페르소나·모델 바인딩 (specs/050)
- **실행 등급·역할 추상 → 로컬 바인딩** — 설치별 `~/.localmind/_bindings/<runtime>.json`으로 실행 등급(critical-reasoning/standard/economy)→모델, 역할→페르소나를 매핑. 온보딩 스킬 `localmind-binding`.
- **바인딩 미설정 fallback** — side effect 전 안내 후 기본 미진행, 명시 동의 시 임시 진행(비독립 표기).

### SDD 구현 스킬 goal-impl 정합 (specs/051)
- **`sdd-implement` → `goal-impl` 단일 정본 통일** — 갈라진 두 정본(중립 게이트본·특화 오케본)을 병합해 한 본문에 활성화 게이트 + 풍부한 오케스트레이션 + 완전 중립화(중립성 스캔 통과)를 담았다. 지원 3타깃 배포, 구명(`sdd-implement`) 은퇴(source-absence 정리).
- **완료 규칙 SSoT 일원화** — commit/push/CI·**PR 게이트를 AGENTS.md 규약7로 위임·명문화**(main 직접 push 금지 → PR 생성, 머지는 사람). 스킬 본문과의 이중 서술 제거.

### SDD 병렬 오케스트레이션 규약 (specs/052)
- **fan-out DAG** — tasks의 phase 헤더에 `depends-on`·`files`를 선언하면, 구현 스킬이 의존 완료 + 파일 disjoint + 유의미한 크기인 노드를 **한 메시지에 동시 spawn**하고 배리어에서 메인이 통합 검증·phase 커밋한다. `goal-impl` §4A + `references/tasks-format.md` 신설.
- **위상 hub-and-spoke** — 메인 = 유일 조율자, 서브에이전트 = leaf. 무거운 작업은 fan-out(A), 값싼 독립 조회는 메인이 도구 직접 병렬(B), 중첩 위임(C)은 사용자 명시 허용 시만 1단계.
- **goal-ready 곁가지 병렬** — 하드 체인(goal→spec→plan→tasks)은 직렬, 곁가지(사실수집·디자인·독립 리서치)는 병렬, 크리틱은 최종 배리어. 독립 슬라이스는 폴더 disjoint + Read 전용 저작이라 기본 병렬 안전.

## 2026-07-03 — 정확성·공급망·신뢰성 하드닝 (specs 013~015, 전수 리뷰 후속)

2026-07-03 전수 리뷰(코드·인프라·문서)에서 발견된 결함을 스펙 3개로 수정했다.

### 세션·색인 정확성 (specs/013)
- **대화 혼입 차단** — explicit 세션(OpenAI `user` 등)에 prefix 내용 검증 추가: 같은 id의 다른 대화가 이전 CLI 세션에 접합되지 않음. 빈 CLI 세션 id·tools 변경(함수호출 침묵 실패)도 방어.
- **색인 유실 0** — 2,000자 초과 문단을 잘라 버리던 청크 분할을 경계 우선 분할로 교체. ⚠️ 인덱스 v4 — 첫 실행 시 1회 전체 재색인(사유 안내됨).
- **임베딩 메타 기록** — 모델·차원을 인덱스에 기록, 모델 교체 시 조용한 오검색 대신 자동 재색인.
- **다중 MCP 프로세스 안전** — Claude Desktop+Code+Cursor 동시 사용 시 인덱스 마지막-쓰기-승리 유실 제거(파일 락 + reload-merge).
- `delete_note` 대상 제한(.md·비숨김·실경로 폴더 내부) · `capture_note` 같은 초 덮어쓰기 방지.

### 공급망·노출면 완결 (specs/014 — 010·011의 사각지대)
- **openmemory 이미지 고정** — mem0 소스를 커밋 sha로, 베이스를 `python:3.12.13-slim`으로 고정. pinning 가드·CI 빌드 편입(negative 자기검증 포함).
- **:8767 Host 헤더 검증** — OpenMemory에 DNS rebinding 차단 주입(:8787과 동일 의미론, `OPENMEMORY_ALLOWED_HOSTS`).
- **게이트웨이 키 랜덤화** — `LITELLM_MASTER_KEY`를 설치 시 임의 생성(`make init-env`), `sk-local` 기본값 제거. ⚠️ 기존 `.env`의 sk-local은 계속 동작하되 `make secrets`가 갱신을 안내.

### 백업·복구 신뢰성 (specs/015)
- **백업 인질 구조 제거** — 스택이 꺼져 있어도 노트·개인설정은 백업(메모리만 건너뜀). ⚠️ **동작 변경**: 부분 실패 시 `make backup`이 비0 종료 코드를 반환(cron 로그 식별용) — backup을 `&&`로 체이닝하는 스크립트가 있다면 주의.
- **`make recover`가 개인 설정(extras)까지 복원** — "통째 복구" 약속 충족.
- **purge 가드 강화** — 실경로(심링크 해소) 기준 홈 밖 기본 거부(`PURGE_OUTSIDE_HOME=1`로만 허용) + Docker 꺼짐 시 "완전 제거 완료" 허위 출력 제거(부분 완료 정직 보고).
- MCP 재등록 원자성(add 사전 검증 — 실패 시 기존 등록 보존) · cron에 커스텀 백업 변수 반영 · non-ff push 원인·해결 안내 · `make up`이 채팅(:8787)까지 확인 후 "준비 완료" · `.env` 소유자 전용 권한(600).

## 2026-07 — SDD 스펙 사이클 (specs 001~012): second-brain 품질 + 공급망·보안 하드닝

이 사이클의 핵심: 작업 흐름을 **SDD(goal→spec→plan→/goal→self-review)로 명문화**하고,
그 흐름으로 second-brain 품질(loop engineering)·CI·공급망·로컬 보안을 스펙 단위로 다졌다.

### SDD 작업 흐름
- **SDD 규약 명문화** — `AGENTS.md`/`CLAUDE.md`에 specs 폴더 규약·`/goal {NNN}` 처리·self-review 필수화. (`76c1908`, `6f180e4`)
- **`scaffold_sdd`** — SDD 작업 흐름(AGENTS.md 규약 + goal/spec/plan 템플릿)을 어느 프로젝트·AI 도구에든 심는 MCP 도구 + `make init-sdd`. (specs/007, `eec63f9`)
- **모델 역할 배치 규약** — 실패 파장×난이도 기준 모델 티어 배치를 AGENTS.md에 추가. (`a0be9c6`)

### second-brain 품질 (loop engineering)
- **캡처 검증 루프** — `capture_note` 저장 직후 색인·검색 가능 여부를 자체 검증. (specs/001, `e770062`)
- **`ask_brain` 출처 추적** — 답변에 사용된 노트 출처(sources)를 구조적으로 반환. (specs/002, `e770062`)
- **자동 재색인 파일 워처** — 노트 폴더 변경 감지 → 색인 자동 갱신. (specs/003, `e770062`)
- **노트 링크 그래프** — 위키링크(`[[...]]`) 기반 1-hop 연결 조회 `note_links` 도구. (specs/005, `0a830d5`)

### 백업 / 노트 연결
- **개인 설정 파일 선택 백업/복원** — `BACKUP_EXTRA_FILES`로 `$HOME` 하위 파일을 백업 repo `extras/`에 포함(충돌 시 `.bak-*` 보존). (specs/006, `b409f8b`)
- **노트 git 저장소 연결** — `.env`에 `NOTES_REPOS` 선언 → `make notes-connect`가 clone/pull·`NOTES_DIR` 조립·MCP 등록까지, `make setup` 통합. (specs/012, `14712bb`)

### 품질 / 성능 / 보안
- **CI 테스트 게이트** — Node 20/22/24 매트릭스에서 typecheck + 단위 테스트 + 셸 테스트 + 빌드 + Docker 빌드. (specs/008, `d0054f4`)
- **인덱스 내구성·성능** — 인덱스 캐싱(mtime+size)·원자적 쓰기(temp+rename)·single-flight. (specs/009, `f26689d`)
- **공급망 아티팩트 버전 고정** — node·claude·codex·ollama·litellm 고정 + 가변 태그 회귀 가드(`pinning.test.sh`). 라이브 재빌드 검증 완료. (specs/010, `507feeb`)
- **로컬 보안 하드닝** — Host 헤더 검증(DNS rebinding 차단, `/health` 예외) + 노트 soft-delete 휴지통(`.trash/`, `make trash-list`/`trash-empty`). (specs/011, `e150103`)

## 2026-06 — 개인 전용 정착 + 백업/복구 + 대화형 관리

이 사이클의 핵심: **"개인 1인 전용"으로 방향을 굳히고**, 비개발자도 쓸 수 있게
설치·백업·복구·데이터 관리를 다듬었다.

### 방향 — 개인 전용
- **원격/팀 MCP 접근 제거** — `mcp-http`(HTTP/SSE) 서버·`make up-mcp`·`mcp` 프로파일 삭제. localmind는 **내 머신·나 혼자** 전용. (`46d0f1a`)
- **localhost 루프백 바인딩** — 발행 포트(8787/4000/8767)를 `127.0.0.1`에만 노출 → **LAN 노출 차단**. (`46d0f1a`)
- **기본 폴더 `~/.localmind`** — 노트·인덱스·백업의 기본 위치를 통일(이전 `~/localmind-brain`). (`6521d1c`)

### second-brain — 다중 노트 폴더
- **`NOTES_DIR` 다중 폴더** — 쉼표로 여러 폴더, `label=경로` 라벨. 인덱스 v2(`label/경로` 네임스페이싱 + folder 태그). (`be19bd0`)
- **folder 스코프 검색** — `search_notes`/`ask_brain`/`capture_note`에 `folder` 파라미터(기본 전체). (`be19bd0`)
- 인박스→폴더 **승격 UX는 보류**(단일 폴더로 먼저 운영, 필요시 도입 — [BACKLOG](BACKLOG.md) C). (`4dfa657`)

### 백업 / 복구
- **`make backup`** — 메모리 export + 노트 repo 커밋·푸시(멱등, 파생 인덱스 제외). **`make backup-cron`** — crontab 자동 등록. (`be19bd0`, `3124e98`)
- **`make recover` / `restore` / `reindex`** — 새 기기 원커맨드 복구(설치→기동→노트 clone→`memory-import`→재인덱싱). (`41fcbf2`)

### 인증 / 시크릿
- **claude 인증을 OAuth 토큰 방식으로** — `CLAUDE_CODE_OAUTH_TOKEN`(`make claude-token`). 컨테이너·macOS Keychain 문제 해소. (`1ffd71e`)
- **시크릿 헬퍼** — `make init-env` / `token` / `secrets`. (`8f99187`)

### 비개발자 온보딩
- **`make mcp-install`** — Claude Code에 MCP 원클릭 등록(절대경로·시드 user 자동). (`4011475`)
- **가이드형 `make` 명령** — 터미널에서 한 단계씩 안내, 비대화 환경은 기본값 자동(`up`/`recover`/`clean` 안전가드 등). (`2e12c40`)

### 대화형 관리 도구 (NEW)
- **`list_memories` / `delete_memory` / `list_notes` / `delete_note`** — 쌓인 기억·노트를 **채팅창에서 보고 정리**. 비개발자의 "보기·처리" 갭 해소. (`8ecb984`)

### 안정성 / 보안 (CodeRabbit 리뷰 후속)
- `set -euo pipefail` 함정 수정(grep/명령치환 `|| true`) — 토큰 교체·MCP 등록 최초 경로. (`93aaf3c`)
- backup-init **git identity 가드**를 `git var`로 — config·환경변수·strict까지 실제 commit과 일치. (`63feccd`, `107b9f2`)
- `memory.md` 색인 제외를 **폴더 루트로 한정**(하위 노트 보존). (`93aaf3c`)
- recover: `RESTORE_REPO` 불일치 시 중단(엉뚱한 백업 방지) + **에러에 raw URL 대신 owner/repo만**(자격증명 노출 방지). (`c7c598f`, `884d379`)

### 문서
- **입문서**(`docs/concepts.md`, 비유) · **FAQ**(`docs/faq.md`) · **사용법**(`docs/usage.md`) · **BACKLOG**(검증·보류) · **ROADMAP**(개인 전용).
- 라이브 스택 검증 완료(다중폴더·백업·복구·reindex·시크릿·루프백 — [BACKLOG](BACKLOG.md) A).

---

## 그 이전 (기반)

repo 하나로 도는 완결형 로컬 AI 스택의 토대 — OpenAI/Anthropic 호환 API(claude/codex CLI),
임베딩 게이트웨이(LiteLLM+bge-m3), 메모리(OpenMemory/mem0+pgvector), second-brain RAG, MCP(stdio).
자세한 구조는 [README](README.md) · [ROADMAP](ROADMAP.md).
