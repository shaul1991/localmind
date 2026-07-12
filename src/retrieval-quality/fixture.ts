/**
 * 041 fixture 로더·검증기 — 고정 corpus 12개 + query 40개 (specs/041 FR-001).
 *
 * 순수 검증 계산만 담당한다. runner/serializer(FR-002 이후)는 별도 모듈이 소유하며 이
 * 파일이 확장되지 않는다(042 경계 — spec.md "Ownership and 042 Boundary" 참조).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** `tests/fixtures/retrieval-quality/` 절대경로 — 저장소 루트 기준(src/retrieval-quality/에서 두 단계 위). */
export const FIXTURE_ROOT = path.resolve(__dirname, "..", "..", "tests", "fixtures", "retrieval-quality");
export const CORPUS_DIR = path.join(FIXTURE_ROOT, "corpus");
export const QUERIES_PATH = path.join(FIXTURE_ROOT, "queries.ko.json");

export const EXPECTED_DOC_COUNT = 12;
export const EXPECTED_POSITIVE_COUNT = 24;
export const EXPECTED_NO_MATCH_COUNT = 16;
export const EXPECTED_QUERY_COUNT = EXPECTED_POSITIVE_COUNT + EXPECTED_NO_MATCH_COUNT;

export interface FixtureQuery {
  id: string;
  kind: "positive" | "no_match";
  query: string;
  relevantDocIds: string[];
  category: string;
  rationale: string;
}

export interface FixtureQueriesFile {
  schemaVersion: number;
  queries: FixtureQuery[];
}

export interface FixtureDoc {
  id: string;
  file: string;
  /** corpus 파일 절대경로. */
  path: string;
}

export interface FixtureValidationError {
  code: string;
  message: string;
}

export interface FixtureValidationResult {
  ok: boolean;
  errors: FixtureValidationError[];
  docs: FixtureDoc[];
  queries: FixtureQuery[];
}

// FR-001: corpus/query에서 금지하는 패턴 — 개인 절대경로, 저장소 외부 비밀값, 실제 개인 식별자.
// 저장소 안에서도 이 fixture 파일 자체가 그런 값을 담지 않아야 한다(AC-008과 공유하는 규칙).
const HOME_ABS_PATH_RE = /\/(Users|home)\/[^/\s"']+/;
const SECRET_PATTERN_RES: RegExp[] = [
  /sk-[A-Za-z0-9]{16,}/, // OpenAI-style API key
  /AKIA[0-9A-Z]{16}/, // AWS access key id
  /ghp_[A-Za-z0-9]{20,}/, // GitHub personal access token
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

function scanForbiddenText(text: string): string[] {
  const hits: string[] = [];
  if (HOME_ABS_PATH_RE.test(text)) hits.push("home_absolute_path");
  for (const re of SECRET_PATTERN_RES) {
    if (re.test(text)) hits.push("secret_pattern");
  }
  if (EMAIL_RE.test(text)) hits.push("personal_identifier");
  return hits;
}

/** corpus 디렉터리의 모든 항목을 나열한다(하위 디렉터리 포함 — "다른 파일" 검출용). */
function listCorpusEntries(): string[] {
  if (!fs.existsSync(CORPUS_DIR)) return [];
  return fs.readdirSync(CORPUS_DIR).sort();
}

function parseFrontmatterId(raw: string, filePath: string): { id: string | null; error?: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return { id: null, error: `frontmatter 블록을 찾을 수 없음: ${path.basename(filePath)}` };
  const idLine = m[1].split(/\r?\n/).find((l) => l.startsWith("id:"));
  if (!idLine) return { id: null, error: `frontmatter에 id 없음: ${path.basename(filePath)}` };
  return { id: idLine.slice(3).trim() };
}

/** corpus 12개 + queries.ko.json 1개를 검증한다(FR-001). */
export function validateFixture(): FixtureValidationResult {
  const errors: FixtureValidationError[] = [];
  const docs: FixtureDoc[] = [];

  const entries = listCorpusEntries();
  const mdFiles = entries.filter((f) => f.endsWith(".md"));
  const nonMdFiles = entries.filter((f) => !f.endsWith(".md"));
  if (nonMdFiles.length > 0) {
    errors.push({
      code: "unexpected_corpus_file",
      message: `corpus 디렉터리에 예상 외 파일이 있음: ${nonMdFiles.join(", ")}`,
    });
  }
  if (mdFiles.length !== EXPECTED_DOC_COUNT) {
    errors.push({
      code: "doc_count",
      message: `corpus 문서 수가 ${EXPECTED_DOC_COUNT}가 아님(실제 ${mdFiles.length})`,
    });
  }

  const seenIds = new Set<string>();
  for (const file of mdFiles) {
    const abs = path.join(CORPUS_DIR, file);
    const raw = fs.readFileSync(abs, "utf8");
    const { id, error } = parseFrontmatterId(raw, abs);
    if (error) {
      errors.push({ code: "frontmatter_missing_id", message: error });
      continue;
    }
    if (id) {
      if (seenIds.has(id)) {
        errors.push({ code: "duplicate_doc_id", message: `문서 ID 중복: ${id}` });
      }
      seenIds.add(id);
      docs.push({ id, file, path: abs });
    }
    for (const hit of scanForbiddenText(raw)) {
      errors.push({ code: `privacy_${hit}`, message: `${file}에서 금지 패턴 발견: ${hit}` });
    }
  }

  let queriesFile: FixtureQueriesFile | null = null;
  if (!fs.existsSync(QUERIES_PATH)) {
    errors.push({ code: "queries_file_missing", message: `queries.ko.json이 없음: ${QUERIES_PATH}` });
  } else {
    const raw = fs.readFileSync(QUERIES_PATH, "utf8");
    try {
      queriesFile = JSON.parse(raw) as FixtureQueriesFile;
    } catch {
      errors.push({ code: "queries_file_invalid_json", message: "queries.ko.json이 유효한 JSON이 아님" });
    }
    for (const hit of scanForbiddenText(raw)) {
      errors.push({ code: `privacy_${hit}`, message: `queries.ko.json에서 금지 패턴 발견: ${hit}` });
    }
  }

  const queries: FixtureQuery[] = queriesFile?.queries ?? [];

  if (queriesFile && queriesFile.schemaVersion !== 1) {
    errors.push({ code: "schema_version", message: `schemaVersion이 1이 아님(실제 ${queriesFile.schemaVersion})` });
  }

  if (queriesFile) {
    if (queries.length !== EXPECTED_QUERY_COUNT) {
      errors.push({
        code: "query_count",
        message: `질의 수가 ${EXPECTED_QUERY_COUNT}가 아님(실제 ${queries.length})`,
      });
    }
    const positive = queries.filter((q) => q.kind === "positive");
    const noMatch = queries.filter((q) => q.kind === "no_match");
    if (positive.length !== EXPECTED_POSITIVE_COUNT) {
      errors.push({
        code: "positive_count",
        message: `양성 질의 수가 ${EXPECTED_POSITIVE_COUNT}가 아님(실제 ${positive.length})`,
      });
    }
    if (noMatch.length !== EXPECTED_NO_MATCH_COUNT) {
      errors.push({
        code: "no_match_count",
        message: `no-match 질의 수가 ${EXPECTED_NO_MATCH_COUNT}가 아님(실제 ${noMatch.length})`,
      });
    }

    const seenQueryIds = new Set<string>();
    const docIdSet = new Set(docs.map((d) => d.id));
    for (const q of queries) {
      if (seenQueryIds.has(q.id)) {
        errors.push({ code: "duplicate_query_id", message: `질의 ID 중복: ${q.id}` });
      }
      seenQueryIds.add(q.id);

      if (q.kind === "positive") {
        if (!q.relevantDocIds || q.relevantDocIds.length === 0) {
          errors.push({ code: "positive_empty_relevant_doc_ids", message: `양성 질의 relevantDocIds가 비어 있음: ${q.id}` });
        } else {
          for (const docId of q.relevantDocIds) {
            if (!docIdSet.has(docId)) {
              errors.push({
                code: "positive_relevant_doc_id_missing",
                message: `양성 질의 ${q.id}의 relevantDocIds에 존재하지 않는 문서 ID: ${docId}`,
              });
            }
          }
        }
      } else if (q.kind === "no_match") {
        if (!q.relevantDocIds || q.relevantDocIds.length !== 0) {
          errors.push({ code: "no_match_nonempty_relevant_doc_ids", message: `no-match 질의 relevantDocIds가 비어 있지 않음: ${q.id}` });
        }
      } else {
        errors.push({ code: "invalid_kind", message: `알 수 없는 kind: ${q.id} -> ${String(q.kind)}` });
      }

      for (const hit of scanForbiddenText(q.query)) {
        errors.push({ code: `privacy_${hit}`, message: `질의 ${q.id}에서 금지 패턴 발견: ${hit}` });
      }
    }
  }

  return { ok: errors.length === 0, errors, docs, queries };
}

/**
 * fixtureHash — corpus 12개 + queries.ko.json 1개, 정확히 13개 파일만 입력.
 * `tests/fixtures/retrieval-quality/` 기준 상대 POSIX 경로 오름차순으로 읽어
 * `relativePath + NUL + fileBytes + NUL`을 차례로 SHA-256에 넣은 소문자 hex.
 * 절대경로·mtime·디렉터리 순회 순서는 입력이 아니다(spec.md fixtureHash 정의).
 */
export function computeFixtureHash(): string {
  const files = [
    ...fs.readdirSync(CORPUS_DIR).filter((f) => f.endsWith(".md")).map((f) => path.join(CORPUS_DIR, f)),
    QUERIES_PATH,
  ];
  const relPaths = files
    .map((abs) => path.relative(FIXTURE_ROOT, abs).split(path.sep).join("/"))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const hash = crypto.createHash("sha256");
  for (const rel of relPaths) {
    const abs = path.join(FIXTURE_ROOT, ...rel.split("/"));
    const bytes = fs.readFileSync(abs);
    hash.update(Buffer.from(rel, "utf8"));
    hash.update(Buffer.from([0]));
    hash.update(bytes);
    hash.update(Buffer.from([0]));
  }
  return hash.digest("hex");
}

/**
 * 독립 리터럴 — 실제 fixture 파일에서 계산한 값을 검토 후 고정한다(FR-001).
 * 테스트는 이 리터럴과 비교하며 validator가 즉석 계산한 값을 기대값으로 재사용하지 않는다.
 */
export const EXPECTED_FIXTURE_HASH = "c4f24a2229ed3a5c455fa6492f822e9e177e67af2bc6fde1f1101daf8779e585";

/** fixture 디렉터리 안의 파일 목록을 상대 POSIX 경로 오름차순으로 반환한다(13개여야 함, 검증용 헬퍼). */
export function listFixtureRelativePaths(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else out.push(path.relative(FIXTURE_ROOT, abs).split(path.sep).join("/"));
    }
  };
  walk(FIXTURE_ROOT);
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * EVAL-004/EVAL-010이 BRAIN_CHUNK_SIZE=400에서 각각 chunk 2개 이상인지 검증한다(spec.md 190행).
 * brain.ts의 top-level MAX_CHUNK는 process.env.BRAIN_CHUNK_SIZE를 import 시점에 한 번만 읽으므로
 * 호출자는 이 함수를 부르기 전에 BRAIN_CHUNK_SIZE=400을 설정해야 한다.
 */
export async function checkMultiChunkDocs(): Promise<{ id: string; file: string; chunkCount: number }[]> {
  const { chunkText } = await import("../brain.js");
  const targets = ["EVAL-004", "EVAL-010"];
  const result = validateFixture();
  const out: { id: string; file: string; chunkCount: number }[] = [];
  for (const id of targets) {
    const doc = result.docs.find((d) => d.id === id);
    if (!doc) {
      out.push({ id, file: "", chunkCount: 0 });
      continue;
    }
    const raw = fs.readFileSync(doc.path, "utf8");
    const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
    const chunks = chunkText(body);
    out.push({ id, file: doc.file, chunkCount: chunks.length });
  }
  return out;
}
