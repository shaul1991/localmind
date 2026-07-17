/**
 * AC-19 — root/scaffold SDD 규약의 실행 등급 배치가 provider/model/tool 중립인지 검증한다.
 * (specs/044 FR-14, SM-11)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootAgents = () => fs.readFileSync(path.join(REPO_ROOT, "AGENTS.md"), "utf8");
const scaffoldAgents = () => fs.readFileSync(path.join(REPO_ROOT, "templates", "sdd", "AGENTS.md"), "utf8");

describe("execution-policy-neutrality: AC-19", () => {
  it("root AGENTS.md는 추상 실행 등급 3종으로 역할을 배치한다", () => {
    const a = rootAgents();
    assert.match(a, /`critical-reasoning`/);
    assert.match(a, /`standard`/);
    assert.match(a, /`economy`/);
  });

  it("root AGENTS.md의 mandatory 역할 배치에 concrete model 이름이 없다", () => {
    const a = rootAgents();
    for (const model of ["Opus", "Sonnet", "Haiku", "Fable"]) {
      assert.ok(!a.includes(model), `concrete model "${model}"이 남아 있음`);
    }
  });

  it("provider-runtime 전용 tool identifier가 필수 절차에 없다(capability/outcome으로 대체)", () => {
    const a = rootAgents();
    for (const tok of ["WebFetch", "WebSearch", "context7", "AskUserQuestion", "`Agent` 도구"]) {
      assert.ok(!a.includes(tok), `runtime 전용 tool identifier "${tok}"이 남아 있음`);
    }
  });

  it("model/tier 선택 능력이 없을 때 현재 session fallback을 명시한다(중단 아님)", () => {
    const a = rootAgents();
    assert.match(a, /선택 능력이 없거나/);
    assert.match(a, /현재 session이 같은 역할/);
    assert.match(a, /중단되지 않는다|중단하지 않는다/);
    assert.match(a, /fallback을 보고|fallback을 밝힌다/);
  });

  it("행동 gate(SDD/TDD/final review/evidence/commit·push·CI)는 약화하지 않는다", () => {
    const a = rootAgents();
    assert.match(a, /SDD\/TDD, 최종 review 강도, evidence 체크, commit\/push\/CI 같은 행동 gate는 약화하지 않는다/);
  });

  it("project-owned MCP operation(capture_note)은 문서화 허용 — 필수 blocker 아님", () => {
    // capture_note는 forbidden 목록이 아니며(project-owned portable), 결정 로그에 남아 있어도 된다
    const a = rootAgents();
    assert.match(a, /capture_note/);
  });

  it("scaffold AGENTS.md도 goal-impl를 쓰고 old /goal 구현 표면을 약화하지 않는다", () => {
    const s = scaffoldAgents();
    assert.match(s, /goal-impl/);
    assert.ok(!/## `\/goal \{NNN\}` 처리 방법/.test(s), "old /goal 구현 표면 없음");
    assert.ok(!s.includes("WebFetch") && !s.includes("WebSearch"), "scaffold도 runtime tool 중립");
  });
});
