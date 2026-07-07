/**
 * specs/040 — 부트스트랩 가이드 서버 테스트. 실행: node --test scripts/bootstrap-guide.test.mjs
 * AC: AC-2/5(classifyExit) · AC-3(classifyNode) · AC-7(GET only·실행 엔드포인트 없음) ·
 *     AC-9(checks 스키마) · AC-1 proxy(무의존 import).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { classifyExit, classifyNode, handle, runChecks } from "./bootstrap-guide.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));

describe("classifyExit — spawn 결과 판정 (AC-2·5)", () => {
  it("status 0 → ok", () => assert.equal(classifyExit({ status: 0 }), "ok"));
  it("status 1 → missing (데몬 미실행 등)", () => assert.equal(classifyExit({ status: 1 }), "missing"));
  it("ENOENT → missing (명령 없음)", () => assert.equal(classifyExit({ error: { code: "ENOENT" } }), "missing"));
  it("타임아웃 error → unknown", () => assert.equal(classifyExit({ error: { code: "ETIMEDOUT" } }), "unknown"));
  it("signal(SIGTERM) → unknown", () => assert.equal(classifyExit({ signal: "SIGTERM", status: null }), "unknown"));
  it("null → unknown", () => assert.equal(classifyExit(null), "unknown"));
});

describe("classifyNode — 버전 판정 (AC-3)", () => {
  it("v20 → ok", () => assert.equal(classifyNode("v20.11.0"), "ok"));
  it("v22 → ok", () => assert.equal(classifyNode("v22.0.0"), "ok"));
  it("v18 → missing", () => assert.equal(classifyNode("v18.19.0"), "missing"));
  it("빈/이상 → unknown", () => assert.equal(classifyNode(""), "unknown"));
});

describe("handle — 라우팅: GET만, 실행 엔드포인트 없음 (AC-7)", () => {
  it("POST → 405 (쓰기/비GET 거부)", async () => {
    const r = await handle("POST", "/");
    assert.equal(r.status, 405);
  });
  it("PUT/DELETE도 405", async () => {
    assert.equal((await handle("PUT", "/api/checks")).status, 405);
    assert.equal((await handle("DELETE", "/")).status, 405);
  });
  it("GET / → 200 HTML(가이드)", async () => {
    const r = await handle("GET", "/");
    assert.equal(r.status, 200);
    assert.match(r.contentType, /text\/html/);
    assert.match(r.body, /설치 가이드/);
    assert.match(r.body, /터미널 열기/); // 초심자 안내(AC-11)
  });
  it("GET /api/checks → 200 JSON(7개 키·enum)", async () => {
    const r = await handle("GET", "/api/checks");
    assert.equal(r.status, 200);
    const d = JSON.parse(r.body);
    for (const k of ["dockerInstalled", "dockerRunning", "node", "make", "git", "env", "ollama"]) {
      assert.ok(["ok", "missing", "unknown"].includes(d[k]), `${k}=${d[k]} 이상`);
    }
  });
  it("GET /style.css → 200 CSS(토큰 재사용)", async () => {
    const r = await handle("GET", "/style.css");
    assert.equal(r.status, 200);
    assert.match(r.contentType, /text\/css/);
    assert.match(r.body, /\.badge/);
  });
  it("알 수 없는 경로 → 404", async () => {
    assert.equal((await handle("GET", "/install")).status, 404);
  });
});

describe("runChecks — 스키마 (AC-9)", () => {
  it("7개 키가 모두 enum 값", async () => {
    const c = await runChecks();
    for (const k of ["dockerInstalled", "dockerRunning", "node", "make", "git", "env", "ollama"]) {
      assert.ok(["ok", "missing", "unknown"].includes(c[k]), `${k}=${c[k]}`);
    }
    assert.equal(c.node, "ok"); // 이 테스트를 돌리는 Node는 ≥20
  });
});

describe("AC-1 — 심링크 경로에서도 서브프로세스로 실제 기동(중대-1 회귀)", () => {
  it("심링크 경로로 node 실행 시 서버 기동 + /api/checks 200 + env=missing(.env 없음)", async () => {
    // 격리 트리(node_modules·.env 없음)를 만들고, 그 위에 심링크를 걸어 심링크 경로로 실행한다.
    const real = fs.mkdtempSync(path.join(os.tmpdir(), "lm-guide-real-"));
    const link = `${real}-link`;
    fs.symlinkSync(real, link);
    fs.mkdirSync(path.join(link, "scripts"), { recursive: true });
    fs.mkdirSync(path.join(link, "public", "ui"), { recursive: true });
    const repo = path.resolve(HERE, "..");
    fs.copyFileSync(path.join(repo, "scripts", "bootstrap-guide.mjs"), path.join(link, "scripts", "bootstrap-guide.mjs"));
    fs.copyFileSync(path.join(repo, "public", "ui", "style.css"), path.join(link, "public", "ui", "style.css"));

    const port = 8700 + (process.pid % 90);
    const child = spawn(process.execPath, [path.join(link, "scripts", "bootstrap-guide.mjs")], {
      env: { ...process.env, GUIDE_PORT: String(port), LOCALMIND_NO_OPEN: "1" },
      stdio: ["ignore", "pipe", "ignore"],
    });
    try {
      // 기동 메시지(URL 라인)를 기다린다 — 미기동 종료(중대-1)면 exit로 실패한다.
      const listenPort = await new Promise((resolve, reject) => {
        let buf = "";
        const t = setTimeout(() => reject(new Error("기동 타임아웃\n" + buf)), 8000);
        child.stdout.on("data", (d) => {
          buf += d;
          const m = /127\.0\.0\.1:(\d+)/.exec(buf);
          if (m) {
            clearTimeout(t);
            resolve(Number(m[1]));
          }
        });
        child.on("exit", (code) => {
          clearTimeout(t);
          reject(new Error(`서버가 미기동 종료(code=${code}) — 심링크 경로 isMain 회귀\n` + buf));
        });
      });
      const res = await new Promise((resolve, reject) => {
        const req = http.get({ host: "127.0.0.1", port: listenPort, path: "/api/checks", timeout: 3000 }, (r) => {
          let b = "";
          r.on("data", (c) => (b += c));
          r.on("end", () => resolve({ status: r.statusCode, body: b }));
        });
        req.on("error", reject);
        req.on("timeout", () => (req.destroy(), reject(new Error("checks timeout"))));
      });
      assert.equal(res.status, 200);
      assert.equal(JSON.parse(res.body).env, "missing"); // 격리 폴더엔 .env 없음(AC-4 missing 분기)
    } finally {
      child.kill();
      fs.rmSync(link, { force: true });
      fs.rmSync(real, { recursive: true, force: true });
    }
  });
});

describe("무의존 불변 — node: 빌트인만 import (AC-1 proxy)", () => {
  it("bootstrap-guide.mjs의 모든 import가 node: 스킴", () => {
    const src = fs.readFileSync(path.join(HERE, "bootstrap-guide.mjs"), "utf8");
    const imports = [...src.matchAll(/^\s*import\s+.*?\s+from\s+["']([^"']+)["']/gm)].map((m) => m[1]);
    assert.ok(imports.length > 0, "import가 감지돼야 함");
    for (const spec of imports) {
      assert.ok(spec.startsWith("node:"), `외부/상대 import 발견: ${spec} (무의존 위반)`);
    }
  });
});
