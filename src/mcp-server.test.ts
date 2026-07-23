/**
 * mcp-server.ts 도구 등록 단위 테스트 — InMemoryTransport로 실제 MCP 프로토콜을
 * 경유해 검증한다(zod 스키마 검증·핸들러 실행을 실제로 거침).
 *
 * great-reduction AC-1: 등록 도구는 정확히 3개(capture_note·search_notes·whoami)다.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "./mcp-server.js";

describe("MCP tool surface (great-reduction AC-1)", () => {
  let client: Client;

  before(async () => {
    const server = buildServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: "test-client", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  });

  after(async () => {
    await client.close();
  });

  it("도구 표면: capture_note·search_notes·whoami + brief(living-memory FR-3) — 정확히 4개", async () => {
    // great-reduction AC-1(15→3) 위에 living-memory가 brief 1개만 추가한다(도구 표면 최소 유지).
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, ["brief", "capture_note", "search_notes", "whoami"]);
  });

  it("whoami가 노트 폴더를 보고하고 게이트웨이·메모리 서비스는 언급하지 않는다", async () => {
    const result = await client.callTool({ name: "whoami", arguments: {} });
    assert.equal(result.isError, false);
    const text = (result.content as Array<{ text?: string }>).map((c) => c.text ?? "").join("\n");
    assert.match(text, /notes folders/);
    assert.doesNotMatch(text, /gateway|8787|8767|memory:/);
  });
});

// ── living-memory (specs/202607211621) — 통합 probe ─────────────────────────
// capture/search/brief는 모듈 초기화 시 env(NOTES_DIR 등)를 읽으므로, brain.test.ts의
// probe 패턴을 따라 자식 프로세스에서 임베딩 스텁과 함께 실행한다(외부 서버 불필요).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(new URL(".", import.meta.url).pathname, "..");

function runMcpProbe(notesDir: string, body: string, extraEnv: Record<string, string> = {}): any {
  const script = [
    `const http = require("node:http");`,
    `const srv = http.createServer((req, res) => {`,
    `  let raw = ""; req.on("data", (c) => (raw += c));`,
    `  req.on("end", () => {`,
    `    res.setHeader("content-type", "application/json");`,
    `    const n = (JSON.parse(raw).input || []).length;`,
    `    res.end(JSON.stringify({ data: Array.from({ length: n }, (_, i) => ({ index: i, embedding: [1, 0, 0, 0] })) }));`,
    `  });`,
    `});`,
    `srv.listen(0, async () => {`,
    `  const base = "http://127.0.0.1:" + srv.address().port;`,
    `  process.env.EMBEDDINGS_URL = base + "/v1";`,
    `  const { buildServer } = await import(${JSON.stringify(path.join(REPO, "src/mcp-server.ts"))});`,
    `  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");`,
    `  const { InMemoryTransport } = await import("@modelcontextprotocol/sdk/inMemory.js");`,
    `  const [ct, st] = InMemoryTransport.createLinkedPair();`,
    `  const client = new Client({ name: "probe", version: "0.0.0" });`,
    `  await Promise.all([client.connect(ct), buildServer().connect(st)]);`,
    `  const text = (r) => r.content.map((c) => c.text ?? "").join("\\n");`,
    `  const call = (name, args) => client.callTool({ name, arguments: args });`,
    `  try {`,
    body,
    `  } catch (e) { console.error(e); process.exit(1); }`,
    `  await client.close(); srv.close();`,
    `});`,
  ].join("\n");
  const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
    cwd: REPO,
    encoding: "utf8",
    env: {
      ...process.env,
      NOTES_DIR: `notes=${notesDir}`,
      BRAIN_INDEX: path.join(notesDir, ".brain-index.json"),
      QUERY_LOG: path.join(notesDir, "query-log.jsonl"),
      EMBEDDINGS_KEY: "test-key",
      EMBED_RETRIES: "1",
      ...extraEnv,
    },
  });
  return JSON.parse(out.trim().split("\n").pop()!);
}

describe("living-memory: capture 결정 확장 (AC-1·2·3·11)", () => {
  it("AC-1·11: 결정 파라미터로 1회 호출 → type: decision + 3층 + last_verified 자동", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-dec-cap-"));
    try {
      const r = runMcpProbe(dir, `
        const res = await call("capture_note", { text: "본문", title: "결정테스트",
          choice: "Auth 2.0 채택", why: "표준 성숙",
          assumptions: [{ fact: "2.0이 최신", volatility: "high" }, { fact: "취향", volatility: "low" }] });
        const fsx = require("node:fs"), p = require("node:path");
        const md = fsx.readdirSync(${JSON.stringify("__DIR__")}).filter((f) => f.endsWith(".md"));
        const note = md.length === 1 ? fsx.readFileSync(p.join(${JSON.stringify("__DIR__")}, md[0]), "utf8") : "";
        console.log(JSON.stringify({ isError: res.isError ?? false, out: text(res), files: md.length, note }));
      `.replaceAll('"__DIR__"', JSON.stringify(dir)));
      assert.equal(r.isError, false);
      assert.equal(r.files, 1, "단일 호출로 파일 1개 완성(AC-11)");
      assert.match(r.note, /type: decision/);
      assert.match(r.note, /choice: Auth 2\.0 채택/);
      assert.match(r.note, /volatility: high/);
      assert.match(r.note, /last_verified: \d{4}-\d{2}-\d{2}T/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("AC-2: 결정 파라미터 없는 종전 호출은 great-reduction 이후 baseline과 동일 구조", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-dec-plain-"));
    try {
      const r = runMcpProbe(dir, `
        await call("capture_note", { text: "그냥 메모", title: "평범" });
        const fsx = require("node:fs"), p = require("node:path");
        const md = fsx.readdirSync(${JSON.stringify("__DIR__")}).filter((f) => f.endsWith(".md"));
        console.log(JSON.stringify({ note: fsx.readFileSync(p.join(${JSON.stringify("__DIR__")}, md[0]), "utf8") }));
      `.replaceAll('"__DIR__"', JSON.stringify(dir)));
      const fm = r.note.split("---")[1];
      assert.match(fm, /title: "평범"/);
      assert.match(fm, /tags: \[\]/);
      assert.match(fm, /source: localmind/);
      assert.doesNotMatch(fm, /type:|decision|assumptions/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("AC-3: volatility 누락 → 한국어 안내 에러 + 파일 미생성", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-dec-bad-"));
    try {
      const r = runMcpProbe(dir, `
        const res = await call("capture_note", { text: "b", choice: "x", why: "y",
          assumptions: [{ fact: "z" }] });
        const fsx = require("node:fs");
        const md = fsx.readdirSync(${JSON.stringify("__DIR__")}).filter((f) => f.endsWith(".md"));
        console.log(JSON.stringify({ isError: res.isError ?? false, out: text(res), files: md.length }));
      `.replaceAll('"__DIR__"', JSON.stringify(dir)));
      assert.equal(r.isError, true);
      assert.match(r.out, /volatility/);
      assert.match(r.out, /[가-힣]/);
      assert.equal(r.files, 0, "파일이 생성되면 안 된다");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("living-memory: brief (AC-5·6·10)", () => {
  it("AC-5·10: 결정 요약(선택·이유·전제·경로) — 전량 최근화 시에만 신호 소멸", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-brief-"));
    try {
      const r = runMcpProbe(dir, `
        await call("capture_note", { text: "인증 결정 본문", title: "인증방식",
          choice: "Auth 2.0 채택", why: "표준 성숙도와 생태계",
          assumptions: [{ fact: "2.0이 최신", volatility: "high" }, { fact: "PKCE 권장 유지", volatility: "high" }] });
        const fsx = require("node:fs"), p = require("node:path");
        const md = fsx.readdirSync(${JSON.stringify("__DIR__")}).filter((f) => f.endsWith(".md"));
        const file = p.join(${JSON.stringify("__DIR__")}, md[0]);
        const old = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 19);
        fsx.writeFileSync(file, fsx.readFileSync(file, "utf8").replace(/last_verified: [^\\n]+/g, "last_verified: " + old));
        const b1 = text(await call("brief", { hint: "인증" }));
        const now = new Date().toISOString().slice(0, 19);
        let t = fsx.readFileSync(file, "utf8");
        t = t.replace(/last_verified: [^\\n]+/, "last_verified: " + now);
        fsx.writeFileSync(file, t);
        const b2 = text(await call("brief", { hint: "인증" }));
        t = fsx.readFileSync(file, "utf8").replace(/last_verified: [^\\n]+/g, "last_verified: " + now);
        fsx.writeFileSync(file, t);
        const b3 = text(await call("brief", { hint: "인증" }));
        console.log(JSON.stringify({ b1, b2, b3, notePath: "notes/" + md[0] }));
      `.replaceAll('"__DIR__"', JSON.stringify(dir)));
      assert.match(r.b1, /Auth 2\.0 채택/);
      assert.match(r.b1, /표준 성숙도/);
      assert.match(r.b1, new RegExp(r.notePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "노트 경로 포함");
      assert.match(r.b1, /⏳/, "stale 신호");
      assert.match(r.b2, /⏳/, "1건 최근화로는 신호 유지(AC-10)");
      assert.doesNotMatch(r.b3, /⏳/, "전량 최근화 시 신호 소멸");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("AC-6: 관련 결정 없음 → 빈 브리핑 한국어 안내(에러 아님)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-brief-empty-"));
    try {
      const r = runMcpProbe(dir, `
        const res = await call("brief", { hint: "존재하지않는주제" });
        console.log(JSON.stringify({ isError: res.isError ?? false, out: text(res) }));
      `);
      assert.equal(r.isError, false);
      assert.match(r.out, /[가-힣]/);
      assert.match(r.out, /결정.*없|기록되지 않/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe("living-memory: 낡음 신호 (AC-4·7·8·9)", () => {
  it("AC-7: search_notes 신호 부가 — 신호 strip 후 무신호 응답과 byte-equal", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-sig-"));
    try {
      const r = runMcpProbe(dir, `
        await call("capture_note", { text: "쿠키 만료 결정", title: "쿠키",
          choice: "세션 쿠키", why: "단순", assumptions: [{ fact: "브라우저 정책", volatility: "high" }] });
        const fsx = require("node:fs"), p = require("node:path");
        const md = fsx.readdirSync(${JSON.stringify("__DIR__")}).filter((f) => f.endsWith(".md"));
        const file = p.join(${JSON.stringify("__DIR__")}, md[0]);
        const old = new Date(Date.now() - 40 * 86400000).toISOString().slice(0, 19);
        fsx.writeFileSync(file, fsx.readFileSync(file, "utf8").replace(/last_verified: [^\\n]+/, "last_verified: " + old));
        const withSig = text(await call("search_notes", { query: "쿠키" }));
        process.env.BRIEF_STALE_DAYS = "99999";
        const noSig = text(await call("search_notes", { query: "쿠키" }));
        console.log(JSON.stringify({ withSig, noSig }));
      `.replaceAll('"__DIR__"', JSON.stringify(dir)));
      assert.match(r.withSig, /⏳/);
      assert.doesNotMatch(r.noSig, /⏳/);
      const stripped = r.withSig.split("\n").filter((l: string) => !l.includes("⏳")).join("\n").trimEnd();
      assert.equal(stripped, r.noSig.trimEnd(), "신호 제거 시 본문 byte-equal(AC-7)");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("AC-8: 전부 low·최근 검증이면 신호 없음(오탐 0)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-sig-none-"));
    try {
      const r = runMcpProbe(dir, `
        await call("capture_note", { text: "취향 결정", title: "취향",
          choice: "다크 테마", why: "선호", assumptions: [{ fact: "개인 취향", volatility: "low" }] });
        const out = text(await call("search_notes", { query: "취향" }));
        console.log(JSON.stringify({ out }));
      `);
      assert.doesNotMatch(r.out, /⏳/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("AC-4·9: 비정형·깨진 frontmatter 노트 — 검색 정상·신호만 생략", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-sig-legacy-"));
    try {
      fs.writeFileSync(path.join(dir, "legacy.md"), "스키마 없는 옛 노트 — 인증 관련 메모\n");
      fs.writeFileSync(path.join(dir, "broken.md"), "---\ntype: decision\ndecision: [broken\n---\n인증 깨진 노트\n");
      const r = runMcpProbe(dir, `
        const s = await call("search_notes", { query: "인증" });
        const b = await call("brief", { hint: "인증" });
        console.log(JSON.stringify({ sErr: s.isError ?? false, sOut: text(s), bErr: b.isError ?? false, bOut: text(b) }));
      `);
      assert.equal(r.sErr, false);
      assert.match(r.sOut, /legacy\.md|broken\.md/, "검색 자체는 정상(AC-4)");
      assert.doesNotMatch(r.sOut, /⏳/, "깨진 frontmatter는 신호만 생략(AC-9)");
      assert.equal(r.bErr, false, "brief도 에러 아님(AC-4)");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

// ── brief 구형식 폴백 (specs/202607231759) — living-memory 이전 결정 노트도 보이게 ──
describe("brief 구형식 폴백 (specs/202607231759)", () => {
  const LEGACY = [
    "---",
    'title: "결정: 게이트웨이 정리"',
    "date: 2026-07-10T09:00:00",
    'tags: ["decision"]',
    "source: localmind",
    "---",
    "# 결정: 게이트웨이 정리",
    "",
    "게이트웨이를 중지하고 인증 직결로 전환했다.",
    "",
  ].join("\n");

  it("AC-2·3: 구형식 결정 → (구형식)+제목+발췌+경로 표기, ⏳ 없음 + 미기록 안내", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-brief-legacy-"));
    try {
      fs.writeFileSync(path.join(dir, "legacy-decision.md"), LEGACY);
      const r = runMcpProbe(dir, `
        const b = await call("brief", { hint: "인증" });
        console.log(JSON.stringify({ bErr: b.isError ?? false, out: text(b) }));
      `);
      assert.equal(r.bErr, false);
      assert.match(r.out, /\(구형식\)/, "구형식 표기(AC-2)");
      assert.match(r.out, /결정: 게이트웨이 정리/, "제목(AC-2)");
      assert.match(r.out, /legacy-decision\.md/, "노트 경로(AC-2)");
      assert.match(r.out, /게이트웨이를 중지하고/, "발췌(AC-2)");
      assert.doesNotMatch(r.out, /⏳/, "구형식엔 낡음 신호 없음(AC-3)");
      assert.match(r.out, /미기록/, "낡음 신호 미기록 안내(AC-3)");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("AC-6·7: 신형식+구형식(깨진 신형식 포함) 혼재 — 신형식 먼저, 합산 건수 표기", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-brief-mixed-"));
    try {
      fs.writeFileSync(path.join(dir, "legacy-decision.md"), LEGACY);
      fs.writeFileSync(
        path.join(dir, "broken-new.md"),
        '---\ntitle: "깨진 신형식"\ntype: decision\ntags: ["decision"]\n---\n인증 결정 본문만 남음\n',
      );
      const r = runMcpProbe(dir, `
        await call("capture_note", { text: "인증 결정 본문", title: "인증방식",
          choice: "Auth 2.0 채택", why: "표준 성숙",
          assumptions: [{ fact: "2.0이 최신", volatility: "low" }] });
        const b = await call("brief", { hint: "인증" });
        console.log(JSON.stringify({ bErr: b.isError ?? false, out: text(b) }));
      `);
      assert.equal(r.bErr, false);
      assert.match(r.out, /Auth 2\.0 채택/, "신형식 3층 유지(AC-1)");
      assert.match(r.out, /깨진 신형식/, "깨진 신형식도 폴백 표기(AC-7)");
      assert.match(r.out, /결정: 게이트웨이 정리/, "구형식 표기(AC-2)");
      assert.ok(
        r.out.indexOf("Auth 2.0 채택") < r.out.indexOf("(구형식)"),
        "신형식이 구형식보다 먼저(AC-6)",
      );
      assert.match(r.out, /결정 3건/, "합산 건수");
      assert.match(r.out, /구형식 2건/, "구형식 건수 표기");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("AC-4: decision 태그 없는 일반 노트만 있으면 여전히 빈 브리핑 안내", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-brief-plain-"));
    try {
      fs.writeFileSync(
        path.join(dir, "plain.md"),
        '---\ntitle: "그냥 메모"\ntags: []\n---\n인증 관련 일반 메모\n',
      );
      const r = runMcpProbe(dir, `
        const b = await call("brief", { hint: "인증" });
        console.log(JSON.stringify({ bErr: b.isError ?? false, out: text(b) }));
      `);
      assert.equal(r.bErr, false);
      assert.doesNotMatch(r.out, /\(구형식\)/, "일반 노트는 결정 아님(AC-4)");
      assert.match(r.out, /결정 노트가 없습니다|기록되지 않/, "빈 브리핑 안내 유지(AC-4)");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
