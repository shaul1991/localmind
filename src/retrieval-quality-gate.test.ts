import assert from "node:assert";
import { describe, it } from "node:test";
import { computeGate, type GateInput } from "./retrieval-quality/gate.js";

// 공통 fixture: positive 24개, negative 16개. threshold pass 시나리오.
// positive: 23개 score=10, 1개 score=2(낮아서 못 잡힘)
// negative: 15개 score=1, 1개 score=9(FP 후보)
function passingScores(): Pick<GateInput, "positiveTopScores" | "negativeTopScores"> {
  const positiveTopScores: (number | null)[] = [...Array(23).fill(10), 2];
  const negativeTopScores: (number | null)[] = [...Array(15).fill(1), 9];
  return { positiveTopScores, negativeTopScores };
}

describe("retrieval-quality/gate — passing measurement gate (AC-005)", () => {
  it("적격 후보 중 가장 큰 threshold=10을 선택하고 정확한 confusion·pass를 낸다", () => {
    const { positiveTopScores, negativeTopScores } = passingScores();
    const result = computeGate({
      macroRecallAt5: 0.95,
      rocAuc: 0.95,
      positiveTopScores,
      negativeTopScores,
    });
    assert.strictEqual(result.gate.status, "pass");
    assert.deepStrictEqual(result.gate.reasons, []);
    assert.ok(result.thresholdCandidate);
    assert.strictEqual(result.thresholdCandidate!.value, 10);
    // TP=23(>=10), FN=1, FP=0(>=10인 negative 없음), TN=16
    assert.deepStrictEqual(result.thresholdCandidate!.confusion, { tp: 23, fn: 1, fp: 0, tn: 16 });
    assert.strictEqual(result.thresholdCandidate!.positiveDetectionRate, 23 / 24);
    assert.strictEqual(result.thresholdCandidate!.negativeFpr, 0 / 16);
    // confusion 합이 positive 24 / negative 16과 정합
    const c = result.thresholdCandidate!.confusion;
    assert.strictEqual(c.tp + c.fn, 24);
    assert.strictEqual(c.fp + c.tn, 16);
  });

  it("여러 적격 threshold 후보 중 가장 큰 값만 선택한다 (9, 2도 적격이지만 10을 선택)", () => {
    const { positiveTopScores, negativeTopScores } = passingScores();
    const result = computeGate({
      macroRecallAt5: 0.95,
      rocAuc: 0.95,
      positiveTopScores,
      negativeTopScores,
    });
    // threshold=9: TP=23(10>=9)/24=0.9583 OK, FP=1(9>=9)/16=0.0625 OK → 적격이지만 10보다 작음
    // threshold=2: TP=24/24=1 OK, FP=1(9>=2)/16=0.0625 OK → 적격이지만 10보다 작음
    // threshold=1: FP=16/16=1.0 > 0.1 → 부적격
    assert.strictEqual(result.thresholdCandidate!.value, 10);
  });
});

describe("retrieval-quality/gate — failing measurement gates (AC-006)", () => {
  it("macro recall@5가 낮으면 macro_recall_at_5_below_0_90로만 fail (AUC·threshold는 통과)", () => {
    const { positiveTopScores, negativeTopScores } = passingScores();
    const result = computeGate({
      macroRecallAt5: 0.5,
      rocAuc: 0.95,
      positiveTopScores,
      negativeTopScores,
    });
    assert.strictEqual(result.gate.status, "fail");
    assert.deepStrictEqual(result.gate.reasons, ["macro_recall_at_5_below_0_90"]);
    // threshold 자체는 여전히 적격이므로 보고는 되지만 gate만 fail
    assert.ok(result.thresholdCandidate);
  });

  it("ROC-AUC가 낮으면 roc_auc_below_0_90로만 fail (threshold는 여전히 보고)", () => {
    const { positiveTopScores, negativeTopScores } = passingScores();
    const result = computeGate({
      macroRecallAt5: 0.95,
      rocAuc: 0.5,
      positiveTopScores,
      negativeTopScores,
    });
    assert.strictEqual(result.gate.status, "fail");
    assert.deepStrictEqual(result.gate.reasons, ["roc_auc_below_0_90"]);
    assert.ok(result.thresholdCandidate);
  });

  it("적격 threshold가 없으면 no_eligible_threshold로 fail, thresholdCandidate는 전체 null", () => {
    // positive 24개 전부 score=1, negative 16개 전부 score=5.
    // threshold=5: TP=0/24 <0.9 fail. threshold=1: TP=24/24 OK이나 FP=16/16=1.0 >0.1 fail.
    const positiveTopScores: (number | null)[] = Array(24).fill(1);
    const negativeTopScores: (number | null)[] = Array(16).fill(5);
    const result = computeGate({
      macroRecallAt5: 0.95,
      rocAuc: 0.95,
      positiveTopScores,
      negativeTopScores,
    });
    assert.strictEqual(result.gate.status, "fail");
    assert.deepStrictEqual(result.gate.reasons, ["no_eligible_threshold"]);
    assert.strictEqual(result.thresholdCandidate, null);
  });

  it("높은 점수 오답만 반환해 AUC·threshold는 통과해도 macroRecall=0이면 반드시 fail", () => {
    // 점수 분리는 완벽(AUC=1)하고 threshold도 적격이지만, canonical top5에 정답이 없어
    // macroRecallAt5=0으로 계산된 상황(recall은 gate 외부에서 계산해 입력으로 넣는다).
    const positiveTopScores: (number | null)[] = Array(24).fill(10); // 오답 문서지만 점수는 높음
    const negativeTopScores: (number | null)[] = Array(16).fill(1);
    const result = computeGate({
      macroRecallAt5: 0,
      rocAuc: 1,
      positiveTopScores,
      negativeTopScores,
    });
    assert.strictEqual(result.gate.status, "fail");
    assert.deepStrictEqual(result.gate.reasons, ["macro_recall_at_5_below_0_90"]);
    // threshold는 적격(10: TP=24/24, FP=0/16)이므로 후보는 여전히 보고된다.
    assert.ok(result.thresholdCandidate);
    assert.strictEqual(result.thresholdCandidate!.value, 10);
  });

  it("세 조건이 모두 실패하면 reasons가 고정 순서(recall -> auc -> no_eligible_threshold)로 모두 담긴다", () => {
    const positiveTopScores: (number | null)[] = Array(24).fill(1);
    const negativeTopScores: (number | null)[] = Array(16).fill(5);
    const result = computeGate({
      macroRecallAt5: 0.1,
      rocAuc: 0.1,
      positiveTopScores,
      negativeTopScores,
    });
    assert.strictEqual(result.gate.status, "fail");
    assert.deepStrictEqual(result.gate.reasons, [
      "macro_recall_at_5_below_0_90",
      "roc_auc_below_0_90",
      "no_eligible_threshold",
    ]);
    assert.strictEqual(result.thresholdCandidate, null);
  });
});
