/**
 * specs/017 — 페르소나 런타임 위임 통합 테스트 (스텁 게이트웨이, 결정적).
 *
 * brain.ts는 NOTES_DIR 등을 모듈 로드 시점에 읽으므로 자식 프로세스로 격리한다
 * (brain.test.ts의 runQueryLogProbe 패턴 계승). 스텁 서버가 임베딩과 chat/completions를
 * 함께 서빙하고, 모델명별 행동(STUB_BEHAVIORS)으로 합성/검증/태깅 응답을 구분한다.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
import type { AddressInfo } from "node:net";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BRAIN_JS = path.join(REPO_ROOT, "src", "brain.js");

const LIBRARIAN = `---
name: librarian
description: 사서
targets:
  claude:
    model: opus
---
사서-지침-마커: 서가에 있는 것만 근거로.
`;

const CRITIC = `---
name: critic
description: 크리틱
targets:
  claude:
    model: opus
  codex:
    model: gpt-5.5
    reasoning_effort: high
---
크리틱 지침.
`;

const CRITIC_CLAUDE_ONLY = `---
name: critic
description: 크리틱(claude 전용)
targets:
  claude:
    model: opus
---
크리틱 지침.
`;

const CURATOR = `---
name: curator
description: 큐레이터
targets:
  claude:
    model: haiku
---
큐레이터 지침.
`;

interface ProbeOpts {
  personas?: Record<string, string>;
  /** true면 노트 없이 시작(무히트 경로 유도 — 스텁 임베딩은 모든 쿼리에 히트하므로) */
  noNote?: boolean;
  env?: Record<string, string>;
  /** 모델명 → 행동. {type:"text",content} | {type:"delay",ms,content} | {type:"status",code} */
  behaviors?: Record<string, { type: string; content?: string; ms?: number; code?: number }>;
  seedLog?: object[];
  /** m(brain 모듈)·readLog()·waitLog(n)이 주어진 async 컨텍스트에서 실행. out에 결과를 담는다. */
  body: string;
}

function runProbe(opts: ProbeOpts): {
  out: any;
  requests: { model: string; system: string; user: string; body: any }[];
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-delegation-"));
  const notesDir = path.join(root, "notes");
  const agentsDir = path.join(root, "agents");
  fs.mkdirSync(notesDir, { recursive: true });
  fs.mkdirSync(agentsDir, { recursive: true });
  if (!opts.noNote) {
    fs.writeFileSync(path.join(notesDir, "note.md"), "회의는 2026년 6월 12일에 열렸다. 예산은 300만원이다.");
  }
  for (const [f, c] of Object.entries(opts.personas ?? {})) fs.writeFileSync(path.join(agentsDir, f), c);
  const logPath = path.join(root, "query-log.jsonl");
  if (opts.seedLog?.length) fs.writeFileSync(logPath, opts.seedLog.map((r) => JSON.stringify(r)).join("\n") + "\n");

  const script = [
    `const http = require("node:http");`,
    `const fsx = require("node:fs");`,
    `const behaviors = JSON.parse(process.env.STUB_BEHAVIORS || "{}");`,
    `const requests = [];`,
    `const srv = http.createServer((req, res) => {`,
    `  let raw = ""; req.on("data", (c) => (raw += c));`,
    `  req.on("end", () => {`,
    `    res.setHeader("content-type", "application/json");`,
    `    if ((req.url || "").includes("chat/completions")) {`,
    `      const b = JSON.parse(raw);`,
    `      requests.push({ model: b.model, system: b.messages[0].content, user: b.messages[1]?.content ?? "", body: b });`,
    `      const be = behaviors[b.model] || { type: "text", content: "노트 기반 답변: 예산은 300만원 [notes/note.md]" };`,
    `      const send = (content) => res.end(JSON.stringify({ choices: [{ message: { content } }] }));`,
    `      if (be.type === "status") { res.statusCode = be.code; res.end("{}"); return; }`,
    `      if (be.type === "delay") { setTimeout(() => send(be.content ?? "늦음"), be.ms); return; }`,
    `      send(be.content ?? "");`,
    `      return;`,
    `    }`,
    `    const n = (JSON.parse(raw).input || []).length;`,
    `    res.end(JSON.stringify({ data: Array.from({ length: n }, (_, i) => ({ index: i, embedding: [1, 0, 0, 0] })) }));`,
    `  });`,
    `});`,
    `srv.listen(0, async () => {`,
    `  const base = "http://127.0.0.1:" + srv.address().port;`,
    `  process.env.EMBEDDINGS_URL = base + "/v1";`,
    `  process.env.LOCALMIND_URL = base;`,
    `  const m = await import(${JSON.stringify(BRAIN_JS)});`,
    `  const readLog = () => { try { return fsx.readFileSync(process.env.QUERY_LOG, "utf8").trim().split("\\n").filter(Boolean).map(JSON.parse); } catch { return []; } };`,
    `  const waitLog = async (n) => { for (let i = 0; i < 150 && readLog().length < n; i++) await new Promise((r) => setTimeout(r, 20)); return readLog(); };`,
    `  let out = null;`,
    `  try {`,
    opts.body,
    `  } catch (e) { console.error(e); process.exit(1); }`,
    `  process.stdout.write(JSON.stringify({ out, requests }));`,
    `  srv.close();`,
    `});`,
  ].join("\n");

  try {
    const stdout = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        NOTES_DIR: `notes=${notesDir}`,
        BRAIN_INDEX: path.join(notesDir, ".brain-index.json"),
        QUERY_LOG: logPath,
        LOCALMIND_AGENTS_DIR: agentsDir,
        EMBEDDINGS_KEY: "test-key",
        EMBED_RETRIES: "1",
        STUB_BEHAVIORS: JSON.stringify(opts.behaviors ?? {}),
        BRAIN_VERIFY_TIMEOUT_MS: "3000",
        BRAIN_TAG_TIMEOUT_MS: "3000",
        ...opts.env,
      },
    });
    return JSON.parse(stdout);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const ASK_BODY = `
  await m.reindex();
  const r = await m.askBrain("예산이 얼마였지?");
  const log = await waitLog(1);
  out = { answer: r.answer, sources: r.sources, log: log.filter((l) => l.tool === "ask_brain") };
`;

describe("017 — 사서 합성 (AC-1·2·14)", () => {
  it("AC-1: librarian이 있으면 그 모델·지침으로 합성하고, 강제 규칙이 앞선다", () => {
    const { out, requests } = runProbe({
      personas: { "librarian.md": LIBRARIAN },
      env: { BRAIN_VERIFY: "off" },
      body: ASK_BODY,
    });
    const synth = requests.find((r) => r.model === "opus");
    assert.ok(synth, `사서 모델(opus)로 합성 요청이 나가야 한다: ${JSON.stringify(requests)}`);
    assert.ok(synth!.system.includes("사서-지침-마커"), "페르소나 지침 포함");
    assert.ok(
      synth!.system.indexOf("개인 노트만 근거로") < synth!.system.indexOf("사서-지침-마커"),
      "강제 규칙이 페르소나 지침보다 앞",
    );
    assert.equal(out.log[0].persona, "librarian");
    assert.equal(out.log[0].model, "opus");
  });

  it("AC-2: 페르소나가 없으면 기존 출력과 완전히 동일 — 개입·생략 표시가 전혀 없다", () => {
    const { out, requests } = runProbe({ body: ASK_BODY });
    assert.equal(requests.filter((r) => true).length >= 1, true);
    assert.equal(requests.at(-1)!.model, "sonnet", "기본 ANSWER_MODEL 유지");
    assert.equal(out.answer, "노트 기반 답변: 예산은 300만원 [notes/note.md]", "표시가 붙지 않은 원문 그대로");
    assert.ok(!out.answer.includes("검증"), "검증 관련 마커 없음");
    assert.equal(out.log[0].verify, undefined, "verify 필드 없음(미구성)");
    assert.equal(out.log[0].persona, undefined);
  });

  it("AC-14: BRAIN_LIBRARIAN=off면 librarian이 있어도 기존 경로로 동작한다", () => {
    const { out, requests } = runProbe({
      personas: { "librarian.md": LIBRARIAN },
      env: { BRAIN_LIBRARIAN: "off", BRAIN_VERIFY: "off" },
      body: ASK_BODY,
    });
    assert.equal(requests.at(-1)!.model, "sonnet");
    assert.equal(out.log[0].persona, undefined);
  });
});

describe("017 — 크리틱 검증 (AC-3~8·14·15)", () => {
  it("AC-3·6·15: 경고 판정 → 경고 블록 부착, codex 교차 모델 사용, 로그는 단일 레코드", () => {
    const { out, requests } = runProbe({
      personas: { "critic.md": CRITIC },
      behaviors: { "gpt-5.5": { type: "text", content: '{"ok": false, "issues": ["예산 300만원이 출처와 불일치"]}' } },
      body: ASK_BODY,
    });
    assert.match(out.answer, /⚠ 검증\(critic\/gpt-5\.5\)/);
    assert.match(out.answer, /예산 300만원이 출처와 불일치/);
    assert.match(out.answer, /추정/, "추정임을 명시");
    assert.match(out.answer, /BRAIN_VERIFY=off/, "끄는 법 안내");
    assert.ok(requests.some((r) => r.model === "gpt-5.5"), "검증은 codex 대상(교차)");
    assert.equal(out.log.length, 1, "ask_brain 로그는 단일 레코드(AC-15)");
    assert.equal(out.log[0].verify, "warn");
  });

  it("검증 요청에 답변·출처 청크가 실리고, reasoning_effort는 전송되지 않는다(AC-6/FR-4① 자연 강등)", () => {
    const { requests } = runProbe({
      personas: { "critic.md": CRITIC },
      behaviors: { "gpt-5.5": { type: "text", content: '{"ok": true}' } },
      body: ASK_BODY,
    });
    const verify = requests.find((r) => r.model === "gpt-5.5");
    assert.ok(verify, "검증 요청이 있어야 한다");
    assert.match(verify!.user, /답변:\n/, "검증 프롬프트에 답변 포함");
    assert.match(verify!.user, /출처 청크:/, "검증 프롬프트에 출처 청크 포함");
    assert.match(verify!.user, /예산은 300만원/, "실제 답변 내용 포함");
    assert.ok(!("reasoning_effort" in verify!.body), "effort 필드를 전송하지 않는다(미전송 위장 금지)");
    assert.ok(!JSON.stringify(verify!.body).includes("high"), "페르소나의 high가 새어나가지 않는다");
  });

  it("AC-15(합성 실패): 합성 HTTP 오류 시에도 검증 없이 단일 레코드가 남는다", () => {
    const { out, requests } = runProbe({
      personas: { "critic.md": CRITIC },
      behaviors: { sonnet: { type: "status", code: 502 } },
      body: ASK_BODY,
    });
    assert.match(out.answer, /종합 실패/);
    assert.equal(out.log.length, 1, "단일 레코드");
    assert.equal(out.log[0].verify, undefined, "답변이 없으므로 검증 시도 없음");
    assert.ok(!requests.some((r) => r.model === "gpt-5.5"), "검증 호출이 나가지 않는다");
  });

  it("AC-15(무히트): 검색 결과가 없으면 검증 없이 단일 레코드가 남는다", () => {
    const { out } = runProbe({
      personas: { "critic.md": CRITIC },
      noNote: true, // 스텁 임베딩은 모든 쿼리에 히트하므로 노트 자체를 없애 무히트 유도
      body: `
        const r = await m.askBrain("아무 데도 없는 주제");
        const log = await waitLog(1);
        out = { answer: r.answer, log: log.filter((l) => l.tool === "ask_brain") };
      `,
    });
    assert.match(out.answer, /관련 노트를 찾지 못했습니다/);
    assert.equal(out.log.length, 1);
    assert.equal(out.log[0].verify, undefined);
  });

  it("AC-4: 통과 판정은 무음 — 답변에 표시가 없고 로그에만 pass", () => {
    const { out } = runProbe({
      personas: { "critic.md": CRITIC },
      behaviors: { "gpt-5.5": { type: "text", content: '{"ok": true}' } },
      body: ASK_BODY,
    });
    assert.ok(!out.answer.includes("검증"), `통과는 무음이어야 한다: ${out.answer}`);
    assert.equal(out.log[0].verify, "pass");
  });

  it("AC-5: 검증 시간 초과 → 답변 정상 + 생략 표시 + skipped 기록", () => {
    const { out } = runProbe({
      personas: { "critic.md": CRITIC },
      behaviors: { "gpt-5.5": { type: "delay", ms: 2000, content: '{"ok": true}' } },
      env: { BRAIN_VERIFY_TIMEOUT_MS: "300" },
      body: ASK_BODY,
    });
    assert.match(out.answer, /노트 기반 답변/);
    assert.match(out.answer, /검증 생략\(시간 초과 또는 호출 실패\)/);
    assert.equal(out.log[0].verify, "skipped");
  });

  it("AC-7: 교차 모델이 없으면 동종 검증 대신 생략한다", () => {
    const { out, requests } = runProbe({
      personas: { "critic.md": CRITIC_CLAUDE_ONLY },
      body: ASK_BODY,
    });
    assert.match(out.answer, /검증 생략\(교차 모델 없음\)/);
    assert.equal(out.log[0].verify, "skipped");
    assert.equal(requests.filter((r) => r.model === "opus").length, 0, "동종(claude) 검증 호출이 없어야 한다");
  });

  it("AC-8: 일일 상한 도달 → 검증 없이 생략 표시", () => {
    const today = new Date().toISOString();
    const { out, requests } = runProbe({
      personas: { "critic.md": CRITIC },
      seedLog: [
        { ts: today, tool: "ask_brain", query: "이전 질의", hitCount: 1, success: true, verify: "pass" },
      ],
      env: { BRAIN_VERIFY_DAILY_LIMIT: "1" },
      body: `
        await m.reindex();
        const r = await m.askBrain("예산이 얼마였지?");
        const log = await waitLog(2);
        out = { answer: r.answer, log: log.filter((l) => l.tool === "ask_brain") };
      `,
    });
    assert.match(out.answer, /검증 생략\(일일 상한\)/);
    assert.ok(!requests.some((r) => r.model === "gpt-5.5"), "검증 호출이 나가지 않아야 한다");
    assert.equal(out.log.at(-1).verify, "skipped");
  });

  it("판정 해석 불가(비JSON 응답) → 생략 처리", () => {
    const { out } = runProbe({
      personas: { "critic.md": CRITIC },
      behaviors: { "gpt-5.5": { type: "text", content: "판정을 산문으로만 말합니다" } },
      body: ASK_BODY,
    });
    assert.match(out.answer, /검증 생략\(판정 해석 실패\)/);
    assert.equal(out.log[0].verify, "skipped");
  });

  it("AC-14: BRAIN_VERIFY=off면 critic이 있어도 verify 필드가 기록되지 않는다", () => {
    const { out, requests } = runProbe({
      personas: { "critic.md": CRITIC },
      env: { BRAIN_VERIFY: "off" },
      body: ASK_BODY,
    });
    assert.ok(!out.answer.includes("검증"));
    assert.equal(out.log[0].verify, undefined);
    assert.ok(!requests.some((r) => r.model === "gpt-5.5"));
  });
});

describe("017 — 큐레이터 태깅 (AC-9·10·11)", () => {
  const CAPTURE_BODY = `
    const r = await m.capture("오늘 회의에서 예산을 300만원으로 확정했다. 다음 분기 계획도 논의.", "회의 기록");
    const dir = process.env.NOTES_DIR.split("=")[1];
    const file = fsx.readFileSync(dir + "/" + r.path.split("/").slice(1).join("/"), "utf8");
    out = { result: r, file };
  `;

  it("AC-9: curator가 있으면 frontmatter에 태그가 기록되고 결과에 포함된다", () => {
    const { out } = runProbe({
      personas: { "curator.md": CURATOR },
      behaviors: { haiku: { type: "text", content: '["회의", "예산"]' } },
      body: CAPTURE_BODY,
    });
    assert.deepEqual(out.result.tags, ["회의", "예산"]);
    assert.match(out.file, /tags: \["회의", "예산"\]/);
  });

  it("AC-10: curator 부재 → 태그 없이 캡처 성공, 표시 없음", () => {
    const { out } = runProbe({ body: CAPTURE_BODY });
    assert.equal(out.result.tags, undefined);
    assert.match(out.file, /tags: \[\]/);
    assert.ok(["confirmed", "unconfirmed", "skipped"].includes(out.result.validationStatus));
  });

  it("AC-10(실패): 태깅 호출이 실패해도 캡처는 성공한다", () => {
    const { out } = runProbe({
      personas: { "curator.md": CURATOR },
      behaviors: { haiku: { type: "status", code: 500 } },
      body: CAPTURE_BODY,
    });
    assert.equal(out.result.tags, undefined);
    assert.ok(out.result.path.endsWith(".md"));
  });

  it("AC-14: BRAIN_CAPTURE_TAGS=off면 curator가 있어도 태깅하지 않는다", () => {
    const { out, requests } = runProbe({
      personas: { "curator.md": CURATOR },
      env: { BRAIN_CAPTURE_TAGS: "off" },
      body: CAPTURE_BODY,
    });
    assert.equal(out.result.tags, undefined);
    assert.ok(!requests.some((r) => r.model === "haiku"));
  });

  it("AC-11: 수동 수정한 태그는 재색인 후에도 보존된다", () => {
    const { out } = runProbe({
      personas: { "curator.md": CURATOR },
      behaviors: { haiku: { type: "text", content: '["회의"]' } },
      body: `
        const r = await m.capture("오늘 회의에서 예산을 300만원으로 확정했다.", "회의 기록");
        const dir = process.env.NOTES_DIR.split("=")[1];
        const fp = dir + "/" + r.path.split("/").slice(1).join("/");
        // 사용자가 태그를 수동 수정
        fsx.writeFileSync(fp, fsx.readFileSync(fp, "utf8").replace(/tags: \\[.*\\]/, 'tags: ["내가-고른-태그"]'));
        await m.reindex();
        out = { file: fsx.readFileSync(fp, "utf8") };
      `,
    });
    assert.match(out.file, /tags: \["내가-고른-태그"\]/);
    assert.ok(!out.file.includes('"회의"'));
  });
});

describe("017 — 분석가 리포트 (AC-12·13)", () => {
  async function runReport(seed: object[], opts: { analystStubText?: string } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-report-"));
    const notesDir = path.join(root, "notes");
    const agentsDir = path.join(root, "agents");
    fs.mkdirSync(notesDir, { recursive: true });
    fs.mkdirSync(agentsDir, { recursive: true });
    const logPath = path.join(root, "query-log.jsonl");
    fs.writeFileSync(logPath, seed.map((r) => JSON.stringify(r)).join("\n") + (seed.length ? "\n" : ""));

    let server: http.Server | null = null;
    let url = "http://127.0.0.1:9"; // 기본: 연결 불가(analyst 무응답 경로)
    try {
      if (opts.analystStubText) {
        fs.writeFileSync(
          path.join(agentsDir, "analyst.md"),
          `---\nname: analyst\ndescription: 분석가\ntargets:\n  claude:\n    model: sonnet\n---\n분석가 지침.\n`,
        );
        server = http.createServer((req, res) => {
          let raw = "";
          req.on("data", (c) => (raw += c));
          req.on("end", () => {
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ choices: [{ message: { content: opts.analystStubText } }] }));
          });
        });
        await new Promise<void>((r) => server!.listen(0, r));
        url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      }
      // execFileSync는 부모 이벤트 루프를 막아 부모의 스텁 서버가 응답할 수 없다(교착)
      // — 반드시 비동기로 실행한다.
      const { stdout } = await execFileAsync("npx", ["tsx", "scripts/brain-report.ts"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          NOTES_DIR: `notes=${notesDir}`,
          QUERY_LOG: logPath,
          LOCALMIND_AGENTS_DIR: agentsDir,
          LOCALMIND_URL: url,
          BRAIN_REPORT_TIMEOUT_MS: "5000",
        },
      });
      const reports = fs.readdirSync(path.join(notesDir, "reports"));
      const content = fs.readFileSync(path.join(notesDir, "reports", reports[0]), "utf8");
      return { stdout, reports, content };
    } finally {
      server?.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  const askRec = (i: number) => ({
    ts: new Date().toISOString(),
    tool: "ask_brain",
    query: `질의 ${i}`,
    hitCount: 1,
    success: true,
    verify: i % 2 ? "pass" : "warn",
  });

  it("AC-12: 로그가 충분하면 집계+해석이 담긴 리포트 노트가 생성된다", async () => {
    const { reports, content } = await runReport(
      Array.from({ length: 12 }, (_, i) => askRec(i)),
      { analystStubText: "- 경고율이 절반 — 출처 표기를 강화하세요." },
    );
    assert.match(reports[0], /^query-report-\d{4}-W\d{2}\.md$/);
    assert.match(content, /검색·질문: 12건/);
    assert.match(content, /경고율이 절반/);
  });

  it("AC-13: 표본 부족 → '데이터 부족' 리포트가 생성되고 실패하지 않는다", async () => {
    const { content, stdout } = await runReport([askRec(1)]);
    assert.match(content, /데이터 부족/);
    assert.match(content, /집계만 담았습니다/);
    assert.match(stdout, /리포트 저장/);
  });
});
