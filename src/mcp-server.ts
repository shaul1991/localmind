/**
 * localmind MCP 서버 정의(도구 등록). stdio·HTTP 두 transport가 공유한다.
 *
 * 도구: ask · remember · recall · capture_note · search_notes · ask_brain · whoami
 *
 * 디바이스/서버별 관리:
 *   한 인스턴스 = 한 디바이스/서버. MCP_INSTANCE로 식별하고, 메모리(OPENMEMORY_USER)와
 *   노트(NOTES_DIR)가 그 디바이스에 로컬이라 자원 정보가 서버별로 격리된다.
 *   클라이언트는 whoami로 "지금 어느 서버의 두뇌인지" 확인할 수 있다.
 *
 * 이 모듈은 stdout에 아무것도 쓰지 않는다(stdio transport 전용).
 */
import os from "node:os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { askBrain, capture, notesDir, searchNotes } from "./brain.js";

export const GATEWAY_URL = (process.env.LOCALMIND_URL ?? "http://localhost:8787").replace(/\/$/, "");
export const GATEWAY_KEY = process.env.LOCALMIND_API_KEY?.trim();
export const OPENMEMORY_URL = (process.env.OPENMEMORY_URL ?? "http://localhost:8767").replace(/\/$/, "");
// 디바이스/서버 식별자. 메모리 사용자 기본값으로도 쓰여 서버별 메모리가 자연히 분리된다.
export const INSTANCE = (process.env.MCP_INSTANCE ?? process.env.OPENMEMORY_USER ?? os.hostname()).trim();
export const MEMORY_USER = process.env.OPENMEMORY_USER ?? INSTANCE;
export const DEFAULT_MODEL = process.env.MCP_DEFAULT_MODEL ?? "sonnet";

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

export function configSummary(): string {
  return `instance=${INSTANCE}, gateway=${GATEWAY_URL}, memory=${OPENMEMORY_URL}, user=${MEMORY_USER}, notes=${notesDir()}`;
}

/** 도구가 모두 등록된 새 McpServer를 만든다(HTTP stateless는 요청마다 새로 생성). */
export function buildServer(): McpServer {
  const server = new McpServer({ name: `localmind:${INSTANCE}`, version: "0.2.0" });

  // ── whoami: 이 인스턴스가 어느 디바이스/서버인지 ──────────────────
  server.registerTool(
    "whoami",
    {
      title: "Which localmind instance",
      description:
        "Report this localmind instance identity (device/server). Use to know whose brain/memory " +
        "you are talking to before remember/recall/notes.",
      inputSchema: {},
    },
    async () =>
      textResult(
        `instance: ${INSTANCE}\nmemory_user: ${MEMORY_USER}\nnotes_dir: ${notesDir()}\n` +
          `gateway: ${GATEWAY_URL}\nmemory: ${OPENMEMORY_URL}`,
      ),
  );

  // ── ask: claude/codex CLI에 교차 질의 ────────────────────────────
  server.registerTool(
    "ask",
    {
      title: "Ask claude/codex",
      description:
        "Ask a Claude or Codex CLI model (via localmind) and get its text answer. " +
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
        "Store a memory in this instance's local memory service. The text is distilled into facts by " +
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
        "Semantically search this instance's local memory for relevant memories (bge-m3 vector search).",
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

  // ── second-brain: .md 노트 RAG ──────────────────────────────────
  server.registerTool(
    "capture_note",
    {
      title: "Capture note",
      description:
        "Save a markdown note into this instance's second-brain notes folder (canonical) and index it. " +
        "Use to persist knowledge, decisions, snippets, server/infra resource info.",
      inputSchema: {
        text: z.string().describe("Note body (markdown)"),
        title: z.string().optional().describe("Optional note title"),
      },
    },
    async ({ text, title }) => {
      try {
        const file = await capture(text, title);
        return textResult(`노트 저장: ${file}`);
      } catch (e) {
        return textResult(`capture_note 실패: ${(e as Error).message}`, true);
      }
    },
  );

  server.registerTool(
    "search_notes",
    {
      title: "Search notes",
      description: "Semantically search this instance's second-brain notes. Returns matching snippets with paths.",
      inputSchema: {
        query: z.string().describe("What to find in your notes"),
        limit: z.number().int().min(1).max(20).optional().describe("Max snippets (default 5)"),
      },
    },
    async ({ query, limit }) => {
      try {
        const hits = await searchNotes(query, limit ?? 5);
        if (!hits.length) return textResult("관련 노트 없음");
        return textResult(
          hits.map((h) => `(${h.score.toFixed(3)}) [${h.path}]\n${h.text.slice(0, 280)}`).join("\n\n"),
        );
      } catch (e) {
        return textResult(`search_notes 실패: ${(e as Error).message}`, true);
      }
    },
  );

  server.registerTool(
    "ask_brain",
    {
      title: "Ask second-brain (RAG)",
      description:
        "Answer a question grounded ONLY in this instance's second-brain notes (RAG). Cites source note paths.",
      inputSchema: {
        question: z.string().describe("Question to answer from your notes"),
        k: z.number().int().min(1).max(20).optional().describe("Notes to retrieve (default 5)"),
      },
    },
    async ({ question, k }) => {
      try {
        const { answer, sources } = await askBrain(question, k ?? 5);
        const cite = sources.length ? `\n\n출처: ${sources.join(", ")}` : "";
        return textResult(answer + cite);
      } catch (e) {
        return textResult(`ask_brain 실패: ${(e as Error).message}`, true);
      }
    },
  );

  return server;
}
