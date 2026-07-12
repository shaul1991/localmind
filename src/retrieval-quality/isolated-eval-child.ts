/**
 * specs/041 AC-010 — 격리 자식 프로세스 진입점(한 root당 한 프로세스).
 *
 * brain 최초 import 전에:
 *  1) FS access guard를 설치한다(운영형 note/index/query-log 금지 prefix).
 *  2) guard self-test로 forbidden sentinel의 stat/read/write 차단·기록과 temp allow 통과를 증명하고 reset.
 *  3) 임시 HOME/NOTES_DIR/BRAIN_INDEX/QUERY_LOG + 고정 embedding stub을 설정한다.
 * 그 다음 40질의를 평가하고 결과·guard 관측을 JSON으로 stdout에 낸다.
 *
 * env를 import 시점에 캡처하는 brain의 특성상 root별로 별도 프로세스를 쓴다(부모가 두 번 spawn).
 *
 * argv:
 *   --emb-url <url>     고정 embedding stub URL(…/v1)
 *   --root <dir>        격리 temp root
 *   --forbidden <dir>   금지 prefix(운영형 경로 모사)
 */
import fs from "node:fs";
import path from "node:path";

/** 임시 index JSON + 벡터 사이드카(<index>.vec-*) + query-log를 제거한다. */
function cleanupEvalArtifacts(indexPath: string, queryLog: string): void {
  try {
    fs.rmSync(queryLog, { force: true });
  } catch {
    /* best-effort */
  }
  try {
    const dir = path.dirname(indexPath);
    const base = path.basename(indexPath);
    for (const n of fs.readdirSync(dir)) {
      if (n === base || n.startsWith(`${base}.vec-`) || n.startsWith(`${base}.lock`) || n.startsWith(`${base}.tmp-`)) {
        fs.rmSync(path.join(dir, n), { force: true });
      }
    }
  } catch {
    /* best-effort */
  }
}

function arg(name: string): string {
  const i = process.argv.indexOf(name);
  if (i < 0 || i + 1 >= process.argv.length) {
    process.stderr.write(`missing arg ${name}\n`);
    process.exit(3);
  }
  return process.argv[i + 1];
}

async function main(): Promise<void> {
  const embUrl = arg("--emb-url");
  const root = arg("--root");
  const forbidden = arg("--forbidden");

  // guard는 brain import 전에 설치한다.
  const guard = await import("./guard.js");

  const allowDir = fs.mkdtempSync(path.join(root, "allow-"));
  const allowSentinel = path.join(allowDir, "ok.txt");
  const forbiddenSentinel = path.join(forbidden, "sentinel.txt");

  guard.installGuard([forbidden], [allowDir]);
  const selfTest = guard.runGuardSelfTest(forbiddenSentinel, allowSentinel);

  const notesDir = path.join(root, "notes");
  fs.mkdirSync(notesDir, { recursive: true });
  process.env.HOME = root;
  process.env.NOTES_DIR = notesDir;
  process.env.BRAIN_INDEX = path.join(notesDir, ".brain-index.json");
  process.env.QUERY_LOG = path.join(root, "query-log.jsonl");
  process.env.EMBEDDINGS_URL = embUrl;
  process.env.EMBEDDINGS_KEY = "test";
  process.env.EMBED_RETRIES = "1";
  process.env.EMBED_TIMEOUT_MS = "3000";
  process.env.BRAIN_CHUNK_SIZE = "400";

  const indexPath = process.env.BRAIN_INDEX;
  const queryLog = process.env.QUERY_LOG;

  let report: unknown;
  let jsonl: unknown[] = [];
  try {
    const { runEvaluation } = await import("./runner.js");
    report = await runEvaluation({ mode: "test_stub", now: new Date("2026-01-02T03:04:05Z") });
    // 임시 JSONL의 행 수·not_judged를 cleanup 전에 읽는다.
    try {
      jsonl = fs
        .readFileSync(queryLog, "utf8")
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l));
    } catch {
      jsonl = [];
    }
  } finally {
    // 성공·오류 모두에서 임시 index/sidecar/query-log를 제거한다(AC-010 lifecycle).
    cleanupEvalArtifacts(indexPath, queryLog);
  }

  const out = {
    selfTest,
    forbiddenAccesses: guard.getForbiddenAccesses(),
    coverageGaps: guard.coverageGaps(),
    observedMethods: [...guard.getObservedMethods()],
    report,
    jsonl,
  };
  process.stdout.write(JSON.stringify(out));
}

main().catch((e) => {
  process.stderr.write(`child error: ${(e as Error).stack ?? (e as Error).message}\n`);
  process.exit(4);
});
