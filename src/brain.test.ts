/**
 * brain.ts 단위 테스트 — node:test 기반
 *
 * 임베딩 서버 불필요: extractSearchQuery·extractLinks·buildNoteFrontmatter(순수 함수),
 *   인덱스 캐시·원자성·single-flight(009, 빈 vault)
 * 임베딩 서버 필요(LOCALMIND_INTEGRATION=1로만 실행): capture()
 *
 * NOTES_DIR/BRAIN_INDEX는 brain.ts 모듈 로드 시점에 한 번만 읽히므로, 이미 로드된 프로세스
 * 안에서 process.env를 나중에 바꿔도 반영되지 않는다 — 통합 테스트는 반드시 자식 프로세스를
 * 새로 띄워(runNoteLinksProbe/runCaptureProbe) 격리해야 실제 ~/.localmind를 건드리지 않는다.
 *
 * 실행: npm test
 * 통합 테스트(서버 필요): LOCALMIND_INTEGRATION=1 npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, execFile } from "node:child_process";
import { promisify } from "node:util";
import http from "node:http";
import crypto from "node:crypto";
import {
  extractSearchQuery,
  removeFromIndex,
  extractLinks,
  chunkText,
  createNoteFile,
  listMarkdown,
  buildNoteFrontmatter,
  normalizeLockStaleMs,
  type BrainIndex,
} from "./brain.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BRAIN_JS = path.join(REPO_ROOT, "src", "brain.js");
const INTEGRATION = process.env.LOCALMIND_INTEGRATION === "1";

// ── extractSearchQuery 단위 테스트 ─────────────────────────────────────────

describe("extractSearchQuery", () => {
  it("일반 텍스트에서 첫 50자를 반환한다", () => {
    const q = extractSearchQuery("오늘 미팅에서 결정한 사항은 다음과 같다. 1) 배포 일정 변경");
    assert.ok(q !== null);
    assert.ok(q!.length <= 50);
    assert.ok(q!.includes("오늘 미팅"));
  });

  it("10자 미만 텍스트는 null을 반환한다 (AC-5)", () => {
    assert.equal(extractSearchQuery("짧음"), null);
    assert.equal(extractSearchQuery("Hello"), null);
    assert.equal(extractSearchQuery("9자미만임"), null);
  });

  it("frontmatter를 제외하고 본문에서 추출한다", () => {
    const text = [
      "---",
      "title: 테스트 노트",
      "date: 2026-06-30",
      "---",
      "",
      "실제 노트 본문 내용입니다 여기서부터 추출되어야 합니다",
    ].join("\n");
    const q = extractSearchQuery(text);
    assert.ok(q !== null);
    assert.ok(!q!.includes("title:"), "frontmatter 필드가 포함되면 안 됨");
    assert.ok(q!.includes("실제 노트"), "본문이 포함돼야 함");
  });

  it("마크다운 헤딩 기호(#)를 제거한다", () => {
    const text = "# 프로젝트 회고 — 2분기\n\n상세 내용 이하 생략";
    const q = extractSearchQuery(text);
    assert.ok(q !== null);
    assert.ok(!q!.startsWith("#"), "헤딩 기호가 제거돼야 함");
    assert.ok(q!.includes("프로젝트 회고"));
  });

  it("빈 문자열은 null을 반환한다", () => {
    assert.equal(extractSearchQuery(""), null);
    assert.equal(extractSearchQuery("   \n  "), null);
  });

  it("50자 초과 텍스트는 50자로 잘린다", () => {
    const long = "가".repeat(100);
    const q = extractSearchQuery(long);
    assert.ok(q !== null);
    assert.equal(q!.length, 50);
  });
});

// ── buildNoteFrontmatter 단위 테스트 (retro-analysis.test.ts에서 이관 —
//    great-reduction self-review r1 B1: 검증 대상은 Keep인데 테스트가 Extract 파일에
//    얹혀 소멸했던 것을 복원. specs/032 AC-3b 원문 그대로) ─────────────────
describe("buildNoteFrontmatter", () => {
  it("032 AC-3b: capture frontmatter 빌더 — tags 지정·미지정·특수문자 이스케이프", () => {
    const withTags = buildNoteFrontmatter("결정", "2026-07-05T01:00:00", ["decision"]);
    assert.ok(withTags.includes('tags: ["decision"]'));
    const noTags = buildNoteFrontmatter("일반", "2026-07-05T01:00:00");
    assert.ok(noTags.includes("tags: []"), "미지정은 기존과 동일(하위호환)");
    const special = buildNoteFrontmatter("x", "2026-07-05T01:00:00", ['we"ird]', "ok"]);
    assert.ok(special.includes('"we\\"ird]"'), "JSON 이스케이프로 frontmatter 안 깨짐(R5)");
  });
});

// ── 무키 임베딩 에러 메시지 (great-reduction r1 B4 — 게이트웨이 제거 후 안내가
//    EMBEDDINGS_KEY 기준이어야 한다. capture는 Phase 1 C의 durable success이므로,
//    정본 파일 생성 전인 search 경계에서 검증한다. fetch 전에 throw해 서버는 불필요.) ──
describe("임베딩 키 미설정 에러 안내", () => {
  it("B4: 검색에서 키가 없으면 EMBEDDINGS_KEY 기준의 평이한 안내로 실패한다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-nokey-"));
    try {
      const script = [
        `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
        `  await m.searchNotes("무키 테스트");`,
        `  process.exit(0);`,
        `}).catch((e) => { process.stderr.write(String(e.message)); process.exit(1); });`,
      ].join("\n");
      let stderr = "";
      try {
        execFileSync("node", ["--import", "tsx/esm", "-e", script], {
          cwd: REPO_ROOT,
          encoding: "utf8",
          env: {
            ...process.env,
            NOTES_DIR: `notes=${dir}`,
            BRAIN_INDEX: path.join(dir, ".brain-index.json"),
            EMBEDDINGS_KEY: "",
            LITELLM_MASTER_KEY: "",
          },
        });
        assert.fail("키 없이 search가 성공하면 안 된다");
      } catch (e: any) {
        stderr = String(e.stderr ?? "");
      }
      assert.ok(stderr.includes("임베딩 키(EMBEDDINGS_KEY)"), `안내가 EMBEDDINGS_KEY 기준: ${stderr}`);
      assert.ok(!stderr.includes("게이트웨이"), "제거된 게이트웨이를 지칭하지 않는다");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("embedding URL userinfo는 fetch 실패 예외·stderr에 노출하지 않는다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-embedding-userinfo-"));
    const secret = `embedding-secret-${process.pid}`;
    const user = "fixture-user";
    const script = [
      `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
      `  await m.searchNotes("credential leak probe");`,
      `  process.exit(0);`,
      `}).catch((e) => { process.stderr.write(String(e?.message ?? e)); process.exit(1); });`,
    ].join("\n");
    let stderr = "";
    try {
      try {
        execFileSync("node", ["--import", "tsx/esm", "-e", script], {
          cwd: REPO_ROOT,
          encoding: "utf8",
          env: {
            ...process.env,
            HOME: dir,
            NOTES_DIR: `notes=${dir}`,
            BRAIN_INDEX: path.join(dir, ".brain-index.json"),
            QUERY_LOG: "/dev/null",
            EMBEDDINGS_URL: `http://${user}:${secret}@127.0.0.1:9/v1`,
            EMBEDDINGS_KEY: "fixture-key",
            LITELLM_MASTER_KEY: "",
            EMBED_RETRIES: "1",
          },
        });
        assert.fail("credential URL fetch가 성공하면 안 된다");
      } catch (error: any) {
        stderr = String(error.stderr ?? "");
      }
      assert.match(stderr, /임베딩.*(?:실패|확인|안전)/);
      assert.doesNotMatch(stderr, new RegExp(secret));
      assert.doesNotMatch(stderr, new RegExp(user));
      assert.doesNotMatch(stderr, /127\.0\.0\.1:9/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("C0/DEL embedding URL은 direct env에서도 fetch 전에 거부하고 원문을 노출하지 않는다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-embedding-control-"));
    const marker = `SYNTHETIC_CONTROL_CANARY_${process.pid}`;
    fs.writeFileSync(path.join(dir, "note.md"), "control ingress canonical note");
    const script = [
      `let fetchCalls = 0;`,
      `globalThis.fetch = async (_url, init) => {`,
      `  fetchCalls += 1;`,
      `  const input = JSON.parse(String(init?.body ?? "{}")).input ?? [];`,
      `  return { ok: true, json: async () => ({ data: input.map((_, index) => ({ index, embedding: [1, 0, 0, 0] })) }) };`,
      `};`,
      `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
      `  let rejected = false; let error = "";`,
      `  try { await m.searchNotes("control ingress probe"); }`,
      `  catch (e) { rejected = true; error = String(e?.message ?? e); }`,
      `  process.stdout.write(JSON.stringify({ fetchCalls, rejected, error }));`,
      `}).catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: dir,
          NOTES_DIR: `notes=${dir}`,
          BRAIN_INDEX: path.join(dir, ".brain-index.json"),
          QUERY_LOG: "/dev/null",
          EMBEDDINGS_URL: `http://127.0.0.1:9/v1\t${marker}`,
          EMBEDDINGS_KEY: "fixture-key",
          LITELLM_MASTER_KEY: "",
          EMBED_RETRIES: "1",
        },
      });
      const result = JSON.parse(out);
      assert.equal(result.fetchCalls, 0, "control byte endpoint는 fetch에 도달하면 안 됨");
      assert.equal(result.rejected, true);
      assert.match(result.error, /임베딩.*설정|임베딩.*URL/);
      assert.doesNotMatch(result.error, new RegExp(marker));
      assert.doesNotMatch(result.error, /127\.0\.0\.1:9/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── extractLinks 단위 테스트 ───────────────────────────────────────────────

describe("extractLinks", () => {
  it("[[target]] 형식의 위키링크를 추출한다", () => {
    assert.deepEqual(extractLinks("본문에 [[노트B]]가 있다"), ["노트B"]);
  });

  it("AC-3: [[target|alias]] 형식에서 target만 추출하고 alias는 버린다", () => {
    assert.deepEqual(extractLinks("[[노트B|표시 텍스트]]"), ["노트B"]);
  });

  it("여러 링크를 순서대로 모두 추출한다", () => {
    assert.deepEqual(extractLinks("[[A]] 그리고 [[B|별칭]] 그리고 [[C]]"), ["A", "B", "C"]);
  });

  it("링크가 없으면 빈 배열을 반환한다", () => {
    assert.deepEqual(extractLinks("위키링크가 전혀 없는 평범한 텍스트"), []);
  });

  it("경로 형태의 타겟(폴더/하위폴더/노트명)도 그대로 추출한다", () => {
    assert.deepEqual(extractLinks("[[personal/project/README]]"), ["personal/project/README"]);
  });
});

// ── removeFromIndex 단위 테스트 ────────────────────────────────────────────

describe("removeFromIndex", () => {
  it("존재하지 않는 키를 제거해도 오류가 없다 (AC-3 안전성)", () => {
    assert.doesNotThrow(() => removeFromIndex("nonexistent/key.md"));
  });
});

// ── watchNotes 단위 테스트 ─────────────────────────────────────────────────

describe("watchNotes", () => {
  it("fresh child의 missing NOTES_DIR는 생성하지 않고 안전하게 닫힌다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-watch-missing-"));
    const missing = path.join(root, "does-not-exist");
    const indexPath = path.join(root, "state", "index.json");
    const script = [
      `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
      `  const watcher = m.watchNotes();`,
      `  const readyAwaitable = typeof watcher.ready?.then === "function";`,
      `  if (readyAwaitable) await watcher.ready;`,
      `  const closing = watcher.close();`,
      `  const closeAwaitable = typeof closing?.then === "function";`,
      `  if (closeAwaitable) await closing;`,
      `  process.stdout.write(JSON.stringify({ readyAwaitable, closeAwaitable }));`,
      `}).catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 5_000,
        env: { ...process.env, NOTES_DIR: `missing=${missing}`, BRAIN_INDEX: indexPath, QUERY_LOG: "/dev/null" },
      });
      assert.deepEqual(JSON.parse(out), { readyAwaitable: true, closeAwaitable: true });
      assert.equal(fs.existsSync(missing), false, "watcher가 missing canonical root를 만들면 안 됨");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("fresh child는 지정한 NOTES_DIR의 삭제 이벤트를 label key로 감시하고 close한다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-watch-event-"));
    const target = path.join(root, "observed.md");
    const indexPath = path.join(root, "state", "index.json");
    fs.writeFileSync(target, "# observed\n");
    const script = [
      `const logs = [];`,
      `const exact = "[localmind-watcher] removing: watched/observed.md";`,
      `const originalWrite = process.stderr.write.bind(process.stderr);`,
      `let guard; let onObserved = () => {};`,
      `const observed = new Promise((resolve, reject) => {`,
      `  guard = setTimeout(() => reject(new Error("watch callback timeout")), 3000);`,
      `  onObserved = () => { clearTimeout(guard); resolve(); };`,
      `});`,
      `process.stderr.write = (chunk) => { const text = String(chunk); logs.push(text); if (text.includes(exact)) onObserved(); return true; };`,
      `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
      `  const watcher = m.watchNotes();`,
      `  try {`,
      `    await watcher.ready;`,
      `    require("node:fs").unlinkSync(${JSON.stringify(target)});`,
      `    await observed;`,
      `  } finally {`,
      `    clearTimeout(guard);`,
      `    await watcher.close();`,
      `    process.stderr.write = originalWrite;`,
      `  }`,
      `  process.stdout.write(JSON.stringify({ logs }));`,
      `}).catch((e) => { clearTimeout(guard); process.stderr.write = originalWrite; originalWrite(String(e)); process.exit(1); });`,
    ].join("\n");
    try {
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 5000,
        env: {
          ...process.env,
          NOTES_DIR: `watched=${root}`,
          BRAIN_INDEX: indexPath,
          QUERY_LOG: "/dev/null",
          WATCH_DEBOUNCE_MS: "20",
        },
      });
      const parsed = JSON.parse(out);
      assert.match(parsed.logs.join(""), /\[localmind-watcher\] removing: watched\/observed\.md/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("close는 이미 시작된 watcher reindex callback이 끝날 때까지 resolve하지 않는다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-watch-active-"));
    const target = path.join(root, "observed.md");
    const indexPath = path.join(root, "state", "index.json");
    fs.writeFileSync(target, "# active callback\n");
    const script = [
      `const fs = require("node:fs");`,
      `const { EventEmitter } = require("node:events");`,
      `const events = [];`,
      `let watchCallback;`,
      `const fakeWatcher = new EventEmitter();`,
      `fakeWatcher.close = () => { events.push("fs-watcher-closed"); fakeWatcher.emit("close"); };`,
      `fs.watch = (_dir, _options, callback) => { watchCallback = callback; return fakeWatcher; };`,
      `let signalFetchStarted; let releaseFetch;`,
      `const fetchStarted = new Promise((resolve) => { signalFetchStarted = resolve; });`,
      `const fetchGate = new Promise((resolve) => { releaseFetch = resolve; });`,
      `globalThis.fetch = async (_url, init = {}) => {`,
      `  events.push("callback-started"); signalFetchStarted(); await fetchGate; events.push("callback-released");`,
      `  const input = JSON.parse(String(init.body || "{}")).input || [];`,
      `  return { ok: true, status: 200, json: async () => ({ data: input.map((_, index) => ({ index, embedding: [1, 0, 0, 0] })) }), text: async () => "" };`,
      `};`,
      `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
      `  const watcher = m.watchNotes();`,
      `  await watcher.ready;`,
      `  watchCallback("change", "observed.md");`,
      `  await fetchStarted;`,
      `  let closeResolved = false;`,
      `  const closing = watcher.close().then(() => { closeResolved = true; events.push("close-resolved"); });`,
      `  for (let i = 0; i < 6; i++) await Promise.resolve();`,
      `  const closeResolvedBeforeCallback = closeResolved;`,
      `  events.push("releasing-callback"); releaseFetch();`,
      `  await closing;`,
      `  process.stdout.write(JSON.stringify({ closeResolvedBeforeCallback, events }));`,
      `}).catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 5000,
        env: {
          ...process.env,
          NOTES_DIR: `watched=${root}`,
          BRAIN_INDEX: indexPath,
          QUERY_LOG: "/dev/null",
          WATCH_DEBOUNCE_MS: "0",
          EMBEDDINGS_URL: "http://fixture.invalid/v1",
          EMBEDDINGS_MODEL: "fixture-model",
          EMBEDDINGS_KEY: "fixture-dummy",
          EMBED_RETRIES: "1",
        },
      });
      const parsed = JSON.parse(out);
      assert.equal(parsed.closeResolvedBeforeCallback, false, JSON.stringify(parsed.events));
      assert.ok(parsed.events.indexOf("callback-released") < parsed.events.indexOf("close-resolved"), JSON.stringify(parsed.events));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ── capture() 검증 통합 테스트 (임베딩 서버 필요) ─────────────────────────
//
// 주의(회귀 발견): brain.ts는 NOTES_DIR/BRAIN_INDEX를 모듈 로드 시점에 한 번만 읽는다.
// 예전엔 이 테스트가 it("setup") 안에서 process.env.NOTES_DIR을 바꿨는데, 그 시점엔
// 이미 brain.js가 로드돼 있어 반영되지 않았다 — 즉 실제로는 격리되지 않고 진짜
// ~/.localmind에 테스트 노트를 만들고 있었다(005 작업 중 실행해 실제로 오염 발생·확인 후
// 정리함). noteLinks 테스트와 동일하게 자식 프로세스로 완전히 격리한다.

function runCaptureProbe(notesDir: string, text: string, title?: string): any {
  const script = [
    `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
    `  const result = await m.capture(${JSON.stringify(text)}, ${title ? JSON.stringify(title) : "undefined"});`,
    `  process.stdout.write(JSON.stringify(result));`,
    `}).catch((e) => { console.error(e); process.exit(1); });`,
  ].join("\n");
  const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      NOTES_DIR: `notes=${notesDir}`,
      BRAIN_INDEX: path.join(notesDir, ".brain-index.json"),
    },
  });
  return JSON.parse(out);
}

function runCaptureFolderBoundaryProbe(root: string, folder?: string): any {
  const first = path.join(root, "first");
  const second = path.join(root, "second");
  fs.mkdirSync(first, { recursive: true });
  fs.mkdirSync(second, { recursive: true });
  const script = [
    `import fs from "node:fs";`,
    `import path from "node:path";`,
    `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
    `  let result = null, error = null;`,
    `  try { result = await m.capture("폴더 경계를 검증하기에 충분히 긴 합성 노트 본문", "폴더경계", ${folder === undefined ? "undefined" : JSON.stringify(folder)}); }`,
    `  catch (e) { error = String(e?.message ?? e); }`,
    `  const markdown = (dir) => fs.readdirSync(dir).filter((name) => name.endsWith(".md"));`,
    `  process.stdout.write(JSON.stringify({ result, error, first: markdown(${JSON.stringify(first)}), second: markdown(${JSON.stringify(second)}) }));`,
    `}).catch((e) => { console.error(e); process.exit(1); });`,
  ].join("\n");
  const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: path.join(root, "home"),
      NOTES_DIR: `alpha=${first},beta=${second}`,
      BRAIN_INDEX: path.join(root, "state", "index.json"),
      QUERY_LOG: path.join(root, "state", "query-log.jsonl"),
      EMBEDDINGS_KEY: "",
      LITELLM_MASTER_KEY: "",
      EMBED_RETRIES: "1",
      CAPTURE_VALIDATE_TIMEOUT_MS: "20",
    },
  });
  return JSON.parse(out);
}

describe("capture folder 경계 (Phase 1 B)", () => {
  it("folder를 생략했을 때만 첫 폴더를 기본 대상으로 쓴다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-capture-default-folder-"));
    try {
      const r = runCaptureFolderBoundaryProbe(root);
      assert.equal(r.first.length, 1, "첫 폴더에만 Markdown 생성");
      assert.equal(r.second.length, 0, "두 번째 폴더는 불변");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("명시한 unknown label은 파일 생성 전에 available labels와 whoami 안내로 fail closed한다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-capture-unknown-folder-"));
    try {
      const privateLookingUnknown = "/Users/private/secret-notes";
      const r = runCaptureFolderBoundaryProbe(root, privateLookingUnknown);
      assert.equal(r.first.length + r.second.length, 0, "어느 노트 폴더에도 파일을 만들면 안 된다");
      assert.match(r.error ?? "", /사용 가능한.*라벨.*alpha.*beta/);
      assert.match(r.error ?? "", /whoami/);
      assert.doesNotMatch(r.error ?? "", /Users|private|secret-notes/, "요청값·절대경로를 공개 오류에 반사하지 않음");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

function runMalformedEmbeddingProbe(mode: string): any {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `localmind-embedding-boundary-${mode}-`));
  const notes = path.join(root, "notes");
  const state = path.join(root, "state");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(state, { recursive: true });
  fs.writeFileSync(path.join(notes, "one.md"), "첫 번째 합성 문서의 충분히 긴 본문입니다.");
  fs.writeFileSync(path.join(notes, "two.md"), "두 번째 합성 문서의 충분히 긴 본문입니다.");
  const script = [
    `globalThis.fetch = async (_url, init) => {`,
    `  const input = JSON.parse(String(init?.body ?? "{}")).input ?? [];`,
    `  let data = input.map((_, index) => ({ index, embedding: [1, 0] }));`,
    `  switch (${JSON.stringify(mode)}) {`,
    `    case "row-count": data = data.slice(0, 1); break;`,
    `    case "duplicate-index": data = [{ index: 0, embedding: [1, 0] }, { index: 0, embedding: [0, 1] }]; break;`,
    `    case "out-of-range-index": data = [{ index: 0, embedding: [1, 0] }, { index: 2, embedding: [0, 1] }]; break;`,
    `    case "empty-vector": data[1].embedding = []; break;`,
    `    case "non-finite": data[1].embedding = [Number.NaN, 1]; break;`,
    `    case "float32-overflow": data[1].embedding = [1e308, 1]; break;`,
    `    case "mixed-dimensions": data[1].embedding = [0, 1, 2]; break;`,
    `  }`,
    `  return { ok: true, status: 200, json: async () => ({ data }) };`,
    `};`,
    `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
    `  let ok = false, error = "", resultKeys = [];`,
    `  try { const result = await m.reindex(); ok = true; resultKeys = Object.keys(m.loadIndex().files); }`,
    `  catch (e) { error = String(e?.message ?? e); }`,
    `  let persistedKeys = [];`,
    `  try { persistedKeys = Object.keys(m.loadIndex().files); } catch {}`,
    `  const indexArtifacts = fs.readdirSync(${JSON.stringify(state)}).filter((name) => name.startsWith("index.json"));`,
    `  process.stdout.write(JSON.stringify({ ok, error, resultKeys, persistedKeys, indexExists: fs.existsSync(process.env.BRAIN_INDEX), indexArtifacts }));`,
    `}).catch((e) => { console.error(e); process.exit(1); });`,
  ].join("\n");
  try {
    const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: path.join(root, "home"),
        NOTES_DIR: `notes=${notes}`,
        BRAIN_INDEX: path.join(state, "index.json"),
        QUERY_LOG: path.join(state, "query-log.jsonl"),
        EMBEDDINGS_URL: "http://embedding.invalid/v1",
        EMBEDDINGS_MODEL: "fixture-model",
        EMBEDDINGS_KEY: "fixture-key",
        EMBED_RETRIES: "1",
        BRAIN_CONCURRENCY: "1",
        BRAIN_BATCH: "8",
      },
    });
    return JSON.parse(out);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function assertMalformedEmbeddingRejected(mode: string, message: RegExp): void {
  const r = runMalformedEmbeddingProbe(mode);
  assert.equal(r.ok, false, `${mode}: malformed 응답을 성공 처리하면 안 됨`);
  assert.match(r.error, message, `${mode}: 경계 실패 이유가 명확해야 함`);
  assert.deepEqual(r.persistedKeys, [], `${mode}: malformed vector로 색인 항목을 만들면 안 됨`);
  assert.equal(r.indexExists, false, `${mode}: malformed 첫 batch로 빈 색인 파일도 만들면 안 됨`);
  assert.deepEqual(r.indexArtifacts, [], `${mode}: JSON·sidecar·temp를 만들면 안 됨`);
  assert.doesNotMatch(r.error, /embedding\.invalid|fixture-key/, "endpoint·secret 비노출");
}

describe("embedding 응답 boundary (Phase 1 D)", () => {
  it("입력 수와 row 수가 다르면 실패한다", () => {
    assertMalformedEmbeddingRejected("row-count", /임베딩 응답.*행 수/);
  });

  it("index 중복을 거부한다", () => {
    assertMalformedEmbeddingRejected("duplicate-index", /임베딩 응답.*index.*중복/);
  });

  it("index 누락·범위 초과를 거부한다", () => {
    assertMalformedEmbeddingRejected("out-of-range-index", /임베딩 응답.*index.*범위|임베딩 응답.*index.*누락/);
  });

  it("빈 embedding을 거부한다", () => {
    assertMalformedEmbeddingRejected("empty-vector", /임베딩 응답.*embedding.*비어/);
  });

  it("finite number가 아닌 embedding 값을 거부한다", () => {
    assertMalformedEmbeddingRejected("non-finite", /임베딩 응답.*유한.*숫자/);
  });

  it("Float32로 표현하면 overflow하는 1e308 embedding payload를 거부한다", () => {
    assertMalformedEmbeddingRejected("float32-overflow", /임베딩 응답.*Float32|임베딩 응답.*표현/);
  });

  it("row 간 embedding 차원이 다르면 실패한다", () => {
    assertMalformedEmbeddingRejected("mixed-dimensions", /임베딩 응답.*차원/);
  });

  it("query 차원 불일치로 재색인한 뒤에도 다르면 결과를 반환하지 않는다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-query-dimension-recheck-"));
    const notes = path.join(root, "notes");
    const state = path.join(root, "state");
    fs.mkdirSync(notes, { recursive: true });
    fs.mkdirSync(state, { recursive: true });
    fs.writeFileSync(path.join(notes, "doc.md"), "재색인 뒤 query 차원을 다시 확인하는 합성 문서입니다.");
    const script = [
      `globalThis.fetch = async (_url, init) => {`,
      `  const input = JSON.parse(String(init?.body ?? "{}")).input ?? [];`,
      `  const query = input.length === 1 && input[0] === "차원 불일치 질의";`,
      `  const embedding = query ? [1, 0, 0] : [1, 0];`,
      `  return { ok: true, status: 200, json: async () => ({ data: input.map((_, index) => ({ index, embedding })) }) };`,
      `};`,
      `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
      `  await m.reindex();`,
      `  let rejected = false, error = "", hits = [];`,
      `  try { hits = await m.searchNotes("차원 불일치 질의"); }`,
      `  catch (e) { rejected = true; error = String(e?.message ?? e); }`,
      `  process.stdout.write(JSON.stringify({ rejected, error, hitCount: hits.length }));`,
      `}).catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: path.join(root, "home"),
          NOTES_DIR: `notes=${notes}`,
          BRAIN_INDEX: path.join(state, "index.json"),
          QUERY_LOG: path.join(state, "query-log.jsonl"),
          EMBEDDINGS_URL: "http://embedding.invalid/v1",
          EMBEDDINGS_MODEL: "fixture-model",
          EMBEDDINGS_KEY: "fixture-key",
          EMBED_RETRIES: "1",
          BRAIN_CONCURRENCY: "1",
        },
      });
      const r = JSON.parse(out);
      assert.equal(r.rejected, true, "계속 다른 차원의 query로 결과를 내면 안 됨");
      assert.equal(r.hitCount, 0);
      assert.match(r.error, /query.*차원|질의.*차원/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("Float32로 표현하면 overflow하는 1e308 query는 결과를 반환하거나 index를 바꾸지 않는다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-query-float32-overflow-"));
    const notes = path.join(root, "notes");
    const state = path.join(root, "state");
    const indexPath = path.join(state, "index.json");
    fs.mkdirSync(notes, { recursive: true });
    fs.mkdirSync(state, { recursive: true });
    fs.writeFileSync(path.join(notes, "doc.md"), "정상 색인을 먼저 만드는 충분히 긴 합성 문서입니다.");
    const script = [
      `globalThis.fetch = async (_url, init) => {`,
      `  const input = JSON.parse(String(init?.body ?? "{}")).input ?? [];`,
      `  const embedding = input.length === 1 && input[0] === "overflow query" ? [1e308, 0] : [1, 0];`,
      `  return { ok: true, status: 200, json: async () => ({ data: input.map((_, index) => ({ index, embedding })) }) };`,
      `};`,
      `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
      `  await m.reindex();`,
      `  const beforeJson = fs.readFileSync(process.env.BRAIN_INDEX);`,
      `  const beforeArtifacts = fs.readdirSync(${JSON.stringify(state)}).filter((name) => name.startsWith("index.json")).sort();`,
      `  let rejected = false, error = "", hits = [];`,
      `  try { hits = await m.searchNotes("overflow query"); }`,
      `  catch (e) { rejected = true; error = String(e?.message ?? e); }`,
      `  const afterJson = fs.readFileSync(process.env.BRAIN_INDEX);`,
      `  const afterArtifacts = fs.readdirSync(${JSON.stringify(state)}).filter((name) => name.startsWith("index.json")).sort();`,
      `  process.stdout.write(JSON.stringify({ rejected, error, hitCount: hits.length, jsonUnchanged: beforeJson.equals(afterJson), beforeArtifacts, afterArtifacts }));`,
      `}).catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: path.join(root, "home"),
          NOTES_DIR: `notes=${notes}`,
          BRAIN_INDEX: indexPath,
          QUERY_LOG: path.join(state, "query-log.jsonl"),
          EMBEDDINGS_URL: "http://embedding.invalid/v1",
          EMBEDDINGS_MODEL: "fixture-model",
          EMBEDDINGS_KEY: "fixture-key",
          EMBED_RETRIES: "1",
          BRAIN_CONCURRENCY: "1",
        },
      });
      const r = JSON.parse(out);
      assert.equal(r.rejected, true);
      assert.equal(r.hitCount, 0);
      assert.match(r.error, /임베딩 응답.*Float32|임베딩 응답.*표현/);
      assert.equal(r.jsonUnchanged, true, "query overflow가 durable JSON을 바꾸면 안 됨");
      assert.deepEqual(r.afterArtifacts, r.beforeArtifacts, "query overflow가 sidecar·temp를 더 만들면 안 됨");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

function runCrossBatchDimensionProbe(mode: "fresh" | "existing" | "concurrent"): any {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `localmind-cross-batch-dims-${mode}-`));
  const notes = path.join(root, "notes");
  const state = path.join(root, "state");
  const indexPath = path.join(state, "index.json");
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(state, { recursive: true });
  if (mode !== "existing") {
    fs.writeFileSync(path.join(notes, "a.md"), "첫 번째 batch의 차원을 고정하는 충분히 긴 합성 문서입니다.");
    fs.writeFileSync(path.join(notes, "b.md"), "두 번째 batch의 차원 불일치를 만드는 충분히 긴 합성 문서입니다.");
  }
  const script = [
    `const crypto = require("node:crypto");`,
    `let calls = 0;`,
    `globalThis.fetch = async (_url, init) => {`,
    `  const call = ++calls;`,
    mode === "concurrent" ? `  if (call === 1) await new Promise((resolve) => setTimeout(resolve, 30));` : "",
    `  const input = JSON.parse(String(init?.body ?? "{}")).input ?? [];`,
    mode === "existing"
      ? `  const embedding = [1, 0, 0];`
      : mode === "concurrent"
        ? `  const embedding = call === 1 ? [1, 0] : [1, 0, 0];`
        : `  const embedding = call === 1 ? [1, 0] : [1, 0, 0];`,
    `  return { ok: true, status: 200, json: async () => ({ data: input.map((_, index) => ({ index, embedding })) }) };`,
    `};`,
    `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
    `  let originalHash = null;`,
    mode === "existing"
      ? [
          `  const source = ${JSON.stringify(path.join(notes, "existing.md"))};`,
          `  const original = "기존 2차원 색인의 정본 revision입니다.";`,
          `  fs.writeFileSync(source, original);`,
          `  originalHash = crypto.createHash("sha256").update(original).digest("hex");`,
          `  m.saveIndex({ version: m.loadIndex().version, embeddingModel: "fixture-model", dims: 2, files: {`,
          `    "notes/existing.md": { hash: originalHash, folder: "notes", chunks: [{ path: "notes/existing.md", text: original, vector: [1, 0] }], linksOut: [] },`,
          `  } });`,
          `  fs.writeFileSync(source, "기존 색인과 다른 차원 응답을 요구하는 변경된 정본입니다.");`,
        ].join("\n")
      : "",
    `  let rejected = false, error = "";`,
    `  try { await m.reindex(); } catch (e) { rejected = true; error = String(e?.message ?? e); }`,
    `  m._resetIndexCacheForTest();`,
    `  const idx = m.loadIndex();`,
    `  const vectors = Object.values(idx.files).flatMap((fe) => fe.chunks.map((c) => c.vector));`,
    `  process.stdout.write(JSON.stringify({ rejected, error, dims: idx.dims ?? null, keys: Object.keys(idx.files).sort(), hashes: Object.values(idx.files).map((fe) => fe.hash), originalHash, vectors }));`,
    `}).catch((e) => { console.error(e); process.exit(1); });`,
  ].filter(Boolean).join("\n");
  try {
    const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: path.join(root, "home"),
        NOTES_DIR: `notes=${notes}`,
        BRAIN_INDEX: indexPath,
        QUERY_LOG: path.join(state, "query-log.jsonl"),
        EMBEDDINGS_URL: "http://embedding.invalid/v1",
        EMBEDDINGS_MODEL: "fixture-model",
        EMBEDDINGS_KEY: "fixture-key",
        EMBED_RETRIES: "1",
        BRAIN_BATCH: "1",
        BRAIN_CONCURRENCY: mode === "concurrent" ? "2" : "1",
      },
    });
    return JSON.parse(out);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function runSaveVectorInvariantProbe(vectorSource: string): any {
  return runBrainProbe([
    `let rejected = false, error = "";`,
    `try { m.saveIndex({ version: m.loadIndex().version, embeddingModel: "text-embedding-3-small", dims: 2, files: {`,
    `  "notes/bad.md": { hash: "bad", folder: "notes", chunks: [{ path: "notes/bad.md", text: "합성", vector: ${vectorSource} }], linksOut: [] },`,
    `} }); } catch (e) { rejected = true; error = String(e?.message ?? e); }`,
    `process.stdout.write(JSON.stringify({ rejected, error, indexExists: fs.existsSync(idxPath) }));`,
  ].join("\n"));
}

describe("색인 차원 불변식 (Phase 1 B2/I3)", () => {
  it("fresh 색인의 batch별 2/3차원 응답을 거부하고 혼합 저장하지 않는다", () => {
    const r = runCrossBatchDimensionProbe("fresh");
    assert.equal(r.rejected, true);
    assert.match(r.error, /임베딩.*차원/);
    assert.ok(r.vectors.every((v: number[]) => v.length === r.dims && v.every(Number.isFinite)));
  });

  it("기존 2차원 색인에 신규 3차원 batch를 반영하지 않는다", () => {
    const r = runCrossBatchDimensionProbe("existing");
    assert.equal(r.rejected, true);
    assert.match(r.error, /임베딩.*차원/);
    assert.deepEqual(r.hashes, [r.originalHash], "기존 durable revision을 보존해야 함");
    assert.deepEqual(r.vectors, [[1, 0]]);
  });

  it("BRAIN_BATCH=1/BRAIN_CONCURRENCY=2 경쟁에서도 2/3차원 혼합을 거부한다", () => {
    const r = runCrossBatchDimensionProbe("concurrent");
    assert.equal(r.rejected, true);
    assert.match(r.error, /임베딩.*차원/);
    assert.ok(r.vectors.every((v: number[]) => v.length === r.dims && v.every(Number.isFinite)));
  });

  it("saveIndex가 dims보다 짧은 vector의 truncation/padding 직렬화를 거부한다", () => {
    const r = runSaveVectorInvariantProbe("[1]");
    assert.deepEqual(r, { rejected: true, error: r.error, indexExists: false });
    assert.match(r.error, /색인.*차원/);
  });

  it("saveIndex가 NaN vector 직렬화를 거부한다", () => {
    const r = runSaveVectorInvariantProbe("[1, Number.NaN]");
    assert.deepEqual(r, { rejected: true, error: r.error, indexExists: false });
    assert.match(r.error, /색인.*유한.*숫자/);
  });

  it("saveIndex가 Float32로 표현하면 overflow하는 1e308 vector를 JSON·sidecar 없이 거부한다", () => {
    const r = runSaveVectorInvariantProbe("[1e308, 0]");
    assert.deepEqual(r, { rejected: true, error: r.error, indexExists: false });
    assert.match(r.error, /색인.*Float32|색인.*표현/);
  });
});

describe("capture() 검증 루프 (통합 — 임베딩 서버 필요)", { skip: !INTEGRATION }, () => {
  it("AC-1: 정상 캡처 시 validationStatus가 confirmed이다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-capture-ac1-"));
    try {
      const result = runCaptureProbe(dir, "오늘 미팅에서 결정한 사항: 배포 일정을 다음 주로 연기한다", "미팅 결정 사항");
      assert.equal(result.validationStatus, "confirmed", "인덱싱이 확인돼야 한다");
      assert.equal(result.retried, false);
      assert.ok(result.path.endsWith(".md"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("AC-5: 10자 미만 텍스트는 validationStatus가 skipped이다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-capture-ac5-"));
    try {
      const result = runCaptureProbe(dir, "짧음");
      assert.equal(result.validationStatus, "skipped");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── 009: 인덱스 원자성·캐싱·동시성 (임베딩 불필요 — 순수 인덱스 IO) ──────────
//
// loadIndex/saveIndex는 INDEX_PATH(모듈 로드 시 고정)에 묶여 있어, 실제 ~/.localmind
// 오염을 막으려면 자식 프로세스로 BRAIN_INDEX/NOTES_DIR을 격리해야 한다.

function runBrainProbe(scriptBody: string, envOverrides: NodeJS.ProcessEnv = {}): any {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-index-"));
  const idxPath = path.join(tmp, ".brain-index.json");
  const script = [
    `import * as fs from "node:fs";`,
    `const idxPath = process.env.BRAIN_INDEX;`,
    `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
    `const sealIndex = async (idx) => { delete idx.indexDigest; const web = globalThis["cr" + "ypto"]; idx.indexDigest = Buffer.from(await web.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(idx)))).toString("hex"); return idx; };`,
    `const sha256 = async (bytes) => { const web = globalThis["cr" + "ypto"]; const input = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes; return Buffer.from(await web.subtle.digest("SHA-256", input)).toString("hex"); };`,
    scriptBody,
    `}).catch((e) => { console.error(e); process.exit(1); });`,
  ].join("\n");
  try {
    const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        NOTES_DIR: `notes=${tmp}`,
        NOTES_ROOT: tmp,
        BRAIN_INDEX: idxPath,
        ...envOverrides,
      },
    });
    return JSON.parse(out);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const SEMANTIC_INVALID_V5_CASES = [
  { name: "fractional slot", mutate: `disk.files["notes/a.md"].chunks[0].slot = 0.5;` },
  { name: "negative slot", mutate: `disk.files["notes/a.md"].chunks[0].slot = -1;` },
  { name: "out-of-range slot", mutate: `disk.files["notes/a.md"].chunks[0].slot = 2;` },
  { name: "duplicate slot", mutate: `disk.files["notes/a.md"].chunks[1].slot = disk.files["notes/a.md"].chunks[0].slot;` },
  {
    name: "in-range gapped layout",
    mutate: `
      const sidecar = fs.readFileSync(sidecarPath);
      const expanded = Buffer.alloc(sidecar.length + disk.dims * 4);
      sidecar.copy(expanded);
      expanded.writeUInt32LE(3, 8);
      for (let j = 0; j < disk.dims; j++) expanded.writeFloatLE(j === 0 ? 0.5 : 0, sidecar.length + j * 4);
      fs.writeFileSync(sidecarPath, expanded);
      disk.vectorDigest = await sha256(expanded);
      disk.files["notes/a.md"].chunks[1].slot = 2;
    `,
  },
  { name: "JSON/header dims mismatch", mutate: `disk.dims = 3;` },
] as const;

describe("인덱스 캐시·원자성·동시성 (009)", () => {
  for (const semanticCase of SEMANTIC_INVALID_V5_CASES) {
    it(`digest-valid ${semanticCase.name} generation은 load에서 hydrate하지 않는다`, () => {
      const r = runBrainProbe(`
        const V = m.loadIndex().version;
        m.saveIndex({ version: V, embeddingModel: "text-embedding-3-small", dims: 2, files: {
          "notes/a.md": { hash: "h", folder: "notes", chunks: [
            { path: "notes/a.md", text: "a", vector: [1, 0] },
            { path: "notes/a.md", text: "b", vector: [0, 1] },
          ], linksOut: [] },
        } });
        const disk = JSON.parse(fs.readFileSync(idxPath, "utf8"));
        const pathMod = await import("node:path");
        const sidecarPath = pathMod.join(pathMod.dirname(idxPath), disk.vectorFile);
        ${semanticCase.mutate}
        const sealed = await sealIndex(disk);
        const corruptBytes = JSON.stringify(sealed);
        fs.writeFileSync(idxPath, corruptBytes);
        const payload = JSON.parse(corruptBytes);
        const expectedIndexDigest = payload.indexDigest;
        delete payload.indexDigest;
        const indexSealValid = await sha256(JSON.stringify(payload)) === expectedIndexDigest;
        const vectorSealValid = await sha256(fs.readFileSync(sidecarPath)) === sealed.vectorDigest;
        m._resetIndexCacheForTest();
        const loaded = m.loadIndex();
        process.stdout.write(JSON.stringify({ indexSealValid, vectorSealValid, hasFile: Object.hasOwn(loaded.files, "notes/a.md") }));
      `);
      assert.deepEqual(r, { indexSealValid: true, vectorSealValid: true, hasFile: false });
    });

    it(`digest-valid ${semanticCase.name} generation은 reload-merge에서 재봉인하지 않는다`, () => {
      const r = runBrainProbe(`
        const V = m.loadIndex().version;
        m.saveIndex({ version: V, embeddingModel: "text-embedding-3-small", dims: 2, files: {
          "notes/a.md": { hash: "h", folder: "notes", chunks: [
            { path: "notes/a.md", text: "a", vector: [1, 0] },
            { path: "notes/a.md", text: "b", vector: [0, 1] },
          ], linksOut: [] },
        } });
        const stale = m.loadIndex();
        const disk = JSON.parse(fs.readFileSync(idxPath, "utf8"));
        const pathMod = await import("node:path");
        const sidecarPath = pathMod.join(pathMod.dirname(idxPath), disk.vectorFile);
        ${semanticCase.mutate}
        const sealed = await sealIndex(disk);
        const corruptBytes = JSON.stringify(sealed);
        fs.writeFileSync(idxPath, corruptBytes);
        const corruptSidecar = fs.readFileSync(sidecarPath);
        const payload = JSON.parse(corruptBytes);
        const expectedIndexDigest = payload.indexDigest;
        delete payload.indexDigest;
        const indexSealValid = await sha256(JSON.stringify(payload)) === expectedIndexDigest;
        const vectorSealValid = await sha256(corruptSidecar) === sealed.vectorDigest;
        let rejected = false;
        try { m.saveIndex(stale); } catch { rejected = true; }
        process.stdout.write(JSON.stringify({
          indexSealValid,
          vectorSealValid,
          rejected,
          bytesUnchanged: fs.readFileSync(idxPath, "utf8") === corruptBytes,
          sidecarUnchanged: fs.readFileSync(sidecarPath).equals(corruptSidecar),
        }));
      `);
      assert.deepEqual(r, {
        indexSealValid: true,
        vectorSealValid: true,
        rejected: true,
        bytesUnchanged: true,
        sidecarUnchanged: true,
      });
    });
  }

  it("public saveIndex caller는 임의 object로 clean-rebuild capability를 위조할 수 없다", () => {
    const r = runBrainProbe(`
      const V = m.loadIndex().version;
      m.saveIndex({ version: V, embeddingModel: process.env.EMBEDDINGS_MODEL ?? "text-embedding-3-small", dims: 2, files: {
        "notes/a.md": { hash: "h", folder: "notes", chunks: [{ path: "notes/a.md", text: "a", vector: [1, 0] }], linksOut: [] },
      } });
      const disk = JSON.parse(fs.readFileSync(process.env.BRAIN_INDEX, "utf8"));
      disk.files["notes/a.md"].chunks[0].text = "forged";
      fs.writeFileSync(process.env.BRAIN_INDEX, JSON.stringify(disk));
      m._resetIndexCacheForTest();
      const recovered = m.loadIndex();
      const before = fs.readFileSync(process.env.BRAIN_INDEX, "utf8");
      let rejected = false;
      try { m.saveIndex(recovered, [], [], {}); } catch { rejected = true; }
      const after = fs.readFileSync(process.env.BRAIN_INDEX, "utf8");
      process.stdout.write(JSON.stringify({ rejected, unchanged: before === after }));
    `);
    assert.deepEqual(r, { rejected: true, unchanged: true });
  });

  it("digest-valid v5의 JSON dims가 없으면 sidecar header 차원을 명시적으로 보완한다", () => {
    const r = runBrainProbe(`
      const V = m.loadIndex().version;
      m.saveIndex({ version: V, embeddingModel: "text-embedding-3-small", dims: 3, files: {
        "notes/a.md": { hash: "h", folder: "notes", chunks: [
          { path: "notes/a.md", text: "a", vector: [1, 2, 3] },
        ], linksOut: [] },
      } });
      const disk = JSON.parse(fs.readFileSync(idxPath, "utf8"));
      delete disk.dims;
      fs.writeFileSync(idxPath, JSON.stringify(await sealIndex(disk)));
      m._resetIndexCacheForTest();
      const loaded = m.loadIndex();
      process.stdout.write(JSON.stringify({ dims: loaded.dims ?? null, vectorLength: loaded.files["notes/a.md"]?.chunks[0]?.vector?.length ?? null }));
    `);
    assert.deepEqual(r, { dims: 3, vectorLength: 3 });
  });

  it("사용자 지정 BRAIN_INDEX의 부모가 없어도 생성하고 유한 시간 안에 저장한다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-index-parent-"));
    const notesDir = path.join(tmp, "notes");
    const idxPath = path.join(tmp, "derived", "nested", ".brain-index.json");
    fs.mkdirSync(notesDir);
    const script = [
      `import * as fs from "node:fs";`,
      `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
      `  const stats = await m.reindex();`,
      `  process.stdout.write(JSON.stringify({ files: stats.files, saved: fs.existsSync(process.env.BRAIN_INDEX) }));`,
      `}).catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 2_000,
        env: {
          ...process.env,
          NOTES_DIR: `notes=${notesDir}`,
          BRAIN_INDEX: idxPath,
        },
      });
      assert.deepEqual(JSON.parse(out), { files: 0, saved: true });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("최초 nested index 저장은 새 ancestor 이름과 leaf commit을 모두 directory fsync한다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-index-ancestor-fsync-"));
    const notesDir = path.join(tmp, "notes");
    const stateDir = path.join(tmp, "state");
    const aDir = path.join(stateDir, "a");
    const bDir = path.join(aDir, "b");
    const idxPath = path.join(bDir, "index.json");
    fs.mkdirSync(notesDir);
    fs.mkdirSync(stateDir);
    const script = [
      `import fs from "node:fs";`,
      `import * as path from "node:path";`,
      `const opened = new Map();`,
      `const originalOpen = fs.openSync;`,
      `const originalFsync = fs.fsyncSync;`,
      `fs.openSync = function(p, ...args) { const fd = originalOpen.call(this, p, ...args); opened.set(fd, path.resolve(String(p))); return fd; };`,
      `const fsyncedDirectories = [];`,
      `fs.fsyncSync = function(fd) { if (fs.fstatSync(fd).isDirectory()) fsyncedDirectories.push(opened.get(fd)); return originalFsync.call(this, fd); };`,
      `import(${JSON.stringify(BRAIN_JS)}).then((m) => {`,
      `  m.saveIndex({ version: m.loadIndex().version, files: {} });`,
      `  fs.openSync = originalOpen; fs.fsyncSync = originalFsync;`,
      `  process.stdout.write(JSON.stringify({ fsyncedDirectories, saved: fs.existsSync(process.env.BRAIN_INDEX) }));`,
      `}).catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const result = JSON.parse(execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        env: { ...process.env, NOTES_DIR: `notes=${notesDir}`, BRAIN_INDEX: idxPath, QUERY_LOG: "/dev/null" },
      }));
      assert.equal(result.saved, true);
      const fsynced = new Set(result.fsyncedDirectories);
      for (const expected of [stateDir, aDir, bDir]) {
        assert.equal(fsynced.has(expected), true, `directory durability 경계 누락: ${path.basename(expected)}`);
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("사용자 지정 BRAIN_INDEX의 부모를 만들 수 없으면 경로를 노출하지 않고 유한 실패한다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-index-invalid-parent-"));
    const notesDir = path.join(tmp, "notes");
    const parentFile = path.join(tmp, "parent-is-file");
    const idxPath = path.join(parentFile, "private-index-name.json");
    fs.mkdirSync(notesDir);
    fs.writeFileSync(parentFile, "not-a-directory");
    const script = [
      `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
      `  try {`,
      `    await m.reindex();`,
      `    process.stdout.write(JSON.stringify({ ok: true }));`,
      `  } catch (e) {`,
      `    process.stdout.write(JSON.stringify({ ok: false, message: String(e.message) }));`,
      `  }`,
      `}).catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 2_000,
        env: {
          ...process.env,
          NOTES_DIR: `notes=${notesDir}`,
          BRAIN_INDEX: idxPath,
        },
      });
      const result = JSON.parse(out);
      assert.equal(result.ok, false, "생성 불가능한 경로를 조용히 fallback하면 안 된다");
      assert.ok(result.message.includes("색인 저장 폴더를 준비할 수 없어요"), result.message);
      assert.ok(!result.message.includes(tmp), "오류에 절대경로를 노출하면 안 된다");
      assert.ok(!result.message.includes("private-index-name"), "오류에 색인 파일명을 노출하면 안 된다");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("사용자 지정 BRAIN_INDEX의 기존 부모에 쓰기 권한이 없으면 lock 재시도 없이 유한 실패한다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-index-readonly-parent-"));
    const notesDir = path.join(tmp, "notes");
    const readOnlyParent = path.join(tmp, "readonly");
    const idxPath = path.join(readOnlyParent, "private-index-name.json");
    fs.mkdirSync(notesDir);
    fs.mkdirSync(readOnlyParent, { mode: 0o500 });
    const script = [
      `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
      `  try {`,
      `    await m.reindex();`,
      `    process.stdout.write(JSON.stringify({ ok: true }));`,
      `  } catch (e) {`,
      `    process.stdout.write(JSON.stringify({ ok: false, message: String(e.message) }));`,
      `  }`,
      `}).catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 2_000,
        env: {
          ...process.env,
          NOTES_DIR: `notes=${notesDir}`,
          BRAIN_INDEX: idxPath,
        },
      });
      const result = JSON.parse(out);
      assert.equal(result.ok, false, "쓰기 불가능한 경로를 lock 재시도하면 안 된다");
      assert.ok(result.message.includes("색인 저장 폴더를 준비할 수 없어요"), result.message);
      assert.ok(!result.message.includes(tmp), "오류에 절대경로를 노출하면 안 된다");
      assert.ok(!result.message.includes("private-index-name"), "오류에 색인 파일명을 노출하면 안 된다");
    } finally {
      fs.chmodSync(readOnlyParent, 0o700);
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("사용자 지정 BRAIN_INDEX가 디렉터리여도 저장 오류에 경로를 노출하지 않고 유한 실패한다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-index-rename-failure-"));
    const notesDir = path.join(tmp, "notes");
    const idxPath = path.join(tmp, "private-index-name");
    fs.mkdirSync(notesDir);
    fs.mkdirSync(idxPath);
    const script = [
      `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
      `  try {`,
      `    await m.reindex();`,
      `    process.stdout.write(JSON.stringify({ ok: true }));`,
      `  } catch (e) {`,
      `    process.stdout.write(JSON.stringify({ ok: false, message: String(e.message) }));`,
      `  }`,
      `}).catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 2_000,
        env: {
          ...process.env,
          NOTES_DIR: `notes=${notesDir}`,
          BRAIN_INDEX: idxPath,
        },
      });
      const result = JSON.parse(out);
      assert.equal(result.ok, false, "디렉터리를 색인 파일로 조용히 수용하면 안 된다");
      assert.ok(result.message.includes("색인 저장 폴더를 준비할 수 없어요"), result.message);
      assert.ok(!result.message.includes(tmp), "오류에 절대경로를 노출하면 안 된다");
      assert.ok(!result.message.includes("private-index-name"), "오류에 색인 이름을 노출하면 안 된다");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("source 첫 hash 확인 직후 외부 수정이면 commit 직전 재확인이 stale save를 거부한다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-index-source-commit-race-"));
    const notesDir = path.join(tmp, "notes");
    const stateDir = path.join(tmp, "state");
    const idxPath = path.join(stateDir, "index.json");
    const source = path.join(notesDir, "victim.md");
    fs.mkdirSync(notesDir, { recursive: true });
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(source, "기존 durable revision");
    const script = [
      `(async () => {`,
      `const fs = require("node:fs");`,
      `const path = require("node:path");`,
      `const crypto = require("node:crypto");`,
      `const sha = (text) => crypto.createHash("sha256").update(text).digest("hex");`,
      `const brain = await import(${JSON.stringify(BRAIN_JS)});`,
      `const durableHash = sha("기존 durable revision");`,
      `brain.saveIndex({ version: brain.loadIndex().version, embeddingModel: "text-embedding-3-small", dims: 2, files: {`,
      `  "notes/victim.md": { hash: durableHash, folder: "notes", chunks: [{ path: "notes/victim.md", text: "durable", vector: [1, 0] }], linksOut: [] },`,
      `} });`,
      `const durableJson = fs.readFileSync(process.env.BRAIN_INDEX);`,
      `const durableArtifacts = fs.readdirSync(process.env.STATE_DIR).filter((name) => name.startsWith("index.json")).sort();`,
      `const pending = "직렬화 대상 pending revision";`,
      `fs.writeFileSync(process.env.SOURCE_PATH, pending);`,
      `const stale = brain.loadIndex();`,
      `stale.files["notes/victim.md"] = { hash: sha(pending), folder: "notes", chunks: [{ path: "notes/victim.md", text: pending, vector: [0, 1] }], linksOut: [] };`,
      `const originalRead = fs.readFileSync;`,
      `let sourceReads = 0;`,
      `fs.readFileSync = function(file, ...args) {`,
      `  const value = originalRead.call(this, file, ...args);`,
      `  if (path.resolve(String(file)) === path.resolve(process.env.SOURCE_PATH) && ++sourceReads === 1) {`,
      `    fs.writeFileSync(process.env.SOURCE_PATH, "첫 확인 직후의 external revision");`,
      `  }`,
      `  return value;`,
      `};`,
      `let rejected = false, error = "";`,
      `try { brain.saveIndex(stale, [{ key: "notes/victim.md", fullPath: process.env.SOURCE_PATH, rootDir: process.env.NOTES_ROOT, hash: sha(pending) }]); }`,
      `catch (e) { rejected = true; error = String(e?.message ?? e); }`,
      `fs.readFileSync = originalRead;`,
      `const afterJson = fs.readFileSync(process.env.BRAIN_INDEX);`,
      `const afterArtifacts = fs.readdirSync(process.env.STATE_DIR).filter((name) => name.startsWith("index.json")).sort();`,
      `const tempCount = fs.readdirSync(process.env.STATE_DIR).filter((name) => name.includes(".tmp-")).length;`,
      `const loadedHash = brain.loadIndex().files["notes/victim.md"]?.hash ?? null;`,
      `process.stdout.write(JSON.stringify({ rejected, error, sourceReads, durableBytesPreserved: durableJson.equals(afterJson), durableArtifacts, afterArtifacts, tempCount, loadedHash, durableHash }));`,
      `})().catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 5_000,
        env: {
          ...process.env,
          NOTES_DIR: `notes=${notesDir}`,
          NOTES_ROOT: notesDir,
          SOURCE_PATH: source,
          STATE_DIR: stateDir,
          BRAIN_INDEX: idxPath,
        },
      });
      const r = JSON.parse(out);
      assert.equal(r.rejected, true, "commit 직전 source mismatch를 명시 실패해야 함");
      assert.match(r.error, /노트.*변경|source.*변경|revision.*변경/i);
      assert.ok(r.sourceReads >= 2, "직렬화 전과 commit 직전에 source를 각각 확인해야 함");
      assert.equal(r.durableBytesPreserved, true, "기존 durable index JSON byte를 보존해야 함");
      assert.deepEqual(r.afterArtifacts, r.durableArtifacts, "실패한 새 sidecar도 정리해야 함");
      assert.equal(r.tempCount, 0, "JSON·sidecar temp 잔여가 없어야 함");
      assert.equal(r.loadedHash, r.durableHash, "후속 조회도 실패한 in-memory candidate가 아닌 durable index를 읽어야 함");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("검색 직전 Markdown revision이 바뀌면 stale 색인 chunk를 반환하지 않는다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-search-source-fidelity-race-"));
    const notesDir = path.join(tmp, "notes");
    const stateDir = path.join(tmp, "state");
    const idxPath = path.join(stateDir, "index.json");
    const source = path.join(notesDir, "victim.md");
    fs.mkdirSync(notesDir, { recursive: true });
    fs.mkdirSync(stateDir, { recursive: true });
    const oldText = "검색 전까지 정본인 충분히 긴 이전 revision 본문";
    const currentText = "query embedding 중 교체된 충분히 긴 최신 revision 본문";
    fs.writeFileSync(source, oldText);
    const script = [
      `(async () => {`,
      `const fs = require("node:fs");`,
      `const crypto = require("node:crypto");`,
      `const sha = (text) => crypto.createHash("sha256").update(text).digest("hex");`,
      `const brain = await import(${JSON.stringify(BRAIN_JS)});`,
      `brain.saveIndex({ version: brain.loadIndex().version, embeddingModel: "fixture-model", dims: 2, files: {`,
      `  "notes/victim.md": { hash: sha(process.env.OLD_TEXT), folder: "notes", chunks: [{ path: "notes/victim.md", text: process.env.OLD_TEXT, vector: [1, 0] }], linksOut: [] },`,
      `} });`,
      `let changed = false;`,
      `globalThis.fetch = async (_url, init) => {`,
      `  const input = JSON.parse(String(init?.body ?? "{}")).input ?? [];`,
      `  if (!changed && input.includes(process.env.QUERY)) { fs.writeFileSync(process.env.SOURCE_PATH, process.env.CURRENT_TEXT); changed = true; }`,
      `  return { ok: true, status: 200, json: async () => ({ data: input.map((_, index) => ({ index, embedding: [1, 0] })) }) };`,
      `};`,
      `const hits = await brain.searchNotes(process.env.QUERY);`,
      `process.stdout.write(JSON.stringify({ changed, hits, source: fs.readFileSync(process.env.SOURCE_PATH, "utf8") }));`,
      `})().catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: path.join(tmp, "home"),
          NOTES_DIR: `notes=${notesDir}`,
          BRAIN_INDEX: idxPath,
          QUERY_LOG: "/dev/null",
          EMBEDDINGS_URL: "http://embedding.invalid/v1",
          EMBEDDINGS_MODEL: "fixture-model",
          EMBEDDINGS_KEY: "fixture-key",
          EMBED_RETRIES: "1",
          SOURCE_PATH: source,
          OLD_TEXT: oldText,
          CURRENT_TEXT: currentText,
          QUERY: "source fidelity race query",
        },
      });
      const r = JSON.parse(out);
      assert.equal(r.changed, true, "query embedding 중 외부 교체 fixture가 실행돼야 함");
      assert.equal(r.source, currentText);
      assert.deepEqual(r.hits, [], "현재 Markdown hash와 다른 stale chunk는 fail closed로 제외해야 함");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("검색 source fidelity 확인의 I/O 실패는 빈 결과가 아니라 명시적 오류로 닫힌다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-search-source-fidelity-io-"));
    const notesDir = path.join(tmp, "notes");
    const indexPath = path.join(tmp, "state", "index.json");
    fs.mkdirSync(notesDir, { recursive: true });
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    const source = path.join(notesDir, "io.md");
    const sourceText = "source fidelity I/O fixture";
    fs.writeFileSync(source, sourceText);
    const script = [
      `(async () => {`,
      `const fs = require("node:fs");`,
      `const crypto = require("node:crypto");`,
      `const brain = await import(${JSON.stringify(BRAIN_JS)});`,
      `const sha = (text) => crypto.createHash("sha256").update(text).digest("hex");`,
      `brain.saveIndex({ version: brain.loadIndex().version, embeddingModel: "fixture-model", dims: 2, files: {`,
      `  "canonical/io.md": { hash: sha(process.env.SOURCE_TEXT), folder: "canonical", chunks: [{ path: "canonical/io.md", text: process.env.SOURCE_TEXT, vector: [1, 0] }], linksOut: [] },`,
      `} });`,
      `let replacedSource = false;`,
      `globalThis.fetch = async (_url, init) => {`,
      `  const input = JSON.parse(String(init?.body ?? "{}")).input ?? [];`,
      `  if (!replacedSource) { fs.rmSync(process.env.SOURCE_PATH); fs.mkdirSync(process.env.SOURCE_PATH); replacedSource = true; }`,
      `  return { ok: true, status: 200, json: async () => ({ data: input.map((_, index) => ({ index, embedding: [1, 0] })) }) };`,
      `};`,
      `let rejected = false; let message = ""; let hitCount = -1;`,
      `try { const hits = await brain.searchNotes("I/O fail closed query"); hitCount = hits.length; } catch (e) { rejected = true; message = String(e?.message ?? e); }`,
      `process.stdout.write(JSON.stringify({ rejected, message, hitCount }));`,
      `})().catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const r = JSON.parse(execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: path.join(tmp, "home"),
          NOTES_DIR: `canonical=${notesDir}`,
          BRAIN_INDEX: indexPath,
          QUERY_LOG: "/dev/null",
          EMBEDDINGS_MODEL: "fixture-model",
          EMBEDDINGS_URL: "http://embedding.invalid/v1",
          EMBEDDINGS_KEY: "fixture-key",
          EMBED_RETRIES: "1",
          SOURCE_PATH: source,
          SOURCE_TEXT: sourceText,
        },
      }));
      assert.equal(r.rejected, true, `I/O 실패가 hitCount=${r.hitCount} 빈 결과로 위장됨`);
      assert.match(r.message, /정본.*확인|source.*fidelity/i);
      assert.doesNotMatch(r.message, new RegExp(tmp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "오류에 절대경로를 노출하지 않음");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("query embedding 중 canonical root 전체가 사라지면 빈 결과가 아니라 명시적 오류로 닫힌다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-search-root-unavailable-"));
    const notesDir = path.join(tmp, "notes");
    const indexPath = path.join(tmp, "state", "index.json");
    const source = path.join(notesDir, "victim.md");
    const sourceText = "canonical root unavailable fixture";
    fs.mkdirSync(notesDir, { recursive: true });
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(source, sourceText);
    const script = [
      `(async () => {`,
      `const fs = require("node:fs"); const crypto = require("node:crypto");`,
      `const brain = await import(${JSON.stringify(BRAIN_JS)});`,
      `const sha = (text) => crypto.createHash("sha256").update(text).digest("hex");`,
      `brain.saveIndex({ version: brain.loadIndex().version, embeddingModel: "fixture-model", dims: 2, files: {`,
      `  "canonical/victim.md": { hash: sha(process.env.SOURCE_TEXT), folder: "canonical", chunks: [{ path: "canonical/victim.md", text: process.env.SOURCE_TEXT, vector: [1, 0] }], linksOut: [] },`,
      `} });`,
      `let removed = false;`,
      `globalThis.fetch = async (_url, init) => { const input = JSON.parse(String(init?.body ?? "{}")).input ?? [];`,
      `  if (!removed && input.includes(process.env.QUERY)) { fs.rmSync(process.env.NOTES_ROOT, { recursive: true }); removed = true; }`,
      `  return { ok: true, status: 200, json: async () => ({ data: input.map((_, index) => ({ index, embedding: [1, 0] })) }) }; };`,
      `let rejected = false, message = "", hitCount = -1;`,
      `try { const hits = await brain.searchNotes(process.env.QUERY); hitCount = hits.length; } catch (e) { rejected = true; message = String(e?.message ?? e); }`,
      `process.stdout.write(JSON.stringify({ removed, rejected, message, hitCount }));`,
      `})().catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const r = JSON.parse(execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: path.join(tmp, "home"),
          NOTES_DIR: `canonical=${notesDir}`,
          NOTES_ROOT: notesDir,
          BRAIN_INDEX: indexPath,
          QUERY_LOG: "/dev/null",
          EMBEDDINGS_MODEL: "fixture-model",
          EMBEDDINGS_URL: "http://embedding.invalid/v1",
          EMBEDDINGS_KEY: "fixture-key",
          EMBED_RETRIES: "1",
          SOURCE_TEXT: sourceText,
          QUERY: "root unavailable query",
        },
      }));
      assert.equal(r.removed, true);
      assert.equal(r.rejected, true, `root 장애가 hitCount=${r.hitCount} 빈 결과로 위장됨`);
      assert.match(r.message, /정본.*확인|노트 폴더.*사용|source.*fidelity/i);
      assert.doesNotMatch(r.message, new RegExp(tmp.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("query embedding 중 source 파일만 삭제되고 root는 남으면 confirmed-missing으로 제외한다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-search-source-missing-"));
    const notesDir = path.join(tmp, "notes");
    const indexPath = path.join(tmp, "state", "index.json");
    const source = path.join(notesDir, "victim.md");
    const sourceText = "confirmed source missing fixture";
    fs.mkdirSync(notesDir, { recursive: true });
    fs.mkdirSync(path.dirname(indexPath), { recursive: true });
    fs.writeFileSync(source, sourceText);
    const script = [
      `(async () => {`,
      `const fs = require("node:fs"); const crypto = require("node:crypto");`,
      `const brain = await import(${JSON.stringify(BRAIN_JS)});`,
      `const sha = (text) => crypto.createHash("sha256").update(text).digest("hex");`,
      `brain.saveIndex({ version: brain.loadIndex().version, embeddingModel: "fixture-model", dims: 2, files: {`,
      `  "canonical/victim.md": { hash: sha(process.env.SOURCE_TEXT), folder: "canonical", chunks: [{ path: "canonical/victim.md", text: process.env.SOURCE_TEXT, vector: [1, 0] }], linksOut: [] },`,
      `} });`,
      `let removed = false;`,
      `globalThis.fetch = async (_url, init) => { const input = JSON.parse(String(init?.body ?? "{}")).input ?? [];`,
      `  if (!removed && input.includes(process.env.QUERY)) { fs.rmSync(process.env.SOURCE_PATH); removed = true; }`,
      `  return { ok: true, status: 200, json: async () => ({ data: input.map((_, index) => ({ index, embedding: [1, 0] })) }) }; };`,
      `let rejected = false, message = "", hitCount = -1;`,
      `try { const hits = await brain.searchNotes(process.env.QUERY); hitCount = hits.length; } catch (e) { rejected = true; message = String(e?.message ?? e); }`,
      `process.stdout.write(JSON.stringify({ removed, rejected, message, hitCount, rootExists: fs.statSync(process.env.NOTES_ROOT).isDirectory() }));`,
      `})().catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const r = JSON.parse(execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: path.join(tmp, "home"), NOTES_DIR: `canonical=${notesDir}`, NOTES_ROOT: notesDir,
          SOURCE_PATH: source, SOURCE_TEXT: sourceText, BRAIN_INDEX: indexPath, QUERY_LOG: "/dev/null",
          EMBEDDINGS_MODEL: "fixture-model", EMBEDDINGS_URL: "http://embedding.invalid/v1", EMBEDDINGS_KEY: "fixture-key",
          EMBED_RETRIES: "1", QUERY: "confirmed missing query",
        },
      }));
      assert.deepEqual(r, { removed: true, rejected: false, message: "", hitCount: 0, rootExists: true });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("JSON rename 뒤 parent directory fsync EIO를 성공으로 삼키지 않고 generation을 보존한다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-index-directory-fsync-eio-"));
    const notesDir = path.join(tmp, "notes");
    const stateDir = path.join(tmp, "state");
    const idxPath = path.join(stateDir, "index.json");
    fs.mkdirSync(notesDir, { recursive: true });
    fs.mkdirSync(stateDir, { recursive: true });
    const script = [
      `(async () => {`,
      `const fs = require("node:fs");`,
      `const brain = await import(${JSON.stringify(BRAIN_JS)});`,
      `brain.saveIndex({ version: brain.loadIndex().version, embeddingModel: "fixture-model", dims: 2, files: {`,
      `  "notes/a.md": { hash: "ha", folder: "notes", chunks: [{ path: "notes/a.md", text: "a", vector: [1, 0] }], linksOut: [] },`,
      `} });`,
      `const before = fs.readdirSync(process.env.STATE_DIR).filter((name) => name.startsWith("index.json")).sort();`,
      `const candidate = brain.loadIndex();`,
      `candidate.files["notes/b.md"] = { hash: "hb", folder: "notes", chunks: [{ path: "notes/b.md", text: "b", vector: [0, 1] }], linksOut: [] };`,
      `const originalFsync = fs.fsyncSync;`,
      `let directoryFsyncs = 0;`,
      `fs.fsyncSync = function(fd) {`,
      `  if (fs.fstatSync(fd).isDirectory() && ++directoryFsyncs === 2) { const error = new Error("fixture EIO"); error.code = "EIO"; throw error; }`,
      `  return originalFsync.call(this, fd);`,
      `};`,
      `let rejected = false, error = "";`,
      `try { brain.saveIndex(candidate); } catch (e) { rejected = true; error = String(e?.message ?? e); }`,
      `fs.fsyncSync = originalFsync;`,
      `const disk = JSON.parse(fs.readFileSync(process.env.BRAIN_INDEX, "utf8"));`,
      `const sidecarExists = typeof disk.vectorFile === "string" && fs.existsSync(process.env.STATE_DIR + "/" + disk.vectorFile);`,
      `const after = fs.readdirSync(process.env.STATE_DIR).filter((name) => name.startsWith("index.json")).sort();`,
      `const tempCount = after.filter((name) => name.includes(".tmp-")).length;`,
      `brain._resetIndexCacheForTest();`,
      `const loaded = brain.loadIndex();`,
      `process.stdout.write(JSON.stringify({ rejected, error, directoryFsyncs, before, after, sidecarExists, tempCount, keys: Object.keys(loaded.files).sort() }));`,
      `})().catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: path.join(tmp, "home"),
          NOTES_DIR: `notes=${notesDir}`,
          STATE_DIR: stateDir,
          BRAIN_INDEX: idxPath,
          QUERY_LOG: "/dev/null",
          EMBEDDINGS_MODEL: "fixture-model",
        },
      });
      const r = JSON.parse(out);
      assert.equal(r.directoryFsyncs, 2, "두 번째 directory fsync에서 EIO fixture가 발생해야 함");
      assert.equal(r.rejected, true, "EIO를 durable success로 보고하면 안 됨");
      assert.match(r.error, /색인.*저장|저장.*색인/);
      assert.equal(r.sidecarExists, true, "rename된 JSON이 참조한 sidecar를 삭제하면 안 됨");
      assert.ok(r.after.length >= r.before.length + 1, "fsync 실패에서는 직전 generation을 GC하지 않아야 함");
      assert.equal(r.tempCount, 0);
      assert.deepEqual(r.keys, ["notes/a.md", "notes/b.md"], "fresh load 가능한 일관된 generation이어야 함");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("삭제 처리 전에 시작된 임베딩이 끝나도 삭제된 노트를 색인에 되살리지 않는다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-index-delete-race-"));
    const notesDir = path.join(tmp, "notes");
    const idxPath = path.join(tmp, ".brain-index.json");
    fs.mkdirSync(notesDir);
    fs.writeFileSync(path.join(notesDir, "victim.md"), "삭제 경쟁을 재현하기 위한 충분히 긴 테스트 노트 본문입니다.");
    const script = [
      `const http = require("node:http");`,
      `const fs = require("node:fs");`,
      `const path = require("node:path");`,
      `let brain;`,
      `const srv = http.createServer((req, res) => {`,
      `  let raw = ""; req.on("data", (c) => (raw += c));`,
      `  req.on("end", () => {`,
      `    fs.unlinkSync(path.join(process.env.NOTES_ROOT, "victim.md"));`,
      `    brain.removeFromIndex("notes/victim.md");`,
      `    const n = JSON.parse(raw).input.length;`,
      `    res.setHeader("content-type", "application/json");`,
      `    res.end(JSON.stringify({ data: Array.from({ length: n }, (_, i) => ({ index: i, embedding: [1, 0] })) }));`,
      `  });`,
      `});`,
      `srv.listen(0, async () => {`,
      `  process.env.EMBEDDINGS_URL = "http://127.0.0.1:" + srv.address().port + "/v1";`,
      `  brain = await import(${JSON.stringify(BRAIN_JS)});`,
      `  try {`,
      `    await brain.reindex();`,
      `    const memoryKeys = Object.keys(brain.loadIndex().files);`,
      `    const diskKeys = Object.keys(JSON.parse(fs.readFileSync(process.env.BRAIN_INDEX, "utf8")).files);`,
      `    process.stdout.write(JSON.stringify({ sourceExists: fs.existsSync(path.join(process.env.NOTES_ROOT, "victim.md")), memoryKeys, diskKeys }));`,
      `  } finally { srv.close(); }`,
      `});`,
    ].join("\n");
    try {
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          NOTES_DIR: `notes=${notesDir}`,
          NOTES_ROOT: notesDir,
          BRAIN_INDEX: idxPath,
          EMBEDDINGS_KEY: "test-key",
          EMBED_RETRIES: "1",
        },
      });
      assert.deepEqual(JSON.parse(out), { sourceExists: false, memoryKeys: [], diskKeys: [] });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("다른 프로세스의 삭제가 완료된 뒤 늦은 임베딩 writer가 기존 항목을 되살리지 않는다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-index-delete-multiprocess-"));
    const notesDir = path.join(tmp, "notes");
    const idxPath = path.join(tmp, ".brain-index.json");
    fs.mkdirSync(notesDir);
    fs.writeFileSync(path.join(notesDir, "victim.md"), "처음 색인되어 있던 노트 본문입니다.");
    const script = [
      `(async () => {`,
      `const http = require("node:http");`,
      `const fs = require("node:fs");`,
      `const path = require("node:path");`,
      `const crypto = require("node:crypto");`,
      `const { execFileSync } = require("node:child_process");`,
      `const source = path.join(process.env.NOTES_ROOT, "victim.md");`,
      `let brain;`,
      `const srv = http.createServer((req, res) => {`,
      `  let raw = ""; req.on("data", (c) => (raw += c));`,
      `  req.on("end", () => {`,
      `    fs.unlinkSync(source);`,
      `    execFileSync("node", ["--import", "tsx/esm", "-e",`,
      `      "import(" + JSON.stringify(${JSON.stringify(BRAIN_JS)}) + ").then((m) => m.removeFromIndex('notes/victim.md'))"`,
      `    ], { cwd: ${JSON.stringify(REPO_ROOT)}, env: process.env });`,
      `    const n = JSON.parse(raw).input.length;`,
      `    res.setHeader("content-type", "application/json");`,
      `    res.end(JSON.stringify({ data: Array.from({ length: n }, (_, i) => ({ index: i, embedding: [1, 0] })) }));`,
      `  });`,
      `});`,
      `await new Promise((resolve) => srv.listen(0, resolve));`,
      `process.env.EMBEDDINGS_URL = "http://127.0.0.1:" + srv.address().port + "/v1";`,
      `brain = await import(${JSON.stringify(BRAIN_JS)});`,
      `const initial = fs.readFileSync(source, "utf8");`,
      `brain.saveIndex({`,
      `  version: brain.loadIndex().version, embeddingModel: process.env.EMBEDDINGS_MODEL || "text-embedding-3-small",`,
      `  files: { "notes/victim.md": { hash: crypto.createHash("sha256").update(initial).digest("hex"), folder: "notes", chunks: [], linksOut: [] } },`,
      `});`,
      `fs.writeFileSync(source, "임베딩이 진행되는 동안 삭제될 변경된 노트 본문입니다.");`,
      `try {`,
      `  await brain.reindex();`,
      `  process.stdout.write(JSON.stringify({ sourceExists: fs.existsSync(source), keys: Object.keys(brain.loadIndex().files) }));`,
      `} finally { srv.close(); }`,
      `})().catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 5_000,
        env: {
          ...process.env,
          NOTES_DIR: `notes=${notesDir}`,
          NOTES_ROOT: notesDir,
          BRAIN_INDEX: idxPath,
          EMBEDDINGS_KEY: "test-key",
          EMBED_RETRIES: "1",
        },
      });
      assert.deepEqual(JSON.parse(out), { sourceExists: false, keys: [] });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("삭제 의도와 무관한 동시 저장이 경쟁해도 삭제된 항목만 되살아나지 않는다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-index-delete-unrelated-save-"));
    const notesDir = path.join(tmp, "notes");
    const idxPath = path.join(tmp, ".brain-index.json");
    fs.mkdirSync(notesDir);
    const script = [
      `(async () => {`,
      `const crypto = require("node:crypto");`,
      `const { execFileSync } = require("node:child_process");`,
      `const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");`,
      `const brain = await import(${JSON.stringify(BRAIN_JS)});`,
      `const victimHash = hash("삭제될 revision");`,
      `brain.saveIndex({ version: brain.loadIndex().version, embeddingModel: "text-embedding-3-small", files: {`,
      `  "notes/victim.md": { hash: victimHash, folder: "notes", chunks: [], linksOut: [] },`,
      `} });`,
      `const stale = brain.loadIndex();`,
      `delete stale.files["notes/victim.md"];`,
      `execFileSync("node", ["--import", "tsx/esm", "-e",`,
      `  "import(" + JSON.stringify(${JSON.stringify(BRAIN_JS)}) + ").then((m) => { const i=m.loadIndex(); i.files['orphan/unrelated.md']={hash:'unrelated',folder:'orphan',chunks:[],linksOut:[]}; m.saveIndex(i); })"`,
      `], { cwd: ${JSON.stringify(REPO_ROOT)}, env: process.env });`,
      `brain.saveIndex(stale, [], [{ key: "notes/victim.md", expectedHash: victimHash, fullPath: process.env.NOTES_ROOT + "/victim.md", rootDir: process.env.NOTES_ROOT }]);`,
      `process.stdout.write(JSON.stringify(Object.keys(brain.loadIndex().files).sort()));`,
      `})().catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 5_000,
        env: {
          ...process.env,
          NOTES_DIR: `notes=${notesDir}`,
          NOTES_ROOT: notesDir,
          BRAIN_INDEX: idxPath,
        },
      });
      assert.deepEqual(JSON.parse(out), ["orphan/unrelated.md"]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("disk generation이 그대로여도 같은 경로·bytes로 재생성된 source는 늦은 삭제 의도가 지우지 않는다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-index-identical-recreate-"));
    const notesDir = path.join(tmp, "notes");
    const idxPath = path.join(tmp, ".brain-index.json");
    fs.mkdirSync(notesDir);
    const source = path.join(notesDir, "victim.md");
    fs.writeFileSync(source, "동일하게 재생성될 내용");
    const script = [
      `(async () => {`,
      `const fs = require("node:fs");`,
      `const crypto = require("node:crypto");`,
      `const hash = crypto.createHash("sha256").update("동일하게 재생성될 내용").digest("hex");`,
      `const brain = await import(${JSON.stringify(BRAIN_JS)});`,
      `brain.saveIndex({ version: brain.loadIndex().version, embeddingModel: "text-embedding-3-small", files: {`,
      `  "notes/victim.md": { hash, folder: "notes", chunks: [], linksOut: [] },`,
      `} });`,
      `const stale = brain.loadIndex();`,
      `delete stale.files["notes/victim.md"];`,
      `fs.unlinkSync(process.env.SOURCE_PATH);`,
      `fs.writeFileSync(process.env.SOURCE_PATH, "동일하게 재생성될 내용");`,
      `brain.saveIndex(stale, [], [{ key: "notes/victim.md", expectedHash: hash, fullPath: process.env.SOURCE_PATH, rootDir: process.env.NOTES_ROOT }]);`,
      `process.stdout.write(JSON.stringify(Object.keys(brain.loadIndex().files)));`,
      `})().catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 5_000,
        env: {
          ...process.env,
          NOTES_DIR: `notes=${notesDir}`,
          NOTES_ROOT: notesDir,
          SOURCE_PATH: source,
          BRAIN_INDEX: idxPath,
        },
      });
      assert.deepEqual(JSON.parse(out), ["notes/victim.md"]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("삭제 확인 뒤 JSON commit 직전에 source가 재생성되면 이전 generation을 그대로 보존한다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-index-recreate-before-commit-"));
    const notesDir = path.join(tmp, "notes");
    const idxPath = path.join(tmp, ".brain-index.json");
    const source = path.join(notesDir, "victim.md");
    fs.mkdirSync(notesDir);
    fs.writeFileSync(source, "commit 직전 재생성될 동일 bytes");
    const script = [
      `(async () => {`,
      `const fs = require("node:fs");`,
      `const crypto = require("node:crypto");`,
      `const text = "commit 직전 재생성될 동일 bytes";`,
      `const hash = crypto.createHash("sha256").update(text).digest("hex");`,
      `const brain = await import(${JSON.stringify(BRAIN_JS)});`,
      `brain.saveIndex({ version: brain.loadIndex().version, embeddingModel: "text-embedding-3-small", files: {`,
      `  "notes/victim.md": { hash, folder: "notes", chunks: [], linksOut: [] },`,
      `} });`,
      `const before = fs.readFileSync(process.env.BRAIN_INDEX);`,
      `const stale = brain.loadIndex();`,
      `delete stale.files["notes/victim.md"];`,
      `fs.unlinkSync(process.env.SOURCE_PATH);`,
      `const originalOpenSync = fs.openSync;`,
      `let recreated = false;`,
      `fs.openSync = function(target, ...args) {`,
      `  const fd = originalOpenSync.call(this, target, ...args);`,
      `  if (!recreated && String(target).startsWith(process.env.BRAIN_INDEX + ".tmp-")) {`,
      `    fs.writeFileSync(process.env.SOURCE_PATH, text); recreated = true;`,
      `  }`,
      `  return fd;`,
      `};`,
      `let rejected = false;`,
      `try {`,
      `  brain.saveIndex(stale, [], [{ key: "notes/victim.md", expectedHash: hash, fullPath: process.env.SOURCE_PATH, rootDir: process.env.NOTES_ROOT }]);`,
      `} catch { rejected = true; } finally { fs.openSync = originalOpenSync; }`,
      `const after = fs.readFileSync(process.env.BRAIN_INDEX);`,
      `process.stdout.write(JSON.stringify({ rejected, recreated, bytesUnchanged: before.equals(after), keys: Object.keys(JSON.parse(after).files) }));`,
      `})().catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 5_000,
        env: {
          ...process.env,
          NOTES_DIR: `notes=${notesDir}`,
          NOTES_ROOT: notesDir,
          SOURCE_PATH: source,
          BRAIN_INDEX: idxPath,
        },
      });
      assert.deepEqual(JSON.parse(out), {
        rejected: true,
        recreated: true,
        bytesUnchanged: true,
        keys: ["notes/victim.md"],
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("스캔 프루닝과 무관한 동시 저장이 경쟁해도 삭제 source를 되살리지 않는다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-index-prune-unrelated-save-"));
    const notesDir = path.join(tmp, "notes");
    const idxPath = path.join(tmp, ".brain-index.json");
    fs.mkdirSync(notesDir);
    const script = [
      `(async () => {`,
      `const http = require("node:http");`,
      `const fs = require("node:fs");`,
      `const crypto = require("node:crypto");`,
      `const { execFileSync } = require("node:child_process");`,
      `const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");`,
      `const srv = http.createServer((req, res) => {`,
      `  let raw = ""; req.on("data", (c) => (raw += c));`,
      `  req.on("end", () => {`,
      `    execFileSync("node", ["--import", "tsx/esm", "-e",`,
      `      "import(" + JSON.stringify(${JSON.stringify(BRAIN_JS)}) + ").then((m) => { const i=m.loadIndex(); i.files['orphan/unrelated.md']={hash:'unrelated',folder:'orphan',chunks:[],linksOut:[]}; m.saveIndex(i); })"`,
      `    ], { cwd: ${JSON.stringify(REPO_ROOT)}, env: process.env });`,
      `    const n = JSON.parse(raw).input.length;`,
      `    res.setHeader("content-type", "application/json");`,
      `    res.end(JSON.stringify({ data: Array.from({ length: n }, (_, i) => ({ index: i, embedding: [1, 0] })) }));`,
      `  });`,
      `});`,
      `await new Promise((resolve) => srv.listen(0, resolve));`,
      `process.env.EMBEDDINGS_URL = "http://127.0.0.1:" + srv.address().port + "/v1";`,
      `const brain = await import(${JSON.stringify(BRAIN_JS)});`,
      `brain.saveIndex({ version: brain.loadIndex().version, embeddingModel: "text-embedding-3-small", files: {`,
      `  "notes/victim.md": { hash: hash("삭제될 source"), folder: "notes", chunks: [], linksOut: [] },`,
      `} });`,
      `fs.writeFileSync(process.env.NEW_SOURCE, "새 노트를 임베딩해 경쟁을 여는 충분히 긴 본문입니다.");`,
      `try {`,
      `  await brain.reindex();`,
      `  process.stdout.write(JSON.stringify(Object.keys(brain.loadIndex().files).sort()));`,
      `} finally { srv.close(); }`,
      `})().catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 5_000,
        env: {
          ...process.env,
          NOTES_DIR: `notes=${notesDir}`,
          NEW_SOURCE: path.join(notesDir, "new.md"),
          BRAIN_INDEX: idxPath,
          EMBEDDINGS_KEY: "test-key",
          EMBED_RETRIES: "1",
        },
      });
      assert.deepEqual(JSON.parse(out), ["notes/new.md", "orphan/unrelated.md"]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("노트 폴더가 사라지고 디스크 stat이 그대로여도 기존 durable 항목을 보존한다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-index-missing-folder-baseline-"));
    const notesDir = path.join(tmp, "notes");
    const idxPath = path.join(tmp, ".brain-index.json");
    fs.mkdirSync(notesDir);
    const source = path.join(notesDir, "victim.md");
    fs.writeFileSync(source, "기존 durable revision");
    const script = [
      `(async () => {`,
      `const fs = require("node:fs");`,
      `const crypto = require("node:crypto");`,
      `const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");`,
      `const brain = await import(${JSON.stringify(BRAIN_JS)});`,
      `const durableHash = hash("기존 durable revision");`,
      `const pendingHash = hash("늦은 writer의 pending revision");`,
      `brain.saveIndex({ version: brain.loadIndex().version, embeddingModel: "text-embedding-3-small", files: {`,
      `  "notes/victim.md": { hash: durableHash, folder: "notes", chunks: [], linksOut: [] },`,
      `} });`,
      `const stale = brain.loadIndex();`,
      `stale.files["notes/victim.md"].hash = pendingHash;`,
      `fs.rmSync(process.env.NOTES_ROOT, { recursive: true, force: true });`,
      `brain.saveIndex(stale, [{ key: "notes/victim.md", fullPath: process.env.SOURCE_PATH, rootDir: process.env.NOTES_ROOT, hash: pendingHash }]);`,
      `process.stdout.write(JSON.stringify({ finalHash: brain.loadIndex().files["notes/victim.md"]?.hash ?? null, durableHash }));`,
      `})().catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 5_000,
        env: {
          ...process.env,
          NOTES_DIR: `notes=${notesDir}`,
          NOTES_ROOT: notesDir,
          SOURCE_PATH: source,
          BRAIN_INDEX: idxPath,
        },
      });
      const result = JSON.parse(out);
      assert.equal(result.finalHash, result.durableHash);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("노트 폴더가 사라져도 다른 embedding model의 durable 항목을 복원하지 않는다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-index-incompatible-winner-"));
    const notesDir = path.join(tmp, "notes");
    const idxPath = path.join(tmp, ".brain-index.json");
    fs.mkdirSync(notesDir);
    const source = path.join(notesDir, "victim.md");
    fs.writeFileSync(source, "기존 revision");
    const script = [
      `(async () => {`,
      `const fs = require("node:fs");`,
      `const crypto = require("node:crypto");`,
      `const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");`,
      `const sealIndex = (idx) => { delete idx.indexDigest; idx.indexDigest = hash(JSON.stringify(idx)); return idx; };`,
      `const brain = await import(${JSON.stringify(BRAIN_JS)});`,
      `const pendingHash = hash("현재 model의 pending revision");`,
      `const incompatibleHash = hash("다른 model의 durable revision");`,
      `brain.saveIndex({ version: brain.loadIndex().version, embeddingModel: "text-embedding-3-small", files: {`,
      `  "notes/victim.md": { hash: hash("기존 revision"), folder: "notes", chunks: [], linksOut: [] },`,
      `} });`,
      `const stale = brain.loadIndex();`,
      `stale.files["notes/victim.md"].hash = pendingHash;`,
      `const external = await sealIndex({ version: stale.version, embeddingModel: "incompatible-model", files: {`,
      `  "notes/victim.md": { hash: incompatibleHash, folder: "notes", chunks: [], linksOut: [] },`,
      `} });`,
      `fs.writeFileSync(process.env.BRAIN_INDEX, JSON.stringify(external));`,
      `fs.rmSync(process.env.NOTES_ROOT, { recursive: true, force: true });`,
      `brain.saveIndex(stale, [{ key: "notes/victim.md", fullPath: process.env.SOURCE_PATH, rootDir: process.env.NOTES_ROOT, hash: pendingHash }]);`,
      `const final = brain.loadIndex();`,
      `process.stdout.write(JSON.stringify({ finalHash: final.files["notes/victim.md"]?.hash ?? null, model: final.embeddingModel }));`,
      `})().catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 5_000,
        env: {
          ...process.env,
          NOTES_DIR: `notes=${notesDir}`,
          NOTES_ROOT: notesDir,
          SOURCE_PATH: source,
          BRAIN_INDEX: idxPath,
        },
      });
      assert.deepEqual(JSON.parse(out), { finalHash: null, model: "text-embedding-3-small" });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("dims stamp가 없는 다른 차원 sidecar의 durable 항목을 병합하지 않는다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-index-incompatible-sidecar-"));
    const notesDir = path.join(tmp, "notes");
    const idxPath = path.join(tmp, ".brain-index.json");
    fs.mkdirSync(notesDir);
    const source = path.join(notesDir, "victim.md");
    fs.writeFileSync(source, "현재 model의 pending revision");
    const script = [
      `(async () => {`,
      `const fs = require("node:fs");`,
      `const path = require("node:path");`,
      `const crypto = require("node:crypto");`,
      `const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");`,
      `const sealIndex = (idx) => { delete idx.indexDigest; idx.indexDigest = hash(JSON.stringify(idx)); return idx; };`,
      `const brain = await import(${JSON.stringify(BRAIN_JS)});`,
      `const pendingHash = hash("현재 model의 pending revision");`,
      `const incompatibleHash = hash("다른 차원의 durable revision");`,
      `brain.saveIndex({ version: brain.loadIndex().version, embeddingModel: "text-embedding-3-small", dims: 2, files: {`,
      `  "notes/victim.md": { hash: pendingHash, folder: "notes", chunks: [{ path: "notes/victim.md", text: "pending", vector: [1, 0] }], linksOut: [] },`,
      `} });`,
      `const stale = brain.loadIndex();`,
      `const vectorFile = path.basename(process.env.BRAIN_INDEX) + ".vec-incompatible";`,
      `const sidecar = Buffer.alloc(28);`,
      `sidecar.write("LMV1", 0, "ascii"); sidecar.writeUInt32LE(3, 4); sidecar.writeUInt32LE(1, 8);`,
      `sidecar.writeFloatLE(1, 16); sidecar.writeFloatLE(2, 20); sidecar.writeFloatLE(3, 24);`,
      `fs.writeFileSync(path.join(path.dirname(process.env.BRAIN_INDEX), vectorFile), sidecar);`,
      `const vectorDigest = hash(sidecar);`,
      `const external = sealIndex({ version: stale.version, embeddingModel: "text-embedding-3-small", dims: 3, vectorFile, vectorDigest, files: {`,
      `  "notes/victim.md": { hash: incompatibleHash, folder: "notes", chunks: [{ path: "notes/victim.md", text: "incompatible", slot: 0 }], linksOut: [] },`,
      `} });`,
      `fs.writeFileSync(process.env.BRAIN_INDEX, JSON.stringify(external));`,
      `brain._resetIndexCacheForTest();`,
      `const externalLoaded = brain.loadIndex();`,
      `if (externalLoaded.files["notes/victim.md"]?.chunks?.[0]?.vector?.length !== 3) throw new Error("valid external writer fixture did not hydrate");`,
      `fs.rmSync(process.env.NOTES_ROOT, { recursive: true, force: true });`,
      `brain.saveIndex(stale, [{ key: "notes/victim.md", fullPath: process.env.SOURCE_PATH, rootDir: process.env.NOTES_ROOT, hash: pendingHash }]);`,
      `process.stdout.write(JSON.stringify({ finalHash: brain.loadIndex().files["notes/victim.md"]?.hash ?? null }));`,
      `})().catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 5_000,
        env: {
          ...process.env,
          NOTES_DIR: `notes=${notesDir}`,
          NOTES_ROOT: notesDir,
          SOURCE_PATH: source,
          BRAIN_INDEX: idxPath,
        },
      });
      assert.deepEqual(JSON.parse(out), { finalHash: null });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("노트 폴더가 사라지면 다른 프로세스의 최신 색인을 삭제하지 않고 보존한다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-index-missing-folder-race-"));
    const notesDir = path.join(tmp, "notes");
    const idxPath = path.join(tmp, ".brain-index.json");
    fs.mkdirSync(notesDir);
    const source = path.join(notesDir, "victim.md");
    fs.writeFileSync(source, "처음 revision");
    const script = [
      `(async () => {`,
      `const fs = require("node:fs");`,
      `const crypto = require("node:crypto");`,
      `const { execFileSync } = require("node:child_process");`,
      `const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");`,
      `const brain = await import(${JSON.stringify(BRAIN_JS)});`,
      `const oldHash = hash("처음 revision");`,
      `const latestHash = hash("다른 프로세스의 최신 revision");`,
      `const pendingHash = hash("늦은 writer의 pending revision");`,
      `brain.saveIndex({ version: brain.loadIndex().version, embeddingModel: "text-embedding-3-small", files: {`,
      `  "notes/victim.md": { hash: oldHash, folder: "notes", chunks: [], linksOut: [] },`,
      `} });`,
      `const stale = brain.loadIndex();`,
      `fs.writeFileSync(process.env.SOURCE_PATH, "다른 프로세스의 최신 revision");`,
      `execFileSync("node", ["--import", "tsx/esm", "-e",`,
      `  "import(" + JSON.stringify(${JSON.stringify(BRAIN_JS)}) + ").then((m) => { const i=m.loadIndex(); i.files['notes/victim.md'].hash=" + JSON.stringify(latestHash) + "; m.saveIndex(i); })"`,
      `], { cwd: ${JSON.stringify(REPO_ROOT)}, env: process.env });`,
      `fs.rmSync(process.env.NOTES_ROOT, { recursive: true, force: true });`,
      `brain.saveIndex(stale, [{ key: "notes/victim.md", fullPath: process.env.SOURCE_PATH, rootDir: process.env.NOTES_ROOT, hash: pendingHash }]);`,
      `process.stdout.write(JSON.stringify({ finalHash: brain.loadIndex().files["notes/victim.md"]?.hash ?? null, latestHash }));`,
      `})().catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 5_000,
        env: {
          ...process.env,
          NOTES_DIR: `notes=${notesDir}`,
          NOTES_ROOT: notesDir,
          SOURCE_PATH: source,
          BRAIN_INDEX: idxPath,
        },
      });
      const result = JSON.parse(out);
      assert.equal(result.finalHash, result.latestHash);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("AC-1: 파일 변경이 없으면 두 번째 loadIndex는 같은 객체를 반환한다(캐시 적중)", () => {
    const r = runBrainProbe(`
      const V = m.loadIndex().version;
      m.saveIndex({ version: V, files: {} });
      const a = m.loadIndex();
      const b = m.loadIndex();
      process.stdout.write(JSON.stringify({ same: a === b }));
    `);
    assert.equal(r.same, true);
  });

  it("AC-2: 외부에서 파일이 바뀌면(mtime/size 변화) 다시 읽는다", () => {
    const r = runBrainProbe(`
      const V = m.loadIndex().version;
      m.saveIndex({ version: V, files: { "a/x.md": { hash: "h", folder: "a", chunks: [], linksOut: [] } } });
      m.loadIndex(); // 캐시 적중 상태 만들기
      // 외부 변경 시뮬: saveIndex 안 거치고 파일 직접 교체 + mtime 강제 변경
      const external = await sealIndex({ version: V, files: { "b/y.md": { hash: "h2", folder: "b", chunks: [], linksOut: [] } } });
      fs.writeFileSync(idxPath, JSON.stringify(external));
      const future = Date.now() / 1000 + 10;
      fs.utimesSync(idxPath, future, future);
      const after = m.loadIndex();
      process.stdout.write(JSON.stringify({ keys: Object.keys(after.files) }));
    `);
    assert.deepEqual(r.keys, ["b/y.md"]);
  });

  // 참고: "temp 쓰기 도중 중단 시 원본 온전"은 fs.renameSync의 POSIX 원자성(OS 보장)에
  // 의존하므로 유닛 테스트로 중단을 재현하기 부적절하다. 여기서는 원자적 쓰기의 관측 가능한
  // 결과(잔여 temp 없음 + 기존 인덱스가 새 내용으로 온전히 교체됨)를 검증한다.
  it("AC-3: saveIndex는 원자적이다 — temp 잔여 없이 기존 인덱스를 온전히 교체한다", () => {
    const r = runBrainProbe(`
      const V = m.loadIndex().version;
      // 기존 인덱스가 있는 상태에서 새 내용으로 교체(중단 없이 정상 경로).
      m.saveIndex({ version: V, files: { "old/a.md": { hash: "h", folder: "old", chunks: [], linksOut: [] } } });
      m.saveIndex({ version: V, files: { "new/b.md": { hash: "h2", folder: "new", chunks: [], linksOut: [] } } });
      let parsed = null;
      try { parsed = JSON.parse(fs.readFileSync(idxPath, "utf8")); } catch {}
      process.stdout.write(JSON.stringify({
        tmpExists: fs.existsSync(idxPath + ".tmp"),
        keys: parsed ? Object.keys(parsed.files) : null,
      }));
    `);
    assert.equal(r.tmpExists, false, "temp 파일이 남으면 안 된다");
    assert.deepEqual(r.keys, ["new/b.md"], "새 내용으로 온전히 교체돼야 한다");
  });

  it("AC-4: 동시 호출은 1회로 합치고(single-flight), 종료 후 새 호출은 새로 실행한다", () => {
    const r = runBrainProbe(`
      m._resetIndexCacheForTest();
      // reindex()는 내부에서 ensureIndexed()를 호출한다. 빈 vault라 임베딩 없이 스캔만.
      // 1) 동시 3회 → in-flight 공유 → 실제 실행 1회
      await Promise.all([m.reindex(), m.reindex(), m.reindex()]);
      const afterConcurrent = m._indexRunCountForTest();
      // 2) 앞 실행이 끝난 뒤(in-flight=null) 새 호출 → 새 실행 → 2회
      await m.reindex();
      const afterSequential = m._indexRunCountForTest();
      process.stdout.write(JSON.stringify({ afterConcurrent, afterSequential }));
    `);
    assert.equal(r.afterConcurrent, 1, "동시 3회는 1회로 합쳐져야 한다");
    assert.equal(r.afterSequential, 2, "in-flight 종료 후 새 호출은 새로 실행돼야 한다");
  });

  it("AC-6: 캐시가 있어도 파일이 삭제되면 빈 인덱스를 반환한다(낡은 캐시 금지)", () => {
    const r = runBrainProbe(`
      const V = m.loadIndex().version;
      m.saveIndex({ version: V, files: { "a/x.md": { hash: "h", folder: "a", chunks: [], linksOut: [] } } });
      m.loadIndex(); // 캐시 적중
      fs.unlinkSync(idxPath);
      const after = m.loadIndex();
      process.stdout.write(JSON.stringify({ fileCount: Object.keys(after.files).length }));
    `);
    assert.equal(r.fileCount, 0);
  });
});

describe("Phase 2 index fingerprint identity", () => {
  it("same-size atomic replacement가 mtime을 복원해도 cache stale hit를 허용하지 않는다", () => {
    const r = runBrainProbe(`
      const V = m.loadIndex().version;
      const fe = (folder) => ({ hash: "h", folder, chunks: [], linksOut: [] });
      m.saveIndex({ version: V, files: { "a/a.md": fe("a") } });
      const fixed = 1700000000;
      fs.utimesSync(idxPath, fixed, fixed);
      m._resetIndexCacheForTest();
      m.loadIndex(); // fixed mtime의 캐시 snapshot
      const before = fs.statSync(idxPath);
      const disk = JSON.parse(fs.readFileSync(idxPath, "utf8"));
      disk.files = { "b/b.md": fe("b") }; // key·folder 모두 같은 길이
      const replacement = JSON.stringify(await sealIndex(disk));
      const originalSize = fs.statSync(idxPath).size;
      const tmp = idxPath + ".external-replacement";
      fs.writeFileSync(tmp, replacement);
      fs.utimesSync(tmp, fixed, fixed);
      fs.renameSync(tmp, idxPath);
      const afterStat = fs.statSync(idxPath);
      const after = m.loadIndex();
      process.stdout.write(JSON.stringify({
        keys: Object.keys(after.files), sameSize: afterStat.size === originalSize,
        sameMtime: afterStat.mtimeMs === before.mtimeMs,
        identityChanged: afterStat.dev !== before.dev || afterStat.ino !== before.ino || afterStat.ctimeMs !== before.ctimeMs,
      }));
    `);
    assert.equal(r.sameSize, true, "fixture가 size를 바꾸면 mtime+size 결함을 재현하지 못함");
    assert.equal(r.sameMtime, true, "fixture가 원래 mtime을 정확히 복원해야 함");
    assert.equal(r.identityChanged, true, "atomic replacement identity는 달라야 함");
    assert.deepEqual(r.keys, ["b/b.md"], "교체된 디스크 내용을 다시 읽어야 함");
  });

  it("same-size atomic replacement+mtime 복원도 saveIndex reload-merge에서 동시 갱신을 보존한다", () => {
    const r = runBrainProbe(`
      const V = m.loadIndex().version;
      const fe = (folder, hash = folder) => ({ hash, folder, chunks: [], linksOut: [] });
      m.saveIndex({ version: V, files: { "a/a.md": fe("a"), "x/x.md": fe("x") } });
      const fixed = 1700000000;
      fs.utimesSync(idxPath, fixed, fixed);
      m._resetIndexCacheForTest();
      const mine = m.loadIndex();
      const before = fs.statSync(idxPath);
      const disk = JSON.parse(fs.readFileSync(idxPath, "utf8"));
      delete disk.files["x/x.md"];
      disk.files["b/b.md"] = fe("b"); // x→b: JSON byte length 동일
      const replacement = JSON.stringify(await sealIndex(disk));
      const originalSize = fs.statSync(idxPath).size;
      const tmp = idxPath + ".external-replacement";
      fs.writeFileSync(tmp, replacement);
      fs.utimesSync(tmp, fixed, fixed);
      fs.renameSync(tmp, idxPath);
      const externalStat = fs.statSync(idxPath);
      delete mine.files["x/x.md"];
      mine.files["c/c.md"] = fe("c");
      m.saveIndex(mine);
      const final = m.loadIndex();
      process.stdout.write(JSON.stringify({
        keys: Object.keys(final.files).sort(), sameSize: externalStat.size === originalSize,
        sameMtime: externalStat.mtimeMs === before.mtimeMs,
        identityChanged: externalStat.dev !== before.dev || externalStat.ino !== before.ino || externalStat.ctimeMs !== before.ctimeMs,
      }));
    `);
    assert.equal(r.sameSize, true);
    assert.equal(r.sameMtime, true);
    assert.equal(r.identityChanged, true);
    assert.deepEqual(r.keys, ["a/a.md", "b/b.md", "c/c.md"], "외부 b와 내 c가 모두 보존돼야 함");
  });
});

// ── specs/013 트랙 B — chunkText 분할 불변식 (FR-4, AC-6) ──────────────────
// 기본 MAX_CHUNK=2000(BRAIN_CHUNK_SIZE 미설정) 기준. 순수 함수라 직접 검증.

describe("chunkText — 분할 불변식 (013 AC-6)", () => {
  const MAX = 2000;

  /** 공백을 제외한 내용이 청크 합집합에 전부 보존됐는지(유실 0) */
  function strippedEqual(text: string, chunks: string[]): boolean {
    return chunks.join("").replace(/\s+/g, "") === text.replace(/\s+/g, "");
  }

  it("AC-6: 빈 줄 없는 5,000자 문단도 잘리지 않고 전부 분할된다(꼬리 유실 0)", () => {
    const tail = "이것이문단의마지막고유문구다"; // 기존 버그: 앞 2000자만 남고 이 꼬리가 유실됐다
    const text = "가나다라마바사아자차카타파하 ".repeat(330) + tail; // ~5,000자, 빈 줄 없음
    const chunks = chunkText(text);
    assert.ok(chunks.length >= 3, "여러 청크로 분할돼야 한다");
    for (const c of chunks) assert.ok(c.length <= MAX, `청크가 MAX(${MAX})를 넘으면 안 됨: ${c.length}`);
    assert.ok(strippedEqual(text, chunks), "공백 제외 내용 유실이 없어야 한다");
    assert.ok(chunks[chunks.length - 1].includes(tail), "문단 꼬리가 마지막 청크에 존재");
  });

  it("AC-6: 경계값 — 정확히 MAX 길이는 1청크, MAX+1은 분할되되 유실이 없다", () => {
    const exact = "a".repeat(MAX);
    assert.deepEqual(chunkText(exact), [exact]);

    const over = "b".repeat(MAX + 1); // 공백·문장 경계가 전혀 없는 극단 — 고정 창 분할
    const chunks = chunkText(over);
    assert.ok(chunks.length === 2);
    for (const c of chunks) assert.ok(c.length <= MAX);
    assert.ok(strippedEqual(over, chunks));
  });

  it("AC-6: 문장 경계가 있으면 경계에서 나눈다(문장이 중간에 동강나지 않음)", () => {
    const sentence = "이 문장은 충분히 길어서 여러 번 반복하면 청크 한계를 넘게 된다. ";
    const text = sentence.repeat(60); // ~2,700자
    const chunks = chunkText(text);
    assert.ok(chunks.length >= 2);
    for (const c of chunks) assert.ok(c.length <= MAX);
    assert.ok(strippedEqual(text, chunks));
    // 경계 분할 확인: 각 청크가 문장 종결로 끝난다
    for (const c of chunks.slice(0, -1)) assert.ok(c.trimEnd().endsWith("."), `문장 경계에서 잘려야 함: ...${c.slice(-20)}`);
  });

  it("기존 동작 보존: 짧은 문단들은 하나의 청크로 합쳐진다", () => {
    const text = "첫 문단입니다.\n\n둘째 문단입니다.\n\n셋째 문단입니다.";
    assert.deepEqual(chunkText(text), ["첫 문단입니다.\n\n둘째 문단입니다.\n\n셋째 문단입니다."]);
  });

  it("빈 입력은 빈 배열", () => {
    assert.deepEqual(chunkText(""), []);
    assert.deepEqual(chunkText("   \n\n  "), []);
  });
});

// ── specs/013 트랙 C — createNoteFile 배타 생성 (FR-8, AC-10) ───────────────

describe("createNoteFile — capture 파일명 충돌 방지 (013 AC-10)", () => {
  it("AC-10: 같은 파일명으로 두 번 생성해도 덮어쓰지 않고 둘 다 보존된다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-capture-collide-"));
    try {
      const f1 = createNoteFile(dir, "2026-07-03T10-00-00-메모.md", "첫 노트");
      const f2 = createNoteFile(dir, "2026-07-03T10-00-00-메모.md", "둘째 노트");
      assert.notEqual(f1, f2, "파일명이 달라야 한다");
      assert.equal(fs.readFileSync(path.join(dir, f1), "utf8"), "첫 노트", "첫 노트가 보존된다");
      assert.equal(fs.readFileSync(path.join(dir, f2), "utf8"), "둘째 노트");
      assert.ok(f2.endsWith(".md"), "접미가 붙어도 .md 확장자 유지");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("충돌이 없으면 요청한 파일명 그대로 생성된다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-capture-plain-"));
    try {
      const f = createNoteFile(dir, "note.md", "본문");
      assert.equal(f, "note.md");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── specs/004 — 쿼리 로그 (FR-1·2·3, AC-1·2·3) ─────────────────────────────
// searchNotes는 쿼리 임베딩이 필요하므로, 프로브 안에서 임시 HTTP 임베딩 스텁을 띄워
// 외부 서버 없이 검증한다(고정 벡터 반환 — 유사도 값은 무관, 로깅 경로만 확인).

function runQueryLogProbe(notesDir: string, body: string): any {
  const script = [
    `const http = require("node:http");`,
    `const fsx = require("node:fs");`,
    `const srv = http.createServer((req, res) => {`,
    `  let raw = ""; req.on("data", (c) => (raw += c));`,
    `  req.on("end", () => {`,
    `    res.setHeader("content-type", "application/json");`,
    `    if ((req.url || "").includes("chat/completions")) {`,
    `      res.end(JSON.stringify({ choices: [{ message: { content: "노트 기반 답변 [notes/x.md]" } }] }));`,
    `      return;`,
    `    }`,
    `    const n = (JSON.parse(raw).input || []).length;`,
    `    res.end(JSON.stringify({ data: Array.from({ length: n }, (_, i) => ({ index: i, embedding: [1, 0, 0, 0] })) }));`,
    `  });`,
    `});`,
    `srv.listen(0, async () => {`,
    `  const base = "http://127.0.0.1:" + srv.address().port;`,
    `  process.env.EMBEDDINGS_URL = base + "/v1";`,
    `  const m = await import(${JSON.stringify(BRAIN_JS)});`,
    `  try {`,
    body,
    `  } catch (e) { console.error(e); process.exit(1); }`,
    `  srv.close();`,
    `});`,
  ].join("\n");
  const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      NOTES_DIR: `notes=${notesDir}`,
      BRAIN_INDEX: path.join(notesDir, ".brain-index.json"),
      QUERY_LOG: path.join(notesDir, "query-log.jsonl"),
      EMBEDDINGS_KEY: "test-key",
      EMBED_RETRIES: "1",
    },
  });
  return JSON.parse(out);
}

describe("쿼리 로그 (004)", () => {
  it("AC-1: 히트 없는 검색이 hitCount:0, success:false로 기록된다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-qlog-ac1-"));
    try {
      const r = runQueryLogProbe(dir, `
        await m.searchNotes("아무것도 없는 주제");
        // 로깅은 fire-and-forget(비동기 append) — 파일 '존재'가 아니라 '내용'을 기다린다.
        // appendFile은 open(생성) 후 write라, 그 사이에 읽으면 빈 파일이다(CI에서 발현된 경합).
        const ready = () => {
          try { return fsx.readFileSync(process.env.QUERY_LOG, "utf8").trim().length > 0; }
          catch { return false; }
        };
        for (let i = 0; i < 100 && !ready(); i++) await new Promise((r) => setTimeout(r, 20));
        const lines = fsx.readFileSync(process.env.QUERY_LOG, "utf8").trim().split("\\n").filter(Boolean).map(JSON.parse);
        process.stdout.write(JSON.stringify(lines));
      `);
      const rec = r.find((x: any) => x.tool === "search_notes");
      assert.ok(rec, "search_notes 레코드가 있어야 한다");
      assert.equal(rec.hitCount, 0);
      assert.equal(rec.success, false);
      assert.equal(rec.query, "아무것도 없는 주제");
      assert.ok(typeof rec.ts === "string" && !Number.isNaN(Date.parse(rec.ts)));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("AC-1(보강): capture는 validationStatus와 함께, 히트 있는 검색은 success:true로 기록된다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-qlog-ac2-"));
    try {
      const r = runQueryLogProbe(dir, `
        await m.capture("백업 절차를 정리한 노트 본문입니다. 자세한 단계는 다음과 같습니다.", "백업 절차");
        await m.searchNotes("백업 절차");
        // 로깅은 fire-and-forget(비동기 append) — 레코드 2건 반영을 잠시 대기
        const enough = () => {
          try { return fsx.readFileSync(process.env.QUERY_LOG, "utf8").trim().split("\\n").length >= 2; }
          catch { return false; }
        };
        for (let i = 0; i < 100 && !enough(); i++) await new Promise((r) => setTimeout(r, 20));
        const lines = fsx.readFileSync(process.env.QUERY_LOG, "utf8").trim().split("\\n").filter(Boolean).map(JSON.parse);
        process.stdout.write(JSON.stringify(lines));
      `);
      const cap = r.find((x: any) => x.tool === "capture_note");
      assert.ok(cap, "capture_note 레코드");
      assert.equal(cap.captureValidation, "confirmed");
      const srch = r.find((x: any) => x.tool === "search_notes");
      assert.ok(srch, "search_notes 레코드");
      assert.equal(srch.success, true);
      assert.ok(srch.hitCount >= 1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("AC-3: 로그 기록이 실패해도(쓰기 불가 경로) 검색 응답은 정상 반환된다(fire-and-forget)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-qlog-ac3-"));
    try {
      const script = [
        `const http = require("node:http");`,
        `const srv = http.createServer((req, res) => {`,
        `  let raw = ""; req.on("data", (c) => (raw += c));`,
        `  req.on("end", () => {`,
        `    const n = (JSON.parse(raw).input || []).length;`,
        `    res.setHeader("content-type", "application/json");`,
        `    res.end(JSON.stringify({ data: Array.from({ length: n }, (_, i) => ({ index: i, embedding: [1, 0, 0, 0] })) }));`,
        `  });`,
        `});`,
        `srv.listen(0, async () => {`,
        `  process.env.EMBEDDINGS_URL = "http://127.0.0.1:" + srv.address().port + "/v1";`,
        `  const m = await import(${JSON.stringify(BRAIN_JS)});`,
        `  const hits = await m.searchNotes("정상 동작 확인");`,
        `  process.stdout.write(JSON.stringify({ ok: Array.isArray(hits) }));`,
        `  srv.close();`,
        `});`,
      ].join("\n");
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          NOTES_DIR: `notes=${dir}`,
          BRAIN_INDEX: path.join(dir, ".brain-index.json"),
          QUERY_LOG: "/dev/null/불가능한/경로/query-log.jsonl", // 쓰기 불가
          EMBEDDINGS_KEY: "test-key",
          EMBED_RETRIES: "1",
        },
      });
      assert.equal(JSON.parse(out).ok, true, "로그 실패가 검색을 막으면 안 된다");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── specs/013 트랙 B — 다중 프로세스 인덱스 안전 (FR-6, AC-11·12) ───────────

describe("인덱스 다중 프로세스 안전 (013)", () => {
  it("AC-11: 다른 프로세스가 먼저 저장한 엔트리가 내 저장으로 유실되지 않는다(reload-merge)", () => {
    const r = runBrainProbe(`
      const V = m.loadIndex().version;
      const emptyHash = await sha256("");
      const fe = (folder) => ({ hash: emptyHash, folder, chunks: [], linksOut: [] });
      for (const name of ["a.md", "b.md", "c.md"]) fs.writeFileSync(process.env.NOTES_ROOT + "/" + name, "");
      // 내 로드 시점: a만 있는 인덱스 저장(cachedStat 확정)
      m.saveIndex({ version: V, files: { "notes/a.md": fe("notes") } });
      // 다른 프로세스 저장 시뮬: saveIndex를 거치지 않고 직접 교체(b 추가) + mtime 변경
      fs.writeFileSync(idxPath, JSON.stringify(await sealIndex({
        version: V,
        files: { "notes/a.md": fe("notes"), "notes/b.md": fe("notes") },
      })));
      const future = Date.now() / 1000 + 10;
      fs.utimesSync(idxPath, future, future);
      // 내 저장: c를 추가 — b가 유실되면 안 된다
      m.saveIndex({ version: V, files: { "notes/a.md": fe("notes"), "notes/c.md": fe("notes") } });
      const finalIdx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
      process.stdout.write(JSON.stringify({ keys: Object.keys(finalIdx.files).sort() }));
    `);
    assert.deepEqual(r.keys, ["notes/a.md", "notes/b.md", "notes/c.md"], "양쪽 갱신이 모두 보존돼야 한다");
  });

  it("AC-12: 죽은 프로세스의 stale 락이 있어도 저장이 유한 시간 안에 완료된다", () => {
    const r = runBrainProbe(`
      const V = m.loadIndex().version;
      // 고아 락 파일(오래된 mtime) — 락 보유 프로세스가 죽은 상황
      fs.writeFileSync(idxPath + ".lock", "");
      const past = (Date.now() - 60_000) / 1000;
      fs.utimesSync(idxPath + ".lock", past, past);
      const t0 = Date.now();
      m.saveIndex({ version: V, files: {} });
      process.stdout.write(JSON.stringify({
        ms: Date.now() - t0,
        lockGone: !fs.existsSync(idxPath + ".lock"),
        saved: fs.existsSync(idxPath),
      }));
    `);
    assert.ok(r.saved, "저장이 완료돼야 한다");
    assert.ok(r.lockGone, "저장 후 락이 남지 않는다");
    assert.ok(r.ms < 5000, `영구 대기 없이 완료돼야 한다(${r.ms}ms)`);
  });

  it("잘못된 BRAIN_LOCK_STALE_MS는 기본값으로 복구하고 큰 유한값은 상한으로 제한한다", () => {
    assert.equal(normalizeLockStaleMs("1e308"), 60_000);
    assert.equal(normalizeLockStaleMs("Infinity"), 10_000);
    assert.equal(normalizeLockStaleMs("not-a-number"), 10_000);
    assert.equal(normalizeLockStaleMs("0"), 10_000);
    for (const value of ["not-a-number", "Infinity", "0", "-1", "1e308"]) {
      const r = runBrainProbe(`
        const V = m.loadIndex().version;
        fs.writeFileSync(idxPath + ".lock", "");
        const past = (Date.now() - 60_000) / 1000;
        fs.utimesSync(idxPath + ".lock", past, past);
        const t0 = Date.now();
        m.saveIndex({ version: V, files: {} });
        process.stdout.write(JSON.stringify({ ms: Date.now() - t0, saved: fs.existsSync(idxPath) }));
      `, { BRAIN_LOCK_STALE_MS: value });
      assert.ok(r.saved, `${value}: 저장이 완료돼야 한다`);
      assert.ok(r.ms < 5000, `${value}: 영구 대기 없이 완료돼야 한다(${r.ms}ms)`);
    }
  });

  it("오래됐어도 살아 있는 PID가 소유한 lock은 강제 제거하지 않고 유한 실패한다", () => {
    const ownerPid = process.pid;
    const r = runBrainProbe(`
      const V = m.loadIndex().version;
      const token = ${JSON.stringify(String(process.pid))} + ":00000000-0000-4000-8000-000000000000";
      fs.writeFileSync(idxPath + ".lock", token);
      const past = (Date.now() - 60_000) / 1000;
      fs.utimesSync(idxPath + ".lock", past, past);
      const t0 = Date.now();
      try {
        m.saveIndex({ version: V, files: {} });
        process.stdout.write(JSON.stringify({ ok: true }));
      } catch (e) {
        process.stdout.write(JSON.stringify({
          ok: false,
          ms: Date.now() - t0,
          preserved: fs.readFileSync(idxPath + ".lock", "utf8") === token,
          safe: !String(e.message).includes(idxPath),
        }));
      }
    `, { BRAIN_LOCK_STALE_MS: "1000" });
    assert.equal(r.ok, false, `살아 있는 owner(${ownerPid}) lock을 회수하면 안 된다`);
    assert.ok(r.preserved, "기존 owner token을 보존해야 한다");
    assert.ok(r.safe, "오류에 색인 절대경로를 노출하면 안 된다");
    assert.ok(r.ms < 5000, `유한 시간 안에 실패해야 한다(${r.ms}ms)`);
  });

  it("결함1 회귀: 중간의 무관한 loadIndex가 있어도 병합 기준(객체별 스냅샷)이 유지된다", () => {
    const r = runBrainProbe(`
      const V = m.loadIndex().version;
      const emptyHash = await sha256("");
      const fe = (folder) => ({ hash: emptyHash, folder, chunks: [], linksOut: [] });
      for (const name of ["a.md", "b.md", "c.md"]) fs.writeFileSync(process.env.NOTES_ROOT + "/" + name, "");
      m.saveIndex({ version: V, files: { "notes/a.md": fe("notes") } });
      const mine = m.loadIndex(); // 내 작업본 — 이 시점(a만 존재)이 병합 기준이어야 한다
      // 다른 프로세스가 b를 추가 저장
      fs.writeFileSync(idxPath, JSON.stringify(await sealIndex({
        version: V,
        files: { "notes/a.md": fe("notes"), "notes/b.md": fe("notes") },
      })));
      const future = Date.now() / 1000 + 10;
      fs.utimesSync(idxPath, future, future);
      m.loadIndex(); // 무관한 중간 로드(다른 도구 호출·watcher) — 공유 캐시가 전진하는 상황
      mine.files["notes/c.md"] = fe("notes"); // 내 작업본에 c 추가
      m.saveIndex(mine); // 기준이 공유 캐시라면 merge가 스킵돼 b가 유실된다
      const finalIdx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
      process.stdout.write(JSON.stringify({ keys: Object.keys(finalIdx.files).sort() }));
    `);
    assert.deepEqual(r.keys, ["notes/a.md", "notes/b.md", "notes/c.md"], "중간 로드가 있어도 b가 보존돼야 한다");
  });

  it("결함2 회귀: 스키마 버전 업그레이드 시 재색인 사유를 안내한다", () => {
    const r = runBrainProbe(`
      const errs = [];
      process.stderr.write = (s) => { errs.push(String(s)); return true; };
      fs.writeFileSync(idxPath, JSON.stringify({ version: 3, files: { "notes/x.md": { hash: "h", folder: "notes", chunks: [], linksOut: [] } } }));
      m._resetIndexCacheForTest();
      const idx = m.loadIndex();
      process.stdout.write(JSON.stringify({ fileCount: Object.keys(idx.files).length, notice: errs.join("") }));
    `);
    assert.equal(r.fileCount, 0, "구버전 인덱스는 재색인 대상으로 비워진다");
    assert.ok(r.notice.includes("다시 색인"), "재색인 사유가 안내돼야 한다");
  });

  it("결함4 회귀: dangling .md 심링크가 있어도 색인이 크래시하지 않는다", () => {
    const r = runBrainProbe(`
      fs.symlinkSync("/nonexistent-target-note.md", process.env.NOTES_DIR.split("=")[1] + "/dangling.md");
      const stats = await m.reindex(); // 읽기 실패 파일은 건너뛴다 — throw 없이 완료돼야 한다
      process.stdout.write(JSON.stringify({ files: stats.files }));
    `);
    assert.equal(r.files, 0, "dangling 심링크는 건너뛰고 색인이 완료된다");
  });

  it("AC-8(메타): 재색인 후 인덱스에 임베딩 모델명이 기록된다(빈 vault — dims는 임베딩 후에만)", () => {
    const r = runBrainProbe(`
      await m.reindex(); // 빈 vault — 임베딩 호출 없이 스캔·저장만
      const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
      process.stdout.write(JSON.stringify({ model: idx.embeddingModel }));
    `);
    assert.equal(r.model, "text-embedding-3-small", "기본 모델명이 기록돼야 한다");
  });

  it("AC-7(모델 게이트): 인덱스의 임베딩 모델이 현재 설정과 다르면 빈 인덱스로 폴백(전체 재색인 유도)", () => {
    const r = runBrainProbe(`
      const V = m.loadIndex().version;
      // 다른 모델로 만들어진 인덱스가 디스크에 있는 상황
      fs.writeFileSync(idxPath, JSON.stringify({
        version: V, embeddingModel: "other-model", dims: 768,
        files: { "notes/x.md": { hash: "h", folder: "notes", chunks: [], linksOut: [] } },
      }));
      m._resetIndexCacheForTest();
      const idx = m.loadIndex();
      process.stdout.write(JSON.stringify({ fileCount: Object.keys(idx.files).length }));
    `);
    assert.equal(r.fileCount, 0, "모델 불일치 인덱스는 재색인 대상으로 비워져야 한다");
  });
});

// ── specs/016 AC-9: 페르소나 레지스트리(agents/)는 노트 색인·목록에서 제외 ──
describe("agents/ 색인 제외 — specs/016 AC-9 (자식 프로세스 격리)", () => {
  it("노트 폴더 안의 agents/ 정의는 색인 스캔(listMarkdown)에 나타나지 않는다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-agents-exclude-"));
    try {
      fs.writeFileSync(path.join(dir, "note.md"), "일반 노트 본문");
      fs.mkdirSync(path.join(dir, "agents"));
      fs.writeFileSync(
        path.join(dir, "agents", "critic.md"),
        "---\nname: critic\ndescription: x\ntargets:\n  claude:\n    model: opus\n---\n페르소나-지침-고유-문구",
      );
      // agents와 무관한 하위 폴더는 여전히 색인되는지 함께 확인(과도 제외 방지)
      fs.mkdirSync(path.join(dir, "sub"));
      fs.writeFileSync(path.join(dir, "sub", "inner.md"), "하위 폴더 노트");

      const script = [
        `import(${JSON.stringify(BRAIN_JS)}).then((m) => {`,
        `  process.stdout.write(JSON.stringify(m.listMarkdown(${JSON.stringify(dir)})));`,
        `}).catch((e) => { console.error(e); process.exit(1); });`,
      ].join("\n");
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          NOTES_DIR: `notes=${dir}`,
          BRAIN_INDEX: path.join(dir, ".brain-index.json"),
          LOCALMIND_AGENTS_DIR: path.join(dir, "agents"),
        },
      });
      const paths: string[] = JSON.parse(out);
      assert.ok(paths.some((p) => p.endsWith("note.md")), "일반 노트가 목록에 없음");
      assert.ok(paths.some((p) => p.endsWith(path.join("sub", "inner.md"))), "하위 폴더 노트가 목록에 없음");
      // 전체 경로에는 tmp 접두("...-agents-exclude-")가 있어 하위 상대경로로 판정한다.
      assert.ok(!paths.some((p) => p.includes(path.join("agents", "critic.md"))), `agents/ 파일이 목록에 노출됨: ${paths.join(", ")}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── specs/019 AC-10: 미러 마커(.localmind-mirror) 폴더 색인 제외 ────────────

describe("listMarkdown 미러 제외 (019 AC-10)", () => {
  it("마커가 있는 하위 폴더는 색인 대상에서 빠진다", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lm-mirror-"));
    try {
      fs.writeFileSync(path.join(tmp, "note.md"), "# 노트");
      fs.mkdirSync(path.join(tmp, "agents"));
      fs.writeFileSync(path.join(tmp, "agents", "persona.md"), "# 페르소나(미러)");
      fs.writeFileSync(path.join(tmp, "agents", ".localmind-mirror"), "specs/019 미러 마커");
      fs.mkdirSync(path.join(tmp, "sub"));
      fs.writeFileSync(path.join(tmp, "sub", "keep.md"), "# 유지");
      const files = listMarkdown(tmp);
      assert.ok(files.some((f) => f.endsWith("note.md")));
      assert.ok(files.some((f) => f.endsWith("keep.md")));
      assert.ok(!files.some((f) => f.includes("persona.md")), "미러 하위 파일이 색인에 포함되면 안 된다");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("마커가 없는 같은 이름 폴더는 정상 색인된다(오탐 금지)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lm-mirror-"));
    try {
      fs.mkdirSync(path.join(tmp, "agents"));
      fs.writeFileSync(path.join(tmp, "agents", "doc.md"), "# 일반 노트");
      const files = listMarkdown(tmp);
      assert.ok(files.some((f) => f.endsWith("doc.md")));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("Markdown 심볼릭 링크 데이터 경계", () => {
  it("노트 폴더 밖 파일을 가리키는 .md 링크는 색인·검색하지 않고 일반 노트는 유지한다", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-symlink-boundary-"));
    const vault = path.join(root, "vault");
    const idxPath = path.join(root, "index.json");
    const queryLog = path.join(root, "query-log.jsonl");
    const outsideMarker = "OUTSIDE-SYMLINK-BOUNDARY-MARKER";
    fs.mkdirSync(path.join(vault, "sub"), { recursive: true });
    fs.writeFileSync(path.join(vault, "note.md"), "# 일반 노트\n정상 루트 문서");
    fs.writeFileSync(path.join(vault, "sub", "inner.md"), "# 하위 노트\n정상 하위 문서");
    fs.writeFileSync(path.join(root, "outside.md"), outsideMarker);
    fs.symlinkSync(path.join(root, "outside.md"), path.join(vault, "external.md"));
    fs.symlinkSync(path.join(root, "missing.md"), path.join(vault, "dangling.md"));

    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(idxPath, base, { NOTES_DIR: `notes=${vault}`, QUERY_LOG: queryLog });
        const idx = JSON.parse(fs.readFileSync(idxPath, "utf8"));
        const keys = Object.keys(idx.files);
        assert.deepEqual(keys.sort(), ["notes/note.md", "notes/sub/inner.md"]);
        assert.doesNotMatch(JSON.stringify(idx.files), new RegExp(outsideMarker));

        const script = [
          `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
          `  const hits = await m.searchNotes(${JSON.stringify(outsideMarker)});`,
          `  process.stdout.write(JSON.stringify(hits));`,
          `}).catch((e) => { console.error(e); process.exit(1); });`,
        ].join("\n");
        const { stdout } = await execFileP("node", ["--import", "tsx/esm", "-e", script], {
          cwd: REPO_ROOT,
          encoding: "utf8",
          env: {
            ...process.env,
            NOTES_DIR: `notes=${vault}`,
            BRAIN_INDEX: idxPath,
            QUERY_LOG: queryLog,
            EMBEDDINGS_URL: base,
            EMBEDDINGS_KEY: "test-key",
          },
        });
        assert.ok(!stdout.includes(outsideMarker), "외부 파일 marker가 검색 결과에 나타나면 안 된다");
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ── specs/020 — 색인 프루닝 가드 (FR-1~5, AC-1~9) ──────────────────────────
//
// 검증 대상은 "명시적 재색인 경로"이므로 scripts/reindex.ts 자체를 자식 프로세스로
// 실행한다(출력 문구 AC까지 커버). 임베딩은 부모 프로세스의 HTTP 스텁이 처리하고
// 호출 횟수를 계측한다(AC-2 재임베딩 0건). execFileSync는 부모 이벤트 루프를 막아
// 스텁이 응답할 수 없으므로 비동기 execFile을 쓴다. BRAIN_INDEX를 명시해 같은 색인
// 파일을 NOTES_DIR 조합만 바꾼 여러 실행이 공유한다(plan 테스트 전략).

const execFileP = promisify(execFile);

function makePruneFixture(): { root: string; idxPath: string; nd: (labels: string[]) => string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-prune-"));
  const idxPath = path.join(root, "index.json");
  for (const l of ["a", "b", "c"]) {
    fs.mkdirSync(path.join(root, l), { recursive: true });
    fs.writeFileSync(path.join(root, l, `${l}1.md`), `# ${l} 노트\n${l} 폴더의 내용입니다`);
  }
  return { root, idxPath, nd: (labels) => labels.map((l) => `${l}=${path.join(root, l)}`).join(",") };
}

async function withEmbedStub(
  fn: (base: string, calls: () => number) => Promise<void>,
  opts: { failMarker?: string; onRequest?: () => void } = {}, // 요청 본문에 마커가 있으면 500 — 순번 기반보다 결정적(021 AC-3)
): Promise<void> {
  let count = 0;
  const srv = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      count++;
      opts.onRequest?.();
      if (opts.failMarker && raw.includes(opts.failMarker)) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "stub failure" }));
        return;
      }
      const n = (JSON.parse(raw || "{}").input || []).length;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data: Array.from({ length: n }, (_, i) => ({ index: i, embedding: [1, 0, 0, 0] })) }));
    });
  });
  await new Promise<void>((r) => srv.listen(0, r));
  const port = (srv.address() as { port: number }).port;
  try {
    await fn(`http://127.0.0.1:${port}/v1`, () => count);
  } finally {
    srv.close();
  }
}

async function runReindexCli(
  idxPath: string,
  base: string,
  env: Record<string, string | undefined>,
): Promise<{ stdout: string; stderr: string }> {
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    BRAIN_INDEX: idxPath,
    EMBEDDINGS_URL: base,
    EMBEDDINGS_KEY: "test-key",
    // 플레이크 방어(specs/202607210756): 전체 스위트 병렬(10-way + cold tsx 자식 컴파일)
    // 경합에서 단발 fetch가 굶으면 120s 즉사하던 것을 짧은 타임아웃 × 재시도로 흡수한다.
    // 로컬 스텁 정상 응답은 ms 단위 — 15s는 10배 이상 여유. (retry 횟수를 assert하는
    // 테스트는 runReindexCli를 쓰지 않아 판정 오염 없음.)
    EMBED_TIMEOUT_MS: "15000",
    EMBED_RETRIES: "3",
  };
  // 상속 env의 잔여값이 판정을 오염시키지 않게 관련 키를 먼저 비운다.
  delete childEnv.NOTES_DIR;
  delete childEnv.REINDEX_FALLBACK;
  delete childEnv.REINDEX_PRUNE_LABELS;
  delete childEnv.REINDEX_ADOPT_REBIND;
  for (const [k, v] of Object.entries(env)) if (v !== undefined) childEnv[k] = v;
  const { stdout, stderr } = await execFileP("node", ["--import", "tsx/esm", "scripts/reindex.ts"], {
    cwd: REPO_ROOT,
    env: childEnv,
    encoding: "utf8",
  });
  return { stdout, stderr };
}

function indexKeys(idxPath: string): string[] {
  return Object.keys(JSON.parse(fs.readFileSync(idxPath, "utf8")).files);
}

describe("색인 프루닝 가드 (020)", () => {
  it("AC-1: 후퇴 신호(REINDEX_FALLBACK=1) 재색인은 키를 1건도 지우지 않고 보류를 안내한다", async () => {
    const f = makePruneFixture();
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        assert.equal(indexKeys(f.idxPath).length, 3, "사전 색인 3키");
        const fb = path.join(f.root, "fb");
        fs.mkdirSync(fb);
        fs.writeFileSync(path.join(fb, "f.md"), "폴백 폴더의 노트입니다");
        const { stdout } = await runReindexCli(f.idxPath, base, { NOTES_DIR: `fb=${fb}`, REINDEX_FALLBACK: "1" });
        const keys = indexKeys(f.idxPath);
        for (const k of ["a/a1.md", "b/b1.md", "c/c1.md", "fb/f.md"]) assert.ok(keys.includes(k), `${k} 보존/추가`);
        assert.match(stdout, /보류/, "삭제 반영 보류 안내");
        assert.doesNotMatch(stdout, /REINDEX_PRUNE_LABELS/, "후퇴 중 고아 정리 명령 미포함");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-1(자체 폴백): NOTES_DIR 완전 부재도 무프루닝 — HOME 격리로 검증", async () => {
    const f = makePruneFixture();
    const home = path.join(f.root, "home");
    fs.mkdirSync(path.join(home, ".localmind"), { recursive: true });
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b"]) });
        assert.equal(indexKeys(f.idxPath).length, 2);
        const { stdout } = await runReindexCli(f.idxPath, base, { HOME: home });
        const keys = indexKeys(f.idxPath);
        assert.ok(keys.includes("a/a1.md") && keys.includes("b/b1.md"), "자체 폴백에서도 보존");
        assert.match(stdout, /보류/);
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-2: 후퇴 후 정상 재색인은 재임베딩 0건 + 삭제 반영 재개", async () => {
    const f = makePruneFixture();
    try {
      await withEmbedStub(async (base, calls) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${path.join(f.root, "a")}`, REINDEX_FALLBACK: "1" });
        fs.rmSync(path.join(f.root, "c", "c1.md")); // 정상 실행에서 삭제 반영이 재개되는지
        const before = calls();
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        assert.equal(calls() - before, 0, "해시 불변 → 재임베딩 0건");
        const keys = indexKeys(f.idxPath);
        assert.ok(keys.includes("a/a1.md") && keys.includes("b/b1.md"), "보존");
        assert.ok(!keys.includes("c/c1.md"), "정상 실행에서 삭제 반영 재개");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-3: 등록됐지만 readdir 실패(부재·권한)한 폴더의 키는 보존 + 경로 경고", async () => {
    const f = makePruneFixture();
    const cDir = path.join(f.root, "c");
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        fs.renameSync(cDir, `${cDir}.away`); // 디렉토리 부재(미마운트·클론 전)
        const { stdout } = await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        let keys = indexKeys(f.idxPath);
        assert.ok(keys.includes("c/c1.md"), "부재 라벨 보존");
        assert.ok(keys.includes("a/a1.md") && keys.includes("b/b1.md"), "나머지 정상 색인");
        assert.ok(stdout.includes(cDir), "경고에 폴더 경로 표시");
        assert.doesNotMatch(stdout, /REINDEX_PRUNE_LABELS=c/, "부재 라벨에 정리 안내 금지");
        fs.renameSync(`${cDir}.away`, cDir);
        fs.chmodSync(cDir, 0o000); // 권한 거부도 같은 가드
        try {
          await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
          keys = indexKeys(f.idxPath);
          assert.ok(keys.includes("c/c1.md"), "권한 거부 라벨 보존");
        } finally {
          fs.chmodSync(cDir, 0o755);
        }
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-4: 대상 폴더 안의 파일 삭제는 그 키만 반영된다", async () => {
    const f = makePruneFixture();
    try {
      await withEmbedStub(async (base) => {
        fs.writeFileSync(path.join(f.root, "a", "a2.md"), "곧 삭제될 노트입니다");
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        assert.equal(indexKeys(f.idxPath).length, 4);
        fs.rmSync(path.join(f.root, "a", "a2.md"));
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        const keys = indexKeys(f.idxPath);
        assert.ok(!keys.includes("a/a2.md"), "삭제 키만 제거");
        for (const k of ["a/a1.md", "b/b1.md", "c/c1.md"]) assert.ok(keys.includes(k), `${k} 보존`);
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-5: readdir 가능한 빈 폴더는 기존대로 전량 삭제 반영된다(회귀 고정)", async () => {
    const f = makePruneFixture();
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        fs.rmSync(path.join(f.root, "a", "a1.md")); // a는 존재하는 빈 폴더가 됨
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        const keys = indexKeys(f.idxPath);
        assert.ok(!keys.includes("a/a1.md"), "빈 폴더 라벨은 삭제 반영");
        assert.ok(keys.includes("b/b1.md") && keys.includes("c/c1.md"), "다른 라벨 보존");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-6: 고아 라벨은 요약에 라벨·건수·보존·정리 명령으로 안내된다", async () => {
    const f = makePruneFixture();
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        const { stdout } = await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a"]) });
        const keys = indexKeys(f.idxPath);
        assert.ok(keys.includes("b/b1.md") && keys.includes("c/c1.md"), "고아 라벨 키 보존");
        assert.match(stdout, /b.*1건.*보존/, "라벨·건수·보존 문구");
        assert.match(stdout, /REINDEX_PRUNE_LABELS=b/, "정리 명령 안내");
        assert.match(stdout, /REINDEX_PRUNE_LABELS=c/);
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-7: REINDEX_PRUNE_LABELS는 고아 라벨만 제거하며 공백 표기도 트림된다", async () => {
    const f = makePruneFixture();
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        const { stdout } = await runReindexCli(f.idxPath, base, {
          NOTES_DIR: f.nd(["a"]),
          REINDEX_PRUNE_LABELS: " b , ", // 트림 + 빈 항목 무시
        });
        const keys = indexKeys(f.idxPath);
        assert.ok(!keys.some((k) => k.startsWith("b/")), "지정한 고아 라벨 b 제거");
        assert.ok(keys.includes("c/c1.md"), "지정 안 한 고아 라벨 c 보존");
        assert.ok(keys.includes("a/a1.md"), "대상 라벨 불변");
        assert.match(stdout, /b.*정리/, "정리 결과 안내");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-8: 대상·부재 라벨은 탈출구로 지울 수 없고 사유가 안내된다", async () => {
    const f = makePruneFixture();
    const cDir = path.join(f.root, "c");
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        fs.renameSync(cDir, `${cDir}.away`); // c = 부재 라벨
        const { stdout } = await runReindexCli(f.idxPath, base, {
          NOTES_DIR: f.nd(["a", "b", "c"]),
          REINDEX_PRUNE_LABELS: "a,c",
        });
        const keys = indexKeys(f.idxPath);
        assert.ok(keys.includes("a/a1.md"), "대상 라벨 a 보존");
        assert.ok(keys.includes("c/c1.md"), "부재 라벨 c 보존");
        assert.match(stdout, /a.*정리하지 않았/, "대상 라벨 무시 사유");
        assert.match(stdout, /c.*정리하지 않았/, "부재 라벨 무시 사유");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("손상 색인 방어: folder 필드 없는 엔트리는 undefined 노출 없이 자가 치유된다", async () => {
    // 정상 업그레이드 경로로는 생기지 않는 손상·수기 편집 엣지(구현 리뷰 D-1) — 기존
    // 프루닝의 자가 치유(스캔 미매칭 키 삭제)를 회귀 없이 유지하는지 고정한다.
    const f = makePruneFixture();
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        const idx = JSON.parse(fs.readFileSync(f.idxPath, "utf8"));
        idx.files["ghost/old.md"] = { hash: "deadbeef", chunks: [], linksOut: [] }; // folder 없음 + 대응 파일 없음
        fs.writeFileSync(f.idxPath, JSON.stringify(idx));
        const { stdout } = await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        assert.ok(!indexKeys(f.idxPath).includes("ghost/old.md"), "미매칭 folderless 엔트리 자가 치유(삭제)");
        assert.doesNotMatch(stdout, /undefined/, "사용자 안내에 undefined 노출 금지");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-9: 색인에 없는 라벨은 안내, 빈 값은 조용한 no-op이다", async () => {
    const f = makePruneFixture();
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]) });
        const r1 = await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]), REINDEX_PRUNE_LABELS: "x" });
        assert.match(r1.stdout, /x.*색인에 없어요/, "미지 라벨 안내");
        assert.equal(indexKeys(f.idxPath).length, 3, "아무것도 제거되지 않음");
        const r2 = await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd(["a", "b", "c"]), REINDEX_PRUNE_LABELS: "" });
        assert.doesNotMatch(r2.stdout, /색인에 없어요|정리/, "빈 값은 조용한 no-op");
        assert.equal(indexKeys(f.idxPath).length, 3);
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });
});

// ── specs/021 — 색인 저장 성능 (FR-1~3, AC-1~5) ─────────────────────────────
//
// AC-1·2는 저장 횟수 계측이 필요해 reindex CLI 대신 카운터(_saveRunCountForTest)를
// 출력하는 node -e 프로브를 쓴다(같은 reindex() 경로). AC-3은 CLI 그대로 —
// 마커 실패 스텁 + BRAIN_CONCURRENCY=1 + EMBED_RETRIES=1로 결정화(스펙 AC-3).

async function runSaveProbe(
  base: string,
  env: Record<string, string | undefined>,
): Promise<{ files: number; saves: number }> {
  const script = [
    `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
    `  const r = await m.reindex();`,
    `  process.stdout.write(JSON.stringify({ files: r.files, saves: m._saveRunCountForTest() }));`,
    `}).catch((e) => { console.error(e); process.exit(1); });`,
  ].join("\n");
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    EMBEDDINGS_URL: base,
    EMBEDDINGS_KEY: "test-key",
    EMBED_RETRIES: "1",
    BRAIN_BATCH: "1", // 파일 1개 = 배치 1개 — 배치 수를 결정적으로
  };
  delete childEnv.NOTES_DIR;
  delete childEnv.BRAIN_SAVE_INTERVAL;
  for (const [k, v] of Object.entries(env)) if (v !== undefined) childEnv[k] = v;
  const { stdout } = await execFileP("node", ["--import", "tsx/esm", "-e", script], {
    cwd: REPO_ROOT,
    env: childEnv,
    encoding: "utf8",
  });
  return JSON.parse(stdout);
}

function makeBatchFixture(n: number): { root: string; idxPath: string; nd: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-save-"));
  const idxPath = path.join(root, "index.json");
  fs.mkdirSync(path.join(root, "n"));
  for (let i = 0; i < n; i++) fs.writeFileSync(path.join(root, "n", `f${i}.md`), `노트 ${i}의 짧은 내용입니다`);
  return { root, idxPath, nd: `n=${path.join(root, "n")}` };
}

describe("색인 저장 성능 (021)", () => {
  it("AC-1: 기본 간격에서 저장 횟수가 배치 수(≥8)에 비례하지 않는다(≤2회)", async () => {
    const f = makeBatchFixture(9); // BRAIN_BATCH=1 → 9배치
    try {
      await withEmbedStub(async (base) => {
        const r = await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        assert.equal(r.files, 9, "9파일 = 9배치 색인");
        assert.ok(r.saves <= 2, `저장 ≤2회여야 함(진행 0~1 + 최종 1) — 실제 ${r.saves}회`);
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-2: BRAIN_SAVE_INTERVAL=0이면 배치마다 저장된다(기존 동작 복귀)", async () => {
    const f = makeBatchFixture(9);
    try {
      await withEmbedStub(async (base) => {
        const r = await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath, BRAIN_SAVE_INTERVAL: "0" });
        assert.ok(r.saves >= 9, `배치(9)마다 저장돼야 함 — 실제 ${r.saves}회`);
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-3: 임베딩 실패 중단 시 커밋분이 저장되고, 재실행은 저장된 파일을 재임베딩하지 않는다", async () => {
    const f = makePruneFixture(); // a,b,c 순서로 스캔·배치
    const MARKER = "FAIL-MARKER-021";
    fs.writeFileSync(path.join(f.root, "c", "c1.md"), `# c 노트\n${MARKER} 이 청크에서 실패한다`);
    const stubOpts: { failMarker?: string } = { failMarker: MARKER };
    try {
      await withEmbedStub(async (base, calls) => {
        const env = {
          NOTES_DIR: f.nd(["a", "b", "c"]),
          BRAIN_BATCH: "1",
          BRAIN_CONCURRENCY: "1", // 워커 인터리빙 비결정 제거(스펙 AC-3)
          EMBED_RETRIES: "1",
        };
        let failed = false;
        try {
          await runReindexCli(f.idxPath, base, env);
        } catch {
          failed = true; // CLI 비0 종료
        }
        assert.ok(failed, "마커 배치에서 비0으로 실패해야 함");
        const keys = indexKeys(f.idxPath);
        assert.ok(keys.includes("a/a1.md") && keys.includes("b/b1.md"), "커밋분(a·b)이 저장돼 있어야 함");
        assert.ok(!keys.includes("c/c1.md"), "실패 파일은 미커밋");
        stubOpts.failMarker = undefined; // 스텁 정상화
        const before = calls();
        await runReindexCli(f.idxPath, base, env);
        assert.equal(calls() - before, 1, "재실행은 남은 파일(c, 1배치)만 임베딩");
        assert.ok(indexKeys(f.idxPath).includes("c/c1.md"), "재실행으로 완결");
      }, stubOpts);
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-4: 최종 색인 내용은 스로틀과 무관하게 동일하다", async () => {
    const f0 = makeBatchFixture(5);
    const f1 = makeBatchFixture(5);
    try {
      await withEmbedStub(async (base) => {
        await runSaveProbe(base, { NOTES_DIR: f0.nd, BRAIN_INDEX: f0.idxPath, BRAIN_SAVE_INTERVAL: "0" });
        await runSaveProbe(base, { NOTES_DIR: f1.nd, BRAIN_INDEX: f1.idxPath });
        const shape = (p: string) => {
          const idx = JSON.parse(fs.readFileSync(p, "utf8"));
          return Object.entries(idx.files)
            .map(([k, v]: [string, any]) => `${k}:${v.chunks.length}`)
            .sort();
        };
        assert.deepEqual(shape(f0.idxPath), shape(f1.idxPath), "파일·청크 집합 동일");
      });
    } finally {
      fs.rmSync(f0.root, { recursive: true, force: true });
      fs.rmSync(f1.root, { recursive: true, force: true });
    }
  });
});

// ── specs/022 — 색인 쓰기 위생: 무변경 말미 저장 생략 (FR-1·2, AC-1~4) ──────
//
// 저장 카운터는 021 하니스(runSaveProbe — 자식 프로세스 + _saveRunCountForTest)를
// 재사용한다. AC-1은 두 자식 프로세스: 첫 프로세스가 색인을 만들고, 두 번째(카운터
// 0에서 시작)가 무변경 재색인 → saves===0. 벽시계 의존 없음(결정적 상태·카운터).

describe("색인 쓰기 위생 (022)", () => {
  it("AC-1: 무변경 재색인은 저장 0회 — 색인 파일 불변", async () => {
    const f = makeBatchFixture(3);
    try {
      await withEmbedStub(async (base) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        const before = fs.statSync(f.idxPath);
        const contentBefore = fs.readFileSync(f.idxPath, "utf8");
        const r = await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        assert.equal(r.saves, 0, "무변경 → 말미 저장 생략");
        const after = fs.statSync(f.idxPath);
        assert.equal(before.mtimeMs, after.mtimeMs, "색인 파일 mtime 불변");
        assert.equal(contentBefore, fs.readFileSync(f.idxPath, "utf8"), "색인 파일 내용 바이트 불변");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-1b: indexDigest만 없는 구형 v5는 손상 chunk를 버리고 정본에서 재생성한 뒤 안정화한다", async () => {
    const f = makeBatchFixture(2);
    try {
      await withEmbedStub(async (base, calls) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        const idx = JSON.parse(fs.readFileSync(f.idxPath, "utf8"));
        const trustedText = fs.readFileSync(path.join(f.root, "n", "f0.md"), "utf8");
        const corruptText = "X".repeat(trustedText.length);
        idx.files["n/f0.md"].chunks[0].text = corruptText;
        delete idx.indexDigest; // model/dims/vectorDigest는 유효하고 indexDigest만 없는 legacy v5
        fs.writeFileSync(f.idxPath, JSON.stringify(idx));
        const callsBefore = calls();
        const migrated = await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        assert.ok(migrated.saves >= 1, "digest 없는 generation은 Markdown 정본에서 안전 재생성");
        assert.ok(calls() - callsBefore > 0, "Markdown 정본을 재임베딩");
        const sealed = JSON.parse(fs.readFileSync(f.idxPath, "utf8"));
        assert.match(sealed.indexDigest ?? "", /^[0-9a-f]{64}$/, "재생성 generation은 indexDigest 보유");
        assert.equal(sealed.embeddingModel, "text-embedding-3-small", "현재 embedding model stamp 유지");
        assert.equal(sealed.files["n/f0.md"].chunks[0].text, trustedText, "손상 chunk가 아니라 Markdown 정본으로 복구");
        assert.notEqual(sealed.files["n/f0.md"].chunks[0].text, corruptText);
        const stable = await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        assert.equal(stable.saves, 0, "안전 재생성 뒤 무변경 실행은 저장하지 않음");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-2: 파일 내용 변경은 dirty — 저장 발생 + 반영", async () => {
    const f = makeBatchFixture(2);
    try {
      await withEmbedStub(async (base) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        const hashBefore = JSON.parse(fs.readFileSync(f.idxPath, "utf8")).files["n/f0.md"].hash;
        fs.writeFileSync(path.join(f.root, "n", "f0.md"), "바뀐 내용입니다 — dirty 판정 대상");
        const r = await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        assert.ok(r.saves >= 1, `변경 → 저장 발생(실제 ${r.saves}회)`);
        const entry = JSON.parse(fs.readFileSync(f.idxPath, "utf8")).files["n/f0.md"];
        assert.notEqual(entry.hash, hashBefore, "변경 파일의 해시가 갱신됨");
        assert.match(entry.chunks[0].text, /바뀐 내용/, "변경 내용이 색인에 반영됨");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-3: 파일 삭제(프루닝)도 dirty — 키 제거 + 저장 발생", async () => {
    const f = makeBatchFixture(2);
    try {
      await withEmbedStub(async (base) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        fs.rmSync(path.join(f.root, "n", "f1.md"));
        const r = await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        assert.ok(r.saves >= 1, "삭제 → 저장 발생");
        assert.ok(!indexKeys(f.idxPath).includes("n/f1.md"), "삭제 키 반영");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-4: 후퇴 재색인 — 신규 있으면 저장, 무변경 재실행은 저장 0회", async () => {
    const f = makeBatchFixture(2);
    try {
      await withEmbedStub(async (base) => {
        const env = { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath, REINDEX_FALLBACK: "1" };
        const r1 = await runSaveProbe(base, env);
        assert.ok(r1.saves >= 1, "첫 후퇴 재색인(신규 커밋) → 저장");
        const r2 = await runSaveProbe(base, env);
        assert.equal(r2.saves, 0, "후퇴 + 무변경 → 삭제 보류 + 커밋 없음 → clean");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });
});

// ── specs/023 — 색인 포맷 v5: 벡터 바이너리 사이드카 (FR-1~5, AC-1~9) ───────

function readSidecarHeaderT(p: string): { magic: string; dims: number; count: number; size: number } {
  const buf = fs.readFileSync(p);
  return { magic: buf.toString("ascii", 0, 4), dims: buf.readUInt32LE(4), count: buf.readUInt32LE(8), size: buf.length };
}
function vecFiles(idxPath: string): string[] {
  const dir = path.dirname(idxPath);
  const prefix = `${path.basename(idxPath)}.vec-`;
  return fs.readdirSync(dir).filter((n) => n.startsWith(prefix) && !n.includes(".tmp-"));
}
function diskJson(idxPath: string): any {
  return JSON.parse(fs.readFileSync(idxPath, "utf8"));
}

function runSidecarDigestRecoveryProbe(
  mode: "same-length-flip" | "legacy-no-digest" | "nonfinite-nan" | "nonfinite-posinf" | "nonfinite-neginf",
): any {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `lm-sidecar-digest-${mode}-`));
  const notes = path.join(root, "notes");
  const state = path.join(root, "state");
  const idxPath = path.join(state, "index.json");
  const source = path.join(notes, "canonical.md");
  const marker = `PHASE2-SIDECAR-${mode}`;
  const sourceText = `# 정본\n\n${marker} 동일 길이 손상 뒤 Markdown에서 다시 색인할 본문입니다.\n`;
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(state, { recursive: true });
  fs.writeFileSync(source, sourceText);
  const sourceBefore = fs.readFileSync(source);
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: path.join(root, "home"),
    NOTES_DIR: `canonical=${notes}`,
    BRAIN_INDEX: idxPath,
    QUERY_LOG: path.join(state, "query-log.jsonl"),
    EMBEDDINGS_URL: "http://embedding.invalid/v1",
    EMBEDDINGS_MODEL: "fixture-model",
    EMBEDDINGS_KEY: "fixture-key",
    EMBED_RETRIES: "1",
    SOURCE_TEXT: sourceText,
    MARKER: marker,
  };
  try {
    const prepareScript = [
      `(async () => {`,
      `const fs = require("node:fs");`,
      `const crypto = require("node:crypto");`,
      `const m = await import(${JSON.stringify(BRAIN_JS)});`,
      `const text = fs.readFileSync(${JSON.stringify(source)}, "utf8");`,
      `const hash = crypto.createHash("sha256").update(text).digest("hex");`,
      `m.saveIndex({ version: m.loadIndex().version, embeddingModel: "fixture-model", dims: 4, files: {`,
      `  "canonical/canonical.md": { hash, folder: "canonical", chunks: [{ path: "canonical/canonical.md", text, vector: [1, 0, 0, 0] }], linksOut: [] },`,
      `} });`,
      `const disk = JSON.parse(fs.readFileSync(process.env.BRAIN_INDEX, "utf8"));`,
      `process.stdout.write(JSON.stringify({ vectorFile: disk.vectorFile, vectorDigest: disk.vectorDigest ?? null }));`,
      `})().catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    const prepared = JSON.parse(execFileSync("node", ["--import", "tsx/esm", "-e", prepareScript], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: childEnv,
    }));
    const sidecarPath = path.join(state, prepared.vectorFile);
    const sidecarBefore = fs.readFileSync(sidecarPath);
    if (mode === "same-length-flip") {
      const corrupted = Buffer.from(sidecarBefore);
      corrupted[corrupted.length - 1] ^= 0x01; // finite float의 하위 bit만 반전 — 길이·header는 불변
      fs.writeFileSync(sidecarPath, corrupted);
      assert.equal(fs.statSync(sidecarPath).size, sidecarBefore.length, "손상 fixture는 반드시 동일 길이");
    } else if (mode === "legacy-no-digest") {
      const disk = diskJson(idxPath);
      delete disk.vectorDigest; // digest 도입 전 v5 metadata
      delete disk.indexDigest;
      disk.indexDigest = crypto.createHash("sha256").update(JSON.stringify(disk)).digest("hex");
      fs.writeFileSync(idxPath, JSON.stringify(disk));
    } else {
      const corrupted = Buffer.from(sidecarBefore);
      const value = mode === "nonfinite-nan"
        ? Number.NaN
        : mode === "nonfinite-posinf"
          ? Number.POSITIVE_INFINITY
          : Number.NEGATIVE_INFINITY;
      corrupted.writeFloatLE(value, 16);
      fs.writeFileSync(sidecarPath, corrupted);
      const disk = diskJson(idxPath);
      disk.vectorDigest = crypto.createHash("sha256").update(corrupted).digest("hex");
      delete disk.indexDigest;
      disk.indexDigest = crypto.createHash("sha256").update(JSON.stringify(disk)).digest("hex");
      fs.writeFileSync(idxPath, JSON.stringify(disk));
    }

    const recoverScript = [
      `(async () => {`,
      `const fs = require("node:fs");`,
      `const crypto = require("node:crypto");`,
      `const requests = [];`,
      `globalThis.fetch = async (_url, init) => {`,
      `  const input = JSON.parse(String(init?.body ?? "{}")).input ?? [];`,
      `  requests.push(...input.map(String));`,
      `  return { ok: true, status: 200, json: async () => ({ data: input.map((_, index) => ({ index, embedding: [1, 0, 0, 0] })) }) };`,
      `};`,
      `const m = await import(${JSON.stringify(BRAIN_JS)});`,
      `const hits = await m.searchNotes(process.env.MARKER);`,
      `const disk = JSON.parse(fs.readFileSync(process.env.BRAIN_INDEX, "utf8"));`,
      `const sidecar = fs.readFileSync(${JSON.stringify(state)} + "/" + disk.vectorFile);`,
      `const actualDigest = crypto.createHash("sha256").update(sidecar).digest("hex");`,
      `const temps = fs.readdirSync(${JSON.stringify(state)}).filter((name) => name.includes(".tmp-"));`,
      `process.stdout.write(JSON.stringify({`,
      `  hitPaths: hits.map((h) => h.path), hitText: hits.map((h) => h.text).join("\\n"),`,
      `  sourceEmbedded: requests.some((text) => text.includes(process.env.MARKER) && text !== process.env.MARKER),`,
      `  vectorDigest: disk.vectorDigest ?? null, actualDigest, temps,`,
      `}));`,
      `})().catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    const recovered = JSON.parse(execFileSync("node", ["--import", "tsx/esm", "-e", recoverScript], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: childEnv,
    }));
    return {
      preparedDigest: prepared.vectorDigest,
      ...recovered,
      sourceEqual: sourceBefore.equals(fs.readFileSync(source)),
    };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

async function runBrainScript(
  base: string,
  env: Record<string, string>,
  body: string,
): Promise<{ stdout: string; stderr: string }> {
  const script = [
    `import * as fsx from "node:fs";`,
    `import * as pathx from "node:path";`,
    `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
    `const sealIndex = async (idx) => { delete idx.indexDigest; const web = globalThis["cr" + "ypto"]; idx.indexDigest = Buffer.from(await web.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(idx)))).toString("hex"); return idx; };`,
    body,
    `}).catch((e) => { console.error(e); process.exit(1); });`,
  ].join("\n");
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    EMBEDDINGS_URL: base,
    EMBEDDINGS_KEY: "test-key",
    EMBED_RETRIES: "1",
    QUERY_LOG: "/dev/null", // 테스트 검색이 실사용 쿼리 로그(~/.localmind)를 오염시키지 않게(004 분석 신뢰성)
    ...env,
  };
  delete childEnv.REINDEX_FALLBACK;
  const { stdout, stderr } = await execFileP("node", ["--import", "tsx/esm", "-e", script], {
    cwd: REPO_ROOT,
    env: childEnv,
    encoding: "utf8",
  });
  return { stdout, stderr };
}

describe("색인 포맷 v5 — 벡터 사이드카 (023)", () => {
  it("AC-1: v5 디스크 JSON엔 벡터가 없고 slot·사이드카(16B 헤더)가 정확하다", async () => {
    const f = makeBatchFixture(2);
    try {
      await withEmbedStub(async (base) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        const idx = diskJson(f.idxPath);
        assert.equal(idx.version, 5);
        let chunkCount = 0;
        for (const fe of Object.values(idx.files) as any[])
          for (const c of fe.chunks) {
            assert.equal(c.vector, undefined, "디스크 청크에 인라인 벡터 없음");
            assert.equal(typeof c.slot, "number", "slot 참조 존재");
            chunkCount++;
          }
        assert.ok(idx.vectorFile, "vectorFile 기록");
        const h = readSidecarHeaderT(path.join(path.dirname(f.idxPath), idx.vectorFile));
        assert.equal(h.magic, "LMV1");
        assert.equal(h.dims, 4);
        assert.equal(h.count, chunkCount);
        assert.equal(h.size, 16 + chunkCount * 4 * 4, "크기 = 16 + count×dims×4");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-2·4: 별도 프로세스가 디스크(JSON+사이드카)만으로 벡터 복원 + 검색 정상", async () => {
    const f = makeBatchFixture(2);
    try {
      await withEmbedStub(async (base) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        const { stdout } = await runBrainScript(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath }, `
          const idx = m.loadIndex();
          const allVec = Object.values(idx.files).every((fe) => fe.chunks.every((c) => Array.isArray(c.vector) && c.vector.length === 4));
          const hits = await m.searchNotes("노트 내용");
          process.stdout.write(JSON.stringify({ n: Object.keys(idx.files).length, allVec, hitPaths: hits.map((h) => h.path).sort() }));
        `);
        const r = JSON.parse(stdout);
        assert.equal(r.n, 2, "전 항목 로드");
        assert.equal(r.allVec, true, "전 청크 벡터 복원(cosine 가능)");
        assert.deepEqual(r.hitPaths, ["n/f0.md", "n/f1.md"], "저장 전과 동일한 히트 집합(스텁 벡터 동일 → 전 노트 히트)");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-3: 3회 저장 후 사이드카는 2개 이하(keep=2 유예 GC)", async () => {
    const f = makeBatchFixture(2);
    try {
      await withEmbedStub(async (base) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        fs.writeFileSync(path.join(f.root, "n", "f0.md"), "두 번째 저장 유발 내용");
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        fs.writeFileSync(path.join(f.root, "n", "f0.md"), "세 번째 저장 유발 내용");
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        const files = vecFiles(f.idxPath);
        assert.ok(files.length <= 2, `사이드카 ${files.length}개 — keep=2 초과 GC`);
        assert.ok(files.includes(diskJson(f.idxPath).vectorFile), "참조 중인 사이드카는 항상 존재");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-3b: reader 경합(파싱 후 GC·신규 커밋) — 재시도로 복원, 자가 치유 미발생", async () => {
    const f = makeBatchFixture(2);
    try {
      await withEmbedStub(async (base) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        const { stdout, stderr } = await runBrainScript(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath }, `
          const idxPath = process.env.BRAIN_INDEX;
          const raw = JSON.parse(fsx.readFileSync(idxPath, "utf8"));
          const dir = pathx.dirname(idxPath);
          const oldVec = pathx.join(dir, raw.vectorFile);
          const newName = raw.vectorFile + "x"; // 새 generation basename(접두 유지)
          raw.vectorFile = newName;
          const replacement = JSON.stringify(await sealIndex(raw));
          m._setAfterJsonParseHookForTest(() => {
            // 동시 writer 재현: 새 gen 커밋 + 옛 gen GC — reader는 옛 gen 참조를 쥔 상태
            fsx.copyFileSync(oldVec, pathx.join(dir, newName));
            fsx.writeFileSync(idxPath, replacement);
            fsx.rmSync(oldVec);
            m._setAfterJsonParseHookForTest(null); // 재파싱에는 미적용
          });
          m._resetIndexCacheForTest();
          const idx = m.loadIndex();
          const allVec = Object.values(idx.files).every((fe) => fe.chunks.every((c) => Array.isArray(c.vector)));
          process.stdout.write(JSON.stringify({ n: Object.keys(idx.files).length, allVec }));
        `);
        const r = JSON.parse(stdout);
        assert.equal(r.n, 2, "항목 보존(자가 치유로 제거되지 않음)");
        assert.equal(r.allVec, true, "새 generation에서 벡터 복원");
        assert.doesNotMatch(stderr, /자가 치유/, "양성 경합을 자가 치유로 오판하지 않음");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-5: 사이드카 유실·손상 → 영향 파일 재임베딩(자가 치유) + 안내 1회", async () => {
    const f = makeBatchFixture(2);
    try {
      await withEmbedStub(async (base, calls) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        const vec = path.join(path.dirname(f.idxPath), diskJson(f.idxPath).vectorFile);
        fs.rmSync(vec); // 유실(재파싱해도 같은 gen → 재시도 실패 → 자가 치유)
        const before = calls();
        const { stderr } = await runReindexCli(f.idxPath, base, { NOTES_DIR: f.nd });
        assert.ok(calls() - before > 0, "영향 파일 재임베딩");
        assert.equal((stderr.match(/자가 치유/g) ?? []).length, 1, "사유 안내는 1회만(notify-once)");
        const { stdout } = await runBrainScript(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath }, `
          const hits = await m.searchNotes("노트 내용");
          process.stdout.write(JSON.stringify({ hits: hits.length }));
        `);
        assert.ok(JSON.parse(stdout).hits > 0, "치유 후 검색 정상");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-6: 디스크 v4 · 인메모리 v5 — 일반 reload-merge는 legacy generation을 덮지 않고 실패한다", async () => {
    const f = makeBatchFixture(1);
    try {
      await withEmbedStub(async (base) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        const { stdout } = await runBrainScript(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath }, `
          const idx = m.loadIndex(); // v5 인메모리(n/f0.md)
          const legacy = JSON.stringify({
            version: 4, embeddingModel: idx.embeddingModel, dims: 4,
            files: { "ghost/g.md": { hash: "h", folder: "ghost", chunks: [{ path: "ghost/g.md", text: "고스트", vector: [1,0,0,0] }], linksOut: [] } },
          });
          fsx.writeFileSync(process.env.BRAIN_INDEX, legacy);
          let rejected = false;
          let error = "";
          try { m.saveIndex(idx); } catch (e) { rejected = true; error = String(e?.message ?? e); }
          const after = fsx.readFileSync(process.env.BRAIN_INDEX, "utf8");
          process.stdout.write(JSON.stringify({ rejected, unchanged: after === legacy, error, disk: JSON.parse(after) }));
        `);
        const r = JSON.parse(stdout);
        assert.equal(r.rejected, true);
        assert.equal(r.unchanged, true, "검증 불가능한 v4 bytes를 v5로 재봉인하지 않음");
        assert.equal(r.disk.version, 4);
        assert.deepEqual(Object.keys(r.disk.files), ["ghost/g.md"]);
        assert.match(r.error, /색인.*저장|저장.*색인/);
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-7: 두 로드가 각자 다른 파일을 저장해도 양쪽 벡터가 모두 복원 가능(reload-merge)", async () => {
    const f = makeBatchFixture(1);
    try {
      await withEmbedStub(async (base) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        const { stdout } = await runBrainScript(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath }, `
          const a = m.loadIndex();       // 스냅샷 A
          m._resetIndexCacheForTest();
          const b = m.loadIndex();       // 스냅샷 B(별도 객체 — 다중 프로세스 재현, 013 관례)
          b.files["y/b.md"] = { hash: "hb", folder: "y", chunks: [{ path: "y/b.md", text: "비", vector: [0,1,0,0] }], linksOut: [] };
          m.saveIndex(b);                // 디스크: {n/f0, y/b}
          a.files["z/a.md"] = { hash: "ha", folder: "z", chunks: [{ path: "z/a.md", text: "에이", vector: [0,0,1,0] }], linksOut: [] };
          m.saveIndex(a);                // reload-merge가 y/b를 보존해야 함
          m._resetIndexCacheForTest();
          const fin = m.loadIndex();
          const allVec = Object.values(fin.files).every((fe) => fe.chunks.every((c) => Array.isArray(c.vector)));
          process.stdout.write(JSON.stringify({ keys: Object.keys(fin.files).sort(), allVec }));
        `);
        const r = JSON.parse(stdout);
        assert.deepEqual(r.keys, ["n/f0.md", "y/b.md", "z/a.md"], "양쪽 저장분 모두 보존");
        assert.equal(r.allVec, true, "전 벡터 디스크에서 복원 가능");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("Phase 2: reload-merge는 indexDigest 불일치 generation을 stale writer로 재봉인하지 않고 저장을 중단한다", async () => {
    const f = makeBatchFixture(1);
    try {
      await withEmbedStub(async (base) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        const { stdout } = await runBrainScript(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath }, `
          const staleWriter = m.loadIndex();
          const forged = JSON.parse(fsx.readFileSync(process.env.BRAIN_INDEX, "utf8"));
          delete forged.files["n/f0.md"];
          forged.files["forged/ghost.md"] = {
            hash: "forged-hash",
            folder: "forged",
            chunks: [],
            linksOut: [],
          };
          // indexDigest는 의도적으로 갱신하지 않는다. stale writer 저장이 이 손상 generation을
          // 무시하면 삭제된 항목을 부활시킨 뒤 새 valid digest로 laundering할 수 있다.
          const corruptBytes = JSON.stringify(forged);
          fsx.writeFileSync(process.env.BRAIN_INDEX, corruptBytes);
          let rejected = false;
          let error = "";
          try { m.saveIndex(staleWriter); } catch (e) { rejected = true; error = String(e?.message ?? e); }
          const afterBytes = fsx.readFileSync(process.env.BRAIN_INDEX, "utf8");
          process.stdout.write(JSON.stringify({ rejected, error, bytesUnchanged: afterBytes === corruptBytes }));
        `);
        const result = JSON.parse(stdout);
        assert.equal(result.rejected, true, "digest가 틀린 disk generation을 관측한 stale writer는 저장을 중단");
        assert.equal(result.bytesUnchanged, true, "손상 generation을 stale 메모리로 덮어 새 digest를 부여하지 않음");
        assert.match(result.error, /색인.*저장|저장.*색인/);
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-8: digest 없는 v4는 chunk/vector를 신뢰하지 않고 Markdown에서 clean reindex한다", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-migrate-"));
    const idxPath = path.join(root, "index.json");
    try {
      fs.mkdirSync(path.join(root, "n"));
      const text = "trusted migration source payload 0000";
      const corruptText = text.replace("trusted", "corrupt");
      assert.equal(corruptText.length, text.length);
      fs.writeFileSync(path.join(root, "n", "m.md"), text);
      const hash = crypto.createHash("sha256").update(text).digest("hex");
      fs.writeFileSync(
        idxPath,
        JSON.stringify({
          version: 4,
          dims: 4,
          files: { "n/m.md": { hash, folder: "n", chunks: [{ path: "n/m.md", text: corruptText, vector: [1, 0, 0, 0] }], linksOut: [] } },
        }),
      );
      await withEmbedStub(async (base, calls) => {
        const before = calls();
        const { stderr } = await runReindexCli(idxPath, base, { NOTES_DIR: `n=${path.join(root, "n")}` });
        assert.ok(calls() - before > 0, "검증 불가능한 legacy 파생물을 버리고 재임베딩");
        assert.match(stderr, /처음부터 다시 색인/, "안전 재생성 안내");
        const idx = diskJson(idxPath);
        assert.equal(idx.version, 5, "v5로 영속");
        assert.equal(idx.files["n/m.md"].chunks[0].slot, 0, "slot 참조");
        assert.equal(idx.files["n/m.md"].chunks[0].text, text, "Markdown 정본 text로 복구");
        assert.notEqual(idx.files["n/m.md"].chunks[0].text, corruptText);
        assert.ok(idx.vectorFile && fs.existsSync(path.join(root, idx.vectorFile)), "사이드카 생성");
        const h = readSidecarHeaderT(path.join(root, idx.vectorFile));
        assert.equal(h.count, 1);
        const { stdout } = await runBrainScript(base, { NOTES_DIR: `n=${path.join(root, "n")}`, BRAIN_INDEX: idxPath }, `
          const hits = await m.searchNotes("마이그레이션 노트");
          process.stdout.write(JSON.stringify({ hitPaths: hits.map((h) => h.path) }));
        `);
        assert.deepEqual(JSON.parse(stdout).hitPaths, ["n/m.md"], "마이그레이션 후 검색 정상");
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("검증 불가능한 legacy generation의 canonical root를 열 수 없으면 승격 없이 reindex가 실패한다", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-migrate-unavailable-"));
    const idxPath = path.join(root, "index.json");
    const blockedRoot = path.join(root, "not-a-directory");
    fs.writeFileSync(blockedRoot, "regular file blocks canonical root");
    fs.writeFileSync(idxPath, JSON.stringify({
      version: 4,
      dims: 4,
      files: { "n/m.md": { hash: "legacy-hash", folder: "n", chunks: [{ path: "n/m.md", text: "untrusted legacy chunk", vector: [1, 0, 0, 0] }], linksOut: [] } },
    }));
    const before = fs.readFileSync(idxPath);
    try {
      await withEmbedStub(async (base) => {
        let rejected = false;
        try {
          await runReindexCli(idxPath, base, { NOTES_DIR: `n=${blockedRoot}` });
        } catch {
          rejected = true;
        }
        assert.equal(rejected, true, "canonical root unavailable이면 non-zero여야 함");
        assert.equal(before.equals(fs.readFileSync(idxPath)), true, "검증 불가 legacy bytes를 v5로 승격하면 안 됨");
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("검증 불가능한 legacy generation의 아직 존재하지 않는 canonical root를 만들거나 승격하지 않는다", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-migrate-missing-root-"));
    const idxPath = path.join(root, "index.json");
    const missingRoot = path.join(root, "detached-canonical-root");
    fs.writeFileSync(idxPath, JSON.stringify({
      version: 4,
      dims: 4,
      files: { "n/m.md": { hash: "legacy-hash", folder: "n", chunks: [{ path: "n/m.md", text: "untrusted legacy chunk", vector: [1, 0, 0, 0] }], linksOut: [] } },
    }));
    const before = fs.readFileSync(idxPath);
    try {
      await withEmbedStub(async (base) => {
        let rejected = false;
        try {
          await runReindexCli(idxPath, base, { NOTES_DIR: `n=${missingRoot}` });
        } catch {
          rejected = true;
        }
        assert.equal(rejected, true, "legacy clean rebuild는 missing root를 빈 canonical root로 만들면 안 됨");
        assert.equal(fs.existsSync(missingRoot), false, "unavailable root의 이름을 새로 publish하지 않음");
        assert.equal(before.equals(fs.readFileSync(idxPath)), true, "검증 불가 legacy generation bytes를 보존");
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("legacy clean rebuild의 embedding 중 canonical root가 사라지면 기존 generation을 보존한다", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-migrate-root-loss-"));
    const notes = path.join(root, "notes");
    const moved = path.join(root, "notes-away");
    const idxPath = path.join(root, "index.json");
    const sourceText = "canonical source must remain available until clean rebuild commit";
    fs.mkdirSync(notes, { recursive: true });
    fs.writeFileSync(path.join(notes, "a.md"), sourceText);
    fs.writeFileSync(idxPath, JSON.stringify({
      version: 4,
      embeddingModel: "fixture-model",
      dims: 4,
      files: {
        "notes/a.md": {
          hash: crypto.createHash("sha256").update(sourceText).digest("hex"),
          folder: "notes",
          chunks: [{ path: "notes/a.md", text: "untrusted legacy payload", vector: [1, 0, 0, 0] }],
          linksOut: [],
        },
      },
    }));
    const before = fs.readFileSync(idxPath);
    let movedOnce = false;
    try {
      await withEmbedStub(async (base) => {
        let rejected = false;
        let error = "";
        try {
          await runReindexCli(idxPath, base, { NOTES_DIR: `notes=${notes}`, EMBED_RETRIES: "1" });
        } catch (cause) {
          rejected = true;
          error = String((cause as Error).message ?? cause);
        }
        const after = fs.readFileSync(idxPath);
        assert.equal(rejected, true, "scan 뒤 root가 사라진 clean rebuild는 non-zero여야 함");
        assert.equal(fs.existsSync(notes), false, "commit 시점에는 configured root가 unavailable인 대조군");
        assert.equal(before.equals(after), true, "기존 legacy generation bytes를 빈 v5로 승격하면 안 됨");
        assert.equal(JSON.parse(after.toString("utf8")).version, 4);
        assert.doesNotMatch(error, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "오류에 canonical 절대경로를 노출하지 않음");
      }, {
        onRequest: () => {
          if (movedOnce) return;
          fs.renameSync(notes, moved);
          movedOnce = true;
        },
      });
      assert.equal(movedOnce, true, "실제 embedding request 중 root-loss hook 도달");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("legacy clean rebuild는 nested canonical scan 실패를 빈 scan으로 승격하지 않고 bytes를 보존한다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-migrate-nested-scan-failure-"));
    const notes = path.join(root, "notes");
    const nested = path.join(notes, "nested");
    const indexPath = path.join(root, "index.json");
    fs.mkdirSync(nested, { recursive: true });
    const source = path.join(nested, "victim.md");
    fs.writeFileSync(source, "nested canonical source must survive scan failure");
    fs.writeFileSync(indexPath, JSON.stringify({
      version: 4,
      embeddingModel: "fixture-model",
      dims: 2,
      files: {
        "notes/nested/victim.md": {
          hash: "legacy-untrusted-hash",
          folder: "notes",
          chunks: [{ path: "notes/nested/victim.md", text: "untrusted legacy chunk", vector: [1, 0] }],
          linksOut: [],
        },
      },
    }));
    const script = [
      `import fs from "node:fs";`,
      `import path from "node:path";`,
      `const nested = ${JSON.stringify(nested)};`,
      `const originalReaddirSync = fs.readdirSync;`,
      `fs.readdirSync = function(target, ...args) {`,
      `  if (path.resolve(String(target)) === path.resolve(nested)) {`,
      `    const error = new Error("synthetic nested EACCES"); error.code = "EACCES"; throw error;`,
      `  }`,
      `  return originalReaddirSync.call(this, target, ...args);`,
      `};`,
      `globalThis.fetch = async () => { throw new Error("embedding must not run after incomplete scan"); };`,
      `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
      `  const before = fs.readFileSync(process.env.BRAIN_INDEX);`,
      `  let rejected = false, error = "";`,
      `  try { await m.reindex(); } catch (e) { rejected = true; error = String(e?.message ?? e); }`,
      `  const after = fs.readFileSync(process.env.BRAIN_INDEX);`,
      `  fs.readdirSync = originalReaddirSync;`,
      `  process.stdout.write(JSON.stringify({`,
      `    rejected, error, bytesUnchanged: before.equals(after),`,
      `    version: JSON.parse(after).version, sourceExists: fs.existsSync(${JSON.stringify(source)}),`,
      `  }));`,
      `}).catch((e) => { fs.readdirSync = originalReaddirSync; console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const result = JSON.parse(execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 5_000,
        env: {
          ...process.env,
          HOME: path.join(root, "home"),
          NOTES_DIR: `notes=${notes}`,
          BRAIN_INDEX: indexPath,
          QUERY_LOG: path.join(root, "query-log.jsonl"),
          EMBEDDINGS_MODEL: "fixture-model",
          EMBEDDINGS_KEY: "fixture-key",
          EMBED_RETRIES: "1",
        },
      }));
      assert.equal(result.rejected, true, "불완전한 nested scan은 non-zero여야 함");
      assert.equal(result.bytesUnchanged, true, "legacy generation을 빈 v5로 승격하면 안 됨");
      assert.equal(result.version, 4);
      assert.equal(result.sourceExists, true);
      assert.match(result.error, /스캔|폴더|색인/);
      assert.doesNotMatch(result.error, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "오류에 canonical 절대경로를 노출하지 않음");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("정상 v5 reindex도 nested canonical scan 실패에서 기존 generation을 prune하지 않는다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-v5-nested-scan-failure-"));
    const notes = path.join(root, "notes");
    const nested = path.join(notes, "nested");
    const indexPath = path.join(root, "index.json");
    fs.mkdirSync(nested, { recursive: true });
    const source = path.join(nested, "victim.md");
    const sourceText = "trusted v5 canonical source must survive scan failure";
    fs.writeFileSync(source, sourceText);
    const script = [
      `import fs from "node:fs";`,
      `import path from "node:path";`,
      `globalThis.fetch = async () => { throw new Error("embedding must not run after incomplete scan"); };`,
      `import(${JSON.stringify(BRAIN_JS)}).then(async (m) => {`,
      `  const sourceText = ${JSON.stringify(sourceText)};`,
      `  const sourceHash = Buffer.from(await globalThis["cr" + "ypto"].subtle.digest("SHA-256", new TextEncoder().encode(sourceText))).toString("hex");`,
      `  m.saveIndex({ version: m.loadIndex().version, embeddingModel: "fixture-model", dims: 2, files: {`,
      `    "notes/nested/victim.md": {`,
      `      hash: sourceHash, folder: "notes",`,
      `      chunks: [{ path: "notes/nested/victim.md", text: sourceText, vector: [1, 0] }], linksOut: [],`,
      `    },`,
      `  } });`,
      `  const before = fs.readFileSync(process.env.BRAIN_INDEX);`,
      `  const originalReaddirSync = fs.readdirSync;`,
      `  fs.readdirSync = function(target, ...args) {`,
      `    if (path.resolve(String(target)) === path.resolve(${JSON.stringify(nested)})) {`,
      `      const error = new Error("synthetic nested EACCES"); error.code = "EACCES"; throw error;`,
      `    }`,
      `    return originalReaddirSync.call(this, target, ...args);`,
      `  };`,
      `  let rejected = false, error = "";`,
      `  try { await m.reindex(); } catch (e) { rejected = true; error = String(e?.message ?? e); }`,
      `  fs.readdirSync = originalReaddirSync;`,
      `  const after = fs.readFileSync(process.env.BRAIN_INDEX);`,
      `  const disk = JSON.parse(after);`,
      `  process.stdout.write(JSON.stringify({`,
      `    rejected, error, bytesUnchanged: before.equals(after), version: disk.version,`,
      `    retained: Object.hasOwn(disk.files, "notes/nested/victim.md"), sourceExists: fs.existsSync(${JSON.stringify(source)}),`,
      `  }));`,
      `}).catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const result = JSON.parse(execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 5_000,
        env: {
          ...process.env,
          HOME: path.join(root, "home"),
          NOTES_DIR: `notes=${notes}`,
          BRAIN_INDEX: indexPath,
          QUERY_LOG: path.join(root, "query-log.jsonl"),
          EMBEDDINGS_MODEL: "fixture-model",
          EMBEDDINGS_KEY: "fixture-key",
          EMBED_RETRIES: "1",
        },
      }));
      assert.equal(result.rejected, true);
      assert.equal(result.bytesUnchanged, true);
      assert.equal(result.version, 5);
      assert.equal(result.retained, true);
      assert.equal(result.sourceExists, true);
      assert.match(result.error, /스캔|폴더|색인/);
      assert.doesNotMatch(result.error, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("사이드카 유실 수복: 캐시 보유 프로세스의 재색인이 재임베딩 0건으로 디스크를 수복한다", async () => {
    // codex 교차 리뷰 차단 결함 재현 — 장수 MCP 프로세스: loadIndex 캐시가 살아 있는 채
    // 사이드카가 지워지면, 같은 프로세스 재색인은 캐시(벡터 보유)를 보므로 자가 치유
    // 경로를 타지 않는다. dirty의 sidecarMissing 수복이 없으면 디스크가 깨진 채 남아
    // 다음 프로세스가 전량 재임베딩을 문다.
    const f = makeBatchFixture(2);
    try {
      await withEmbedStub(async (base, calls) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        const before = calls();
        const { stdout } = await runBrainScript(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath }, `
          m.loadIndex(); // 캐시 하이드레이션(벡터 보유)
          const vec = pathx.join(pathx.dirname(process.env.BRAIN_INDEX), JSON.parse(fsx.readFileSync(process.env.BRAIN_INDEX, "utf8")).vectorFile);
          fsx.rmSync(vec); // 사이드카 유실 — 캐시는 그대로
          const r = await m.reindex();
          const disk = JSON.parse(fsx.readFileSync(process.env.BRAIN_INDEX, "utf8"));
          const restored = disk.vectorFile && fsx.existsSync(pathx.join(pathx.dirname(process.env.BRAIN_INDEX), disk.vectorFile));
          process.stdout.write(JSON.stringify({ files: r.files, restored }));
        `);
        const r = JSON.parse(stdout);
        assert.equal(calls() - before, 0, "재임베딩 0건(메모리 벡터로 수복)");
        assert.equal(r.files, 2, "항목 무손실");
        assert.equal(r.restored, true, "사이드카 디스크 수복");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("사이드카 값 왕복: distinct 벡터가 slot 순서대로 정확히 복원된다", async () => {
    // 균일 스텁([1,0,0,0])만으로는 slot 오프셋·aliasing·엔디안 회귀를 못 잡는다(리뷰
    // 경미-4). float32로 정확히 표현되는 값(2^-k 배수)이라 무허용오차 비교가 결정적.
    const f = makeBatchFixture(1);
    try {
      await withEmbedStub(async (base) => {
        const { stdout } = await runBrainScript(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath }, `
          const idx = m.loadIndex();
          idx.dims = 4;
          idx.files["a/x.md"] = { hash: "h1", folder: "a", chunks: [
            { path: "a/x.md", text: "하나", vector: [0.125, -1.5, 3.25, 42] },
            { path: "a/x.md", text: "둘", vector: [9.75, 0.0625, -2.25, 7] },
          ], linksOut: [] };
          idx.files["b/y.md"] = { hash: "h2", folder: "b", chunks: [
            { path: "b/y.md", text: "셋", vector: [5.5, 6.5, -7.5, 8.5] },
          ], linksOut: [] };
          m.saveIndex(idx);
          m._resetIndexCacheForTest();
          const fin = m.loadIndex();
          process.stdout.write(JSON.stringify({
            a: fin.files["a/x.md"].chunks.map((c) => c.vector),
            b: fin.files["b/y.md"].chunks.map((c) => c.vector),
          }));
        `);
        const r = JSON.parse(stdout);
        assert.deepEqual(r.a, [[0.125, -1.5, 3.25, 42], [9.75, 0.0625, -2.25, 7]], "청크별 distinct 벡터 정확 복원");
        assert.deepEqual(r.b, [[5.5, 6.5, -7.5, 8.5]], "파일 간 slot 매핑 정확");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("사이드카 truncate 수복: 캐시 보유 프로세스의 재색인이 크기 불일치를 감지해 수복한다", async () => {
    const f = makeBatchFixture(2);
    try {
      await withEmbedStub(async (base, calls) => {
        await runSaveProbe(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath });
        const before = calls();
        const { stdout } = await runBrainScript(base, { NOTES_DIR: f.nd, BRAIN_INDEX: f.idxPath }, `
          m.loadIndex(); // 캐시 하이드레이션
          const vec = pathx.join(pathx.dirname(process.env.BRAIN_INDEX), JSON.parse(fsx.readFileSync(process.env.BRAIN_INDEX, "utf8")).vectorFile);
          fsx.truncateSync(vec, 8); // 부분 손상 — 파일은 존재
          await m.reindex();
          const disk = JSON.parse(fsx.readFileSync(process.env.BRAIN_INDEX, "utf8"));
          const p2 = pathx.join(pathx.dirname(process.env.BRAIN_INDEX), disk.vectorFile);
          process.stdout.write(JSON.stringify({ size: fsx.statSync(p2).size }));
        `);
        assert.equal(calls() - before, 0, "재임베딩 0건(메모리 벡터로 수복)");
        assert.equal(JSON.parse(stdout).size, 16 + 2 * 4 * 4, "수복된 사이드카 크기 정상(2파일×1청크)");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-9: 손상 v4 색인은 기존 관례대로 전량 재빌드(재임베딩) 후 v5", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-migrate-bad-"));
    const idxPath = path.join(root, "index.json");
    try {
      fs.mkdirSync(path.join(root, "n"));
      fs.writeFileSync(path.join(root, "n", "m.md"), "재빌드 대상 노트입니다");
      fs.writeFileSync(idxPath, "not json {{{");
      await withEmbedStub(async (base, calls) => {
        const before = calls();
        await runReindexCli(idxPath, base, { NOTES_DIR: `n=${path.join(root, "n")}` });
        assert.ok(calls() - before > 0, "전량 재빌드(재임베딩)");
        assert.equal(diskJson(idxPath).version, 5, "최종 포맷 v5");
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("Phase 2 sidecar digest 무결성", () => {
  it("새 v5 JSON이 sidecar 전체 payload의 deterministic SHA-256 digest를 bind한다", () => {
    const r = runSidecarDigestRecoveryProbe("same-length-flip");
    assert.match(r.preparedDigest ?? "", /^[0-9a-f]{64}$/);
    assert.equal(r.vectorDigest, r.actualDigest, "복구 저장 metadata가 새 sidecar 전체 bytes와 일치");
  });

  it("동일 길이 finite bit flip을 hydrate 전에 거부하고 Markdown에서 재임베딩해 fresh search를 복구한다", () => {
    const r = runSidecarDigestRecoveryProbe("same-length-flip");
    assert.equal(r.sourceEmbedded, true, "손상된 파생 벡터를 재사용하지 않고 source를 다시 임베딩");
    assert.deepEqual(r.hitPaths, ["canonical/canonical.md"]);
    assert.match(r.hitText, /PHASE2-SIDECAR-same-length-flip/);
    assert.equal(r.sourceEqual, true, "Markdown 정본 byte 불변");
    assert.deepEqual(r.temps, [], "성공 뒤 JSON·sidecar temp 잔여 없음");
  });

  it("digest 없는 legacy v5는 신뢰하지 않고 정본에서 무손실 재생성한다", () => {
    const r = runSidecarDigestRecoveryProbe("legacy-no-digest");
    assert.equal(r.sourceEmbedded, true, "legacy 무검증 sidecar를 source에서 재생성");
    assert.deepEqual(r.hitPaths, ["canonical/canonical.md"]);
    assert.equal(r.sourceEqual, true, "legacy 재생성도 Markdown 정본 byte 불변");
    assert.match(r.vectorDigest ?? "", /^[0-9a-f]{64}$/);
    assert.equal(r.vectorDigest, r.actualDigest);
    assert.deepEqual(r.temps, []);
  });

  for (const mode of ["nonfinite-nan", "nonfinite-posinf", "nonfinite-neginf"] as const) {
    it(`valid digest로 봉인된 ${mode} sidecar도 hydrate 전에 거부하고 정본에서 복구한다`, () => {
      const r = runSidecarDigestRecoveryProbe(mode);
      assert.equal(r.sourceEmbedded, true, "비유한 sidecar vector를 재사용하지 않아야 함");
      assert.deepEqual(r.hitPaths, ["canonical/canonical.md"]);
      assert.match(r.hitText, new RegExp(`PHASE2-SIDECAR-${mode}`));
      assert.equal(r.sourceEqual, true);
      assert.equal(r.vectorDigest, r.actualDigest, "복구 generation digest 정합");
      assert.deepEqual(r.temps, []);
    });
  }

  it("digest-valid same-length forged chunk도 Markdown 정본에서 재생성하고 위조 text를 반환하지 않는다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-phase2-json-digest-"));
    const notes = path.join(root, "notes");
    const state = path.join(root, "state");
    const indexPath = path.join(state, "index.json");
    fs.mkdirSync(notes, { recursive: true });
    fs.mkdirSync(state, { recursive: true });
    const trustedText = "trusted source revision payload 0000";
    const corruptText = trustedText.replace("trusted", "corrupt");
    assert.equal(corruptText.length, trustedText.length, "same-length corruption fixture");
    const sourcePath = path.join(notes, "victim.md");
    fs.writeFileSync(sourcePath, trustedText);
    const script = [
      `(async () => {`,
      `const fs = require("node:fs");`,
      `const crypto = require("node:crypto");`,
      `const brain = await import(${JSON.stringify(BRAIN_JS)});`,
      `const sha = (text) => crypto.createHash("sha256").update(text).digest("hex");`,
      `brain.saveIndex({ version: brain.loadIndex().version, embeddingModel: "fixture-model", dims: 2, files: {`,
      `  "notes/victim.md": { hash: sha(process.env.TRUSTED_TEXT), folder: "notes", chunks: [{ path: "notes/victim.md", text: process.env.TRUSTED_TEXT, vector: [1, 0] }], linksOut: [] },`,
      `} });`,
      `const damaged = JSON.parse(fs.readFileSync(process.env.BRAIN_INDEX, "utf8"));`,
      `damaged.files["notes/victim.md"].chunks[0].text = process.env.CORRUPT_TEXT;`,
      `delete damaged.indexDigest;`,
      `damaged.indexDigest = sha(JSON.stringify(damaged));`,
      `fs.writeFileSync(process.env.BRAIN_INDEX, JSON.stringify(damaged));`,
      `let sourceEmbedded = false;`,
      `globalThis.fetch = async (_url, init) => {`,
      `  const input = JSON.parse(String(init?.body ?? "{}")).input ?? [];`,
      `  if (input.includes(process.env.TRUSTED_TEXT)) sourceEmbedded = true;`,
      `  return { ok: true, status: 200, json: async () => ({ data: input.map((_, index) => ({ index, embedding: [1, 0] })) }) };`,
      `};`,
      `brain._resetIndexCacheForTest();`,
      `const hits = await brain.searchNotes("JSON integrity query");`,
      `const healed = JSON.parse(fs.readFileSync(process.env.BRAIN_INDEX, "utf8"));`,
      `process.stdout.write(JSON.stringify({ sourceEmbedded, hits, indexDigest: healed.indexDigest, healedText: healed.files["notes/victim.md"]?.chunks?.[0]?.text }));`,
      `})().catch((e) => { console.error(e); process.exit(1); });`,
    ].join("\n");
    try {
      const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          HOME: path.join(root, "home"),
          NOTES_DIR: `notes=${notes}`,
          BRAIN_INDEX: indexPath,
          QUERY_LOG: "/dev/null",
          EMBEDDINGS_MODEL: "fixture-model",
          EMBEDDINGS_URL: "http://embedding.invalid/v1",
          EMBEDDINGS_KEY: "fixture-key",
          EMBED_RETRIES: "1",
          TRUSTED_TEXT: trustedText,
          CORRUPT_TEXT: corruptText,
        },
      });
      const r = JSON.parse(out);
      assert.equal(r.sourceEmbedded, true, "손상 JSON을 재사용하지 않고 source를 재임베딩해야 함");
      assert.equal(r.hits[0]?.text, trustedText);
      assert.equal(r.healedText, trustedText);
      assert.match(r.indexDigest ?? "", /^[0-9a-f]{64}$/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

// ── specs/024 — 라벨↔경로 바인딩 (FR-1~4, AC-1~8) ───────────────────────────
//
// 재바인딩 재현은 기존 관례 그대로: 같은 BRAIN_INDEX에 NOTES_DIR의 경로만 바꿔
// 자식 프로세스(runReindexCli)를 다시 실행한다. 안내 문구는 reindex CLI stdout.

function makeRebindFixture(): { root: string; idxPath: string; dirA: string; dirB: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-rebind-"));
  const idxPath = path.join(root, "index.json");
  const dirA = path.join(root, "locA");
  const dirB = path.join(root, "locB");
  fs.mkdirSync(dirA);
  fs.mkdirSync(dirB);
  fs.writeFileSync(path.join(dirA, "old-only.md"), "이전 위치에만 있는 노트");
  fs.writeFileSync(path.join(dirB, "new-only.md"), "새 위치에만 있는 노트"); // relpath 비중첩(AC-1)
  return { root, idxPath, dirA, dirB };
}

function diskBindings(idxPath: string): Record<string, string> | undefined {
  return diskJson(idxPath).bindings;
}

describe("라벨↔경로 바인딩 (024)", () => {
  it("AC-1: 재바인딩은 이전 위치 항목을 보존하고 수락 명령을 안내한다", async () => {
    const f = makeRebindFixture();
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirA}` });
        assert.equal(diskBindings(f.idxPath)?.a, fs.realpathSync(f.dirA), "바인딩 기록(realpath)");
        const { stdout } = await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirB}` });
        const keys = indexKeys(f.idxPath);
        assert.ok(keys.includes("a/old-only.md"), "이전 위치 항목 보존(프루닝 안 됨)");
        assert.ok(keys.includes("a/new-only.md"), "새 위치 파일은 같은 라벨로 추가");
        assert.match(stdout, /a.*위치가 바뀌/, "재바인딩 안내(라벨·경로)");
        assert.ok(stdout.includes(fs.realpathSync(f.dirA)), "기록 경로 표기");
        assert.ok(stdout.includes(fs.realpathSync(f.dirB)), "현재 경로 표기");
        assert.match(stdout, /1건.*보존/, "보존 건수 안내");
        assert.match(stdout, /REINDEX_ADOPT_REBIND=a/, "수락 명령 안내");
        assert.equal(diskBindings(f.idxPath)?.a, fs.realpathSync(f.dirA), "보존 중엔 바인딩 미갱신(반복 안내 근거)");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-2: 경로 불변 라벨의 파일 삭제는 기존대로 그 키만 프루닝(오판 없음)", async () => {
    const f = makeRebindFixture();
    try {
      await withEmbedStub(async (base) => {
        fs.writeFileSync(path.join(f.dirA, "second.md"), "두 번째 노트");
        await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirA}` });
        fs.rmSync(path.join(f.dirA, "second.md"));
        const { stdout } = await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirA}` });
        const keys = indexKeys(f.idxPath);
        assert.ok(!keys.includes("a/second.md"), "삭제 키 프루닝");
        assert.ok(keys.includes("a/old-only.md"), "나머지 보존");
        assert.doesNotMatch(stdout, /위치가 바뀌/, "재바인딩 오판 없음");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-3: 바인딩 없는 기존 색인(구버전)은 오판 없이 현재 경로를 기록한다", async () => {
    const f = makeRebindFixture();
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirA}` });
        const idx = diskJson(f.idxPath);
        delete idx.bindings; // 구버전 색인 재현
        fs.writeFileSync(f.idxPath, JSON.stringify(idx));
        const before = indexKeys(f.idxPath).sort();
        const { stdout } = await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirA}` });
        assert.deepEqual(indexKeys(f.idxPath).sort(), before, "항목 불변(보존 오판·프루닝 없음)");
        assert.doesNotMatch(stdout, /위치가 바뀌/, "재바인딩 아님");
        assert.equal(diskBindings(f.idxPath)?.a, fs.realpathSync(f.dirA), "현재 경로 기록");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-4: REINDEX_ADOPT_REBIND 수락 — 옛 항목 제거 + 바인딩 갱신 + 안내 종료", async () => {
    const f = makeRebindFixture();
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirA}` });
        await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirB}` }); // 재바인딩(보존)
        const { stdout } = await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirB}`, REINDEX_ADOPT_REBIND: "a" });
        const keys = indexKeys(f.idxPath);
        assert.ok(!keys.includes("a/old-only.md"), "옛 위치 항목(seen 아님) 제거");
        assert.ok(keys.includes("a/new-only.md"), "새 위치 항목 유지");
        assert.match(stdout, /a.*수락/, "수락 결과 안내");
        assert.equal(diskBindings(f.idxPath)?.a, fs.realpathSync(f.dirB), "바인딩 갱신");
        const again = await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirB}` });
        assert.doesNotMatch(again.stdout, /위치가 바뀌/, "수락 후 재바인딩 안내 종료");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-5: 비재바인딩·미지 라벨 수락 지정은 무시 + 사유 안내, 빈 값은 no-op", async () => {
    const f = makeRebindFixture();
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirA}` });
        const before = indexKeys(f.idxPath).sort();
        const r1 = await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirA}`, REINDEX_ADOPT_REBIND: " a , x ," });
        assert.deepEqual(indexKeys(f.idxPath).sort(), before, "아무것도 제거되지 않음");
        assert.match(r1.stdout, /a.*수락할 것이 없/, "비재바인딩 라벨 사유");
        assert.match(r1.stdout, /x.*수락할 것이 없/, "미지 라벨 사유");
        const r2 = await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirA}`, REINDEX_ADOPT_REBIND: "" });
        assert.doesNotMatch(r2.stdout, /수락/, "빈 값은 조용한 no-op");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-6: 새 경로 미마운트 상태의 수락은 보류 — 무삭제·바인딩 불변·사유 안내", async () => {
    const f = makeRebindFixture();
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirA}` });
        await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirB}` }); // 재바인딩 상태
        fs.rmSync(f.dirB, { recursive: true }); // 미마운트 재현
        const { stdout } = await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirB}`, REINDEX_ADOPT_REBIND: "a" });
        const keys = indexKeys(f.idxPath);
        assert.ok(keys.includes("a/old-only.md") && keys.includes("a/new-only.md"), "어떤 항목도 제거되지 않음");
        assert.equal(diskBindings(f.idxPath)?.a, fs.realpathSync(f.dirA), "바인딩 불변");
        assert.match(stdout, /a.*열 수 없어.*보류/, "보류 사유 안내");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-7: 후퇴 재색인은 바인딩을 기록·변경하지 않는다(수락도 무시)", async () => {
    const f = makeRebindFixture();
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirA}` });
        const bindingsBefore = JSON.stringify(diskBindings(f.idxPath));
        const keysBefore = indexKeys(f.idxPath).sort();
        const { stdout } = await runReindexCli(f.idxPath, base, {
          NOTES_DIR: `a=${f.dirB}`,
          REINDEX_FALLBACK: "1",
          REINDEX_ADOPT_REBIND: "a",
        });
        assert.deepEqual(JSON.stringify(diskBindings(f.idxPath)), bindingsBefore, "bindings 1건도 변경 없음");
        for (const k of keysBefore) assert.ok(indexKeys(f.idxPath).includes(k), `${k} 보존(후퇴 무프루닝)`);
        assert.match(stdout, /보류/, "020 보류 안내");
        assert.doesNotMatch(stdout, /수락/, "후퇴 중 수락 무시");
        // 강화(codex 조언): 바인딩이 아예 없는 색인의 후퇴 실행도 bindings를 만들지 않는다
        const bare = diskJson(f.idxPath);
        delete bare.bindings;
        fs.writeFileSync(f.idxPath, JSON.stringify(bare));
        fs.writeFileSync(path.join(f.dirA, "extra.md"), "후퇴 중 신규 노트(저장 유발)");
        await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirA}`, REINDEX_FALLBACK: "1" });
        assert.equal(diskBindings(f.idxPath), undefined, "후퇴 저장이 bindings를 생성하지 않음");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });

  it("AC-8: reload-merge가 서로 다른 라벨의 바인딩을 모두 보존한다(??= 규칙)", async () => {
    const f = makeRebindFixture();
    try {
      await withEmbedStub(async (base) => {
        await runReindexCli(f.idxPath, base, { NOTES_DIR: `a=${f.dirA}` });
        const { stdout } = await runBrainScript(base, { NOTES_DIR: `a=${f.dirA}`, BRAIN_INDEX: f.idxPath }, `
          const one = m.loadIndex();
          m._resetIndexCacheForTest();
          const two = m.loadIndex(); // 별도 스냅샷(다중 프로세스 재현)
          two.bindings = { ...(two.bindings ?? {}), y: "/notes/y" };
          m.saveIndex(two);
          one.bindings = { ...(one.bindings ?? {}), z: "/notes/z" };
          m.saveIndex(one); // reload-merge가 y를 보존해야 함
          m._resetIndexCacheForTest();
          process.stdout.write(JSON.stringify(m.loadIndex().bindings));
        `);
        const b = JSON.parse(stdout);
        assert.ok(b.a, "원 바인딩 유지");
        assert.equal(b.y, "/notes/y", "다른 스냅샷의 바인딩 보존");
        assert.equal(b.z, "/notes/z", "내 바인딩 유지");
        // 강화(codex 조언): 실제 두 자식 프로세스가 각자 다른 라벨을 색인·저장(AC-8 원문)
        const dirY = path.join(f.root, "locY");
        fs.mkdirSync(dirY);
        fs.writeFileSync(path.join(dirY, "y.md"), "와이 라벨 노트");
        await runReindexCli(f.idxPath, base, { NOTES_DIR: `yy=${dirY}` });
        const fin = diskBindings(f.idxPath);
        assert.ok(fin?.a, "프로세스 1의 바인딩 보존(고아 항목과 함께)");
        assert.equal(fin?.yy, fs.realpathSync(dirY), "프로세스 2의 바인딩 기록");
      });
    } finally {
      fs.rmSync(f.root, { recursive: true, force: true });
    }
  });
});

// ── specs/025 — 검색 관측성: topScore·sources 기록 (AC-1·2) ─────────────────
//
// AC-1은 균일 스텁으로는 "최상위" 검증이 안 되므로(모든 코사인 동일) 내용 기반
// distinct 벡터 스텁을 쓴다 — 노트별로 다른 벡터를 줘 스코어를 가른다.

function runScoredLogProbe(notesDir: string, body: string): any {
  const script = [
    `const http = require("node:http");`,
    `const fsx = require("node:fs");`,
    `const srv = http.createServer((req, res) => {`,
    `  let raw = ""; req.on("data", (c) => (raw += c));`,
    `  req.on("end", () => {`,
    `    res.setHeader("content-type", "application/json");`,
    `    const inputs = JSON.parse(raw).input || [];`,
    `    const vec = (t) => t.includes("첫번째") ? [1, 0, 0, 0] : t.includes("두번째") ? [0, 1, 0, 0] : [0.8, 0.6, 0, 0];`,
    `    res.end(JSON.stringify({ data: inputs.map((t, i) => ({ index: i, embedding: vec(String(t)) })) }));`,
    `  });`,
    `});`,
    `srv.listen(0, async () => {`,
    `  const base = "http://127.0.0.1:" + srv.address().port;`,
    `  process.env.EMBEDDINGS_URL = base + "/v1";`,
    `  const m = await import(${JSON.stringify(BRAIN_JS)});`,
    `  try {`,
    body,
    `  } catch (e) { console.error(e); process.exit(1); }`,
    `  srv.close();`,
    `});`,
  ].join("\n");
  const out = execFileSync("node", ["--import", "tsx/esm", "-e", script], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      NOTES_DIR: `notes=${notesDir}`,
      BRAIN_INDEX: path.join(notesDir, ".brain-index.json"),
      QUERY_LOG: path.join(notesDir, "query-log.jsonl"),
      EMBEDDINGS_KEY: "test-key",
      EMBED_RETRIES: "1",
    },
  });
  return JSON.parse(out);
}

describe("검색 관측성 (025)", () => {
  it("025 AC-1: search_notes 로그에 topScore(정말 최상위)·sources가 기록된다", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-obs-ac1-"));
    try {
      fs.writeFileSync(path.join(dir, "one.md"), "첫번째 노트의 본문입니다");
      fs.writeFileSync(path.join(dir, "two.md"), "두번째 노트의 본문입니다");
      const r = runScoredLogProbe(dir, `
        const hits = await m.searchNotes("찾아줘");
        const ready = () => { try { return fsx.readFileSync(process.env.QUERY_LOG, "utf8").trim().length > 0; } catch { return false; } };
        for (let i = 0; i < 100 && !ready(); i++) await new Promise((r) => setTimeout(r, 20));
        const lines = fsx.readFileSync(process.env.QUERY_LOG, "utf8").trim().split("\\n").filter(Boolean).map(JSON.parse);
        process.stdout.write(JSON.stringify({ lines, hits }));
      `);
      const rec = r.lines.find((x: any) => x.tool === "search_notes");
      assert.ok(rec, "search_notes 레코드 존재");
      const scores = r.hits.map((h: any) => h.score);
      assert.ok(new Set(scores).size > 1, "스텁이 distinct 스코어를 만들었다(검증 전제)");
      assert.equal(rec.topScore, Math.max(...scores), "topScore = 전 히트의 최댓값");
      assert.deepEqual(rec.sources.sort(), [...new Set(r.hits.map((h: any) => h.path))].sort(), "sources = 반환 노트 키(중복 제거)");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("025 AC-2: 히트 없는 검색은 topScore null·sources 빈 배열", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-obs-ac2-"));
    try {
      const r = runQueryLogProbe(dir, `
        await m.searchNotes("아무것도 없는 주제");
        const ready = () => { try { return fsx.readFileSync(process.env.QUERY_LOG, "utf8").trim().length > 0; } catch { return false; } };
        for (let i = 0; i < 100 && !ready(); i++) await new Promise((r) => setTimeout(r, 20));
        const lines = fsx.readFileSync(process.env.QUERY_LOG, "utf8").trim().split("\\n").filter(Boolean).map(JSON.parse);
        process.stdout.write(JSON.stringify(lines));
      `);
      const rec = r.find((x: any) => x.tool === "search_notes");
      assert.equal(rec.success, false);
      assert.equal(rec.topScore, null, "히트 없음 → null(필드는 존재)");
      assert.deepEqual(rec.sources, [], "sources 빈 배열");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
