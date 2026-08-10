import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { aggregateMetrics, loadCorpus } from "./retrieval-quality/evaluator.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = path.join(REPO, "fixtures", "retrieval-quality", "public-synthetic-v1");

function evaluate(root: string, baseline = path.join(FIXTURE, "baseline.json")) {
  const report = path.join(root, "report.json");
  const manifest = path.join(root, "manifest.json");
  const result = spawnSync(process.execPath, [
    "--import", "tsx/esm", "scripts/evaluate-retrieval.ts",
    "--corpus", path.join(FIXTURE, "corpus.json"),
    "--baseline", baseline,
    "--report", report,
    "--manifest", manifest,
  ], { cwd: REPO, encoding: "utf8", timeout: 30_000 });
  return { result, report, manifest };
}

test("Phase 3 공개 corpus는 production retrieval에서 machine-readable baseline을 통과한다", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-rq-gate-"));
  try {
    const { result, report, manifest } = evaluate(root);
    assert.equal(result.status, 0, `${result.stdout}
${result.stderr}`);
    const parsed = JSON.parse(fs.readFileSync(report, "utf8"));
    assert.equal(parsed.schema, "localmind.retrieval-report.v1");
    assert.equal(parsed.passed, true);
    assert.deepEqual(parsed.metrics, {
      positiveQueries: 4,
      noMatchQueries: 1,
      hitAtK: 1,
      mrrAtK: 1,
      relevantRecallAtK: 1,
      expectedDocumentCoverage: 1,
      noMatchFalsePositiveRate: 1,
    });
    assert.deepEqual(parsed.drain, { attempted: 5, succeeded: 5, failed: 0 });
    assert.equal(parsed.timing.queryCount, 5);
    assert.ok(Number.isFinite(parsed.timing.totalMs) && parsed.timing.totalMs >= 0);
    assert.ok(Number.isFinite(parsed.timing.p50Ms) && parsed.timing.p50Ms >= 0);
    assert.ok(Number.isFinite(parsed.timing.p95Ms) && parsed.timing.p95Ms >= 0);
    assert.equal(parsed.timing.gated, false);
    assert.equal(parsed.results.length, 5);
    assert.ok(parsed.results.every((row: { returned: unknown[] }) => row.returned.length <= 5));
    const provenance = JSON.parse(fs.readFileSync(manifest, "utf8"));
    assert.equal(provenance.schema, "localmind.retrieval-artifact.v1");
    assert.equal(provenance.corpus.id, "public-synthetic-v1");
    assert.match(provenance.corpus.sha256, /^[0-9a-f]{64}$/);
    assert.equal(provenance.documents.length, 5);
    assert.equal(provenance.report.sha256.length, 64);
    assert.doesNotMatch(JSON.stringify(provenance), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Phase 3 gate는 현재보다 엄격한 no-match baseline을 조용히 통과시키지 않는다", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-rq-regression-"));
  try {
    const baseline = JSON.parse(fs.readFileSync(path.join(FIXTURE, "baseline.json"), "utf8"));
    baseline.maximum.noMatchFalsePositiveRate = 0;
    const strict = path.join(root, "strict-baseline.json");
    fs.writeFileSync(strict, JSON.stringify(baseline));
    const { result, report } = evaluate(root, strict);
    assert.equal(result.status, 1, `${result.stdout}
${result.stderr}`);
    const parsed = JSON.parse(fs.readFileSync(report, "utf8"));
    assert.equal(parsed.passed, false);
    assert.ok(parsed.violations.some((value: string) => value.includes("noMatchFalsePositiveRate")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("relevant 문서의 여러 chunk는 recall에서 문서 한 건으로 계산한다", () => {
  const corpus = loadCorpus(path.join(FIXTURE, "corpus.json"));
  const rows = corpus.queries.map((query) => ({
    queryId: query.id,
    relevant: query.relevant,
    returnedDocumentIds: query.relevant.length > 0 ? [query.relevant[0], query.relevant[0]] : [],
  }));
  const metrics = aggregateMetrics(corpus, rows);
  assert.equal(metrics.relevantRecallAtK, 1);
  assert.equal(metrics.expectedDocumentCoverage, 1);
});

test("같은 corpus와 baseline은 실행 위치와 무관하게 동일한 artifact bytes를 만든다", () => {
  const first = fs.mkdtempSync(path.join(os.tmpdir(), "lm-rq-repeat-a-"));
  const second = fs.mkdtempSync(path.join(os.tmpdir(), "lm-rq-repeat-b-"));
  try {
    const left = evaluate(first);
    const right = evaluate(second);
    assert.equal(left.result.status, 0, left.result.stderr);
    assert.equal(right.result.status, 0, right.result.stderr);
    const leftReport = JSON.parse(fs.readFileSync(left.report, "utf8"));
    const rightReport = JSON.parse(fs.readFileSync(right.report, "utf8"));
    delete leftReport.timing;
    delete rightReport.timing;
    assert.deepEqual(leftReport, rightReport);
    const leftManifest = JSON.parse(fs.readFileSync(left.manifest, "utf8"));
    const rightManifest = JSON.parse(fs.readFileSync(right.manifest, "utf8"));
    delete leftManifest.report;
    delete rightManifest.report;
    assert.deepEqual(leftManifest, rightManifest);
  } finally {
    fs.rmSync(first, { recursive: true, force: true });
    fs.rmSync(second, { recursive: true, force: true });
  }
});

test("corpus document path traversal은 indexing 전에 거부한다", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-rq-traversal-"));
  try {
    fs.writeFileSync(path.join(root, "outside.md"), "외부 문서");
    const corpus = JSON.parse(fs.readFileSync(path.join(FIXTURE, "corpus.json"), "utf8"));
    corpus.documents[0].path = "../outside.md";
    const candidate = path.join(root, "corpus.json");
    fs.writeFileSync(candidate, JSON.stringify(corpus));
    assert.throws(() => loadCorpus(candidate), /traversal|밖/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("metric row의 query·relevance·returned document는 corpus 정본과 결속된다", () => {
  const corpus = loadCorpus(path.join(FIXTURE, "corpus.json"));
  const rows = corpus.queries.map((query) => ({
    queryId: query.id,
    relevant: query.relevant,
    returnedDocumentIds: query.relevant.length > 0 ? [query.relevant[0]] : [],
  }));
  const forged = rows.map((row, index) => index === 0 ? { ...row, relevant: [] } : row);
  assert.throws(() => aggregateMetrics(corpus, forged), /relevance|정본/);
  const unknown = rows.map((row, index) => index === 0 ? { ...row, returnedDocumentIds: ["unknown-document"] } : row);
  assert.throws(() => aggregateMetrics(corpus, unknown), /returned|document/);
});
