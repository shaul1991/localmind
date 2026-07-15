/**
 * rules/deploy.ts 통합 테스트 — 표면 배포·멱등·prune·사용자 저작 보호·경로무관·대상 게이트
 * (specs/041 AC-1·AC-2·AC-3·AC-4·AC-5·AC-7·AC-8). 모든 경로를 임시 트리로 주입한다.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { deployRules, matchProject, normalizeProject } from "./deploy.js";
import { SECTION_BEGIN, SECTION_END, wrapSection } from "./render.js";

let root: string;
let rulesRoot: string;
let claudeHome: string;
let codexHome: string;

function writeRule(rel: string, content: string) {
  const full = path.join(rulesRoot, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}
function read(p: string): string {
  return fs.readFileSync(p, "utf8");
}
function opts(extra: Record<string, unknown> = {}) {
  return { rulesDir: rulesRoot, claudeHome, codexHome, ...extra };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-rules-dep-"));
  rulesRoot = path.join(root, "rules");
  claudeHome = path.join(root, ".claude");
  codexHome = path.join(root, ".codex");
  fs.mkdirSync(rulesRoot, { recursive: true });
  fs.mkdirSync(claudeHome, { recursive: true });
  fs.mkdirSync(codexHome, { recursive: true });
  writeRule("base/spec-first.md", "구현 전 spec 을 먼저 쓴다.");
  writeRule("base/self-review.md", "구현 후 self-review 를 반드시 한다.");
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("AC-1 글로벌 양표면", () => {
  it("Claude 스텁이 @import + Codex AGENTS.md 인라인에 동일 base 도달", () => {
    deployRules(opts());
    const claudeMd = read(path.join(claudeHome, "CLAUDE.md"));
    const importFile = read(path.join(claudeHome, "localmind-rules.md"));
    const codexMd = read(path.join(codexHome, "AGENTS.md"));
    assert.match(claudeMd, /@localmind-rules\.md/); // 하드주입(@import)
    assert.match(importFile, /구현 전 spec 을 먼저 쓴다\./);
    assert.match(codexMd, /구현 전 spec 을 먼저 쓴다\./); // Codex 인라인
    assert.match(codexMd, /구현 후 self-review/);
  });
});

describe("AC-2 규칙 없던 repo (overlay-only)", () => {
  it("repo AGENTS.md(overlay 인라인, base 제외) + CLAUDE.md(@AGENTS.md 스텁) 생성", () => {
    writeRule("overlays/pkpk/deploy.md", "main 브랜치 push 금지.");
    const repoDir = path.join(root, "pkpk");
    fs.mkdirSync(repoDir);
    const r = deployRules(opts({ repoDir }));
    assert.equal(r.project, "pkpk");
    const agents = read(path.join(repoDir, "AGENTS.md"));
    const claude = read(path.join(repoDir, "CLAUDE.md"));
    assert.match(agents, /main 브랜치 push 금지\./); // overlay
    // base는 글로벌 표면이 주입 — repo에 중복 인라인하지 않는다(Codex 32KiB 이중계상 방지)
    assert.doesNotMatch(agents, /구현 전 spec 을 먼저 쓴다\./);
    assert.match(claude, /@AGENTS\.md/);
    assert.doesNotMatch(claude, /push 금지/); // 스텁에 본문 중복 없음
  });

  it("overlay 없는 repo 는 repo 파일을 만들지 않는다(base는 글로벌)", () => {
    const repoDir = path.join(root, "unknown-proj");
    fs.mkdirSync(repoDir);
    const r = deployRules(opts({ repoDir }));
    assert.equal(r.project, null);
    assert.ok(!fs.existsSync(path.join(repoDir, "AGENTS.md")), "overlay 없는 repo에 파일 생성됨");
    assert.ok(!fs.existsSync(path.join(repoDir, "CLAUDE.md")));
  });
});

describe("AC-3 멱등", () => {
  it("재배포 시 전부 unchanged, 산출물 바이트 동일", () => {
    deployRules(opts());
    const before = read(path.join(codexHome, "AGENTS.md"));
    const r2 = deployRules(opts());
    const after = read(path.join(codexHome, "AGENTS.md"));
    assert.equal(after, before); // 바이트 동일
    assert.ok(r2.items.every((i) => i.status === "unchanged"), JSON.stringify(r2.items));
  });
});

describe("AC-4 사용자 저작 보존 (I-1: 마커 경계 밖 전체)", () => {
  it("[사용자A][managed][사용자B] 구조에서 경계 밖 바이트 1바이트도 불변", () => {
    const before = "USER-A 내가 쓴 앞부분 규칙\n\n";
    const after = "\nUSER-B 내가 쓴 뒷부분 규칙\n";
    const agentsMd = path.join(codexHome, "AGENTS.md");
    fs.writeFileSync(agentsMd, before + wrapSection("OLD-managed-내용") + after);

    deployRules(opts()); // managed 섹션만 교체돼야 함
    const updated = read(agentsMd);

    // 경계 밖 전체(앞 USER-A, 뒤 USER-B) 바이트 보존
    const b = updated.indexOf(SECTION_BEGIN);
    const e = updated.indexOf(SECTION_END) + SECTION_END.length;
    assert.equal(updated.slice(0, b), before, "USER-A 앞부분 훼손");
    assert.equal(updated.slice(e), after, "USER-B 뒷부분 훼손");
    // managed 섹션은 실제로 갱신됨(새 base 반영)
    assert.match(updated.slice(b, e), /구현 전 spec/);
  });

  it("managed 마커 없는 사용자 CLAUDE.md 는 whole-file 보호(skip)", () => {
    const importFile = path.join(claudeHome, "localmind-rules.md");
    fs.writeFileSync(importFile, "사용자가 직접 만든 파일 — 마커 없음\n");
    const r = deployRules(opts());
    assert.equal(read(importFile), "사용자가 직접 만든 파일 — 마커 없음\n"); // 불변
    assert.ok(r.items.some((i) => i.status === "skipped-unmanaged"));
  });
});

describe("AC-5 prune (I-3)", () => {
  it("base 규칙 전부 제거 후 재배포 → managed 산출물만 정리", () => {
    deployRules(opts());
    // 사용자 파일을 codex AGENTS.md 옆에 둔다(과잉 prune 포착용)
    const bystander = path.join(codexHome, "user-notes.md");
    fs.writeFileSync(bystander, "사용자 메모");
    // base 규칙 전부 삭제
    fs.rmSync(path.join(rulesRoot, "base"), { recursive: true });

    const r = deployRules(opts());
    // managed 산출물 제거됨
    assert.ok(!fs.existsSync(path.join(claudeHome, "localmind-rules.md")));
    // 회귀 핀: 옆의 사용자 파일은 절대 삭제 안 됨(과잉 prune 포착)
    assert.ok(fs.existsSync(bystander), "prune 과잉 — 사용자 파일 삭제됨");
    assert.equal(r.baseCount, 0);
  });

  it("prune-skip 안전밸브: problems>0 이면 산출물을 prune 하지 않는다", () => {
    deployRules(opts());
    const importFile = path.join(claudeHome, "localmind-rules.md");
    assert.ok(fs.existsSync(importFile));
    // base 전부 제거(빈 규칙) + 무효 파일 주입해 problems 유발
    fs.rmSync(path.join(rulesRoot, "base"), { recursive: true });
    writeRule("base/Bad_Name.md", "---\nname: Bad_Name\n---\n무효 이름");

    const r = deployRules(opts());
    assert.ok(r.pruneSkipped, "problems 있는데 pruneSkipped=false");
    // 회귀 핀: problems 있으면 기존 managed 산출물이 몰살되지 않는다
    assert.ok(fs.existsSync(importFile), "problems>0 인데 prune 됨(산출물 몰살)");
  });
});

describe("AC-7 경로 무관 (e2e, 실제 대상 경로 문자열 부재)", () => {
  it("생성된 모든 파일에 대상 디렉토리 절대경로가 없다", () => {
    writeRule("overlays/pkpk/deploy.md", "push 금지");
    const repoDir = path.join(root, "pkpk");
    fs.mkdirSync(repoDir);
    deployRules(opts({ repoDir }));
    const targets = [root, claudeHome, codexHome, repoDir]; // 이 테스트가 쓴 실제 절대경로들
    const files = [
      path.join(claudeHome, "CLAUDE.md"),
      path.join(claudeHome, "localmind-rules.md"),
      path.join(codexHome, "AGENTS.md"),
      path.join(repoDir, "AGENTS.md"),
      path.join(repoDir, "CLAUDE.md"),
    ];
    for (const f of files) {
      const content = read(f);
      for (const t of targets) {
        assert.ok(!content.includes(t), `${path.basename(f)} 에 대상 절대경로 누출: ${t}`);
      }
    }
  });
});

describe("matchProject (self-review 경미 2·3)", () => {
  it("정규화 후 여러 overlay가 겹치면 추측하지 않고 null + ambiguous", () => {
    const r = matchProject("my-proj", ["my-proj", "My_Proj"]);
    assert.equal(r.project, null);
    assert.equal(r.ambiguous.length, 2);
  });
  it("빈 문자열(비알파뉴메릭 이름)은 오매칭하지 않는다", () => {
    assert.equal(normalizeProject("___"), "");
    const r = matchProject("___", ["-", "@@@"]); // 후보들도 normalize 시 ""
    assert.equal(r.project, null); // "" === "" 오매칭 방지
  });
  it("정확 매칭 하나면 그 프로젝트", () => {
    assert.deepEqual(matchProject("PKPK", ["pkpk"]), { project: "pkpk", ambiguous: [] });
  });
});

describe("overlay 제거 시 repo 표면 prune (AC-5 보강)", () => {
  it("overlay 파일을 지우면 repo 표면(overlay-only)이 정리된다", () => {
    writeRule("overlays/pkpk/deploy.md", "main push 금지");
    const repoDir = path.join(root, "pkpk");
    fs.mkdirSync(repoDir);
    deployRules(opts({ repoDir }));
    const agentsMd = path.join(repoDir, "AGENTS.md");
    assert.match(read(agentsMd), /main push 금지/);
    // overlay 제거 → repo 표면은 overlay-only라 빌 것 → managed 섹션 제거(파일도 삭제)
    fs.rmSync(path.join(rulesRoot, "overlays/pkpk/deploy.md"));
    deployRules(opts({ repoDir }));
    assert.ok(!fs.existsSync(agentsMd), "overlay 제거 후에도 repo AGENTS.md 잔류");
    assert.ok(!fs.existsSync(path.join(repoDir, "CLAUDE.md")));
  });
});

describe("append-into-user-content 바이트 보존 (AC-4 보강)", () => {
  it("managed 섹션 없는 사용자 파일에 append 시 사용자 바이트 불변 + 멱등", () => {
    const userContent = "# 팀 규칙\n2-space 들여쓰기.\n";
    const agentsMd = path.join(codexHome, "AGENTS.md");
    fs.writeFileSync(agentsMd, userContent);
    deployRules(opts());
    const afterFirst = read(agentsMd);
    // 사용자 콘텐츠가 앞부분에 바이트 그대로 보존
    assert.ok(afterFirst.startsWith(userContent), "append가 사용자 바이트를 훼손");
    assert.ok(afterFirst.includes(SECTION_BEGIN));
    // 멱등: 재배포해도 바이트 동일
    deployRules(opts());
    assert.equal(read(agentsMd), afterFirst);
  });
});

describe("AC-8 대상 부재 게이트 (I-4)", () => {
  it("~/.codex 없으면 Codex 스킵(폴더 미생성), Claude·repo 진행", () => {
    fs.rmSync(codexHome, { recursive: true });
    const repoDir = path.join(root, "some-repo");
    fs.mkdirSync(repoDir);
    writeRule("overlays/some-repo/rules.md", "프로젝트 규칙"); // repo 표면 산출을 위한 overlay
    const r = deployRules(opts({ repoDir }));
    assert.ok(!fs.existsSync(codexHome), "부재 대상 폴더를 새로 만들었다");
    assert.ok(r.skippedTargets.some((s) => s.target === "codex-global"));
    // Claude·repo 는 정상 수행
    assert.ok(fs.existsSync(path.join(claudeHome, "CLAUDE.md")));
    assert.ok(fs.existsSync(path.join(repoDir, "AGENTS.md")));
  });
});
