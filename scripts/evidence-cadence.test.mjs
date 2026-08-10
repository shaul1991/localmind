import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, linkSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendEvidenceEvent,
  buildEvidenceEvent,
  readEvidenceDirectory,
  validateEvidenceHistory,
} from "./evidence-cadence.mjs";

const H = (char) => char.repeat(64);
const canonicalValue = (value) => {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
};
const canonicalFrame = (event) => `${JSON.stringify(canonicalValue(event))}\n`;
const proposalInput = (overrides = {}) => ({
  goal_id: "retrieval-no-match",
  phase: "bootstrap",
  iteration: 1,
  action: "proposed",
  trigger: "quality_regression",
  recorded_at: "2026-08-10T22:20:00.000Z",
  classification: "implementation_candidate",
  metric_id: "no_match_fpr",
  before_value: 1,
  sample_size: 5,
  hypothesis_sha256: H("a"),
  reproduction_sha256: H("b"),
  fixture_sha256: H("c"),
  stop_condition_sha256: H("d"),
  ...overrides,
});

const startInput = (proposal, overrides = {}) => ({
  goal_id: proposal.goal_id,
  phase: proposal.phase,
  iteration: proposal.iteration,
  action: "implementation_started",
  trigger: proposal.trigger,
  recorded_at: "2026-08-10T22:21:00.000Z",
  proposal_sha256: proposal.event_sha256,
  authorization_sha256: H("e"),
  ...overrides,
});

const validatedInput = (proposal, overrides = {}) => ({
  goal_id: proposal.goal_id,
  phase: proposal.phase,
  iteration: proposal.iteration,
  action: "validated",
  trigger: proposal.trigger,
  recorded_at: "2026-08-10T22:22:00.000Z",
  proposal_sha256: proposal.event_sha256,
  validation_sha256: H("f"),
  lesson_sha256: H("3"),
  residual_risk_sha256: H("4"),
  after_value: 0.2,
  after_sample_size: 5,
  supersedes_event_sha256: null,
  ...overrides,
});

function runCadenceCli(arguments_, input = "", environment = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(process.cwd(), "scripts/evidence-cadence.mjs"), ...arguments_], {
      cwd: process.cwd(),
      env: { ...process.env, ...environment },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

test("Phase 6 reader는 bulk readdir 없이 bounded streaming enumeration을 사용한다", async () => {
  const directory = mkdtempSync(join(tmpdir(), "localmind-cadence-opendir-"));
  const preload = `${directory}-preload.cjs`;
  try {
    writeFileSync(preload, [
      'const fs = require("node:fs");',
      'const module_ = require("node:module");',
      'fs.readdirSync = () => { throw new Error("bulk enumeration forbidden"); };',
      'module_.syncBuiltinESMExports();',
      '',
    ].join("\n"), { mode: 0o600 });
    const result = await runCadenceCli(["verify", directory], "", {
      NODE_OPTIONS: `--require=${preload}`,
    });
    assert.equal(result.code, 0);
    assert.equal(JSON.parse(result.stdout).events, 0);
  } finally {
    rmSync(preload, { force: true });
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Phase 6 CLI는 32 KiB를 넘는 stdin을 EOF 전에 bounded rejection한다", async () => {
  const directory = mkdtempSync(join(tmpdir(), "localmind-cadence-bounded-"));
  let child;
  try {
    const result = await new Promise((resolve, reject) => {
      child = spawn(process.execPath, [join(process.cwd(), "scripts/evidence-cadence.mjs"), "append", directory], {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.stdin.on("error", () => {});
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("oversized stdin was not bounded"));
      }, 2_000);
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timeout);
        resolve({ code, stdout, stderr });
      });
      child.stdin.write(Buffer.alloc(40_000, 0x78));
    });
    assert.equal(result.code, 2);
    assert.equal(`${result.stdout}${result.stderr}`.includes(directory), false);
  } finally {
    if (child?.exitCode === null) child.kill();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Phase 6 append는 publish slot EEXIST를 성공으로 오인하지 않는다", async () => {
  const directory = mkdtempSync(join(tmpdir(), "localmind-cadence-conflict-"));
  const preload = `${directory}-preload.cjs`;
  try {
    writeFileSync(preload, [
      'const fs = require("node:fs");',
      'fs.linkSync = () => { const error = new Error("injected"); error.code = "EEXIST"; throw error; };',
      'require("node:module").syncBuiltinESMExports();',
      "",
    ].join("\n"), { mode: 0o600 });
    const result = await runCadenceCli(
      ["append", directory],
      JSON.stringify(proposalInput()),
      { NODE_OPTIONS: `--require=${preload}` },
    );
    assert.equal(result.code, 2);
    assert.equal(readEvidenceDirectory(directory).length, 0);
    assert.equal(`${result.stdout}${result.stderr}`.includes(directory), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(preload, { force: true });
  }
});

test("Phase 6 append는 published staging unlink 실패를 성공으로 보고하지 않는다", async () => {
  const directory = mkdtempSync(join(tmpdir(), "localmind-cadence-unlink-"));
  const preload = `${directory}-preload.cjs`;
  const stagingPrefix = `.${directory.split("/").at(-1)}.cadence-`;
  try {
    writeFileSync(preload, [
      'const fs = require("node:fs");',
      'fs.unlinkSync = () => { const error = new Error("injected"); error.code = "EACCES"; throw error; };',
      'require("node:module").syncBuiltinESMExports();',
      "",
    ].join("\n"), { mode: 0o600 });
    const result = await runCadenceCli(
      ["append", directory],
      JSON.stringify(proposalInput()),
      { NODE_OPTIONS: `--require=${preload}` },
    );
    assert.equal(result.code, 2);
    assert.equal(`${result.stdout}${result.stderr}`.includes(directory), false);
    assert.throws(() => readEvidenceDirectory(directory), /cadence storage invalid/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(preload, { force: true });
    for (const name of readdirSync(tmpdir()).filter((entry) => entry.startsWith(stagingPrefix))) {
      rmSync(join(tmpdir(), name), { force: true });
    }
  }
});

test("Phase 6 CLI는 stdin-only input과 no-clobber concurrency 및 aggregate-only output을 지킨다", async () => {
  const directory = mkdtempSync(join(tmpdir(), "localmind-cadence-cli-"));
  try {
    const serialized = JSON.stringify(proposalInput());
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () => runCadenceCli(["append", directory], serialized)),
    );
    assert.deepEqual(attempts.map(({ code }) => code).sort(), [0, 2, 2, 2, 2, 2, 2, 2]);
    assert.equal(readEvidenceDirectory(directory).length, 1);

    const canary = "PRIVATE-QUERY-CANARY";
    const rejected = await runCadenceCli(
      ["append", directory],
      JSON.stringify(proposalInput({ query_text: canary })),
    );
    assert.equal(rejected.code, 2);
    assert.equal(`${rejected.stdout}${rejected.stderr}`.includes(canary), false);
    assert.equal(`${rejected.stdout}${rejected.stderr}`.includes(directory), false);

    const verified = await runCadenceCli(["verify", directory]);
    assert.equal(verified.code, 0);
    const summary = JSON.parse(verified.stdout);
    assert.equal(summary.events, 1);
    assert.equal(verified.stdout.includes("retrieval-no-match"), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Phase 6 reader는 digest에 포함되지 않는 duplicate-key raw shadow bytes를 거부한다", () => {
  const directory = mkdtempSync(join(tmpdir(), "localmind-cadence-shadow-"));
  try {
    appendEvidenceEvent(directory, proposalInput());
    const segment = join(directory, "000001.json");
    const original = readFileSync(segment, "utf8");
    const canary = "/private/raw-shadow";
    writeFileSync(segment, `{"goal_id":"${canary}",${original.slice(1)}`, { mode: 0o600 });
    assert.equal(readFileSync(segment, "utf8").includes(canary), true);
    assert.throws(() => readEvidenceDirectory(directory), /cadence storage invalid/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Phase 6 ledger는 no-clobber sequence segment를 append하고 tamper된 chain을 거부한다", () => {
  const directory = mkdtempSync(join(tmpdir(), "localmind-cadence-"));
  try {
    const proposal = appendEvidenceEvent(directory, proposalInput());
    const started = appendEvidenceEvent(directory, startInput(proposal));
    assert.deepEqual(readEvidenceDirectory(directory), [proposal, started]);

    const firstPath = join(directory, "000001.json");
    const tampered = JSON.parse(readFileSync(firstPath, "utf8"));
    tampered.before_value = 999;
    writeFileSync(firstPath, `${JSON.stringify(tampered)}\n`);
    assert.throws(() => readEvidenceDirectory(directory), /cadence digest invalid/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Phase 6 ledger는 외부에서 변조 가능한 hard-link alias segment를 거부한다", () => {
  const directory = mkdtempSync(join(tmpdir(), "localmind-cadence-link-"));
  const external = `${directory}-external.json`;
  try {
    const event = buildEvidenceEvent([], proposalInput());
    writeFileSync(external, canonicalFrame(event), { mode: 0o600 });
    chmodSync(external, 0o600);
    linkSync(external, join(directory, "000001.json"));
    assert.throws(() => readEvidenceDirectory(directory), /cadence storage invalid/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(external, { force: true });
  }
});

test("Phase 6 ledger는 외부 파일을 가리키는 symlink segment를 거부한다", () => {
  const directory = mkdtempSync(join(tmpdir(), "localmind-cadence-symlink-"));
  const external = `${directory}-external.json`;
  try {
    const event = buildEvidenceEvent([], proposalInput());
    writeFileSync(external, canonicalFrame(event), { mode: 0o600 });
    symlinkSync(external, join(directory, "000001.json"));
    assert.throws(() => readEvidenceDirectory(directory), /cadence storage invalid/);
    assert.equal(JSON.parse(readFileSync(external, "utf8")).event_sha256, event.event_sha256);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(external, { force: true });
  }
});

test("Phase 6 terminal decision은 lesson과 residual-risk evidence 없이는 닫히지 않는다", () => {
  const proposal = buildEvidenceEvent([], proposalInput());
  const started = buildEvidenceEvent([proposal], startInput(proposal));
  const complete = validatedInput(proposal);
  const { lesson_sha256: _lesson, residual_risk_sha256: _risk, ...missingTerminalEvidence } = complete;
  assert.throws(
    () => buildEvidenceEvent([proposal, started], missingTerminalEvidence),
    /cadence input invalid/,
  );
  const { after_sample_size: _sample, ...missingAfterSample } = validatedInput(proposal);
  assert.throws(
    () => buildEvidenceEvent([proposal, started], missingAfterSample),
    /cadence input invalid/,
  );
  assert.throws(
    () => buildEvidenceEvent([proposal, started], validatedInput(proposal, { after_sample_size: 0 })),
    /cadence input invalid/,
  );
  assert.throws(
    () => buildEvidenceEvent([proposal, started], validatedInput(proposal, { validation_sha256: [H("f")] })),
    /cadence input invalid/,
  );
});

const maintenanceInput = (decision, action, overrides = {}) => ({
  goal_id: decision.goal_id,
  phase: "maintain",
  iteration: decision.iteration,
  action,
  trigger: "scheduled_maintenance",
  recorded_at: action === "maintained" ? "2026-08-10T22:23:00.000Z" : "2026-08-10T22:24:00.000Z",
  decision_sha256: decision.event_sha256,
  validation_sha256: H(action === "maintained" ? "1" : "2"),
  ...overrides,
});

test("Phase 6 rejected 후에도 직전 accepted decision을 maintain할 수 있다", () => {
  const proposal1 = buildEvidenceEvent([], proposalInput());
  const start1 = buildEvidenceEvent([proposal1], startInput(proposal1));
  const decision1 = buildEvidenceEvent([proposal1, start1], validatedInput(proposal1));
  const proposal2 = buildEvidenceEvent([proposal1, start1, decision1], proposalInput({
    phase: "iterate",
    iteration: 2,
    recorded_at: "2026-08-10T22:23:00.000Z",
  }));
  const start2 = buildEvidenceEvent([proposal1, start1, decision1, proposal2], startInput(proposal2, {
    phase: "iterate",
    iteration: 2,
    recorded_at: "2026-08-10T22:24:00.000Z",
  }));
  const prefix = [proposal1, start1, decision1, proposal2, start2];
  const rejected2 = buildEvidenceEvent(prefix, {
    goal_id: proposal2.goal_id,
    phase: "iterate",
    iteration: 2,
    action: "rejected",
    trigger: proposal2.trigger,
    recorded_at: "2026-08-10T22:25:00.000Z",
    proposal_sha256: proposal2.event_sha256,
    validation_sha256: H("5"),
    lesson_sha256: H("6"),
    residual_risk_sha256: H("7"),
  });
  const maintained = buildEvidenceEvent([...prefix, rejected2], maintenanceInput(decision1, "maintained", {
    iteration: 2,
    recorded_at: "2026-08-10T22:26:00.000Z",
  }));
  assert.equal(maintained.decision_sha256, decision1.event_sha256);
});

test("Phase 6 rejected candidate는 lessons를 남기고 accepted decision을 만들지 않은 채 WIP를 닫는다", () => {
  const proposal1 = buildEvidenceEvent([], proposalInput({ goal_id: "unsafe-candidate" }));
  const start1 = buildEvidenceEvent([proposal1], startInput(proposal1));
  const rejected = buildEvidenceEvent([proposal1, start1], {
    goal_id: proposal1.goal_id,
    phase: proposal1.phase,
    iteration: 1,
    action: "rejected",
    trigger: proposal1.trigger,
    recorded_at: "2026-08-10T22:22:00.000Z",
    proposal_sha256: proposal1.event_sha256,
    validation_sha256: H("5"),
    lesson_sha256: H("6"),
    residual_risk_sha256: H("7"),
  });
  assert.equal(validateEvidenceHistory([proposal1, start1, rejected]).active_wip, 0);
  const proposal2 = buildEvidenceEvent([proposal1, start1, rejected], proposalInput({
    goal_id: proposal1.goal_id,
    phase: "iterate",
    iteration: 2,
    recorded_at: "2026-08-10T22:23:00.000Z",
  }));
  assert.equal(proposal2.iteration, 2);
});

test("Phase 6 cadence는 supersede·maintain·assumption revalidation을 append-only event로 남긴다", () => {
  const proposal1 = buildEvidenceEvent([], proposalInput());
  const start1 = buildEvidenceEvent([proposal1], startInput(proposal1));
  const decision1 = buildEvidenceEvent([proposal1, start1], validatedInput(proposal1));
  const maintained = buildEvidenceEvent(
    [proposal1, start1, decision1],
    maintenanceInput(decision1, "maintained"),
  );
  const revalidated = buildEvidenceEvent(
    [proposal1, start1, decision1, maintained],
    maintenanceInput(decision1, "assumption_revalidated"),
  );
  const history = [proposal1, start1, decision1, maintained, revalidated];

  const proposal2 = buildEvidenceEvent(history, proposalInput({
    phase: "iterate",
    iteration: 2,
    recorded_at: "2026-08-10T22:25:00.000Z",
    before_value: 0.2,
  }));
  const start2 = buildEvidenceEvent([...history, proposal2], startInput(proposal2, {
    phase: "iterate",
    iteration: 2,
    recorded_at: "2026-08-10T22:26:00.000Z",
  }));
  const prefix = [...history, proposal2, start2];
  assert.throws(
    () => buildEvidenceEvent(prefix, validatedInput(proposal2, {
      phase: "iterate",
      iteration: 2,
      recorded_at: "2026-08-10T22:27:00.000Z",
      supersedes_event_sha256: null,
    })),
    /cadence transition invalid/,
  );
  const decision2 = buildEvidenceEvent(prefix, validatedInput(proposal2, {
    phase: "iterate",
    iteration: 2,
    recorded_at: "2026-08-10T22:27:00.000Z",
    supersedes_event_sha256: decision1.event_sha256,
  }));
  const summary = validateEvidenceHistory([...prefix, decision2]);
  assert.equal(summary.action_counts.maintained, 1);
  assert.equal(summary.action_counts.assumption_revalidated, 1);
  assert.equal(summary.active_wip, 0);
});

test("Phase 6 cadence는 human authorization과 global implementation WIP 1개를 강제한다", () => {
  const firstProposal = buildEvidenceEvent([], proposalInput());
  assert.throws(
    () => buildEvidenceEvent([firstProposal], startInput(firstProposal, { authorization_sha256: undefined })),
    /cadence input invalid/,
  );
  assert.throws(
    () => buildEvidenceEvent([firstProposal], startInput(firstProposal, { authorization_sha256: [H("e")] })),
    /cadence input invalid/,
  );
  const firstStart = buildEvidenceEvent([firstProposal], startInput(firstProposal));
  assert.equal(validateEvidenceHistory([firstProposal, firstStart]).active_wip, 1);

  const secondProposal = buildEvidenceEvent(
    [firstProposal, firstStart],
    proposalInput({ goal_id: "backup-recovery", recorded_at: "2026-08-10T22:21:30.000Z" }),
  );
  assert.throws(
    () => buildEvidenceEvent(
      [firstProposal, firstStart, secondProposal],
      startInput(secondProposal, { recorded_at: "2026-08-10T22:21:45.000Z" }),
    ),
    /cadence transition invalid/,
  );

  const firstValidated = buildEvidenceEvent(
    [firstProposal, firstStart, secondProposal],
    validatedInput(firstProposal),
  );
  assert.equal(validateEvidenceHistory([firstProposal, firstStart, secondProposal, firstValidated]).active_wip, 0);
});

test("Phase 6 cadence는 bootstrap 없이 iterate phase로 시작하지 않는다", () => {
  assert.throws(
    () => buildEvidenceEvent([], proposalInput({ phase: "iterate" })),
    /cadence transition invalid/,
  );
});

test("Phase 6 proposal은 malformed evidence envelope를 fail closed한다", () => {
  const invalid = [
    { trigger: undefined },
    { action: ["proposed"] },
    { goal_id: null },
    { goal_id: "private\u0085goal" },
    { phase: "maintain" },
    { iteration: 0 },
    { iteration: 6 },
    { classification: "research_only" },
    { metric_id: "raw/path" },
    { metric_id: null },
    { before_value: Number.NaN },
    { before_value: -0 },
    { sample_size: 0 },
    { hypothesis_sha256: "not-a-hash" },
    { hypothesis_sha256: [H("a")] },
    { recorded_at: "2026-08-10" },
  ];
  for (const overrides of invalid) {
    assert.throws(() => buildEvidenceEvent([], proposalInput(overrides)), /cadence input invalid/);
  }
});

test("Phase 6 proposal은 raw query/content/path field를 원문 비노출로 거부한다", () => {
  const canary = "PRIVATE-NOTE-CANARY";
  assert.throws(
    () => buildEvidenceEvent([], proposalInput({ query_text: canary })),
    (error) => {
      assert.match(error.message, /cadence input invalid/);
      assert.equal(error.message.includes(canary), false);
      return true;
    },
  );
});

test("Phase 6 proposal은 before evidence와 explicit trigger를 canonical hash-chain event로 만든다", () => {
  const event = buildEvidenceEvent([], proposalInput());
  assert.equal(event.schema, "localmind.evidence-cadence.v1");
  assert.equal(event.sequence, 1);
  assert.equal(event.previous_event_sha256, null);
  assert.match(event.event_sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(validateEvidenceHistory([event]), {
    events: 1,
    goals: 1,
    active_wip: 0,
    latest_sequence: 1,
    head_sha256: event.event_sha256,
    action_counts: { proposed: 1 },
  });
});
