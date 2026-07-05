# Spec: Persona Agent Registry

상위: [goal](goal.md)

## Scope

localmind 데이터 폴더 안의 `agents/` 하위 마크다운 파일들을 페르소나 에이전트의
**정본 레지스트리**로 정의하고, 이를 파싱·검증해 ① Claude Code 서브에이전트 형식,
② Codex CLI 설정 형식으로 **배포(내보내기)** 하는 기능. 배포는 CLI(Make 타깃)와
MCP 도구 양쪽에서 실행할 수 있다. 레지스트리 파일은 기존 백업 흐름(git 커밋·push)에
자동 포함된다.

## Context

- 노트·메모리는 `~/.localmind`(기본 `BACKUP_DIR`)에 파일 정본으로 있고 `make backup`이
  전체를 git 커밋·push, `make restore`/`make recover`가 복원한다(specs/006·015).
- Claude Code는 `~/.claude/agents/<name>.md`(frontmatter: name·description·tools·model +
  본문 시스템 프롬프트)를 서브에이전트로 인식한다.
- Codex CLI(0.141+)는 `~/.codex/<profile>.config.toml`(프로필: model·model_reasoning_effort
  등, `codex exec -p <profile>`로 사용)과 `~/.codex/agents/<name>.toml`(네이티브
  서브에이전트: name·description·developer_instructions·model 등)을 인식한다.
- localmind에는 현재 에이전트 개념·코드가 없다. `~/.localmind` 하위 `.md`는 노트로
  색인되므로, 레지스트리 파일이 노트 검색에 섞이는 문제를 함께 다뤄야 한다.

## Functional Requirements

- **FR-1 (레지스트리 정본)**: localmind 데이터 폴더의 `agents/` 하위 `.md` 파일 하나가
  페르소나 하나를 정의한다. frontmatter에 최소 `name`(고유, kebab-case)·`description`과
  **대상 도구별 모델 지정**(claude/codex 각각의 model, codex는 reasoning effort 포함
  가능)을 담고, 본문이 시스템 프롬프트(지침)다. 정확한 필드 스키마는 plan에서 확정한다.
  → goal: Objective, Constraints(파일 정본)

- **FR-2 (파싱·검증)**: 레지스트리를 읽어 각 정의를 검증한다 — 필수 필드 누락,
  `name` 중복, frontmatter 파싱 실패를 항목별로 평이한 한국어 메시지로 보고하고,
  유효한 정의만 배포 대상으로 삼는다(전체 실패로 번지지 않음).
  → goal: Constraints(비개발자 친화), Success metrics

- **FR-3 (Claude Code 배포)**: 유효한 각 페르소나를 Claude Code 서브에이전트 파일
  형식으로 변환해 Claude Code 에이전트 폴더에 쓴다. frontmatter의 claude용 모델·도구
  지정이 산출물에 반영된다.
  → goal: Objective, Success metrics(모델 반영)

- **FR-4 (Codex 배포)**: 유효한 각 페르소나를 Codex 설정으로 변환해 쓴다 — 페르소나별
  프로필(모델·reasoning effort; `codex exec -p <name>` 위임용)과 페르소나 지침이 담기는
  에이전트 정의. 정확한 파일 배치는 plan에서 확정한다.
  → goal: Objective, Success metrics(모델 반영)

- **FR-5 (managed 마커 — 무관 파일 보호)**: 배포 산출물에는 localmind가 생성했음을
  식별하는 마커를 넣는다. 배포는 마커가 있는 파일만 갱신·삭제하며, 마커 없는(사용자가
  직접 만든) 동명 파일이 있으면 건드리지 않고 경고만 출력한다.
  → goal: Risks(파생 파일 충돌), Success metrics(멱등)

- **FR-6 (prune)**: 레지스트리에서 삭제된 페르소나의 배포 산출물(마커 있는 것만)은
  다음 배포 때 제거된다 — 정본과 파생이 항상 일치한다.
  → goal: Objective(정본-파생 일관성)

- **FR-7 (실행 진입점)**: 배포는 ① Make 타깃(CLI), ② MCP 도구(AI 클라이언트에서
  "에이전트 배포해줘"로 실행 가능) 양쪽에서 동일하게 실행된다. MCP 도구는 페르소나
  목록 조회도 제공한다(이후 스펙의 런타임 위임이 같은 조회를 재사용한다).
  → goal: Objective, Expected outcome(후속 스펙 토대)

- **FR-8 (도구 미설치 graceful)**: 대상 도구의 폴더가 없는 기기에서는 해당 대상만
  건너뛰고 알림을 출력하며, 나머지 대상 배포는 정상 진행한다. 대상 폴더의 상위가
  존재하면(도구 설치됨) 하위 폴더는 자동 생성한다.
  → goal: Constraints(graceful)

- **FR-9 (백업·복원 편입)**: 레지스트리 파일은 기존 `make backup`에 자동 포함되고
  (데이터 폴더 안에 있으므로 추가 설정 불필요), 복원 후 배포를 실행하면 새 기기에서
  동일한 페르소나 체계가 재현된다. 복원이 배포를 자동 실행하지는 않는다(명시적 실행).
  → goal: Success metrics(기기 재현), Constraints(명시적 배포)
  — **개정(2026-07-04, specs/019 FR-2)**: 기기 복구 맥락(`make restore`/`recover`)에
  한해 복원 후 배포를 자동 실행하도록 반전(사용자 승인 — 기기 전환 도그푸드에서
  "복원≠배포"가 함정으로 실증됨). 일상 편집 흐름의 명시적 배포 원칙은 유지된다.

- **FR-10 (노트 색인 제외)**: `agents/` 하위 파일은 노트 색인·검색 대상에서 제외된다 —
  페르소나 지침이 ask_brain/search_notes 결과에 섞이지 않는다.
  → goal: Objective(레지스트리는 노트가 아닌 별개 자산)

- **FR-11 (샘플·문서)**: 검증용 최소 샘플 페르소나 1개(주석으로 필드 설명 포함)와
  사용 문서(정의 방법, 배포 방법, 민감정보 경고, 파생 파일은 정본에서 고치라는 안내)를
  제공한다. 페르소나 구성 확정은 비목표(goal Non-goals)임을 문서에 명시한다.
  → goal: Constraints(비개발자 친화), Risks(민감정보)

## Acceptance Criteria

- **AC-1 (기본 배포)**: Given 유효한 페르소나 정의 1개가 레지스트리에 있을 때,
  When 배포를 실행하면,
  Then Claude Code 에이전트 폴더와 Codex 설정 위치에 각각 마커가 포함된 산출물이
  생성되고, 정의한 모델·reasoning effort가 산출물에 반영되어 있다.

- **AC-2 (멱등)**: Given AC-1의 배포가 완료된 상태에서,
  When 변경 없이 배포를 다시 실행하면,
  Then 산출물 내용이 동일하게 유지되고 오류가 없다.

- **AC-3 (엣지 — 검증 실패 격리)**: Given 레지스트리에 유효한 정의 1개와 필수 필드가
  빠진 정의 1개가 함께 있을 때,
  When 배포를 실행하면,
  Then 잘못된 정의는 파일명과 원인이 한국어로 보고되고, 유효한 정의는 정상 배포된다.

- **AC-4 (엣지 — name 중복)**: Given 서로 다른 두 파일이 같은 `name`을 선언했을 때,
  When 배포를 실행하면,
  Then 중복이 보고되고 해당 name은 배포되지 않는다(어느 한쪽을 임의 선택하지 않는다).

- **AC-5 (엣지 — 무관 파일 보호)**: Given 배포 대상 위치에 마커 없는 동명 파일이
  이미 존재할 때,
  When 배포를 실행하면,
  Then 그 파일은 변경되지 않고, 건너뛰었다는 경고가 출력되며, 다른 페르소나 배포는
  정상 진행된다.

- **AC-6 (prune)**: Given 배포된 페르소나의 정본 파일을 레지스트리에서 삭제한 뒤,
  When 배포를 다시 실행하면,
  Then 해당 페르소나의 마커 있는 산출물이 제거되고, 마커 없는 파일은 남는다.

- **AC-7 (엣지 — 도구 미설치)**: Given Codex 설정 폴더가 존재하지 않는 환경에서,
  When 배포를 실행하면,
  Then Codex 배포는 건너뛴다는 알림과 함께 생략되고 Claude Code 배포는 정상 완료된다.

- **AC-8 (엣지 — 빈 레지스트리)**: Given `agents/` 폴더가 없거나 비어 있을 때,
  When 배포를 실행하면,
  Then 배포할 페르소나가 없다는 안내만 출력하고 실패하지 않는다(기존 산출물 prune은
  수행한다).

- **AC-9 (색인 제외)**: Given 페르소나 정의가 레지스트리에 있을 때,
  When 노트 재색인 후 페르소나 지침의 고유 문구로 노트 검색을 하면,
  Then 레지스트리 파일은 결과에 나타나지 않는다.

- **AC-10 (복원 재현)**: Given 백업 저장소에 레지스트리가 포함된 상태에서,
  When 새 환경에서 복원을 수행하고 배포를 실행하면,
  Then 원 기기와 동일한 배포 산출물이 생성된다.

- **AC-11 (MCP 조회·배포)**: Given MCP 서버가 기동된 상태에서,
  When 페르소나 목록 조회 도구와 배포 도구를 호출하면,
  Then 목록에 레지스트리의 페르소나가 반환되고, 배포 결과(성공·건너뜀·경고)가
  평이한 한국어로 요약되어 반환된다.

## Open questions

- ~~**모델 티어 별칭**: 지금은 도구별 구체 모델명을 직접 적는다. "리뷰 게이트 티어"처럼
  역할 티어 → 모델 매핑을 한 곳에서 관리하는 추상화는 페르소나 구성 인터뷰 이후
  필요성이 확인되면 별도 스펙으로 다룬다(지금 넣으면 투기적 복잡도).~~
- **Codex 산출물의 정확한 조합**(프로필 단독 vs 프로필+네이티브 에이전트 toml 병행)은
  plan에서 `codex exec -p` 위임 경로 실측 기준으로 확정한다.
- ~~**기존 speckit 페르소나 12개의 이관 여부**는 페르소나 재구성 인터뷰의 산출에 따른다 —
  이 스펙은 이관하지 않는다(goal Non-goals).~~
