import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");

test("Phase 5 support matrix는 macOS/Linux × Node 20/22/24에서 전체 transport·ops gate를 실행한다", () => {
  const workflow = parse(read(".github/workflows/ci.yml"));
  const job = workflow?.jobs?.build;
  assert.ok(job, "CI build job이 필요하다");

  assert.deepEqual(job.strategy?.matrix?.os, ["ubuntu-latest", "macos-latest"]);
  assert.deepEqual(job.strategy?.matrix?.node, [20, 22, 24]);
  assert.equal(job.strategy?.["fail-fast"], false);
  assert.equal(job["runs-on"], "${{ matrix.os }}");
  assert.match(job.name, /matrix\.os/);
  assert.match(job.name, /matrix\.node/);
  assert.equal(job["timeout-minutes"], 20, "hung transport/ops gate는 bounded여야 한다");
  assert.deepEqual(workflow.permissions, { contents: "read" }, "CI token은 read-only여야 한다");

  const steps = job.steps ?? [];
  assert.ok(steps.some((step) => step.uses === "actions/checkout@v4"));
  const setup = steps.find((step) => step.uses === "actions/setup-node@v4");
  assert.equal(setup?.with?.["node-version"], "${{ matrix.node }}");
  const commands = steps.filter((step) => typeof step.run === "string").map((step) => step.run.trim());
  const positions = ["npm ci", "npm run typecheck", "npm test", "npm run build"].map((command) => commands.indexOf(command));
  assert.ok(positions.every((index) => index >= 0));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, "gate 순서가 바뀌면 안 된다");
  const shellIndex = steps.findIndex((step) => step.name === "shell tests");
  const shell = steps[shellIndex];
  assert.ok(shellIndex > steps.findIndex((step) => step.run === "npm run build"));
  assert.equal(shell?.shell, "bash");
  assert.match(shell?.run ?? "", /scripts\/\*\.test\.sh/);
  assert.match(shell?.run ?? "", /bash "\$t" \|\| exit 1/);
  assert.notEqual(job["continue-on-error"], true);
  assert.equal(steps.some((step) => step["continue-on-error"] === true), false);

  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.engines?.node, ">=20");
  assert.match(pkg.scripts?.test ?? "", /src\/\*\.test\.ts/);
  assert.match(pkg.scripts?.test ?? "", /scripts\/\*\.test\.mjs/);

  const roadmap = read("docs/core-roadmap.md");
  assert.match(roadmap, /macOS\/Linux/);
  assert.match(roadmap, /Node 20·22·24/);
  assert.match(roadmap, /local stdio\/remote HTTP/);
  const selfHost = read("docs/home-server-deploy.md");
  for (const provider of ["Tailscale", "WireGuard", "ZeroTier"]) assert.match(selfHost, new RegExp(provider));
});
