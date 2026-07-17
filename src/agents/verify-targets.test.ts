/**
 * verify-targets.ts 테스트 — device-sync 수신 검증의 결정적 target별 판정(R4-05).
 * 실제 배포 산출물을 injected temp 경로에 만든 뒤 각 위조/부재 시나리오를 검증한다.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { seedWorkflows, deployWorkflows } from "./skills.js";
import { verifyDeployedTargets } from "./verify-targets.js";

let root: string;
let dataDir: string;
let claudeSkills: string;
let agentSkills: string;
let geminiCmds: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-verify-"));
  dataDir = path.join(root, "data-skills");
  claudeSkills = path.join(root, "home", ".claude", "skills");
  agentSkills = path.join(root, "home", ".agents", "skills");
  geminiCmds = path.join(root, "home", ".gemini", "commands");
  fs.mkdirSync(path.join(root, "home", ".claude"), { recursive: true });
  fs.mkdirSync(path.join(root, "home", ".gemini"), { recursive: true });
  fs.mkdirSync(dataDir, { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function deployAll() {
  seedWorkflows({ skillsDir: dataDir });
  const r = deployWorkflows({
    skillsDir: dataDir,
    claudeSkillsDir: claudeSkills,
    agentSkillsDir: agentSkills,
    geminiCommandsDir: geminiCmds,
    targets: ["claude-skill", "agent-skill", "gemini-command"],
  });
  assert.notEqual(r.outcome, "failed", "사전 배포 성공");
}
const verify = (over = { claudeOverride: true, geminiOverride: true }) =>
  verifyDeployedTargets({ agentSkillsDir: agentSkills, claudeSkillsDir: claudeSkills, geminiCommandsDir: geminiCmds, ...over });
const targetOf = (r: ReturnType<typeof verifyDeployedTargets>, t: string) => r.targets.find((x) => x.target === t)!;

describe("verifyDeployedTargets (R4-05)", () => {
  it("시나리오6: 모든 available target이 정확하면 ok(exit 0 상당)", () => {
    deployAll();
    const r = verify();
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(targetOf(r, "agent-skill").status, "ok");
    assert.equal(targetOf(r, "claude-skill").status, "ok");
    assert.equal(targetOf(r, "gemini-command").status, "ok");
  });

  it("시나리오1: 공용(shared) target에 packaged skill 하나가 빠지면 failed", () => {
    deployAll();
    fs.rmSync(path.join(agentSkills, "goal-ready"), { recursive: true, force: true });
    const r = verify();
    assert.equal(r.ok, false);
    assert.equal(targetOf(r, "agent-skill").status, "failed");
    assert.ok(targetOf(r, "agent-skill").failures.some((f) => f.includes("goal-ready")), "실패 logical ID 표기");
  });

  it("시나리오2a: available Claude target에 skill 하나가 빠지면 failed", () => {
    deployAll();
    fs.rmSync(path.join(claudeSkills, "sdd-self-review"), { recursive: true, force: true });
    const r = verify();
    assert.equal(targetOf(r, "claude-skill").status, "failed");
    assert.ok(targetOf(r, "claude-skill").failures.some((f) => f.includes("sdd-self-review")));
  });

  it("시나리오2b: Claude goal-impl의 deny-implicit 정책 metadata가 없으면 failed", () => {
    deployAll();
    // marker는 남기고 disable-model-invocation 줄만 제거한다(정책 metadata 누락)
    const md = path.join(claudeSkills, "goal-impl", "SKILL.md");
    const stripped = fs.readFileSync(md, "utf8").replace(/^disable-model-invocation\s*:.*\n/m, "");
    fs.writeFileSync(md, stripped);
    const r = verify();
    assert.equal(targetOf(r, "claude-skill").status, "failed");
    assert.ok(targetOf(r, "claude-skill").failures.some((f) => f.includes("정책")));
  });

  it("시나리오2c: skill marker가 없으면 존재해도 failed(내용만 그럴듯한 파일 거부)", () => {
    deployAll();
    const md = path.join(claudeSkills, "goal-ready", "SKILL.md");
    fs.writeFileSync(md, "---\nname: goal-ready\ndescription: 위조\n---\n# 본문\n"); // marker 없음
    const r = verify();
    assert.equal(targetOf(r, "claude-skill").status, "failed");
    assert.ok(targetOf(r, "claude-skill").failures.some((f) => f.includes("marker")));
  });

  it("시나리오3a: available Gemini target에 wrapper 하나가 빠지면 failed", () => {
    deployAll();
    fs.rmSync(path.join(geminiCmds, "goal-ready.toml"), { force: true });
    const r = verify();
    assert.equal(targetOf(r, "gemini-command").status, "failed");
    assert.ok(targetOf(r, "gemini-command").failures.some((f) => f.includes("goal-ready")));
  });

  it("시나리오3b: Gemini 명령이 존재해도 이름 결합 marker가 없으면 failed(존재만으로 통과 금지)", () => {
    deployAll();
    fs.writeFileSync(path.join(geminiCmds, "goal-ready.toml"), 'description = "unmanaged"\nprompt = "x"\n'); // marker 없음
    const r = verify();
    assert.equal(targetOf(r, "gemini-command").status, "failed");
    assert.ok(targetOf(r, "gemini-command").failures.some((f) => f.includes("marker")));
  });

  it("시나리오4: Claude/Gemini 런타임 부모가 없고 override도 없으면 truthful skip(unavailable, 실패 아님)", () => {
    seedWorkflows({ skillsDir: dataDir });
    // 공용만 배포
    deployWorkflows({ skillsDir: dataDir, agentSkillsDir: agentSkills, targets: ["agent-skill"] });
    // claude/gemini 경로는 부모가 없는 곳을 가리키고 override 없음
    const r = verifyDeployedTargets({
      agentSkillsDir: agentSkills,
      claudeSkillsDir: path.join(root, "no-such", ".claude", "skills"),
      geminiCommandsDir: path.join(root, "no-such", ".gemini", "commands"),
      claudeOverride: false,
      geminiOverride: false,
    });
    assert.equal(targetOf(r, "agent-skill").status, "ok");
    assert.equal(targetOf(r, "claude-skill").status, "unavailable");
    assert.equal(targetOf(r, "gemini-command").status, "unavailable");
    assert.equal(r.ok, true, "unavailable은 실패가 아니다");
  });

  it("시나리오5: 정본 패키지/resolver 실패는 검증 실패(unavailable과 구분되는 corrupt)", () => {
    deployAll();
    // 손상된 templates 패키지를 가리키게 한다
    const brokenTpl = path.join(root, "broken-tpl");
    fs.mkdirSync(brokenTpl, { recursive: true });
    fs.writeFileSync(path.join(brokenTpl, "catalog.json"), "{ broken");
    const r = verifyDeployedTargets({
      templatesDir: brokenTpl,
      agentSkillsDir: agentSkills,
      claudeSkillsDir: claudeSkills,
      geminiCommandsDir: geminiCmds,
      claudeOverride: true,
      geminiOverride: true,
    });
    assert.equal(r.ok, false);
    assert.ok(r.problems.length > 0, "정본 패키지 문제 보고");
    assert.equal(r.targets.length, 0, "패키지 실패 시 target 판정 없음");
  });
});
