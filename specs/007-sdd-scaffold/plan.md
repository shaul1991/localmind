# Plan: SDD Scaffold

> **044 확장 포인터**: specs/044가 `scaffoldSdd()`에 `CLAUDE.md`/`GEMINI.md` bridge item을 create-if-absent로 추가한다. 기존 단계·검증 기록은 유지된다.

상위: [goal](goal.md) · [spec](spec.md)

## 접근 요약

`templates/sdd/`(신규 최상위 폴더)에 정본 템플릿 파일들을 두고, `src/scaffold.ts`의
`scaffoldSdd(targetDir)` 함수가 이를 읽어 대상 디렉토리에 복사한다. 이 함수 하나를
`mcp-server.ts`(MCP 도구)와 `scripts/init-sdd.ts`(→ `make init-sdd`) 양쪽에서 그대로
호출해 로직 중복을 없앤다. 기존 `reindex.ts` 스크립트·`brain.ts`의 파일 IO 스타일을 따른다.

## 도메인 경계 (DDD)

- **scaffold 도메인**: "정본 템플릿을 대상 디렉토리에 안전하게 복사"라는 단일 책임.
  기존 second-brain(노트 RAG)·backup(개인 설정 백업) 도메인과 독립적이며, 파일시스템
  IO만 다루고 임베딩·게이트웨이 등 다른 서비스에 의존하지 않는다.
- **유비쿼터스 언어**:
  - *정본 템플릿(canonical template)*: `templates/sdd/`에 있는, 배포될 파일들의 원본
  - *스캐폴드(scaffold)*: 정본 템플릿을 대상 디렉토리에 복사하는 행위
  - *건너뜀(skipped)*: 대상에 동일 파일이 이미 있어 덮어쓰지 않고 넘어간 항목

## 영향 모듈

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `templates/sdd/AGENTS.md` | 신규 | 범용 SDD 규칙(localmind 전용 내용 제외) |
| `templates/sdd/goal.template.md` | 신규 | goal.md 빈 골격 |
| `templates/sdd/spec.template.md` | 신규 | spec.md 빈 골격 |
| `templates/sdd/plan.template.md` | 신규 | plan.md 빈 골격 |
| `src/scaffold.ts` | 신규 | `scaffoldSdd(targetDir)` 공용 함수 |
| `src/mcp-server.ts` | 수정 | `scaffold_sdd` MCP 도구 등록 |
| `scripts/init-sdd.ts` | 신규 | `make init-sdd`가 호출하는 얇은 CLI 래퍼 |
| `Makefile` | 수정 | `init-sdd` 타겟 추가 |
| `src/scaffold.test.ts` | 신규 | `scaffoldSdd()` 단위 테스트 |

## 단계 (task 분해 가능)

1. **`templates/sdd/AGENTS.md` 작성**: 저장소 루트 `AGENTS.md`를 기반으로 하되, "오픈소스
   대상 — 비개발자 포함" 섹션(localmind 전용)과 "다음 사용 가능 번호는... 005-note-link-graph"
   같은 localmind 상태 참조를 제거한다. 유지할 것: SDD 흐름(`specs/{NNN}-{slug}/{goal,spec,
   plan}.md`), `/goal {NNN}` 처리 방법(찾기→읽기→구현→테스트→**self-review 필수**→문서
   누락 알림), 구현 규율(TDD·외과적 변경·명시적 커밋).

2. **`templates/sdd/{goal,spec,plan}.template.md` 작성**: 이번 세션의 specs/001~006에서
   실제로 써온 섹션 구조를 기준으로 빈 골격 작성.
   - goal: Background/Problem/Objective/Expected outcome/Success metrics/Non-goals/
     Constraints/Stakeholders/Risks
   - spec: Scope/Context/Functional Requirements/Acceptance Criteria/Open questions
   - plan: 접근 요약/도메인 경계(DDD)/영향 모듈/단계/테스트 전략/Open questions

3. **`src/scaffold.ts` — `scaffoldSdd()`**:
   ```ts
   export interface ScaffoldItem { path: string; status: "created" | "skipped"; }
   export interface ScaffoldResult { items: ScaffoldItem[]; }
   export function scaffoldSdd(targetDir: string): ScaffoldResult
   ```
   - 템플릿 소스 경로는 이 모듈 기준 상대경로로 `templates/sdd/`를 가리킨다(빌드 후
     `dist/`에서도 동작하도록 `import.meta.url` 기반 경로 계산 — 기존 `brain.ts`가 `process.
     env.HOME` 등을 쓰는 방식과 달리 패키지 루트 기준 상대경로가 필요하므로 신중히 처리).
   - `AGENTS.md` → `targetDir/AGENTS.md` 복사(이미 있으면 skip).
   - `{goal,spec,plan}.template.md` → `targetDir/specs/`에 복사(폴더만 생성, 특정 번호
     하위 폴더는 만들지 않음 — 사용자가 첫 feature 작업 시 `001-...`을 직접 만들도록 유도).
   - 각 항목의 생성/건너뜀 여부를 `ScaffoldResult`로 반환.

4. **`mcp-server.ts` — `scaffold_sdd` 도구 등록**:
   - `inputSchema: { path: z.string().describe("...") }` (필수 — 미지정 시 zod가 자동 거부)
   - `scaffoldSdd(path)` 호출 → 결과를 "생성됨: AGENTS.md\n건너뜀(이미 존재): specs/" 형식
     텍스트로 변환해 반환.

5. **`scripts/init-sdd.ts` 작성**: `reindex.ts`와 동일한 패턴.
   ```ts
   import { scaffoldSdd } from "../src/scaffold.js";
   const dir = process.argv[2] || process.env.DIR;
   if (!dir) { console.error("사용법: npm run init-sdd -- <대상경로>"); process.exit(1); }
   const result = scaffoldSdd(dir);
   // 결과 출력
   ```

6. **`Makefile` — `init-sdd` 타겟**:
   ```make
   .PHONY: init-sdd
   init-sdd: ## SDD 작업 흐름(AGENTS.md+specs/)을 지정한 프로젝트에 심기 (DIR=<경로>)
   	@if [ -z "$(DIR)" ]; then echo "✗ DIR을 지정하세요: make init-sdd DIR=<경로>"; exit 1; fi
   	@npm run --silent init-sdd -- "$(DIR)"
   ```
   `package.json`에 `"init-sdd": "tsx scripts/init-sdd.ts"` 스크립트 추가.

7. **테스트 작성**: AC-1~7 커버. `scaffoldSdd()`는 순수 파일 IO라 임시 디렉토리로 완전히
   자동화 가능(임베딩·게이트웨이 불필요).

## 테스트 전략

| AC | 테스트 레벨 | 방법 |
|----|-------------|------|
| AC-1 (make 커맨드) | 통합 | 임시 디렉토리로 `npm run init-sdd -- <path>` 실행 → 파일 존재 확인 |
| AC-2 (MCP·make 동일 결과) | 단위 | `scaffoldSdd()`를 직접 호출해 MCP 핸들러와 스크립트 둘 다 같은 함수를 쓰는지 코드로 확인(동일 결과는 함수 재사용으로 구조적으로 보장됨) |
| AC-3 (기존 파일 보호) | 단위 | 대상에 더미 `AGENTS.md` 미리 생성 → `scaffoldSdd()` 호출 → 내용 불변 + `status: "skipped"` 확인 |
| AC-4 (대상 디렉토리 자동 생성) | 단위 | 존재하지 않는 경로로 `scaffoldSdd()` 호출 → 디렉토리 생성 + 파일 생성 확인 |
| AC-5 (범용성) | 단위 | `templates/sdd/AGENTS.md` 내용에 "make backup"·"localmind"·"오픈소스" 등 금지어가 없는지 grep 기반 검증 |
| AC-6 (path 누락) | 단위 | MCP 핸들러를 path 없이 호출 시 zod 스키마 검증 실패 확인(도구 등록 자체가 필수 파라미터 강제) |
| AC-7 (부분 적용) | 단위 | `specs/`만 미리 존재하는 대상 → `scaffoldSdd()` 호출 → `AGENTS.md`만 생성, `specs/` 항목은 skip 확인 |

## Open questions

- 템플릿 소스 경로 해석(`import.meta.url` 기반 vs 빌드 시 `dist/templates`로 복사) — TS
  빌드(`tsc`)가 `templates/`를 `dist/`로 자동 복사하지 않으므로, `tsconfig.json`/빌드
  스크립트에 `templates/` 복사 단계를 추가할지, 아니면 항상 저장소 루트 기준 절대경로로
  참조할지 결정 필요(구현 시 확정 — MCP 서버가 `tsx`로 소스 직접 실행되는 경우와 `dist/`
  빌드본으로 실행되는 경우 둘 다 커버해야 함).
- `templates/sdd/AGENTS.md`와 저장소 루트 `AGENTS.md`의 드리프트 방지책(예: 공통 섹션
  주석으로 "동기화 필요" 표시) — 초기 구현 후 필요성 재평가.
