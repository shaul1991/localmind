/**
 * specs/041 AC-010(보강) — FS access guard 메커니즘 직접 검증.
 *
 * guard는 process-wide monkeypatch 싱글턴이라 전용 프로세스(이 파일)에서 검증한다. 자식
 * 프로세스 통합은 retrieval-quality-adapter.test.ts가 담당하고, 이 파일은 self-test 차단·기록·
 * 통과와 coverage oracle이 registry 밖 path-taking 호출을 실제로 잡아내는지(비-공허성)를 증명한다.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let guard: typeof import("./retrieval-quality/guard.js");
let forbiddenDir: string;
let allowDir: string;

before(async () => {
  forbiddenDir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-guard-forbid-"));
  allowDir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-guard-allow-"));
  guard = await import("./retrieval-quality/guard.js");
  guard.installGuard([forbiddenDir], [allowDir]);
});

test("self-test: forbidden stat/read/write 차단·기록, allow temp 통과, 그 뒤 reset", () => {
  const forbiddenSentinel = path.join(forbiddenDir, "sentinel.txt");
  const allowSentinel = path.join(allowDir, "ok.txt");
  const result = guard.runGuardSelfTest(forbiddenSentinel, allowSentinel);
  assert.equal(result.ok, true, result.details.join("; "));
  assert.deepEqual(result.blockedForbidden, { stat: true, read: true, write: true });
  assert.equal(result.allowedTemp, true);
  // self-test가 기록을 reset했으므로 forbidden 접근 목록이 비어 있다.
  assert.deepEqual(guard.getForbiddenAccesses(), []);
});

test("forbidden prefix 접근은 EACCES로 차단되고 기록된다", () => {
  guard.resetGuardRecords();
  const target = path.join(forbiddenDir, "nested", "note.md");
  assert.throws(() => fs.readFileSync(target), (e: NodeJS.ErrnoException) => e.code === "EACCES");
  const accesses = guard.getForbiddenAccesses();
  assert.equal(accesses.length, 1);
  assert.equal(accesses[0].method, "readFileSync");
  assert.equal(path.resolve(accesses[0].target), path.resolve(target));
});

test("allow prefix 접근은 통과한다(원본 구현)", () => {
  guard.resetGuardRecords();
  const p = path.join(allowDir, "data.txt");
  fs.writeFileSync(p, "hello");
  assert.equal(fs.readFileSync(p, "utf8"), "hello");
  assert.deepEqual(guard.getForbiddenAccesses(), []);
});

test("coverage oracle는 registry 밖 path-taking 호출을 잡아낸다(비-공허성)", () => {
  guard.resetGuardRecords();
  // 브로드 계측이 감싼 registry 밖 path-taking 함수를 호출한다(예: truncate 계열).
  // truncateSync는 GUARDED_METHODS(차단 대상)에 없지만 브로드 계측 대상이므로 observed에 잡히고
  // coverage gap으로 보고돼야 한다 — 오라클이 실제로 미커버 method를 검출함을 증명.
  const p = path.join(allowDir, "trunc.txt");
  fs.writeFileSync(p, "0123456789");
  try {
    (fs as unknown as { truncateSync: (p: string, len?: number) => void }).truncateSync(p, 4);
  } catch {
    /* 일부 플랫폼 차이 무시 — 관측만 확인 */
  }
  const gaps = guard.coverageGaps();
  assert.ok(gaps.includes("truncateSync"), `coverage gap에 truncateSync가 잡혀야 함(실제: ${gaps.join(",")})`);
});
