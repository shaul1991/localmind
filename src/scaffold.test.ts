/**
 * scaffold.ts 단위 테스트 — node:test 기반. 순수 파일 IO라 임베딩/게이트웨이 불필요.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { scaffoldSdd, formatScaffoldResult } from "./scaffold.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "localmind-scaffold-test-"));
}

describe("scaffoldSdd", () => {
  it("AC-1: 빈 디렉토리에 AGENTS.md와 specs/를 생성한다", () => {
    const dir = tmpDir();
    try {
      const result = scaffoldSdd(dir);
      assert.ok(fs.existsSync(path.join(dir, "AGENTS.md")));
      assert.ok(fs.existsSync(path.join(dir, "specs")));
      assert.ok(fs.existsSync(path.join(dir, "specs", "goal.template.md")));
      assert.ok(fs.existsSync(path.join(dir, "specs", "spec.template.md")));
      assert.ok(fs.existsSync(path.join(dir, "specs", "plan.template.md")));
      assert.deepEqual(
        result.items.map((i) => i.status),
        ["created", "created"],
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("AC-3: 기존 AGENTS.md가 있으면 덮어쓰지 않고 skipped로 보고한다", () => {
    const dir = tmpDir();
    try {
      fs.writeFileSync(path.join(dir, "AGENTS.md"), "내 커스텀 규칙 — 건드리지 말 것");
      const result = scaffoldSdd(dir);
      const content = fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8");
      assert.equal(content, "내 커스텀 규칙 — 건드리지 말 것");
      const agentsItem = result.items.find((i) => i.path === "AGENTS.md");
      assert.equal(agentsItem?.status, "skipped");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("AC-4: 존재하지 않는 디렉토리 경로를 새로 생성한다", () => {
    const parent = tmpDir();
    const dir = path.join(parent, "nested", "project");
    try {
      assert.ok(!fs.existsSync(dir));
      scaffoldSdd(dir);
      assert.ok(fs.existsSync(path.join(dir, "AGENTS.md")));
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });

  it("AC-5: 생성된 AGENTS.md에 localmind 고유 문구가 포함되지 않는다", () => {
    const dir = tmpDir();
    try {
      scaffoldSdd(dir);
      const content = fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8");
      for (const banned of ["make backup", "localmind", "오픈소스 개인 second-brain"]) {
        assert.ok(!content.includes(banned), `금지 문구 발견: "${banned}"`);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("AC-7: specs/만 있고 AGENTS.md는 없으면 AGENTS.md만 생성하고 specs/는 건너뛴다", () => {
    const dir = tmpDir();
    try {
      fs.mkdirSync(path.join(dir, "specs"));
      fs.writeFileSync(path.join(dir, "specs", "내-기존-파일.md"), "이미 있던 내용");
      const result = scaffoldSdd(dir);

      assert.ok(fs.existsSync(path.join(dir, "AGENTS.md")));
      assert.ok(!fs.existsSync(path.join(dir, "specs", "goal.template.md")));
      assert.ok(fs.existsSync(path.join(dir, "specs", "내-기존-파일.md")));

      const agentsItem = result.items.find((i) => i.path === "AGENTS.md");
      const specsItem = result.items.find((i) => i.path === "specs/");
      assert.equal(agentsItem?.status, "created");
      assert.equal(specsItem?.status, "skipped");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("targetDir가 상대경로면 명확한 에러로 거부한다(장수명 프로세스 cwd 모호성 방지)", () => {
    assert.throws(() => scaffoldSdd("relative/path"), /절대경로/);
  });

  it("동일 targetDir에 두 번 실행해도 두 번째는 전부 skipped(멱등)", () => {
    const dir = tmpDir();
    try {
      scaffoldSdd(dir);
      const second = scaffoldSdd(dir);
      assert.deepEqual(
        second.items.map((i) => i.status),
        ["skipped", "skipped"],
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("scripts/init-sdd.ts (CLI 진입점, 실제 프로세스 실행)", () => {
  it("AC-1: `npm run init-sdd -- <path>`를 실제로 실행하면 AGENTS.md·specs/가 생성된다", () => {
    const dir = tmpDir();
    try {
      const out = execFileSync(
        "npx",
        ["tsx", "scripts/init-sdd.ts", dir],
        { cwd: REPO_ROOT, encoding: "utf8" },
      );
      assert.match(out, /생성됨: AGENTS\.md/);
      assert.match(out, /생성됨: specs\//);
      assert.ok(fs.existsSync(path.join(dir, "AGENTS.md")));
      assert.ok(fs.existsSync(path.join(dir, "specs", "goal.template.md")));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("상대경로를 주면 호출 시점의 cwd(REPO_ROOT) 기준으로 절대경로로 변환해 처리한다", () => {
    const dir = tmpDir();
    const rel = path.relative(REPO_ROOT, dir);
    try {
      execFileSync("npx", ["tsx", "scripts/init-sdd.ts", rel], { cwd: REPO_ROOT, encoding: "utf8" });
      assert.ok(fs.existsSync(path.join(dir, "AGENTS.md")));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("formatScaffoldResult", () => {
  it("created/skipped를 사람이 읽기 쉬운 텍스트로 변환한다", () => {
    const text = formatScaffoldResult({
      items: [
        { path: "AGENTS.md", status: "created" },
        { path: "specs/", status: "skipped" },
      ],
    });
    assert.match(text, /생성됨: AGENTS\.md/);
    assert.match(text, /건너뜀\(이미 존재\): specs\//);
  });
});
