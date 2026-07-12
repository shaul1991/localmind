/**
 * specs/041 검색 품질 계약 — 순수 metrics 계산. 파일 I/O·전역설정·검색실행에 의존하지 않는다.
 * canonical top-5 ranking(같은 canonical source의 2번째 이후 chunk 제거), recall@5, MRR@5,
 * unique source ratio, top score 분포, ROC-AUC를 담당한다. runner/serializer는 이 모듈을
 * 호출하는 쪽(041 범위 밖)의 몫이다.
 */

/** production이 반환한 raw hit. 순서를 보존한 채로 받는다(재정렬 금지). */
export interface RawHit {
  sourceId: string;
  score: number;
}

/** canonical top-5 ranking의 한 원소 — raw top5에서 같은 source의 2번째 이후 chunk를 제거한 결과. */
export interface CanonicalRankEntry {
  sourceId: string;
  score: number;
}

/** 한 질의의 순위 지표 계산 결과. */
export interface QueryRankMetrics {
  canonicalTop5: CanonicalRankEntry[];
  recallAt5: number;
  reciprocalRankAt5: number;
  uniqueSourceRatioAt5: number;
}

/** score distribution 요약. 유한 점수가 하나도 없으면 count:0이고 나머지는 모두 null. */
export interface ScoreDistribution {
  count: number;
  missingCount: number;
  min: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  max: number | null;
}

/**
 * raw top 5 hit를 순서대로 순회하며 같은 canonical source(sourceId)의 2번째 이후 chunk를 제거한다.
 * raw hit를 5개보다 더 읽어 빈자리를 보충하지 않는다 — 입력이 이미 top5로 잘려 있다고 가정한다.
 */
export function canonicalTop5Ranking(rawTop5Hits: readonly RawHit[]): CanonicalRankEntry[] {
  const seen = new Set<string>();
  const result: CanonicalRankEntry[] = [];
  for (const hit of rawTop5Hits) {
    if (seen.has(hit.sourceId)) continue;
    seen.add(hit.sourceId);
    result.push({ sourceId: hit.sourceId, score: hit.score });
  }
  return result;
}

/** recall@5(q) = |relevantDocIds ∩ canonical top5| / |relevantDocIds|. relevantDocIds가 비어 있으면 0. */
export function recallAt5(rawTop5Hits: readonly RawHit[], relevantDocIds: readonly string[]): number {
  if (relevantDocIds.length === 0) return 0;
  const canonical = new Set(canonicalTop5Ranking(rawTop5Hits).map((e) => e.sourceId));
  const hit = relevantDocIds.filter((id) => canonical.has(id)).length;
  return hit / relevantDocIds.length;
}

/** reciprocalRankAt5(q) = 1/(최초 관련 canonical source 순위). canonical top5에 없으면 0. */
export function reciprocalRankAt5(rawTop5Hits: readonly RawHit[], relevantDocIds: readonly string[]): number {
  const relevant = new Set(relevantDocIds);
  const canonical = canonicalTop5Ranking(rawTop5Hits);
  for (let i = 0; i < canonical.length; i++) {
    if (relevant.has(canonical[i].sourceId)) return 1 / (i + 1);
  }
  return 0;
}

/** uniqueSourceRatioAt5(q) = top5 unique source 수 / 반환 hit 수(raw). hit가 0개면 0. */
export function uniqueSourceRatioAt5(rawTop5Hits: readonly RawHit[]): number {
  if (rawTop5Hits.length === 0) return 0;
  const uniqueSources = new Set(rawTop5Hits.map((h) => h.sourceId)).size;
  return uniqueSources / rawTop5Hits.length;
}

/** 한 질의의 recall@5·RR@5·uniqueSourceRatio@5와 canonical ranking을 함께 계산한다. */
export function computeQueryRankMetrics(
  rawTop5Hits: readonly RawHit[],
  relevantDocIds: readonly string[],
): QueryRankMetrics {
  return {
    canonicalTop5: canonicalTop5Ranking(rawTop5Hits),
    recallAt5: recallAt5(rawTop5Hits, relevantDocIds),
    reciprocalRankAt5: reciprocalRankAt5(rawTop5Hits, relevantDocIds),
    uniqueSourceRatioAt5: uniqueSourceRatioAt5(rawTop5Hits),
  };
}

/** 여러 질의 값의 macro mean(단순 산술 평균). 빈 배열이면 0. */
export function macroMean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** 오름차순 정렬된 유한 점수 배열에서 nearest-index 분위수. round((n-1)*p), 보간 없음. */
function quantile(sortedAscending: readonly number[], p: number): number {
  const idx = Math.round((sortedAscending.length - 1) * p);
  return sortedAscending[idx];
}

/**
 * top score 목록에서 유한/결과없음을 분리해 분포를 계산한다. 결과없음은 `null`로 표시된 원소로
 * 전달한다(hit 0개인 질의). NaN/Infinity가 섞여 있으면 결과 없음으로 숨기지 않고 예외를 던진다.
 */
export function computeScoreDistribution(topScores: readonly (number | null)[]): ScoreDistribution {
  const finite: number[] = [];
  let missingCount = 0;
  for (const s of topScores) {
    if (s === null) {
      missingCount++;
      continue;
    }
    if (!Number.isFinite(s)) {
      throw new Error(`평가 오류: top score에 NaN/Infinity가 있습니다 (value=${s})`);
    }
    finite.push(s);
  }
  finite.sort((a, b) => a - b);
  if (finite.length === 0) {
    return { count: 0, missingCount, min: null, p25: null, median: null, p75: null, max: null };
  }
  return {
    count: finite.length,
    missingCount,
    min: finite[0],
    p25: quantile(finite, 0.25),
    median: quantile(finite, 0.5),
    p75: quantile(finite, 0.75),
    max: finite[finite.length - 1],
  };
}

/**
 * ROC-AUC: `(positive > negative 쌍 + 0.5 * 동점 쌍) / (positive 수 * negative 수)`.
 * 결과 없음(`null`)은 모든 유한 점수보다 작은 값으로 취급한다. positive/negative 중 하나라도
 * 비어 있으면(분모 0) NaN 대신 0을 반환한다(가드 — spec은 24/16 고정이라 실사용에서는 발생하지
 * 않지만 순수 함수 계약으로 명시한다). NaN/Infinity 입력은 예외.
 */
export function rocAuc(positiveScores: readonly (number | null)[], negativeScores: readonly (number | null)[]): number {
  const toComparable = (s: number | null): number => {
    if (s === null) return Number.NEGATIVE_INFINITY;
    if (!Number.isFinite(s)) {
      throw new Error(`평가 오류: ROC-AUC 입력에 NaN/Infinity가 있습니다 (value=${s})`);
    }
    return s;
  };
  const pos = positiveScores.map(toComparable);
  const neg = negativeScores.map(toComparable);
  if (pos.length === 0 || neg.length === 0) return 0;
  let score = 0;
  for (const p of pos) {
    for (const n of neg) {
      if (p > n) score += 1;
      else if (p === n) score += 0.5;
    }
  }
  return score / (pos.length * neg.length);
}
