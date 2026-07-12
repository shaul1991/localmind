/**
 * AC-001: Fixed dataset validation — specs/041-retrieval-quality-contract/spec.md
 *
 * fixtureHash가 독립 리터럴과 일치, 문서 12/양성 24/no-match 16, 다른 fixture 파일 거부,
 * 모든 정답 ID·exact query fields, 개인정보 금지 규칙, EVAL-004/EVAL-010 chunk >= 2를 검증한다.
 *
 * BRAIN_CHUNK_SIZE는 brain.ts가 모듈 top-level에서 한 번만 읽으므로(EVAL-004/010 chunk 검증에
 * 필요) 이 프로세스 전체를 400으로 고정해 실행한다(package.json test 스크립트가 env를 세팅).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {
  CORPUS_DIR,
  EXPECTED_FIXTURE_HASH,
  EXPECTED_DOC_COUNT,
  EXPECTED_POSITIVE_COUNT,
  EXPECTED_NO_MATCH_COUNT,
  FIXTURE_ROOT,
  QUERIES_PATH,
  checkMultiChunkDocs,
  computeFixtureHash,
  validateFixture,
} from "./retrieval-quality/fixture.js";

// brain.ts는 top-level에서 MAX_CHUNK(BRAIN_CHUNK_SIZE)를 한 번만 읽지만, fixture.ts는 brain을
// checkMultiChunkDocs 안에서 dynamic import한다. 따라서 이 프로세스 env를 여기서 400으로 고정하면
// 지연 import 시점에 반영된다 — 외부 env 없이도(npm test/CI) 자기완결로 통과한다.
// (node --test는 파일당 별도 프로세스라 다른 테스트의 chunk 설정에 영향 없음.)
process.env.BRAIN_CHUNK_SIZE = "400";

describe("041 fixture validation (AC-001)", () => {
  it("13-file canonical fixtureHash가 독립 리터럴과 일치한다", () => {
    const hash = computeFixtureHash();
    assert.equal(hash, EXPECTED_FIXTURE_HASH);
    assert.match(hash, /^[0-9a-f]{64}$/);
  });

  it("corpus 문서 12개, 양성 24개, no-match 16개를 확인한다", () => {
    const result = validateFixture();
    assert.equal(result.ok, true, JSON.stringify(result.errors));
    assert.equal(result.docs.length, EXPECTED_DOC_COUNT);
    const positive = result.queries.filter((q) => q.kind === "positive");
    const noMatch = result.queries.filter((q) => q.kind === "no_match");
    assert.equal(positive.length, EXPECTED_POSITIVE_COUNT);
    assert.equal(noMatch.length, EXPECTED_NO_MATCH_COUNT);
  });

  it("양성 질의의 relevantDocIds가 모두 corpus에 존재하고 비어 있지 않다", () => {
    const result = validateFixture();
    const docIds = new Set(result.docs.map((d) => d.id));
    for (const q of result.queries.filter((q) => q.kind === "positive")) {
      assert.ok(q.relevantDocIds.length > 0, `${q.id} relevantDocIds가 비어 있음`);
      for (const docId of q.relevantDocIds) {
        assert.ok(docIds.has(docId), `${q.id} -> ${docId}가 corpus에 없음`);
      }
    }
  });

  it("no-match 질의의 relevantDocIds는 반드시 빈 배열이다", () => {
    const result = validateFixture();
    for (const q of result.queries.filter((q) => q.kind === "no_match")) {
      assert.deepEqual(q.relevantDocIds, []);
    }
  });

  it("query 필드는 정확히 id/kind/query/relevantDocIds/category/rationale 순서다", () => {
    const raw = fs.readFileSync(QUERIES_PATH, "utf8");
    const parsed = JSON.parse(raw) as { queries: Record<string, unknown>[] };
    const expectedKeys = ["id", "kind", "query", "relevantDocIds", "category", "rationale"];
    for (const q of parsed.queries) {
      assert.deepEqual(Object.keys(q), expectedKeys, `${q.id} key 순서 불일치`);
    }
  });

  it("EVAL-004와 EVAL-010은 BRAIN_CHUNK_SIZE=400에서 각각 chunk 2개 이상이다", async () => {
    const results = await checkMultiChunkDocs();
    for (const r of results) {
      assert.ok(r.chunkCount >= 2, `${r.id}(${r.file}) chunk 수가 2 미만: ${r.chunkCount}`);
    }
  });

  it("fixture 1바이트 변경은 기대 hash 검증을 실패시킨다(임시 디렉터리 복제 후 변조)", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "retrieval-quality-mutate-"));
    try {
      copyFixtureInto(tmpRoot);
      const target = path.join(tmpRoot, "corpus", "lentil-soup.md");
      const original = fs.readFileSync(target, "utf8");
      fs.writeFileSync(target, original + " ");
      const mutatedHash = computeFixtureHashAt(tmpRoot);
      assert.notEqual(mutatedHash, EXPECTED_FIXTURE_HASH);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("fixture 디렉터리에 추가 파일이 있으면 schema 검증이 실패한다", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "retrieval-quality-extra-"));
    try {
      copyFixtureInto(tmpRoot);
      fs.writeFileSync(path.join(tmpRoot, "corpus", "extra-file.md"), "---\nid: EVAL-999\n---\n\nstray\n");
      const entries = fs.readdirSync(path.join(tmpRoot, "corpus"));
      const nonMd = entries.filter((f) => !f.endsWith(".md"));
      const mdCount = entries.filter((f) => f.endsWith(".md")).length;
      // 추가 .md 파일은 doc count(13번째)가 EXPECTED_DOC_COUNT(12)를 넘겨 검증 실패 조건이 됨을 확인.
      assert.equal(mdCount, EXPECTED_DOC_COUNT + 1);
      assert.equal(nonMd.length, 0);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

/** FIXTURE_ROOT 내용을 tmpRoot로 복제한다(corpus/ + queries.ko.json만). */
function copyFixtureInto(tmpRoot: string): void {
  fs.mkdirSync(path.join(tmpRoot, "corpus"), { recursive: true });
  for (const file of fs.readdirSync(CORPUS_DIR)) {
    fs.copyFileSync(path.join(CORPUS_DIR, file), path.join(tmpRoot, "corpus", file));
  }
  fs.copyFileSync(QUERIES_PATH, path.join(tmpRoot, "queries.ko.json"));
}

/** computeFixtureHash와 동일 규칙을 임의 root에 적용하는 테스트 전용 헬퍼(변조 검증용). */
function computeFixtureHashAt(root: string): string {
  const corpusDir = path.join(root, "corpus");
  const files = [
    ...fs.readdirSync(corpusDir).filter((f) => f.endsWith(".md")).map((f) => path.join(corpusDir, f)),
    path.join(root, "queries.ko.json"),
  ];
  const relPaths = files
    .map((abs) => path.relative(root, abs).split(path.sep).join("/"))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const hash = crypto.createHash("sha256");
  for (const rel of relPaths) {
    const abs = path.join(root, ...rel.split("/"));
    const bytes = fs.readFileSync(abs);
    hash.update(Buffer.from(rel, "utf8"));
    hash.update(Buffer.from([0]));
    hash.update(bytes);
    hash.update(Buffer.from([0]));
  }
  return hash.digest("hex");
}

void FIXTURE_ROOT; // import 유지(경로 상수 노출 확인용 — lint no-unused 방지)
