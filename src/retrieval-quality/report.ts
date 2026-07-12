/**
 * specs/041 — 평가 보고서 serializer + fingerprint 계산(Evaluation Report Contract).
 *
 * top-level key 순서를 spec.md의 표시 순서와 정확히 일치시키고
 * `JSON.stringify(report, null, 2) + "\n"`의 UTF-8 bytes를 stdout/file 공통 표현으로 쓴다.
 * 이 모듈은 순수 계산(직렬화 + 지문). 검색·git·output I/O는 runner/CLI의 몫이다.
 */
import crypto from "node:crypto";
import type { BrainIndex } from "../brain.js";
import type { Provenance } from "./provenance.js";
import type { ScoreDistribution } from "./metrics.js";
import type { GateResult } from "./gate.js";

export const REPORT_TYPE = "localmind-retrieval-quality" as const;
export const REPORT_SCHEMA_VERSION = 1 as const;

/** 한 질의의 raw hit(반환 순서 보존). sourceId는 EVAL-NNN(canonical), 임시 path 아님. */
export interface QueryRawResult {
  id: string;
  kind: "positive" | "no_match";
  relevantDocIds: string[];
  /** production 반환 순서를 보존한 raw top-5(최대 5). */
  hits: Array<{ sourceId: string; score: number }>;
}

export interface RetrievalQualityQueryResult {
  id: string;
  kind: "positive" | "no_match";
  relevantDocIds: string[];
  hits: Array<{ rank: number; sourceId: string; score: number; relevant: boolean }>;
  outcome: "results_returned" | "no_results";
  topScore: number | null;
  recallAt5: number | null;
  reciprocalRankAt5: number | null;
  uniqueSourceRatioAt5: number;
  relevanceJudgment: "relevant" | "not_relevant";
}

export interface ReportMetrics {
  macroRecallAt5: number;
  mrrAt5: number;
  meanUniqueSourceRatioAt5: number;
  resultReturnRate: number;
  positiveTopScore: ScoreDistribution;
  negativeTopScore: ScoreDistribution;
  rocAuc: number;
}

export interface EmbeddingReport {
  model: string;
  dimensions: number;
  implementation: string;
  contractFingerprint: string;
  mode: "production" | "test_stub";
}

export interface RunReport {
  commit: string;
  workingTreeDirty: boolean;
  evaluationInputsDirty: boolean;
  outputInsideWorktree: boolean;
  baselineEligible: boolean;
  baselineIneligibilityReasons: string[];
  retrievalAlgorithm: string;
  chunkSize: number;
  retrievalLimit: number;
  embedding: EmbeddingReport;
  indexFormatVersion: number;
  fixtureHash: string;
  syntheticIndexFingerprint: string;
  queryResultFingerprint: string;
  executedAt: string;
}

export interface RetrievalQualityReport {
  reportType: typeof REPORT_TYPE;
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  run: RunReport;
  counts: { documents: number; positive: number; noMatch: number };
  metrics: ReportMetrics;
  thresholdCandidate: GateResult["thresholdCandidate"];
  gate: GateResult["gate"];
  queries: RetrievalQualityQueryResult[];
}

const NUL = Buffer.from([0]);

function sha256Hex(...parts: Buffer[]): string {
  const h = crypto.createHash("sha256");
  for (const p of parts) h.update(p);
  return h.digest("hex");
}

// ── contractFingerprint ─────────────────────────────────────────────────────
/**
 * `mode + NUL + implementation + NUL + model + NUL + dimensions(10진수)`의 SHA-256.
 * endpoint/key는 절대 넣지 않는다(spec.md).
 */
export function computeContractFingerprint(input: {
  mode: string;
  implementation: string;
  model: string;
  dimensions: number;
}): string {
  const payload = Buffer.from(
    `${input.mode}\0${input.implementation}\0${input.model}\0${input.dimensions}`,
    "utf8",
  );
  return `sha256:${sha256Hex(payload)}`;
}

// ── syntheticIndexFingerprint ────────────────────────────────────────────────
/**
 * reload된 임시 index를 insertion order로 순회해 각 chunk를
 * `{sourceId, chunkOrdinal, textSha256, vectorFloat32LeSha256}`로 정규화한 canonical JSON
 * bytes(key=표시 순서, array=insertion, whitespace 없음, UTF-8)의 SHA-256.
 * chunkOrdinal은 source별 0-based, 두 digest는 prefix 없는 lowercase hex, vector는 Float32LE.
 * 임시 절대경로·mtime·sidecar filename은 입력이 아니다(spec.md).
 *
 * @param index reload된 BrainIndex(hydrate된 벡터 보유).
 * @param pathToSourceId production hit path(= chunk.path)를 EVAL-NNN으로 바꾸는 맵.
 */
export function computeSyntheticIndexFingerprint(
  index: BrainIndex,
  pathToSourceId: (chunkPath: string) => string,
): string {
  const ordinalBySource = new Map<string, number>();
  const parts: string[] = [];
  // BrainIndex.files는 insertion order를 보존한 객체다(prepareDeterministicIndex의 serial 순서).
  for (const fe of Object.values(index.files)) {
    for (const c of fe.chunks) {
      const sourceId = pathToSourceId(c.path);
      const ordinal = ordinalBySource.get(sourceId) ?? 0;
      ordinalBySource.set(sourceId, ordinal + 1);
      const textSha256 = crypto.createHash("sha256").update(Buffer.from(c.text, "utf8")).digest("hex");
      const vecBuf = Buffer.alloc(c.vector.length * 4);
      for (let j = 0; j < c.vector.length; j++) vecBuf.writeFloatLE(c.vector[j], j * 4);
      const vectorFloat32LeSha256 = crypto.createHash("sha256").update(vecBuf).digest("hex");
      // canonical JSON: key는 표시 순서, whitespace 없음. 값은 JSON.stringify로 이스케이프.
      parts.push(
        `{"sourceId":${JSON.stringify(sourceId)},` +
          `"chunkOrdinal":${ordinal},` +
          `"textSha256":${JSON.stringify(textSha256)},` +
          `"vectorFloat32LeSha256":${JSON.stringify(vectorFloat32LeSha256)}}`,
      );
    }
  }
  const canonical = Buffer.from(`[${parts.join(",")}]`, "utf8");
  return `sha256:${sha256Hex(canonical)}`;
}

// ── queryResultFingerprint ───────────────────────────────────────────────────
/**
 * query ID 오름차순으로 `id + NUL + outcome + NUL`을 넣고, 각 raw top-5 hit를 반환 순서대로
 * `rank(10진수) + NUL + sourceId + NUL + score(IEEE-754 Float64LE 8bytes) + NUL`로 넣은 SHA-256.
 * 결과 없는 query도 id/outcome을 넣는다(spec.md). query 원문·임시 path는 입력이 아니다.
 */
export function computeQueryResultFingerprint(rawResults: readonly QueryRawResult[]): string {
  const sorted = [...rawResults].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const h = crypto.createHash("sha256");
  for (const q of sorted) {
    const outcome = q.hits.length > 0 ? "results_returned" : "no_results";
    h.update(Buffer.from(q.id, "utf8"));
    h.update(NUL);
    h.update(Buffer.from(outcome, "utf8"));
    h.update(NUL);
    for (let i = 0; i < q.hits.length; i++) {
      const hit = q.hits[i];
      const rank = i + 1;
      h.update(Buffer.from(String(rank), "utf8"));
      h.update(NUL);
      h.update(Buffer.from(hit.sourceId, "utf8"));
      h.update(NUL);
      const scoreBuf = Buffer.alloc(8);
      scoreBuf.writeDoubleLE(hit.score, 0);
      h.update(scoreBuf);
      h.update(NUL);
    }
  }
  return `sha256:${h.digest("hex")}`;
}

/**
 * report 객체를 spec.md의 top-level key 순서로 재조립한다. serializer는 이 순서를 보장한다
 * (JS 객체 리터럴 삽입 순서 = JSON.stringify 출력 순서). CLI/runner가 만든 report를 넣어도
 * 순서를 강제하고 싶으면 이 함수로 통과시킨다.
 */
export function orderReport(r: RetrievalQualityReport): RetrievalQualityReport {
  return {
    reportType: r.reportType,
    schemaVersion: r.schemaVersion,
    run: {
      commit: r.run.commit,
      workingTreeDirty: r.run.workingTreeDirty,
      evaluationInputsDirty: r.run.evaluationInputsDirty,
      outputInsideWorktree: r.run.outputInsideWorktree,
      baselineEligible: r.run.baselineEligible,
      baselineIneligibilityReasons: r.run.baselineIneligibilityReasons,
      retrievalAlgorithm: r.run.retrievalAlgorithm,
      chunkSize: r.run.chunkSize,
      retrievalLimit: r.run.retrievalLimit,
      embedding: {
        model: r.run.embedding.model,
        dimensions: r.run.embedding.dimensions,
        implementation: r.run.embedding.implementation,
        contractFingerprint: r.run.embedding.contractFingerprint,
        mode: r.run.embedding.mode,
      },
      indexFormatVersion: r.run.indexFormatVersion,
      fixtureHash: r.run.fixtureHash,
      syntheticIndexFingerprint: r.run.syntheticIndexFingerprint,
      queryResultFingerprint: r.run.queryResultFingerprint,
      executedAt: r.run.executedAt,
    },
    counts: { documents: r.counts.documents, positive: r.counts.positive, noMatch: r.counts.noMatch },
    metrics: {
      macroRecallAt5: r.metrics.macroRecallAt5,
      mrrAt5: r.metrics.mrrAt5,
      meanUniqueSourceRatioAt5: r.metrics.meanUniqueSourceRatioAt5,
      resultReturnRate: r.metrics.resultReturnRate,
      positiveTopScore: r.metrics.positiveTopScore,
      negativeTopScore: r.metrics.negativeTopScore,
      rocAuc: r.metrics.rocAuc,
    },
    thresholdCandidate: r.thresholdCandidate,
    gate: r.gate,
    queries: r.queries.map((q) => ({
      id: q.id,
      kind: q.kind,
      relevantDocIds: q.relevantDocIds,
      hits: q.hits.map((h) => ({ rank: h.rank, sourceId: h.sourceId, score: h.score, relevant: h.relevant })),
      outcome: q.outcome,
      topScore: q.topScore,
      recallAt5: q.recallAt5,
      reciprocalRankAt5: q.reciprocalRankAt5,
      uniqueSourceRatioAt5: q.uniqueSourceRatioAt5,
      relevanceJudgment: q.relevanceJudgment,
    })),
  };
}

/** report 객체 → 공통 표현 bytes(`JSON.stringify(report, null, 2) + "\n"` UTF-8). */
export function serializeReport(report: RetrievalQualityReport): Buffer {
  return Buffer.from(JSON.stringify(orderReport(report), null, 2) + "\n", "utf8");
}
