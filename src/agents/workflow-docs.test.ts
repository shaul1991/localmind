/**
 * AC-21 — docs/help/env/result 의미 계약과 old `/goal` workflow pointer 제거 검증
 * (specs/044 FR-12). AC-18 — 경계/개인정보/사실 provenance 검증.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkillRegistry, scanPackagedNeutrality } from "./skill-contract.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");

const flat = (s: string) => s.replace(/\s+/g, " ");

describe("workflow-doc-contract: AC-21", () => {
  const agents = () => flat(read("docs/agents.md"));
  const reference = () => flat(read("docs/reference.md"));

  it("네 env 변수의 source/target·canonical/generated 구분을 문서화한다", () => {
    const a = agents();
    for (const v of ["LOCALMIND_SKILLS_DIR", "LOCALMIND_CLAUDE_SKILLS_DIR", "LOCALMIND_AGENT_SKILLS_DIR", "LOCALMIND_GEMINI_COMMANDS_DIR"]) {
      assert.ok(a.includes(v) || reference().includes(v), `${v} 문서 누락`);
    }
    assert.match(a, /정본\(source\)/);
    assert.match(a, /배포 대상/);
    assert.match(a, /생성 target은 .*재생성됩니다/);
  });

  it("activation/invocation matrix와 status/outcome 의미를 문서화한다", () => {
    const a = agents();
    assert.match(a, /\/goal-ready/);
    assert.match(a, /\$goal-ready/);
    assert.match(a, /skipped-unavailable/);
    assert.match(a, /`partial`/);
    assert.match(a, /`failed`/);
  });

  it("deny-implicit(runtime-enforced) vs Gemini instruction-level 한계를 구분한다", () => {
    const a = agents();
    assert.match(a, /runtime-enforced|런타임이 강제/);
    assert.match(a, /instruction-level|지침 수준/);
    assert.match(a, /도구 호출 0회.*과장하지 않|과장하지 않습니다/);
    assert.match(a, /consent 게이트를 우회하지 않/);
  });

  it("reserved-ID fork 차단과 workspace shadowing/resolution 한계를 설명한다", () => {
    const a = agents();
    assert.match(a, /예약 이름|reserved/);
    assert.match(a, /fail-closed/);
    assert.match(a, /equivalent-shadow\|ambiguous-shadow\|unmanaged-shadow\|unverified|resolved\|equivalent-shadow/);
    assert.match(a, /미래의 다른 workspace까지 parity를 보장한다고 하지 않/);
  });

  it("Gemini live 한계와 '모든 command' 범위를 명시한다", () => {
    const a = agents();
    assert.match(a, /Gemini CLI가 설치되지 않은 기기.*정적 contract/);
    assert.match(a, /live E2E는 `skipped`/);
    assert.match(a, /LocalMind가 소유한 packaged AI workflow command/);
  });

  it("Make 도움말은 Claude-only 배포라고 쓰지 않는다", () => {
    const mk = read("Makefile");
    const line = mk.split("\n").find((l) => l.startsWith("skills-deploy:"))!;
    assert.ok(!/Claude Code로 복사 배포/.test(line), "Claude-only 문구 잔존");
    assert.match(line, /Claude·공용|Gemini/);
  });

  it("goal-impl migration과 Claude built-in /goal 차이를 안내한다", () => {
    const a = agents();
    assert.match(a, /Claude built-in `\/goal`/);
    assert.match(a, /session completion condition/);
    assert.match(a, /goal-impl/);
  });

  it("active docs/templates/source에 old LocalMind /goal workflow pointer가 0건이다(migration 설명 제외)", () => {
    const files = [
      "AGENTS.md",
      "templates/sdd/AGENTS.md",
      "templates/sdd/spec.template.md",
      "templates/skills/goal-ready/SKILL.md",
      "templates/skills/goal-impl/SKILL.md",
      "templates/skills/sdd-self-review/SKILL.md",
      "docs/agents.md",
    ];
    const forbidden = ["## `/goal {NNN}` 처리 방법", "`/goal`로 구현", "`/goal` 흐름", "`/goal`의 완료", "AGENTS.md `/goal` 규약"];
    for (const f of files) {
      const c = read(f);
      for (const pat of forbidden) {
        assert.ok(!c.includes(pat), `${f}에 old /goal pointer "${pat}" 잔존`);
      }
    }
  });
});

describe("workflow-boundary: AC-18", () => {
  it("canonical/template/bridge/신규 소스에 실제 개인 절대경로·secret이 없다", () => {
    const scan: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(md|ts|json|toml)$/.test(e.name)) scan.push(p);
      }
    };
    walk(path.join(REPO_ROOT, "templates", "skills"));
    scan.push(path.join(REPO_ROOT, "GEMINI.md"), path.join(REPO_ROOT, "templates", "sdd", "CLAUDE.md"), path.join(REPO_ROOT, "templates", "sdd", "GEMINI.md"));
    for (const s of ["skill-contract.ts", "reconcile.ts", "workflow-policy.ts", "commands.ts", "skills.ts"]) scan.push(path.join(REPO_ROOT, "src", "agents", s));
    const secretRe = /\/Users\/[a-z]|\/home\/[a-z][a-z0-9]+\/|sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{16,}|xox[bap]-/;
    for (const f of scan) {
      const c = fs.readFileSync(f, "utf8");
      const m = secretRe.exec(c);
      assert.ok(!m, `${path.relative(REPO_ROOT, f)}에 개인경로/secret 의심: ${m?.[0]}`);
    }
  });

  it("packaged canonical workflow는 중립성 clean(재확인)", () => {
    const reg = loadSkillRegistry(path.join(REPO_ROOT, "templates", "skills"), { packaged: true });
    assert.equal(reg.problems.length, 0, JSON.stringify(reg.problems));
    for (const s of reg.skills) assert.equal(scanPackagedNeutrality(s).length, 0, `${s.name} 중립성 위반`);
  });

  it("gateway/backend/search 핵심 파일이 044 변경 범위 밖이다(존재 확인 — 미변경 경계)", () => {
    // 이 파일들은 044에서 수정하지 않는다. 존재만 확인해 회귀 경계를 문서화한다.
    for (const f of ["src/server.ts", "src/brain.ts", "src/agents/registry.ts", "src/agents/deploy.ts"]) {
      assert.ok(fs.existsSync(path.join(REPO_ROOT, f)), `${f} 없음`);
    }
  });
});
