/**
 * specs/202607201808-critic-efficiency AC-4·AC-7 — review-preflight 진입점 통합 테스트.
 * 순수 검사 로직(4종)은 src/review-preflight.test.ts가 단위로 커버한다. 여기서는 진입점을
 * 일회용 git 저장소에서 실제 실행해 exit code·출력을 관찰한다(도장찍기 금지 — 실제 실행).
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = path.join(REPO_ROOT, "scripts", "review-preflight.ts");
// tsx 바이너리를 절대경로로 직접 실행한다 — `node --import tsx/esm`는 cwd(=일회용 저장소)에서
// tsx 패키지를 재해석하려다 ERR_MODULE_NOT_FOUND로 실패하기 때문(cwd에 node_modules가 없음).
const TSX_BIN = path.join(REPO_ROOT, "node_modules", ".bin", "tsx");

const SPEC_MD = `---\naudience: both\n---\n\n# spec\n\n### AC-1\n- Given x\n- When y\n- Then z\n`;
const PLAN_MD_MATCHING = `---\naudience: both\n---\n\n# plan\n\n## Verification matrix\n\n| AC | 방법 | evidence | 조건 | 상태 |\n|---|---|---|---|---|\n| AC-1 | 단위 | 로그 | green | |\n`;

let root;
before(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-review-preflight-"));
});
after(() => fs.rmSync(root, { recursive: true, force: true }));

function initGitRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
}

function writeSpecFolder(repoDir, specSlug, { planMd = PLAN_MD_MATCHING } = {}) {
  const specDir = path.join(repoDir, "specs", specSlug);
  fs.mkdirSync(specDir, { recursive: true });
  fs.writeFileSync(path.join(specDir, "spec.md"), SPEC_MD);
  fs.writeFileSync(path.join(specDir, "plan.md"), planMd);
  return specDir;
}

function runEntry(cwd, specDir) {
  return execFileSync(TSX_BIN, [ENTRY, specDir], { cwd, encoding: "utf8" });
}

describe("scripts/review-preflight.ts 진입점 (AC-4·AC-7)", () => {
  it("clean 트리(diff --check clean·matrix 전수 대응)에서 exit 0", () => {
    const repoDir = path.join(root, "clean-repo");
    initGitRepo(repoDir);
    const specDir = writeSpecFolder(repoDir, "999-clean");
    // 커밋해 두어 working tree가 clean(diff --check 대상 없음)임을 보장
    execFileSync("git", ["add", "-A"], { cwd: repoDir });
    execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: repoDir });

    const out = runEntry(repoDir, specDir);
    assert.match(out, /통과/);
  });

  it("git diff --check 위반(trailing whitespace·EOF 개행 누락) 트리에서 비0 exit + 위반 메시지", () => {
    const repoDir = path.join(root, "dirty-repo");
    initGitRepo(repoDir);
    const specDir = writeSpecFolder(repoDir, "999-dirty");
    execFileSync("git", ["add", "-A"], { cwd: repoDir });
    execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: repoDir });

    // 추적 파일에 trailing whitespace + 개행 없는 EOF를 만들어 unstaged diff --check 위반을 유발
    const dirtyFile = path.join(repoDir, "dirty.txt");
    fs.writeFileSync(dirtyFile, "clean line\n");
    execFileSync("git", ["add", dirtyFile], { cwd: repoDir });
    execFileSync("git", ["commit", "-q", "-m", "add dirty.txt"], { cwd: repoDir });
    fs.writeFileSync(dirtyFile, "trailing whitespace   \nno-eof-newline");

    let threw = false;
    let stdout = "";
    let stderr = "";
    try {
      execFileSync(TSX_BIN, [ENTRY, specDir], { cwd: repoDir, encoding: "utf8" });
    } catch (e) {
      threw = true;
      stdout = e.stdout ?? "";
      stderr = e.stderr ?? "";
      assert.notEqual(e.status, 0);
    }
    assert.ok(threw, "위반 트리에서는 비0 exit로 실패해야 한다");
    assert.match(stdout + stderr, /위반/);
  });

  it("matrix 전수 대응 위반(spec의 AC가 plan matrix에 없음) 트리에서 비0 exit + 위반 메시지", () => {
    const repoDir = path.join(root, "matrix-mismatch-repo");
    initGitRepo(repoDir);
    const planMdMissingAc = `---\naudience: both\n---\n\n# plan\n\n## Verification matrix\n\n| AC | 방법 | evidence | 조건 | 상태 |\n|---|---|---|---|---|\n`;
    const specDir = writeSpecFolder(repoDir, "999-mismatch", { planMd: planMdMissingAc });
    execFileSync("git", ["add", "-A"], { cwd: repoDir });
    execFileSync("git", ["commit", "-q", "-m", "init"], { cwd: repoDir });

    let threw = false;
    let stdout = "";
    let stderr = "";
    try {
      runEntry(repoDir, specDir);
    } catch (e) {
      threw = true;
      stdout = e.stdout ?? "";
      stderr = e.stderr ?? "";
      assert.notEqual(e.status, 0);
    }
    assert.ok(threw, "matrix 누락 트리에서는 비0 exit로 실패해야 한다");
    assert.match(stdout + stderr, /위반/);
    assert.match(stdout + stderr, /AC-1/);
  });
});
