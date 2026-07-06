import assert from "node:assert";
import { describe, it } from "node:test";
import {
  aggregate,
  cosineSim,
  evalQuery,
  rankByCosine,
  recallAtK,
  reciprocalRank,
} from "./eval-metrics.js";

describe("eval-metrics — 임베딩 A/B 지표(036 AC-7)", () => {
  it("cosineSim: 동일 방향=1, 직교=0", () => {
    assert.strictEqual(cosineSim([1, 0], [1, 0]), 1);
    assert.strictEqual(cosineSim([1, 0], [0, 1]), 0);
    assert.ok(Math.abs(cosineSim([1, 1], [1, 0]) - Math.SQRT1_2) < 1e-9);
  });

  it("cosineSim: 0 벡터는 0, 차원 불일치는 오류", () => {
    assert.strictEqual(cosineSim([0, 0], [1, 1]), 0);
    assert.throws(() => cosineSim([1], [1, 2]), /차원 불일치/);
  });

  it("rankByCosine: 유사도 내림차순 id", () => {
    const q = [1, 0];
    const corpus = [
      { id: "far", vec: [0, 1] },
      { id: "near", vec: [1, 0] },
      { id: "mid", vec: [1, 1] },
    ];
    assert.deepStrictEqual(rankByCosine(q, corpus), ["near", "mid", "far"]);
  });

  it("recallAtK: 단일 gold — top-k 안이면 1, 밖이면 0", () => {
    assert.strictEqual(recallAtK(["a", "b", "c", "d"], ["c"], 2), 0);
    assert.strictEqual(recallAtK(["a", "b", "c", "d"], ["c"], 3), 1);
  });

  it("recallAtK: 복수 gold — 비율", () => {
    // gold {a,x}, top2 {a,b} → a만 히트 → 0.5
    assert.strictEqual(recallAtK(["a", "b", "x"], ["a", "x"], 2), 0.5);
    assert.strictEqual(recallAtK(["a", "b", "x"], ["a", "x"], 3), 1);
  });

  it("recallAtK: gold 없음 → 0", () => {
    assert.strictEqual(recallAtK(["a", "b"], [], 5), 0);
  });

  it("reciprocalRank: 첫 gold 히트의 1/rank", () => {
    assert.ok(Math.abs(reciprocalRank(["a", "b", "c"], ["c"]) - 1 / 3) < 1e-9);
    assert.strictEqual(reciprocalRank(["a", "b"], ["a"]), 1);
    assert.strictEqual(reciprocalRank(["a", "b"], ["z"]), 0);
  });

  it("evalQuery: recall@5·recall@10·rr 묶음", () => {
    const ranked = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "gold"];
    const r = evalQuery(ranked, ["gold"]);
    assert.strictEqual(r.recallAt5, 0); // gold는 10번째
    assert.strictEqual(r.recallAt10, 1);
    assert.ok(Math.abs(r.rr - 1 / 10) < 1e-9);
  });

  it("aggregate: 평균 + n, 빈 배열 안전", () => {
    const agg = aggregate([
      { recallAt5: 1, recallAt10: 1, rr: 1 },
      { recallAt5: 0, recallAt10: 1, rr: 0.5 },
    ]);
    assert.strictEqual(agg.n, 2);
    assert.strictEqual(agg.recallAt5, 0.5);
    assert.strictEqual(agg.recallAt10, 1);
    assert.strictEqual(agg.mrr, 0.75);
    assert.deepStrictEqual(aggregate([]), { recallAt5: 0, recallAt10: 0, mrr: 0, n: 0 });
  });
});
