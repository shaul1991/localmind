/**
 * second-brain MCP 도구 검증 (search_notes / ask_brain / capture_note).
 *   npm run smoke:brain
 * 전제: gateway 스택(임베딩 :4000, 채팅 :8787)이 떠 있어야 한다.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

function textOf(res: any): string {
  const c = res?.content?.[0];
  return c && c.type === "text" ? c.text : JSON.stringify(res);
}
function ok(label: string) {
  console.log(`\x1b[32m✓\x1b[0m ${label}`);
}

async function main() {
  const NOTES_DIR = path.join(process.env.CLAUDE_JOB_DIR ?? os.tmpdir(), `brain-test-${Date.now()}`);
  fs.mkdirSync(NOTES_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(NOTES_DIR, "project.md"),
    "# localmind\n\nlocalmind는 로컬 claude/codex CLI 구독을 OpenAI·Anthropic 호환 API로 노출한다. 임베딩은 bge-m3 모델을 쓰고, 장기 기억은 mem0를 사용한다.",
  );
  fs.writeFileSync(
    path.join(NOTES_DIR, "infra.md"),
    "# 홈서버\n\n홈서버 OS는 우분투이고 모든 서비스를 도커로 돌린다. 외부에서는 tailscale 메시로 원격 접속한다.",
  );

  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/mcp.js"],
    env: { ...process.env, NOTES_DIR } as Record<string, string>,
  });
  const client = new Client({ name: "smoke-brain", version: "0.1.0" });
  await client.connect(transport);
  console.log(`notes dir: ${NOTES_DIR}\n`);

  const s = await client.callTool({
    name: "search_notes",
    arguments: { query: "임베딩 모델 뭐 쓰지?", limit: 2 },
  });
  ok(`search_notes → ${JSON.stringify(textOf(s).slice(0, 90))}`);

  const a = await client.callTool({
    name: "ask_brain",
    arguments: { question: "홈서버는 외부에서 어떻게 접속해?" },
  });
  ok(`ask_brain → ${JSON.stringify(textOf(a).slice(0, 110))}`);

  const c = await client.callTool({
    name: "capture_note",
    arguments: { text: "백업은 매주 일요일 새벽 3시에 외장 SSD로 자동 수행한다.", title: "백업 정책" },
  });
  ok(`capture_note → ${JSON.stringify(textOf(c).slice(0, 60))}`);

  const s2 = await client.callTool({
    name: "search_notes",
    arguments: { query: "백업은 언제 돌지?", limit: 1 },
  });
  ok(`search_notes(새 노트) → ${JSON.stringify(textOf(s2).slice(0, 90))}`);

  await client.close();
  console.log("\n\x1b[32m모든 second-brain 도구 통과\x1b[0m");
}

main().catch((e) => {
  console.error("\x1b[31m✗ 실패\x1b[0m", e);
  process.exit(1);
});
