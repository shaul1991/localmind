/**
 * P4 T4.1 — 재유입 가드(walk grep-0): 활성 표면(src/·docs/·templates/·scripts/·AGENTS.md·
 * README.md)에 은퇴한 논리 ID `sdd-implement`(specs/051에서 `goal-impl`로 개명) 리터럴이
 * 재유입되지 않았는지 검증한다. 허용 = I-4의 2종만 — `specs/**`(이 walk 범위 밖, 역사 기록)
 * + 이 가드 테스트 파일 자신(리터럴을 검색 대상으로 담기 때문). (specs/051 AC-1·AC-6)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SELF = path.resolve(fileURLToPath(import.meta.url));
const FORBIDDEN = "sdd-implement";

const ACTIVE_SURFACE_ROOTS = ["src", "docs", "templates", "scripts"];
const ACTIVE_SURFACE_FILES = ["AGENTS.md", "README.md"];
const SCAN_EXT = /\.(ts|mts|cts|mjs|cjs|js|md|json|toml|sh)$/;
const EXCLUDE_DIRS = new Set(["node_modules", "dist", ".git"]);

function walk(dir: string, out: string[]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (SCAN_EXT.test(e.name)) out.push(p);
  }
}

function collectActiveSurfaceFiles(): string[] {
  const files: string[] = [];
  for (const root of ACTIVE_SURFACE_ROOTS) {
    const abs = path.join(REPO_ROOT, root);
    if (fs.existsSync(abs)) walk(abs, files);
  }
  for (const f of ACTIVE_SURFACE_FILES) {
    const abs = path.join(REPO_ROOT, f);
    if (fs.existsSync(abs)) files.push(abs);
  }
  return files;
}

describe("reentry-guard: AC-1, AC-6", () => {
  it("활성 표면에 은퇴 ID 'sdd-implement' 리터럴이 0건이다(허용: specs/** + 가드 테스트 자신)", () => {
    const offenders: string[] = [];
    for (const f of collectActiveSurfaceFiles()) {
      if (path.resolve(f) === SELF) continue; // I-4 self-exempt — 이 가드 자신은 검색 대상 리터럴을 담는다
      const content = fs.readFileSync(f, "utf8");
      if (content.includes(FORBIDDEN)) offenders.push(path.relative(REPO_ROOT, f));
    }
    assert.deepEqual(offenders, [], `은퇴 ID 재유입: ${offenders.join(", ")}`);
  });
});
