/**
 * agents/registry.ts 단위 테스트 — 페르소나 정본 파싱·검증 (specs/016 FR-1·FR-2).
 * 순수 파일 IO라 임베딩/게이트웨이 불필요.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { loadRegistry } from "./registry.js";

function tmpRegistry(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "localmind-agents-registry-"));
}

function write(dir: string, name: string, content: string) {
  fs.writeFileSync(path.join(dir, name), content);
}

const VALID = `---
name: critic
description: 적대 검증·품질 게이트
targets:
  claude:
    model: opus
    tools: Read
  codex:
    model: gpt-5.5
    reasoning_effort: high
---
너는 적대적 리뷰어다. 결함을 찾으러 간다.
`;

describe("loadRegistry — 파싱 (FR-1)", () => {
  it("유효한 정의를 파싱한다 — name·description·대상별 model·본문", () => {
    const dir = tmpRegistry();
    try {
      write(dir, "critic.md", VALID);
      const reg = loadRegistry(dir);
      assert.equal(reg.problems.length, 0);
      assert.equal(reg.personas.length, 1);
      const p = reg.personas[0];
      assert.equal(p.name, "critic");
      assert.equal(p.description, "적대 검증·품질 게이트");
      assert.equal(p.targets.claude?.model, "opus");
      assert.equal(p.targets.claude?.tools, "Read");
      assert.equal(p.targets.codex?.model, "gpt-5.5");
      assert.equal(p.targets.codex?.reasoning_effort, "high");
      assert.match(p.prompt, /적대적 리뷰어/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("따옴표로 감싼 값도 파싱한다", () => {
    const dir = tmpRegistry();
    try {
      write(
        dir,
        "librarian.md",
        `---\nname: "librarian"\ndescription: '노트 검색: 합성'\ntargets:\n  claude:\n    model: "sonnet"\n---\n합성 지침.\n`,
      );
      const reg = loadRegistry(dir);
      assert.equal(reg.problems.length, 0);
      assert.equal(reg.personas[0]?.description, "노트 검색: 합성");
      assert.equal(reg.personas[0]?.targets.claude?.model, "sonnet");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("회귀(도그푸드에서 발견): 인라인 주석(값 뒤 ' # ...')을 값에서 벗긴다", () => {
    const dir = tmpRegistry();
    try {
      write(
        dir,
        "commented.md",
        `---\nname: commented   # 이름\ndescription: 설명   # 한 줄\ntargets:\n  codex:\n    model: gpt-5.5   # 모델\n    reasoning_effort: high   # (선택) low·medium·high·xhigh\n---\n지침.\n`,
      );
      const reg = loadRegistry(dir);
      assert.equal(reg.problems.length, 0, JSON.stringify(reg.problems));
      assert.equal(reg.personas[0]?.name, "commented");
      assert.equal(reg.personas[0]?.description, "설명");
      assert.equal(reg.personas[0]?.targets.codex?.reasoning_effort, "high");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("따옴표 값 안의 #은 주석이 아니다", () => {
    const dir = tmpRegistry();
    try {
      write(dir, "hash.md", `---\nname: hash\ndescription: "채널 #general 담당"\ntargets:\n  claude:\n    model: sonnet\n---\n지침.\n`);
      const reg = loadRegistry(dir);
      assert.equal(reg.personas[0]?.description, "채널 #general 담당");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("알 수 없는 필드는 오류가 아니라 경고로 통과한다(전방 호환)", () => {
    const dir = tmpRegistry();
    try {
      write(
        dir,
        "worker.md",
        `---\nname: worker\ndescription: 구현\nscope: notes\ntargets:\n  claude:\n    model: sonnet\n    future_field: x\n---\n지침.\n`,
      );
      const reg = loadRegistry(dir);
      assert.equal(reg.problems.length, 0);
      assert.equal(reg.personas.length, 1);
      assert.ok(reg.warnings.some((w) => w.includes("scope") || w.includes("future_field")));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("레지스트리 폴더가 없으면 빈 결과를 돌려준다(실패 아님)", () => {
    const reg = loadRegistry(path.join(os.tmpdir(), "localmind-definitely-missing-dir"));
    assert.equal(reg.personas.length, 0);
    assert.equal(reg.problems.length, 0);
  });
});

describe("loadRegistry — 검증 (FR-2, AC-3·AC-4)", () => {
  it("AC-3: 필수 필드가 빠진 정의는 문제로 보고하고, 유효한 정의는 살린다", () => {
    const dir = tmpRegistry();
    try {
      write(dir, "critic.md", VALID);
      write(dir, "broken.md", `---\nname: broken\ntargets:\n  claude:\n    model: opus\n---\n지침.\n`); // description 없음
      const reg = loadRegistry(dir);
      assert.equal(reg.personas.length, 1);
      assert.equal(reg.personas[0]?.name, "critic");
      assert.equal(reg.problems.length, 1);
      assert.equal(reg.problems[0]?.file, "broken.md");
      assert.match(reg.problems[0]!.reason, /description/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("AC-4: name이 중복되면 양쪽 모두 문제로 보고하고 어느 쪽도 채택하지 않는다", () => {
    const dir = tmpRegistry();
    try {
      write(dir, "a.md", VALID);
      write(dir, "b.md", VALID);
      const reg = loadRegistry(dir);
      assert.equal(reg.personas.length, 0);
      assert.equal(reg.problems.length, 2);
      for (const pr of reg.problems) assert.match(pr.reason, /중복/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("frontmatter가 없거나 깨진 파일은 문제로 보고한다", () => {
    const dir = tmpRegistry();
    try {
      write(dir, "no-fm.md", "그냥 텍스트만 있는 파일");
      const reg = loadRegistry(dir);
      assert.equal(reg.personas.length, 0);
      assert.equal(reg.problems.length, 1);
      assert.equal(reg.problems[0]?.file, "no-fm.md");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("name이 kebab-case가 아니면 문제로 보고한다", () => {
    const dir = tmpRegistry();
    try {
      write(dir, "bad.md", `---\nname: Bad Name\ndescription: x\ntargets:\n  claude:\n    model: opus\n---\n지침.\n`);
      const reg = loadRegistry(dir);
      assert.equal(reg.personas.length, 0);
      assert.match(reg.problems[0]!.reason, /name/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("대상(targets)이 하나도 없으면 문제로 보고한다", () => {
    const dir = tmpRegistry();
    try {
      write(dir, "no-target.md", `---\nname: no-target\ndescription: x\n---\n지침.\n`);
      const reg = loadRegistry(dir);
      assert.equal(reg.personas.length, 0);
      assert.match(reg.problems[0]!.reason, /대상|targets/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reasoning_effort가 허용값 밖이면 문제로 보고한다", () => {
    const dir = tmpRegistry();
    try {
      write(
        dir,
        "bad-effort.md",
        `---\nname: bad-effort\ndescription: x\ntargets:\n  codex:\n    model: gpt-5.5\n    reasoning_effort: ultra\n---\n지침.\n`,
      );
      const reg = loadRegistry(dir);
      assert.equal(reg.personas.length, 0);
      assert.match(reg.problems[0]!.reason, /reasoning_effort/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("회귀(경미-1): CRLF 줄바꿈 정본도 정상 파싱한다", () => {
    const dir = tmpRegistry();
    try {
      write(dir, "crlf.md", VALID.replace(/\n/g, "\r\n"));
      const reg = loadRegistry(dir);
      assert.equal(reg.problems.length, 0, JSON.stringify(reg.problems));
      assert.equal(reg.personas[0]?.name, "critic");
      assert.ok(!reg.personas[0]!.prompt.includes("\r"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("회귀(경미-4): 레지스트리 안 심볼릭 링크 .md는 조용히 무시하지 않고 경고한다", () => {
    const dir = tmpRegistry();
    try {
      write(dir, "critic.md", VALID);
      fs.symlinkSync(path.join(dir, "critic.md"), path.join(dir, "link.md"));
      const reg = loadRegistry(dir);
      assert.equal(reg.personas.length, 1);
      assert.ok(reg.warnings.some((w) => w.includes("link.md")), `경고 없음: ${JSON.stringify(reg.warnings)}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("회귀(경미-5): model에 산출물 형식을 깨는 문자가 있으면 문제로 보고한다", () => {
    const dir = tmpRegistry();
    try {
      write(dir, "bad-model.md", `---\nname: bad-model\ndescription: x\ntargets:\n  claude:\n    model: "opus\\"주입"\n---\n지침.\n`);
      const reg = loadRegistry(dir);
      assert.equal(reg.personas.length, 0);
      assert.match(reg.problems[0]!.reason, /model/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("숨김 파일과 비-.md 파일은 무시한다", () => {
    const dir = tmpRegistry();
    try {
      write(dir, "critic.md", VALID);
      write(dir, ".hidden.md", "숨김");
      write(dir, "readme.txt", "무관");
      const reg = loadRegistry(dir);
      assert.equal(reg.personas.length, 1);
      assert.equal(reg.problems.length, 0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
