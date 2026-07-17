/**
 * skill-contract.ts 테스트 — Agent Skills 표준 계약(AC-1)과 packaged 중립성(AC-8).
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadSkillRegistry,
  loadManifest,
  inspectSkillDir,
  scanPackagedNeutrality,
  normalizeSkillMdPayload,
  NEUTRALITY_FORBIDDEN_TOKENS,
  skillMarkerComment,
  hasSkillMarker,
  hasCommandMarker,
} from "./skill-contract.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-contract-"));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function writeSkill(base: string, name: string, opts: { fm?: string; body?: string; marker?: boolean } = {}) {
  const dir = path.join(base, name);
  fs.mkdirSync(dir, { recursive: true });
  const fm = opts.fm ?? `name: ${name}\ndescription: ${name} 워크플로 — 무엇을 언제 쓰는지`;
  const marker = opts.marker === false ? "" : `${skillMarkerComment(name)}\n`;
  const body = opts.body ?? "# 지침\n\n1. 한다.\n";
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\n${fm}\n---\n${marker}${body}`);
  return dir;
}

describe("skills-contract: AC-1", () => {
  it("valid quoted/multiline/comment/colon frontmatter를 정규화한다", () => {
    const fm = [
      "# 이 스킬은 무엇을 하는가",
      'name: "quirky-skill"',
      "description: >-",
      "  콜론: 포함, 인용부호와 여러 줄을",
      "  한 문장으로 접는 description",
    ].join("\n");
    writeSkill(root, "quirky-skill", { fm });
    const reg = loadSkillRegistry(root);
    assert.equal(reg.problems.length, 0, JSON.stringify(reg.problems));
    const s = reg.skills.find((x) => x.name === "quirky-skill");
    assert.ok(s);
    assert.match(s!.description, /콜론: 포함/);
    assert.ok(s!.files.includes("SKILL.md"));
    assert.ok(s!.managedSource, "marker가 있으면 managed");
    assert.ok(s!.canonicalPayloadHash.length === 64);
  });

  it("name mismatch를 파일 문제로 보고한다", () => {
    writeSkill(root, "dir-name", { fm: "name: other-name\ndescription: 설명" });
    const reg = loadSkillRegistry(root);
    assert.equal(reg.skills.length, 0);
    assert.match(reg.problems[0].reason, /디렉토리명/);
  });

  it("잘못된 name(대문자/연속 하이픈)을 거부한다", () => {
    writeSkill(root, "Bad-Name", { fm: "name: Bad-Name\ndescription: 설명" });
    writeSkill(root, "double--hyphen", { fm: "name: double--hyphen\ndescription: 설명" });
    const reg = loadSkillRegistry(root);
    assert.equal(reg.skills.length, 0);
    assert.equal(reg.problems.length, 2);
  });

  it("malformed frontmatter(닫힘 없음)를 거부한다", () => {
    const dir = path.join(root, "broken");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), "---\nname: broken\n지침만 있고 닫는 --- 없음\n");
    const reg = loadSkillRegistry(root);
    assert.equal(reg.skills.length, 0);
    assert.match(reg.problems[0].reason, /frontmatter/);
  });

  it("oversized frontmatter(>64 KiB)를 거부한다", () => {
    const big = "description: " + "가".repeat(70 * 1024);
    writeSkill(root, "huge", { fm: `name: huge\n${big}` });
    const reg = loadSkillRegistry(root);
    assert.equal(reg.skills.length, 0);
    assert.match(reg.problems[0].reason, /64 KiB/);
  });

  it("alias/anchor frontmatter를 거부한다", () => {
    writeSkill(root, "aliased", { fm: "name: &a aliased\ndescription: *a" });
    const reg = loadSkillRegistry(root);
    assert.equal(reg.skills.length, 0);
    assert.match(reg.problems[0].reason, /alias|anchor/);
  });

  it("custom tag frontmatter를 거부한다", () => {
    writeSkill(root, "tagged", { fm: "name: tagged\ndescription: !!python/object 위험" });
    const reg = loadSkillRegistry(root);
    assert.equal(reg.skills.length, 0);
    assert.match(reg.problems[0].reason, /태그|YAML/);
  });

  it("빈 body를 거부한다", () => {
    writeSkill(root, "empty-body", { body: "   \n\n", marker: false });
    const reg = loadSkillRegistry(root);
    assert.equal(reg.skills.length, 0);
    assert.match(reg.problems[0].reason, /본문/);
  });

  it("skill 내부 symlink를 파일 문제로 보고한다", () => {
    const dir = writeSkill(root, "with-link");
    fs.symlinkSync("/etc/hosts", path.join(dir, "sneaky.md"));
    const reg = loadSkillRegistry(root);
    assert.equal(reg.skills.length, 0);
    assert.match(reg.problems[0].reason, /심볼릭 링크/);
  });

  it("symlink 디렉토리 자체는 순회하지 않고 문제로 보고한다", () => {
    const realTarget = writeSkill(root, "real-skill");
    fs.symlinkSync(realTarget, path.join(root, "linked-skill"));
    const reg = loadSkillRegistry(root);
    // real-skill은 정상, linked-skill은 문제
    assert.ok(reg.skills.some((s) => s.name === "real-skill"));
    assert.ok(reg.problems.some((p) => p.nameOrPath === "linked-skill" && /심볼릭/.test(p.reason)));
  });

  it("special file(unix socket)을 파일 문제로 보고한다", async () => {
    const dir = writeSkill(root, "with-socket");
    const sockPath = path.join(dir, "s.sock");
    const srv = net.createServer();
    await new Promise<void>((res) => srv.listen(sockPath, () => res()));
    try {
      const reg = loadSkillRegistry(root);
      assert.equal(reg.skills.length, 0);
      assert.match(reg.problems[0].reason, /일반 파일이 아닌/);
    } finally {
      await new Promise<void>((res) => srv.close(() => res()));
    }
  });

  it("regular resource의 executable bit를 보존한다", () => {
    const dir = writeSkill(root, "with-script");
    const scriptsDir = path.join(dir, "scripts");
    fs.mkdirSync(scriptsDir);
    const scriptPath = path.join(scriptsDir, "run.sh");
    fs.writeFileSync(scriptPath, "#!/bin/sh\necho hi\n");
    fs.chmodSync(scriptPath, 0o755);
    const reg = loadSkillRegistry(root);
    const s = reg.skills.find((x) => x.name === "with-script");
    assert.ok(s);
    assert.ok(s!.files.includes("scripts/run.sh"));
    assert.ok(s!.executableFiles.includes("scripts/run.sh"), "실행 비트 보존");
    // exec bit가 payload hash에 반영되는가
    fs.chmodSync(scriptPath, 0o644);
    const reg2 = loadSkillRegistry(root);
    const s2 = reg2.skills.find((x) => x.name === "with-script")!;
    assert.notEqual(s!.canonicalPayloadHash, s2.canonicalPayloadHash, "exec bit 변경이 hash에 반영");
  });

  it("normalizeSkillMdPayload는 marker와 disable-model-invocation을 제거해 동일 payload로 수렴한다", () => {
    const plain = "---\nname: x\ndescription: d\n---\n# 지침\n본문\n";
    const withMarker = `---\nname: x\ndescription: d\n---\n${skillMarkerComment("x")}\n# 지침\n본문\n`;
    const claudeTarget = `---\nname: x\ndescription: d\ndisable-model-invocation: true\n---\n${skillMarkerComment("x")}\n# 지침\n본문\n`;
    assert.equal(normalizeSkillMdPayload(plain), normalizeSkillMdPayload(withMarker));
    assert.equal(normalizeSkillMdPayload(plain), normalizeSkillMdPayload(claudeTarget));
  });

  it("manifest 1:1 바인딩 — 정확 일치는 policy를 붙인다", () => {
    writeSkill(root, "goal-ready", { fm: "name: goal-ready\ndescription: 문서 준비" });
    writeSkill(root, "sdd-implement", { fm: "name: sdd-implement\ndescription: 구현" });
    fs.writeFileSync(
      path.join(root, "catalog.json"),
      JSON.stringify({
        schemaVersion: 1,
        workflows: {
          "goal-ready": { activation: "intent", sideEffects: "docs-only" },
          "sdd-implement": { activation: "explicit", sideEffects: "mutating" },
        },
      }),
    );
    const reg = loadSkillRegistry(root, { packaged: true });
    assert.equal(reg.problems.length, 0, JSON.stringify(reg.problems));
    assert.equal(reg.skills.find((s) => s.name === "sdd-implement")!.policy!.sideEffects, "mutating");
  });

  it("manifest missing/extra entry는 package 문제다", () => {
    writeSkill(root, "goal-ready", { fm: "name: goal-ready\ndescription: 문서 준비" });
    writeSkill(root, "orphan-skill", { fm: "name: orphan-skill\ndescription: 매니페스트 없음" });
    fs.writeFileSync(
      path.join(root, "catalog.json"),
      JSON.stringify({
        schemaVersion: 1,
        workflows: {
          "goal-ready": { activation: "intent", sideEffects: "docs-only" },
          "missing-skill": { activation: "explicit", sideEffects: "mutating" },
        },
      }),
    );
    const reg = loadSkillRegistry(root, { packaged: true });
    assert.ok(reg.problems.some((p) => p.nameOrPath === "missing-skill"), "매니페스트에 있으나 디렉토리 없음");
    assert.ok(reg.problems.some((p) => p.nameOrPath === "orphan-skill"), "디렉토리 있으나 매니페스트 없음");
  });

  it("marker 감지는 생성된 주석 형식만 인정한다 — prose 언급은 소유가 아니다(FR-6)", () => {
    // 생성된 HTML 주석 → managed
    assert.ok(hasSkillMarker(`---\nx\n---\n<!-- managed-by: localmind (skill: goal-ready) — 배포됨 -->\nbody`, "goal-ready"));
    // 본문/인용에 marker 문자열만 언급 → managed 아님(오소유 금지)
    assert.ok(!hasSkillMarker("본문에서 managed-by: localmind (skill: goal-ready) 형식을 설명함", "goal-ready"));
    assert.ok(!hasSkillMarker("`managed-by: localmind (skill: goal-ready)` 형식입니다", "goal-ready"));
    // command marker: TOML `#` 주석 줄만
    assert.ok(hasCommandMarker(`# managed-by: localmind (command: goal-ready)\nprompt = "x"`, "goal-ready"));
    assert.ok(!hasCommandMarker(`prompt = "설명: managed-by: localmind (command: goal-ready)"`, "goal-ready"));
  });

  it("manifest 형식 오류(unknown value/key)를 거부한다", () => {
    const p1 = path.join(root, "bad-value.json");
    fs.writeFileSync(p1, JSON.stringify({ schemaVersion: 1, workflows: { x: { activation: "whenever", sideEffects: "docs-only" } } }));
    assert.ok("error" in loadManifest(p1));
    const p2 = path.join(root, "bad-key.json");
    fs.writeFileSync(p2, JSON.stringify({ schemaVersion: 1, workflows: {}, extra: true }));
    assert.ok("error" in loadManifest(p2));
    const p3 = path.join(root, "bad-version.json");
    fs.writeFileSync(p3, JSON.stringify({ schemaVersion: 2, workflows: {} }));
    assert.ok("error" in loadManifest(p3));
  });
});

describe("workflow-neutrality: AC-8", () => {
  it("깨끗한 packaged skill은 findings가 0이다", () => {
    writeSkill(root, "goal-ready", {
      fm: "name: goal-ready\ndescription: 개방형 요구를 조사해 문서를 준비하고 확인을 받는다",
      body: "# 문서 준비\n\n1. 의도를 확인한다.\n2. 요구를 조사한다.\n3. 역할 위임으로 초안을 만든다.\n",
    });
    fs.writeFileSync(
      path.join(root, "catalog.json"),
      JSON.stringify({ schemaVersion: 1, workflows: { "goal-ready": { activation: "intent", sideEffects: "docs-only" } } }),
    );
    const reg = loadSkillRegistry(root, { packaged: true });
    assert.equal(reg.problems.length, 0, JSON.stringify(reg.problems));
    assert.equal(scanPackagedNeutrality(reg.skills[0]).length, 0);
  });

  it("provider/model/tool/placeholder 토큰과 추가 frontmatter 키를 잡는다", () => {
    writeSkill(root, "leaky", {
      fm: "name: leaky\ndescription: 리뷰\nallowed-tools: Read",
      body: "# 리뷰\n\nClaude Opus 크리틱 서브에이전트(Agent 도구)를 띄우고 $ARGUMENTS를 읽어 localmind-review에 넘긴다.\n",
    });
    fs.writeFileSync(
      path.join(root, "catalog.json"),
      JSON.stringify({ schemaVersion: 1, workflows: { leaky: { activation: "explicit", sideEffects: "report-only" } } }),
    );
    const reg = loadSkillRegistry(root, { packaged: true });
    // 중립성 위반이 package 문제로 격리된다
    assert.ok(reg.problems.some((p) => p.nameOrPath === "leaky" && /중립성/.test(p.reason)));
    const skill = { ...reg.skills.find((s) => s.name === "leaky") };
    // 직접 스캔으로도 토큰 확인(격리돼도 skills 배열엔 없을 수 있으니 재로딩)
    const raw = loadSkillRegistry(root); // non-packaged: 격리 없이 로드
    const findings = scanPackagedNeutrality(raw.skills.find((s) => s.name === "leaky")!);
    const tokens = findings.map((f) => f.token);
    assert.ok(tokens.some((t) => t === "claude"));
    assert.ok(tokens.some((t) => t === "opus"));
    assert.ok(tokens.some((t) => t === "$arguments"));
    assert.ok(tokens.some((t) => t === "localmind-review"));
    assert.ok(tokens.some((t) => t === "Agent tool/type"));
    assert.ok(tokens.some((t) => /allowed-tools/.test(t)), "추가 frontmatter 키 감지");
    void skill;
  });

  it("표준 용어 'Agent Skills'는 허용한다", () => {
    writeSkill(root, "standard-term", {
      fm: "name: standard-term\ndescription: Agent Skills 표준을 따른다",
      body: "# 표준\n\nAgent Skills 표준의 SKILL.md 하나를 정본으로 쓴다.\n",
    });
    const reg = loadSkillRegistry(root);
    const findings = scanPackagedNeutrality(reg.skills[0]);
    assert.equal(findings.length, 0, JSON.stringify(findings));
  });

  it("금지 토큰 목록에 핵심 항목이 포함돼 있다", () => {
    for (const t of ["claude", "codex", "gemini", "opus", "sonnet", "haiku", "$arguments", "{{args}}", "localmind-review"]) {
      assert.ok(NEUTRALITY_FORBIDDEN_TOKENS.includes(t), `${t} 누락`);
    }
  });
});

// ── R1-09: 파서/소유권 검증이 위조 가능한 패키지를 거부한다 ─────────────────────
describe("parser/ownership hardening (R1-09)", () => {
  it("닫는 구분자는 정확히 `---` 줄이어야 한다(`---not-a-delimiter` 거부)", () => {
    const dir = path.join(root, "sneaky-close");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), "---\nname: sneaky-close\ndescription: 설명\n---not-a-delimiter\n본문\n");
    const reg = loadSkillRegistry(root);
    assert.equal(reg.skills.length, 0, "가짜 닫힘을 frontmatter 종료로 인정하면 안 됨");
    assert.match(reg.problems[0].reason, /frontmatter/);
  });

  it("본문이 marker만 있으면 빈 본문으로 거부한다", () => {
    const dir = path.join(root, "marker-only");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: marker-only\ndescription: 설명\n---\n${skillMarkerComment("marker-only")}\n   \n`);
    const reg = loadSkillRegistry(root);
    assert.equal(reg.skills.length, 0);
    assert.match(reg.problems[0].reason, /본문/);
  });

  it("packaged SKILL.md에 managed marker가 없으면 package 문제다", () => {
    writeSkill(root, "no-marker", { fm: "name: no-marker\ndescription: 마커 없음", marker: false });
    fs.writeFileSync(path.join(root, "catalog.json"), JSON.stringify({ schemaVersion: 1, workflows: { "no-marker": { activation: "intent", sideEffects: "docs-only" } } }));
    const reg = loadSkillRegistry(root, { packaged: true });
    assert.ok(reg.problems.some((p) => p.nameOrPath === "no-marker" && /marker|마커/i.test(p.reason)), JSON.stringify(reg.problems));
  });

  it("catalog.json의 중복 키(workflows.x 중복)를 거부한다", () => {
    const p = path.join(root, "dup.json");
    fs.writeFileSync(p, '{"schemaVersion":1,"workflows":{"demo":{"activation":"intent","sideEffects":"docs-only"},"demo":{"activation":"explicit","sideEffects":"mutating"}}}');
    const res = loadManifest(p);
    assert.ok("error" in res, "중복 키는 조용히 마지막 값이 이기면 안 됨");
    assert.match((res as { error: string }).error, /중복|duplicate/i);
  });

  it("marker 감지는 주석 시작이 managed-by일 때만 — 주석 중간 언급은 소유가 아니다", () => {
    assert.ok(!hasSkillMarker("<!-- 설명: managed-by: localmind (skill: x) 형식 예시 -->", "x"), "주석 중간 언급은 소유 아님");
    assert.ok(hasSkillMarker("<!-- managed-by: localmind (skill: x) — 배포됨 -->", "x"));
    assert.ok(!hasCommandMarker('# 이 줄은 managed-by: localmind (command: x) 를 설명', "x"), "주석 중간 언급은 소유 아님");
  });

  it("SKILL.md가 symlink이면 내용을 따라 읽지 않고 문제로 보고한다", () => {
    const dir = path.join(root, "md-link");
    fs.mkdirSync(dir, { recursive: true });
    fs.symlinkSync("/etc/hosts", path.join(dir, "SKILL.md"));
    const reg = loadSkillRegistry(root);
    assert.equal(reg.skills.length, 0);
    assert.match(reg.problems[0]?.reason ?? "", /심볼릭 링크/, "symlink 대상 내용을 따라가지 않는다");
  });

  it("packaged text resource가 유효하지 않은 UTF-8이면 문제로 보고한다", () => {
    writeSkill(root, "bad-utf8", { fm: "name: bad-utf8\ndescription: 설명" });
    fs.writeFileSync(path.join(root, "bad-utf8", "notes.md"), Buffer.from([0xff, 0xfe, 0x00, 0x80]));
    fs.writeFileSync(path.join(root, "catalog.json"), JSON.stringify({ schemaVersion: 1, workflows: { "bad-utf8": { activation: "intent", sideEffects: "docs-only" } } }));
    const reg = loadSkillRegistry(root, { packaged: true });
    assert.ok(reg.problems.some((p) => p.nameOrPath === "bad-utf8" && /UTF-8/i.test(p.reason)), JSON.stringify(reg.problems));
  });
});

// ── R1-02: canonical hash가 target metadata를 포함해 fork를 감지한다 ─────────────
describe("canonical identity hash (R1-02)", () => {
  it("canonicalPayloadHash는 disable-model-invocation을 포함한다(정본에 있으면 fork)", () => {
    writeSkill(root, "clean-a", { fm: "name: clean-a\ndescription: 깨끗" });
    const dir2 = path.join(root, "clean-a-fork");
    fs.mkdirSync(dir2, { recursive: true });
    fs.writeFileSync(
      path.join(dir2, "SKILL.md"),
      `---\nname: clean-a-fork\ndescription: 깨끗\ndisable-model-invocation: false\n---\n${skillMarkerComment("clean-a-fork")}\n# 지침\n\n1. 한다.\n`,
    );
    const reg = loadSkillRegistry(root);
    const clean = reg.skills.find((s) => s.name === "clean-a")!;
    const fork = reg.skills.find((s) => s.name === "clean-a-fork")!;
    // 이름만 다르므로 정규화된 canonical payload는 이름 차이가 있음 — 대신 같은 이름으로 직접 비교
    // (정본 정체성 해시가 provider field를 제거해 clean과 수렴하면 안 된다)
    assert.ok(fork.canonicalPayloadHash !== clean.canonicalPayloadHash);
  });

  it("이름 동일 + disable-model-invocation만 다르면 canonicalPayloadHash가 달라진다(fork 감지 핵심)", () => {
    const a = path.join(root, "a1", "same");
    const b = path.join(root, "b1", "same");
    fs.mkdirSync(a, { recursive: true });
    fs.mkdirSync(b, { recursive: true });
    fs.writeFileSync(path.join(a, "SKILL.md"), `---\nname: same\ndescription: d\n---\n${skillMarkerComment("same")}\n# 지침\n본문\n`);
    fs.writeFileSync(path.join(b, "SKILL.md"), `---\nname: same\ndescription: d\ndisable-model-invocation: false\n---\n${skillMarkerComment("same")}\n# 지침\n본문\n`);
    const ra = loadSkillRegistry(path.join(root, "a1"));
    const rb = loadSkillRegistry(path.join(root, "b1"));
    assert.notEqual(ra.skills[0].canonicalPayloadHash, rb.skills[0].canonicalPayloadHash, "정본 정체성 해시가 provider field를 무시하면 안 된다");
  });

  it("canonicalPayloadHash는 정본의 agents/openai.yaml을 포함한다", () => {
    const a = path.join(root, "y1", "same");
    const b = path.join(root, "y2", "same");
    fs.mkdirSync(path.join(a, "agents"), { recursive: true });
    fs.mkdirSync(b, { recursive: true });
    const md = `---\nname: same\ndescription: d\n---\n${skillMarkerComment("same")}\n# 지침\n본문\n`;
    fs.writeFileSync(path.join(a, "SKILL.md"), md);
    fs.writeFileSync(path.join(a, "agents", "openai.yaml"), "policy:\n  allow_implicit_invocation: false\n");
    fs.writeFileSync(path.join(b, "SKILL.md"), md);
    const ra = loadSkillRegistry(path.join(root, "y1"));
    const rb = loadSkillRegistry(path.join(root, "y2"));
    assert.notEqual(ra.skills[0].canonicalPayloadHash, rb.skills[0].canonicalPayloadHash, "정본의 openai.yaml은 정체성에 포함");
  });
});

// ── R2-02: payload hash tuple을 length-frame해 파일 그래프 위조를 막는다 ──────────
describe("payload hash tuple framing (R2-02)", () => {
  // 같은 이름·같은 SKILL.md, 자원 그래프만 다른 두 skill을 만든다.
  // A: 파일 `a` 하나가 바이트 `X \0 b \0 - \0 Y`를 담는다.
  // B: 파일 `a`=`X`, 파일 `b`=`Y`. delimiter(NUL) 기반 인코딩에서는 두 그래프의
  //    바이트 스트림이 동일해져 SHA-256 입력이 같아진다(위조).
  const A_BYTES = Buffer.from([0x58, 0x00, 0x62, 0x00, 0x2d, 0x00, 0x59]); // X \0 b \0 - \0 Y
  const skillMd = `---\nname: collide\ndescription: d\n---\n${skillMarkerComment("collide")}\n# 지침\n본문\n`;
  function buildA(base: string): string {
    const dir = path.join(base, "collide");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), skillMd);
    fs.writeFileSync(path.join(dir, "a"), A_BYTES);
    return dir;
  }
  function buildB(base: string): string {
    const dir = path.join(base, "collide");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), skillMd);
    fs.writeFileSync(path.join(dir, "a"), Buffer.from([0x58])); // X
    fs.writeFileSync(path.join(dir, "b"), Buffer.from([0x59])); // Y
    return dir;
  }

  it("다른 파일 그래프는 canonical-identity hash가 달라야 한다(NUL 내용의 tuple 경계 위조 방지)", () => {
    const aBase = path.join(root, "A");
    const bBase = path.join(root, "B");
    buildA(aBase);
    buildB(bBase);
    const ra = loadSkillRegistry(aBase);
    const rb = loadSkillRegistry(bBase);
    assert.equal(ra.problems.length, 0, JSON.stringify(ra.problems));
    assert.equal(rb.problems.length, 0, JSON.stringify(rb.problems));
    const ha = ra.skills.find((s) => s.name === "collide")!.canonicalPayloadHash;
    const hb = rb.skills.find((s) => s.name === "collide")!.canonicalPayloadHash;
    assert.notEqual(ha, hb, "다른 파일 그래프가 동일 canonical hash로 뭉개지면 안 된다");
  });

  it("다른 파일 그래프는 target-normalized(inspectSkillDir) hash도 달라야 한다", () => {
    const aDir = buildA(path.join(root, "A"));
    const bDir = buildB(path.join(root, "B"));
    const ia = inspectSkillDir(aDir);
    const ib = inspectSkillDir(bDir);
    assert.ok(!("error" in ia), JSON.stringify(ia));
    assert.ok(!("error" in ib), JSON.stringify(ib));
    assert.notEqual((ia as { hash: string }).hash, (ib as { hash: string }).hash, "target-normalized도 위조 불가");
  });

  it("결정적 순서·executable bit는 hash에 계속 반영된다(회귀)", () => {
    const dir = writeSkill(root, "framed");
    const h1 = inspectSkillDir(dir);
    fs.writeFileSync(path.join(dir, "z.txt"), "z");
    fs.writeFileSync(path.join(dir, "a.txt"), "a");
    const h2 = inspectSkillDir(dir);
    assert.ok(!("error" in h1) && !("error" in h2));
    assert.notEqual((h1 as { hash: string }).hash, (h2 as { hash: string }).hash, "자원 추가가 hash에 반영");
    const again = inspectSkillDir(dir);
    assert.equal((again as { hash: string }).hash, (h2 as { hash: string }).hash, "같은 그래프는 결정적으로 동일 hash");
  });
});

// ── R1-03: 정본 root 부재/비정상은 source 문제(빈 clean 아님) ────────────────────
describe("canonical source absence (R1-03)", () => {
  it("정본 root가 없으면 source 문제로 보고한다(빈 clean 아님)", () => {
    const missing = path.join(root, "does-not-exist");
    const reg = loadSkillRegistry(missing);
    assert.ok(reg.problems.length > 0, "부재는 문제로 표면화");
    assert.equal(reg.skills.length, 0);
  });

  it("정본 root가 파일이면 문제로 보고한다", () => {
    const f = path.join(root, "a-file");
    fs.writeFileSync(f, "not a dir");
    const reg = loadSkillRegistry(f);
    assert.ok(reg.problems.length > 0);
  });

  it("정본 root가 dangling symlink이면 문제로 보고한다", () => {
    const link = path.join(root, "dangling");
    fs.symlinkSync(path.join(root, "nope-target"), link);
    const reg = loadSkillRegistry(link);
    assert.ok(reg.problems.length > 0);
  });

  it("정본 root가 실제 빈 폴더면 문제가 아니다(의도적 empty)", () => {
    const empty = path.join(root, "empty-real");
    fs.mkdirSync(empty);
    const reg = loadSkillRegistry(empty);
    assert.equal(reg.problems.length, 0, "의도적 빈 폴더는 clean");
    assert.equal(reg.skills.length, 0);
  });
});

// ── localmind-binding packaged skill 정적 AC 검증 (specs/050 T2.6) ──────────────
describe("localmind-binding contract: AC-1/3/4/7/8/9, I-7", () => {
  const PKG_ROOT = path.join(REPO_ROOT, "templates", "skills");
  const skillMd = () => fs.readFileSync(path.join(PKG_ROOT, "localmind-binding", "SKILL.md"), "utf8");
  const contractMd = () => fs.readFileSync(path.join(PKG_ROOT, "localmind-binding", "references", "binding-contract.md"), "utf8");

  it("packaged 전수 스캔에 localmind-binding이 포함되고 중립성 clean이다(F-5)", () => {
    const reg = loadSkillRegistry(PKG_ROOT, { packaged: true });
    assert.equal(reg.problems.length, 0, JSON.stringify(reg.problems));
    const s = reg.skills.find((x) => x.name === "localmind-binding");
    assert.ok(s, "localmind-binding packaged skill 존재");
    assert.equal(scanPackagedNeutrality(s!).length, 0, "중립성 위반 0건이어야 한다");
    assert.equal(s!.policy?.activation, "explicit");
    assert.equal(s!.policy?.sideEffects, "mutating");
  });

  it("AC-1: 추천이 낡을 수 있다는 고지·사용자 확정·저장 요약 지시가 있다", () => {
    const md = skillMd();
    assert.match(md, /낡을 수 있/, "추천 낡음 고지 문구 누락");
    assert.match(md, /사용자가.*확정/, "사용자 확정 지시 누락");
    assert.match(md, /요약해.*보여준다|요약.*표시/, "저장 요약 지시 누락");
  });

  it("AC-7: 레지스트리 밖 페르소나명은 저장하지 않고 재선택을 유도한다", () => {
    assert.match(skillMd(), /재선택/, "재선택 유도 지시 누락");
  });

  it("AC-8: 빈 레지스트리에서는 역할 단계를 사유와 함께 건너뛰고 등급 설정은 계속한다", () => {
    const md = skillMd();
    assert.match(md, /레지스트리가 비어 있으면.*건너뛴다/s, "빈 레지스트리 건너뜀 안내 누락");
  });

  it("AC-9: 추천 밖 모델 식별자의 가용성을 검증하지 않는다는 고지가 있다", () => {
    assert.match(skillMd(), /가용성.*검증하지 않는다/, "모델 가용성 미검증 고지 누락");
  });

  it("AC-3/D-4: 계약 문서에 부재 시 안내 후 미진행·명시적 '이번만' 예외가 서술돼 있다", () => {
    const md = contractMd();
    assert.match(md, /side-effect도.*일으키기 전에/, "side-effect 전 안내 서술 누락");
    assert.match(md, /기본적으로 진행하지 않는다/, "기본 미진행 서술 누락");
    assert.match(md, /이번만 바인딩 없이 진행/, "명시적 '이번만' 예외 서술 누락");
  });

  it("AC-4/FR-5: 계약 문서에 페르소나 대행이 비독립(fallback)임을 명시하고 중단시키지 않는다는 서술이 있다", () => {
    const md = contractMd();
    assert.match(md, /비독립\(fallback\)/, "비독립(fallback) 명시 서술 누락");
    assert.match(md, /워크플로를 중단시키지 않는다/, "중단 금지 서술 누락");
  });

  it("I-7: 계약 문서가 페르소나 정의의 model 값이 바인딩 tiers보다 우선한다고 명문화한다", () => {
    const md = contractMd();
    assert.match(md, /페르소나 정의.*model 값/s, "페르소나 정의 model 우선 서술 누락");
    assert.match(md, /tiers보다 우선한다/, "tiers 대비 우선순위 서술 누락");
  });
});
