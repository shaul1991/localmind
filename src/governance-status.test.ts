/**
 * specs/048 — 웹 거버넌스 뷰어 수집기·전문 조회 테스트.
 * 대상: ui-status.ts의 rulesStatus·skillsStatus·ruleContent·personaContent·skillContent.
 * AC 매핑: AC-2·3·4·5(목록·drill-in·problems) 단위 층 · AC-7(경로/이름 안전).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import {
  personaContent,
  ruleContent,
  rulesStatus,
  skillContent,
  skillsStatus,
} from "./ui-status.js";

function tmp(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeRule(rulesDir: string, rel: string, content: string) {
  const full = path.join(rulesDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function writePersona(agentsDir: string, name: string, prompt: string) {
  fs.mkdirSync(agentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(agentsDir, `${name}.md`),
    `---\nname: ${name}\ndescription: ${name} 설명\ntargets:\n  claude:\n    model: sonnet\n---\n${prompt}\n`,
  );
}

function writeSkill(skillsDir: string, name: string, opts: { managed?: boolean; body?: string } = {}) {
  const dir = path.join(skillsDir, name);
  fs.mkdirSync(dir, { recursive: true });
  const marker = opts.managed === false ? "" : `<!-- managed-by: localmind (skill: ${name}) -->\n`;
  fs.writeFileSync(
    path.join(dir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${name} 설명\n---\n${marker}${opts.body ?? "본문"}\n`,
  );
}

describe("rulesStatus — base+overlay 목록·Map 직렬화·problems (T020)", () => {
  it("base·overlay를 name/layer/order 목록으로 반환하고 전문(content)은 포함하지 않는다", () => {
    const dir = tmp("lm-gov-rules-");
    writeRule(dir, "base/a.md", "---\norder: 1\n---\nA 규칙 본문");
    writeRule(dir, "base/b.md", "B 규칙 본문");
    writeRule(dir, "overlays/proj1/c.md", "C 규칙 본문");
    const st = rulesStatus({ rulesDir: dir });
    assert.equal(st.base.length, 2);
    assert.ok(st.base.every((r) => !("content" in r)), "목록에는 전문이 없다");
    const a = st.base.find((r) => r.name === "a")!;
    assert.equal(a.layer, "base");
    assert.equal(a.order, 1);
    // Map → 평범한 객체로 직렬화됐는지(JSON.stringify로 실제 검증)
    const json = JSON.parse(JSON.stringify(st));
    assert.deepEqual(Object.keys(json.overlays), ["proj1"]);
    assert.equal(json.overlays.proj1[0].name, "c");
    assert.equal(json.overlays.proj1[0].layer, "overlay:proj1");
  });

  it("problems·warnings를 그대로 전달한다(중복 name 등)", () => {
    const dir = tmp("lm-gov-rules-");
    writeRule(dir, "base/dup1.md", "---\nname: dup\n---\n첫번째");
    writeRule(dir, "base/dup2.md", "---\nname: dup\n---\n두번째");
    const st = rulesStatus({ rulesDir: dir });
    assert.equal(st.problems.length, 2);
    assert.match(st.problems[0].reason, /중복/);
  });

  it("정상 상태는 problems 0", () => {
    const dir = tmp("lm-gov-rules-");
    writeRule(dir, "base/ok.md", "정상 규칙");
    const st = rulesStatus({ rulesDir: dir });
    assert.equal(st.problems.length, 0);
  });
});

describe("ruleContent — 레지스트리 name 조회 (T022, FR-7)", () => {
  it("존재하는 name은 전문을 반환한다(base=project 없음, overlay=project 지정)", () => {
    const dir = tmp("lm-gov-rulec-");
    writeRule(dir, "base/a.md", "A 규칙 전문");
    writeRule(dir, "overlays/proj1/b.md", "B 규칙 전문");
    const a = ruleContent("a", { rulesDir: dir });
    assert.ok(a.ok);
    assert.equal((a as { ok: true; content: string }).content, "A 규칙 전문");
    const b = ruleContent("b", { rulesDir: dir, project: "proj1" });
    assert.ok(b.ok);
    assert.equal((b as { ok: true; content: string }).content, "B 규칙 전문");
  });

  it("base·overlay 동명 규칙에서 project로 클릭한 계층의 전문을 반환한다(overlay-wins 가시성, MAJOR-1 회귀)", () => {
    const dir = tmp("lm-gov-rulec-");
    writeRule(dir, "base/shared.md", "BASE 전문");
    writeRule(dir, "overlays/proj1/shared.md", "OVERLAY 전문");
    // project 없음 → base 계층
    const base = ruleContent("shared", { rulesDir: dir });
    assert.equal((base as { ok: true; content: string }).content, "BASE 전문");
    // project 지정 → overlay 계층(같은 name이어도 base가 아니라 overlay 반환)
    const ov = ruleContent("shared", { rulesDir: dir, project: "proj1" });
    assert.equal((ov as { ok: true; content: string }).content, "OVERLAY 전문");
  });

  it("알 수 없는 name은 거부(레지스트리 밖 접근 없음, AC-7)", () => {
    const dir = tmp("lm-gov-rulec-");
    writeRule(dir, "base/a.md", "A 규칙 전문");
    const r = ruleContent("no-such-rule", { rulesDir: dir });
    assert.equal(r.ok, false);
  });
});

describe("skillsStatus — listSkills 래핑 (T021)", () => {
  it("목록+설명+managed를 반환한다", () => {
    const dir = tmp("lm-gov-skills-");
    writeSkill(dir, "my-skill", { body: "본문" });
    writeSkill(dir, "forked-skill", { managed: false, body: "직접 만든 스킬" });
    const st = skillsStatus({ skillsDir: dir });
    assert.equal(st.skills.length, 2);
    const managed = st.skills.find((s) => s.name === "my-skill")!;
    assert.equal(managed.managed, true);
    assert.equal(managed.description, "my-skill 설명");
    const forked = st.skills.find((s) => s.name === "forked-skill")!;
    assert.equal(forked.managed, false);
  });

  it("스킬이 없어도 오류 없이 빈 목록(problems 소스 없음)", () => {
    const dir = tmp("lm-gov-skills-empty-");
    const st = skillsStatus({ skillsDir: dir });
    assert.deepEqual(st.skills, []);
  });
});

describe("personaContent — 레지스트리 name 조회 (T022, FR-7)", () => {
  it("존재하는 이름은 prompt 전문을 반환한다", () => {
    const dir = tmp("lm-gov-agents-");
    writePersona(dir, "critic", "너는 적대적 리뷰어다.");
    const r = personaContent("critic", { registryDir: dir });
    assert.ok(r.ok);
    assert.match((r as { ok: true; content: string }).content, /적대적 리뷰어/);
  });

  it("알 수 없는 이름은 거부(레지스트리 밖 접근 없음, AC-7)", () => {
    const dir = tmp("lm-gov-agents-");
    writePersona(dir, "critic", "본문");
    const r = personaContent("no-such-persona", { registryDir: dir });
    assert.equal(r.ok, false);
  });
});

describe("skillContent — SKILL.md 파일 read + 경로 안전 (T022, I-4, AC-7)", () => {
  it("존재하는 스킬 이름은 SKILL.md 전문을 반환한다", () => {
    const dir = tmp("lm-gov-skillc-");
    writeSkill(dir, "my-skill", { body: "고유 본문 마커" });
    const r = skillContent("my-skill", { skillsDir: dir });
    assert.ok(r.ok);
    assert.match((r as { ok: true; content: string }).content, /고유 본문 마커/);
  });

  it("알 수 없는 스킬 이름은 거부", () => {
    const dir = tmp("lm-gov-skillc-");
    const r = skillContent("no-such-skill", { skillsDir: dir });
    assert.equal(r.ok, false);
  });

  it("트래버설(..)은 거부 — skillsDir 밖 접근 0(AC-7)", () => {
    const dir = tmp("lm-gov-skillc-");
    fs.writeFileSync(path.join(path.dirname(dir), "outside-secret.md"), "밖 비밀");
    for (const bad of ["../outside-secret", "..", "../../etc/passwd"]) {
      const r = skillContent(bad, { skillsDir: dir });
      assert.equal(r.ok, false, `거부돼야 함: ${bad}`);
    }
  });

  it("절대경로는 거부", () => {
    const dir = tmp("lm-gov-skillc-");
    const r = skillContent("/etc/passwd", { skillsDir: dir });
    assert.equal(r.ok, false);
  });

  it("심볼릭 링크 디렉토리는 거부", () => {
    const dir = tmp("lm-gov-skillc-");
    const outsideDir = tmp("lm-gov-skillc-outside-");
    writeSkill(outsideDir, "secret-skill", { body: "밖의 비밀 스킬" });
    try {
      fs.symlinkSync(path.join(outsideDir, "secret-skill"), path.join(dir, "linked-skill"));
    } catch {
      return; // 심링크 불가 환경 스킵
    }
    const r = skillContent("linked-skill", { skillsDir: dir });
    assert.equal(r.ok, false, "심링크 디렉토리는 거부돼야 함");
  });
});
