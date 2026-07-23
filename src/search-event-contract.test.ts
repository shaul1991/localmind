/**
 * specs/041 AC-004 — additive 검색 이벤트 계약(JSONL 하위호환 + 매트릭스 + drain + 문구).
 *
 * env(EMBEDDINGS_URL/HOME/NOTES_DIR/BRAIN_INDEX/QUERY_LOG)를 brain import 전에 설정한다.
 * node --test는 파일당 별도 프로세스라 이 파일 상단 설정이 격리된다.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startEmbeddingServer, makeTempEnv, type EmbeddingServer, type TempEnv } from "./retrieval-quality/testkit.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");

let server: EmbeddingServer;
let env: TempEnv;
let brain: typeof import("./brain.js");

before(async () => {
  env = makeTempEnv("lm-rq-event-");
  server = await startEmbeddingServer(16);
  process.env.HOME = env.home;
  process.env.NOTES_DIR = env.notesDir;
  process.env.BRAIN_INDEX = env.indexPath;
  process.env.QUERY_LOG = env.queryLog;
  process.env.EMBEDDINGS_URL = server.url;
  process.env.EMBEDDINGS_KEY = "test";
  process.env.EMBED_RETRIES = "1";
  process.env.EMBED_TIMEOUT_MS = "3000";
  process.env.BRAIN_CHUNK_SIZE = "400";
  // 2개 합성 노트로 임시 색인 구축(canonical source = frontmatter는 무관, production은 path가 원본)
  const mk = (id: string, title: string, body: string) =>
    `---\nid: ${id}\ntitle: ${title}\ntype: reference\nstatus: active\nvisibility: shared\nupdated_at: "2026-01-01T00:00:00Z"\n---\n\n# ${title}\n\n${body}\n`;
  const f1 = path.join(env.notesDir, "alpha.md");
  const f2 = path.join(env.notesDir, "beta.md");
  fs.writeFileSync(f1, mk("EVAL-A", "알파 문서", "오프라인 동기화와 충돌 복사본 보존에 대한 합성 본문."));
  fs.writeFileSync(f2, mk("EVAL-B", "베타 문서", "검색 인덱스 재구축과 정본 마크다운 불변에 대한 합성 본문."));
  brain = await import("./brain.js");
  await brain.retrievalEvaluationPort.prepareDeterministicIndex([f1, f2]);
});

after(async () => {
  await server.close();
  env.cleanup();
});

function lastLogRecords(): Record<string, unknown>[] {
  let raw: string;
  try {
    raw = fs.readFileSync(env.queryLog, "utf8");
  } catch {
    return []; // 아직 로그가 없음(첫 검색 전)
  }
  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

test("results_returned 행: 매트릭스 필드 + topScore===topScores[0]", async () => {
  const before = lastLogRecords().length;
  const hits = await brain.retrievalEvaluationPort.searchNotes("동기화 충돌 복사본", 5);
  const drain = await brain.retrievalEvaluationPort.drainQueryEvents();
  assert.equal(drain.failed, 0);
  assert.ok(hits.length > 0);
  const recs = lastLogRecords();
  assert.equal(recs.length, before + 1); // 정확히 1행
  const r = recs[recs.length - 1];
  assert.equal(r.tool, "search_notes");
  assert.equal(r.outcome, "results_returned");
  assert.equal(r.relevanceJudgment, "not_judged"); // 운영 검색은 관련성 추론 안 함
  assert.equal(r.retrievalAlgorithm, "cosine-full-scan-v1");
  assert.equal(r.embeddingModel, "text-embedding-3-small");
  assert.equal(r.success, true);
  assert.ok(Array.isArray(r.topScores) && (r.topScores as number[]).length >= 1 && (r.topScores as number[]).length <= 3);
  assert.equal((r.topScores as number[])[0], r.topScore); // 결과 있으면 topScore===topScores[0]
  assert.equal(r.uniqueSourceCount, new Set(hits.map((h) => h.path)).size);
});

test("no_results 행: 빈 topScores/uniqueSourceCount 0/topScore null", async () => {
  await brain.retrievalEvaluationPort.searchNotes("아무거나", 5, "존재하지-않는-폴더");
  await brain.retrievalEvaluationPort.drainQueryEvents();
  const r = lastLogRecords().pop()!;
  assert.equal(r.outcome, "no_results");
  assert.equal(r.success, false);
  assert.equal(r.hitCount, 0);
  assert.deepEqual(r.topScores, []);
  assert.equal(r.uniqueSourceCount, 0);
  assert.equal(r.topScore, null);
  assert.equal(r.relevanceJudgment, "not_judged");
});

test("error 행: 예외를 그대로 rethrow + 1행 error 기록", async () => {
  server.failWith(500);
  const before = lastLogRecords().length;
  await assert.rejects(() => brain.retrievalEvaluationPort.searchNotes("임베딩 실패 유도", 5));
  await brain.retrievalEvaluationPort.drainQueryEvents();
  server.failWith(null);
  const recs = lastLogRecords();
  assert.equal(recs.length, before + 1);
  const r = recs[recs.length - 1];
  assert.equal(r.outcome, "error");
  assert.equal(r.success, false);
  assert.equal(r.hitCount, 0);
  assert.deepEqual(r.topScores, []);
  assert.equal(r.uniqueSourceCount, 0);
  assert.equal(r.relevanceJudgment, "not_judged");
});

test("정상 40질의류 drain: attempted===succeeded, failed 0 (sleep 없음)", async () => {
  await brain.retrievalEvaluationPort.drainQueryEvents(); // reset
  for (let i = 0; i < 5; i++) await brain.retrievalEvaluationPort.searchNotes(`질의 ${i}`, 5);
  const drain = await brain.retrievalEvaluationPort.drainQueryEvents();
  assert.deepEqual(drain, { attempted: 5, succeeded: 5, failed: 0 });
});

test("logger append 실패: 성공 응답 불변 + drain {1,0,1}", async () => {
  await brain.retrievalEvaluationPort.drainQueryEvents(); // reset
  // QUERY_LOG를 디렉터리로 바꿔 appendFile을 실패시킨다(queryLogDirReady=true라 mkdir 재생성 안 함).
  fs.rmSync(env.queryLog, { force: true });
  fs.mkdirSync(env.queryLog);
  try {
    const hits = await brain.retrievalEvaluationPort.searchNotes("동기화", 5);
    assert.ok(hits.length > 0); // 로그 실패에도 성공 응답은 동일
    const drain = await brain.retrievalEvaluationPort.drainQueryEvents();
    assert.deepEqual(drain, { attempted: 1, succeeded: 0, failed: 1 });
  } finally {
    fs.rmdirSync(env.queryLog);
    fs.writeFileSync(env.queryLog, "");
  }
});

test("검색·로그 동시 실패: 원래 검색 예외가 유지된다", async () => {
  await brain.retrievalEvaluationPort.drainQueryEvents();
  server.failWith(503);
  fs.rmSync(env.queryLog, { force: true });
  fs.mkdirSync(env.queryLog);
  try {
    await assert.rejects(
      () => brain.retrievalEvaluationPort.searchNotes("동시 실패", 5),
      (e: Error) => /embeddings HTTP 503|503/.test(e.message), // 로그 오류가 아니라 검색(embed) 오류
    );
  } finally {
    server.failWith(null);
    fs.rmdirSync(env.queryLog);
    fs.writeFileSync(env.queryLog, "");
  }
});

// ── 순수 reader 계약(임베딩 불필요) ──────────────────────────────────────────
test("reader: legacy/extended 행 모두 성공 + 잘못된 새 필드만 누락", async () => {
  const qa = await import("./query-analysis.js");
  const legacy = { ts: "2026-07-10T00:00:00Z", tool: "search_notes", query: "구형", hitCount: 3, success: true, topScore: 0.5 };
  const extended = {
    ts: "2026-07-11T00:00:00Z",
    tool: "search_notes",
    query: "신형",
    hitCount: 2,
    success: true,
    topScore: 0.7,
    outcome: "results_returned",
    relevanceJudgment: "not_judged",
    retrievalAlgorithm: "cosine-full-scan-v1",
    embeddingModel: "text-embedding-3-small",
    topScores: [0.7, 0.6],
    uniqueSourceCount: 2,
  };
  const badFields = {
    ts: "2026-07-11T00:00:00Z",
    tool: "search_notes",
    query: "잘못된필드",
    hitCount: 1,
    success: true,
    topScore: 0.9,
    outcome: "weird", // enum 밖
    relevanceJudgment: "", // 빈 값
    retrievalAlgorithm: "", // 빈 식별자
    topScores: [1, 2, 3, 4], // 3개 초과
    uniqueSourceCount: -2, // 음수
  };
  const tmp = path.join(env.home, "reader.jsonl");
  fs.writeFileSync(tmp, [legacy, extended, badFields].map((r) => JSON.stringify(r)).join("\n") + "\n");
  const recs = qa.readRecords(tmp)!;
  assert.equal(recs.length, 3); // 세 행 모두 살아남음
  assert.equal(recs[0].topScore, 0.5); // 기존 필드 불변
  assert.equal(recs[1].outcome, "results_returned");
  assert.deepEqual(recs[1].topScores, [0.7, 0.6]);
  // 잘못된 새 필드는 그 필드만 누락, 행·기존 필드는 유지
  const bad = recs[2] as unknown as Record<string, unknown>;
  assert.equal(bad.query, "잘못된필드");
  assert.equal(bad.topScore, 0.9);
  assert.ok(!("outcome" in bad));
  assert.ok(!("relevanceJudgment" in bad));
  assert.ok(!("retrievalAlgorithm" in bad));
  assert.ok(!("topScores" in bad));
  assert.ok(!("uniqueSourceCount" in bad));
});

// ── 표시 문구 "결과 반환률"(successRate JSON key는 불변) ──────────────────────
test("표시 문구: report-note는 '결과 반환률', successRate key 유지", async () => {
  const qa = await import("./query-analysis.js");
  const reportNote = await import("./report-note.js");
  const recs = [
    { ts: "2026-07-11T00:00:00Z", tool: "search_notes", query: "a", hitCount: 3, success: true },
    { ts: "2026-07-11T00:00:00Z", tool: "search_notes", query: "b", hitCount: 0, success: false },
  ] as import("./query-analysis.js").QueryLogRecord[];
  const a = qa.analyze(recs, { days: 30, minSamples: 1, now: Date.parse("2026-07-12T00:00:00Z") });
  assert.equal(typeof a.successRate, "number"); // JSON/계산 key는 그대로 successRate
  const md = reportNote.renderMarkdown(a, null, new Date("2026-07-12T00:00:00Z"));
  assert.ok(md.includes("결과 반환률"));
  assert.ok(!md.includes("· 성공률 "));
});

// ── query-report --clean: raw-line retention(child process로 실제 스크립트 실행) ──
test("--clean: 유효 ts 30일 초과만 제거, 나머지 byte-for-byte 보존", async () => {
  const oldTs = new Date(Date.now() - 40 * 86400_000).toISOString();
  const recentTs = new Date(Date.now() - 1 * 86400_000).toISOString();
  const lines = [
    JSON.stringify({ ts: oldTs, tool: "search_notes", query: "오래됨", hitCount: 1, success: true }), // 제거 대상
    JSON.stringify({ ts: recentTs, tool: "search_notes", query: "최근", hitCount: 1, success: true, outcome: "results_returned", futureField: 42 }), // 보존(미지 필드 포함)
    "이건 JSON이 아님 — malformed", // 보존
    JSON.stringify({ ts: "not-a-date", tool: "search_notes", query: "해석불가ts", hitCount: 1, success: true }), // 보존
  ];
  const logFile = path.join(env.home, "clean.jsonl");
  const original = lines.join("\n") + "\n";
  fs.writeFileSync(logFile, original);
  execFileSync("npx", ["tsx", "scripts/query-report.ts", "--clean"], {
    cwd: REPO,
    env: { ...process.env, QUERY_LOG: logFile },
    encoding: "utf8",
  });
  const after = fs.readFileSync(logFile, "utf8");
  const keptLines = after.split("\n");
  assert.ok(!after.includes("오래됨")); // 오래된 유효 ts 제거
  assert.ok(after.includes("최근")); // 최근 보존
  assert.ok(after.includes("futureField")); // 미지 필드 손실 없음
  assert.ok(after.includes("이건 JSON이 아님")); // malformed 보존
  assert.ok(after.includes("해석불가ts")); // 해석 불가 ts 보존
  // 보존된 각 라인이 원문과 byte-for-byte 동일
  for (const orig of [lines[1], lines[2], lines[3]]) assert.ok(keptLines.includes(orig));
});
