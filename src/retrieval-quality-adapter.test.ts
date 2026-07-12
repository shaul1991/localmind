/**
 * specs/041 AC-010 — 격리된 production-entry 평가(access guard + 결정성 + 격리).
 *
 * 검증 근거(AC-010): 서로 다른 두 temp root의 격리 자식 프로세스가 production searchNotes entry로
 * 40질의를 각각 평가한다. 각 자식은 brain import 전에 guard self-test(forbidden stat/read/write
 * 차단·기록, allow temp 통과, reset)를 수행한다. 두 실행의 hit 순서·순위지표·fingerprint·threshold·
 * gate가 동일하고, forbidden FS 접근 0건, coverage oracle gap 0건, 임시 JSONL 질의당 1행 not_judged,
 * report-only relevance, 성공 경로 뒤 임시 index/sidecar/query-log 제거를 검증한다.
 *
 * 자식은 별도 프로세스라 부모가 stub 서버를 띄우고 async spawn으로 실행한다(spawnSync는 부모
 * 이벤트 루프를 막아 in-parent stub이 응답 못 함).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startEmbeddingServer, type EmbeddingServer } from "./retrieval-quality/testkit.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const CHILD = path.join(HERE, "retrieval-quality", "isolated-eval-child.ts");

let server: EmbeddingServer;

before(async () => {
  server = await startEmbeddingServer(16);
});
after(async () => {
  await server.close();
});

interface ChildOut {
  selfTest: {
    ok: boolean;
    blockedForbidden: { stat: boolean; read: boolean; write: boolean };
    allowedTemp: boolean;
    details: string[];
  };
  forbiddenAccesses: { method: string; target: string; surface: string }[];
  coverageGaps: string[];
  observedMethods: string[];
  report: {
    queries: { id: string; hits: { rank: number; sourceId: string; score: number }[]; relevanceJudgment: string }[];
    metrics: Record<string, unknown>;
    thresholdCandidate: unknown;
    gate: { status: string; reasons: string[] };
    run: {
      retrievalAlgorithm: string;
      indexFormatVersion: number;
      embedding: { model: string };
      queryResultFingerprint: string;
      syntheticIndexFingerprint: string;
    };
  };
  jsonl: { tool: string; relevanceJudgment: string }[];
}

function runChild(root: string, forbidden: string): Promise<{ out: ChildOut; rootExisted: boolean }> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsx", CHILD, "--emb-url", server.url, "--root", root, "--forbidden", forbidden], {
      cwd: REPO,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d: string) => (stdout += d));
    child.stderr.on("data", (d: string) => (stderr += d));
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`child exit ${code}: ${stderr}`));
      try {
        resolve({ out: JSON.parse(stdout) as ChildOut, rootExisted: fs.existsSync(root) });
      } catch (e) {
        reject(new Error(`child stdout parse 실패: ${(e as Error).message}\n${stdout.slice(0, 300)}`));
      }
    });
  });
}

test("격리 자식 2회(서로 다른 temp root): guard·결정성·격리·cleanup", async () => {
  const rootA = fs.mkdtempSync(path.join(os.tmpdir(), "lm-rq-rootA-"));
  const rootB = fs.mkdtempSync(path.join(os.tmpdir(), "lm-rq-rootB-"));
  const forbidden = fs.mkdtempSync(path.join(os.tmpdir(), "lm-rq-forbidden-"));
  try {
    const a = (await runChild(rootA, forbidden)).out;
    const b = (await runChild(rootB, forbidden)).out;

    // (1) guard self-test — forbidden stat/read/write 각각 차단·기록, allow temp 통과.
    for (const [name, out] of [
      ["A", a],
      ["B", b],
    ] as const) {
      assert.equal(out.selfTest.ok, true, `${name} selfTest.ok (${out.selfTest.details.join("; ")})`);
      assert.deepEqual(out.selfTest.blockedForbidden, { stat: true, read: true, write: true }, `${name} blocked`);
      assert.equal(out.selfTest.allowedTemp, true, `${name} allowedTemp`);
      // (2) 실제 평가 중 forbidden FS 접근 0건.
      assert.deepEqual(out.forbiddenAccesses, [], `${name} forbiddenAccesses`);
      // (3) coverage oracle — production이 부른 path-taking method가 registry에 다 있다.
      assert.deepEqual(out.coverageGaps, [], `${name} coverageGaps`);
      // guard가 실제로 무언가를 가로챘다(빈 관측이면 self-test가 무의미).
      assert.ok(out.observedMethods.length > 0, `${name} observedMethods 비어있지 않음`);
      // (4) 40질의 결과 + 질의당 1행 not_judged.
      assert.equal(out.report.queries.length, 40, `${name} query 수`);
      assert.equal(out.jsonl.length, 40, `${name} jsonl 행 수`);
      assert.ok(out.jsonl.every((r) => r.relevanceJudgment === "not_judged"), `${name} 모두 not_judged`);
      assert.equal(out.report.run.retrievalAlgorithm, "cosine-full-scan-v1", `${name} 알고리즘 ID`);
      assert.equal(out.report.run.indexFormatVersion, 5, `${name} v5`);
      assert.equal(out.report.run.embedding.model, "text-embedding-3-small", `${name} embedding model`);
    }

    // (5) report-only relevance — 보고서 query에는 relevanceJudgment가 있지만 JSONL은 항상 not_judged.
    assert.ok(a.report.queries.some((q) => q.relevanceJudgment === "relevant" || q.relevanceJudgment === "not_relevant"));

    // (6) 두 실행의 hit 순서·순위지표·fingerprint·threshold·gate 동일.
    assert.equal(a.report.run.queryResultFingerprint, b.report.run.queryResultFingerprint, "queryResultFingerprint");
    assert.equal(a.report.run.syntheticIndexFingerprint, b.report.run.syntheticIndexFingerprint, "syntheticIndexFingerprint");
    assert.deepEqual(a.report.metrics, b.report.metrics, "metrics");
    assert.deepEqual(a.report.thresholdCandidate, b.report.thresholdCandidate, "thresholdCandidate");
    assert.deepEqual(a.report.gate, b.report.gate, "gate");
    // hit 순서(sourceId 시퀀스)까지 동일.
    const seq = (out: ChildOut) =>
      out.report.queries.map((q) => `${q.id}:${q.hits.map((h) => `${h.rank}/${h.sourceId}/${h.score}`).join(",")}`).join("|");
    assert.equal(seq(a), seq(b), "hit 순서·점수 시퀀스");

    // (7) 성공 경로 뒤 임시 index/sidecar/query-log 제거(finally). notesDir 안에 잔존 색인 산출물 없음.
    for (const root of [rootA, rootB]) {
      const notesDir = path.join(root, "notes");
      const leftovers = fs.existsSync(notesDir)
        ? fs.readdirSync(notesDir).filter((n) => n.startsWith(".brain-index") || n.includes(".vec-"))
        : [];
      assert.deepEqual(leftovers, [], `${root} 잔존 색인 산출물 없음`);
      assert.equal(fs.existsSync(path.join(root, "query-log.jsonl")), false, `${root} query-log 제거됨`);
    }
  } finally {
    for (const d of [rootA, rootB, forbidden]) fs.rmSync(d, { recursive: true, force: true });
  }
});
