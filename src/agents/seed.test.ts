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

describe("027 디자인 툴·검증 연동", () => {
  // 단계 0 실측 baseline(026 커밋 2bd1ce5 시점의 targets.claude.tools) — 027은 본문만 편집
  const TOOLS_BASELINE = "Read, Grep, Glob, Bash";
  const uxrPath = path.join(TPL_AGENTS, "ux-reviewer.md");

  it("027 AC-1: ux-reviewer 본문에 검증 도구 체인 절(계층 0/1/2·구동 주체·불일치=결함)", () => {
    const body = fs.readFileSync(uxrPath, "utf8");
    assert.ok(body.includes("## 검증 도구 체인"), "절 존재");
    assert.ok(body.includes("계층 1") && /제공한[\s\S]{0,20}스크린샷/.test(body), "계층 1 전제(제공된 스크린샷)");
    assert.ok(body.includes("계층 0") && body.includes("실제 구현 미검증"), "계층 0 폴백 + 한계 명시");
    assert.ok(body.includes("실행 중") && body.includes("로컬 UI"), "계층 2 전제(실행 중 로컬 UI)");
    assert.ok(/메인 세션|명시.*부여/.test(body), "구동 주체 단서(메인 세션/명시 부여)");
    assert.ok(/불일치.*결함|결함.*보고/.test(body), "design.md 불일치=결함");
  });

  it("027 AC-2: 본문 편집 후에도 파싱·도구 최소성 불변(baseline 상대 비교)", () => {
    const reg = loadRegistry(TPL_AGENTS);
    assert.equal(reg.problems.length, 0, JSON.stringify(reg.problems));
    const uxr = reg.personas.find((p) => p.name === "ux-reviewer")!;
    assert.ok(uxr.targets.claude, "claude target 유효");
    assert.equal(uxr.targets.claude!.tools, TOOLS_BASELINE, "targets.claude.tools 확장 금지(026 baseline)");
  });

  it("027 AC-3·4: docs 정본 위계·드리프트 규칙 + Figma 비용 정직성·커뮤니티 경고", () => {
    const docs = fs.readFileSync(path.join(REPO_ROOT, "docs", "agents.md"), "utf8");
    assert.ok(docs.includes("design.md가 정본"), "정본 위계");
    assert.ok(/design\.md가[\s\S]{0,6}(이긴다|이깁니다)/.test(docs), "드리프트 판정 규칙");
    assert.ok(/월\s*6/.test(docs), "무료 월 6회 한계 경고");
    assert.ok(docs.includes("mcp.figma.com"), "Figma 연결 명령");
    assert.ok(/커뮤니티[\s\S]{0,80}보증되지 않/.test(docs), "커뮤니티 서버 유지 미보증 경고");
    assert.ok(/커뮤니티[\s\S]{0,120}권장하지/.test(docs), "커뮤니티 서버 비권장 문구");
  });

  it("027 AC-5: Playwright 전제·비대행 문구 + 실행 가능한 설치 레시피 부재 회귀", () => {
    const docs = fs.readFileSync(path.join(REPO_ROOT, "docs", "agents.md"), "utf8");
    assert.ok(docs.includes("실행 중인 로컬 UI"), "전제조건 첫 줄");
    assert.ok(docs.includes("@playwright/mcp"), "Playwright 연결 명령");
    assert.ok(/설치·등록하지 않|설치하지 않|대행하지 않/.test(docs), "비대행 문구");
    assert.ok(/opt-in|공급망/.test(docs), "비대행 근거");
    // 회귀: Makefile 타깃·scripts/ 비테스트 스크립트에 설치 레시피 없음
    // (positive 어서션은 위처럼 하위문자열만 사용 — 회귀 패턴과 미겹침, 027 리뷰 결함 4)
    const recipe = /claude\s+mcp\s+add[^\n]*(playwright|figma)/i;
    const mk = fs.readFileSync(path.join(REPO_ROOT, "Makefile"), "utf8");
    assert.ok(!recipe.test(mk), "Makefile에 설치 레시피 없음");
    const scriptsDir = path.join(REPO_ROOT, "scripts");
    for (const f of fs.readdirSync(scriptsDir)) {
      const full = path.join(scriptsDir, f);
      if (!fs.statSync(full).isFile() || f.endsWith(".test.sh")) continue;
      assert.ok(!recipe.test(fs.readFileSync(full, "utf8")), `${f}에 설치 레시피 없음`);
    }
  });

  it("027 AC-6: design.template.md에 tokens.json(DTCG) 이행 선택 섹션", () => {
    const tpl = fs.readFileSync(path.join(REPO_ROOT, "templates", "sdd", "design.template.md"), "utf8");
    assert.ok(tpl.includes("tokens.json") && tpl.includes("DTCG"), "이행 섹션 존재");
    assert.ok(/CI 강제 아님|강제하지 않/.test(tpl), "CI 강제 아님");
    assert.ok(/design\.md.*(정본|불변)/.test(tpl), "design.md 정본 불변");
  });

  it("027 AC-7b: spec이 라이브 외부 도구 동작 미검증을 한계로 명시한다", () => {
    const spec = fs.readFileSync(
      path.join(REPO_ROOT, "specs", "027-design-tool-verification", "spec.md"),
      "utf8",
    );
    assert.ok(/라이브 외부 도구 동작[\s\S]{0,150}(검증하지 않|미검증)/.test(spec), "정직한 한계 명시");
  });

  it("027 AC-7: 콘텐츠 산출물 위생(개인 절대경로 부재 — 테스트 하니스 제외)", () => {
    const targets = [
      uxrPath,
      path.join(REPO_ROOT, "docs", "agents.md"),
      path.join(REPO_ROOT, "templates", "sdd", "design.template.md"),
    ];
    for (const f of targets) {
      const body = fs.readFileSync(f, "utf8");
      assert.ok(!body.includes("/Users/"), `${path.basename(f)}: /Users/ 없음`);
      for (const line of body.split("\n"))
        if (line.includes("/home/")) assert.ok(line.includes("/home/<"), `${path.basename(f)}: /home/은 플레이스홀더만`);
    }
  });
});
