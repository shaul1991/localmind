/**
 * localmind MCP 서버를 공식 MCP 클라이언트 SDK로 검증한다.
 *   npm run smoke:mcp
 * 기본 모드는 무전제로 도구 표면과 whoami를 확인한다. LOCALMIND_SMOKE_FULL_FLOW=1이면
 * 임베딩 설정을 사용하되 HOME·notes·index·query-log를 임시 경로로 강제해 capture/search/brief까지 확인한다.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

function textOf(res: any): string {
  const text = res?.content?.filter((c: any) => c?.type === "text").map((c: any) => c.text).join("\n");
  return text || JSON.stringify(res);
}
function ok(label: string) {
  console.log(`\x1b[32m✓\x1b[0m ${label}`);
}

async function main() {
  const fullFlow = process.env.LOCALMIND_SMOKE_FULL_FLOW === "1";
  const testEntryAllowed = process.env.LOCALMIND_SMOKE_ALLOW_TEST_ENTRY === "1";
  const mcpEntry = testEntryAllowed && process.env.LOCALMIND_SMOKE_MCP_ENTRY_FOR_TEST
    ? process.env.LOCALMIND_SMOKE_MCP_ENTRY_FOR_TEST
    : "dist/mcp.js";
  let isolatedRoot = "";
  const childEnv = { ...process.env } as Record<string, string>;
  if (fullFlow) {
    isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "localmind-smoke-full-"));
    const notesDir = path.join(isolatedRoot, "notes");
    const stateDir = path.join(isolatedRoot, "state");
    const isolatedHome = path.join(isolatedRoot, "home");
    fs.mkdirSync(notesDir, { recursive: true });
    fs.mkdirSync(stateDir, { recursive: true });
    fs.mkdirSync(isolatedHome, { recursive: true });
    childEnv.HOME = isolatedHome;
    childEnv.NOTES_DIR = `smoke=${notesDir}`;
    childEnv.BRAIN_INDEX = path.join(stateDir, "index.json");
    childEnv.QUERY_LOG = path.join(stateDir, "query-log.jsonl");
  }
  const transport = new StdioClientTransport({
    command: "node",
    args: [mcpEntry],
    env: childEnv,
  });
  const client = new Client({ name: "smoke-mcp", version: "0.1.0" });
  try {
    await client.connect(transport);

    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name).sort();
    ok(`tools/list → ${names.join(", ")}`);
    const expected = ["brief", "capture_note", "search_notes", "whoami"];
    if (JSON.stringify(names) !== JSON.stringify(expected)) {
      throw new Error(`도구 표면이 다릅니다 — 기대 ${expected.join(",")} / 실제 ${names.join(",")}`);
    }

    const w = await client.callTool({ name: "whoami", arguments: {} });
    const whoamiText = textOf(w);
    if (w.isError) throw new Error(`whoami가 오류를 반환했습니다 — ${whoamiText.slice(0, 120)}`);

    const expectedLabelsRaw = process.env.LOCALMIND_SMOKE_EXPECTED_LABELS;
    if (!fullFlow && expectedLabelsRaw !== undefined) {
      const safeLabel = /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,63}$/u;
      const expectedLabels = [...new Set(expectedLabelsRaw.split(",").map((s) => s.trim()).filter(Boolean))].sort();
      if (!expectedLabels.length || expectedLabels.some((label) => !safeLabel.test(label))) {
        throw new Error("기대 노트 폴더 라벨 설정이 공개-safe 형식이 아닙니다.");
      }
      const marker = "notes folder labels:";
      const markerIndex = whoamiText.split("\n").findIndex((line) => line.trim() === marker);
      const actualLabels = markerIndex < 0
        ? []
        : [...new Set(whoamiText.split("\n").slice(markerIndex + 1)
            .map((line) => /^\s*-\s+(.+?)\s*$/.exec(line)?.[1] ?? "")
            .filter(Boolean))].sort();
      if (JSON.stringify(actualLabels) !== JSON.stringify(expectedLabels)) {
        throw new Error(`노트 폴더 라벨이 다릅니다 — 기대 ${expectedLabels.join(",")} / 실제 ${actualLabels.join(",")}`);
      }
    }
    ok(`whoami → ${JSON.stringify(whoamiText.slice(0, 80))}`);

    if (fullFlow) {
      const marker = `localmind isolated full smoke synthetic marker ${crypto.randomUUID()}`;
      const captured = await client.callTool({
        name: "capture_note",
        arguments: { title: "LocalMind isolated full smoke", text: marker },
      });
      const capturedText = textOf(captured);
      if (captured.isError) throw new Error(`capture_note가 오류를 반환했습니다 — ${capturedText.slice(0, 120)}`);
      const source = /^source:\s*(\S+)\s*$/m.exec(capturedText)?.[1];
      if (!source) throw new Error("capture_note 응답에서 공개 source를 확인하지 못했습니다.");
      ok(`capture_note → ${source}`);

      const searched = await client.callTool({ name: "search_notes", arguments: { query: marker, limit: 5 } });
      const searchedText = textOf(searched);
      if (searched.isError) throw new Error(`search_notes가 오류를 반환했습니다 — ${searchedText.slice(0, 120)}`);
      if (!searchedText.includes(`[${source}]`)) {
        throw new Error("search_notes 결과에서 방금 capture한 source를 확인하지 못했습니다.");
      }
      ok(`search_notes → ${source}`);

      const brief = await client.callTool({ name: "brief", arguments: { hint: marker } });
      const briefText = textOf(brief);
      if (brief.isError) throw new Error(`brief가 오류를 반환했습니다 — ${briefText.slice(0, 120)}`);
      ok("brief → non-error");
    }

    console.log(fullFlow ? "\n\x1b[32mMCP 격리 full-flow 통과\x1b[0m" : "\n\x1b[32mMCP 도구 표면 통과\x1b[0m");
  } finally {
    try { await client.close(); } catch { /* 원래 smoke 실패를 보존 */ }
    if (isolatedRoot) fs.rmSync(isolatedRoot, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error("\x1b[31m✗ 실패\x1b[0m", e);
  process.exit(1);
});
