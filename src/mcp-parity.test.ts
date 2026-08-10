/**
 * Phase 2 Gate D — 실제 stdio child와 실제 Streamable HTTP server가 한 canonical brain을
 * 공유하는 transport parity. HOME/notes/index/query-log/embedding은 모두 temp 격리한다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function textOf(result: any): string {
  return (result.content as Array<{ type: string; text?: string }>).map((part) => part.text ?? "").join("\n");
}

async function closeServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

test("Phase 2 canonical live stdio/HTTP parity", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-transport-parity-"));
  const home = path.join(root, "home");
  const notes = path.join(root, "notes");
  const state = path.join(root, "state");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(state, { recursive: true });

  const embedding = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      const input = JSON.parse(raw || "{}").input ?? [];
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        data: input.map((_: unknown, index: number) => ({ index, embedding: [1, 0, 0, 0] })),
      }));
    });
  });
  try {
    await new Promise<void>((resolve, reject) => {
      embedding.once("error", reject);
      embedding.listen(0, "127.0.0.1", resolve);
    });
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
  const embeddingAddress = embedding.address();
  assert.ok(embeddingAddress && typeof embeddingAddress !== "string");
  const embeddingUrl = `http://127.0.0.1:${embeddingAddress.port}/v1`;
  const token = "phase2-parity-fixture-token";
  const changedEnv = [
    "HOME", "NOTES_DIR", "BRAIN_INDEX", "QUERY_LOG", "EMBEDDINGS_URL", "EMBEDDINGS_MODEL",
    "EMBEDDINGS_KEY", "EMBED_RETRIES", "LOCALMIND_DEPLOYMENT_ID",
  ] as const;
  const previousEnv = new Map(changedEnv.map((key) => [key, process.env[key]]));
  const canonicalEnv: Record<string, string> = {
    ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
    HOME: home,
    NOTES_DIR: `canonical=${notes}`,
    BRAIN_INDEX: path.join(state, "index.json"),
    QUERY_LOG: path.join(state, "query-log.jsonl"),
    EMBEDDINGS_URL: embeddingUrl,
    EMBEDDINGS_MODEL: "fixture-model",
    EMBEDDINGS_KEY: "fixture-key",
    EMBED_RETRIES: "1",
    LOCALMIND_DEPLOYMENT_ID: "phase2-canonical",
  };
  Object.assign(process.env, canonicalEnv);

  let stdioClient: Client | null = null;
  let httpClient: Client | null = null;
  let splitBrainClient: Client | null = null;
  let httpHandle: import("./mcp-http.js").ServeHttpHandle | null = null;
  try {
    const { serveHttp } = await import("./mcp-http.js");
    httpHandle = await serveHttp({
      host: "127.0.0.1",
      port: 0,
      path: "/mcp",
      token,
      allowedOrigins: ["https://allowed.example"],
    });
    const endpoint = new URL(`http://127.0.0.1:${httpHandle.port}/mcp`);

    const stdioTransport = new StdioClientTransport({
      command: "node",
      args: ["--import", "tsx/esm", "src/mcp.ts"],
      cwd: REPO,
      env: canonicalEnv,
      stderr: "pipe",
    });
    stdioClient = new Client({ name: "phase2-stdio", version: "0" });
    await stdioClient.connect(stdioTransport);

    const httpTransport = new StreamableHTTPClientTransport(endpoint, {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    httpClient = new Client({ name: "phase2-http", version: "0" });
    await httpClient.connect(httpTransport);

    const [stdioTools, httpTools] = await Promise.all([stdioClient.listTools(), httpClient.listTools()]);
    const contract = (tools: typeof stdioTools.tools) => tools
      .map(({ name, inputSchema }) => ({ name, inputSchema }))
      .sort((a, b) => a.name.localeCompare(b.name));
    assert.deepEqual(contract(httpTools.tools), contract(stdioTools.tools), "names+inputSchema가 transport와 무관해야 함");

    const [stdioWhoami, httpWhoami] = await Promise.all([
      stdioClient.callTool({ name: "whoami", arguments: {} }),
      httpClient.callTool({ name: "whoami", arguments: {} }),
    ]);
    assert.equal(httpWhoami.isError ?? false, stdioWhoami.isError ?? false);
    assert.deepEqual(httpWhoami.content, stdioWhoami.content, "whoami 결과가 transport와 무관해야 함");
    assert.match(textOf(httpWhoami), /deployment: phase2-canonical/);
    assert.match(textOf(httpWhoami), /brain fingerprint: [0-9a-f]{64}/);
    assert.match(textOf(httpWhoami), /canonical/);

    // 같은 operator deployment id·label이어도 실제 root가 다르면 동일 brain으로 보이면 안 된다.
    const otherNotes = path.join(root, "other-notes");
    const otherState = path.join(root, "other-state");
    fs.mkdirSync(otherNotes, { recursive: true });
    fs.mkdirSync(otherState, { recursive: true });
    const splitTransport = new StdioClientTransport({
      command: "node",
      args: ["--import", "tsx/esm", "src/mcp.ts"],
      cwd: REPO,
      env: {
        ...canonicalEnv,
        NOTES_DIR: `canonical=${otherNotes}`,
        BRAIN_INDEX: path.join(otherState, "index.json"),
        QUERY_LOG: path.join(otherState, "query-log.jsonl"),
      },
      stderr: "pipe",
    });
    splitBrainClient = new Client({ name: "phase2-split-brain", version: "0" });
    await splitBrainClient.connect(splitTransport);
    const splitWhoami = await splitBrainClient.callTool({ name: "whoami", arguments: {} });
    const canonicalFingerprint = /brain fingerprint: ([0-9a-f]{64})/.exec(textOf(httpWhoami))?.[1];
    const splitFingerprint = /brain fingerprint: ([0-9a-f]{64})/.exec(textOf(splitWhoami))?.[1];
    assert.ok(canonicalFingerprint && splitFingerprint);
    assert.notEqual(splitFingerprint, canonicalFingerprint, "같은 deployment id·label의 다른 root는 split-brain으로 구분해야 함");
    const canonicalMarker = fs.readFileSync(path.join(notes, ".localmind-brain-id"), "utf8").trim();
    const splitMarker = fs.readFileSync(path.join(otherNotes, ".localmind-brain-id"), "utf8").trim();
    assert.match(canonicalMarker, /^[0-9a-f-]{36}$/);
    assert.match(splitMarker, /^[0-9a-f-]{36}$/);
    assert.notEqual(splitMarker, canonicalMarker, "서로 다른 root는 path/inode가 아니라 독립 random marker를 가져야 함");

    const marker = `PHASE2-TRANSPORT-${crypto.randomUUID()}`;
    const captured = await stdioClient.callTool({
      name: "capture_note",
      arguments: { title: "transport parity", text: `${marker} canonical brain 왕복 본문` },
    });
    assert.equal(captured.isError ?? false, false, textOf(captured));
    const source = /^source:\s*(\S+)\s*$/m.exec(textOf(captured))?.[1];
    assert.ok(source, "capture가 canonical source를 반환해야 함");

    const searched = await httpClient.callTool({ name: "search_notes", arguments: { query: marker, limit: 5 } });
    assert.equal(searched.isError ?? false, false, textOf(searched));
    assert.match(textOf(searched), new RegExp(`\\[${source!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]`));
    assert.match(textOf(searched), new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

    const unavailableNotes = `${notes}.unavailable`;
    fs.renameSync(notes, unavailableNotes);
    try {
      const [stdioUnavailable, httpUnavailable] = await Promise.all([
        stdioClient.callTool({ name: "search_notes", arguments: { query: marker, limit: 5 } }),
        httpClient.callTool({ name: "search_notes", arguments: { query: marker, limit: 5 } }),
      ]);
      assert.equal(stdioUnavailable.isError ?? false, true, textOf(stdioUnavailable));
      assert.equal(httpUnavailable.isError ?? false, true, textOf(httpUnavailable));
      assert.match(textOf(stdioUnavailable), /search_notes 실패/);
      assert.match(textOf(httpUnavailable), /search_notes 실패/);
      assert.doesNotMatch(textOf(stdioUnavailable), /관련 노트가 없습니다/);
      assert.doesNotMatch(textOf(httpUnavailable), /관련 노트가 없습니다/);
    } finally {
      fs.renameSync(unavailableNotes, notes);
    }

    const unauthenticated = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    assert.equal(unauthenticated.status, 401, "Bearer 없는 HTTP 요청은 계속 fail closed");
    const badOrigin = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token}`,
        origin: "https://blocked.example",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "initialize", params: {} }),
    });
    assert.equal(badOrigin.status, 403, "allowlist 밖 Origin은 계속 fail closed");
  } finally {
    try { await splitBrainClient?.close(); } catch { /* 원래 실패 보존 */ }
    try { await httpClient?.close(); } catch { /* 원래 실패 보존 */ }
    try { await stdioClient?.close(); } catch { /* 원래 실패 보존 */ }
    try { await httpHandle?.close(); } catch { /* 원래 실패 보존 */ }
    await closeServer(embedding);
    for (const key of changedEnv) {
      const previous = previousEnv.get(key);
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("query-log filesystem 오류는 MCP child stderr에 절대경로·control canary를 노출하지 않는다", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-query-log-privacy-"));
  const home = path.join(root, "home");
  const notes = path.join(root, "notes");
  const state = path.join(root, "state");
  const canary = "QUERY-LOG-PRIVATE-CANARY";
  const blockedAncestor = path.join(root, `${canary}\tancestor`);
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(state, { recursive: true });
  fs.writeFileSync(blockedAncestor, "regular-file-blocks-query-log-directory");

  const embedding = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => { raw += chunk; });
    req.on("end", () => {
      const input = JSON.parse(raw || "{}").input ?? [];
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data: input.map((_: unknown, index: number) => ({ index, embedding: [1, 0] })) }));
    });
  });
  await new Promise<void>((resolve, reject) => {
    embedding.once("error", reject);
    embedding.listen(0, "127.0.0.1", resolve);
  });
  const address = embedding.address();
  assert.ok(address && typeof address !== "string");

  const transport = new StdioClientTransport({
    command: "node",
    args: ["--import", "tsx/esm", "src/mcp.ts"],
    cwd: REPO,
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      HOME: home,
      NOTES_DIR: `canonical=${notes}`,
      BRAIN_INDEX: path.join(state, "index.json"),
      QUERY_LOG: path.join(blockedAncestor, "nested", "query-log.jsonl"),
      EMBEDDINGS_URL: `http://127.0.0.1:${address.port}/v1`,
      EMBEDDINGS_MODEL: "fixture-model",
      EMBEDDINGS_KEY: "fixture-key",
      EMBED_RETRIES: "1",
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "phase2-query-log-privacy", version: "0" });
  let stderr = "";
  try {
    await client.connect(transport);
    transport.stderr?.on("data", (chunk) => { stderr += String(chunk); });
    const result = await client.callTool({ name: "search_notes", arguments: { query: "public synthetic query", limit: 5 } });
    assert.equal(result.isError ?? false, false, textOf(result));
    assert.match(stderr, /쿼리 로그 기록 실패\(무시\)/, "path-free diagnostic은 남겨야 한다");
    assert.doesNotMatch(stderr, new RegExp(canary));
    assert.doesNotMatch(stderr, new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(stderr, /\t/);
  } finally {
    try { await client.close(); } catch { /* 원래 실패 보존 */ }
    await closeServer(embedding);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("embedding URL userinfo는 stdio MCP content와 child stderr에 노출되지 않는다", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lm-embedding-userinfo-parity-"));
  const home = path.join(root, "home");
  const notes = path.join(root, "notes");
  const state = path.join(root, "state");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(notes, { recursive: true });
  fs.mkdirSync(state, { recursive: true });
  const secret = `mcp-embedding-secret-${process.pid}`;
  const user = "fixture-user";
  const transport = new StdioClientTransport({
    command: "node",
    args: ["--import", "tsx/esm", "src/mcp.ts"],
    cwd: REPO,
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      HOME: home,
      NOTES_DIR: `canonical=${notes}`,
      BRAIN_INDEX: path.join(state, "index.json"),
      QUERY_LOG: "/dev/null",
      EMBEDDINGS_URL: `http://${user}:${secret}@127.0.0.1:9/v1`,
      EMBEDDINGS_MODEL: "fixture-model",
      EMBEDDINGS_KEY: "fixture-key",
      EMBED_RETRIES: "1",
    },
    stderr: "pipe",
  });
  const client = new Client({ name: "phase2-userinfo", version: "0" });
  let stderr = "";
  try {
    await client.connect(transport);
    transport.stderr?.on("data", (chunk) => { stderr += String(chunk); });
    const result = await client.callTool({ name: "search_notes", arguments: { query: "credential leak probe", limit: 5 } });
    assert.equal(result.isError ?? false, true, textOf(result));
    const content = textOf(result);
    for (const output of [content, stderr]) {
      assert.doesNotMatch(output, new RegExp(secret));
      assert.doesNotMatch(output, new RegExp(user));
      assert.doesNotMatch(output, /127\.0\.0\.1:9/);
    }
    assert.match(content, /임베딩 URL 설정이 안전하지 않/);
  } finally {
    try { await client.close(); } catch { /* 원래 실패 보존 */ }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
