#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
  aggregateMetrics,
  atomicWriteJson,
  baselineViolations,
  loadBaseline,
  loadCorpus,
  sha256,
  syntheticTopicEmbedding,
  type RankedResult,
} from "../src/retrieval-quality/evaluator.js";
import { makeTempEnv, startEmbeddingServer } from "../src/retrieval-quality/testkit.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIMS = 6;

type CliArgs = Readonly<{ corpus: string; baseline: string; report: string; manifest: string }>;

function parseArgs(argv: readonly string[]): CliArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || value === undefined || value.startsWith("--")) throw new Error("인자는 --corpus/--baseline/--report/--manifest 값 쌍이어야 합니다.");
    if (!new Set(["--corpus", "--baseline", "--report", "--manifest"]).has(flag) || values.has(flag)) throw new Error(`지원하지 않거나 중복된 인자: ${flag}`);
    values.set(flag, value);
  }
  for (const flag of ["--corpus", "--baseline", "--report", "--manifest"]) {
    if (!values.has(flag)) throw new Error(`필수 인자 누락: ${flag}`);
  }
  const report = path.resolve(values.get("--report")!);
  const manifest = path.resolve(values.get("--manifest")!);
  if (report === manifest) throw new Error("report와 manifest 경로는 달라야 합니다.");
  return {
    corpus: path.resolve(values.get("--corpus")!),
    baseline: path.resolve(values.get("--baseline")!),
    report,
    manifest,
  };
}

function sourceHashes(): Array<{ path: string; sha256: string }> {
  const paths = [
    "scripts/evaluate-retrieval.ts",
    "src/retrieval-quality/evaluator.ts",
    "src/retrieval-quality/testkit.ts",
    "src/brain.ts",
  ];
  return paths.map((relative) => ({ path: relative, sha256: sha256(fs.readFileSync(path.join(REPO, relative))) }));
}

async function run(args: CliArgs): Promise<number> {
  // Validator를 network/server보다 먼저 실행해 malformed corpus가 외부 경계를 넘지 않게 한다.
  const corpus = loadCorpus(args.corpus);
  const baseline = loadBaseline(args.baseline, corpus);
  const temp = makeTempEnv("lm-rq-phase3-");
  let server: Awaited<ReturnType<typeof startEmbeddingServer>> | null = null;
  try {
    const targetBySource = new Map<string, string>();
    const fixturePaths: string[] = [];
    for (const document of corpus.documents) {
      const destination = path.join(temp.notesDir, document.path);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, document.bytes, { flag: "wx" });
      fixturePaths.push(destination);
      targetBySource.set(`synthetic/${document.path}`, document.id);
    }

    server = await startEmbeddingServer(DIMS, syntheticTopicEmbedding);
    Object.assign(process.env, {
      HOME: temp.home,
      NOTES_DIR: `synthetic=${temp.notesDir}`,
      BRAIN_INDEX: temp.indexPath,
      QUERY_LOG: temp.queryLog,
      EMBEDDINGS_URL: server.url,
      EMBEDDINGS_MODEL: "public-synthetic-topic-v1",
      EMBEDDINGS_KEY: "fixture-only",
      EMBED_RETRIES: "1",
      LOCALMIND_DEPLOYMENT_ID: "phase3-retrieval-evaluation",
    });

    const brain = await import("../src/brain.js");
    await brain.retrievalEvaluationPort.prepareDeterministicIndex(fixturePaths.sort((left, right) => left.localeCompare(right)));
    const ranked: RankedResult[] = [];
    const results: Array<Record<string, unknown>> = [];
    const durationsMs: number[] = [];
    for (const query of corpus.queries) {
      const started = performance.now();
      const hits = await brain.retrievalEvaluationPort.searchNotes(query.text, corpus.k);
      durationsMs.push(performance.now() - started);
      const returned = hits.map((hit, index) => {
        const documentId = targetBySource.get(hit.path);
        if (!documentId) throw new Error(`검색 결과가 corpus 밖 source를 반환했습니다: ${hit.path}`);
        return { rank: index + 1, documentId, source: hit.path, score: hit.score };
      });
      ranked.push({ queryId: query.id, relevant: query.relevant, returnedDocumentIds: returned.map((hit) => hit.documentId) });
      results.push({ queryId: query.id, relevant: query.relevant, returned });
    }
    const drain = await brain.retrievalEvaluationPort.drainQueryEvents();
    if (drain.attempted !== corpus.queries.length || drain.succeeded !== corpus.queries.length || drain.failed !== 0) {
      throw new Error(`query event drain 불일치: ${JSON.stringify(drain)}`);
    }
    const runtime = await brain.retrievalEvaluationPort.readRuntimeSnapshot(5);
    const metrics = aggregateMetrics(corpus, ranked);
    const violations = baselineViolations(metrics, baseline);
    const sortedDurations = [...durationsMs].sort((left, right) => left - right);
    const percentile = (fraction: number): number => sortedDurations[Math.max(0, Math.ceil(sortedDurations.length * fraction) - 1)];
    const roundMs = (value: number): number => Math.round(value * 1000) / 1000;
    const timing = {
      queryCount: durationsMs.length,
      totalMs: roundMs(durationsMs.reduce((sum, value) => sum + value, 0)),
      p50Ms: roundMs(percentile(0.5)),
      p95Ms: roundMs(percentile(0.95)),
      gated: false,
    };
    const report = {
      schema: "localmind.retrieval-report.v1",
      corpus: { id: corpus.id, sha256: corpus.sha256, license: corpus.license, k: corpus.k },
      runtime,
      metrics,
      baseline: {
        sha256: baseline.sha256,
        minimum: baseline.minimum,
        maximum: baseline.maximum,
      },
      timing,
      drain,
      embeddingRequests: server.requests,
      results,
      violations,
      passed: violations.length === 0,
    };
    atomicWriteJson(args.report, report);
    const reportBytes = fs.readFileSync(args.report);
    const manifest = {
      schema: "localmind.retrieval-artifact.v1",
      corpus: { id: corpus.id, sha256: corpus.sha256, license: corpus.license, k: corpus.k },
      baseline: { sha256: baseline.sha256 },
      documents: corpus.documents.map((document) => ({ id: document.id, path: document.path, sha256: document.sha256, size: document.bytes.length })),
      sources: sourceHashes(),
      runtime,
      report: { sha256: sha256(reportBytes), size: reportBytes.length },
    };
    atomicWriteJson(args.manifest, manifest);
    process.stdout.write(`${JSON.stringify({ passed: report.passed, metrics, violations })}\n`);
    return report.passed ? 0 : 1;
  } finally {
    try { await server?.close(); } finally { temp.cleanup(); }
  }
}

try {
  const args = parseArgs(process.argv.slice(2));
  process.exitCode = await run(args);
} catch (error) {
  const message = error instanceof Error ? error.message : "unknown evaluation error";
  process.stderr.write(`[localmind-retrieval-eval] ${message}\n`);
  process.exitCode = 2;
}
