/**
 * specs/034 — 모니터링 웹 UI 상태 수집기 테스트.
 * 실행: npm test (node:test). 픽스처: 임시 폴더 + bare git repo + 가짜 레지스트리.
 * AC 매핑: AC-2(overview) · AC-3(index) · AC-5 수집 층(config 마스킹) · AC-6(agents) · AC-7(repos)
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";
import type { AddressInfo } from "node:net";
import {
  agentsStatus,
  configStatus,
  indexStatus,
  maskSecret,
  overviewStatus,
  readReportNote,
  reportsStatus,
  reposStatus,
} from "./ui-status.js";

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "ui-status-"));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

function git(dir: string, ...args: string[]): string {
  return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" }).trim();
}
function gitId(dir: string) {
  git(dir, "config", "user.email", "t@t");
  git(dir, "config", "user.name", "t");
}

describe("configStatus — .env 마스킹(AC-5 수집 층)", () => {
  it("시크릿 키는 마스킹되고 원문이 결과에 없다", () => {
    const envFile = path.join(TMP, ".env");
    fs.writeFileSync(
      envFile,
      [
        "# 주석은 무시",
        "LOCALMIND_API_KEY=supersecret-value-1234567890",
        "CLAUDE_CODE_OAUTH_TOKEN=tok-abcdefghijk",
        "NOTES_DIR=work=/tmp/w,/tmp/l",
        "LOG_LEVEL=info",
        "",
      ].join("\n"),
    );
    const st = configStatus(envFile);
    assert.equal(st.exists, true);
    const raw = JSON.stringify(st);
    assert.ok(!raw.includes("supersecret-value-1234567890"), "시크릿 원문 부재");
    assert.ok(!raw.includes("tok-abcdefghijk"), "토큰 원문 부재");
    const key = st.entries.find((e) => e.key === "LOCALMIND_API_KEY")!;
    assert.equal(key.masked, true);
    assert.ok(key.value.startsWith("supe"), "앞4자 표시");
    assert.ok(key.value.includes("28"), "길이 표시");
    const notes = st.entries.find((e) => e.key === "NOTES_DIR")!;
    assert.equal(notes.masked, false);
    assert.equal(notes.value, "work=/tmp/w,/tmp/l");
  });
  it(".env 부재는 오류가 아니라 exists:false", () => {
    const st = configStatus(path.join(TMP, "no-such.env"));
    assert.equal(st.exists, false);
    assert.deepEqual(st.entries, []);
  });
  it("maskSecret 형식: 앞4자 + 길이", () => {
    assert.equal(maskSecret("abcdefgh"), "abcd… (길이 8)");
    assert.equal(maskSecret("ab"), "•••• (길이 2)"); // 4자 미만은 앞자리도 감춘다
  });
  it("시크릿 키 이름이 아니어도 URL 임베드 자격증명은 마스킹된다(보안 리뷰 중대-2)", () => {
    const envFile = path.join(TMP, "cred.env");
    fs.writeFileSync(
      envFile,
      'NOTES_REPOS="work=https://user:ghp_REALTOKEN12345@github.com/u/work.git"\n',
    );
    const st = configStatus(envFile);
    const raw = JSON.stringify(st);
    assert.ok(!raw.includes("ghp_REALTOKEN12345"), "토큰 원문 부재");
    const repos = st.entries.find((e) => e.key === "NOTES_REPOS")!;
    assert.ok(repos.value.includes("://***@github.com"), "userinfo가 ***로 대체");
    assert.equal(repos.masked, true);
  });
});

describe("indexStatus — 인덱스 요약(AC-3)", () => {
  it("폴더 라벨별 파일·청크 수와 버전·mtime을 요약한다", () => {
    const idxPath = path.join(TMP, ".brain-index.json");
    fs.writeFileSync(
      idxPath,
      JSON.stringify({
        version: 5,
        embeddingModel: "text-embedding-3-small",
        vectorFile: ".brain-index.json.vec-x",
        bindings: { work: "/tmp/w", life: "/tmp/l" },
        files: {
          "work/a.md": { hash: "h1", folder: "work", chunks: [{ path: "work/a.md", text: "t", slot: 0 }], linksOut: [] },
          "work/b.md": { hash: "h2", folder: "work", chunks: [{ path: "work/b.md", text: "t", slot: 1 }, { path: "work/b.md", text: "t2", slot: 2 }], linksOut: [] },
          "life/c.md": { hash: "h3", folder: "life", chunks: [{ path: "life/c.md", text: "t", slot: 3 }], linksOut: [] },
        },
      }),
    );
    const st = indexStatus(idxPath);
    assert.equal(st.indexed, true);
    assert.equal(st.version, 5);
    assert.equal(st.embeddingModel, "text-embedding-3-small");
    assert.ok(st.mtimeMs && st.mtimeMs > 0);
    const work = st.folders.find((f) => f.label === "work")!;
    assert.equal(work.files, 2);
    assert.equal(work.chunks, 3);
    assert.equal(work.dir, "/tmp/w");
    const life = st.folders.find((f) => f.label === "life")!;
    assert.equal(life.files, 1);
  });
  it("인덱스 부재는 오류가 아니라 indexed:false(AC-3 후반)", () => {
    const st = indexStatus(path.join(TMP, "none", ".brain-index.json"));
    assert.equal(st.indexed, false);
    assert.deepEqual(st.folders, []);
  });
});

describe("reposStatus — 정본 최신성(AC-7)", () => {
  const base = path.join(TMP, "repos");
  let behindDir: string;
  let plainDir: string;
  before(() => {
    fs.mkdirSync(base, { recursive: true });
    const seed = path.join(base, "seed");
    fs.mkdirSync(seed);
    fs.writeFileSync(path.join(seed, "a.md"), "a");
    execFileSync("git", ["-C", seed, "init", "-q", "-b", "main"]);
    gitId(seed);
    git(seed, "add", "-A");
    git(seed, "commit", "-qm", "base");
    const origin = path.join(base, "origin.git");
    execFileSync("git", ["clone", "-q", "--bare", seed, origin]);
    behindDir = path.join(base, "clone");
    execFileSync("git", ["clone", "-q", origin, behindDir]);
    gitId(behindDir);
    // origin에 새 커밋 → clone이 behind
    const w = path.join(base, "w");
    execFileSync("git", ["clone", "-q", origin, w]);
    gitId(w);
    fs.writeFileSync(path.join(w, "b.md"), "b");
    git(w, "add", "-A");
    git(w, "commit", "-qm", "adv");
    git(w, "push", "-q", "origin", "main");
    plainDir = path.join(base, "plain");
    fs.mkdirSync(plainDir);
  });
  it("behind인 git repo는 refresh 시 behind>0, 비git 폴더는 not-git으로 구분된다", async () => {
    const out = await reposStatus(
      [
        { label: "notes", dir: behindDir },
        { label: "plain", dir: plainDir },
      ],
      { refresh: true },
    );
    const repo = out.find((r) => r.label === "notes")!;
    assert.equal(repo.kind, "repo");
    assert.equal(repo.behind, 1);
    assert.equal(repo.ahead, 0);
    assert.equal(repo.fetched, true);
    const plain = out.find((r) => r.label === "plain")!;
    assert.equal(plain.kind, "not-git");
  });
  it("존재하지 않는 폴더도 죽지 않고 not-git으로 온다", async () => {
    const out = await reposStatus([{ label: "x", dir: path.join(base, "ghost") }]);
    assert.equal(out[0].kind, "not-git");
  });
});

describe("agentsStatus — 배포 상태(AC-6)", () => {
  const registryDir = path.join(TMP, "agents");
  const claudeDir = path.join(TMP, "claude-agents");
  const codexHome = path.join(TMP, "codex");
  before(() => {
    fs.mkdirSync(registryDir, { recursive: true });
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.mkdirSync(path.join(codexHome, "agents"), { recursive: true });
    const persona = (name: string, codex: boolean) =>
      [
        "---",
        `name: ${name}`,
        `description: ${name} 테스트 페르소나`,
        "targets:",
        "  claude:",
        "    model: sonnet",
        ...(codex ? ["  codex:", "    model: gpt-5"] : []),
        "---",
        "프롬프트 본문",
        "",
      ].join("\n");
    fs.writeFileSync(path.join(registryDir, "alpha.md"), persona("alpha", false));
    fs.writeFileSync(path.join(registryDir, "beta.md"), persona("beta", true));
    // alpha만 claude에 배포됨(마커 포함), beta는 codex 프로필만 존재
    fs.writeFileSync(
      path.join(claudeDir, "alpha.md"),
      "---\nname: alpha\n---\n<!-- managed-by: localmind (persona: alpha) -->\n본문",
    );
    fs.writeFileSync(path.join(codexHome, "beta.config.toml"), "# managed-by: localmind (persona: beta)");
    fs.writeFileSync(path.join(codexHome, "agents", "beta.toml"), "# managed-by: localmind (persona: beta)");
  });
  it("레지스트리 N개 각각의 claude/codex 배포 여부가 실제 파일과 일치한다", () => {
    const st = agentsStatus({ registryDir, claudeAgentsDir: claudeDir, codexHome });
    assert.equal(st.personas.length, 2);
    const alpha = st.personas.find((p) => p.name === "alpha")!;
    assert.equal(alpha.deployed.claude, true);
    assert.equal(alpha.deployed.codex, false); // codex 타깃 자체가 없음
    assert.equal(alpha.targets.codex, false);
    const beta = st.personas.find((p) => p.name === "beta")!;
    assert.equal(beta.deployed.claude, false); // 파일 없음
    assert.equal(beta.deployed.codex, true);
  });
});

describe("overviewStatus — 스택 헬스(AC-2)", () => {
  it("떠 있는 서비스는 up, 죽은 포트는 down — 응답 자체는 항상 온다", async () => {
    const srv = http.createServer((_req, res) => res.end("ok"));
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const port = (srv.address() as AddressInfo).port;
    try {
      const out = await overviewStatus(
        [
          { name: "gateway", url: `http://127.0.0.1:${port}/health` },
          { name: "dead", url: "http://127.0.0.1:1/health" },
        ],
        { timeoutMs: 1500 },
      );
      assert.equal(out.find((s) => s.name === "gateway")!.up, true);
      assert.equal(out.find((s) => s.name === "dead")!.up, false);
    } finally {
      srv.close();
    }
  });
});

describe("reportsStatus — 쿼리 로그·리포트 노트", () => {
  it("로그 부재는 null, 리포트 노트는 폴더별 reports/ 목록", () => {
    const folder = path.join(TMP, "notes-a");
    fs.mkdirSync(path.join(folder, "reports"), { recursive: true });
    fs.writeFileSync(path.join(folder, "reports", "r1.md"), "# r1");
    const st = reportsStatus(path.join(TMP, "no-log.jsonl"), [{ label: "a", dir: folder }]);
    assert.equal(st.queries, null);
    assert.deepEqual(st.reportNotes, [{ label: "a", file: "r1.md" }]);
  });
  it("로그가 있으면 총·실패 건수를 요약한다", () => {
    const logPath = path.join(TMP, "query-log.jsonl");
    const rec = (success: boolean) =>
      JSON.stringify({ ts: new Date().toISOString(), tool: "search_notes", query: "q", hitCount: success ? 1 : 0, success });
    fs.writeFileSync(logPath, [rec(true), rec(false), rec(false)].join("\n") + "\n");
    const st = reportsStatus(logPath, []);
    assert.equal(st.queries!.total, 3);
    assert.equal(st.queries!.failed, 2);
  });
  it("reports/의 심링크는 목록에서 제외되고 본문 읽기도 거부된다(보안 리뷰 중대-1)", () => {
    const folder = path.join(TMP, "notes-sym");
    fs.mkdirSync(path.join(folder, "reports"), { recursive: true });
    fs.writeFileSync(path.join(folder, "reports", "real.md"), "# 진짜");
    const outside = path.join(TMP, "outside-secret.md");
    fs.writeFileSync(outside, "reports 밖 비밀");
    fs.symlinkSync(outside, path.join(folder, "reports", "link.md"));
    const st = reportsStatus(path.join(TMP, "no-log.jsonl"), [{ label: "s", dir: folder }]);
    assert.deepEqual(st.reportNotes, [{ label: "s", file: "real.md" }], "심링크 미노출");
    const read = readReportNote([{ label: "s", dir: folder }], "s", "link.md");
    assert.equal(read.ok, false, "심링크 읽기 거부");
    const real = readReportNote([{ label: "s", dir: folder }], "s", "real.md");
    assert.equal(real.ok, true, "정상 파일은 여전히 읽힘");
  });
});
