/**
 * specs/026 — 디자인 페르소나 확장 + templates 시드(seedAgents) 테스트.
 * 시드는 임시 디렉토리로 주입해 실제 노트 폴더를 건드리지 않는다. 문서 AC(게이트·SSoT·
 * 위생)는 repo 파일의 문자열 검사(결정적 grep 동치)로 판정한다.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRegistry } from "./registry.js";
import { seedAgents } from "./seed.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TPL_AGENTS = path.join(REPO_ROOT, "templates", "agents");
const TEN = [
  "analyst",
  "architect",
  "critic",
  "curator",
  "designer",
  "interviewer",
  "librarian",
  "researcher",
  "ux-reviewer",
  "worker",
];

describe("026 페르소나 templates·시드", () => {
  it("026 AC-1: templates/agents 10종이 loadRegistry 검증을 통과한다(problems 0·유효 target)", () => {
    const reg = loadRegistry(TPL_AGENTS);
    assert.equal(reg.problems.length, 0, JSON.stringify(reg.problems));
    assert.deepEqual(reg.personas.map((p) => p.name).sort(), TEN, "정확히 10종");
    for (const p of reg.personas) assert.ok(p.targets.claude, `${p.name}: claude target 필요`);
  });

  it("026 AC-1b: designer·ux-reviewer 본문 구조(4절·핸드오프·데이터 흐름 경계)", () => {
    for (const name of ["designer", "ux-reviewer"]) {
      const body = fs.readFileSync(path.join(TPL_AGENTS, `${name}.md`), "utf8");
      for (const sec of ["## 소유", "## 비소유", "## 원칙", "## 출력 형식"])
        assert.ok(body.includes(sec), `${name}: ${sec} 절 존재`);
      assert.ok(/워커|worker/.test(body) && /크리틱|critic/.test(body), `${name}: 핸드오프 명시`);
    }
    const designer = fs.readFileSync(path.join(TPL_AGENTS, "designer.md"), "utf8");
    assert.ok(designer.includes("화면 상태 전이"), "designer: 데이터 흐름 경계(화면 상태 전이) 문구");
    const architectT = fs.readFileSync(path.join(TPL_AGENTS, "architect.md"), "utf8");
    assert.ok(architectT.includes("화면 상태 전이") || architectT.includes("시스템 데이터 흐름"), "architect: 경계 반대편 명시");
  });

  it("026 AC-2: 신규 description이 기존 트리거 어휘와 충돌하지 않는다", () => {
    const reg = loadRegistry(TPL_AGENTS);
    const banned = ["self-review", "결함 검증", "품질 게이트", "설계"];
    for (const name of ["designer", "ux-reviewer"]) {
      const p = reg.personas.find((x) => x.name === name)!;
      for (const b of banned) assert.ok(!p.description.includes(b), `${name} description에 금지어 "${b}" 없음`);
    }
  });

  it("026 AC-3: 빈 노트 폴더에 10종 전부 시드 + 기존 정본은 절대 덮지 않음", () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "lm-seed-"));
    try {
      const items = seedAgents({ agentsDir: dest });
      assert.equal(items.filter((i) => i.status === "seeded").length, 10, "신규 설치 → 10종 시드");
      assert.deepEqual(fs.readdirSync(dest).sort(), TEN.map((n) => `${n}.md`), "파일 목록 일치");
      // 사용자 수정 보호
      fs.writeFileSync(path.join(dest, "designer.md"), "사용자 수정본");
      const again = seedAgents({ agentsDir: dest });
      assert.ok(again.every((i) => i.status === "exists"), "2회차는 전부 exists(멱등)");
      assert.equal(fs.readFileSync(path.join(dest, "designer.md"), "utf8"), "사용자 수정본", "기존 파일 불변");
    } finally {
      fs.rmSync(dest, { recursive: true, force: true });
    }
  });

  it("026 AC-3b: sample-persona는 시드·스캔 대상이 아니다(11번째 페르소나 승격 금지)", () => {
    assert.ok(!fs.existsSync(path.join(TPL_AGENTS, "sample-persona.md")), "templates/agents에 샘플 없음(이전됨)");
    assert.ok(fs.existsSync(path.join(REPO_ROOT, "templates", "sample-persona.md")), "templates/ 루트로 이전");
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "lm-seed-sample-"));
    try {
      seedAgents({ agentsDir: dest });
      assert.ok(!fs.existsSync(path.join(dest, "sample-persona.md")), "시드 결과에 sample 없음");
      const reg = loadRegistry(dest);
      assert.ok(!reg.personas.some((p) => p.name === "sample-critic"), "sample-critic 미배포");
    } finally {
      fs.rmSync(dest, { recursive: true, force: true });
    }
  });

  it("026 AC-4: 부분 존재 시 없는 것만 채움(fill-missing-only)", () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "lm-seed-partial-"));
    try {
      fs.writeFileSync(path.join(dest, "critic.md"), "내 크리틱");
      const items = seedAgents({ agentsDir: dest });
      assert.equal(items.filter((i) => i.status === "seeded").length, 9, "없는 9종만 시드");
      assert.equal(fs.readFileSync(path.join(dest, "critic.md"), "utf8"), "내 크리틱", "기존 critic 보호");
    } finally {
      fs.rmSync(dest, { recursive: true, force: true });
    }
  });

  it("026 AC-5: design 템플릿·AGENTS.md 게이트·페르소나 게이트 문구 존재", () => {
    const tpl = fs.readFileSync(path.join(REPO_ROOT, "templates", "sdd", "design.template.md"), "utf8");
    for (const sec of ["패턴", "토큰", "컴포넌트", "프롬프트"]) assert.ok(tpl.includes(sec), `design 템플릿 ${sec} 섹션`);
    const agentsMd = fs.readFileSync(path.join(REPO_ROOT, "AGENTS.md"), "utf8");
    assert.ok(agentsMd.includes("디자인·UI/UX 작업"), "AGENTS.md 디자인 절");
    assert.ok(agentsMd.includes("design.md"), "AGENTS.md 게이트가 design.md 참조");
    const designer = fs.readFileSync(path.join(TPL_AGENTS, "designer.md"), "utf8");
    const worker = fs.readFileSync(path.join(TPL_AGENTS, "worker.md"), "utf8");
    assert.ok(designer.includes("design.md"), "designer 게이트 문구");
    assert.ok(worker.includes("design.md"), "worker 게이트 문구");
  });

  it("026 AC-5b: templates/agents에 개인 절대경로 없음(오픈소스 위생 — 기계 검증분)", () => {
    for (const f of fs.readdirSync(TPL_AGENTS)) {
      const body = fs.readFileSync(path.join(TPL_AGENTS, f), "utf8");
      assert.ok(!body.includes("/Users/"), `${f}: /Users/ 없음`);
      for (const line of body.split("\n"))
        if (line.includes("/home/")) assert.ok(line.includes("/home/<"), `${f}: /home/은 플레이스홀더만`);
    }
  });

  it("026 AC-6: personas.md SSoT가 10종·능동적 재조정을 반영한다", () => {
    const ssot = fs.readFileSync(path.join(REPO_ROOT, "docs", "personas.md"), "utf8");
    assert.ok(ssot.includes("`designer`") && ssot.includes("`ux-reviewer`"), "구성표에 2행 존재");
    assert.ok(!/총 8개|이 8개/.test(ssot), "'총 8/이 8개' 잔존 표기 없음");
    assert.ok(ssot.includes("10"), "총원 10 갱신");
    assert.ok(/무대 확장.*디자인|디자인 무대/.test(ssot), "디자인 무대 확장 정당화");
  });
});
