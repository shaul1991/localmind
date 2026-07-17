/**
 * skills.ts 통합 테스트 — seed·다중 target 배포·소유권·prune guard·미설치 target
 * (AC-2, AC-3, AC-4, AC-5, AC-12, AC-14, AC-15) + 노트 색인 제외 회귀(FR-13).
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { seedWorkflows, deployWorkflows, runSkillsDeploy, formatDeployResult, listSkills } from "./skills.js";
import { skillMarkerComment, inspectSkillDir } from "./skill-contract.js";
import { faultyOps, defaultFsOps, type FsOps } from "./reconcile.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEMPLATES_DIR = path.join(REPO_ROOT, "templates", "skills");
const BRAIN_JS = path.join(REPO_ROOT, "src", "brain.js");

let root: string;
let dataDir: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-skills-"));
  dataDir = path.join(root, "data-skills");
  fs.mkdirSync(dataDir, { recursive: true });
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

interface PkgSpec {
  name: string;
  activation: "intent" | "explicit" | "delegated-or-explicit";
  sideEffects: "docs-only" | "mutating" | "report-only";
  extra?: { rel: string; content: string; exec?: boolean }[];
}
function buildPkg(dir: string, specs: PkgSpec[]) {
  fs.mkdirSync(dir, { recursive: true });
  const workflows: Record<string, { activation: string; sideEffects: string }> = {};
  for (const s of specs) {
    const sk = path.join(dir, s.name);
    fs.mkdirSync(sk, { recursive: true });
    fs.writeFileSync(
      path.join(sk, "SKILL.md"),
      `---\nname: ${s.name}\ndescription: ${s.name} 준비 워크플로 — 필요할 때 사용한다\n---\n${skillMarkerComment(s.name)}\n# ${s.name}\n\n1. 요구를 조사한다.\n2. 문서를 만든다.\n`,
    );
    for (const e of s.extra ?? []) {
      const ep = path.join(sk, e.rel);
      fs.mkdirSync(path.dirname(ep), { recursive: true });
      fs.writeFileSync(ep, e.content);
      if (e.exec) fs.chmodSync(ep, 0o755);
    }
    workflows[s.name] = { activation: s.activation, sideEffects: s.sideEffects };
  }
  fs.writeFileSync(path.join(dir, "catalog.json"), JSON.stringify({ schemaVersion: 1, workflows }));
}

function claudeHome() {
  const home = path.join(root, "claude-home");
  fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
  return { skillsDir: path.join(home, ".claude", "skills") };
}
function agentHome() {
  const home = path.join(root, "agent-home");
  fs.mkdirSync(home, { recursive: true });
  return { skillsDir: path.join(home, ".agents", "skills") };
}
function geminiHome() {
  const home = path.join(root, "gemini-home");
  fs.mkdirSync(path.join(home, ".gemini"), { recursive: true });
  return { commandsDir: path.join(home, ".gemini", "commands") };
}
const read = (p: string) => fs.readFileSync(p, "utf8");
const frontmatterOf = (p: string) => read(p).split("\n---")[0];

// ── AC-2: fresh seed catalog ────────────────────────────────────────────────
describe("skills-seed: AC-2", () => {
  it("production package + 빈 data → 정확히 네 workflow + marker, 재실행 unchanged", () => {
    const r1 = seedWorkflows({ skillsDir: dataDir });
    assert.equal(r1.problems.length, 0);
    const names = r1.items.map((i) => i.logicalId).sort();
    assert.deepEqual(names, ["goal-ready", "localmind-binding", "localmind-rules", "sdd-implement", "sdd-self-review"]);
    assert.ok(r1.items.every((i) => i.status === "created"));
    for (const n of names) {
      const md = read(path.join(dataDir, n, "SKILL.md"));
      assert.ok(md.includes(`managed-by: localmind (skill: ${n})`), `${n} marker`);
    }
    const r2 = seedWorkflows({ skillsDir: dataDir });
    assert.ok(r2.items.every((i) => i.status === "unchanged"), JSON.stringify(r2.items));
  });

  it("injected package의 valid 네 번째 workflow도 name hard-code 없이 seed된다", () => {
    const pkg = path.join(root, "pkg4");
    buildPkg(pkg, [
      { name: "w-alpha", activation: "intent", sideEffects: "docs-only" },
      { name: "w-beta", activation: "explicit", sideEffects: "mutating" },
      { name: "w-gamma", activation: "delegated-or-explicit", sideEffects: "report-only" },
      { name: "w-delta", activation: "intent", sideEffects: "docs-only" },
    ]);
    const r = seedWorkflows({ templatesDir: pkg, skillsDir: dataDir });
    assert.equal(r.problems.length, 0);
    assert.deepEqual(r.items.map((i) => i.logicalId).sort(), ["w-alpha", "w-beta", "w-delta", "w-gamma"]);
    assert.ok(r.items.every((i) => i.status === "created"));
  });
});

// ── AC-3: legacy update + fork 보호 + reserved-ID fork ────────────────────────
describe("skills-seed: AC-3", () => {
  it("legacy managed는 갱신, 일반 markerless fork는 보존, reserved-ID fork는 보존+exposure 차단", () => {
    seedWorkflows({ skillsDir: dataDir });
    // legacy managed goal-ready(marker 유지, 내용 구버전)
    const goalMd = path.join(dataDir, "goal-ready", "SKILL.md");
    fs.writeFileSync(goalMd, read(goalMd) + "\n구버전 흔적");
    // markerless 일반 fork(sdd-self-review에서 marker 제거)
    const selfMd = path.join(dataDir, "sdd-self-review", "SKILL.md");
    const forked = read(selfMd).replace(/<!-- managed-by[^\n]*-->\n/, "") + "\n내 커스텀";
    fs.writeFileSync(selfMd, forked);
    // reserved-ID non-equivalent markerless fork(sdd-implement)
    const implMd = path.join(dataDir, "sdd-implement", "SKILL.md");
    const implFork = read(implMd).replace(/<!-- managed-by[^\n]*-->\n/, "") + "\n내가 바꾼 구현 규칙";
    fs.writeFileSync(implMd, implFork);

    const r = seedWorkflows({ skillsDir: dataDir });
    assert.ok(r.items.some((i) => i.logicalId === "goal-ready" && i.status === "updated"), "legacy managed 갱신");
    assert.ok(!read(goalMd).includes("구버전 흔적"), "정본 복원");
    assert.ok(r.items.some((i) => i.logicalId === "sdd-self-review" && i.status === "skipped-unmanaged"), "markerless fork 보존");
    assert.equal(read(selfMd), forked, "fork byte 보존");
    assert.ok(r.items.some((i) => i.logicalId === "sdd-implement" && i.status === "skipped-unmanaged"), "reserved fork 보존");
    assert.equal(read(implMd), implFork, "reserved fork byte 보존");

    // deploy: reserved fork는 어느 runtime에도 노출되지 않는다
    const c = claudeHome();
    const dep = deployWorkflows({ skillsDir: dataDir, claudeSkillsDir: c.skillsDir, targets: ["claude-skill"] });
    const implItem = dep.items.find((i) => i.logicalId === "sdd-implement");
    assert.ok(implItem && (implItem.status === "skipped-dependency"), `reserved fork exposure 차단: ${JSON.stringify(implItem)}`);
    assert.match(implItem!.reason!, /reserved-id-fork/);
    assert.ok(!fs.existsSync(path.join(c.skillsDir, "sdd-implement")), "reserved fork runtime 노출 0");
    assert.equal(read(implMd), implFork, "deploy가 source를 건드리지 않음");
    assert.equal(dep.outcome, "partial");
  });

  it("예약 보호는 manifest가 정한다 — template이 검증 실패해도 예약 이름 data fork는 custom으로 배포되지 않는다", () => {
    // manifest에 예약 ID가 있으나 그 template이 broken인 극단 케이스(defense-in-depth).
    const pkg = path.join(root, "broken-pkg");
    fs.mkdirSync(path.join(pkg, "reserved-wf"), { recursive: true });
    fs.writeFileSync(path.join(pkg, "reserved-wf", "SKILL.md"), "---\nname: reserved-wf\n닫힘 없는 깨진 frontmatter\n");
    fs.writeFileSync(path.join(pkg, "catalog.json"), JSON.stringify({ schemaVersion: 1, workflows: { "reserved-wf": { activation: "explicit", sideEffects: "mutating" } } }));
    // 데이터에 같은 예약 이름의 markerless 스킬을 직접 둔다(seed는 broken template이라 안 돎)
    fs.mkdirSync(path.join(dataDir, "reserved-wf"), { recursive: true });
    fs.writeFileSync(path.join(dataDir, "reserved-wf", "SKILL.md"), "---\nname: reserved-wf\ndescription: 내 커스텀\n---\n# 내 것\n");
    const c = claudeHome();
    const r = deployWorkflows({ templatesDir: pkg, skillsDir: dataDir, claudeSkillsDir: c.skillsDir, targets: ["claude-skill"] });
    assert.equal(r.outcome, "failed", "broken template = source problem");
    assert.ok(!fs.existsSync(path.join(c.skillsDir, "reserved-wf")), "예약 이름 fork는 custom으로 배포되지 않음");
  });
});

// ── P1 T1.1: seed source-absence sweep(D-2①) — 이름 무관, 마커 결합 ─────────────
describe("skills-seed retirement sweep (P1 D-2①)", () => {
  it("① managed(마커 결합) 디렉토리가 template 집합에서 사라지면 seed 후 pruned된다", () => {
    const pkgFull = path.join(root, "pkg-sweep-full");
    buildPkg(pkgFull, [
      { name: "w-alpha", activation: "intent", sideEffects: "docs-only" },
      { name: "w-stale", activation: "intent", sideEffects: "docs-only" },
    ]);
    seedWorkflows({ templatesDir: pkgFull, skillsDir: dataDir });
    assert.ok(fs.existsSync(path.join(dataDir, "w-stale", "SKILL.md")), "선행 seed로 stale 디렉토리 존재");

    const pkgSlim = path.join(root, "pkg-sweep-slim");
    buildPkg(pkgSlim, [{ name: "w-alpha", activation: "intent", sideEffects: "docs-only" }]);
    const r = seedWorkflows({ templatesDir: pkgSlim, skillsDir: dataDir });

    assert.ok(!fs.existsSync(path.join(dataDir, "w-stale")), "template 부재 managed 디렉토리는 은퇴됨");
    const item = r.items.find((i) => i.logicalId === "w-stale");
    assert.ok(item && item.status === "pruned", `pruned 항목 보고: ${JSON.stringify(item)}`);
    assert.equal(item!.reason, "packaged 정본에서 은퇴됨");
  });

  it("② marker 없는(unmanaged) 동명 디렉토리는 template 부재여도 보존된다 — 경계 핀", () => {
    const pkgFull = path.join(root, "pkg-sweep-full2");
    buildPkg(pkgFull, [
      { name: "w-alpha", activation: "intent", sideEffects: "docs-only" },
      { name: "w-fork", activation: "intent", sideEffects: "docs-only" },
    ]);
    seedWorkflows({ templatesDir: pkgFull, skillsDir: dataDir });
    const forkMd = path.join(dataDir, "w-fork", "SKILL.md");
    const forked = read(forkMd).replace(/<!-- managed-by[^\n]*-->\n/, "") + "\n내 fork";
    fs.writeFileSync(forkMd, forked);

    const pkgSlim = path.join(root, "pkg-sweep-slim2");
    buildPkg(pkgSlim, [{ name: "w-alpha", activation: "intent", sideEffects: "docs-only" }]);
    const r = seedWorkflows({ templatesDir: pkgSlim, skillsDir: dataDir });

    assert.ok(fs.existsSync(forkMd), "unmanaged 디렉토리는 삭제되지 않음");
    assert.equal(read(forkMd), forked, "내용 byte 보존");
    assert.ok(!r.items.some((i) => i.logicalId === "w-fork" && i.status === "pruned"), "unmanaged은 pruned 대상 아님");
  });

  it("③ template registry problem 시 sweep은 실행되지 않는다 — 어떤 삭제도 없음(F-18 가드)", () => {
    const pkg = path.join(root, "pkg-sweep-broken");
    buildPkg(pkg, [
      { name: "w-alpha", activation: "intent", sideEffects: "docs-only" },
      { name: "w-stale3", activation: "intent", sideEffects: "docs-only" },
    ]);
    seedWorkflows({ templatesDir: pkg, skillsDir: dataDir });
    assert.ok(fs.existsSync(path.join(dataDir, "w-stale3")), "선행 seed로 stale 디렉토리 존재");
    // catalog를 깨뜨려 template registry problem을 만든다(부재가 아니라 검증 실패).
    fs.writeFileSync(path.join(pkg, "catalog.json"), "{ broken");

    const r = seedWorkflows({ templatesDir: pkg, skillsDir: dataDir });
    assert.ok(r.problems.length > 0, "template registry problem 보고됨");
    assert.equal(r.items.length, 0, "어떤 write도 하지 않음");
    assert.ok(fs.existsSync(path.join(dataDir, "w-stale3")), "부재 기반 오삭제 없음(early return 가드)");
  });
});

// ── AC-4: Claude skill target ────────────────────────────────────────────────
describe("skills-deploy-claude: AC-4", () => {
  it("세 skill 생성 + sdd-implement에만 disable-model-invocation, 재실행 unchanged", () => {
    seedWorkflows({ skillsDir: dataDir });
    const c = claudeHome();
    const r = deployWorkflows({ skillsDir: dataDir, claudeSkillsDir: c.skillsDir, targets: ["claude-skill"] });
    assert.equal(r.outcome, "success");
    assert.equal(r.exitCode, 0);
    for (const n of ["goal-ready", "sdd-implement", "sdd-self-review"]) {
      assert.ok(fs.existsSync(path.join(c.skillsDir, n, "SKILL.md")), `${n} 배포됨`);
      assert.ok(read(path.join(c.skillsDir, n, "SKILL.md")).includes(`managed-by: localmind (skill: ${n})`));
    }
    assert.match(frontmatterOf(path.join(c.skillsDir, "sdd-implement", "SKILL.md")), /disable-model-invocation:\s*true/);
    assert.doesNotMatch(frontmatterOf(path.join(c.skillsDir, "goal-ready", "SKILL.md")), /disable-model-invocation/);
    // localmind-binding도 explicit workflow라 sdd-implement와 같은 deny-implicit 렌더를 받는다(specs/050 T2.2).
    assert.match(frontmatterOf(path.join(c.skillsDir, "localmind-binding", "SKILL.md")), /disable-model-invocation:\s*true/);
    assert.ok(r.items.some((i) => i.logicalId === "sdd-implement" && i.invocation === "/sdd-implement"));
    const again = deployWorkflows({ skillsDir: dataDir, claudeSkillsDir: c.skillsDir, targets: ["claude-skill"] });
    assert.ok(again.items.filter((i) => i.target === "claude-skill").every((i) => i.status === "unchanged"), JSON.stringify(again.items));
  });

  it("injected fourth packaged workflow도 manifest policy대로 배포 + recursive resource/exec bit", () => {
    const pkg = path.join(root, "pkg4");
    buildPkg(pkg, [
      { name: "w-doc", activation: "intent", sideEffects: "docs-only", extra: [{ rel: "references/guide.md", content: "참고 문서" }] },
      { name: "w-mut", activation: "explicit", sideEffects: "mutating", extra: [{ rel: "scripts/run.sh", content: "#!/bin/sh\n", exec: true }] },
    ]);
    seedWorkflows({ templatesDir: pkg, skillsDir: dataDir });
    const c = claudeHome();
    const r = deployWorkflows({ templatesDir: pkg, skillsDir: dataDir, claudeSkillsDir: c.skillsDir, targets: ["claude-skill"] });
    assert.equal(r.outcome, "success");
    assert.match(frontmatterOf(path.join(c.skillsDir, "w-mut", "SKILL.md")), /disable-model-invocation:\s*true/);
    assert.equal(read(path.join(c.skillsDir, "w-doc", "references", "guide.md")), "참고 문서", "recursive resource");
    assert.ok((fs.statSync(path.join(c.skillsDir, "w-mut", "scripts", "run.sh")).mode & 0o111) !== 0, "exec bit 보존");
  });

  it("reserved fork에 retire할 managed target이 없으면 skipped-dependency/reserved-id-fork", () => {
    seedWorkflows({ skillsDir: dataDir });
    const implMd = path.join(dataDir, "sdd-implement", "SKILL.md");
    fs.writeFileSync(implMd, read(implMd).replace(/<!-- managed-by[^\n]*-->\n/, "") + "\n포크");
    const c = claudeHome();
    const r = deployWorkflows({ skillsDir: dataDir, claudeSkillsDir: c.skillsDir, targets: ["claude-skill"] });
    const it = r.items.find((i) => i.logicalId === "sdd-implement" && i.target === "claude-skill")!;
    assert.equal(it.status, "skipped-dependency");
    assert.match(it.reason!, /reserved-id-fork/);
    assert.ok(!fs.existsSync(path.join(c.skillsDir, "sdd-implement")));
  });

  it("reserved fork는 기존 managed target을 retire한다", () => {
    seedWorkflows({ skillsDir: dataDir });
    const c = claudeHome();
    deployWorkflows({ skillsDir: dataDir, claudeSkillsDir: c.skillsDir, targets: ["claude-skill"] });
    assert.ok(fs.existsSync(path.join(c.skillsDir, "sdd-implement")), "먼저 배포됨");
    const implMd = path.join(dataDir, "sdd-implement", "SKILL.md");
    fs.writeFileSync(implMd, read(implMd).replace(/<!-- managed-by[^\n]*-->\n/, "") + "\n포크");
    const r = deployWorkflows({ skillsDir: dataDir, claudeSkillsDir: c.skillsDir, targets: ["claude-skill"] });
    const it = r.items.find((i) => i.logicalId === "sdd-implement" && i.target === "claude-skill")!;
    assert.equal(it.status, "pruned");
    assert.ok(!fs.existsSync(path.join(c.skillsDir, "sdd-implement")), "managed target retire됨");
  });
});

// ── AC-5: shared Agent Skills target ─────────────────────────────────────────
describe("skills-deploy-shared: AC-5", () => {
  it("세 skill + sdd-implement openai.yaml deny-implicit/fingerprint + Claude와 hash 동일", () => {
    seedWorkflows({ skillsDir: dataDir });
    const a = agentHome();
    const c = claudeHome();
    const r = deployWorkflows({ skillsDir: dataDir, agentSkillsDir: a.skillsDir, claudeSkillsDir: c.skillsDir, targets: ["agent-skill", "claude-skill"] });
    assert.equal(r.outcome, "success");
    for (const n of ["goal-ready", "sdd-implement", "sdd-self-review"]) {
      assert.ok(fs.existsSync(path.join(a.skillsDir, n, "SKILL.md")));
    }
    const yamlPath = path.join(a.skillsDir, "sdd-implement", "agents", "openai.yaml");
    const yaml = read(yamlPath);
    assert.match(yaml, /allow_implicit_invocation: false/);
    assert.match(yaml, /managed-by: localmind \(skill: sdd-implement\)/);
    assert.match(yaml, /source-payload-sha256: [0-9a-f]{64}/);
    assert.ok(!fs.existsSync(path.join(a.skillsDir, "goal-ready", "agents", "openai.yaml")), "docs-only는 policy 없음");
    // normalized canonical hash: Claude target == shared target
    for (const n of ["goal-ready", "sdd-implement", "sdd-self-review"]) {
      const h1 = inspectSkillDir(path.join(c.skillsDir, n));
      const h2 = inspectSkillDir(path.join(a.skillsDir, n));
      assert.ok(!("error" in h1) && !("error" in h2));
      assert.equal((h1 as { hash: string }).hash, (h2 as { hash: string }).hash, `${n} cross-target hash 동일`);
    }
    assert.ok(r.items.some((i) => i.target === "agent-skill" && i.logicalId === "goal-ready" && i.invocation === "$goal-ready"));
  });

  it("Codex repo same-ID equivalent → equivalent-shadow, non-equivalent → ambiguous-shadow", () => {
    seedWorkflows({ skillsDir: dataDir });
    const a = agentHome();
    // 먼저 배포해 정본 산출물을 확보(equivalent 복사에 사용)
    deployWorkflows({ skillsDir: dataDir, agentSkillsDir: a.skillsDir, targets: ["agent-skill"] });

    // workspace repo에 same-ID skill 주입
    const repo = path.join(root, "workspace-repo");
    const cwd = path.join(repo, "sub", "dir");
    fs.mkdirSync(cwd, { recursive: true });
    // equivalent: 배포된 goal-ready를 그대로 복사(managed + 같은 payload)
    const equivDir = path.join(repo, ".agents", "skills", "goal-ready");
    fs.mkdirSync(path.dirname(equivDir), { recursive: true });
    fs.cpSync(path.join(a.skillsDir, "goal-ready"), equivDir, { recursive: true });
    // non-equivalent: sdd-self-review를 다른 내용으로
    const nonDir = path.join(repo, ".agents", "skills", "sdd-self-review");
    fs.mkdirSync(nonDir, { recursive: true });
    fs.writeFileSync(path.join(nonDir, "SKILL.md"), `---\nname: sdd-self-review\ndescription: 다른 워크플로\n---\n${skillMarkerComment("sdd-self-review")}\n# 다른 것\n`);

    const r = deployWorkflows({ skillsDir: dataDir, agentSkillsDir: a.skillsDir, targets: ["agent-skill"], workspace: { cwd, repoRoot: repo } });
    const goal = r.items.find((i) => i.logicalId === "goal-ready" && i.target === "agent-skill")!;
    const self = r.items.find((i) => i.logicalId === "sdd-self-review" && i.target === "agent-skill")!;
    const impl = r.items.find((i) => i.logicalId === "sdd-implement" && i.target === "agent-skill")!;
    assert.equal(goal.resolution, "equivalent-shadow");
    assert.equal(self.resolution, "ambiguous-shadow");
    assert.equal(impl.resolution, "resolved", "충돌 없으면 resolved");
    assert.equal(r.outcome, "partial", "ambiguous shadow는 parity 보류");
  });

  // R1-11: openai.yaml(deny-implicit policy)이 빠진 repo skill을 equivalent로 부르지 않는다.
  it("Codex repo same-ID가 deny-implicit policy를 빼면 ambiguous-shadow(equivalent 아님)", () => {
    seedWorkflows({ skillsDir: dataDir });
    const a = agentHome();
    deployWorkflows({ skillsDir: dataDir, agentSkillsDir: a.skillsDir, targets: ["agent-skill"] });
    const repo = path.join(root, "ws-repo2");
    const cwd = path.join(repo, "x");
    fs.mkdirSync(cwd, { recursive: true });
    // 배포된 sdd-implement를 복사하되 생성된 agents/openai.yaml을 제거(정책 없는 위조 equivalent)
    const dst = path.join(repo, ".agents", "skills", "sdd-implement");
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.cpSync(path.join(a.skillsDir, "sdd-implement"), dst, { recursive: true });
    fs.rmSync(path.join(dst, "agents"), { recursive: true, force: true });
    const r = deployWorkflows({ skillsDir: dataDir, agentSkillsDir: a.skillsDir, targets: ["agent-skill"], workspace: { cwd, repoRoot: repo } });
    const impl = r.items.find((i) => i.logicalId === "sdd-implement" && i.target === "agent-skill")!;
    assert.equal(impl.resolution, "ambiguous-shadow", "deny-implicit policy 누락은 exact equivalent가 아님");
  });

  it("Codex repo same-ID가 symlink이면 ambiguous-shadow(따라가지 않음)", () => {
    seedWorkflows({ skillsDir: dataDir });
    const a = agentHome();
    deployWorkflows({ skillsDir: dataDir, agentSkillsDir: a.skillsDir, targets: ["agent-skill"] });
    const repo = path.join(root, "ws-repo3");
    const cwd = path.join(repo, "x");
    fs.mkdirSync(cwd, { recursive: true });
    fs.mkdirSync(path.join(repo, ".agents", "skills"), { recursive: true });
    fs.symlinkSync(path.join(a.skillsDir, "goal-ready"), path.join(repo, ".agents", "skills", "goal-ready"));
    const r = deployWorkflows({ skillsDir: dataDir, agentSkillsDir: a.skillsDir, targets: ["agent-skill"], workspace: { cwd, repoRoot: repo } });
    const goal = r.items.find((i) => i.logicalId === "goal-ready" && i.target === "agent-skill")!;
    assert.equal(goal.resolution, "ambiguous-shadow");
  });

  it("cwd가 repoRoot 밖이면 Codex resolution은 unverified", () => {
    seedWorkflows({ skillsDir: dataDir });
    const a = agentHome();
    const repo = path.join(root, "ws-repo4");
    fs.mkdirSync(repo, { recursive: true });
    const outside = path.join(root, "outside2");
    fs.mkdirSync(outside, { recursive: true });
    const r = deployWorkflows({ skillsDir: dataDir, agentSkillsDir: a.skillsDir, targets: ["agent-skill"], workspace: { cwd: outside, repoRoot: repo } });
    const impl = r.items.find((i) => i.logicalId === "sdd-implement" && i.target === "agent-skill")!;
    assert.equal(impl.resolution, "unverified", "repo 밖 cwd → 스캔 없이 unverified");
  });
});

// ── AC-12: root/item collision ───────────────────────────────────────────────
describe("workflow-ownership: AC-12", () => {
  it("target root symlink는 target-level problem/exit 1로 격리, 다른 target은 성공", () => {
    seedWorkflows({ skillsDir: dataDir });
    const a = agentHome();
    // claude skills dir을 symlink로 만든다(unsafe root)
    const cHome = path.join(root, "claude-home");
    fs.mkdirSync(path.join(cHome, ".claude"), { recursive: true });
    const realElsewhere = path.join(root, "elsewhere");
    fs.mkdirSync(realElsewhere);
    const claudeSkills = path.join(cHome, ".claude", "skills");
    fs.symlinkSync(realElsewhere, claudeSkills);
    const r = deployWorkflows({ skillsDir: dataDir, claudeSkillsDir: claudeSkills, agentSkillsDir: a.skillsDir, targets: ["claude-skill", "agent-skill"] });
    assert.equal(r.outcome, "failed");
    assert.equal(r.exitCode, 1);
    assert.ok(r.items.some((i) => i.target === "claude-skill" && i.status === "problem"));
    assert.ok(r.items.some((i) => i.target === "agent-skill" && i.status === "created"), "다른 target 성공(격리)");
  });

  it("동명 unmanaged 디렉토리/파일은 lstat 후 따라가지 않고 skipped-unmanaged 보존", () => {
    seedWorkflows({ skillsDir: dataDir });
    const c = claudeHome();
    fs.mkdirSync(c.skillsDir, { recursive: true });
    // unmanaged dir
    const userDir = path.join(c.skillsDir, "goal-ready");
    fs.mkdirSync(userDir);
    fs.writeFileSync(path.join(userDir, "SKILL.md"), "---\nname: goal-ready\n---\n사용자 직접 스킬\n");
    const r = deployWorkflows({ skillsDir: dataDir, claudeSkillsDir: c.skillsDir, targets: ["claude-skill"] });
    const it = r.items.find((i) => i.logicalId === "goal-ready")!;
    assert.equal(it.status, "skipped-unmanaged");
    assert.match(read(path.join(userDir, "SKILL.md")), /사용자 직접 스킬/, "불가침");
    assert.equal(r.outcome, "partial");
  });

  it("canonical source-root symlink는 resolve 후 경계 안에서만 순회한다", () => {
    const realData = path.join(root, "real-data");
    fs.mkdirSync(realData, { recursive: true });
    seedWorkflows({ skillsDir: realData });
    const linkData = path.join(root, "link-data");
    fs.symlinkSync(realData, linkData);
    const c = claudeHome();
    const r = deployWorkflows({ skillsDir: linkData, claudeSkillsDir: c.skillsDir, targets: ["claude-skill"] });
    assert.equal(r.outcome, "success");
    assert.ok(fs.existsSync(path.join(c.skillsDir, "goal-ready", "SKILL.md")));
  });

  it("prose에 marker 문자열을 언급한 사용자 파일을 관리 대상으로 오인하지 않는다(덮어쓰기·prune 금지)", () => {
    seedWorkflows({ skillsDir: dataDir });
    const c = claudeHome();
    fs.mkdirSync(c.skillsDir, { recursive: true });
    // 1) 동명(goal-ready) 사용자 스킬: 본문에 marker 문자열을 prose로 언급(주석 아님)
    const userGoal = path.join(c.skillsDir, "goal-ready");
    fs.mkdirSync(userGoal);
    const userGoalMd = "---\nname: goal-ready\n---\n이 파일은 managed-by: localmind (skill: goal-ready) 형식을 설명하는 내 문서\n";
    fs.writeFileSync(path.join(userGoal, "SKILL.md"), userGoalMd);
    // 2) 비예약 사용자 스킬(my-notes): 본문에 marker 문자열 prose 언급 → source-absence prune 대상이 되면 안 됨
    const userNotes = path.join(c.skillsDir, "my-notes");
    fs.mkdirSync(userNotes);
    const userNotesMd = "---\nname: my-notes\n---\n예시: managed-by: localmind (skill: my-notes) 를 인용\n";
    fs.writeFileSync(path.join(userNotes, "SKILL.md"), userNotesMd);
    const r = deployWorkflows({ skillsDir: dataDir, claudeSkillsDir: c.skillsDir, targets: ["claude-skill"] });
    // goal-ready 사용자 파일 보존(덮어쓰기 금지)
    assert.equal(read(path.join(userGoal, "SKILL.md")), userGoalMd, "prose 언급 파일 덮어쓰기 금지");
    assert.ok(r.items.some((i) => i.logicalId === "goal-ready" && i.status === "skipped-unmanaged"));
    // my-notes 사용자 스킬 보존(prune 금지)
    assert.ok(fs.existsSync(path.join(userNotes, "SKILL.md")), "prose 언급 사용자 스킬 prune 금지");
    assert.equal(read(path.join(userNotes, "SKILL.md")), userNotesMd);
  });

  it("skill 내부 symlink는 source 문제로 배포되지 않는다", () => {
    seedWorkflows({ skillsDir: dataDir });
    fs.symlinkSync("/etc/hosts", path.join(dataDir, "goal-ready", "sneaky.md"));
    const c = claudeHome();
    const r = deployWorkflows({ skillsDir: dataDir, claudeSkillsDir: c.skillsDir, targets: ["claude-skill"] });
    assert.equal(r.outcome, "failed");
    assert.ok(r.sourceProblems.some((p) => p.nameOrPath === "goal-ready"));
    assert.ok(!fs.existsSync(path.join(c.skillsDir, "goal-ready")), "문제 source 미배포");
  });
});

// ── AC-14: source problem prune guard ────────────────────────────────────────
describe("workflow-prune-guard: AC-14", () => {
  it("invalid source가 있으면 source-absence prune을 모든 target에서 보류, aggregate failed/exit 1", () => {
    seedWorkflows({ skillsDir: dataDir });
    const c = claudeHome();
    deployWorkflows({ skillsDir: dataDir, claudeSkillsDir: c.skillsDir, targets: ["claude-skill"] });
    // 배포 후, 정본에서 goal-ready를 제거(정상이면 prune 대상)하고 invalid source를 추가
    fs.rmSync(path.join(dataDir, "goal-ready"), { recursive: true });
    fs.mkdirSync(path.join(dataDir, "broken"));
    fs.writeFileSync(path.join(dataDir, "broken", "SKILL.md"), "---\nname: broken\n닫힘 없음\n");
    const r = deployWorkflows({ skillsDir: dataDir, claudeSkillsDir: c.skillsDir, targets: ["claude-skill"] });
    assert.equal(r.outcome, "failed");
    assert.equal(r.exitCode, 1);
    assert.ok(r.pruneSuppressed);
    assert.ok(fs.existsSync(path.join(c.skillsDir, "goal-ready")), "prune 보류 — managed target 보존");
    assert.ok(r.sourceProblems.some((p) => p.nameOrPath === "broken"));
  });
});

// ── AC-15: runtime absent ────────────────────────────────────────────────────
describe("workflow-missing-target: AC-15", () => {
  // R1-13: 명시 override는 가용성을 부여하므로 런타임 부재는 **기본 경로**(override 없음)로 검증한다.
  it("기본 경로 런타임 부재(.claude/.gemini 없음) → agent-skill 성공, 나머지 skipped-unavailable, partial/exit 0", () => {
    const home = path.join(root, "bare-home");
    fs.mkdirSync(home);
    const saved = {
      HOME: process.env.HOME,
      c: process.env.LOCALMIND_CLAUDE_SKILLS_DIR,
      g: process.env.LOCALMIND_GEMINI_COMMANDS_DIR,
      a: process.env.LOCALMIND_AGENT_SKILLS_DIR,
    };
    process.env.HOME = home;
    delete process.env.LOCALMIND_CLAUDE_SKILLS_DIR;
    delete process.env.LOCALMIND_GEMINI_COMMANDS_DIR;
    delete process.env.LOCALMIND_AGENT_SKILLS_DIR;
    try {
      seedWorkflows({ skillsDir: dataDir });
      const r = deployWorkflows({ skillsDir: dataDir }); // 경로 override 없음 → 기본 경로 감지
      assert.equal(r.outcome, "partial");
      assert.equal(r.exitCode, 0);
      assert.ok(r.items.some((i) => i.target === "agent-skill" && i.status === "created"));
      assert.ok(r.items.some((i) => i.target === "claude-skill" && i.status === "skipped-unavailable"));
      assert.ok(r.items.some((i) => i.target === "gemini-command" && i.status === "skipped-unavailable"));
      assert.ok(!fs.existsSync(path.join(home, ".claude")), "미설치 부모를 임의 생성하지 않음");
    } finally {
      if (saved.HOME === undefined) delete process.env.HOME;
      else process.env.HOME = saved.HOME;
      if (saved.c !== undefined) process.env.LOCALMIND_CLAUDE_SKILLS_DIR = saved.c;
      if (saved.g !== undefined) process.env.LOCALMIND_GEMINI_COMMANDS_DIR = saved.g;
      if (saved.a !== undefined) process.env.LOCALMIND_AGENT_SKILLS_DIR = saved.a;
    }
  });

  // R1-13: 명시 경로 override는 부모가 없어도 실제 폴더 생성을 허가한다.
  it("명시적 경로 override는 부모가 없어도 생성을 허가한다", () => {
    seedWorkflows({ skillsDir: dataDir });
    const c = path.join(root, "new-claude", ".claude", "skills"); // 부모 없음
    const g = path.join(root, "new-gemini", ".gemini", "commands");
    const r = deployWorkflows({ skillsDir: dataDir, claudeSkillsDir: c, geminiCommandsDir: g, targets: ["claude-skill", "gemini-command"] });
    assert.ok(fs.existsSync(path.join(c, "goal-ready", "SKILL.md")), "override claude 경로 생성");
    assert.ok(fs.existsSync(path.join(g, "goal-ready.toml")), "override gemini 경로 생성");
    assert.ok(!r.items.some((i) => i.status === "skipped-unavailable"), "override는 unavailable이 아님");
  });
});

// ── R1-05: seed 실패 전파 + 실행 비트 멱등 ────────────────────────────────────
describe("seed failure propagation + exec idempotence (R1-05)", () => {
  it("seed item problem은 통합 결과를 failed/exit 1로 만든다", () => {
    const c = claudeHome();
    const ops = faultyOps(defaultFsOps, { copyFile: 1 }); // seed 첫 copyFile 실패
    const r = runSkillsDeploy({ skillsDir: dataDir, claudeSkillsDir: c.skillsDir, targets: ["claude-skill"], ops });
    assert.ok(r.seed.items.some((i) => i.status === "problem"), "seed에 problem 항목 존재");
    assert.equal(r.deploy.outcome, "failed", "seed problem을 success로 숨기지 않는다");
    assert.equal(r.deploy.exitCode, 1);
  });

  it("seed 멱등은 실행 비트를 존중한다(exec bit 제거 → updated로 복원)", () => {
    const pkg = path.join(root, "pkg-exec");
    buildPkg(pkg, [{ name: "w-exec", activation: "explicit", sideEffects: "mutating", extra: [{ rel: "scripts/run.sh", content: "#!/bin/sh\n", exec: true }] }]);
    seedWorkflows({ templatesDir: pkg, skillsDir: dataDir });
    const dataScript = path.join(dataDir, "w-exec", "scripts", "run.sh");
    assert.ok((fs.statSync(dataScript).mode & 0o111) !== 0, "seed가 exec bit 보존");
    fs.chmodSync(dataScript, 0o644); // 사용자가 exec bit 제거
    const r = seedWorkflows({ templatesDir: pkg, skillsDir: dataDir });
    assert.ok(r.items.some((i) => i.logicalId === "w-exec" && i.status === "updated"), "exec bit 차이 감지");
    assert.ok((fs.statSync(dataScript).mode & 0o111) !== 0, "exec bit 복원");
  });
});

// ── R1-06: invalid reserved source fail-closed retirement ─────────────────────
describe("invalid reserved source retirement (R1-06)", () => {
  it("invalid reserved source는 모든 target(claude/agent/gemini)의 managed asset을 fail-closed retire한다", () => {
    seedWorkflows({ skillsDir: dataDir });
    const c = claudeHome();
    const a = agentHome();
    const g = geminiHome();
    const targets = ["claude-skill", "agent-skill", "gemini-command"] as const;
    deployWorkflows({ skillsDir: dataDir, claudeSkillsDir: c.skillsDir, agentSkillsDir: a.skillsDir, geminiCommandsDir: g.commandsDir, targets: [...targets] });
    assert.ok(fs.existsSync(path.join(c.skillsDir, "sdd-implement")), "claude 먼저 배포됨");
    assert.ok(fs.existsSync(path.join(a.skillsDir, "sdd-implement")), "agent 먼저 배포됨");
    assert.ok(fs.existsSync(path.join(g.commandsDir, "sdd-implement.toml")), "gemini wrapper 먼저 배포됨");
    // sdd-implement 정본을 손상(invalid source)
    fs.writeFileSync(path.join(dataDir, "sdd-implement", "SKILL.md"), "---\nname: sdd-implement\n닫힘 없는 깨진 frontmatter\n");
    const r = deployWorkflows({ skillsDir: dataDir, claudeSkillsDir: c.skillsDir, agentSkillsDir: a.skillsDir, geminiCommandsDir: g.commandsDir, targets: [...targets] });
    assert.equal(r.outcome, "failed");
    assert.ok(r.pruneSuppressed, "source problem → 부재 기반 prune 보류");
    for (const t of ["claude-skill", "agent-skill"]) {
      const it = r.items.find((i) => i.logicalId === "sdd-implement" && i.target === t);
      assert.ok(it && it.status === "pruned", `${t} invalid reserved retire: ${JSON.stringify(it)}`);
    }
    const gi = r.items.find((i) => i.logicalId === "sdd-implement" && i.target === "gemini-command");
    assert.ok(gi && gi.status === "pruned", `gemini invalid reserved wrapper retire: ${JSON.stringify(gi)}`);
    assert.ok(!fs.existsSync(path.join(c.skillsDir, "sdd-implement")), "claude stale 제거");
    assert.ok(!fs.existsSync(path.join(a.skillsDir, "sdd-implement")), "agent stale 제거");
    assert.ok(!fs.existsSync(path.join(g.commandsDir, "sdd-implement.toml")), "gemini stale wrapper 제거");
  });

  it("invalid non-reserved custom source는 managed target을 retire하지 않는다(prune 보류)", () => {
    seedWorkflows({ skillsDir: dataDir });
    const mf = path.join(dataDir, "my-flow");
    fs.mkdirSync(mf, { recursive: true });
    fs.writeFileSync(path.join(mf, "SKILL.md"), `---\nname: my-flow\ndescription: 내 워크플로 — 필요할 때\n---\n${skillMarkerComment("my-flow")}\n# my-flow\n\n1. 한다.\n`);
    const c = claudeHome();
    deployWorkflows({ skillsDir: dataDir, claudeSkillsDir: c.skillsDir, targets: ["claude-skill"] });
    assert.ok(fs.existsSync(path.join(c.skillsDir, "my-flow")), "custom 배포됨");
    fs.writeFileSync(path.join(mf, "SKILL.md"), "---\nname: my-flow\n깨진\n");
    const r = deployWorkflows({ skillsDir: dataDir, claudeSkillsDir: c.skillsDir, targets: ["claude-skill"] });
    assert.equal(r.outcome, "failed");
    assert.ok(r.pruneSuppressed);
    assert.ok(fs.existsSync(path.join(c.skillsDir, "my-flow")), "non-reserved custom은 fail-close 대상 아님 — 보존");
  });
});

// ── R1-02: 정본 metadata로 execution guard를 무력화할 수 없다 ──────────────────
describe("canonical metadata cannot disable guard (R1-02 deploy)", () => {
  it("managed sdd-implement에 disable-model-invocation:false를 넣으면 reserved fork로 차단(false 노출 0)", () => {
    seedWorkflows({ skillsDir: dataDir });
    const c = claudeHome();
    deployWorkflows({ skillsDir: dataDir, claudeSkillsDir: c.skillsDir, targets: ["claude-skill"] });
    const implMd = path.join(dataDir, "sdd-implement", "SKILL.md");
    // frontmatter 닫힘 직전에 disable-model-invocation:false를 주입(marker 유지 → managed).
    fs.writeFileSync(implMd, read(implMd).replace("\n---\n", "\ndisable-model-invocation: false\n---\n"));
    assert.match(read(implMd), /disable-model-invocation: false/, "주입 확인");
    const r = deployWorkflows({ skillsDir: dataDir, claudeSkillsDir: c.skillsDir, targets: ["claude-skill"] });
    const impl = r.items.find((i) => i.logicalId === "sdd-implement" && i.target === "claude-skill")!;
    assert.equal(impl.status, "pruned", "non-equivalent reserved fork → fail-closed retire");
    assert.match(impl.reason!, /reserved-id-fork/);
    assert.ok(!fs.existsSync(path.join(c.skillsDir, "sdd-implement")), "false를 담은 Claude target 노출 0");
    assert.equal(r.outcome, "partial");
  });

  it("정상 sdd-implement Claude target은 정확히 true를 렌더한다(false/중복 키 없음)", () => {
    seedWorkflows({ skillsDir: dataDir });
    const c = claudeHome();
    deployWorkflows({ skillsDir: dataDir, claudeSkillsDir: c.skillsDir, targets: ["claude-skill"] });
    const fm = frontmatterOf(path.join(c.skillsDir, "sdd-implement", "SKILL.md"));
    assert.match(fm, /disable-model-invocation:\s*true/);
    assert.doesNotMatch(fm, /disable-model-invocation:\s*false/);
    assert.equal((fm.match(/disable-model-invocation/g) || []).length, 1, "중복 키 없음");
  });
});

// ── R1-12: custom skill의 provider 자원 보존 ──────────────────────────────────
describe("custom resource preservation (R1-12)", () => {
  it("custom skill의 agents/openai.yaml을 조용히 버리지 않고 보존한다", () => {
    seedWorkflows({ skillsDir: dataDir });
    const skillRoot = path.join(dataDir, "custom-oai");
    fs.mkdirSync(path.join(skillRoot, "agents"), { recursive: true });
    fs.writeFileSync(path.join(skillRoot, "SKILL.md"), `---\nname: custom-oai\ndescription: 내 것 — 필요할 때\n---\n${skillMarkerComment("custom-oai")}\n# custom\n\n1. 한다.\n`);
    fs.writeFileSync(path.join(skillRoot, "agents", "openai.yaml"), "policy:\n  allow_implicit_invocation: true\n");
    const a = agentHome();
    const r = deployWorkflows({ skillsDir: dataDir, agentSkillsDir: a.skillsDir, targets: ["agent-skill"] });
    assert.notEqual(r.outcome, "failed");
    const yamlPath = path.join(a.skillsDir, "custom-oai", "agents", "openai.yaml");
    assert.ok(fs.existsSync(yamlPath), "custom openai.yaml 보존(누락 금지)");
    assert.match(read(yamlPath), /allow_implicit_invocation: true/, "사용자 값 보존");
    // 재배포 멱등: 내용 변화 없으면 unchanged
    const r2 = deployWorkflows({ skillsDir: dataDir, agentSkillsDir: a.skillsDir, targets: ["agent-skill"] });
    assert.equal(r2.items.find((i) => i.logicalId === "custom-oai")!.status, "unchanged", "custom+openai.yaml 멱등");
  });

  // R2-01: custom skill의 openai.yaml은 사용자 소유 payload다 — 소스 변경이 재배포에서 조용히
  // 무시되면 안 된다(target-normalized hash가 양쪽에서 제외해도 drift를 검출해야 한다).
  it("custom skill의 agents/openai.yaml 소스 변경은 재배포 시 target에 정확히 반영된다(R2-01)", () => {
    seedWorkflows({ skillsDir: dataDir });
    const skillRoot = path.join(dataDir, "custom-oai2");
    fs.mkdirSync(path.join(skillRoot, "agents"), { recursive: true });
    fs.writeFileSync(path.join(skillRoot, "SKILL.md"), `---\nname: custom-oai2\ndescription: 내 것 — 필요할 때\n---\n${skillMarkerComment("custom-oai2")}\n# custom\n\n1. 한다.\n`);
    const yamlSrc = path.join(skillRoot, "agents", "openai.yaml");

    const deployTo = (target: "agent-skill" | "claude-skill", skillsRoot: string) =>
      target === "agent-skill"
        ? deployWorkflows({ skillsDir: dataDir, agentSkillsDir: skillsRoot, targets: ["agent-skill"] })
        : deployWorkflows({ skillsDir: dataDir, claudeSkillsDir: skillsRoot, targets: ["claude-skill"] });

    for (const target of ["agent-skill", "claude-skill"] as const) {
      const home = target === "agent-skill" ? agentHome() : claudeHome();
      // 매 target마다 소스를 true로 초기화
      fs.writeFileSync(yamlSrc, "policy:\n  allow_implicit_invocation: true\n");
      deployTo(target, home.skillsDir);
      const yamlDst = path.join(home.skillsDir, "custom-oai2", "agents", "openai.yaml");
      assert.match(read(yamlDst), /allow_implicit_invocation: true/, `${target}: 초기 true 복사`);

      // 소스만 false로 변경 → 재배포는 updated여야 하고 값이 byte로 반영돼야 한다
      fs.writeFileSync(yamlSrc, "policy:\n  allow_implicit_invocation: false\n");
      const r2 = deployTo(target, home.skillsDir);
      assert.equal(r2.items.find((i) => i.logicalId === "custom-oai2")!.status, "updated", `${target}: 소스 drift 감지 → updated`);
      assert.match(read(yamlDst), /allow_implicit_invocation: false/, `${target}: 변경값 반영`);
      assert.ok(!read(yamlDst).includes("true"), `${target}: 옛 값 잔존 금지`);

      // 재배포 멱등
      const r3 = deployTo(target, home.skillsDir);
      assert.equal(r3.items.find((i) => i.logicalId === "custom-oai2")!.status, "unchanged", `${target}: 재배포 unchanged`);
    }
  });

  // R2-01(정밀): 내용이 같아도 exec bit 변경은 payload hash가 다른 모든 파일에 대해 drift다 —
  // custom openai.yaml도 exact detection에서 exec-bit 축을 빠뜨리면 안 된다.
  it("custom skill의 agents/openai.yaml exec-bit 변경도 재배포 시 drift로 감지된다(R2-01 exact detection)", () => {
    seedWorkflows({ skillsDir: dataDir });
    const skillRoot = path.join(dataDir, "custom-oai3");
    fs.mkdirSync(path.join(skillRoot, "agents"), { recursive: true });
    fs.writeFileSync(path.join(skillRoot, "SKILL.md"), `---\nname: custom-oai3\ndescription: 내 것 — 필요할 때\n---\n${skillMarkerComment("custom-oai3")}\n# custom\n\n1. 한다.\n`);
    const yamlSrc = path.join(skillRoot, "agents", "openai.yaml");
    fs.writeFileSync(yamlSrc, "policy:\n  allow_implicit_invocation: true\n");
    fs.chmodSync(yamlSrc, 0o644);
    const a = agentHome();
    deployWorkflows({ skillsDir: dataDir, agentSkillsDir: a.skillsDir, targets: ["agent-skill"] });
    const yamlDst = path.join(a.skillsDir, "custom-oai3", "agents", "openai.yaml");
    assert.equal(fs.statSync(yamlDst).mode & 0o111, 0, "초기 non-exec");

    // 내용은 그대로, exec bit만 켠다
    fs.chmodSync(yamlSrc, 0o755);
    const r2 = deployWorkflows({ skillsDir: dataDir, agentSkillsDir: a.skillsDir, targets: ["agent-skill"] });
    assert.equal(r2.items.find((i) => i.logicalId === "custom-oai3")!.status, "updated", "exec-bit drift 감지 → updated");
    assert.notEqual(fs.statSync(yamlDst).mode & 0o111, 0, "exec bit 전파됨");

    const r3 = deployWorkflows({ skillsDir: dataDir, agentSkillsDir: a.skillsDir, targets: ["agent-skill"] });
    assert.equal(r3.items.find((i) => i.logicalId === "custom-oai3")!.status, "unchanged", "재배포 unchanged");
  });
});

// ── R4-01: packaged catalog/binding 문제는 runtime write 이전에 전역 실패(zero-write gate) ──
describe("packaged trust failure zero-write gate (R4-01)", () => {
  const THREE: PkgSpec[] = [
    { name: "goal-ready", activation: "intent", sideEffects: "docs-only" },
    { name: "sdd-implement", activation: "explicit", sideEffects: "mutating" },
    { name: "sdd-self-review", activation: "delegated-or-explicit", sideEffects: "report-only" },
  ];
  const putManaged = (dir: string, name: string, body: string) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${name} 기존 배포본\n---\n${skillMarkerComment(name)}\n${body}\n`);
  };
  const putUnmanaged = (dir: string, name: string) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: 사용자 것\n---\n# 내가 만든 것\n`);
  };
  const runtimeItem = (r: ReturnType<typeof deployWorkflows>) => r.items.filter((i) => ["created", "updated", "pruned", "recovered"].includes(i.status));

  it("malformed catalog.json → 전역 failed, 어떤 runtime write도 없음(기존 managed/unmanaged 불가침)", () => {
    const pkg = path.join(root, "broken-json");
    buildPkg(pkg, THREE);
    seedWorkflows({ templatesDir: pkg, skillsDir: dataDir });
    fs.writeFileSync(path.join(pkg, "catalog.json"), "{ broken");
    const c = claudeHome();
    const a = agentHome();
    const g = geminiHome();
    putManaged(path.join(a.skillsDir, "sdd-implement"), "sdd-implement", "# 옛 버전\n\n1. 옛것.");
    putUnmanaged(path.join(a.skillsDir, "mine"), "mine");
    const managedBefore = fs.readFileSync(path.join(a.skillsDir, "sdd-implement", "SKILL.md"));
    const managedModeBefore = fs.statSync(path.join(a.skillsDir, "sdd-implement", "SKILL.md")).mode;
    const unmanagedBefore = fs.readFileSync(path.join(a.skillsDir, "mine", "SKILL.md"));
    const r = deployWorkflows({ templatesDir: pkg, skillsDir: dataDir, claudeSkillsDir: c.skillsDir, agentSkillsDir: a.skillsDir, geminiCommandsDir: g.commandsDir, targets: ["claude-skill", "agent-skill", "gemini-command"] });
    assert.equal(r.outcome, "failed");
    assert.equal(r.exitCode, 1);
    assert.ok(r.sourceProblems.length > 0, "package 문제 보고");
    assert.equal(runtimeItem(r).length, 0, "zero runtime write");
    assert.ok(!fs.existsSync(path.join(c.skillsDir, "goal-ready")), "claude 미생성");
    assert.ok(!fs.existsSync(path.join(g.commandsDir, "goal-ready.toml")), "gemini 미생성");
    assert.ok(fs.readFileSync(path.join(a.skillsDir, "sdd-implement", "SKILL.md")).equals(managedBefore), "기존 managed byte 불변");
    assert.equal(fs.statSync(path.join(a.skillsDir, "sdd-implement", "SKILL.md")).mode, managedModeBefore, "기존 managed mode 불변");
    assert.ok(fs.readFileSync(path.join(a.skillsDir, "mine", "SKILL.md")).equals(unmanagedBefore), "unmanaged collision 불변");
    // gemini commands 폴더 자체가 생성되지 않았거나(zero-write) 생겼어도 고아 0.
    const gOrphans = fs.existsSync(g.commandsDir) ? fs.readdirSync(g.commandsDir).filter((x) => x.startsWith(".localmind-")) : [];
    assert.deepEqual(gOrphans, [], "gemini 고아 0");
  });

  it("manifest-directory 1:1 mismatch(extra dir) → 전역 failed, zero-write", () => {
    const pkg = path.join(root, "extra-dir");
    buildPkg(pkg, THREE);
    seedWorkflows({ templatesDir: pkg, skillsDir: dataDir });
    // catalog에 없는 여분 packaged dir 추가(1:1 위반)
    const extra = path.join(pkg, "rogue-wf");
    fs.mkdirSync(extra, { recursive: true });
    fs.writeFileSync(path.join(extra, "SKILL.md"), `---\nname: rogue-wf\ndescription: 매니페스트에 없는 워크플로 — 필요할 때\n---\n${skillMarkerComment("rogue-wf")}\n# rogue\n\n1. 한다.\n`);
    const c = claudeHome();
    const a = agentHome();
    const g = geminiHome();
    const r = deployWorkflows({ templatesDir: pkg, skillsDir: dataDir, claudeSkillsDir: c.skillsDir, agentSkillsDir: a.skillsDir, geminiCommandsDir: g.commandsDir, targets: ["claude-skill", "agent-skill", "gemini-command"] });
    assert.equal(r.outcome, "failed");
    assert.equal(runtimeItem(r).length, 0, "zero runtime write");
    assert.ok(!fs.existsSync(path.join(a.skillsDir, "goal-ready")), "agent 미생성");
    assert.ok(!fs.existsSync(path.join(g.commandsDir, "goal-ready.toml")), "gemini 미생성");
  });

  it("구분: 유효 package + 격리된 data-source 문제는 전역 gate가 아니라 per-item/prune-suppression", () => {
    const pkg = path.join(root, "valid-pkg");
    buildPkg(pkg, THREE);
    seedWorkflows({ templatesDir: pkg, skillsDir: dataDir });
    // data 폴더에 malformed custom skill 하나(정본 문제) 추가 — package는 유효
    const bad = path.join(dataDir, "bad-custom");
    fs.mkdirSync(bad, { recursive: true });
    fs.writeFileSync(path.join(bad, "SKILL.md"), "frontmatter 없음 — 잘못된 스킬");
    const a = agentHome();
    const r = deployWorkflows({ templatesDir: pkg, skillsDir: dataDir, agentSkillsDir: a.skillsDir, targets: ["agent-skill"] });
    // 유효 workflow는 여전히 배포된다(data 문제가 모든 write를 막지 않는다)
    assert.ok(fs.existsSync(path.join(a.skillsDir, "goal-ready", "SKILL.md")), "유효 workflow는 배포됨");
    assert.ok(r.pruneSuppressed, "data 문제로 prune 보류");
    assert.ok(r.sourceProblems.some((p) => /bad-custom|frontmatter/.test(p.nameOrPath + p.reason)), "data 문제 보고");
    assert.ok(r.items.some((i) => i.status === "created"), "created item 존재(gate 아님)");
  });
});

// ── R4-02: prepareRoot 이후 runtime parent가 symlink/다른 dir로 바뀌면 mutation 전에 잡는다 ──
describe("runtime parent identity revalidation (R4-02)", () => {
  // ops.mkdir(rootDir) 직후(=prepareRoot의 root 생성 시점)에 attack을 주입한다:
  // 원본 .agents를 saved로 옮기고 자기만의 skills를 가진 redirect 트리를 만든 뒤,
  // .agents를 redirect로 (a) symlink 또는 (b) 다른 실제 디렉토리로 대체한다.
  function attackOps(base: FsOps, rootDir: string, parentDir: string, savedDir: string, redirectDir: string, mode: "symlink" | "realdir"): FsOps {
    let done = false;
    return {
      ...base,
      mkdir(dir: string) {
        base.mkdir(dir);
        if (!done && dir === rootDir) {
          done = true;
          fs.renameSync(parentDir, savedDir); // 원본 .agents(+생성된 skills) 저장
          fs.mkdirSync(path.join(redirectDir, "skills"), { recursive: true });
          if (mode === "symlink") fs.symlinkSync(redirectDir, parentDir); // .agents → redirect(symlink)
          else fs.renameSync(redirectDir, parentDir); // .agents = 다른 실제 dir(inode 교체)
        }
      },
    };
  }

  // 공격 대상 root를 claude/agent 양쪽으로 돌려 shared revalidateRootGuard가 두 skill-directory
  // root에 일관 적용됨을 증명한다(R4-02 fix contract: "consistently to Claude skills, shared Agent
  // Skills, and Gemini commands"). claude/agent는 동일한 deploySkillDirTarget→prepareRoot 경로다.
  // Gemini(gemini-command)는 syncGeminiCommands의 별도 경로(prepareRoot root-mkdir 주입점 없음)라
  // 이 표에서 제외한다 — 그 경로 공격은 별도 wiring이 필요하고 deploy orchestration 영역과 겹친다.
  const parentOf: Record<"claude-skill" | "agent-skill", string> = { "claude-skill": ".claude", "agent-skill": ".agents" };
  const attackCases = [
    { attacked: "agent-skill", independent: "claude-skill" },
    { attacked: "claude-skill", independent: "agent-skill" },
  ] as const;

  for (const { attacked, independent } of attackCases) {
    for (const mode of ["symlink", "realdir"] as const) {
      it(`${attacked} runtime parent가 ${mode}로 교체되면 그 target은 problem, redirect 트리 write 0, 독립 ${independent}는 성공`, () => {
        seedWorkflows({ skillsDir: dataDir });
        const home = path.join(root, `attack-${attacked}-${mode}`);
        const attackedParent = path.join(home, parentOf[attacked]);
        fs.mkdirSync(attackedParent, { recursive: true }); // 공격 대상 부모는 실제 디렉토리로 시작
        const attackedRoot = path.join(attackedParent, "skills");
        const saved = path.join(home, "saved-parent");
        const redirect = path.join(home, "redirect");
        // 독립 target(공격 없음)
        const indepParent = path.join(home, parentOf[independent]);
        fs.mkdirSync(indepParent, { recursive: true });
        const indepRoot = path.join(indepParent, "skills");

        const ops = attackOps(defaultFsOps, attackedRoot, attackedParent, saved, redirect, mode);
        // 두 target 모두 명시 경로 주입 → claude도 explicitOverride로 alwaysCreate(공격 대상이든 독립이든 root 생성).
        const dirs = (t: "claude-skill" | "agent-skill", p: string) => (t === "claude-skill" ? { claudeSkillsDir: p } : { agentSkillsDir: p });
        const r = deployWorkflows({
          skillsDir: dataDir,
          ...dirs(attacked, attackedRoot),
          ...dirs(independent, indepRoot),
          targets: ["claude-skill", "agent-skill"],
          ops,
        });

        // 공격 대상 target: 어떤 goal-ready도 생성되지 않고 problem
        const attackedItems = r.items.filter((i) => i.target === attacked);
        assert.ok(attackedItems.length > 0 && attackedItems.every((i) => i.status === "problem"), `${attacked} 항목 전부 problem (${mode})`);
        assert.equal(r.outcome, "failed", "aggregate failed");
        // redirect 트리(공격 대상)에 skill write가 전혀 없어야 한다
        const redirectSkills = mode === "symlink" ? path.join(redirect, "skills") : path.join(attackedParent, "skills");
        assert.ok(!fs.existsSync(path.join(redirectSkills, "goal-ready")), `redirect 트리에 goal-ready write 0 (${mode})`);
        // 저장된 원본 트리 보존
        assert.ok(fs.existsSync(saved), "저장된 원본 부모 트리 보존");
        // 독립 target은 정상 완료
        const indepCreated = r.items.filter((i) => i.target === independent && i.status === "created");
        assert.ok(indepCreated.length >= 3, `독립 ${independent} target은 세 workflow 생성 성공`);
        assert.ok(fs.existsSync(path.join(indepRoot, "goal-ready", "SKILL.md")), `${independent} goal-ready 존재`);
      });
    }
  }
});

// ── R4-03: SKILL.md 자체의 executable mode 보존(멱등) ──────────────────────────
describe("executable SKILL.md mode preservation (R4-03)", () => {
  for (const target of ["claude-skill", "agent-skill"] as const) {
    for (const mode of [0o644, 0o755] as const) {
      it(`${target}: SKILL.md mode ${mode.toString(8)} 보존 + 다음 배포 unchanged`, () => {
        seedWorkflows({ skillsDir: dataDir });
        const name = `mode-${target === "claude-skill" ? "c" : "a"}-${mode.toString(8)}`;
        const skillRoot = path.join(dataDir, name);
        fs.mkdirSync(skillRoot, { recursive: true });
        fs.writeFileSync(path.join(skillRoot, "SKILL.md"), `---\nname: ${name}\ndescription: 모드 테스트 — 필요할 때\n---\n${skillMarkerComment(name)}\n# ${name}\n\n1. 한다.\n`);
        fs.chmodSync(path.join(skillRoot, "SKILL.md"), mode);
        const home = target === "claude-skill" ? claudeHome() : agentHome();
        const deploy = () =>
          target === "claude-skill"
            ? deployWorkflows({ skillsDir: dataDir, claudeSkillsDir: home.skillsDir, targets: ["claude-skill"] })
            : deployWorkflows({ skillsDir: dataDir, agentSkillsDir: home.skillsDir, targets: ["agent-skill"] });
        const r1 = deploy();
        const dst = path.join(home.skillsDir, name, "SKILL.md");
        assert.equal(r1.items.find((i) => i.logicalId === name)!.status, "created");
        assert.equal(fs.statSync(dst).mode & 0o777, mode, "생성 후 target SKILL.md mode == source");
        const r2 = deploy();
        assert.equal(r2.items.find((i) => i.logicalId === name)!.status, "unchanged", "다음 배포 unchanged(드리프트 없음)");
      });
    }
  }

  it("SKILL.md chmod 실패는 stage 단계에서 problem으로 격리되고 부분 target을 노출하지 않는다", () => {
    // source mode 적용이 ops.chmod 경유라 fault-injectable해야 한다는 R4-03 계약(no partial target).
    const name = "mode-fault";
    const skillRoot = path.join(dataDir, name);
    fs.mkdirSync(skillRoot, { recursive: true });
    fs.writeFileSync(path.join(skillRoot, "SKILL.md"), `---\nname: ${name}\ndescription: chmod 실패 격리 — 필요할 때\n---\n${skillMarkerComment(name)}\n# ${name}\n\n1. 한다.\n`);
    fs.chmodSync(path.join(skillRoot, "SKILL.md"), 0o755);
    const a = agentHome();
    // 이 custom skill의 SKILL.md render 중 첫 chmod(=source mode 적용)에서 실패를 주입한다.
    const ops = faultyOps(defaultFsOps, { chmod: 1 });
    const r = deployWorkflows({ skillsDir: dataDir, agentSkillsDir: a.skillsDir, targets: ["agent-skill"], ops });
    assert.equal(r.outcome, "failed", "chmod 실패 → 전역 failed");
    assert.equal(r.items.find((i) => i.logicalId === name)!.status, "problem", "해당 항목 problem");
    // 부분 target 미노출: target 디렉토리도, 남은 stage 고아도 없다.
    assert.ok(!fs.existsSync(path.join(a.skillsDir, name)), "부분 target 미생성");
    const orphans = fs.readdirSync(a.skillsDir).filter((x) => x.startsWith(".localmind-"));
    assert.deepEqual(orphans, [], "실패한 stage 고아 0(정리됨)");
  });
});

// ── R1-14: 결과에 target별 activation enforcement level 표시 ──────────────────
describe("result enforcement level (R1-14)", () => {
  it("machine+human 결과에 target별 enforcement를 표시하고 custom/non-explicit을 runtime-enforced로 라벨하지 않는다", () => {
    seedWorkflows({ skillsDir: dataDir });
    const c = claudeHome();
    const a = agentHome();
    const g = geminiHome();
    const r = deployWorkflows({ skillsDir: dataDir, claudeSkillsDir: c.skillsDir, agentSkillsDir: a.skillsDir, geminiCommandsDir: g.commandsDir, targets: ["claude-skill", "agent-skill", "gemini-command"] });
    const find = (id: string, t: string) => r.items.find((i) => i.logicalId === id && i.target === t)!;
    assert.equal(find("sdd-implement", "claude-skill").enforcement, "runtime-enforced");
    assert.equal(find("sdd-implement", "agent-skill").enforcement, "runtime-enforced");
    assert.equal(find("sdd-implement", "gemini-command").enforcement, "instruction-level");
    // intent workflow는 runtime-enforced로 표시하지 않는다
    assert.notEqual(find("goal-ready", "claude-skill").enforcement, "runtime-enforced");
    assert.notEqual(find("goal-ready", "gemini-command").enforcement, "runtime-enforced");
    // human summary가 두 수준을 구분해 노출
    const text = formatDeployResult(r);
    assert.match(text, /런타임 강제|runtime-enforced/);
    assert.match(text, /지침 수준|instruction-level/);
  });
});

// ── 회귀(FR-13): 스킬 정본은 노트 색인에서 제외 ──────────────────────────────
describe("회귀: 스킬 정본은 노트 색인 제외 (자식 프로세스 격리)", () => {
  it("skills/ 하위 SKILL.md가 listNotes에 나타나지 않는다", () => {
    const notesDir = path.join(root, "notes");
    const skills = path.join(notesDir, "skills");
    fs.mkdirSync(skills, { recursive: true });
    fs.writeFileSync(path.join(notesDir, "note.md"), "일반 노트");
    seedWorkflows({ skillsDir: skills });
    const script = [
      `import(${JSON.stringify(BRAIN_JS)}).then((m) => {`,
      `  process.stdout.write(JSON.stringify(m.listNotes()));`,
      `}).catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: { ...process.env, NOTES_DIR: `notes=${notesDir}`, BRAIN_INDEX: path.join(notesDir, ".brain-index.json"), LOCALMIND_SKILLS_DIR: skills },
    });
    const paths = (JSON.parse(out) as { path: string }[]).map((n) => n.path);
    assert.ok(paths.includes("notes/note.md"));
    assert.ok(!paths.some((p) => p.includes("skills")), `skills/ 노출됨: ${paths.join(", ")}`);
  });
});

// ── 읽기 전용 카탈로그 (specs/048 T010) ──────────────────────────────────────
function makeSkill(rootDir: string, name: string, opts: { managed?: boolean; body?: string } = {}) {
  const dir = path.join(rootDir, name);
  fs.mkdirSync(dir, { recursive: true });
  const marker = opts.managed === false ? "" : `<!-- managed-by: localmind (skill: ${name}) -->\n`;
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\n---\n${marker}${opts.body ?? "지침"}\n`);
}

describe("listSkills — 읽기 전용 카탈로그 (specs/048 T010)", () => {
  it("SKILL.md 열거 + frontmatter name/description 파싱", () => {
    makeSkill(dataDir, "my-skill", { body: "본문" });
    fs.writeFileSync(
      path.join(dataDir, "my-skill", "SKILL.md"),
      "---\nname: my-skill\ndescription: 테스트용 스킬\n---\n<!-- managed-by: localmind (skill: my-skill) -->\n본문\n",
    );
    const items = listSkills(dataDir);
    assert.equal(items.length, 1);
    assert.equal(items[0].name, "my-skill");
    assert.equal(items[0].description, "테스트용 스킬");
    assert.equal(items[0].file, path.join("my-skill", "SKILL.md"));
  });

  it("managed 마커 없는 스킬은 managed:false", () => {
    makeSkill(dataDir, "unmanaged-skill", { managed: false, body: "직접 만든 스킬" });
    fs.writeFileSync(
      path.join(dataDir, "unmanaged-skill", "SKILL.md"),
      "---\nname: unmanaged-skill\ndescription: 사용자 스킬\n---\n직접 만든 스킬\n",
    );
    const items = listSkills(dataDir);
    assert.equal(items.find((i) => i.name === "unmanaged-skill")?.managed, false);
  });

  it("managed 마커 있는 스킬은 managed:true", () => {
    makeSkill(dataDir, "managed-skill", { body: "관리되는 스킬" });
    const items = listSkills(dataDir);
    assert.equal(items.find((i) => i.name === "managed-skill")?.managed, true);
  });

  it("SKILL.md 없는 디렉토리는 목록에서 제외된다", () => {
    fs.mkdirSync(path.join(dataDir, "not-a-skill"), { recursive: true });
    fs.writeFileSync(path.join(dataDir, "not-a-skill", "README.md"), "스킬 아님");
    const items = listSkills(dataDir);
    assert.ok(!items.some((i) => i.name === "not-a-skill"));
  });

  it("description 프론트매터가 없으면 빈 문자열", () => {
    fs.mkdirSync(path.join(dataDir, "no-desc"), { recursive: true });
    fs.writeFileSync(path.join(dataDir, "no-desc", "SKILL.md"), "---\nname: no-desc\n---\n본문\n");
    const items = listSkills(dataDir);
    assert.equal(items.find((i) => i.name === "no-desc")?.description, "");
  });

  it("정본 폴더가 없으면 빈 배열(오류 아님)", () => {
    assert.deepEqual(listSkills(path.join(root, "no-such-dir")), []);
  });
});
