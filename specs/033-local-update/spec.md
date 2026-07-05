# Spec — `make update` (specs/033)

> **검증 표기**: 각 항목의 `[x]`는 2026-07-05 self-review(독립 크리틱 2라운드 clean)에서
> 구현+테스트로 충족이 확인됐다는 표시다. 근거는 `scripts/update.test.sh`의 시나리오(s1~s8)
> 및 실기기 도그푸드. 미충족 항목은 체크 없이 사유를 부기한다.

## Functional Requirements

- [x] **FR-1 코드 정본 pull** *(goal: Objective — 정본 최신화)*
  프로젝트 repo에서 `git pull --ff-only`를 수행한다. upstream(원격 추적 브랜치)이 없으면
  pull을 생략하고 안내한다. 실패(로컬 분기 등)해도 이후 단계는 계속 진행한다.
- [x] **FR-2 변경 시 빌드** *(goal: Objective — 파생물 재생성)*
  코드 pull로 HEAD가 바뀐 경우에만 `npm run build`를 수행한다(dist/ = stdio MCP 파생물).
  실행 중 docker 스택 반영은 안내만 한다(`make up`).
- [x] **FR-3 노트 정본 pull** *(goal: Objective — 정본 최신화)*
  NOTES_DIR(정본 규칙: 환경변수 → .env → 기본 `~/.localmind`)의 각 폴더에 대해, git repo이고
  원격이 있으면 `git pull --ff-only`. git repo가 아니면 건너뛰고 안내한다(오류 아님).
- [x] **FR-4 파생물 재생성** *(goal: Objective — 파생물 재생성)*
  노트 pull 이후 재인덱싱(`scripts/reindex.sh`) → 페르소나 배포(`agents:deploy`) → 스킬
  배포(`skills:deploy`)를 순서대로 수행한다. 모두 멱등이다.
- [x] **FR-5 미리보기** *(goal: Constraints — 파괴 금지)*
  `DRY_RUN=1`이면 변경 없이 수행할 명령만 출력한다.
- [x] **FR-6 실패 요약·종료 코드** *(goal: Expected outcome — 실패 가시성)*
  어떤 단계가 실패해도 나머지 단계는 진행하고, 마지막에 실패 단계 요약을 출력하며 종료 코드
  1로 끝난다. 전부 성공이면 0.
- [x] **FR-7 파괴 부재** *(goal: Constraints — ff-only)*
  pull 실패 시 워킹트리·로컬 커밋이 그대로 보존된다. 자동 merge/rebase/reset 금지.

## Acceptance Criteria (테스트 1:1 — scripts/update.test.sh)

- [x] **AC-1** *(s1)* Given 코드 repo가 origin보다 behind, When `update`, Then HEAD가 origin과
  같아지고 빌드가 호출된다.
- [x] **AC-2** *(s2)* Given 코드 변경 없음, When `update`, Then 빌드가 호출되지 않는다.
- [x] **AC-3** *(s1)* Given NOTES_DIR에 origin보다 behind인 git 노트 폴더, When `update`,
  Then 새 노트 파일이 로컬에 존재한다.
- [x] **AC-4** *(s2)* Given NOTES_DIR에 git repo가 아닌 폴더, When `update`, Then 해당 폴더는
  건너뛰고 전체는 성공(exit 0)한다.
- [x] **AC-5** *(s1)* When `update`, Then 재인덱싱 → agents:deploy → skills:deploy가 이 순서로
  호출된다.
- [x] **AC-6** *(s3)* Given 코드 repo가 origin과 분기(ff 불가), When `update`, Then pull은
  실패하지만 로컬 커밋이 보존되고, 노트·파생물 단계는 수행되며, exit 1로 끝난다.
- [x] **AC-7** *(s4)* Given `DRY_RUN=1`, When `update`, Then HEAD·노트 파일이 변하지 않고
  빌드·재인덱싱·배포가 실행되지 않는다(계획만 출력).
- [x] **AC-8** *(s5)* Given 재인덱싱 실패, When `update`, Then 안내 문구와 함께 exit 1이되,
  이후 배포 단계는 수행된다.
- [x] **AC-9** *(s6)* Given upstream 없는 코드 repo, When `update`, Then pull을 생략하고
  안내하며 나머지는 정상 진행한다.
- [x] **AC-10** *(s7 — revert-to-red 확인)* Given 부모 git repo 안에 중첩된 비git 노트 폴더
  (예: `$HOME`이 dotfiles repo), When `update`, Then 부모 repo를 pull하지 않고 해당 폴더를
  건너뛴다(self-review S-1 회귀).
- [x] **AC-11** *(s8 — NPM_FAIL_MATCH로 빌드 실패 격리)* Given 코드 갱신 후 빌드 실패,
  When `update`, Then 실패를 표면화(exit 1)하되 이후 단계(재인덱싱·배포)는 계속 시도한다.
- [x] (AC-3 보강) *(s2 — `main=경로` 라벨)* NOTES_DIR의 `라벨=경로` 표기도 통합 레벨에서
  pull이 동작한다.

## 검증 기록 (2026-07-05)

- [x] 자동 테스트 34/34 green — 기본 bash + macOS 기본 `/bin/bash` 3.2.57 양쪽
- [x] 독립 크리틱(적대 리뷰) 2라운드 clean — 치명·중대 0. 1라운드 사소 1건(S-1 중첩 repo)
      수정·회귀 테스트 반영, 자기갱신 안전성·명령 주입 부재·`--prefix` 동작 실증
- [x] 실기기 도그푸드(m5) 2회 — `make update` 전 단계 성공(exit 0), 멱등 확인
- [ ] 다른 기기(m1)에서 스모크 — 미실시(후속: 다음 m1 사용 시 `make update` 1회)

## Open questions

- ~~실행 중 스택 자동 재기동 여부~~ → Non-goal로 확정(안내만 — 사용자가 `make up` 선택).
