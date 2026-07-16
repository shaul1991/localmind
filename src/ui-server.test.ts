/**
 * specs/034 — 모니터링 UI 서버(라우트·인증·정적 서빙) 테스트.
 * AC 매핑: AC-1(정적 서빙·외부 참조 0) · AC-4(키 없음 401) · AC-5(시크릿 원문 부재)
 * 실행: npm test
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { loadConfig } from "./config.js";
import { createUiApp, type UiDeps } from "./ui-server.js";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "ui-server-"));
const SECRET = "raw-secret-value-abcdef123456";
let baseUrl = "";
let close: () => Promise<void> = async () => {};

function fixtureDeps(): UiDeps {
  const envFile = path.join(TMP, ".env");
  fs.writeFileSync(envFile, `LOCALMIND_API_KEY=${SECRET}\nLOG_LEVEL=info\n`);
  const notes = path.join(TMP, "notes");
  fs.mkdirSync(path.join(notes, "reports"), { recursive: true });
  fs.writeFileSync(path.join(notes, "reports", "r1.md"), "# 리포트 원문");
  fs.writeFileSync(path.join(notes, "비밀.md"), "reports 밖 노트 — 접근 불가해야 함");
  const indexPath = path.join(notes, ".brain-index.json");
  fs.writeFileSync(
    indexPath,
    JSON.stringify({
      version: 5,
      embeddingModel: "text-embedding-3-small",
      bindings: { notes },
      files: { "notes/a.md": { hash: "h", folder: "notes", chunks: [{ path: "notes/a.md", text: "t", slot: 0 }], linksOut: [] } },
    }),
  );
  // specs/048 — 거버넌스 조회 픽스처(규칙·스킬)
  const rulesDir = path.join(TMP, "rules");
  fs.mkdirSync(path.join(rulesDir, "base"), { recursive: true });
  fs.writeFileSync(path.join(rulesDir, "base", "spec-first.md"), "spec 먼저 작성한다.");
  const skillsDir = path.join(TMP, "skills");
  fs.mkdirSync(path.join(skillsDir, "my-skill"), { recursive: true });
  fs.writeFileSync(
    path.join(skillsDir, "my-skill", "SKILL.md"),
    "---\nname: my-skill\ndescription: 테스트 스킬\n---\n<!-- managed-by: localmind (skill: my-skill) -->\n본문\n",
  );
  return {
    projectDir: TMP,
    envFile,
    folders: [{ label: "notes", dir: notes }],
    indexPath,
    queryLogPath: path.join(TMP, "query-log.jsonl"),
    registryDir: path.join(TMP, "agents-none"),
    claudeAgentsDir: path.join(TMP, "claude-agents"),
    codexHome: path.join(TMP, "codex"),
    rulesDir,
    skillsDir,
    services: [], // 헬스 프로브는 수집기 테스트에서 검증 — 라우트 테스트는 지연 없이
    publicDir: path.resolve("public/ui"),
  };
}

before(async () => {
  process.env.LOCALMIND_API_KEY = "test-ui-key";
  const config = loadConfig();
  const app = createUiApp(config, fixtureDeps());
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => new Promise((r) => server.close(() => r()));
});
after(async () => {
  await close();
  fs.rmSync(TMP, { recursive: true, force: true });
});

const KEY = { authorization: "Bearer test-ui-key" };

describe("정적 UI 서빙 (AC-1)", () => {
  it("GET /ui/ → 200 HTML", async () => {
    const res = await fetch(`${baseUrl}/ui/`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.ok(body.includes("<title>"), "HTML 문서");
  });
  it("GET / → /ui/로 안내(redirect)", async () => {
    const res = await fetch(`${baseUrl}/`, { redirect: "manual" });
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/ui/");
  });
  it("정적 자산에 외부 네트워크 참조가 없다(오프라인 동작 — AC-9의 정적 근거)", () => {
    const dir = path.resolve("public/ui");
    for (const f of fs.readdirSync(dir)) {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      // www.w3.org/2000/svg 는 SVG 네임스페이스 식별자 — 네트워크 요청이 아니다(favicon data URI).
      const external = src.match(/https?:\/\/(?!127\.0\.0\.1|localhost|www\.w3\.org\/2000\/svg)[^\s"'`)%]+/g) ?? [];
      assert.deepEqual(external, [], `${f}에 외부 URL 없음`);
    }
  });
});

describe("인증 (AC-4)", () => {
  it("키 없이 /ui/api/* → 401 + 한국어 안내", async () => {
    const res = await fetch(`${baseUrl}/ui/api/config`);
    assert.equal(res.status, 401);
    const body = (await res.json()) as { error: { message: string } };
    assert.ok(/API 키/.test(body.error.message));
  });
  it("잘못된 키 → 401, 올바른 키 → 200", async () => {
    const bad = await fetch(`${baseUrl}/ui/api/index`, { headers: { authorization: "Bearer nope" } });
    assert.equal(bad.status, 401);
    const ok = await fetch(`${baseUrl}/ui/api/index`, { headers: KEY });
    assert.equal(ok.status, 200);
  });
});

describe("상태 API", () => {
  it("/ui/api/config — 시크릿 원문이 응답에 없다(AC-5)", async () => {
    const res = await fetch(`${baseUrl}/ui/api/config`, { headers: KEY });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(!text.includes(SECRET), "시크릿 원문 부재");
    const body = JSON.parse(text) as { entries: { key: string; masked: boolean }[]; folders: unknown[] };
    assert.equal(body.entries.find((e) => e.key === "LOCALMIND_API_KEY")!.masked, true);
    assert.equal(body.folders.length, 1);
  });
  it("/ui/api/index — 인덱스 요약(AC-3 라우트 층)", async () => {
    const res = await fetch(`${baseUrl}/ui/api/index`, { headers: KEY });
    const body = (await res.json()) as { indexed: boolean; folders: { files: number }[] };
    assert.equal(body.indexed, true);
    assert.equal(body.folders[0].files, 1);
  });
  it("/ui/api/repos — 비git 폴더도 안전하게 분류(AC-7 라우트 층)", async () => {
    const res = await fetch(`${baseUrl}/ui/api/repos`, { headers: KEY });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { repos: { label: string; kind: string }[] };
    assert.ok(body.repos.length >= 2, "코드 repo + 노트 폴더");
    assert.equal(body.repos.find((r) => r.label === "notes")!.kind, "not-git");
  });
  it("/ui/api/agents — 레지스트리 부재도 오류가 아니라 빈 목록", async () => {
    const res = await fetch(`${baseUrl}/ui/api/agents`, { headers: KEY });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { personas: unknown[] };
    assert.deepEqual(body.personas, []);
  });
  it("모르는 /ui/api/* → 404 JSON", async () => {
    const res = await fetch(`${baseUrl}/ui/api/nope`, { headers: KEY });
    assert.equal(res.status, 404);
  });
  it("/ui/api/report-note — 본문 반환(FR-6)", async () => {
    const res = await fetch(`${baseUrl}/ui/api/report-note?label=notes&file=r1.md`, { headers: KEY });
    const body = (await res.json()) as { content: string };
    assert.ok(body.content.includes("리포트 원문"));
  });
  it("/ui/api/report-note — 경로 탈출 차단(보안)", async () => {
    for (const file of ["../비밀.md", "..%2F비밀.md", "a/../../비밀.md", "/etc/hosts"]) {
      const res = await fetch(
        `${baseUrl}/ui/api/report-note?label=notes&file=${encodeURIComponent(file)}`,
        { headers: KEY },
      );
      assert.equal(res.status, 400, `차단: ${file}`);
    }
  });
});

describe("거버넌스 API (specs/048)", () => {
  it("/ui/api/rules — base 목록(전문 제외)·problems/warnings 포함", async () => {
    const res = await fetch(`${baseUrl}/ui/api/rules`, { headers: KEY });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { base: { name: string; layer: string }[]; problems: unknown[] };
    assert.ok(body.base.some((r) => r.name === "spec-first" && r.layer === "base"));
    assert.equal(body.problems.length, 0);
  });
  it("/ui/api/rule?name= — 전문 반환(AC-2), 미존재 name은 400(AC-7)", async () => {
    const ok = await fetch(`${baseUrl}/ui/api/rule?name=spec-first`, { headers: KEY });
    assert.equal(ok.status, 200);
    const body = (await ok.json()) as { content: string };
    assert.ok(body.content.includes("spec 먼저"));
    const bad = await fetch(`${baseUrl}/ui/api/rule?name=no-such-rule`, { headers: KEY });
    assert.equal(bad.status, 400);
  });
  it("/ui/api/skills — 목록(managed 배지 판정 포함, AC-3)", async () => {
    const res = await fetch(`${baseUrl}/ui/api/skills`, { headers: KEY });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { skills: { name: string; managed: boolean }[] };
    assert.ok(body.skills.some((s) => s.name === "my-skill" && s.managed === true));
  });
  it("/ui/api/skill?name= — 전문 반환(AC-3), traversal·절대경로 거부(AC-7)", async () => {
    const ok = await fetch(`${baseUrl}/ui/api/skill?name=my-skill`, { headers: KEY });
    assert.equal(ok.status, 200);
    const body = (await ok.json()) as { content: string };
    assert.ok(body.content.includes("본문"));
    for (const bad of ["..", "../secret", "/etc/passwd"]) {
      const res = await fetch(`${baseUrl}/ui/api/skill?name=${encodeURIComponent(bad)}`, { headers: KEY });
      assert.equal(res.status, 400, `거부돼야 함: ${bad}`);
    }
  });
  it("/ui/api/agent?name= — 알 수 없는 이름은 400(레지스트리 밖 접근 없음, AC-7)", async () => {
    const res = await fetch(`${baseUrl}/ui/api/agent?name=no-such-persona`, { headers: KEY });
    assert.equal(res.status, 400);
  });
  it("키 없이 거버넌스 엔드포인트 요청 → 401(AC-8)", async () => {
    for (const p of ["/rules", "/skills", "/rule?name=spec-first", "/skill?name=my-skill", "/agent?name=x", "/source-sync"]) {
      const res = await fetch(`${baseUrl}/ui/api${p}`);
      assert.equal(res.status, 401, `401이어야 함: ${p}`);
    }
  });
});
