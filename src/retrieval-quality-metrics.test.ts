import assert from "node:assert";
import { describe, it } from "node:test";
import {
  canonicalTop5Ranking,
  computeQueryRankMetrics,
  computeScoreDistribution,
  macroMean,
  recallAt5,
  reciprocalRankAt5,
  rocAuc,
  uniqueSourceRatioAt5,
} from "./retrieval-quality/metrics.js";

describe("retrieval-quality/metrics — canonical top-5 ranking (AC-002)", () => {
  it("raw top5의 중복 chunk는 첫 canonical source만 남긴다 — A(chunk1),A(chunk2),B → RR=1/2", () => {
    const raw = [
      { sourceId: "A", score: 10 },
      { sourceId: "A", score: 9 },
      { sourceId: "B", score: 8 },
    ];
    const canonical = canonicalTop5Ranking(raw);
    assert.deepStrictEqual(
      canonical.map((c) => c.sourceId),
      ["A", "B"],
    );
    assert.strictEqual(reciprocalRankAt5(raw, ["B"]), 1 / 2);
    assert.strictEqual(recallAt5(raw, ["B"]), 1);
  });

  it("rank shift — A,C,A(dup 제거),B,D → canonical=[A,C,B,D], B의 RR=1/3", () => {
    const raw = [
      { sourceId: "A", score: 10 },
      { sourceId: "C", score: 9 },
      { sourceId: "A", score: 8 },
      { sourceId: "B", score: 7 },
      { sourceId: "D", score: 6 },
    ];
    const canonical = canonicalTop5Ranking(raw);
    assert.deepStrictEqual(
      canonical.map((c) => c.sourceId),
      ["A", "C", "B", "D"],
    );
    assert.strictEqual(reciprocalRankAt5(raw, ["B"]), 1 / 3);
    assert.strictEqual(recallAt5(raw, ["B"]), 1);
  });

  it("hit가 5개 미만이어도 그대로 계산한다", () => {
    const raw = [
      { sourceId: "A", score: 5 },
      { sourceId: "B", score: 4 },
      { sourceId: "C", score: 3 },
    ];
    const m = computeQueryRankMetrics(raw, ["C"]);
    assert.deepStrictEqual(
      m.canonicalTop5.map((c) => c.sourceId),
      ["A", "B", "C"],
    );
    assert.strictEqual(m.recallAt5, 1);
    assert.strictEqual(m.reciprocalRankAt5, 1 / 3);
    assert.strictEqual(m.uniqueSourceRatioAt5, 1); // unique 3 / hit 3
  });

  it("raw top5 밖 hit로 빈자리를 보충하지 않는다 — 5개 모두 같은 source면 canonical은 1개뿐", () => {
    const raw = [
      { sourceId: "A", score: 5 },
      { sourceId: "A", score: 4 },
      { sourceId: "A", score: 3 },
      { sourceId: "A", score: 2 },
      { sourceId: "A", score: 1 },
    ];
    const m = computeQueryRankMetrics(raw, ["B"]);
    assert.deepStrictEqual(
      m.canonicalTop5.map((c) => c.sourceId),
      ["A"],
    );
    assert.strictEqual(m.recallAt5, 0); // B가 canonical top5 밖(입력에 아예 없음)
    assert.strictEqual(m.reciprocalRankAt5, 0);
    assert.strictEqual(m.uniqueSourceRatioAt5, 0.2); // unique 1 / hit 5
  });

  it("hit가 0개면 uniqueSourceRatioAt5는 0, recall/RR도 0", () => {
    const m = computeQueryRankMetrics([], ["A"]);
    assert.strictEqual(m.uniqueSourceRatioAt5, 0);
    assert.strictEqual(m.recallAt5, 0);
    assert.strictEqual(m.reciprocalRankAt5, 0);
    assert.deepStrictEqual(m.canonicalTop5, []);
  });

  it("relevantDocIds가 여러 개면 recall@5는 canonical top5와의 교집합 비율", () => {
    const raw = [
      { sourceId: "A", score: 5 },
      { sourceId: "B", score: 4 },
      { sourceId: "C", score: 3 },
    ];
    assert.strictEqual(recallAt5(raw, ["A", "C", "Z"]), 2 / 3);
  });

  it("macroMean — 질의별 값의 단순 평균, 빈 배열은 0", () => {
    assert.strictEqual(macroMean([1, 0, 0.5]), 0.5);
    assert.strictEqual(macroMean([]), 0);
  });
});

describe("retrieval-quality/metrics — score distribution & ROC-AUC (AC-003)", () => {
  it("동점·음수·결과없음이 섞인 표본의 분포 — nearest-index 분위수(보간 없음)", () => {
    // finite sorted: [-1, 3, 5, 5], n=4
    // p25 idx=round(3*0.25)=round(0.75)=1 -> 3
    // median idx=round(3*0.5)=round(1.5)=2 -> 5
    // p75 idx=round(3*0.75)=round(2.25)=2 -> 5
    const dist = computeScoreDistribution([5, 5, -1, null, 3]);
    assert.deepStrictEqual(dist, {
      count: 4,
      missingCount: 1,
      min: -1,
      p25: 3,
      median: 5,
      p75: 5,
      max: 5,
    });
  });

  it("count + missingCount가 표본 전체 크기와 일치한다 (positive 24 / negative 16 정합 형태 검증)", () => {
    const positiveTopScores: (number | null)[] = [...Array(20).fill(1), ...Array(4).fill(null)];
    const dist = computeScoreDistribution(positiveTopScores);
    assert.strictEqual(dist.count + dist.missingCount, 24);
    assert.strictEqual(dist.count, 20);
    assert.strictEqual(dist.missingCount, 4);
  });

  it("유한 점수가 하나도 없으면 count:0이고 min/분위수/max는 모두 null", () => {
    const dist = computeScoreDistribution([null, null, null]);
    assert.deepStrictEqual(dist, {
      count: 0,
      missingCount: 3,
      min: null,
      p25: null,
      median: null,
      p75: null,
      max: null,
    });
  });

  it("NaN 입력은 결과없음으로 숨기지 않고 평가 오류로 throw", () => {
    assert.throws(() => computeScoreDistribution([1, NaN, 2]), /평가 오류/);
  });

  it("Infinity 입력은 평가 오류로 throw", () => {
    assert.throws(() => computeScoreDistribution([1, Infinity]), /평가 오류/);
    assert.throws(() => computeScoreDistribution([1, -Infinity]), /평가 오류/);
  });

  it("ROC-AUC — 고정 예제: positive=[5,3], negative=[4,2] → (3 wins + 0 ties)/4 = 0.75", () => {
    // pairs: (5,4)win (5,2)win (3,4)loss (3,2)win => 3/4
    assert.strictEqual(rocAuc([5, 3], [4, 2]), 0.75);
  });

  it("ROC-AUC — 전부 동점이면 0.5", () => {
    assert.strictEqual(rocAuc([5, 5], [5, 5]), 0.5);
  });

  it("ROC-AUC — 결과없음(null)은 모든 유한 점수보다 작게 취급", () => {
    // positive=[null] < negative=[1] → 0승 0동점 → AUC 0
    assert.strictEqual(rocAuc([null], [1]), 0);
    // negative=[null] < positive=[1] → 항상 이김 → AUC 1
    assert.strictEqual(rocAuc([1], [null]), 1);
  });

  it("ROC-AUC — positive/negative 어느 한쪽이 비어 있으면 0 (분모 0 가드)", () => {
    assert.strictEqual(rocAuc([], [1, 2]), 0);
    assert.strictEqual(rocAuc([1, 2], []), 0);
  });

  it("ROC-AUC — NaN/Infinity 입력은 평가 오류로 throw", () => {
    assert.throws(() => rocAuc([NaN], [1]), /평가 오류/);
    assert.throws(() => rocAuc([1], [Infinity]), /평가 오류/);
  });
});
