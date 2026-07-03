# Plan: Persona Agent Registry

상위: [goal](goal.md) · [spec](spec.md)

## 접근 요약

노트와 동일한 패턴을 그대로 적용한다: **파일 정본(`agents/*.md`) → 파생 재생성(배포
산출물)**. 신규 모듈 `src/agents/`가 레지스트리 로드·검증과 도구별 어댑터(Claude/Codex)를
담당하고, 진입점은 Make 타깃과 MCP 도구 두 개다. 배포 산출물에는 managed 마커를 넣어
"우리가 만든 것만 갱신·삭제"를 보장한다(멱등 + prune). 백업·복원은 레지스트리가
데이터 폴더 안에 있으므로 기존 흐름이 무변경으로 커버한다.

## 도메인 경계 (DDD)

새 bounded context **Agent Registry** — second-brain(노트 색인·RAG)·memory(mem0)와
분리된 자산 관리 도메인. 유비쿼터스 언어:

- **페르소나(persona)**: 역할·지침·대상 도구별 모델을 가진 에이전트 정의 1건.
- **레지스트리(registry)**: 페르소나 정본 파일들의 집합 (`<데이터폴더>/agents/*.md`).
- **배포(deploy)**: 정본 → 도구별 파생 산출물 내보내기. 단방향.
- **managed 마커**: 산출물이 localmind 생성물임을 식별하는 표식. 마커 없는 파일은 불가침.
- **prune**: 정본에서 사라진 페르소나의 마커 있는 산출물 제거.

second-brain 경계와의 접점은 단 하나 — 노트 색인이 `agents/`를 제외한다(FR-10).

## 정본 스키마 (frontmatter)

```yaml
---
name: sample-critic            # 필수, kebab-case, 레지스트리 내 고유
description: 샘플 — 적대적 리뷰어  # 필수, 한 줄
targets:                       # 최소 1개 대상 필수
  claude:
    model: opus                # Claude Code frontmatter의 model로 그대로 전달
    tools: Read                # 생략 가능(생략 시 도구 제한 없음)
  codex:
    model: gpt-5.4
    reasoning_effort: high     # low|medium|high|xhigh, 생략 가능
    sandbox: read-only         # 생략 가능(codex 기본값 사용)
---
(본문 전체 = 시스템 프롬프트 / developer instructions)
```

`scope`(노트 폴더 라벨) 등 런타임 위임용 필드는 다음 스펙에서 추가한다 — 지금 넣지
않는다(투기 금지). 파서는 알 수 없는 필드를 오류가 아닌 경고로 통과시켜 전방 호환한다.

## 배포 산출물 매핑

| 대상 | 경로 | 내용 | 마커 |
|---|---|---|---|
| Claude Code | `~/.claude/agents/<name>.md` | frontmatter(name·description·tools·model) + 본문 | 본문 첫 줄 `<!-- managed-by: localmind (persona: <name>) -->` |
| Codex 프로필 | `~/.codex/<name>.config.toml` | `model`, `model_reasoning_effort` — `codex exec -p <name>` 위임용 | 첫 줄 `# managed-by: localmind (persona: <name>)` |
| Codex 에이전트 | `~/.codex/agents/<name>.toml` | `name`·`description`·`developer_instructions`(본문)·`model` | 첫 줄 `# managed-by: localmind (persona: <name>)` |

마커는 **페르소나 이름을 바인딩**하고, managed 판정은 파일 전체를 읽어 "마커의 이름 =
파일명"일 때만 성립한다(self-review 중대-1·2 반영). 산출물을 복사·개명해 개인화한
파일은 이름 불일치로 사용자 소유가 되어 갱신·prune에서 자동 제외된다 — "직접 만든 파일
불가침"이 복사본까지 성립한다. 레지스트리 정본 기본 위치는 **첫 NOTES_DIR 폴더의
`agents/`** 로 결합한다(중대-3 반영 — 노트를 옮겨도 백업 편입·색인 제외 규칙 유지).

- 대상 루트(`~/.claude`, `~/.codex`)가 없으면 해당 대상 전체를 건너뛰고 알림(FR-8) —
  루트가 있으면 하위(`agents/`)는 생성한다.
- 경로는 테스트를 위해 함수 파라미터로 주입한다(기본값만 위 경로). 홈 디렉토리
  하드코딩 금지.
- Codex 프로필+에이전트 toml 병행 여부(spec Open question)는 단계 3에서
  `codex exec -p <name>` 실측으로 확정한다 — 프로필만으로 지침 전달이 안 되면 에이전트
  toml을 병행하고, 실측 결과를 이 plan에 기록한다.

## 영향 모듈

- **신규** `src/agents/registry.ts` — 레지스트리 로드·frontmatter 파싱·검증(중복 name,
  필수 필드). 기존 노트 파싱 유틸이 있으면 재사용, 없으면 최소 파서.
- **신규** `src/agents/deploy.ts` — 배포 오케스트레이션(멱등·prune·managed 판정) +
  Claude/Codex 어댑터(변환 함수는 순수 함수로 분리해 단위 테스트).
- **수정** `src/mcp-server.ts` — MCP 도구 2개 추가: `list_agents`(목록),
  `deploy_agents`(배포 실행·결과 한국어 요약).
- **수정** `src/brain.ts` — 노트 파일 수집에서 데이터 폴더 직하 `agents/` 제외(FR-10).
- **수정** `Makefile` — `agents-deploy` 타깃.
- **신규** `templates/agents/sample-persona.md` — 주석 포함 샘플(FR-11).
- **신규** `docs/agents.md` + README 링크 — 정의·배포 방법, 민감정보 경고, "파생은
  정본에서 고친다" 안내.
- **무변경** 백업·복원(Makefile backup/restore/recover) — 레지스트리가 `BACKUP_DIR`
  안이라 자동 포함(AC-10은 통합 검증만).

## 단계 (task 분해 가능)

1. **스키마·파서·검증** — `registry.ts` TDD: 정상 파싱, 필수 필드 누락, name 중복,
   frontmatter 깨짐. (AC-3, AC-4의 단위 레벨)
2. **Claude 어댑터** — 변환(모델·tools 반영)·마커 삽입·쓰기·무관 파일 보호.
   (AC-1 절반, AC-5)
3. **Codex 어댑터** — 프로필·에이전트 toml 생성. `codex exec -p <샘플>`로 모델·지침
   반영 실측 → 산출물 조합 확정·plan에 기록. (AC-1 나머지)
4. **멱등·prune** — 재배포 무변경, 정본 삭제 시 마커 산출물만 제거. (AC-2, AC-6)
5. **graceful** — 대상 루트 없음 건너뜀, 빈 레지스트리 안내. (AC-7, AC-8)
6. **진입점** — `make agents-deploy` + MCP `list_agents`/`deploy_agents`. (AC-11)
7. **색인 제외** — brain 파일 수집에서 `agents/` 제외 + 회귀 테스트. (AC-9)
8. **문서·샘플** — sample-persona, docs/agents.md, README. (FR-11)
9. **복원 재현 검증** — 임시 디렉토리에서 backup→restore→deploy 통합 확인. (AC-10)
10. **도그푸드** — 실 기기에서 배포 → Claude Code가 서브에이전트로 인식하는지,
    `codex exec -p`가 지정 모델로 도는지 실제 실행으로 관찰(§8 도그푸드 원칙).

## 테스트 전략

- **단위** (`src/agents/*.test.ts`, 미러링): 파싱·검증(AC-3·4), 변환 순수 함수의
  모델/effort/tools 반영(AC-1의 내용 검증), 마커 판정.
- **통합** (임시 디렉토리 주입): 배포 end-to-end(AC-1), 멱등(AC-2), 무관 파일
  보호(AC-5), prune(AC-6), 도구 미설치(AC-7), 빈 레지스트리(AC-8), 복원 재현(AC-10).
- **통합(brain)**: 색인 제외(AC-9) — agents/ 파일 색인 후 검색 미노출.
- **MCP**: 도구 등록·응답 형식(AC-11) — 기존 MCP 도구 테스트 패턴 재사용.
- **수동 도그푸드**: 단계 10 — 자동화 불가한 실 도구 인식 확인.

## Open questions

- ~~Codex 프로필 vs 에이전트 toml 병행 — 단계 3 실측으로 확정~~ → **실측 완료(codex-cli
  0.141.0, 2026-07-03): 병행 유지 확정.** `codex exec -p <name>`이 별도 파일 프로필
  (`~/.codex/<name>.config.toml`)을 인식하고 세션 기록에 `model=gpt-5.5`·`effort=high`가
  적용됨을 확인. 프로필은 모델·강도를 나르고(exec 위임 경로), 페르소나 지침은 exec
  프롬프트에 실어 보내거나 네이티브 서브에이전트(`agents/<name>.toml`의
  developer_instructions)가 나른다 — 둘은 용도가 달라 함께 배포한다.
- ~~frontmatter 파서~~ → 기존 재사용 유틸 없음 확인. 새 의존성 없이 이 스키마 전용
  미니 파서로 구현(specs/010 공급망 규칙 충족). 도그푸드에서 인라인 주석(`값 # 주석`)
  미처리 결함을 발견해 YAML 규약대로 벗기도록 수정·회귀 테스트 추가.
- **에이전트 toml의 `model_reasoning_effort` 실측(재검 조건)**: codex-cli 0.141.0이
  해당 키가 든 `agents/<name>.toml`을 거부하지 않음(기동·exec 정상, stderr 파싱 오류
  없음) — strict-거부 리스크 해소. 단 top-level exec의 서브에이전트 인식 여부는 이
  프로브로 확증되지 않았고, 네이티브 스폰 활용은 018(오케스트레이션)에서 검증한다.
- **후속 과제(재검에서 완료 비차단으로 판정)**: ① P1 — 파일명과 정확히 일치하는 마커
  전문을 손파일에 적으면 여전히 prune 대상(근본 해결은 배포 manifest, 발생 조건 극히
  좁음), ② 경미-3 — 따옴표 값 뒤 잔여 텍스트 조용히 폐기·중복 키 last-wins 무경고.
