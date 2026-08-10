import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BRAIN_JS = path.join(REPO_ROOT, "src", "brain.js");

function runChild(script: string, env: NodeJS.ProcessEnv): unknown {
  const wrapped = `(async () => {\n${script}\n})().catch((error) => { console.error(error); process.exit(1); });`;
  const out = execFileSync("node", ["--import", "tsx/esm", "-e", wrapped], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 10_000,
    env: { ...process.env, ...env },
  });
  return JSON.parse(out);
}

describe("Phase 2 adversarial commit boundaries", () => {
  it("source guard의 transient ENOENT 뒤 same-byte source가 재생성되면 durable key를 잃지 않는다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-source-guard-aba-"));
    const notes = path.join(root, "notes");
    const state = path.join(root, "state");
    const source = path.join(notes, "victim.md");
    fs.mkdirSync(notes, { recursive: true });
    fs.mkdirSync(state, { recursive: true });
    const script = `
      const fs = require("node:fs");
      const path = require("node:path");
      const crypto = require("node:crypto");
      const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
      const source = process.env.SOURCE_PATH;
      const notes = process.env.NOTES_ROOT;
      const oldText = "durable old revision";
      const pendingText = "pending revision survives ABA";
      fs.writeFileSync(source, oldText);
      const brain = await import(${JSON.stringify(BRAIN_JS)});
      brain.saveIndex({ version: brain.loadIndex().version, embeddingModel: "fixture-model", dims: 2, files: {
        "notes/victim.md": { hash: sha(oldText), folder: "notes", chunks: [{ path: "notes/victim.md", text: oldText, vector: [1, 0] }], linksOut: [] },
      } });
      const candidate = brain.loadIndex();
      candidate.files["notes/victim.md"] = { hash: sha(pendingText), folder: "notes", chunks: [{ path: "notes/victim.md", text: pendingText, vector: [0, 1] }], linksOut: [] };
      fs.writeFileSync(source, pendingText);
      const originalRead = fs.readFileSync;
      let injected = false;
      fs.readFileSync = function(target, ...args) {
        if (!injected && path.resolve(String(target)) === path.resolve(source)) {
          injected = true;
          fs.unlinkSync(source);
          fs.writeFileSync(source, pendingText);
          const error = new Error("synthetic transient ENOENT");
          error.code = "ENOENT";
          throw error;
        }
        return originalRead.call(this, target, ...args);
      };
      try {
        brain.saveIndex(candidate, [{ key: "notes/victim.md", fullPath: source, rootDir: notes, hash: sha(pendingText) }]);
      } catch {}
      finally { fs.readFileSync = originalRead; }
      brain._resetIndexCacheForTest();
      const loaded = brain.loadIndex();
      process.stdout.write(JSON.stringify({ injected, sourceExists: fs.existsSync(source), durableKey: !!loaded.files["notes/victim.md"] }));
    `;
    try {
      const result = runChild(script, {
        HOME: path.join(root, "home"),
        NOTES_DIR: `notes=${notes}`,
        BRAIN_INDEX: path.join(state, "index.json"),
        QUERY_LOG: "/dev/null",
        EMBEDDINGS_MODEL: "fixture-model",
        SOURCE_PATH: source,
        NOTES_ROOT: notes,
      }) as { injected: boolean; sourceExists: boolean; durableKey: boolean };
      assert.deepEqual(result, { injected: true, sourceExists: true, durableKey: true });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("stale writer의 unrelated 저장은 같은 label의 최신 durable binding을 되돌리지 않는다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-stale-binding-"));
    const notes = path.join(root, "notes");
    const state = path.join(root, "state");
    fs.mkdirSync(notes, { recursive: true });
    fs.mkdirSync(state, { recursive: true });
    const script = `
      const fs = require("node:fs");
      const crypto = require("node:crypto");
      const brain = await import(${JSON.stringify(BRAIN_JS)});
      const bindingOld = "/canonical/old";
      const bindingLatest = "/canonical/adopted-latest";
      brain.saveIndex({ version: brain.loadIndex().version, embeddingModel: "fixture-model", files: {}, bindings: { a: bindingOld } });
      const stale = brain.loadIndex();
      const disk = JSON.parse(fs.readFileSync(process.env.BRAIN_INDEX, "utf8"));
      disk.bindings.a = bindingLatest;
      delete disk.indexDigest;
      disk.indexDigest = crypto.createHash("sha256").update(JSON.stringify(disk)).digest("hex");
      const replacement = process.env.BRAIN_INDEX + ".external";
      fs.writeFileSync(replacement, JSON.stringify(disk));
      fs.renameSync(replacement, process.env.BRAIN_INDEX);
      stale.files["unrelated/x.md"] = { hash: "h", folder: "unrelated", chunks: [], linksOut: [] };
      brain.saveIndex(stale);
      brain._resetIndexCacheForTest();
      const final = brain.loadIndex();
      process.stdout.write(JSON.stringify({ binding: final.bindings?.a ?? null, unrelatedSaved: !!final.files["unrelated/x.md"] }));
    `;
    try {
      const result = runChild(script, {
        HOME: path.join(root, "home"),
        NOTES_DIR: `a=${notes}`,
        BRAIN_INDEX: path.join(state, "index.json"),
        QUERY_LOG: "/dev/null",
        EMBEDDINGS_MODEL: "fixture-model",
      });
      assert.deepEqual(result, { binding: "/canonical/adopted-latest", unrelatedSaved: true });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("clean rebuild의 JSON commit rename 순간 canonical root가 사라지면 기존 generation bytes를 복원한다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-root-commit-race-"));
    const notes = path.join(root, "notes");
    const moved = path.join(root, "notes-moved");
    const state = path.join(root, "state");
    const source = path.join(notes, "victim.md");
    fs.mkdirSync(notes, { recursive: true });
    fs.mkdirSync(state, { recursive: true });
    const script = `
      const fs = require("node:fs");
      const crypto = require("node:crypto");
      const source = process.env.SOURCE_PATH;
      const notes = process.env.NOTES_ROOT;
      const moved = process.env.MOVED_ROOT;
      const indexPath = process.env.BRAIN_INDEX;
      const text = "canonical source at final rename";
      fs.writeFileSync(source, text);
      const hash = crypto.createHash("sha256").update(text).digest("hex");
      fs.writeFileSync(indexPath, JSON.stringify({ version: 4, embeddingModel: "fixture-model", dims: 2, files: {
        "notes/victim.md": { hash, folder: "notes", chunks: [{ path: "notes/victim.md", text: "legacy payload", vector: [1, 0] }], linksOut: [] },
      } }));
      const before = fs.readFileSync(indexPath);
      globalThis.fetch = async (_url, init) => {
        const input = JSON.parse(String(init?.body ?? "{}")).input ?? [];
        return { ok: true, status: 200, json: async () => ({ data: input.map((_, index) => ({ index, embedding: [1, 0] })) }) };
      };
      const brain = await import(${JSON.stringify(BRAIN_JS)});
      const originalRename = fs.renameSync;
      let rootMoved = false;
      fs.renameSync = function(from, to) {
        if (!rootMoved && String(to) === indexPath && String(from).startsWith(indexPath + ".tmp-")) {
          originalRename.call(fs, notes, moved);
          rootMoved = true;
        }
        return originalRename.call(this, from, to);
      };
      let rejected = false;
      try { await brain.reindex(); } catch { rejected = true; }
      finally { fs.renameSync = originalRename; }
      const after = fs.readFileSync(indexPath);
      process.stdout.write(JSON.stringify({ rejected, rootMoved, bytesUnchanged: before.equals(after), diskVersion: JSON.parse(after).version }));
    `;
    try {
      const result = runChild(script, {
        HOME: path.join(root, "home"),
        NOTES_DIR: `notes=${notes}`,
        BRAIN_INDEX: path.join(state, "index.json"),
        QUERY_LOG: "/dev/null",
        EMBEDDINGS_MODEL: "fixture-model",
        EMBEDDINGS_URL: "http://fixture.invalid/v1",
        EMBEDDINGS_KEY: "fixture-dummy",
        EMBED_RETRIES: "1",
        SOURCE_PATH: source,
        NOTES_ROOT: notes,
        MOVED_ROOT: moved,
      });
      assert.deepEqual(result, { rejected: true, rootMoved: true, bytesUnchanged: true, diskVersion: 4 });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("deletion JSON commit rename 순간 same-byte source가 재생성되면 이전 generation을 복원한다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-delete-commit-aba-"));
    const notes = path.join(root, "notes");
    const state = path.join(root, "state");
    const source = path.join(notes, "victim.md");
    fs.mkdirSync(notes, { recursive: true });
    fs.mkdirSync(state, { recursive: true });
    const script = `
      const fs = require("node:fs");
      const crypto = require("node:crypto");
      const source = process.env.SOURCE_PATH;
      const notes = process.env.NOTES_ROOT;
      const indexPath = process.env.BRAIN_INDEX;
      const text = "same-byte canonical source";
      fs.writeFileSync(source, text);
      const hash = crypto.createHash("sha256").update(text).digest("hex");
      const brain = await import(${JSON.stringify(BRAIN_JS)});
      brain.saveIndex({ version: brain.loadIndex().version, embeddingModel: "fixture-model", files: {
        "notes/victim.md": { hash, folder: "notes", chunks: [], linksOut: [] },
      } });
      const before = fs.readFileSync(indexPath);
      const stale = brain.loadIndex();
      fs.unlinkSync(source);
      const originalRename = fs.renameSync;
      let recreated = false;
      fs.renameSync = function(from, to) {
        if (!recreated && String(to) === indexPath && String(from).startsWith(indexPath + ".tmp-")) {
          fs.writeFileSync(source, text);
          recreated = true;
        }
        return originalRename.call(this, from, to);
      };
      let rejected = false;
      try {
        brain.saveIndex(stale, [], [{ key: "notes/victim.md", expectedHash: hash, fullPath: source, rootDir: notes }]);
      } catch { rejected = true; }
      finally { fs.renameSync = originalRename; }
      const after = fs.readFileSync(indexPath);
      const disk = JSON.parse(after);
      process.stdout.write(JSON.stringify({ rejected, recreated, sourceExists: fs.existsSync(source), bytesUnchanged: before.equals(after), durableKey: !!disk.files["notes/victim.md"] }));
    `;
    try {
      const result = runChild(script, {
        HOME: path.join(root, "home"),
        NOTES_DIR: `notes=${notes}`,
        BRAIN_INDEX: path.join(state, "index.json"),
        QUERY_LOG: "/dev/null",
        EMBEDDINGS_MODEL: "fixture-model",
        SOURCE_PATH: source,
        NOTES_ROOT: notes,
      });
      assert.deepEqual(result, { rejected: true, recreated: true, sourceExists: true, bytesUnchanged: true, durableKey: true });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("digest-valid forged folder metadata는 canonical label에서 재생성한다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-forged-folder-"));
    const notes = path.join(root, "notes");
    const state = path.join(root, "state");
    fs.mkdirSync(notes, { recursive: true });
    fs.mkdirSync(state, { recursive: true });
    const script = `
      const fs = require("node:fs");
      const crypto = require("node:crypto");
      const sourceText = "canonical folder binding payload";
      fs.writeFileSync(process.env.SOURCE_PATH, sourceText);
      let forged = false;
      let sourceEmbeddedAfterForge = false;
      globalThis.fetch = async (_url, init) => {
        const input = JSON.parse(String(init?.body ?? "{}")).input ?? [];
        if (forged && input.includes(sourceText)) sourceEmbeddedAfterForge = true;
        return { ok: true, status: 200, json: async () => ({ data: input.map((_, index) => ({ index, embedding: [1, 0] })) }) };
      };
      const brain = await import(${JSON.stringify(BRAIN_JS)});
      await brain.reindex();
      const disk = JSON.parse(fs.readFileSync(process.env.BRAIN_INDEX, "utf8"));
      disk.files["alpha/victim.md"].folder = "wrong";
      delete disk.indexDigest;
      disk.indexDigest = crypto.createHash("sha256").update(JSON.stringify(disk)).digest("hex");
      fs.writeFileSync(process.env.BRAIN_INDEX, JSON.stringify(disk));
      forged = true;
      brain._resetIndexCacheForTest();
      const hits = await brain.searchNotes("folder scope probe", 5, "alpha");
      const after = JSON.parse(fs.readFileSync(process.env.BRAIN_INDEX, "utf8"));
      process.stdout.write(JSON.stringify({ sourceEmbeddedAfterForge, hitCount: hits.length, folder: after.files["alpha/victim.md"]?.folder ?? null }));
    `;
    try {
      const result = runChild(script, {
        HOME: path.join(root, "home"),
        NOTES_DIR: `alpha=${notes}`,
        BRAIN_INDEX: path.join(state, "index.json"),
        QUERY_LOG: "/dev/null",
        EMBEDDINGS_URL: "http://fixture.invalid/v1",
        EMBEDDINGS_MODEL: "fixture-model",
        EMBEDDINGS_KEY: "fixture-key",
        EMBED_RETRIES: "1",
        SOURCE_PATH: path.join(notes, "victim.md"),
      });
      assert.deepEqual(result, { sourceEmbeddedAfterForge: true, hitCount: 1, folder: "alpha" });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("dimension mismatch clean rebuild 중 root가 바뀌면 기존 generation을 지우거나 root를 재생성하지 않는다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-dims-root-race-"));
    const notes = path.join(root, "notes");
    const away = path.join(root, "notes-away");
    const state = path.join(root, "state");
    fs.mkdirSync(notes, { recursive: true });
    fs.mkdirSync(state, { recursive: true });
    const script = `
      const fs = require("node:fs");
      const path = require("node:path");
      const sourceText = "dimension reset root identity payload";
      const query = "dimension mismatch query";
      fs.writeFileSync(process.env.SOURCE_PATH, sourceText);
      let queryEmbedded = false;
      globalThis.fetch = async (_url, init) => {
        const input = JSON.parse(String(init?.body ?? "{}")).input ?? [];
        const isQuery = input.includes(query);
        if (isQuery) queryEmbedded = true;
        const vector = isQuery ? [1, 0, 0] : [1, 0];
        return { ok: true, status: 200, json: async () => ({ data: input.map((_, index) => ({ index, embedding: vector })) }) };
      };
      const brain = await import(${JSON.stringify(BRAIN_JS)});
      await brain.reindex();
      const before = fs.readFileSync(process.env.BRAIN_INDEX);
      const originalReaddir = fs.readdirSync;
      let moved = false;
      fs.readdirSync = function(target, ...args) {
        const value = originalReaddir.call(this, target, ...args);
        if (!moved && queryEmbedded && path.resolve(String(target)) === path.resolve(process.env.NOTES_ROOT)) {
          fs.renameSync(process.env.NOTES_ROOT, process.env.AWAY_ROOT);
          moved = true;
        }
        return value;
      };
      let rejected = false;
      try { await brain.searchNotes(query); } catch { rejected = true; }
      finally { fs.readdirSync = originalReaddir; }
      brain._resetIndexCacheForTest();
      const after = fs.readFileSync(process.env.BRAIN_INDEX);
      const loaded = brain.loadIndex();
      process.stdout.write(JSON.stringify({ moved, rejected, bytesUnchanged: before.equals(after), rootRecreated: fs.existsSync(process.env.NOTES_ROOT), sourcePreservedAway: fs.existsSync(path.join(process.env.AWAY_ROOT, "victim.md")), durableKey: !!loaded.files["canonical/victim.md"] }));
    `;
    try {
      const result = runChild(script, {
        HOME: path.join(root, "home"),
        NOTES_DIR: `canonical=${notes}`,
        BRAIN_INDEX: path.join(state, "index.json"),
        QUERY_LOG: "/dev/null",
        EMBEDDINGS_URL: "http://fixture.invalid/v1",
        EMBEDDINGS_MODEL: "fixture-model",
        EMBEDDINGS_KEY: "fixture-key",
        EMBED_RETRIES: "1",
        SOURCE_PATH: path.join(notes, "victim.md"),
        NOTES_ROOT: notes,
        AWAY_ROOT: away,
      });
      assert.deepEqual(result, { moved: true, rejected: true, bytesUnchanged: true, rootRecreated: false, sourcePreservedAway: true, durableKey: true });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("이미 close event가 발생한 watcher의 aggregate close는 영구 대기하지 않는다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-watch-preclosed-"));
    const state = path.join(root, "state");
    fs.mkdirSync(state, { recursive: true });
    const script = `
      const fs = require("node:fs");
      const { EventEmitter } = require("node:events");
      const originalWatch = fs.watch;
      const fake = new EventEmitter();
      fake.close = () => {};
      fs.watch = () => {
        queueMicrotask(() => fake.emit("close"));
        return fake;
      };
      const brain = await import(${JSON.stringify(BRAIN_JS)});
      const handle = brain.watchNotes();
      await handle.ready;
      await Promise.resolve();
      const closeResolved = await Promise.race([
        handle.close().then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), 100)),
      ]);
      fs.watch = originalWatch;
      process.stdout.write(JSON.stringify({ closeResolved }));
    `;
    try {
      const result = runChild(script, {
        HOME: path.join(root, "home"),
        NOTES_DIR: `notes=${root}`,
        BRAIN_INDEX: path.join(state, "index.json"),
        QUERY_LOG: "/dev/null",
      });
      assert.deepEqual(result, { closeResolved: true });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("legacy clean rebuild의 진행 저장은 root-loss 전에 부분 v5를 publish하지 않는다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-legacy-progress-root-"));
    const notes = path.join(root, "notes");
    const moved = path.join(root, "notes-moved");
    const state = path.join(root, "state");
    fs.mkdirSync(notes, { recursive: true });
    fs.mkdirSync(state, { recursive: true });
    const script = `
      const fs = require("node:fs");
      const crypto = require("node:crypto");
      const notes = process.env.NOTES_ROOT;
      const moved = process.env.MOVED_ROOT;
      const indexPath = process.env.BRAIN_INDEX;
      const files = {};
      for (let i = 0; i < 9; i++) {
        const name = "n" + i + ".md";
        const text = "canonical source " + i;
        fs.writeFileSync(require("node:path").join(notes, name), text);
        files["notes/" + name] = { hash: crypto.createHash("sha256").update(text).digest("hex"), folder: "notes", chunks: [{ path: "notes/" + name, text: "legacy " + i, vector: [1, 0] }], linksOut: [] };
      }
      fs.writeFileSync(indexPath, JSON.stringify({ version: 4, embeddingModel: "fixture-model", dims: 2, files }));
      const before = fs.readFileSync(indexPath);
      let calls = 0;
      let rootMoved = false;
      globalThis.fetch = async (_url, init) => {
        const input = JSON.parse(String(init?.body ?? "{}")).input ?? [];
        calls++;
        if (calls === 2) {
          fs.renameSync(notes, moved);
          rootMoved = true;
        }
        return { ok: true, status: 200, json: async () => ({ data: input.map((_, index) => ({ index, embedding: [1, 0] })) }) };
      };
      const brain = await import(${JSON.stringify(BRAIN_JS)});
      let rejected = false;
      try { await brain.reindex(); } catch { rejected = true; }
      const after = fs.readFileSync(indexPath);
      const disk = JSON.parse(after);
      process.stdout.write(JSON.stringify({ rejected, calls, rootMoved, bytesUnchanged: before.equals(after), diskVersion: disk.version, durableFileCount: Object.keys(disk.files ?? {}).length }));
    `;
    try {
      const result = runChild(script, {
        HOME: path.join(root, "home"),
        NOTES_DIR: `notes=${notes}`,
        BRAIN_INDEX: path.join(state, "index.json"),
        QUERY_LOG: "/dev/null",
        EMBEDDINGS_MODEL: "fixture-model",
        EMBEDDINGS_URL: "http://fixture.invalid/v1",
        EMBEDDINGS_KEY: "fixture-dummy",
        EMBED_RETRIES: "1",
        BRAIN_SAVE_INTERVAL: "0",
        BRAIN_CONCURRENCY: "1",
        NOTES_ROOT: notes,
        MOVED_ROOT: moved,
      });
      assert.deepEqual(result, { rejected: true, calls: 2, rootMoved: true, bytesUnchanged: true, diskVersion: 4, durableFileCount: 9 });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("source update JSON commit rename 순간 same-byte identity가 바뀌면 이전 generation을 복원한다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-source-commit-aba-"));
    const notes = path.join(root, "notes");
    const state = path.join(root, "state");
    const source = path.join(notes, "victim.md");
    fs.mkdirSync(notes, { recursive: true });
    fs.mkdirSync(state, { recursive: true });
    const script = `
      const fs = require("node:fs");
      const crypto = require("node:crypto");
      const sha = (text) => crypto.createHash("sha256").update(text).digest("hex");
      const source = process.env.SOURCE_PATH;
      const notes = process.env.NOTES_ROOT;
      const indexPath = process.env.BRAIN_INDEX;
      const oldText = "durable source revision";
      const nextText = "candidate same-byte ABA revision";
      fs.writeFileSync(source, oldText);
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(init.body);
        return new Response(JSON.stringify({ data: body.input.map((_, i) => ({ index: i, embedding: [1, 0] })) }), { status: 200, headers: { "content-type": "application/json" } });
      };
      const brain = await import(${JSON.stringify(BRAIN_JS)});
      await brain.reindex();
      const before = fs.readFileSync(indexPath);
      fs.writeFileSync(source, nextText);
      const originalRename = fs.renameSync;
      let recreated = false;
      fs.renameSync = function(from, to) {
        if (!recreated && String(to) === indexPath && String(from).startsWith(indexPath + ".tmp-")) {
          fs.unlinkSync(source);
          fs.writeFileSync(source, nextText);
          recreated = true;
        }
        return originalRename.call(this, from, to);
      };
      let rejected = false;
      try { await brain.reindex(); } catch { rejected = true; }
      finally { fs.renameSync = originalRename; }
      const after = fs.readFileSync(indexPath);
      process.stdout.write(JSON.stringify({ rejected, recreated, bytesUnchanged: before.equals(after) }));
    `;
    try {
      const result = runChild(script, {
        HOME: path.join(root, "home"),
        NOTES_DIR: `notes=${notes}`,
        BRAIN_INDEX: path.join(state, "index.json"),
        QUERY_LOG: "/dev/null",
        EMBEDDINGS_MODEL: "fixture-model",
        EMBEDDINGS_KEY: "fixture-key",
        EMBEDDINGS_URL: "http://127.0.0.1:9/v1",
        SOURCE_PATH: source,
        NOTES_ROOT: notes,
      });
      assert.deepEqual(result, { rejected: true, recreated: true, bytesUnchanged: true });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("source guard가 연속 transient ENOENT를 보면 durable generation을 삭제하지 않고 저장을 거부한다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-source-guard-double-enoent-"));
    const notes = path.join(root, "notes");
    const state = path.join(root, "state");
    const source = path.join(notes, "victim.md");
    fs.mkdirSync(notes, { recursive: true });
    fs.mkdirSync(state, { recursive: true });
    const script = `
      const fs = require("node:fs");
      const path = require("node:path");
      const crypto = require("node:crypto");
      const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
      const source = process.env.SOURCE_PATH;
      const notes = process.env.NOTES_ROOT;
      const oldText = "durable source revision";
      const pendingText = "pending same-byte recreate revision";
      fs.writeFileSync(source, oldText);
      const brain = await import(${JSON.stringify(BRAIN_JS)});
      brain.saveIndex({ version: brain.loadIndex().version, embeddingModel: "fixture-model", dims: 2, files: {
        "notes/victim.md": { hash: sha(oldText), folder: "notes", chunks: [{ path: "notes/victim.md", text: oldText, vector: [1, 0] }], linksOut: [] },
      } });
      const before = fs.readFileSync(process.env.BRAIN_INDEX);
      const candidate = brain.loadIndex();
      candidate.files["notes/victim.md"] = { hash: sha(pendingText), folder: "notes", chunks: [{ path: "notes/victim.md", text: pendingText, vector: [0, 1] }], linksOut: [] };
      fs.writeFileSync(source, pendingText);
      const originalRead = fs.readFileSync;
      let injected = 0;
      fs.readFileSync = function(target, ...args) {
        if (injected < 2 && path.resolve(String(target)) === path.resolve(source)) {
          injected++;
          if (fs.existsSync(source)) fs.unlinkSync(source);
          fs.writeFileSync(source, pendingText);
          const error = new Error("synthetic transient ENOENT");
          error.code = "ENOENT";
          throw error;
        }
        return originalRead.call(this, target, ...args);
      };
      let rejected = false;
      try {
        brain.saveIndex(candidate, [{ key: "notes/victim.md", fullPath: source, rootDir: notes, hash: sha(pendingText) }]);
      } catch { rejected = true; }
      finally { fs.readFileSync = originalRead; }
      const after = fs.readFileSync(process.env.BRAIN_INDEX);
      brain._resetIndexCacheForTest();
      const loaded = brain.loadIndex();
      process.stdout.write(JSON.stringify({
        injected, rejected, sourceExists: fs.existsSync(source), bytesUnchanged: before.equals(after),
        durableEntryPreserved: loaded.files["notes/victim.md"]?.hash === sha(oldText),
      }));
    `;
    try {
      const result = runChild(script, {
        HOME: path.join(root, "home"),
        NOTES_DIR: `notes=${notes}`,
        BRAIN_INDEX: path.join(state, "index.json"),
        QUERY_LOG: "/dev/null",
        EMBEDDINGS_MODEL: "fixture-model",
        SOURCE_PATH: source,
        NOTES_ROOT: notes,
      });
      assert.deepEqual(result, {
        injected: 2, rejected: true, sourceExists: true, bytesUnchanged: true, durableEntryPreserved: true,
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reload-merge는 digest-valid지만 canonical 의미가 위조된 동시 generation을 재봉인하지 않는다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-stale-forged-merge-"));
    const notes = path.join(root, "notes");
    const state = path.join(root, "state");
    fs.mkdirSync(notes, { recursive: true });
    fs.mkdirSync(state, { recursive: true });
    const script = `
      const fs = require("node:fs");
      const path = require("node:path");
      const crypto = require("node:crypto");
      const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
      const notes = process.env.NOTES_ROOT;
      const sourceA = path.join(notes, "a.md");
      const sourceB = path.join(notes, "b.md");
      fs.writeFileSync(sourceA, "canonical a");
      globalThis.fetch = async (_url, init) => {
        const input = JSON.parse(String(init?.body ?? "{}")).input ?? [];
        return { ok: true, status: 200, json: async () => ({ data: input.map((_, index) => ({ index, embedding: [1, 0] })) }) };
      };
      const brain = await import(${JSON.stringify(BRAIN_JS)});
      await brain.reindex();
      const stale = brain.loadIndex();
      fs.writeFileSync(sourceB, "canonical b [[trusted-link]]");
      brain._resetIndexCacheForTest();
      await brain.reindex();
      const forged = JSON.parse(fs.readFileSync(process.env.BRAIN_INDEX, "utf8"));
      forged.files["notes/b.md"].folder = "forged-folder";
      forged.files["notes/b.md"].chunks[0].text = "forged concurrent chunk";
      forged.files["notes/b.md"].linksOut = ["FORGED-LINK-CANARY"];
      delete forged.indexDigest;
      forged.indexDigest = sha(JSON.stringify(forged));
      const forgedBytes = Buffer.from(JSON.stringify(forged));
      fs.writeFileSync(process.env.BRAIN_INDEX, forgedBytes);
      stale.files["unrelated/c.md"] = { hash: sha("unrelated"), folder: "unrelated", chunks: [{ path: "unrelated/c.md", text: "unrelated", vector: [0, 1] }], linksOut: [] };
      let rejected = false;
      try { brain.saveIndex(stale); } catch { rejected = true; }
      const after = fs.readFileSync(process.env.BRAIN_INDEX);
      const disk = JSON.parse(after);
      process.stdout.write(JSON.stringify({ rejected, bytesUnchanged: forgedBytes.equals(after), unrelatedPublished: !!disk.files["unrelated/c.md"] }));
    `;
    try {
      const result = runChild(script, {
        HOME: path.join(root, "home"),
        NOTES_DIR: `notes=${notes}`,
        BRAIN_INDEX: path.join(state, "index.json"),
        QUERY_LOG: "/dev/null",
        EMBEDDINGS_URL: "http://fixture.invalid/v1",
        EMBEDDINGS_MODEL: "fixture-model",
        EMBEDDINGS_KEY: "fixture-key",
        EMBED_RETRIES: "1",
        NOTES_ROOT: notes,
      });
      assert.deepEqual(result, { rejected: true, bytesUnchanged: true, unrelatedPublished: false });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("reload-merge는 registered disk entry의 revision-changed·confirmed-missing 상태를 새 generation에 채택하지 않는다", () => {
    const scenario = (mode: "changed" | "missing") => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), `localmind-stale-source-${mode}-`));
      const notes = path.join(root, "notes");
      const idx = path.join(root, "index.json");
      fs.mkdirSync(notes);
      fs.writeFileSync(path.join(notes, "a.md"), "기준 노트");
      try {
        return runChild(
          `
          const fs = await import("node:fs");
          const path = await import("node:path");
          globalThis.fetch = async (_url, init) => {
            const n = JSON.parse(String(init?.body)).input.length;
            return new Response(JSON.stringify({ data: Array.from({ length: n }, (_, i) => ({ index: i, embedding: [1, 0] })) }), { status: 200, headers: { "content-type": "application/json" } });
          };
          const brain = await import(${JSON.stringify(BRAIN_JS)});
          const bPath = path.join(process.env.NOTES_ROOT, "b.md");
          await brain.reindex();
          const stale = brain.loadIndex();
          fs.writeFileSync(bPath, "disk writer가 색인한 b revision 1");
          brain._resetIndexCacheForTest();
          await brain.reindex();
          const before = fs.readFileSync(process.env.BRAIN_INDEX);
          if (process.env.SCENARIO === "changed") fs.writeFileSync(bPath, "canonical b revision 2");
          else fs.unlinkSync(bPath);
          stale.bindings = { ...(stale.bindings ?? {}), probe: process.env.SCENARIO };
          let rejected = false;
          try { brain.saveIndex(stale); } catch { rejected = true; }
          const after = fs.readFileSync(process.env.BRAIN_INDEX);
          process.stdout.write(JSON.stringify({ rejected, bytesUnchanged: before.equals(after) }));
          `,
          {
            NOTES_DIR: `notes=${notes}`,
            NOTES_ROOT: notes,
            BRAIN_INDEX: idx,
            EMBEDDINGS_URL: "http://127.0.0.1:1/v1",
            EMBEDDINGS_KEY: "dummy",
            SCENARIO: mode,
          },
        );
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    };

    assert.deepEqual(scenario("changed"), { rejected: true, bytesUnchanged: true });
    assert.deepEqual(scenario("missing"), { rejected: true, bytesUnchanged: true });
  });

  it("미등록 durable orphan은 보존하되 registered-folder 검색 표면에서는 제외한다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-orphan-search-"));
    const notes = path.join(root, "notes");
    const idx = path.join(root, "index.json");
    fs.mkdirSync(notes);
    fs.writeFileSync(path.join(notes, "a.md"), "검색 가능한 canonical 노트");
    try {
      const result = runChild(
        `
        const brain = await import(${JSON.stringify(BRAIN_JS)});
        globalThis.fetch = async (_url, init) => {
          const n = JSON.parse(String(init?.body)).input.length;
          return new Response(JSON.stringify({ data: Array.from({ length: n }, (_, i) => ({ index: i, embedding: [1, 0] })) }), { status: 200, headers: { "content-type": "application/json" } });
        };
        await brain.reindex();
        const loaded = brain.loadIndex();
        loaded.files["ghost/private.md"] = {
          hash: "orphan-hash",
          folder: "ghost",
          chunks: [{ path: "ghost/private.md", text: "ORPHAN-SEARCH-CANARY", vector: [1, 0] }],
          linksOut: [],
        };
        brain.saveIndex(loaded);
        brain._resetIndexCacheForTest();
        let rejected = false;
        let hits = [];
        try { hits = await brain.searchNotes("query", 5); } catch { rejected = true; }
        const durableKeys = Object.keys(brain.loadIndex().files).sort();
        process.stdout.write(JSON.stringify({ rejected, hitPaths: hits.map((h) => h.path), canaryReturned: hits.some((h) => h.text.includes("ORPHAN-SEARCH-CANARY")), durableKeys }));
        `,
        {
          NOTES_DIR: `notes=${notes}`,
          BRAIN_INDEX: idx,
          EMBEDDINGS_URL: "http://127.0.0.1:1/v1",
          EMBEDDINGS_KEY: "dummy",
        },
      );
      assert.deepEqual(result, {
        rejected: false,
        hitPaths: ["notes/a.md"],
        canaryReturned: false,
        durableKeys: ["ghost/private.md", "notes/a.md"],
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("개별 Markdown read 실패가 있으면 다른 변경만 담은 partial generation도 publish하지 않는다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-source-read-failure-"));
    const notes = path.join(root, "notes");
    const state = path.join(root, "state");
    fs.mkdirSync(notes, { recursive: true });
    fs.mkdirSync(state, { recursive: true });
    const script = `
      const fs = require("node:fs");
      const path = require("node:path");
      const a = path.join(process.env.NOTES_ROOT, "a.md");
      const b = path.join(process.env.NOTES_ROOT, "b.md");
      fs.writeFileSync(a, "canonical a revision 1");
      fs.writeFileSync(b, "canonical b must remain readable");
      globalThis.fetch = async (_url, init) => {
        const input = JSON.parse(String(init?.body ?? "{}")).input ?? [];
        return { ok: true, status: 200, json: async () => ({ data: input.map((_, index) => ({ index, embedding: [1, 0] })) }) };
      };
      const brain = await import(${JSON.stringify(BRAIN_JS)});
      await brain.reindex();
      const before = fs.readFileSync(process.env.BRAIN_INDEX);
      fs.writeFileSync(a, "canonical a revision 2");
      const originalRead = fs.readFileSync;
      fs.readFileSync = function(target, ...args) {
        if (path.resolve(String(target)) === path.resolve(b)) {
          const error = new Error("synthetic EACCES"); error.code = "EACCES"; throw error;
        }
        return originalRead.call(this, target, ...args);
      };
      let rejected = false;
      try { await brain.reindex(); } catch { rejected = true; }
      finally { fs.readFileSync = originalRead; }
      const after = fs.readFileSync(process.env.BRAIN_INDEX);
      process.stdout.write(JSON.stringify({ rejected, bytesUnchanged: before.equals(after) }));
    `;
    try {
      const result = runChild(script, {
        HOME: path.join(root, "home"),
        NOTES_DIR: `notes=${notes}`,
        BRAIN_INDEX: path.join(state, "index.json"),
        QUERY_LOG: "/dev/null",
        EMBEDDINGS_URL: "http://fixture.invalid/v1",
        EMBEDDINGS_MODEL: "fixture-model",
        EMBEDDINGS_KEY: "fixture-key",
        EMBED_RETRIES: "1",
        NOTES_ROOT: notes,
      });
      assert.deepEqual(result, { rejected: true, bytesUnchanged: true });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("같은 label binding을 ours와 disk가 다르게 바꾸면 명시적으로 거부하고 disk bytes를 보존한다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-binding-conflict-"));
    const notes = path.join(root, "notes");
    const state = path.join(root, "state");
    fs.mkdirSync(notes, { recursive: true });
    fs.mkdirSync(state, { recursive: true });
    const script = `
      const fs = require("node:fs");
      const crypto = require("node:crypto");
      const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
      const brain = await import(${JSON.stringify(BRAIN_JS)});
      brain.saveIndex({ version: brain.loadIndex().version, embeddingModel: "fixture-model", files: {}, bindings: { shared: "/baseline" } });
      const stale = brain.loadIndex();
      stale.bindings.shared = "/ours";
      const disk = JSON.parse(fs.readFileSync(process.env.BRAIN_INDEX, "utf8"));
      disk.bindings.shared = "/theirs";
      delete disk.indexDigest;
      disk.indexDigest = sha(JSON.stringify(disk));
      const diskBytes = Buffer.from(JSON.stringify(disk));
      fs.writeFileSync(process.env.BRAIN_INDEX, diskBytes);
      let rejected = false;
      try { brain.saveIndex(stale); } catch { rejected = true; }
      const after = fs.readFileSync(process.env.BRAIN_INDEX);
      process.stdout.write(JSON.stringify({ rejected, bytesUnchanged: diskBytes.equals(after), durableBinding: JSON.parse(after).bindings.shared }));
    `;
    try {
      const result = runChild(script, {
        HOME: path.join(root, "home"),
        NOTES_DIR: `notes=${notes}`,
        BRAIN_INDEX: path.join(state, "index.json"),
        QUERY_LOG: "/dev/null",
        EMBEDDINGS_MODEL: "fixture-model",
      });
      assert.deepEqual(result, { rejected: true, bytesUnchanged: true, durableBinding: "/theirs" });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("digest-valid forged linksOut은 canonical Markdown 링크로 재생성하고 검색에 사용하지 않는다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-forged-links-"));
    const notes = path.join(root, "notes");
    const state = path.join(root, "state");
    fs.mkdirSync(notes, { recursive: true });
    fs.mkdirSync(state, { recursive: true });
    const script = `
      const fs = require("node:fs");
      const crypto = require("node:crypto");
      const sourceText = "canonical link payload [[trusted-target]]";
      fs.writeFileSync(process.env.SOURCE_PATH, sourceText);
      let forged = false;
      let sourceEmbeddedAfterForge = false;
      globalThis.fetch = async (_url, init) => {
        const input = JSON.parse(String(init?.body ?? "{}")).input ?? [];
        if (forged && input.includes(sourceText)) sourceEmbeddedAfterForge = true;
        return { ok: true, status: 200, json: async () => ({ data: input.map((_, index) => ({ index, embedding: [1, 0] })) }) };
      };
      const brain = await import(${JSON.stringify(BRAIN_JS)});
      await brain.reindex();
      const disk = JSON.parse(fs.readFileSync(process.env.BRAIN_INDEX, "utf8"));
      disk.files["notes/victim.md"].linksOut = ["FORGED-LINK-CANARY"];
      delete disk.indexDigest;
      disk.indexDigest = crypto.createHash("sha256").update(JSON.stringify(disk)).digest("hex");
      fs.writeFileSync(process.env.BRAIN_INDEX, JSON.stringify(disk));
      forged = true;
      brain._resetIndexCacheForTest();
      await brain.searchNotes("link fidelity probe");
      const after = JSON.parse(fs.readFileSync(process.env.BRAIN_INDEX, "utf8"));
      const linksOut = after.files["notes/victim.md"].linksOut;
      process.stdout.write(JSON.stringify({ sourceEmbeddedAfterForge, linksOut, forgedCanaryPresent: linksOut.includes("FORGED-LINK-CANARY") }));
    `;
    try {
      const result = runChild(script, {
        HOME: path.join(root, "home"),
        NOTES_DIR: `notes=${notes}`,
        BRAIN_INDEX: path.join(state, "index.json"),
        QUERY_LOG: "/dev/null",
        EMBEDDINGS_URL: "http://fixture.invalid/v1",
        EMBEDDINGS_MODEL: "fixture-model",
        EMBEDDINGS_KEY: "fixture-key",
        EMBED_RETRIES: "1",
        SOURCE_PATH: path.join(notes, "victim.md"),
      });
      assert.deepEqual(result, { sourceEmbeddedAfterForge: true, linksOut: ["trusted-target"], forgedCanaryPresent: false });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("MCP watcher startup stderr는 canonical absolute root를 노출하지 않고 label만 기록한다", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-watcher-private-path-"));
    const notes = path.join(root, "PRIVATE-PATH-CANARY", "notes");
    const state = path.join(root, "state");
    fs.mkdirSync(notes, { recursive: true });
    fs.mkdirSync(state, { recursive: true });
    const wrapped = `(async () => {
      const brain = await import(${JSON.stringify(BRAIN_JS)});
      const handle = brain.watchNotes();
      await handle.ready;
      await handle.close();
    })().catch((error) => { console.error(error); process.exit(1); });`;
    try {
      const child = spawnSync("node", ["--import", "tsx/esm", "-e", wrapped], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 10_000,
        env: {
          ...process.env,
          HOME: path.join(root, "home"),
          NOTES_DIR: `private-label=${notes}`,
          BRAIN_INDEX: path.join(state, "index.json"),
          QUERY_LOG: "/dev/null",
        },
      });
      assert.equal(child.status, 0, child.stderr);
      assert.match(child.stderr, /\[localmind-watcher\] watching: private-label/);
      assert.doesNotMatch(child.stderr, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.doesNotMatch(child.stderr, /PRIVATE-PATH-CANARY/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
