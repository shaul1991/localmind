/**
 * rules/registry.ts 테스트 — base/overlay 정본 로드·검증·문제격리 (specs/041 FR-1, AC-11).
 * 모든 경로를 임시 디렉토리로 주입한다.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { loadRules } from "./registry.js";

let root: string;
let dir: string;

function writeRule(rel: string, content: string) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-rules-reg-"));
  dir = path.join(root, "rules");
  fs.mkdirSync(dir, { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("loadRules", () => {
  it("base·overlay를 로드한다(프론트매터 없어도 파일명이 name)", () => {
    writeRule("base/spec-first.md", "spec 먼저 작성한다.");
    writeRule("base/self-review.md", "구현 후 self-review.");
    writeRule("overlays/pkpk/deploy.md", "main push 금지.");
    const reg = loadRules(dir);
    assert.equal(reg.base.length, 2);
    assert.deepEqual(reg.base.map((d) => d.name).sort(), ["self-review", "spec-first"]);
    assert.equal(reg.base.find((d) => d.name === "spec-first")?.content, "spec 먼저 작성한다.");
    assert.equal(reg.overlays.get("pkpk")?.length, 1);
    assert.equal(reg.overlays.get("pkpk")?.[0].name, "deploy");
    assert.equal(reg.problems.length, 0);
  });

  it("프론트매터의 name·order를 존중한다", () => {
    writeRule("base/a.md", "---\nname: zeta\norder: 1\n---\n지타 규칙");
    writeRule("base/b.md", "---\nname: alpha\norder: 2\n---\n알파 규칙");
    const reg = loadRules(dir);
    // order 1(zeta)이 order 2(alpha)보다 앞
    assert.deepEqual(reg.base.map((d) => d.name), ["zeta", "alpha"]);
    assert.equal(reg.base[0].content, "지타 규칙");
  });

  it("AC-11: 무효 파일은 problems로 격리되고 throw 없이 유효 항목은 로드된다", () => {
    writeRule("base/good.md", "좋은 규칙");
    writeRule("base/Bad_Name.md", "---\nname: Bad_Name\n---\n대문자·언더스코어 이름");
    const reg = loadRules(dir);
    assert.equal(reg.base.length, 1);
    assert.equal(reg.base[0].name, "good");
    assert.equal(reg.problems.length, 1);
    assert.match(reg.problems[0].reason, /kebab-case/);
  });

  it("같은 name 중복은 어느 하나를 채택하지 않고 전부 problems로 격리한다", () => {
    writeRule("base/x.md", "---\nname: dup\n---\n하나");
    writeRule("base/y.md", "---\nname: dup\n---\n둘");
    const reg = loadRules(dir);
    assert.equal(reg.base.length, 0);
    assert.equal(reg.problems.length, 2);
    assert.match(reg.problems[0].reason, /중복/);
  });

  it("폴더가 없으면 빈 레지스트리(throw 없음)", () => {
    const reg = loadRules(path.join(root, "nonexistent"));
    assert.equal(reg.base.length, 0);
    assert.equal(reg.overlays.size, 0);
    assert.equal(reg.problems.length, 0);
  });
});
