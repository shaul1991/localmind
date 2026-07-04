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
const ALL = [
  "analyst",
  "android-dev",
  "architect",
  "auth-dev",
  "backend-dev",
  "critic",
  "curator",
  "data-platform",
  "dba",
  "designer",
  "frontend-dev",
  "infra",
  "interviewer",
  "ios-dev",
  "librarian",
  "researcher",
  "security-reviewer",
  "ux-reviewer",
  "worker",
];

describe("026 페르소나 templates·시드", () => {
  it("026 AC-1 = 028 AC-1: templates/agents 19종이 loadRegistry 검증을 통과한다(problems 0·유효 target)", () => {
    const reg = loadRegistry(TPL_AGENTS);
    assert.equal(reg.problems.length, 0, JSON.stringify(reg.problems));
    assert.deepEqual(reg.personas.map((p) => p.name).sort(), ALL, "정확히 19종");
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

  it("026 AC-3 = 028 AC-7: 빈 노트 폴더에 19종 전부 시드 + 기존 정본은 절대 덮지 않음", () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "lm-seed-"));
    try {
      const items = seedAgents({ agentsDir: dest });
      assert.equal(items.filter((i) => i.status === "seeded").length, 19, "신규 설치 → 19종 시드");
      assert.deepEqual(fs.readdirSync(dest).sort(), ALL.map((n) => `${n}.md`), "파일 목록 일치");
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

  it("026 AC-4 = 028 AC-7: 부분 존재 시 없는 것만 채움(fill-missing-only)", () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), "lm-seed-partial-"));
    try {
      fs.writeFileSync(path.join(dest, "critic.md"), "내 크리틱");
      const items = seedAgents({ agentsDir: dest });
      assert.equal(items.filter((i) => i.status === "seeded").length, 18, "없는 18종만 시드");
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

  it("026 AC-6: personas.md SSoT가 19종·능동적 재조정을 반영한다", () => {
    const ssot = fs.readFileSync(path.join(REPO_ROOT, "docs", "personas.md"), "utf8");
    assert.ok(ssot.includes("`designer`") && ssot.includes("`ux-reviewer`"), "구성표에 2행 존재");
    assert.ok(!/총 8개|이 8개/.test(ssot), "'총 8/이 8개' 잔존 표기 없음");
    assert.ok(/총 19/.test(ssot), "총원 19 갱신(028 — 상세 정합은 028 AC-10)");
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

describe("028 도메인 스페셜리스트 페르소나", () => {
  const NEW9 = [
    "backend-dev",
    "frontend-dev",
    "ios-dev",
    "android-dev",
    "infra",
    "data-platform",
    "auth-dev",
    "dba",
    "security-reviewer",
  ];
  // spec 배정표 — 각 신규 페르소나의 배정 트리거 noun(description 포함 필수 + 타 description 부재)
  const NOUNS: Record<string, string[]> = {
    "backend-dev": ["백엔드", "서버사이드", "API", "엔드포인트"],
    "frontend-dev": ["프론트엔드", "웹 UI", "브라우저", "컴포넌트 구현"],
    "ios-dev": ["iOS", "Swift", "SwiftUI", "아이폰 앱"],
    "android-dev": ["안드로이드", "Kotlin", "Jetpack", "안드로이드 앱"],
    infra: ["인프라", "배포", "CI/CD", "컨테이너", "쿠버네티스", "IaC", "프로비저닝"],
    "data-platform": ["데이터 파이프라인", "ETL", "데이터 웨어하우스", "스트리밍"],
    "auth-dev": ["인증", "인가", "로그인", "세션 관리", "액세스 토큰", "OAuth", "RBAC"],
    dba: ["데이터베이스", "물리 스키마", "인덱스 최적화", "쿼리 최적화", "마이그레이션"],
    "security-reviewer": ["보안 리뷰", "취약점", "위협 모델링", "시큐어 코딩", "공급망 보안"],
  };
  // 공통 금지어(기존 소유자의 배정 noun) — 신규 9종 description에만 부재 검사(AC-3 ③)
  const BANNED = [
    "설계",
    "self-review",
    "결함 검증",
    "품질 게이트",
    "디자인 시스템",
    "디자인 토큰",
    "컴포넌트 정의",
    "사용성",
    "접근성",
  ];
  // spec AC-2 — 도메인별 필수 인접 핸드오프(본문에 상대 이름 존재)
  const HANDOFFS: Record<string, string[]> = {
    "backend-dev": ["dba", "auth-dev", "infra"],
    "frontend-dev": ["designer", "ux-reviewer", "backend-dev"],
    "ios-dev": ["designer"],
    "android-dev": ["designer"],
    infra: ["backend-dev"],
    "data-platform": ["dba"],
    "auth-dev": ["security-reviewer"],
    dba: ["data-platform", "architect"],
    "security-reviewer": ["auth-dev", "critic"],
  };

  function descOf(name: string): string {
    const reg = loadRegistry(TPL_AGENTS);
    return reg.personas.find((p) => p.name === name)!.description;
  }
  function bodyOf(name: string): string {
    return fs.readFileSync(path.join(TPL_AGENTS, `${name}.md`), "utf8");
  }
  function skillDesc(): string {
    const raw = fs.readFileSync(
      path.join(REPO_ROOT, "templates", "skills", "sdd-self-review", "SKILL.md"),
      "utf8",
    );
    const m = raw.match(/^description:\s*(.+)$/m);
    return m ? m[1] : "";
  }

  it("028 AC-2: 신규 9종 본문 4절 + 공통·인접 핸드오프 + auth↔security 대칭", () => {
    for (const name of NEW9) {
      const body = bodyOf(name);
      for (const sec of ["## 소유", "## 비소유", "## 원칙", "## 출력 형식"])
        assert.ok(body.includes(sec), `${name}: ${sec}`);
      assert.ok(/아키텍트|architect/.test(body) && /크리틱|critic/.test(body), `${name}: 공통 핸드오프`);
      if (name !== "security-reviewer")
        assert.ok(/인터뷰어|interviewer/.test(body), `${name}: 요구 발굴 핸드오프(interviewer)`);
      for (const h of HANDOFFS[name]) assert.ok(body.includes(h), `${name}: →${h} 인접 핸드오프`);
    }
    assert.ok(bodyOf("auth-dev").includes("security-reviewer"), "auth→security 대칭");
    assert.ok(bodyOf("security-reviewer").includes("auth-dev"), "security→auth 대칭");
  });

  it("028 AC-3: 어휘 서로소 — 신규 lane 대(對) 전체(단방향이 역방향 커버)", () => {
    const reg = loadRegistry(TPL_AGENTS);
    const descs = new Map(reg.personas.map((p) => [p.name, p.description]));
    const skill = skillDesc();
    assert.ok(skill.length > 0, "스킬 description 확보");
    for (const name of NEW9) {
      const own = descs.get(name)!;
      for (const noun of NOUNS[name]) assert.ok(own.includes(noun), `${name}: 자기 noun "${noun}" 포함`);
      for (const b of BANNED) assert.ok(!own.includes(b), `${name}: 금지어 "${b}" 부재`);
    }
    for (const name of NEW9) {
      for (const noun of NOUNS[name]) {
        for (const [other, d] of descs) {
          if (other === name) continue;
          assert.ok(!d.includes(noun), `"${noun}"(${name} 소유)이 ${other} description에 존재`);
        }
        assert.ok(!skill.includes(noun), `"${noun}"이 스킬 description에 존재`);
      }
    }
  });

  it("028 AC-4: critic 보안 트리거 양도(load-bearing) + 핸드오프", () => {
    const critic = descOf("critic");
    assert.ok(!critic.includes("보안"), "critic description에 '보안' 부재(양도 실증)");
    for (const w of ["취약점", "위협 모델링", "시큐어 코딩", "공급망 보안"])
      assert.ok(!critic.includes(w), `critic description에 "${w}" 부재(회귀 보조)`);
    assert.ok(bodyOf("critic").includes("security-reviewer"), "critic 본문 핸드오프");
  });

  it("028 AC-5: 모델 티어 — 구현 8종 opus·tools 없음, security-reviewer opus+읽기 도구", () => {
    const reg = loadRegistry(TPL_AGENTS);
    for (const name of NEW9) {
      const p = reg.personas.find((x) => x.name === name)!;
      assert.equal(p.targets.claude!.model, "opus", `${name}: opus`);
      if (name === "security-reviewer")
        assert.equal(p.targets.claude!.tools, "Read, Grep, Glob, Bash", "리뷰어는 쓰기 없음");
      else assert.equal(p.targets.claude!.tools, undefined, `${name}: tools 생략(구현자 기본 도구)`);
    }
  });

  it("028 AC-6: 가이드 템플릿 4섹션 + AGENTS.md 바이브 코딩 절 + 완화 게이트·design.md 우선", () => {
    const tpl = fs.readFileSync(path.join(REPO_ROOT, "templates", "guides", "guide.template.md"), "utf8");
    for (const sec of ["스택", "컨벤션", "금지사항", "참조"]) assert.ok(tpl.includes(sec), `가이드 ${sec} 섹션`);
    const agentsMd = fs.readFileSync(path.join(REPO_ROOT, "AGENTS.md"), "utf8");
    assert.ok(agentsMd.includes("바이브 코딩"), "AGENTS.md 절");
    assert.ok(/cp templates\/guides\/guide\.template\.md/.test(agentsMd), "가이드 cp 안내");
    assert.ok(/없으면[\s\S]{0,80}(일반|모범)[\s\S]{0,40}명시/.test(agentsMd), "완화 게이트 문구");
    const devs = NEW9.filter((n) => n !== "security-reviewer");
    for (const name of devs) {
      const body = bodyOf(name);
      assert.ok(body.includes("guides/"), `${name}: 가이드 참조`);
      assert.ok(/없으면[\s\S]{0,120}명시/.test(body), `${name}: 완화 게이트`);
    }
    for (const name of ["frontend-dev", "ios-dev", "android-dev"])
      assert.ok(/design\.md[\s\S]{0,200}(우선|먼저)/.test(bodyOf(name)), `${name}: design.md 게이트 우선 규칙`);
  });

  it("028 AC-8: worker 경계 — 도메인 위임 + UI 소유 분할 + description 불변", () => {
    const body = bodyOf("worker");
    assert.ok(/도메인 페르소나|frontend-dev/.test(body), "도메인 위임 문구");
    assert.ok(body.includes("frontend-dev") && /ios-dev|android-dev/.test(body), "UI 소유 분할");
    const desc = descOf("worker");
    for (const noun of ["백엔드", "프론트엔드", "안드로이드", "인프라"])
      assert.ok(!desc.includes(noun), `worker description에 "${noun}" 없음(역-충돌 방지)`);
  });

  it("028 AC-9: 위생 — templates/agents·guides 전수에 개인 절대경로 부재", () => {
    const guidesDir = path.join(REPO_ROOT, "templates", "guides");
    const files = [
      ...fs.readdirSync(TPL_AGENTS).map((n) => path.join(TPL_AGENTS, n)),
      ...fs.readdirSync(guidesDir).map((n) => path.join(guidesDir, n)),
    ];
    for (const f of files) {
      const body = fs.readFileSync(f, "utf8");
      assert.ok(!body.includes("/Users/"), `${path.basename(f)}: /Users/ 없음`);
      for (const line of body.split("\n"))
        if (line.includes("/home/")) assert.ok(line.includes("/home/<"), `${path.basename(f)}: 플레이스홀더만`);
    }
  });

  it("028 AC-10: personas.md SSoT 19종·성분 정합·구성표 모델/핸드오프·바이브 코딩 무대", () => {
    const ssot = fs.readFileSync(path.join(REPO_ROOT, "docs", "personas.md"), "utf8");
    // 구성표 9행 — 각 행에 모델(opus)과 핸드오프 표기(codex 교차 검증 block 2)
    const ROW_HANDOFF: Record<string, string> = {
      "backend-dev": "dba",
      "frontend-dev": "designer",
      "ios-dev": "designer",
      "android-dev": "designer",
      infra: "backend-dev",
      "data-platform": "analyst",
      "auth-dev": "security-reviewer",
      dba: "아키텍트",
      "security-reviewer": "크리틱",
    };
    for (const name of NEW9) {
      const row = ssot.split("\n").find((l) => l.includes("`" + name + "`"));
      assert.ok(row, `구성표 ${name} 행`);
      assert.ok(row!.includes("opus"), `${name} 행에 모델(opus)`);
      assert.ok(row!.includes(ROW_HANDOFF[name]), `${name} 행에 핸드오프(${ROW_HANDOFF[name]})`);
    }
    assert.ok(!/총 10개|이 10개/.test(ssot), "스테일 총원 표기 없음");
    // TL;DR 성분합 = 총원(5+5+9=19) — 성분 표기 전부 존재(codex 조언)
    for (const part of ["코어 5개", "무대 확장 5개", "9개", "총 19개"])
      assert.ok(ssot.includes(part), `TL;DR 성분 "${part}"`);
    assert.ok(ssot.includes("바이브 코딩"), "바이브 코딩 무대");
  });
});
