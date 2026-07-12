/**
 * specs/041 — 평가 오케스트레이션(FR-002). fixture 검증 → provenance 캡처 → 결정적 임시 색인
 * 준비 → v5 순서 단언 → runtime snapshot → 40질의 검색(순서 보존) → drain 검증 →
 * metrics/gate/fingerprints/report 조립. 성공·오류 모두 임시 index/sidecar/query-log를 caller가
 * finally로 정리한다(runner는 temp 디렉터리를 만들지 않고 이미 설정된 env를 쓴다).
 *
 * 이 모듈은 temp env가 이미 설정된 프로세스에서 brain을 dynamic import한다(격리 계약).
 */
import fs from "node:fs";
import path from "node:path";
import {
  validateFixture,
  computeFixtureHash,
  CORPUS_DIR,
  type FixtureDoc,
  type FixtureQuery,
} from "./fixture.js";
import { captureProvenance, type Provenance } from "./provenance.js";
import {
  computeQueryRankMetrics,
  computeScoreDistribution,
  rocAuc,
  macroMean,
  type RawHit,
} from "./metrics.js";
import { computeGate } from "./gate.js";
import {
  computeContractFingerprint,
  computeSyntheticIndexFingerprint,
  computeQueryResultFingerprint,
  REPORT_TYPE,
  REPORT_SCHEMA_VERSION,
  type RetrievalQualityReport,
  type RetrievalQualityQueryResult,
  type QueryRawResult,
} from "./report.js";

export interface RunEvaluationOptions {
  /** embedding.mode — 격리 test stub이면 "test_stub", 실제 configured service면 "production". */
  mode: "production" | "test_stub";
  /** `--output`이 지정된 경우 그 경로(provenance의 outputInsideWorktree 판정용). */
  outputPath?: string;
  /** 실행 시각(고정 clock 주입 가능 — 재현성 테스트용). 미지정 시 현재 시각. */
  now?: Date;
  /** provenance git 조회 기준 디렉터리(테스트 주입용). */
  repoRoot?: string;
}

export class EvaluationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvaluationError";
  }
}

const RETRIEVAL_LIMIT = 5 as const;

/** 두 배열이 순서까지 같은지. */
function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * 평가를 실행하고 보고서 객체를 반환한다. temp env(HOME/NOTES_DIR/BRAIN_INDEX/QUERY_LOG,
 * embedding 경로)는 이 함수 호출 전에 설정돼야 한다. corpus 12개는 이 함수가 NOTES_DIR로 복사한다.
 */
export async function runEvaluation(opts: RunEvaluationOptions): Promise<RetrievalQualityReport> {
  // 1) fixture 검증 — 실패면 진행 불가.
  const validation = validateFixture();
  if (!validation.ok) {
    throw new EvaluationError(
      `fixture 검증 실패: ${validation.errors.map((e) => e.message).join("; ")}`,
    );
  }
  const docs = validation.docs;
  const queries = validation.queries;

  // fixtureHash — 13파일 기준(임시 색인/output 만들기 전에 계산해도 무방, 입력이 fixture라서).
  const fixtureHash = computeFixtureHash();

  // 2) provenance 캡처 — 임시 index/output 생성 전에 한 번(FR-002/AC-009).
  const provenance: Provenance = captureProvenance({
    embeddingMode: opts.mode,
    outputPath: opts.outputPath,
    repoRoot: opts.repoRoot,
  });

  // brain은 temp env가 설정된 뒤에만 import한다(격리 계약 — 이 모듈은 그 시점 이후 호출된다).
  const brain = await import("../brain.js");
  const folders = brain.notesFolders();
  const notesDir = folders[0].dir;
  const label = folders[0].label;

  // 3) corpus 12개를 ID/파일명 오름차순으로 정렬해 NOTES_DIR로 복사한다.
  const orderedDocs: FixtureDoc[] = [...docs].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : a.file < b.file ? -1 : a.file > b.file ? 1 : 0,
  );
  const orderedCopiedPaths: string[] = [];
  // path(FileEntry key) → EVAL sourceId 맵. key는 `${label}/${basename}`.
  const pathToSourceId = new Map<string, string>();
  for (const doc of orderedDocs) {
    const dest = path.join(notesDir, doc.file);
    fs.copyFileSync(path.join(CORPUS_DIR, doc.file), dest);
    orderedCopiedPaths.push(dest);
    pathToSourceId.set(`${label}/${doc.file}`, doc.id);
  }

  const resolveSourceId = (chunkPath: string): string => {
    const id = pathToSourceId.get(chunkPath);
    if (id === undefined) {
      throw new EvaluationError(`hit path를 EVAL sourceId로 변환할 수 없음: ${chunkPath}`);
    }
    return id;
  };

  // 4) 결정적 임시 색인 준비(serial fixture order).
  await brain.retrievalEvaluationPort.prepareDeterministicIndex(orderedCopiedPaths);

  // 5) reload된 v5 index의 file/chunk 순서가 serial fixture order와 일치하는지 단언.
  const idx = brain.loadIndex();
  const expectedFileKeys = orderedDocs.map((d) => `${label}/${d.file}`);
  const actualFileKeys = Object.keys(idx.files);
  if (!sameOrder(actualFileKeys, expectedFileKeys)) {
    throw new EvaluationError(
      `reload된 v5 index file 순서가 serial fixture 순서와 다릅니다(기대 ${expectedFileKeys.join(",")}, 실제 ${actualFileKeys.join(",")}).`,
    );
  }
  for (const fe of Object.values(idx.files)) {
    for (const c of fe.chunks) {
      if (!Array.isArray(c.vector) || c.vector.length === 0) {
        throw new EvaluationError(`reload된 index chunk에 벡터가 없습니다: ${c.path}`);
      }
    }
  }

  // 6) runtime snapshot(값 소유 아님 — projection).
  const snapshot = await brain.retrievalEvaluationPort.readRuntimeSnapshot(RETRIEVAL_LIMIT);

  // 7) 40질의 실행 — production searchNotes를 순서 보존으로. hit path→sourceId 변환, 재정렬 금지.
  const rawResults: QueryRawResult[] = [];
  for (const q of queries) {
    const hits = await brain.retrievalEvaluationPort.searchNotes(q.query, RETRIEVAL_LIMIT);
    const rawHits = hits.map((h) => {
      if (!Number.isFinite(h.score)) {
        throw new EvaluationError(`검색 점수가 NaN/Infinity입니다(query=${q.id}).`);
      }
      return { sourceId: resolveSourceId(h.path), score: h.score };
    });
    rawResults.push({ id: q.id, kind: q.kind, relevantDocIds: q.relevantDocIds, hits: rawHits });
  }

  // 8) drain 검증 — 40/40/0이 아니면 평가 오류.
  const drain = await brain.retrievalEvaluationPort.drainQueryEvents();
  if (drain.attempted !== queries.length || drain.succeeded !== queries.length || drain.failed !== 0) {
    throw new EvaluationError(
      `query event drain 불일치: 기대 {${queries.length},${queries.length},0}, 실제 {${drain.attempted},${drain.succeeded},${drain.failed}}.`,
    );
  }

  // 9) metrics/gate/fingerprints/report 조립.
  const report = buildReport({
    rawResults,
    queries,
    docs,
    provenance,
    snapshot,
    fixtureHash,
    index: idx,
    resolveSourceId,
    mode: opts.mode,
    executedAt: (opts.now ?? new Date()).toISOString(),
  });
  return report;
}

interface BuildReportInput {
  rawResults: QueryRawResult[];
  queries: FixtureQuery[];
  docs: FixtureDoc[];
  provenance: Provenance;
  snapshot: import("../brain.js").RetrievalRuntimeSnapshot;
  fixtureHash: string;
  index: import("../brain.js").BrainIndex;
  resolveSourceId: (chunkPath: string) => string;
  mode: "production" | "test_stub";
  executedAt: string;
}

/** 순수 조립 — rawResults + snapshot + provenance로 report를 만든다(테스트에서 직접 검증 가능). */
export function buildReport(input: BuildReportInput): RetrievalQualityReport {
  const byId = new Map(input.rawResults.map((r) => [r.id, r]));

  const positive = input.rawResults.filter((r) => r.kind === "positive");
  const noMatch = input.rawResults.filter((r) => r.kind === "no_match");

  // per-query 지표 + queries[] shape.
  const queryResults: RetrievalQualityQueryResult[] = [];
  const positiveRecalls: number[] = [];
  const positiveRRs: number[] = [];
  const allUniqueRatios: number[] = [];
  let resultReturnedCount = 0;

  const sortedRaw = [...input.rawResults].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const r of sortedRaw) {
    const rawTop5: RawHit[] = r.hits.map((h) => ({ sourceId: h.sourceId, score: h.score }));
    const m = computeQueryRankMetrics(rawTop5, r.relevantDocIds);
    const relevantSet = new Set(r.relevantDocIds);
    const outcome = r.hits.length > 0 ? "results_returned" : "no_results";
    if (outcome === "results_returned") resultReturnedCount++;

    allUniqueRatios.push(m.uniqueSourceRatioAt5);
    if (r.kind === "positive") {
      positiveRecalls.push(m.recallAt5);
      positiveRRs.push(m.reciprocalRankAt5);
    }

    // relevanceJudgment: top5에 ground-truth source가 하나라도 있으면 relevant.
    const anyRelevantInTop5 = rawTop5.some((h) => relevantSet.has(h.sourceId));
    const relevanceJudgment: "relevant" | "not_relevant" =
      r.kind === "no_match" ? "not_relevant" : anyRelevantInTop5 ? "relevant" : "not_relevant";

    queryResults.push({
      id: r.id,
      kind: r.kind,
      relevantDocIds: r.relevantDocIds,
      hits: r.hits.map((h, i) => ({
        rank: i + 1,
        sourceId: h.sourceId,
        score: h.score,
        relevant: relevantSet.has(h.sourceId),
      })),
      outcome,
      topScore: r.hits.length > 0 ? r.hits[0].score : null,
      recallAt5: r.kind === "no_match" ? null : m.recallAt5,
      reciprocalRankAt5: r.kind === "no_match" ? null : m.reciprocalRankAt5,
      uniqueSourceRatioAt5: m.uniqueSourceRatioAt5,
      relevanceJudgment,
    });
  }

  // top score 분포(양성 24 / 음성 16). 결과 없음은 null.
  const positiveTopScores = positive.map((r) => (r.hits.length > 0 ? r.hits[0].score : null));
  const negativeTopScores = noMatch.map((r) => (r.hits.length > 0 ? r.hits[0].score : null));
  const positiveDist = computeScoreDistribution(positiveTopScores);
  const negativeDist = computeScoreDistribution(negativeTopScores);

  const macroRecallAt5 = macroMean(positiveRecalls);
  const mrrAt5 = macroMean(positiveRRs);
  const meanUniqueSourceRatioAt5 = macroMean(allUniqueRatios);
  const resultReturnRate = input.rawResults.length > 0 ? resultReturnedCount / input.rawResults.length : 0;
  const auc = rocAuc(positiveTopScores, negativeTopScores);

  const gateResult = computeGate({
    macroRecallAt5,
    rocAuc: auc,
    positiveTopScores,
    negativeTopScores,
  });

  // fingerprints.
  const contractFingerprint = computeContractFingerprint({
    mode: input.mode,
    implementation: input.snapshot.embeddingImplementation,
    model: input.snapshot.embeddingModel,
    dimensions: input.snapshot.embeddingDimensions,
  });
  const syntheticIndexFingerprint = computeSyntheticIndexFingerprint(input.index, input.resolveSourceId);
  const queryResultFingerprint = computeQueryResultFingerprint(input.rawResults);

  const report: RetrievalQualityReport = {
    reportType: REPORT_TYPE,
    schemaVersion: REPORT_SCHEMA_VERSION,
    run: {
      commit: input.provenance.commit,
      workingTreeDirty: input.provenance.workingTreeDirty,
      evaluationInputsDirty: input.provenance.evaluationInputsDirty,
      outputInsideWorktree: input.provenance.outputInsideWorktree,
      baselineEligible: input.provenance.baselineEligible,
      baselineIneligibilityReasons: input.provenance.baselineIneligibilityReasons,
      retrievalAlgorithm: input.snapshot.retrievalAlgorithm,
      chunkSize: input.snapshot.chunkSize,
      retrievalLimit: input.snapshot.retrievalLimit,
      embedding: {
        model: input.snapshot.embeddingModel,
        dimensions: input.snapshot.embeddingDimensions,
        implementation: input.snapshot.embeddingImplementation,
        contractFingerprint,
        mode: input.mode,
      },
      indexFormatVersion: input.snapshot.indexFormatVersion,
      fixtureHash: input.fixtureHash,
      syntheticIndexFingerprint,
      queryResultFingerprint,
      executedAt: input.executedAt,
    },
    counts: {
      documents: input.docs.length,
      positive: positive.length,
      noMatch: noMatch.length,
    },
    metrics: {
      macroRecallAt5,
      mrrAt5,
      meanUniqueSourceRatioAt5,
      resultReturnRate,
      positiveTopScore: positiveDist,
      negativeTopScore: negativeDist,
      rocAuc: auc,
    },
    thresholdCandidate: gateResult.thresholdCandidate,
    gate: gateResult.gate,
    queries: queryResults,
  };
  return report;
}
