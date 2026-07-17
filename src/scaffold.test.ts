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
      assert.ok(fs.existsSync(path.join(dir, "CLAUDE.md")));
      assert.ok(fs.existsSync(path.join(dir, "GEMINI.md")));
      assert.deepEqual(
        result.items.map((i) => i.status),
        ["created", "created", "created", "created"],
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
        ["skipped", "skipped", "skipped", "skipped"],
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("scaffold-runtime-bridges: AC-16", () => {
  it("root: CLAUDE.md·GEMINI.md가 AGENTS.md를 import한다", () => {
    const claude = fs.readFileSync(path.join(REPO_ROOT, "CLAUDE.md"), "utf8");
    const gemini = fs.readFileSync(path.join(REPO_ROOT, "GEMINI.md"), "utf8");
    assert.match(claude, /@AGENTS\.md/);
    assert.match(gemini, /@\.\/AGENTS\.md/);
  });

  it("scaffold: 없는 bridge만 생성하고 AGENTS.md를 import한다", () => {
    const dir = tmpDir();
    try {
      scaffoldSdd(dir);
      assert.match(fs.readFileSync(path.join(dir, "CLAUDE.md"), "utf8"), /@AGENTS\.md/);
      assert.match(fs.readFileSync(path.join(dir, "GEMINI.md"), "utf8"), /@\.\/AGENTS\.md/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("기존 bridge 파일은 절대 덮어쓰지 않고, 없는 것만 채운다(item 단위)", () => {
    const dir = tmpDir();
    try {
      fs.writeFileSync(path.join(dir, "CLAUDE.md"), "내 CLAUDE 설정 — 건드리지 말 것");
      const result = scaffoldSdd(dir);
      assert.equal(fs.readFileSync(path.join(dir, "CLAUDE.md"), "utf8"), "내 CLAUDE 설정 — 건드리지 말 것");
      assert.equal(result.items.find((i) => i.path === "CLAUDE.md")?.status, "skipped");
      assert.equal(result.items.find((i) => i.path === "AGENTS.md")?.status, "created");
      assert.equal(result.items.find((i) => i.path === "GEMINI.md")?.status, "created");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("새 scaffold SDD 실행 규약은 goal-impl를 쓴다(built-in /goal shadow 아님)", () => {
    const dir = tmpDir();
    try {
      scaffoldSdd(dir);
      const agents = fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8");
      assert.match(agents, /goal-impl/);
      assert.ok(!/## `\/goal \{NNN\}` 처리 방법/.test(agents), "old /goal 구현 표면 없음");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // scaffold 산출물이 timestamp 규약을 가르치는지 실제 생성물로 확인한다 — 정본(root AGENTS.md)만
  // 고치고 scaffold 템플릿을 놓치면 새 프로젝트가 구 충돌 규칙을 물려받는다(2026-07-17 PR #26 드리프트).
  it("scaffold된 AGENTS.md는 timestamp 프리픽스 + 배타적 생성 규약을 가르친다(구 NNN/max+1 부재)", () => {
    const dir = tmpDir();
    try {
      scaffoldSdd(dir);
      const agents = fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8");
      const flat = agents.replace(/\s+/g, " "); // 줄바꿈 무관하게 규칙 문구를 핀한다
      assert.match(agents, /specs\/\{timestamp\}-\{feature-slug\}\//, "timestamp 폴더 규약");
      assert.ok(flat.includes("`mkdir`(`-p` 금지)"), "배타적 생성");
      assert.ok(flat.includes("현재 시각을 다시 읽어"), "재시도 종료성(시각 재독)");
      assert.ok(flat.includes("프리픽스는 유일하지 않을 수 있다"), "프리픽스 모호성 표기");
      assert.ok(flat.includes("어느 spec인지 사용자에게 묻는다"), "모호 프리픽스 → 사용자에게 질의 가드");
      assert.ok(!/최댓값 \+ 1/.test(agents), "구 max+1 규칙 부재");
      assert.ok(!/specs\/\{NNN\}-/.test(agents), "구 NNN 폴더 규약 부재");
      assert.ok(!/원인자가 정확히 3자리 숫자일 때/.test(agents), "구 3자리 전용 활성화 규칙 부재");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("scaffold dangling-symlink safety (R4-04)", () => {
  for (const name of ["AGENTS.md", "CLAUDE.md", "GEMINI.md"]) {
    it(`${name}: dangling bridge symlink을 따라가 외부 파일을 만들지 않는다(skipped, 링크 불변)`, () => {
      const parent = tmpDir();
      try {
        const external = path.join(parent, "outside.md"); // 존재하지 않는 외부 referent
        const dir = path.join(parent, "proj");
        fs.mkdirSync(dir);
        fs.symlinkSync(external, path.join(dir, name)); // dangling symlink
        const result = scaffoldSdd(dir);
        assert.ok(fs.lstatSync(path.join(dir, name)).isSymbolicLink(), `${name} 심링크 유지(변경 없음)`);
        assert.ok(!fs.existsSync(external), `${name} 외부 referent를 만들지 않는다`);
        assert.equal(result.items.find((i) => i.path === name)!.status, "skipped", `${name} skipped 보고`);
      } finally {
        fs.rmSync(parent, { recursive: true, force: true });
      }
    });
  }

  it("기존 파일을 가리키는 bridge symlink은 referent 내용을 덮어쓰지 않는다", () => {
    const parent = tmpDir();
    try {
      const dir = path.join(parent, "proj");
      fs.mkdirSync(dir);
      const real = path.join(parent, "real-agents.md");
      fs.writeFileSync(real, "원본 내용 — 건드리지 말 것");
      fs.symlinkSync(real, path.join(dir, "AGENTS.md"));
      const result = scaffoldSdd(dir);
      assert.equal(fs.readFileSync(real, "utf8"), "원본 내용 — 건드리지 말 것", "referent 내용 불변");
      assert.equal(result.items.find((i) => i.path === "AGENTS.md")!.status, "skipped");
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });

  it("bridge 이름이 디렉토리로 점유되어 있으면 덮어쓰지 않고 skipped", () => {
    const dir = tmpDir();
    try {
      fs.mkdirSync(path.join(dir, "CLAUDE.md"));
      const result = scaffoldSdd(dir);
      assert.ok(fs.statSync(path.join(dir, "CLAUDE.md")).isDirectory(), "디렉토리 그대로");
      assert.equal(result.items.find((i) => i.path === "CLAUDE.md")!.status, "skipped");
      // 없는 형제 bridge는 정상 생성
      assert.equal(result.items.find((i) => i.path === "AGENTS.md")!.status, "created");
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
