/**
 * specs/041 검색 품질 계약 — 순수 predeclared measurement gate(FR-005). 파일 I/O·전역설정·검색실행에
 * 의존하지 않는다. macroRecallAt5·rocAuc와 양성/음성 top score 라벨 배열만 입력으로 받는다.
 */

/** gate 판정 근거로 쓰는 confusion matrix. TP/FN은 양성 질의 점수가 threshold 이상/미만인 수를 센다. */
export interface GateConfusion {
  tp: number;
  fn: number;
  fp: number;
  tn: number;
}

/** 적격 후보 threshold와 그 결과 지표. 적격 후보가 없으면 gate 결과의 thresholdCandidate는 null. */
export interface ThresholdCandidate {
  value: number;
  positiveDetectionRate: number;
  negativeFpr: number;
  confusion: GateConfusion;
}

/** FR-005 실패 이유 enum. 고정 순서: recall -> auc -> no_eligible_threshold. */
export type GateReason = "macro_recall_at_5_below_0_90" | "roc_auc_below_0_90" | "no_eligible_threshold";

export interface GateResult {
  thresholdCandidate: ThresholdCandidate | null;
  gate: {
    status: "pass" | "fail";
    reasons: GateReason[];
  };
}

export interface GateInput {
  macroRecallAt5: number;
  rocAuc: number;
  /** 양성 24개의 top score. 결과없음은 null(모든 유한 점수보다 작게 취급). */
  positiveTopScores: readonly (number | null)[];
  /** 음성(no-match) 16개의 top score. 결과없음은 null. */
  negativeTopScores: readonly (number | null)[];
}

/**
 * FR-005 순서대로 게이트를 계산한다:
 * (1) macroRecallAt5>=0.90 (2) rocAuc>=0.90 (3) 각 고유 유한 top score를 threshold 후보로
 * (4) 양성탐지율(TP/24)>=0.90 & 음성FPR(FP/16)<=0.10 후보만 (5) 가장 큰 유한 threshold 선택
 * (6) 세 조건 모두 만족해야 pass.
 */
export function computeGate(input: GateInput): GateResult {
  const positiveCount = input.positiveTopScores.length;
  const negativeCount = input.negativeTopScores.length;

  // 결과없음(null)은 모든 유한 점수보다 작은 값으로 취급 — threshold 비교용 comparable 값.
  const toComparable = (s: number | null): number => (s === null ? Number.NEGATIVE_INFINITY : s);
  const posComparable = input.positiveTopScores.map(toComparable);
  const negComparable = input.negativeTopScores.map(toComparable);

  // (3) 고유 유한 top score만 후보로 삼는다(결과없음 자체는 후보가 아니다).
  const finiteScores = new Set<number>();
  for (const s of input.positiveTopScores) if (s !== null) finiteScores.add(s);
  for (const s of input.negativeTopScores) if (s !== null) finiteScores.add(s);

  // (4) 양성탐지율 >= 0.90, 음성FPR <= 0.10을 만족하는 후보만 남긴다.
  const eligible: ThresholdCandidate[] = [];
  for (const threshold of finiteScores) {
    const tp = posComparable.filter((s) => s >= threshold).length;
    const fn = positiveCount - tp;
    const fp = negComparable.filter((s) => s >= threshold).length;
    const tn = negativeCount - fp;
    const positiveDetectionRate = positiveCount > 0 ? tp / positiveCount : 0;
    const negativeFpr = negativeCount > 0 ? fp / negativeCount : 0;
    if (positiveDetectionRate >= 0.9 && negativeFpr <= 0.1) {
      eligible.push({ value: threshold, positiveDetectionRate, negativeFpr, confusion: { tp, fn, fp, tn } });
    }
  }

  // (5) 후보가 여러 개면 가장 큰 유한 threshold 선택.
  let thresholdCandidate: ThresholdCandidate | null = null;
  for (const c of eligible) {
    if (thresholdCandidate === null || c.value > thresholdCandidate.value) thresholdCandidate = c;
  }

  // (6) 세 조건(macroRecall, auc, 후보존재) 모두 만족해야 pass. 실패 이유는 고정 순서로만 필요한 것.
  const recallOk = input.macroRecallAt5 >= 0.9;
  const aucOk = input.rocAuc >= 0.9;
  const thresholdOk = thresholdCandidate !== null;

  const reasons: GateReason[] = [];
  if (!recallOk) reasons.push("macro_recall_at_5_below_0_90");
  if (!aucOk) reasons.push("roc_auc_below_0_90");
  if (!thresholdOk) reasons.push("no_eligible_threshold");

  return {
    thresholdCandidate,
    gate: {
      status: recallOk && aucOk && thresholdOk ? "pass" : "fail",
      reasons,
    },
  };
}
