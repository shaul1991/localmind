#!/usr/bin/env node
/**
 * cli-gateway MCP 서버 (stdio).
 *
 * MCP 호스트(Claude Desktop / Cursor / Cline 등)에게 cli-gateway의 능력을
 * "도구"로 노출한다. 호스트의 모델은 그대로 두고, 아래 도구를 끌어 쓴다.
 *
 *   ask     — claude/codex CLI에 교차 질의 (다른 모델 상담)
 *   remember — 로컬 메모리에 사실 저장 (OpenMemory: claude 추출 + bge-m3)
 *   recall  — 의미 기반 회상 (mem0.search)
 *
 * 순수 HTTP 클라이언트라 cli-gateway 스택(포트 노출)만 떠 있으면 동작한다.
 * stdout은 MCP 프로토콜 전용이므로 로그는 stderr로만 쓴다.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const GATEWAY_URL = (process.env.CLI_GATEWAY_URL ?? "http://localhost:8787").replace(/\/$/, "");
const GATEWAY_KEY = process.env.CLI_GATEWAY_API_KEY?.trim();
const OPENMEMORY_URL = (process.env.OPENMEMORY_URL ?? "http://localhost:8767").replace(/\/$/, "");
const MEMORY_USER = process.env.OPENMEMORY_USER ?? "cli-gateway";
const DEFAULT_MODEL = process.env.MCP_DEFAULT_MODEL ?? "sonnet";

function textResult(text: string, isError = false) {
  return { content: [{ type: "text" as const, text }], isError };
}

async function postJson(url: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { ok: res.ok, status: res.status, json };
}

const server = new McpServer({ name: "cli-gateway", version: "0.1.0" });

// ── ask: claude/codex CLI에 교차 질의 ────────────────────────────
server.registerTool(
  "ask",
  {
    title: "Ask claude/codex",
    description:
      "Ask a Claude or Codex CLI model (via cli-gateway) and get its text answer. " +
      "Use for cross-model consultation. model: 'sonnet'/'opus'/'claude-*' → Claude, " +
      "'gpt-5.5'/'codex:*' → Codex.",
    inputSchema: {
      prompt: z.string().describe("The question or task to send to the model"),
      model: z.string().optional().describe("Model/alias (default: sonnet)"),
      system: z.string().optional().describe("Optional system prompt"),
    },
  },
  async ({ prompt, model, system }) => {
    const messages: { role: string; content: string }[] = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });
    const headers: Record<string, string> = {};
    if (GATEWAY_KEY) headers.Authorization = `Bearer ${GATEWAY_KEY}`;
    const r = await postJson(
      `${GATEWAY_URL}/v1/chat/completions`,
      { model: model || DEFAULT_MODEL, messages, stream: false },
      headers,
    );
    if (!r.ok) return textResult(`ask 실패 (HTTP ${r.status}): ${JSON.stringify(r.json)}`, true);
    const content = r.json?.choices?.[0]?.message?.content ?? "";
    return textResult(content || "(빈 응답)");
  },
);

// ── remember: 로컬 메모리에 사실 저장 ────────────────────────────
server.registerTool(
  "remember",
  {
    title: "Remember (store memory)",
    description:
      "Store a memory in the local memory service. The text is distilled into facts by " +
      "Claude and embedded with bge-m3, then saved (metered-API-free).",
    inputSchema: {
      text: z.string().describe("The information to remember"),
      user_id: z.string().optional().describe(`Memory owner id (default: ${MEMORY_USER})`),
    },
  },
  async ({ text, user_id }) => {
    const r = await postJson(`${OPENMEMORY_URL}/api/v1/memories/`, {
      user_id: user_id || MEMORY_USER,
      text,
      infer: true,
    });
    if (!r.ok) return textResult(`remember 실패 (HTTP ${r.status}): ${JSON.stringify(r.json)}`, true);
    const stored = r.json?.content ?? null;
    return textResult(stored ? `저장됨: ${stored}` : "처리됨 (기존 기억과 중복이면 추가 안 될 수 있음)");
  },
);

// ── recall: 의미 기반 회상 ───────────────────────────────────────
server.registerTool(
  "recall",
  {
    title: "Recall (semantic memory search)",
    description:
      "Semantically search the local memory service for relevant memories (bge-m3 vector search).",
    inputSchema: {
      query: z.string().describe("What to recall"),
      user_id: z.string().optional().describe(`Memory owner id (default: ${MEMORY_USER})`),
      limit: z.number().int().min(1).max(20).optional().describe("Max results (default: 5)"),
    },
  },
  async ({ query, user_id, limit }) => {
    const r = await postJson(`${OPENMEMORY_URL}/api/v1/memories/semantic`, {
      user_id: user_id || MEMORY_USER,
      query,
      limit: limit ?? 5,
    });
    if (!r.ok) return textResult(`recall 실패 (HTTP ${r.status}): ${JSON.stringify(r.json)}`, true);
    const results: { memory: string; score: number }[] = r.json?.results ?? [];
    if (!results.length) return textResult("관련 기억 없음");
    return textResult(results.map((m) => `(${(m.score ?? 0).toFixed(3)}) ${m.memory}`).join("\n"));
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(
    `[cli-gateway-mcp] ready (gateway=${GATEWAY_URL}, memory=${OPENMEMORY_URL}, user=${MEMORY_USER})\n`,
  );
}

main().catch((e) => {
  process.stderr.write(`[cli-gateway-mcp] fatal: ${e}\n`);
  process.exit(1);
});
