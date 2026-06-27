// 연구자/지식노동자 워크플로우 — 노트 → 검색 → 종합(RAG) → 인사이트 기억 → 백업.
//   make up && make build && NOTES_DIR=~/research node examples/workflow-research-synthesis.mjs
import { capture, searchNotes, askBrain } from "../dist/brain.js";

const OM = (process.env.OPENMEMORY_URL ?? "http://localhost:8767") + "/api/v1/memories";
const USER = process.env.OPENMEMORY_USER ?? "localmind";
async function remember(text) {
  try {
    await fetch(OM + "/", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: USER, text, infer: false }) });
  } catch {}
}

// (데모) 연구 노트 2개 — 실제론 기존 논문/노트 폴더를 NOTES_DIR로
await capture("RAG는 검색된 근거로 환각을 줄이지만 검색 품질에 크게 의존한다.", "RAG 노트1");
await capture("하이브리드 검색(BM25+dense)이 단일 dense보다 재현율이 높은 경향.", "RAG 노트2");

// 1) 관련 발췌 검색
console.log("## 검색: 'RAG 정확도를 높이려면'");
for (const h of await searchNotes("RAG 정확도를 높이려면", 3))
  console.log(`  (${h.score.toFixed(3)}) ${h.text.slice(0, 50)}…`);

// 2) 종합(출처 인용)
const { answer, sources } = await askBrain("내 노트를 종합해 RAG 정확도를 높이는 방법은?");
console.log("\n## 종합\n" + answer + "\n출처: " + sources.join(", "));

// 3) 새 인사이트를 기억에 + git 백업 안내
await remember("인사이트: RAG 품질의 핵심은 검색 단계 — 하이브리드 검색부터 개선할 것.");
console.log("\n💡 워크플로우: NOTES_DIR → search_notes → ask_brain 종합 → remember → `make memory-export`로 git 백업");
