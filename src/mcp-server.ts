/**
 * localmind MCP 서버 정의(도구 등록). stdio transport로 로컬에서만 동작한다.
 *
 * 도구: ask · remember · recall · capture_note · search_notes · ask_brain · whoami
 *
 * 이 모듈은 stdout에 아무것도 쓰지 않는다(stdio transport 전용).
 */
import os from "node:os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { askBrain, capture, deleteNote, listFolders, listNotes, notesDir, searchNotes } from "./brain.js";

export const GATEWAY_URL = (process.env.LOCALMIND_URL ?? "http://localhost:8787").replace(/\/$/, "");
export const GATEWAY_KEY = process.env.LOCALMIND_API_KEY?.trim();
export const OPENMEMORY_URL = (process.env.OPENMEMORY_URL ?? "http://localhost:8767").replace(/\/$/, "");
// 이 두뇌의 정체 = 메모리 사용자(OPENMEMORY_USER, 미설정 시 호스트명). whoami가 보고한다.
export const MEMORY_USER = (process.env.OPENMEMORY_USER ?? os.hostname()).trim();
export const DEFAULT_MODEL = process.env.MCP_DEFAULT_MODEL ?? "sonnet";

function textResult(text: string, isError = false, emoji = "") {
  return { content: [{ type: "text" as const, text: emoji ? `${emoji} ${text}` : text }], isError };
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
  return `gateway=${GATEWAY_URL}, memory=${OPENMEMORY_URL}, user=${MEMORY_USER}, notes=${notesDir()}`;
}

/** 도구가 모두 등록된 새 McpServer를 만든다(HTTP stateless는 요청마다 새로 생성). */
export function buildServer(): McpServer {
  const server = new McpServer({ name: "localmind", version: "0.2.0" });

  // ── whoami: 이 두뇌가 어떤 메모리·노트를 쓰는지 ──────────────────
  server.registerTool(
    "whoami",
    {
      title: "Which brain (memory/notes)",
      description:
        "Report which brain this is — the memory user and notes folder(s) in use. " +
        "Use before remember/recall/notes to confirm you're on the right memory/notes.",
      inputSchema: {},
    },
    async () => {
      const folders = listFolders().map((f) => `  - ${f.label}: ${f.dir}`).join("\n");
      return textResult(
        `memory_user: ${MEMORY_USER}\n` +
          `notes folders (label: path):\n${folders}\n` +
          `gateway: ${GATEWAY_URL}\nmemory: ${OPENMEMORY_URL}`,
        false, "🧠",
      );
    },
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
      if (!r.ok) return textResult(`ask 실패 (HTTP ${r.status}): ${JSON.stringify(r.json)}`, true, "💬");
      const content = r.json?.choices?.[0]?.message?.content ?? "";
      return textResult(content || "(빈 응답)", false, "💬");
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
      if (!r.ok) return textResult(`remember 실패 (HTTP ${r.status}): ${JSON.stringify(r.json)}`, true, "💾");
      const stored = r.json?.content ?? null;
      return textResult(stored ? `저장됨: ${stored}` : "처리됨 (기존 기억과 중복이면 추가 안 될 수 있음)", false, "💾");
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
      if (!r.ok) return textResult(`recall 실패 (HTTP ${r.status}): ${JSON.stringify(r.json)}`, true, "💭");
      const results: { memory: string; score: number }[] = r.json?.results ?? [];
      if (!results.length) return textResult("관련 기억 없음", false, "💭");
      return textResult(results.map((m) => `(${(m.score ?? 0).toFixed(3)}) ${m.memory}`).join("\n"), false, "💭");
    },
  );

  // ── second-brain: .md 노트 RAG ──────────────────────────────────
  server.registerTool(
    "capture_note",
    {
      title: "Capture note",
      description:
        "Save a markdown note into a second-brain notes folder (canonical) and index it. " +
        "Use to persist knowledge, decisions, snippets, resource info. " +
        "folder picks which notes folder (label) to write to; default is the first. See whoami for labels.",
      inputSchema: {
        text: z.string().describe("Note body (markdown)"),
        title: z.string().optional().describe("Optional note title"),
        folder: z.string().optional().describe("Target notes folder label (default: first folder)"),
      },
    },
    async ({ text, title, folder }) => {
      try {
        const file = await capture(text, title, folder);
        return textResult(`노트 저장: ${file}`, false, "📝");
      } catch (e) {
        return textResult(`capture_note 실패: ${(e as Error).message}`, true, "📝");
      }
    },
  );

  server.registerTool(
    "search_notes",
    {
      title: "Search notes",
      description:
        "Semantically search second-brain notes. Returns matching snippets with [label/path]. " +
        "folder limits the search to one notes folder (label); default searches all. See whoami for labels.",
      inputSchema: {
        query: z.string().describe("What to find in your notes"),
        limit: z.number().int().min(1).max(20).optional().describe("Max snippets (default 5)"),
        folder: z.string().optional().describe("Limit to one notes folder label (default: all)"),
      },
    },
    async ({ query, limit, folder }) => {
      try {
        const hits = await searchNotes(query, limit ?? 5, folder);
        if (!hits.length) return textResult("관련 노트 없음", false, "🔍");
        return textResult(
          hits.map((h) => `(${h.score.toFixed(3)}) [${h.path}]\n${h.text.slice(0, 280)}`).join("\n\n"),
          false, "🔍",
        );
      } catch (e) {
        return textResult(`search_notes 실패: ${(e as Error).message}`, true, "🔍");
      }
    },
  );

  server.registerTool(
    "ask_brain",
    {
      title: "Ask second-brain (RAG)",
      description:
        "Answer a question grounded ONLY in second-brain notes (RAG). Cites source note paths. " +
        "folder limits retrieval to one notes folder (label); default uses all. See whoami for labels.",
      inputSchema: {
        question: z.string().describe("Question to answer from your notes"),
        k: z.number().int().min(1).max(20).optional().describe("Notes to retrieve (default 5)"),
        folder: z.string().optional().describe("Limit to one notes folder label (default: all)"),
      },
    },
    async ({ question, k, folder }) => {
      try {
        const { answer, sources } = await askBrain(question, k ?? 5, folder);
        const cite = sources.length ? `\n\n출처: ${sources.join(", ")}` : "";
        return textResult(answer + cite, false, "🧠");
      } catch (e) {
        return textResult(`ask_brain 실패: ${(e as Error).message}`, true, "🧠");
      }
    },
  );

  // ── 관리(열람·삭제): 쌓인 기억/노트를 대화로 보고 정리 ───────────────
  server.registerTool(
    "list_memories",
    {
      title: "List memories",
      description:
        "List stored memories for this user (most recent first) to review what's accumulated. " +
        "Returns numbered items with content, id, date. Use this to find a memory's id before delete_memory. " +
        "Unlike recall (semantic search), this lists everything.",
      inputSchema: {
        user_id: z.string().optional().describe(`Memory owner (default: ${MEMORY_USER})`),
        limit: z.number().int().min(1).max(100).optional().describe("Max items (default 30)"),
      },
    },
    async ({ user_id, limit }) => {
      const u = user_id || MEMORY_USER;
      const url = `${OPENMEMORY_URL}/api/v1/memories/?user_id=${encodeURIComponent(u)}&page=1&size=${limit ?? 30}&sort_column=created_at&sort_direction=desc`;
      const res = await fetch(url);
      if (!res.ok) return textResult(`list_memories 실패 (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`, true);
      const j: any = await res.json();
      const items: any[] = j.items ?? [];
      if (!items.length) return textResult(`저장된 기억이 없습니다 (user=${u}).`, false, "📋");
      const lines = items.map((m, i) => {
        const date = typeof m.created_at === "number" ? ` (${new Date(m.created_at * 1000).toISOString().slice(0, 10)})` : "";
        return `${i + 1}. ${String(m.content ?? "").trim()}  ⟨id:${m.id}⟩${date}`;
      });
      return textResult(`기억 ${items.length}개 (user=${u}):\n${lines.join("\n")}`, false, "📋");
    },
  );

  server.registerTool(
    "delete_memory",
    {
      title: "Delete memory",
      description:
        "Permanently delete ONE stored memory by its id (get the id from list_memories). " +
        "Use when the user asks to remove/forget a specific memory. Cannot be undone.",
      inputSchema: {
        memory_id: z.string().describe("Memory id from list_memories"),
        user_id: z.string().optional().describe(`Memory owner (default: ${MEMORY_USER})`),
      },
    },
    async ({ memory_id, user_id }) => {
      const u = user_id || MEMORY_USER;
      const res = await fetch(`${OPENMEMORY_URL}/api/v1/memories/`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memory_ids: [memory_id], user_id: u }),
      });
      if (!res.ok) return textResult(`delete_memory 실패 (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`, true, "🗑️");
      return textResult(`기억 삭제됨: ${memory_id}`, false, "🗑️");
    },
  );

  server.registerTool(
    "list_notes",
    {
      title: "List notes",
      description:
        "List second-brain note files as 'label/filename' (optional folder label to limit). " +
        "Use to see what notes exist before search_notes/delete_note.",
      inputSchema: {
        folder: z.string().optional().describe("Limit to one notes folder label (default: all)"),
      },
    },
    async ({ folder }) => {
      try {
        const notes = listNotes(folder);
        if (!notes.length) return textResult(folder ? `'${folder}' 폴더에 노트가 없습니다.` : "노트가 없습니다.", false, "📋");
        return textResult(`노트 ${notes.length}개:\n${notes.map((n, i) => `${i + 1}. ${n.path}`).join("\n")}`, false, "📋");
      } catch (e) {
        return textResult(`list_notes 실패: ${(e as Error).message}`, true, "📋");
      }
    },
  );

  server.registerTool(
    "delete_note",
    {
      title: "Delete note",
      description:
        "Permanently delete ONE second-brain note file by its 'label/filename' (from list_notes or search_notes), then reindex. " +
        "Use when the user asks to remove a specific note. Deletes the file; cannot be undone.",
      inputSchema: {
        path: z.string().describe("Note path 'label/filename' from list_notes"),
      },
    },
    async ({ path: notePath }) => {
      try {
        const ok = await deleteNote(notePath);
        return ok
          ? textResult(`노트 삭제: ${notePath}`, false, "🗑️")
          : textResult(`삭제 실패: '${notePath}' 를 찾지 못했습니다(목록은 list_notes).`, true, "🗑️");
      } catch (e) {
        return textResult(`delete_note 실패: ${(e as Error).message}`, true, "🗑️");
      }
    },
  );

  return server;
}
