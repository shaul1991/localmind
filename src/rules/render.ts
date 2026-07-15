/**
 * 규칙 표면 렌더러 — 합성 결과를 각 에이전트 표면의 산출물로 변환한다 (specs/041 FR-3~FR-5).
 *
 * 순수 함수(IO 없음). 표면 하나 = 렌더 함수 하나(페르소나 016의 renderXxx 패턴 대칭).
 *
 * 표면별 형태(D6·D7, T090 확정):
 *  - Claude 글로벌: `~/.claude/localmind-rules.md`(합성 본문, 전체 관리 파일) +
 *    `~/.claude/CLAUDE.md`에 `@localmind-rules.md` **상대 @import** managed 섹션(하드주입 보존).
 *  - Codex 글로벌: `~/.codex/AGENTS.md`에 합성 본문 **인라인** managed 섹션(Codex는 @import 미지원).
 *  - repo: `<repo>/AGENTS.md`에 합성 본문 인라인 섹션 + `<repo>/CLAUDE.md`에 `@AGENTS.md` 상대 스텁.
 *
 * 경로 무관(FR-7·I-5): @import은 절대경로가 아니라 **상대경로**(`@localmind-rules.md`·`@AGENTS.md`)를
 * 쓴다 — 어느 디바이스에서 생성해도 산출물에 기기 절대경로가 박히지 않는다.
 */
import { composedBody, type ComposedRuleset } from "./compose.js";
import { MANAGED_MARKER } from "../agents/deploy.js";

/** 섹션·파일 공통 관리 마커(하위 문자열). isManaged 판정과 섹션 경계에 쓰인다. */
export const RULES_MARKER = `${MANAGED_MARKER} (rules)`;
export const SECTION_BEGIN = `<!-- BEGIN ${RULES_MARKER} -->`;
export const SECTION_END = `<!-- END ${RULES_MARKER} -->`;
const EDIT_WARNING =
  "<!-- localmind가 관리하는 블록입니다 — 직접 편집하지 마세요(다음 배포에서 덮어씁니다). 규칙 정본은 localmind rules 레지스트리이며 overlay가 base보다 우선합니다. -->";

/** managed 섹션 텍스트(BEGIN … END)를 만든다. deploy가 이 블록만 upsert한다. */
export function wrapSection(inner: string): string {
  return [SECTION_BEGIN, EDIT_WARNING, "", inner.trim(), "", SECTION_END].join("\n");
}

/** `~/.claude/localmind-rules.md` 전체 내용(전체 관리 파일). 앞머리에 관리 마커. */
export function renderClaudeImportFile(cs: ComposedRuleset): string {
  return [
    `<!-- ${RULES_MARKER} — localmind rules 레지스트리에서 생성됨. 직접 편집 금지(정본에서 수정). -->`,
    "",
    composedBody(cs),
    "",
  ].join("\n");
}

/** `~/.claude/CLAUDE.md`에 넣을 managed 섹션 — 상대 @import(하드주입 보존). */
export function renderClaudeGlobalStubSection(): string {
  return wrapSection("@localmind-rules.md");
}

/** `~/.codex/AGENTS.md`에 넣을 managed 섹션 — 합성 본문 인라인(Codex @import 미지원). */
export function renderCodexGlobalSection(cs: ComposedRuleset): string {
  return wrapSection(composedBody(cs));
}

/** `<repo>/AGENTS.md`에 넣을 managed 섹션 — 프로젝트 overlay 인라인(base는 글로벌 표면이 주입). */
export function renderRepoAgentsSection(cs: ComposedRuleset): string {
  return wrapSection(composedBody(cs));
}

/** `<repo>/CLAUDE.md`에 넣을 managed 섹션 — `@AGENTS.md` 상대 스텁(규칙 본문 중복 없음). */
export function renderRepoClaudeStubSection(): string {
  return wrapSection("@AGENTS.md");
}
