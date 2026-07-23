/**
 * localmind MCP 서버 정의(도구 등록). stdio transport로 로컬에서만 동작한다.
 *
 * 도구: whoami · capture_note · search_notes · brief
 * (great-reduction 2026-07-21 — 도구 표면 15→3, specs/202607211617-great-reduction;
 *  living-memory — 결정 캡처 확장 + brief + 낡음 신호, specs/202607211621-living-memory)
 *
 * 이 모듈은 stdout에 아무것도 쓰지 않는다(stdio transport 전용).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { capture, listFolders, notesDir, searchNotes } from "./brain.js";
import {
  parseNoteDecision,
  staleAssumptions,
  staleSignalLine,
  staleThresholdDays,
  validateDecisionInput,
  type Decision,
  type DecisionInput,
} from "./decision.js";

// 이 두뇌의 정체 — 호스트명으로 식별한다(복수 기기 구분). whoami가 보고한다.
export const BRAIN_ID = os.hostname().trim();

// 서버 버전은 package.json이 정본 — 릴리스 bump가 그대로 반영되게 동적으로 읽는다(실패 시 폴백).
const PKG_VERSION: string = (() => {
  try {
    return JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

function textResult(text: string, isError = false, emoji = "") {
  return { content: [{ type: "text" as const, text: emoji ? `${emoji} ${text}` : text }], isError };
}

/** hit 경로("label/상대경로")로 노트 원문을 읽는다 — 실패는 null(신호·요약은 조용히 생략, AC-9). */
function readNoteByHitPath(hitPath: string): string | null {
  try {
    const slash = hitPath.indexOf("/");
    if (slash < 0) return null;
    const folder = listFolders().find((f) => f.label === hitPath.slice(0, slash));
    if (!folder) return null;
    return fs.readFileSync(path.join(folder.dir, hitPath.slice(slash + 1)), "utf8");
  } catch {
    return null;
  }
}

/** hit 경로들에서 결정 노트를 파싱한다(중복 경로 1회). 깨진 노트는 건너뛴다(AC-9). */
function collectDecisions(hitPaths: string[]): Array<{ path: string; decision: Decision }> {
  const out: Array<{ path: string; decision: Decision }> = [];
  for (const p of [...new Set(hitPaths)]) {
    const note = readNoteByHitPath(p);
    if (!note) continue;
    const decision = parseNoteDecision(note);
    if (decision) out.push({ path: p, decision });
  }
  return out;
}

/** 낡음 신호 라인들(FR-4) — 비차단: 본문 뒤에 부가만 하고 아무것도 막지 않는다. */
function staleSignals(decisions: Array<{ path: string; decision: Decision }>): string[] {
  const threshold = staleThresholdDays(process.env.BRIEF_STALE_DAYS);
  const now = new Date();
  const lines: string[] = [];
  for (const { path: p, decision } of decisions) {
    const stale = staleAssumptions(decision, now, threshold);
    if (stale.length) lines.push(staleSignalLine(p, stale));
  }
  return lines;
}

export function configSummary(): string {
  return `brain=${BRAIN_ID}, notes=${notesDir()}`;
}

/** 도구가 모두 등록된 새 McpServer를 만든다(HTTP stateless는 요청마다 새로 생성). */
export function buildServer(): McpServer {
  const server = new McpServer({ name: "localmind", version: PKG_VERSION });

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
        // living-memory FR-1 — 결정 3층(vision §4). 셋 중 하나라도 주면 choice·why 필수.
        choice: z.string().optional().describe("결정 캡처: 무엇을 골랐나 (why와 함께 제공)"),
        why: z.string().optional().describe("결정 캡처: 왜 골랐나 — 포기한 대안과 근거 (choice와 함께 제공)"),
        assumptions: z
          .array(z.object({
            // fact·volatility의 필수 검증은 핸들러(validateDecisionInput)가 평이한 한국어로
            // 안내한다(AC-3) — zod 레벨 필수로 두면 영어 프로토콜 에러가 먼저 나간다.
            fact: z.string().optional().describe("결정이 딛고 선 당시의 사실"),
            volatility: z.string().optional().describe('"high"(시간이 지나면 바뀔 수 있음) 또는 "low"(잘 안 바뀜)'),
          }))
          .optional()
          .describe("결정의 전제 목록 — 각 전제의 last_verified는 캡처 시각으로 자동 기록"),
      },
    },
    async ({ text, title, folder, tags: noteTags, choice, why, assumptions }) => {
      try {
        // 결정 파라미터가 하나라도 오면 결정 캡처로 취급 — 검증 실패 시 파일을 만들지 않는다(AC-3).
        let decision: DecisionInput | undefined;
        if (choice !== undefined || why !== undefined || assumptions !== undefined) {
          const err = validateDecisionInput({ choice, why, assumptions });
          if (err) return textResult(err, true, "📝");
          decision = { choice: choice!, why: why!, assumptions: assumptions as DecisionInput["assumptions"] };
        }
        const { path: file, validationStatus, retried, tags } = await capture(text, title, folder, noteTags, decision);
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
        const body = hits.map((h) => `(${h.score.toFixed(3)}) [${h.path}]\n${h.text.slice(0, 280)}`).join("\n\n");
        // living-memory FR-4 — 낡음 신호는 본문 뒤 부가만(비차단·본문 무변, AC-7). 실패는 조용히 생략(AC-9).
        const signals = staleSignals(collectDecisions(hits.map((h) => h.path)));
        return textResult(signals.length ? `${body}\n\n${signals.join("\n")}` : body, false, "🔍");
      } catch (e) {
        return textResult(`search_notes 실패: ${(e as Error).message}`, true, "🔍");
      }
    },
  );

  // ── brief: 세션 시작 브리핑 (living-memory FR-3 — vision §2-3 "가지고 시작하기") ──
  server.registerTool(
    "brief",
    {
      title: "Session brief",
      description:
        "세션 시작 브리핑 — 힌트(프로젝트·주제)로 관련 결정 노트를 찾아 선택·이유·전제 상태를 " +
        "요약해 반환한다. 새 세션이 과거 결정을 가지고 시작하게 하는 도구. " +
        "CLAUDE.md류 지침에 '세션 시작 시 brief 호출' 한 줄을 넣어 연결한다(런타임 중립).",
      inputSchema: {
        hint: z.string().describe("프로젝트나 주제 힌트 (예: 저장소 이름, 작업 주제)"),
        folder: z.string().optional().describe("Limit to one notes folder label (default: all)"),
      },
    },
    async ({ hint, folder }) => {
      try {
        const hits = await searchNotes(hint, 8, folder, "brief");
        const decisions = collectDecisions(hits.map((h) => h.path));
        if (!decisions.length) {
          return textResult(
            `"${hint}" 관련 결정 노트가 없습니다 — 아직 이 주제의 결정이 기록되지 않았어요. ` +
              "힌트를 바꿔보거나, 결정을 내리면 capture_note(choice·why·assumptions)로 기록해 보세요.",
            false, "🧭",
          );
        }
        const threshold = staleThresholdDays(process.env.BRIEF_STALE_DAYS);
        const now = new Date();
        const blocks = decisions.map(({ path: p, decision }) => {
          const staleFacts = new Set(staleAssumptions(decision, now, threshold).map((s) => s.fact));
          const assumptionLine = decision.assumptions.length
            ? decision.assumptions
                .map((a) => `${a.fact}(${a.volatility}${staleFacts.has(a.fact) ? " · 재검증 필요" : ""})`)
                .join(" · ")
            : "없음";
          const why = decision.why.replace(/\s+/g, " ").slice(0, 160);
          return `■ ${decision.choice} [${p}]\n  이유: ${why}\n  전제: ${assumptionLine}`;
        });
        const body = `브리핑 (hint: "${hint}") — 결정 ${decisions.length}건\n\n${blocks.join("\n\n")}`;
        const signals = staleSignals(decisions);
        return textResult(signals.length ? `${body}\n\n${signals.join("\n")}` : body, false, "🧭");
      } catch (e) {
        return textResult(`brief 실패: ${(e as Error).message}`, true, "🧭");
      }
    },
  );

  return server;
}
