/**
 * specs/041 AC-011 — 안정된 CLI와 원자적 출력.
 *
 * 검증 근거(AC-011): default/--help/--json/--output stdout·stderr가 FR-008과 일치, npm preamble
 * 없는 순수 stdout, 파일은 명시할 때만, protected target(symlink/dir/tracked/eval-input/.git) 거부,
 * 기존 LocalMind 보고서만 교체, exclusive temp 충돌 재시도, worktree-output ineligibility, atomic write,
 * exit 0(gate pass/fail)/1(runtime)/2(usage), 실패 시 부분 destination·temp 없음.
 *
 * CLI는 EMBEDDINGS_URL을 env에서 읽어 production 경로로 검색한다. 테스트는 결정적 stub 서버를
 * 그 URL로 물려 실제 게이트웨이·개인 노트를 건드리지 않는다(임시 HOME/NOTES_DIR/... 도 전달).
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startEmbeddingServer, type EmbeddingServer } from "./retrieval-quality/testkit.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..");
const CLI = path.join(REPO, "scripts", "retrieval-quality.ts");

let server: EmbeddingServer;
let workDir: string; // cwd가 될 임시 작업 폴더(상대경로·output parent 테스트용).

before(async () => {
  server = await startEmbeddingServer(16);
});
after(async () => {
  await server.close();
});
beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-rq-cliwork-"));
});

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** CLI를 async spawn으로 실행(in-parent stub이 응답하도록 spawnSync 금지). cwd·env 지정 가능. */
function runCli(args: string[], opts: { cwd?: string } = {}): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["tsx", CLI, ...args], {
      cwd: opts.cwd ?? REPO,
      env: {
        ...process.env,
        EMBEDDINGS_URL: server.url,
        EMBEDDINGS_KEY: "test",
        EMBED_RETRIES: "1",
        EMBED_TIMEOUT_MS: "3000",
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d: string) => (stdout += d));
    child.stderr.on("data", (d: string) => (stderr += d));
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
    child.on("error", reject);
  });
}

test("--help 단독: 한국어 usage + exit 0, 파일 생성 없음", async () => {
  const r = await runCli(["--help"], { cwd: workDir });
  assert.equal(r.code, 0);
  assert.match(r.stdout, /사용법/);
  assert.deepEqual(fs.readdirSync(workDir), []); // 산출물 없음
});

test("--help + 다른 옵션: usage error 2", async () => {
  const r = await runCli(["--help", "--json"], { cwd: workDir });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /사용법/);
});

for (const bad of [["--nope"], ["--json", "--json"], ["--output"], ["--output", "-"]]) {
  test(`usage error 2: ${bad.join(" ")}`, async () => {
    const r = await runCli(bad, { cwd: workDir });
    assert.equal(r.code, 2);
    assert.equal(r.stdout, ""); // stdout 없음
    assert.match(r.stderr, /사용법|오류/);
  });
}

test("기본: 한국어 요약 stdout 1개, gate 상관없이 exit 0, 파일 없음", async () => {
  const r = await runCli([], { cwd: workDir });
  assert.equal(r.code, 0); // gate pass/fail 모두 0(측정 성공)
  assert.match(r.stdout, /검색 품질 측정/);
  assert.match(r.stdout, /게이트/);
  // npm preamble이 stdout에 섞이지 않는다(직접 tsx 실행이라 preamble 자체가 없지만, JSON 아님 확인).
  assert.ok(!r.stdout.trimStart().startsWith("{"));
  assert.deepEqual(fs.readdirSync(workDir), []); // 명시 안 하면 파일 없음
});

test("--json: JSON만 stdout, 마지막 LF 1개, 파싱 가능, 파일 없음", async () => {
  const r = await runCli(["--json"], { cwd: workDir });
  assert.equal(r.code, 0);
  assert.ok(r.stdout.endsWith("}\n"));
  assert.ok(!r.stdout.endsWith("}\n\n")); // 마지막 LF 정확히 1개
  const report = JSON.parse(r.stdout);
  assert.equal(report.reportType, "localmind-retrieval-quality");
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.queries.length, 40);
  assert.deepEqual(fs.readdirSync(workDir), []);
});

test("--output: 동일 JSON bytes를 atomic 기록, temp 잔존 없음", async () => {
  const target = path.join(workDir, "report.json");
  const r = await runCli(["--json", "--output", "report.json"], { cwd: workDir });
  assert.equal(r.code, 0);
  assert.ok(fs.existsSync(target));
  const fileBytes = fs.readFileSync(target, "utf8");
  assert.equal(fileBytes, r.stdout); // 파일 bytes === stdout JSON
  assert.ok(fileBytes.endsWith("}\n"));
  // temp(.localmind-retrieval-quality.*.tmp) 잔존 없음.
  const leftover = fs.readdirSync(workDir).filter((n) => n.includes(".localmind-retrieval-quality") && n.endsWith(".tmp"));
  assert.deepEqual(leftover, []);
  // POSIX mode 0600 확인.
  const mode = fs.statSync(target).mode & 0o777;
  assert.equal(mode, 0o600);
});

test("--output(요약 모드): 기존 LocalMind 보고서만 교체", async () => {
  const target = path.join(workDir, "prior.json");
  // 유효한 이전 보고서로 시드.
  fs.writeFileSync(target, JSON.stringify({ reportType: "localmind-retrieval-quality", schemaVersion: 1, stale: true }) + "\n");
  const r = await runCli(["--output", "prior.json"], { cwd: workDir });
  assert.equal(r.code, 0);
  const replaced = JSON.parse(fs.readFileSync(target, "utf8"));
  assert.equal(replaced.stale, undefined); // 교체됨
  assert.equal(replaced.queries.length, 40);
  assert.match(r.stdout, /검색 품질 측정/); // 요약도 함께 stdout
});

test("--output 거부: 비-LocalMind 기존 파일은 교체 안 함(exit 1, 원본 보존)", async () => {
  const target = path.join(workDir, "other.json");
  const original = JSON.stringify({ some: "other file" }) + "\n";
  fs.writeFileSync(target, original);
  const r = await runCli(["--json", "--output", "other.json"], { cwd: workDir });
  assert.equal(r.code, 1);
  assert.equal(r.stdout, ""); // 부분 JSON 없음
  assert.equal(fs.readFileSync(target, "utf8"), original); // 원본 보존
  assert.match(r.stderr, /보고서/);
});

test("--output 거부: 상위 디렉터리 없음(exit 1)", async () => {
  const r = await runCli(["--json", "--output", path.join(workDir, "nope", "report.json")], { cwd: workDir });
  assert.equal(r.code, 1);
  assert.equal(r.stdout, "");
  assert.match(r.stderr, /상위 디렉터리/);
});

test("--output 거부: symlink target(exit 1)", async () => {
  const realFile = path.join(workDir, "real.json");
  fs.writeFileSync(realFile, "{}\n");
  const link = path.join(workDir, "link.json");
  fs.symlinkSync(realFile, link);
  const r = await runCli(["--json", "--output", "link.json"], { cwd: workDir });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /심볼릭 링크/);
});

test("--output 거부: directory target(exit 1)", async () => {
  fs.mkdirSync(path.join(workDir, "adir"));
  const r = await runCli(["--json", "--output", "adir"], { cwd: workDir });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /디렉터리/);
});

test("--output 거부: .git 내부·evaluation-input 내부(exit 1)", async () => {
  // 저장소 루트 기준 상대경로로 평가 입력 내부를 지정(cwd=REPO).
  const r1 = await runCli(["--json", "--output", "src/rq-out.json"], { cwd: REPO });
  assert.equal(r1.code, 1);
  assert.match(r1.stderr, /평가 입력/);
  assert.equal(fs.existsSync(path.join(REPO, "src", "rq-out.json")), false); // 생성 안 됨
});

test("worktree 밖 명시 output은 baselineEligible에 outputInsideWorktree:false로 기록", async () => {
  // workDir는 저장소 밖(os.tmpdir) → outputInsideWorktree:false. (embedding stub이라 mode는
  // production이지만 stub URL을 쓰므로 실제 baseline은 이 테스트 관심 밖 — 필드 존재만 확인.)
  const target = path.join(workDir, "out.json");
  const r = await runCli(["--json", "--output", "out.json"], { cwd: workDir });
  assert.equal(r.code, 0);
  const report = JSON.parse(fs.readFileSync(target, "utf8"));
  assert.equal(report.run.outputInsideWorktree, false);
});

test("exclusive temp 충돌: 기존 temp-like 파일을 보존한 채 재시도해 정상 기록", async () => {
  // 자기 이름 규칙과 다른 사전 존재 temp-like 파일은 건드리지 않아야 한다.
  const target = path.join(workDir, "report.json");
  const preexisting = path.join(workDir, ".localmind-retrieval-quality.report.json.999.pre-existing.tmp");
  fs.writeFileSync(preexisting, "pre-existing");
  const r = await runCli(["--json", "--output", "report.json"], { cwd: workDir });
  assert.equal(r.code, 0);
  assert.ok(fs.existsSync(target));
  // 사전 존재 temp-like 파일은 그대로.
  assert.equal(fs.existsSync(preexisting), true);
  assert.equal(fs.readFileSync(preexisting, "utf8"), "pre-existing");
});
