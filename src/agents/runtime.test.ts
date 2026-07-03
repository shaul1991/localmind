/**
 * agents/runtime.ts 단위 테스트 — 페르소나 해석·대상 선택·판정 파싱·게이트웨이 호출
 * (specs/017 FR-1·3·4의 단위 레벨). personaChat은 인프로세스 스텁 HTTP 서버로 검증한다
 * (runtime은 env를 호출 시점에 읽으므로 자식 프로세스가 필요 없다).
 */
import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Persona } from "./registry.js";
import { parseVerdict, personaChat, pickCrossTarget, pickTarget, resolvePersona } from "./runtime.js";

function persona(targets: Persona["targets"], prompt = "페르소나 지침"): Persona {
  return { name: "p", description: "d", targets, prompt, file: "p.md" };
}

describe("pickTarget / pickCrossTarget", () => {
  const both = persona({ claude: { model: "opus" }, codex: { model: "gpt-5.5" } });

  it("prefer 백엔드를 우선하고, 없으면 나머지 대상으로 폴백한다", () => {
    assert.equal(pickTarget(both, "codex")?.model, "gpt-5.5");
    assert.equal(pickTarget(both, "claude")?.model, "opus");
    assert.equal(pickTarget(persona({ codex: { model: "gpt-5.5" } }), "claude")?.model, "gpt-5.5");
  });

  it("교차 대상: avoid와 다른 백엔드만 — 없으면 null(동종 위장 금지, AC-7 단위)", () => {
    assert.equal(pickCrossTarget(both, "claude")?.model, "gpt-5.5");
    assert.equal(pickCrossTarget(both, "codex")?.model, "opus");
    assert.equal(pickCrossTarget(persona({ claude: { model: "sonnet" } }), "claude"), null);
    assert.equal(pickCrossTarget(both, null), null, "합성 백엔드 미상이면 교차 보장 불가 → null");
  });

  it("라벨이 아니라 모델명의 실제 라우팅 기준으로 백엔드를 판정한다", () => {
    // 사용자가 targets.claude에 gpt 모델을 적은 경우 — 게이트웨이는 codex로 라우팅한다
    const odd = persona({ claude: { model: "gpt-5.4" } });
    assert.equal(pickCrossTarget(odd, "codex"), null, "gpt-*는 codex 라우팅 — claude 라벨이어도 교차 아님");
  });
});

describe("parseVerdict", () => {
  it("순수 JSON·코드펜스·전후 텍스트를 모두 허용한다", () => {
    assert.deepEqual(parseVerdict('{"ok": true}'), { ok: true, issues: [] });
    assert.deepEqual(parseVerdict('판정: ```json\n{"ok": false, "issues": ["수치 불일치"]}\n``` 이상.'), {
      ok: false,
      issues: ["수치 불일치"],
    });
  });

  it("중첩 괄호가 있는 issues도 파싱한다(greedy 우선)", () => {
    const v = parseVerdict('{"ok": false, "issues": ["객체 {a:1} 언급이 출처에 없음"]}');
    assert.equal(v?.issues[0], "객체 {a:1} 언급이 출처에 없음");
  });

  it("해석 불가·형식 위반은 null(검증 생략 처리, FR-4 단위)", () => {
    assert.equal(parseVerdict("그냥 산문 답변"), null);
    assert.equal(parseVerdict('{"issues": []}'), null); // ok 없음
    assert.equal(parseVerdict('{"ok": "yes"}'), null); // boolean 아님
  });
});

describe("resolvePersona (핫리로드·무음 폴백)", () => {
  let dir: string;
  const saved = process.env.LOCALMIND_AGENTS_DIR;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-runtime-registry-"));
    process.env.LOCALMIND_AGENTS_DIR = dir;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.LOCALMIND_AGENTS_DIR;
    else process.env.LOCALMIND_AGENTS_DIR = saved;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("부재·레지스트리 없음은 null (AC-2 단위)", () => {
    assert.equal(resolvePersona("librarian"), null);
  });

  it("정의 변경이 재시작 없이 다음 호출에 반영된다 (FR-1)", () => {
    const def = (model: string) =>
      `---\nname: librarian\ndescription: 사서\ntargets:\n  claude:\n    model: ${model}\n---\n지침.\n`;
    fs.writeFileSync(path.join(dir, "librarian.md"), def("sonnet"));
    assert.equal(resolvePersona("librarian")?.targets.claude?.model, "sonnet");
    fs.writeFileSync(path.join(dir, "librarian.md"), def("opus"));
    assert.equal(resolvePersona("librarian")?.targets.claude?.model, "opus");
  });
});

describe("personaChat (스텁 게이트웨이)", () => {
  let server: http.Server;
  let requests: { model: string; system: string }[];
  let behavior: { delayMs?: number; status?: number; content?: string };
  const savedUrl = process.env.LOCALMIND_URL;

  before(async () => {
    requests = [];
    behavior = {};
    server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const body = JSON.parse(raw);
        requests.push({ model: body.model, system: body.messages[0].content });
        const send = () => {
          res.statusCode = behavior.status ?? 200;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ choices: [{ message: { content: behavior.content ?? "응답" } }] }));
        };
        if (behavior.delayMs) setTimeout(send, behavior.delayMs);
        else send();
      });
    });
    await new Promise<void>((r) => server.listen(0, r));
    process.env.LOCALMIND_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(async () => {
    if (savedUrl === undefined) delete process.env.LOCALMIND_URL;
    else process.env.LOCALMIND_URL = savedUrl;
    await new Promise((r) => server.close(r));
  });

  const p = persona({ claude: { model: "sonnet" }, codex: { model: "gpt-5.5" } }, "지침 본문");

  it("systemPrefix(강제 규칙)가 페르소나 본문 앞에 위치한다 (AC-1 단위)", async () => {
    behavior = { content: "ok" };
    const res = await personaChat(p, { user: "질문", systemPrefix: "강제 규칙", prefer: "claude", timeoutMs: 5000 });
    assert.equal(res?.text, "ok");
    assert.equal(res?.backend, "claude");
    const sys = requests.at(-1)!.system;
    assert.ok(sys.indexOf("강제 규칙") === 0, "강제 규칙이 맨 앞이어야 한다");
    assert.ok(sys.indexOf("강제 규칙") < sys.indexOf("지침 본문"));
  });

  it("target 직접 지정이 prefer보다 우선한다 (교차 검증 경로)", async () => {
    behavior = { content: "ok" };
    await personaChat(p, { user: "q", target: { backend: "codex", model: "gpt-5.5" }, timeoutMs: 5000 });
    assert.equal(requests.at(-1)!.model, "gpt-5.5");
  });

  it("시간 초과·HTTP 오류·빈 응답은 null (AC-5 단위)", async () => {
    behavior = { delayMs: 800, content: "늦은 응답" };
    assert.equal(await personaChat(p, { user: "q", timeoutMs: 100 }), null);
    behavior = { status: 500 };
    assert.equal(await personaChat(p, { user: "q", timeoutMs: 5000 }), null);
    behavior = { content: "" };
    assert.equal(await personaChat(p, { user: "q", timeoutMs: 5000 }), null);
  });
});
