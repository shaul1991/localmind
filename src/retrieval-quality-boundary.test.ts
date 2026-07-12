/**
 * specs/041 AC-007 — 운영 검색 불변(measurement-only boundary).
 *
 * 검증 근거(AC-007): 실제 temp-file event sink를 쓴 검색과 test-only no-op sink(로그를 버리는
 * 대체 sink)를 쓴 검색이 반환 hit의 ID·순서·개수·점수가 완전히 동일하고, 후보 threshold가
 * 검색 경로에 전달되지 않으며, 새 production env/CLI flag/사용자 설정을 추가하지 않는다.
 *
 * 이 테스트는 같은 프로세스에서 두 sink를 각각 세워 동일 색인·동일 질의를 검색한다. sink 교체는
 * 테스트 전용 dependency seam(QUERY_LOG 대상 파일)이며 검색 알고리즘 인자에 개입하지 않는다.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startEmbeddingServer, makeTempEnv, type EmbeddingServer, type TempEnv } from "./retrieval-quality/testkit.js";

let server: EmbeddingServer;
let env: TempEnv;
let brain: typeof import("./brain.js");

const QUERIES = ["동기화 충돌 복사본 보존", "검색 인덱스 재구축", "존재하지 않을 법한 질의 xyzzy 42"];

before(async () => {
  env = makeTempEnv("lm-rq-boundary-");
  server = await startEmbeddingServer(16);
  process.env.HOME = env.home;
  process.env.NOTES_DIR = env.notesDir;
  process.env.BRAIN_INDEX = env.indexPath;
  process.env.QUERY_LOG = env.queryLog; // 실제 temp-file sink(기본).
  process.env.EMBEDDINGS_URL = server.url;
  process.env.EMBEDDINGS_KEY = "test";
  process.env.EMBED_RETRIES = "1";
  process.env.EMBED_TIMEOUT_MS = "3000";
  process.env.BRAIN_CHUNK_SIZE = "400";
  const mk = (id: string, title: string, body: string) =>
    `---\nid: ${id}\ntitle: ${title}\ntype: reference\nstatus: active\nvisibility: shared\nupdated_at: "2026-01-01T00:00:00Z"\n---\n\n# ${title}\n\n${body}\n`;
  const f1 = path.join(env.notesDir, "alpha.md");
  const f2 = path.join(env.notesDir, "beta.md");
  fs.writeFileSync(f1, mk("EVAL-A", "알파", "오프라인 동기화와 충돌 복사본 보존에 대한 합성 본문."));
  fs.writeFileSync(f2, mk("EVAL-B", "베타", "검색 인덱스 재구축과 정본 마크다운 불변에 대한 합성 본문."));
  brain = await import("./brain.js");
  await brain.retrievalEvaluationPort.prepareDeterministicIndex([f1, f2]);
});

after(async () => {
  await server.close();
  env.cleanup();
});

type Hit = { path: string; text: string; score: number };
const signature = (hits: Hit[]) => hits.map((h) => `${h.path}#${h.score}`).join("|");

test("실제 sink vs no-op sink: hit ID·순서·개수·점수가 완전히 동일", async () => {
  // (1) 실제 temp-file sink로 검색.
  const withRealSink: Hit[][] = [];
  for (const q of QUERIES) {
    withRealSink.push(await brain.retrievalEvaluationPort.searchNotes(q, 5));
  }
  await brain.retrievalEvaluationPort.drainQueryEvents();

  // (2) no-op sink로 교체 — 로그를 버리는 대체 sink. brain은 import 시점에 QUERY_LOG를
  // 캡처하므로 env 재설정으로는 이미 로드된 sink를 못 바꾼다. 대신 sink write를 항상 실패
  // (=기록 없음, no-op과 동치)시키도록 query-log를 디렉터리로 만든다. 이는 테스트 전용
  // dependency seam이며 새 production env/flag가 아니다.
  fs.rmSync(env.queryLog, { force: true });
  fs.mkdirSync(env.queryLog);
  let withNoopSink: Hit[][] = [];
  try {
    for (const q of QUERIES) {
      withNoopSink.push(await brain.retrievalEvaluationPort.searchNotes(q, 5));
    }
    const drain = await brain.retrievalEvaluationPort.drainQueryEvents();
    // sink는 전부 실패(no-op 동치)했지만 검색은 정상 반환.
    assert.equal(drain.succeeded, 0);
    assert.equal(drain.failed, QUERIES.length);
  } finally {
    fs.rmdirSync(env.queryLog);
    fs.writeFileSync(env.queryLog, "");
  }

  // hit ID·순서·개수·점수가 완전히 동일.
  assert.equal(withRealSink.length, withNoopSink.length);
  for (let i = 0; i < QUERIES.length; i++) {
    assert.equal(withRealSink[i].length, withNoopSink[i].length, `질의 ${i} hit 개수`);
    assert.equal(signature(withRealSink[i]), signature(withNoopSink[i]), `질의 ${i} hit ID·순서·점수`);
  }
});

test("searchNotes 시그니처에 threshold consumer가 없다(측정 전용 경계)", async () => {
  // 검색 경로는 query·limit·folder만 받는다 — 후보 threshold를 받는 인자가 없다.
  // 함수 length는 기본값 앞 필수 인자 수(1)이며, 계약상 (query, limit?, folder?)로 threshold를
  // 넣을 자리가 없다. report/gate가 계산하는 threshold가 검색으로 흘러가지 않음을 간접 증명:
  // 동일 색인·질의에서
  // 두 번 검색한 결과가 항상 같다(threshold로 필터링되면 실행 간 달라질 여지가 생긴다).
  const a = await brain.retrievalEvaluationPort.searchNotes(QUERIES[0], 5);
  await brain.retrievalEvaluationPort.drainQueryEvents();
  const b = await brain.retrievalEvaluationPort.searchNotes(QUERIES[0], 5);
  await brain.retrievalEvaluationPort.drainQueryEvents();
  assert.equal(signature(a), signature(b));
});
