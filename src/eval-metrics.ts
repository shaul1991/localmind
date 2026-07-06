/**
 * 임베딩 A/B 평가 지표 (specs/036) — 순수 함수. I/O 없음(ollama·벌트 읽기는 러너의 몫).
 * recall@k·MRR·cosine 만 담당해 결정론적으로 단위 테스트한다.
 */

/** 코사인 유사도. 길이가 다르면 오류(같은 모델 벡터끼리만 비교). */
export function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`벡터 차원 불일치: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** 코퍼스 벡터들에 대해 query 벡터의 유사도 내림차순 id 랭킹. */
export function rankByCosine(
  queryVec: number[],
  corpus: { id: string; vec: number[] }[],
): string[] {
  return corpus
    .map((c) => ({ id: c.id, score: cosineSim(queryVec, c.vec) }))
    .sort((x, y) => y.score - x.score)
    .map((r) => r.id);
}

/** recall@k: 상위 k개에 든 gold 비율. gold가 여러 개면 (top-k∩gold)/|gold|. */
export function recallAtK(rankedIds: string[], goldIds: string[], k: number): number {
  if (goldIds.length === 0) return 0;
  const topK = new Set(rankedIds.slice(0, k));
  const hit = goldIds.filter((g) => topK.has(g)).length;
  return hit / goldIds.length;
}

/** 첫 gold 히트의 역순위(1/rank). 없으면 0. */
export function reciprocalRank(rankedIds: string[], goldIds: string[]): number {
  const gold = new Set(goldIds);
  for (let i = 0; i < rankedIds.length; i++) {
    if (gold.has(rankedIds[i])) return 1 / (i + 1);
  }
  return 0;
}

export interface QueryResult {
  recallAt5: number;
  recallAt10: number;
  rr: number;
}

/** 한 질의의 지표 묶음. */
export function evalQuery(rankedIds: string[], goldIds: string[]): QueryResult {
  return {
    recallAt5: recallAtK(rankedIds, goldIds, 5),
    recallAt10: recallAtK(rankedIds, goldIds, 10),
    rr: reciprocalRank(rankedIds, goldIds),
  };
}

/** 여러 질의 결과의 평균(recall@5·recall@10·MRR). */
export function aggregate(results: QueryResult[]): {
  recallAt5: number;
  recallAt10: number;
  mrr: number;
  n: number;
} {
  const n = results.length;
  if (n === 0) return { recallAt5: 0, recallAt10: 0, mrr: 0, n: 0 };
  const sum = results.reduce(
    (acc, r) => ({
      recallAt5: acc.recallAt5 + r.recallAt5,
      recallAt10: acc.recallAt10 + r.recallAt10,
      rr: acc.rr + r.rr,
    }),
    { recallAt5: 0, recallAt10: 0, rr: 0 },
  );
  return {
    recallAt5: sum.recallAt5 / n,
    recallAt10: sum.recallAt10 / n,
    mrr: sum.rr / n,
    n,
  };
}
