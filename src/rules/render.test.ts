/**
 * rules/render.ts 테스트 — 표면별 산출물 형태 (specs/041 FR-3~5, AC-7·AC-9·AC-10).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  renderClaudeImportFile,
  renderClaudeGlobalStubSection,
  renderCodexGlobalSection,
  renderRepoAgentsSection,
  renderRepoClaudeStubSection,
  SECTION_BEGIN,
  SECTION_END,
} from "./render.js";
import type { ComposedRuleset } from "./compose.js";

const CS: ComposedRuleset = {
  docs: [
    { name: "spec-first", content: "구현 전 spec 을 먼저 쓴다.", source: "base" },
    { name: "deploy", content: "main 브랜치 push 금지.", source: "overlay" },
  ],
};

describe("Claude 글로벌 렌더", () => {
  it("AC-9: 스텁 섹션이 소프트 포인터가 아니라 상대 @import 를 담는다", () => {
    const section = renderClaudeGlobalStubSection();
    assert.ok(section.includes(SECTION_BEGIN) && section.includes(SECTION_END));
    assert.match(section, /@localmind-rules\.md/);
    // 회귀 핀: @import 지시가 빠지면(설명만 있으면) 하드주입이 깨진다 — 실패해야 한다
    assert.ok(section.includes("@localmind-rules.md"), "@import 없으면 하드주입 상실");
    // 스텁에는 규칙 본문이 인라인되지 않는다(@import 대상 파일에만)
    assert.doesNotMatch(section, /spec 을 먼저/);
  });

  it("@import 대상 파일은 합성 본문 + 관리 마커를 담는다", () => {
    const file = renderClaudeImportFile(CS);
    assert.match(file, /구현 전 spec 을 먼저 쓴다\./);
    assert.match(file, /main 브랜치 push 금지\./);
    assert.match(file, /managed-by: localmind \(rules\)/);
  });
});

describe("Codex 글로벌 렌더", () => {
  it("합성 본문을 인라인 섹션으로 담는다(@import 미지원)", () => {
    const section = renderCodexGlobalSection(CS);
    assert.ok(section.includes(SECTION_BEGIN) && section.includes(SECTION_END));
    assert.match(section, /구현 전 spec 을 먼저 쓴다\./);
    assert.match(section, /main 브랜치 push 금지\./);
    assert.doesNotMatch(section, /@import|@localmind|@AGENTS/);
  });
});

describe("repo 렌더", () => {
  it("AGENTS.md 섹션은 합성 본문 인라인", () => {
    const section = renderRepoAgentsSection(CS);
    assert.match(section, /구현 전 spec 을 먼저 쓴다\./);
    assert.match(section, /main 브랜치 push 금지\./);
  });

  it("AC-10: CLAUDE.md 스텁은 @AGENTS.md 이며 규칙 본문을 중복 담지 않는다", () => {
    const section = renderRepoClaudeStubSection();
    assert.match(section, /@AGENTS\.md/);
    // 회귀 핀: 규칙 본문이 CLAUDE.md 스텁에 섞이면 실패
    assert.doesNotMatch(section, /spec 을 먼저|push 금지/);
  });
});

describe("AC-7: 경로 무관 (positive-assert, 고정 프리픽스 allowlist 금지)", () => {
  const outputs = [
    renderClaudeImportFile(CS),
    renderClaudeGlobalStubSection(),
    renderCodexGlobalSection(CS),
    renderRepoAgentsSection(CS),
    renderRepoClaudeStubSection(),
  ];
  it("어떤 산출물에도 절대경로 세그먼트가 없고, @import 는 상대경로다", () => {
    for (const out of outputs) {
      // 절대경로 세그먼트 일반 패턴 부재(/Users, /home, /root, /var, /tmp 등 무엇이든)
      assert.doesNotMatch(out, /(?:^|[\s"'(])\/[A-Za-z][A-Za-z0-9._-]*\//m, `절대경로 누출: ${out.slice(0, 80)}`);
      // 절대 @import(@/… 또는 @~ 홈절대) 금지 — 상대여야 경로 무관
      assert.doesNotMatch(out, /@[~/]/, `비상대 @import 누출: ${out.slice(0, 80)}`);
    }
  });
});
