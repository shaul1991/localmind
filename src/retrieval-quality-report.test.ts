/**
 * specs/041 AC-009 — 재현 가능한 보고서(serializer + provenance + fingerprints).
 *
 * env(EMBEDDINGS_URL/HOME/NOTES_DIR/BRAIN_INDEX/QUERY_LOG/BRAIN_CHUNK_SIZE)를 brain import
 * 전에 설정한다. node --test는 파일당 별도 프로세스라 상단 설정이 격리된다.
 *
 * 검증 근거(AC-009): 고정 clock/embedding stub로 두 번 생성한 payload(executedAt 제외) 동일,
 * provenance flags·fixtureHash·순위지표·threshold·gate·fingerprints 포함, test_stub은 baseline
 * ineligible, evaluation-input dirty면 evaluationInputsDirty·baselineEligible:false, 범위 밖 변경만이면
 * workingTreeDirty:true여도 eligible.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { startEmbeddingServer, makeTempEnv, type EmbeddingServer, type TempEnv } from "./retrieval-quality/testkit.js";

let server: EmbeddingServer;
let env: TempEnv;

before(async () => {
  env = makeTempEnv("lm-rq-report-");
  server = await startEmbeddingServer(16);
  process.env.HOME = env.home;
  process.env.NOTES_DIR = env.notesDir;
  process.env.BRAIN_INDEX = env.indexPath;
  process.env.QUERY_LOG = env.queryLog;
  process.env.EMBEDDINGS_URL = server.url;
  process.env.EMBEDDINGS_KEY = "test";
  process.env.EMBED_RETRIES = "1";
  process.env.EMBED_TIMEOUT_MS = "3000";
  process.env.BRAIN_CHUNK_SIZE = "400";
});

after(async () => {
  await server.close();
  env.cleanup();
});

const FIXED_CLOCK = new Date("2026-01-02T03:04:05.000Z");

async function runOnce() {
  const { runEvaluation } = await import("./retrieval-quality/runner.js");
  // 각 실행 사이 임시 색인·사이드카·로그를 정리해 clean 상태에서 다시 만든다.
  for (const f of fs.readdirSync(env.notesDir)) fs.rmSync(path.join(env.notesDir, f), { recursive: true, force: true });
  fs.rmSync(env.queryLog, { force: true });
  return runEvaluation({ mode: "test_stub", now: FIXED_CLOCK });
}

test("두 번 실행한 payload(executedAt 제외)가 동일하다", async () => {
  const a = await runOnce();
  const b = await runOnce();
  // executedAt만 제외하고 나머지 payload를 비교.
  const strip = (r: Awaited<ReturnType<typeof runOnce>>) => {
    const clone = JSON.parse(JSON.stringify(r));
    clone.run.executedAt = "<fixed>";
    return clone;
  };
  assert.deepEqual(strip(a), strip(b));
  // 고정 clock을 넣었으므로 executedAt도 동일해야 한다.
  assert.equal(a.run.executedAt, FIXED_CLOCK.toISOString());
  assert.equal(b.run.executedAt, FIXED_CLOCK.toISOString());
});

test("report가 계약 필드를 모두 포함한다(fixtureHash·지표·gate·fingerprints)", async () => {
  const r = await runOnce();
  assert.equal(r.reportType, "localmind-retrieval-quality");
  assert.equal(r.schemaVersion, 1);
  assert.equal(r.run.chunkSize, 400);
  assert.equal(r.run.retrievalLimit, 5);
  assert.equal(r.run.retrievalAlgorithm, "cosine-full-scan-v1");
  assert.equal(r.run.indexFormatVersion, 5);
  assert.equal(r.run.embedding.implementation, "openai-compatible-http-embeddings-v1");
  assert.equal(r.run.embedding.dimensions, 16);
  assert.match(r.run.embedding.contractFingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.match(r.run.fixtureHash, /^[0-9a-f]{64}$/);
  assert.match(r.run.syntheticIndexFingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.match(r.run.queryResultFingerprint, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(r.counts, { documents: 12, positive: 24, noMatch: 16 });
  assert.equal(r.queries.length, 40);
  assert.equal(typeof r.metrics.macroRecallAt5, "number");
  assert.equal(typeof r.metrics.rocAuc, "number");
  assert.ok(["pass", "fail"].includes(r.gate.status));
  // no_match query의 recall/RR는 null.
  const noMatch = r.queries.find((q) => q.kind === "no_match")!;
  assert.equal(noMatch.recallAt5, null);
  assert.equal(noMatch.reciprocalRankAt5, null);
  assert.equal(noMatch.relevanceJudgment, "not_relevant");
});

test("test_stub 실행은 baseline ineligible(test_embedding_stub 사유 포함)", async () => {
  const r = await runOnce();
  assert.equal(r.run.embedding.mode, "test_stub");
  assert.equal(r.run.baselineEligible, false);
  assert.ok(r.run.baselineIneligibilityReasons.includes("test_embedding_stub"));
});

test("serializer 출력은 JSON.stringify(report,null,2)+'\\n'과 동일 bytes", async () => {
  const r = await runOnce();
  const { serializeReport, orderReport } = await import("./retrieval-quality/report.js");
  const bytes = serializeReport(r);
  const expected = JSON.stringify(orderReport(r), null, 2) + "\n";
  assert.equal(bytes.toString("utf8"), expected);
  assert.ok(bytes.toString("utf8").endsWith("}\n"));
});

// provenance는 격리된 임시 git 저장소로 dirty/clean과 pathspec 범위를 결정적으로 검증한다.
test("provenance: evaluation-input dirty면 evaluationInputsDirty·baselineEligible:false", async () => {
  const { captureProvenance } = await import("./retrieval-quality/provenance.js");
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "lm-rq-git-"));
  try {
    const g = (args: string[]) => execFileSync("git", args, { cwd: repo, stdio: ["ignore", "ignore", "ignore"] });
    g(["init"]);
    g(["config", "user.email", "t@t"]);
    g(["config", "user.name", "t"]);
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    fs.writeFileSync(path.join(repo, "src", "a.ts"), "export const a = 1;\n");
    fs.writeFileSync(path.join(repo, "README.md"), "readme\n");
    g(["add", "-A"]);
    g(["commit", "-m", "init"]);

    // clean 상태.
    const clean = captureProvenance({ embeddingMode: "production", repoRoot: repo });
    assert.equal(clean.workingTreeDirty, false);
    assert.equal(clean.evaluationInputsDirty, false);
    assert.equal(clean.baselineEligible, true);
    assert.deepEqual(clean.baselineIneligibilityReasons, []);

    // evaluation-input(src/) 변경 → evaluationInputsDirty + baselineEligible:false.
    fs.writeFileSync(path.join(repo, "src", "a.ts"), "export const a = 2;\n");
    const dirtyInput = captureProvenance({ embeddingMode: "production", repoRoot: repo });
    assert.equal(dirtyInput.workingTreeDirty, true);
    assert.equal(dirtyInput.evaluationInputsDirty, true);
    assert.equal(dirtyInput.baselineEligible, false);
    assert.deepEqual(dirtyInput.baselineIneligibilityReasons, ["evaluation_inputs_dirty"]);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("provenance: 범위 밖 변경만이면 workingTreeDirty:true여도 eligible", async () => {
  const { captureProvenance } = await import("./retrieval-quality/provenance.js");
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "lm-rq-git2-"));
  try {
    const g = (args: string[]) => execFileSync("git", args, { cwd: repo, stdio: ["ignore", "ignore", "ignore"] });
    g(["init"]);
    g(["config", "user.email", "t@t"]);
    g(["config", "user.name", "t"]);
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    fs.writeFileSync(path.join(repo, "src", "a.ts"), "export const a = 1;\n");
    fs.writeFileSync(path.join(repo, "Makefile"), "all:\n");
    g(["add", "-A"]);
    g(["commit", "-m", "init"]);

    // 범위 밖(Makefile) 변경만.
    fs.writeFileSync(path.join(repo, "Makefile"), "all:\n\techo hi\n");
    const p = captureProvenance({ embeddingMode: "production", repoRoot: repo });
    assert.equal(p.workingTreeDirty, true); // 전체 status는 dirty
    assert.equal(p.evaluationInputsDirty, false); // pathspec 밖이라 clean
    assert.equal(p.baselineEligible, true); // 기준선을 막지 않음
    assert.deepEqual(p.baselineIneligibilityReasons, []);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test("provenance: output이 worktree 내부면 outputInsideWorktree·baselineEligible:false", async () => {
  const { captureProvenance } = await import("./retrieval-quality/provenance.js");
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "lm-rq-git3-"));
  try {
    const g = (args: string[]) => execFileSync("git", args, { cwd: repo, stdio: ["ignore", "ignore", "ignore"] });
    g(["init"]);
    g(["config", "user.email", "t@t"]);
    g(["config", "user.name", "t"]);
    fs.writeFileSync(path.join(repo, "seed.txt"), "x\n");
    g(["add", "-A"]);
    g(["commit", "-m", "init"]);

    const inside = captureProvenance({
      embeddingMode: "production",
      outputPath: path.join(repo, "report.json"),
      repoRoot: repo,
    });
    assert.equal(inside.outputInsideWorktree, true);
    assert.equal(inside.baselineEligible, false);
    assert.ok(inside.baselineIneligibilityReasons.includes("output_inside_worktree"));

    // worktree 밖 output은 eligible.
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-rq-out-"));
    try {
      const outside = captureProvenance({
        embeddingMode: "production",
        outputPath: path.join(outsideDir, "report.json"),
        repoRoot: repo,
      });
      assert.equal(outside.outputInsideWorktree, false);
      assert.equal(outside.baselineEligible, true);
    } finally {
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});
