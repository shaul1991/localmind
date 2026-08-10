import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type CorpusDocument = Readonly<{
  id: string;
  path: string;
  sourcePath: string;
  bytes: Buffer;
  sha256: string;
}>;

export type CorpusQuery = Readonly<{
  id: string;
  text: string;
  relevant: readonly string[];
}>;

export type RetrievalCorpus = Readonly<{
  schema: "localmind.retrieval-corpus.v1";
  id: string;
  license: string;
  description: string;
  k: number;
  sha256: string;
  documents: readonly CorpusDocument[];
  queries: readonly CorpusQuery[];
}>;

export type RetrievalMetrics = Readonly<{
  positiveQueries: number;
  noMatchQueries: number;
  hitAtK: number;
  mrrAtK: number;
  relevantRecallAtK: number;
  expectedDocumentCoverage: number;
  noMatchFalsePositiveRate: number;
}>;

export type RetrievalBaseline = Readonly<{
  schema: "localmind.retrieval-baseline.v1";
  corpusId: string;
  k: number;
  minimum: Readonly<{
    hitAtK: number;
    mrrAtK: number;
    relevantRecallAtK: number;
    expectedDocumentCoverage: number;
  }>;
  maximum: Readonly<{ noMatchFalsePositiveRate: number }>;
  sha256: string;
}>;

export type RankedResult = Readonly<{
  queryId: string;
  relevant: readonly string[];
  returnedDocumentIds: readonly string[];
}>;

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MINIMUM_KEYS = ["hitAtK", "mrrAtK", "relevantRecallAtK", "expectedDocumentCoverage"] as const;

export function sha256(payload: string | Buffer): string {
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}은 object여야 합니다.`);
  return value as Record<string, unknown>;
}

function unit(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${label}은 0 이상 1 이하의 유한수여야 합니다.`);
  }
  return value;
}

function safeFixturePath(root: string, relative: unknown): { relative: string; absolute: string } {
  if (typeof relative !== "string" || relative.length === 0 || relative.includes("\\") || path.isAbsolute(relative)) {
    throw new Error("document path는 상대 POSIX path여야 합니다.");
  }
  const parts = relative.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..") || path.posix.normalize(relative) !== relative) {
    throw new Error("document path traversal은 허용하지 않습니다.");
  }
  if (!relative.endsWith(".md")) throw new Error("document는 Markdown이어야 합니다.");
  const absolute = path.resolve(root, relative);
  const within = path.relative(root, absolute);
  if (within.startsWith("..") || path.isAbsolute(within)) throw new Error("document가 corpus root 밖을 가리킵니다.");
  const stat = fs.lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("document는 symlink가 아닌 regular file이어야 합니다.");
  return { relative, absolute };
}

export function loadCorpus(corpusPath: string): RetrievalCorpus {
  const raw = fs.readFileSync(corpusPath);
  const parsed = object(JSON.parse(raw.toString("utf8")), "corpus");
  if (parsed.schema !== "localmind.retrieval-corpus.v1") throw new Error("지원하지 않는 corpus schema입니다.");
  if (typeof parsed.id !== "string" || !ID.test(parsed.id)) throw new Error("corpus id가 안전하지 않습니다.");
  if (typeof parsed.license !== "string" || parsed.license.length === 0) throw new Error("corpus license가 필요합니다.");
  if (typeof parsed.description !== "string" || parsed.description.length === 0) throw new Error("corpus description이 필요합니다.");
  if (!Number.isInteger(parsed.k) || (parsed.k as number) < 1 || (parsed.k as number) > 10) throw new Error("corpus k는 1..10 정수여야 합니다.");
  if (!Array.isArray(parsed.documents) || parsed.documents.length === 0 || parsed.documents.length > 100) throw new Error("documents는 1..100개여야 합니다.");
  if (!Array.isArray(parsed.queries) || parsed.queries.length === 0 || parsed.queries.length > 100) throw new Error("queries는 1..100개여야 합니다.");

  const root = path.dirname(path.resolve(corpusPath));
  const ids = new Set<string>();
  const paths = new Set<string>();
  const documents = parsed.documents.map((item, index) => {
    const row = object(item, `documents[${index}]`);
    if (typeof row.id !== "string" || !ID.test(row.id) || ids.has(row.id)) throw new Error("document id는 안전하고 고유해야 합니다.");
    ids.add(row.id);
    const safe = safeFixturePath(root, row.path);
    if (paths.has(safe.relative)) throw new Error("document path는 고유해야 합니다.");
    paths.add(safe.relative);
    const bytes = fs.readFileSync(safe.absolute);
    return { id: row.id, path: safe.relative, sourcePath: safe.absolute, bytes, sha256: sha256(bytes) };
  });

  let positive = 0;
  let noMatch = 0;
  const queryIds = new Set<string>();
  const queries = parsed.queries.map((item, index) => {
    const row = object(item, `queries[${index}]`);
    if (typeof row.id !== "string" || !ID.test(row.id) || queryIds.has(row.id)) throw new Error("query id는 안전하고 고유해야 합니다.");
    queryIds.add(row.id);
    if (typeof row.text !== "string" || row.text.trim().length === 0 || row.text.length > 1000) throw new Error("query text는 1..1000자여야 합니다.");
    if (!Array.isArray(row.relevant) || row.relevant.some((id) => typeof id !== "string" || !ids.has(id))) {
      throw new Error("query relevant는 존재하는 document id 배열이어야 합니다.");
    }
    const relevant = [...new Set(row.relevant as string[])];
    if (relevant.length !== row.relevant.length) throw new Error("query relevant에 중복이 없어야 합니다.");
    if (relevant.length > 0) positive++; else noMatch++;
    return { id: row.id, text: row.text, relevant };
  });
  if (positive === 0 || noMatch === 0) throw new Error("corpus에는 positive와 no-match query가 모두 필요합니다.");
  return {
    schema: "localmind.retrieval-corpus.v1",
    id: parsed.id,
    license: parsed.license,
    description: parsed.description,
    k: parsed.k as number,
    sha256: sha256(raw),
    documents,
    queries,
  };
}

export function loadBaseline(baselinePath: string, corpus: RetrievalCorpus): RetrievalBaseline {
  const raw = fs.readFileSync(baselinePath);
  const parsed = object(JSON.parse(raw.toString("utf8")), "baseline");
  if (parsed.schema !== "localmind.retrieval-baseline.v1") throw new Error("지원하지 않는 baseline schema입니다.");
  if (parsed.corpusId !== corpus.id || parsed.k !== corpus.k) throw new Error("baseline이 corpus id/k와 일치하지 않습니다.");
  const minimum = object(parsed.minimum, "baseline.minimum");
  const maximum = object(parsed.maximum, "baseline.maximum");
  return {
    schema: "localmind.retrieval-baseline.v1",
    corpusId: corpus.id,
    k: corpus.k,
    minimum: {
      hitAtK: unit(minimum.hitAtK, "minimum.hitAtK"),
      mrrAtK: unit(minimum.mrrAtK, "minimum.mrrAtK"),
      relevantRecallAtK: unit(minimum.relevantRecallAtK, "minimum.relevantRecallAtK"),
      expectedDocumentCoverage: unit(minimum.expectedDocumentCoverage, "minimum.expectedDocumentCoverage"),
    },
    maximum: { noMatchFalsePositiveRate: unit(maximum.noMatchFalsePositiveRate, "maximum.noMatchFalsePositiveRate") },
    sha256: sha256(raw),
  };
}

export function aggregateMetrics(corpus: RetrievalCorpus, rows: readonly RankedResult[]): RetrievalMetrics {
  if (rows.length !== corpus.queries.length) throw new Error("모든 query 결과가 필요합니다.");
  const documentIds = new Set(corpus.documents.map((document) => document.id));
  const rowByQuery = new Map<string, RankedResult>();
  for (const row of rows) {
    if (rowByQuery.has(row.queryId)) throw new Error("query 결과는 ID별로 정확히 한 건이어야 합니다.");
    if (row.returnedDocumentIds.length > corpus.k || row.returnedDocumentIds.some((id) => !documentIds.has(id))) {
      throw new Error("returned document가 corpus/k 계약을 위반합니다.");
    }
    rowByQuery.set(row.queryId, row);
  }
  const expectedDocuments = new Set(corpus.queries.flatMap((query) => [...query.relevant]));
  const coveredDocuments = new Set<string>();
  let hits = 0;
  let reciprocalRanks = 0;
  let relevantExpected = 0;
  let relevantReturned = 0;
  let noMatchFalsePositives = 0;
  let positiveQueries = 0;
  let noMatchQueries = 0;

  for (const query of corpus.queries) {
    const row = rowByQuery.get(query.id);
    if (!row) throw new Error("query 결과가 corpus 정본과 일치하지 않습니다.");
    const canonical = [...query.relevant].sort();
    const claimed = [...row.relevant].sort();
    if (canonical.length !== claimed.length || canonical.some((id, index) => id !== claimed[index])) {
      throw new Error("query relevance가 corpus 정본과 일치하지 않습니다.");
    }
    const relevant = new Set(query.relevant);
    if (relevant.size === 0) {
      noMatchQueries++;
      if (row.returnedDocumentIds.length > 0) noMatchFalsePositives++;
      continue;
    }
    positiveQueries++;
    relevantExpected += relevant.size;
    const first = row.returnedDocumentIds.findIndex((id) => relevant.has(id));
    if (first >= 0) {
      hits++;
      reciprocalRanks += 1 / (first + 1);
    }
    const returnedRelevant = new Set(row.returnedDocumentIds.filter((id) => relevant.has(id)));
    relevantReturned += returnedRelevant.size;
    for (const id of returnedRelevant) coveredDocuments.add(id);
  }
  return {
    positiveQueries,
    noMatchQueries,
    hitAtK: hits / positiveQueries,
    mrrAtK: reciprocalRanks / positiveQueries,
    relevantRecallAtK: relevantReturned / relevantExpected,
    expectedDocumentCoverage: coveredDocuments.size / expectedDocuments.size,
    noMatchFalsePositiveRate: noMatchFalsePositives / noMatchQueries,
  };
}

export function baselineViolations(metrics: RetrievalMetrics, baseline: RetrievalBaseline): string[] {
  const violations: string[] = [];
  for (const key of MINIMUM_KEYS) {
    if (metrics[key] < baseline.minimum[key]) violations.push(`${key}: ${metrics[key]} < minimum ${baseline.minimum[key]}`);
  }
  if (metrics.noMatchFalsePositiveRate > baseline.maximum.noMatchFalsePositiveRate) {
    violations.push(`noMatchFalsePositiveRate: ${metrics.noMatchFalsePositiveRate} > maximum ${baseline.maximum.noMatchFalsePositiveRate}`);
  }
  return violations;
}

const TOPICS: readonly (readonly string[])[] = [
  ["동기화", "충돌", "병합", "오프라인", "복사본"],
  ["백업", "복원", "암호화", "스냅샷"],
  ["자격 증명", "비밀", "로그", "마스킹", "제어 문자"],
  ["tailscale", "원격", "mcp", "http", "서버"],
  ["파스타", "토마토", "면수", "조리"],
  ["천체", "별 궤적", "노출 시간", "사진"],
];

/** 공개 합성 corpus 전용 결정적 lexical embedding. expected id를 보지 않고 텍스트 토큰만 사용한다. */
export function syntheticTopicEmbedding(text: string, dims: number): number[] {
  if (dims !== TOPICS.length) throw new Error(`synthetic embedding dims는 ${TOPICS.length}여야 합니다.`);
  const lower = text.toLocaleLowerCase("ko-KR");
  return TOPICS.map((tokens) => tokens.reduce((sum, token) => sum + (lower.includes(token) ? 1 : 0), 0));
}

export function atomicWriteJson(destination: string, value: unknown): void {
  const parent = path.dirname(path.resolve(destination));
  fs.mkdirSync(parent, { recursive: true });
  const temporary = path.join(parent, `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    const payload = JSON.stringify(value, null, 2) + "\n";
    fs.writeFileSync(temporary, payload, { flag: "wx", mode: 0o600 });
    fs.renameSync(temporary, destination);
  } finally {
    try { fs.rmSync(temporary, { force: true }); } catch { /* best effort */ }
  }
}
