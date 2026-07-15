/**
 * rules/compose.ts 테스트 — base+overlay 합성, overlay 우선 (specs/041 FR-2, AC-6).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compose, composedBody } from "./compose.js";
import type { RuleDoc } from "./registry.js";

function doc(name: string, content: string, order = 0): RuleDoc {
  return { name, content, order, file: `${name}.md` };
}

describe("compose", () => {
  it("AC-6: 같은 name 충돌 시 overlay가 base를 덮는다(precedence)", () => {
    const base = [doc("spec-first", "BASE: spec 먼저")];
    const overlay = [doc("spec-first", "OVERLAY: pkpk는 spec 필수·엄격")];
    const cs = compose(base, overlay);
    const merged = cs.docs.find((d) => d.name === "spec-first");
    assert.equal(merged?.content, "OVERLAY: pkpk는 spec 필수·엄격");
    assert.equal(merged?.source, "overlay");
    // 회귀 핀: 충돌 시 base 값이 남으면 실패해야 한다(precedence 역전 포착)
    assert.notEqual(merged?.content, "BASE: spec 먼저");
  });

  it("overlay 전용 규칙은 뒤에 추가된다", () => {
    const base = [doc("a", "A")];
    const overlay = [doc("b", "B")];
    const cs = compose(base, overlay);
    assert.deepEqual(cs.docs.map((d) => d.name), ["a", "b"]);
    assert.equal(cs.docs[1].source, "overlay");
  });

  it("overlay가 없으면 base만", () => {
    const base = [doc("a", "A"), doc("b", "B")];
    const cs = compose(base, []);
    assert.deepEqual(cs.docs.map((d) => d.name), ["a", "b"]);
    assert.ok(cs.docs.every((d) => d.source === "base"));
  });

  it("composedBody는 규칙 본문을 빈 줄로 이어붙인다", () => {
    const cs = compose([doc("a", "첫째"), doc("b", "둘째")], []);
    assert.equal(composedBody(cs), "첫째\n\n둘째");
  });
});
