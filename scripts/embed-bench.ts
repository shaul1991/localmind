/**
 * 임베딩 A/B 러너 (specs/036) — 비파괴.
 * 벌트/운영 색인을 건드리지 않고, 코퍼스 파일을 직접 읽어 ollama로 두 모델 임베딩 →
 * cosine 랭킹 → recall@k·MRR 비교 → 채택/유지 권고.
 *
 * 공정성: localmind가 실제 쓰는 방식대로 **질의 instruction 없이 평문 임베딩**(drop-in 교체 평가).
 * qwen3-embedding의 instruction-tuned query 잠재력은 별도(후속).
 *
 * 실행: node --import tsx/esm scripts/embed-bench.ts   (ollama 데몬 필요)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aggregate, evalQuery, rankByCosine, type QueryResult } from "../src/eval-metrics.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";
const MODELS = ["bge-m3:latest", "qwen3-embedding:0.6b"];
// 채택 게이트(spec AC-6): 한국어 recall@5 비회귀 + (recall@10 또는 MRR) +0.02 이상 개선.
const MARGIN = 0.02;

interface QuerySet {
  corpus_glob?: string; // `specs/<star>/goal.md` 형태(저장소 예시)
  corpus_dir?: string | string[]; // 재귀 .md 코퍼스(실벌트) — BENCH_ROOT 기준 상대. 배열 가능.
  queries: { q: string; gold: string[] }[];
}

// 실벌트 실행용: BENCH_QS(질의셋 경로)·BENCH_ROOT(코퍼스/gold 루트)로 오버라이드.
const QS_PATH = process.env.BENCH_QS ?? path.join(REPO, "specs/036-embedding-korean-eval/queries.ko.json");
const ROOT = process.env.BENCH_ROOT ?? REPO;

function loadQuerySet(): QuerySet {
  return JSON.parse(fs.readFileSync(QS_PATH, "utf8"));
}

function walkMd(dir: string, base: string, out: string[]): void {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkMd(full, base, out);
    else if (e.name.endsWith(".md")) out.push(path.relative(base, full));
  }
}

/** corpus_dir(재귀 .md) 또는 corpus_glob을 실제 파일 목록으로. */
function resolveCorpus(qs: QuerySet): { id: string; text: string }[] {
  let ids: string[] = [];
  if (qs.corpus_dir) {
    const dirs = Array.isArray(qs.corpus_dir) ? qs.corpus_dir : [qs.corpus_dir];
    for (const d of dirs) walkMd(path.join(ROOT, d), ROOT, ids);
  } else if (qs.corpus_glob) {
    const sep = "/" + "*" + "/";
    const at = qs.corpus_glob.indexOf(sep);
    if (at < 0) throw new Error(`지원하지 않는 glob: ${qs.corpus_glob}`);
    const base = qs.corpus_glob.slice(0, at);
    const file = qs.corpus_glob.slice(at + sep.length);
    ids = fs
      .readdirSync(path.join(ROOT, base))
      .map((d) => path.join(base, d, file))
      .filter((rel) => fs.existsSync(path.join(ROOT, rel)));
  } else {
    throw new Error("corpus_dir 또는 corpus_glob 필요");
  }
  return ids.map((rel) => ({ id: rel, text: fs.readFileSync(path.join(ROOT, rel), "utf8") }));
}

const BATCH = 8; // 대형 배치는 일부 모델 러너에서 EOF(OOM) → 작게 쪼갠다.

// EMBED_NUM_GPU=0 로 CPU 강제 가능(GPU 메모리 경합 회피). recall 품질은 CPU/GPU 동일.
// EMBED_NUM_CTX: 두 모델 공통 컨텍스트(공정 비교). 기본 2048 — goal.md 두괄식 핵심 커버 +
// 16GB GPU 적합(qwen3 2.0GB). 큰 값(4096)은 경합 시 GPU OOM 위험.
const NUM_GPU = process.env.EMBED_NUM_GPU;
const NUM_CTX = Number(process.env.EMBED_NUM_CTX ?? "2048");

async function embedBatch(model: string, inputs: string[]): Promise<number[][]> {
  const options: Record<string, unknown> = { num_ctx: NUM_CTX };
  if (NUM_GPU !== undefined) options.num_gpu = Number(NUM_GPU);
  const body: Record<string, unknown> = { model, input: inputs, options };
  const res = await fetch(`${OLLAMA}/api/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ollama embed 실패(${model}): HTTP ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { embeddings: number[][] };
  if (!data.embeddings || data.embeddings.length !== inputs.length) {
    throw new Error(`임베딩 개수 불일치(${model}): ${data.embeddings?.length} != ${inputs.length}`);
  }
  return data.embeddings;
}

async function embed(model: string, inputs: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < inputs.length; i += BATCH) {
    out.push(...(await embedBatch(model, inputs.slice(i, i + BATCH))));
  }
  return out;
}

/** 모델을 메모리에서 내린다(16GB에서 2모델 동시 상주 → 충돌 방지). */
async function unload(model: string): Promise<void> {
  await fetch(`${OLLAMA}/api/embed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, input: "x", keep_alive: 0 }),
  }).catch(() => {});
}

function pct(x: number): string {
  return (x * 100).toFixed(1) + "%";
}

async function main() {
  const qs = loadQuerySet();
  const corpus = resolveCorpus(qs);
  const queries = qs.queries;
  console.log(`코퍼스 ${corpus.length}개 문서 · 질의 ${queries.length}개 · 모델 ${MODELS.join(", ")}\n`);

  const perModel: Record<
    string,
    { agg: ReturnType<typeof aggregate>; misses: string[] }
  > = {};

  for (const model of MODELS) {
    const t0 = Date.now();
    const corpusVecs = await embed(model, corpus.map((c) => c.text));
    const queryVecs = await embed(model, queries.map((q) => q.q));
    const elapsed = Date.now() - t0;

    const vecCorpus = corpus.map((c, i) => ({ id: c.id, vec: corpusVecs[i] }));
    const results: QueryResult[] = [];
    const misses: string[] = [];
    queries.forEach((q, i) => {
      const ranked = rankByCosine(queryVecs[i], vecCorpus);
      const r = evalQuery(ranked, q.gold);
      results.push(r);
      if (r.recallAt5 === 0) misses.push(`  ✗ [recall@5=0] "${q.q}" → gold ${q.gold[0]} (실제 순위 ${ranked.indexOf(q.gold[0]) + 1})`);
    });
    perModel[model] = { agg: aggregate(results), misses };
    console.log(`[${model}] 임베딩 ${corpus.length + queries.length}개, ${elapsed}ms`);
    await unload(model); // 다음 모델 로드 전 메모리 확보(16GB 제약)
  }

  // ── 리포트 ──
  console.log("\n=== 결과 (recall@k·MRR) ===");
  console.log("모델".padEnd(24) + "recall@5   recall@10   MRR");
  for (const model of MODELS) {
    const a = perModel[model].agg;
    console.log(model.padEnd(24) + `${pct(a.recallAt5).padEnd(11)}${pct(a.recallAt10).padEnd(12)}${a.mrr.toFixed(3)}`);
  }

  const [base, cand] = MODELS;
  const b = perModel[base].agg;
  const c = perModel[cand].agg;
  const dR5 = c.recallAt5 - b.recallAt5;
  const dR10 = c.recallAt10 - b.recallAt10;
  const dMRR = c.mrr - b.mrr;
  console.log(`\n=== ${cand} − ${base} (델타) ===`);
  console.log(`  recall@5: ${(dR5 * 100).toFixed(1)}%p · recall@10: ${(dR10 * 100).toFixed(1)}%p · MRR: ${dMRR.toFixed(3)}`);

  const noRegress = dR5 >= -1e-9;
  const improved = dR10 >= MARGIN || dMRR >= MARGIN;
  const adopt = noRegress && improved;
  console.log(`\n=== 결정 게이트 (AC-6) ===`);
  console.log(`  recall@5 비회귀: ${noRegress ? "O" : "X"} · recall@10/MRR +${MARGIN} 개선: ${improved ? "O" : "X"}`);
  console.log(`  → 권고: ${adopt ? `채택 (${cand})` : `유지 (${base})`}`);

  for (const model of MODELS) {
    if (perModel[model].misses.length) {
      console.log(`\n[${model}] recall@5 실패 질의(${perModel[model].misses.length}):`);
      perModel[model].misses.forEach((m) => console.log(m));
    }
  }
}

main().catch((e) => {
  console.error("embed-bench 실패:", e.message);
  process.exit(1);
});
