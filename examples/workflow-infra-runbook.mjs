// 인프라/SRE 워크플로우 — 서버별 런북 적재 → 장애 기록 → 그 서버 한정 RAG.
// 서버마다 MCP_INSTANCE/OPENMEMORY_USER를 다르게 주면 인스턴스별로 격리된다.
//   make up && make build
//   MCP_INSTANCE=db-server NOTES_DIR=/srv/runbooks/db node examples/workflow-infra-runbook.mjs
import { capture, askBrain, notesDir } from "../dist/brain.js";

const INSTANCE = process.env.MCP_INSTANCE ?? "demo-server";
const OM = (process.env.OPENMEMORY_URL ?? "http://localhost:8767") + "/api/v1/memories";
const USER = process.env.OPENMEMORY_USER ?? "localmind";

async function remember(text) {
  try {
    await fetch(OM + "/", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: USER, text, infer: false }) });
  } catch {}
}

console.log(`서버: ${INSTANCE}  노트: ${notesDir()}`);

// 1) 런북/스펙 적재 (그 서버의 NOTES_DIR에 .md로)
await capture(
  `${INSTANCE}: PostgreSQL 16, 32GB RAM, 일일 백업 02:00(UTC), 커넥션 풀 max=100, 모니터링 Grafana.`,
  `${INSTANCE} 런북`,
);

// 2) 장애 기록 (진화 기억)
await remember(`${INSTANCE} 장애 2026-06-27 03:12: 커넥션 풀 고갈로 5분 지연. 조치: max 100→200, 슬로우쿼리 인덱스 추가.`);

// 3) 그 서버 한정 RAG
const { answer, sources } = await askBrain(`${INSTANCE}의 스펙과 백업 정책을 정리해줘`);
console.log("\n## 런북 RAG\n" + answer);
console.log("출처:", sources.join(", "));

console.log("\n💡 워크플로우: 서버별 인스턴스 → 런북 capture_note → 장애 remember → 회고/온콜에 ask_brain (그 서버만)");
