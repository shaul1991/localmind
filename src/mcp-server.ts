/**
 * localmind MCP 서버 정의(도구 등록). stdio transport로 로컬에서만 동작한다.
 *
 * 도구: whoami · capture_note · search_notes
 * (great-reduction 2026-07-21 — 도구 표면 15→3, specs/202607211617-great-reduction)
 *
 * 이 모듈은 stdout에 아무것도 쓰지 않는다(stdio transport 전용).
 */
import os from "node:os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { capture, listFolders, notesDir, searchNotes } from "./brain.js";

// 이 두뇌의 정체 — 호스트명으로 식별한다(복수 기기 구분). whoami가 보고한다.
export const BRAIN_ID = os.hostname().trim();

function textResult(text: string, isError = false, emoji = "") {
  return { content: [{ type: "text" as const, text: emoji ? `${emoji} ${text}` : text }], isError };
}

export function configSummary(): string {
  return `brain=${BRAIN_ID}, notes=${notesDir()}`;
}

/** 도구가 모두 등록된 새 McpServer를 만든다(HTTP stateless는 요청마다 새로 생성). */
export function buildServer(): McpServer {
  const server = new McpServer({ name: "localmind", version: "0.2.0" });

  // ── whoami: 이 두뇌가 어떤 노트를 쓰는지 ─────────────────────────
  server.registerTool(
    "whoami",
    {
      title: "Which brain (notes)",
      description:
        "Report which brain this is — the host id and notes folder(s) in use. " +
        "Use before capture/search to confirm you're on the right notes.",
      inputSchema: {},
    },
    async () => {
      const folders = listFolders().map((f) => `  - ${f.label}: ${f.dir}`).join("\n");
      return textResult(
        `brain: ${BRAIN_ID}\n` + `notes folders (label: path):\n${folders}`,
        false, "🧠",
      );
    },
  );

  // ── second-brain: .md 노트 capture·검색 ─────────────────────────
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
        tags: z.array(z.string()).optional().describe("Optional frontmatter tags (e.g. [\"decision\"] for decision-log notes — specs/032)"),
      },
    },
    async ({ text, title, folder, tags: noteTags }) => {
      try {
        const { path: file, validationStatus, retried, tags } = await capture(text, title, folder, noteTags);
        const statusLine =
          validationStatus === "confirmed"
            ? "✅ 인덱싱 확인됨"
            : validationStatus === "unconfirmed"
              ? `⚠️ 인덱싱 미확인 — 수동 \`make reindex\` 권장${retried ? " (재시도 후에도 미확인)" : ""}`
              : "";
        // specs/017 FR-9 — 데이터를 변형한 개입(태그)은 표시한다(무엇이 기록됐는지 통지).
        const tagLine = tags?.length ? `🏷 태그: ${tags.join(", ")} (바꾸려면 노트 파일에서 직접 수정 — 보존됩니다)` : "";
        const msg = [`노트 저장: ${file}`, statusLine, tagLine].filter(Boolean).join("\n");
        return textResult(msg, false, "📝");
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

  return server;
}
