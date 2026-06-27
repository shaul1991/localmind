// second-brain을 코드로 — .md 노트를 정본으로 저장/검색/RAG. 먼저 `make build`.
// 내 기존 노트 폴더(Obsidian 등)를 가리키면 그 지식으로 바로 RAG:
//   NOTES_DIR=~/my-notes BRAIN_INDEX=~/.localmind/idx.json node examples/brain-node.mjs
import { capture, searchNotes, askBrain, notesDir } from "../dist/brain.js";

console.log("노트 폴더:", notesDir());

// 1) 노트 저장(정본 .md 생성 + 인덱싱)
const file = await capture(
  "localmind의 second-brain은 NOTES_DIR의 마크다운을 정본으로 RAG한다. 인덱스(.brain-index.json)는 파생물이라 재생성 가능.",
  "localmind 노트 RAG 메모",
);
console.log("저장:", file);

// 2) 의미 검색
console.log("\n[검색] '노트는 어떻게 인덱싱되나'");
for (const h of await searchNotes("노트는 어떻게 인덱싱되나", 3))
  console.log(`  (${h.score.toFixed(3)}) [${h.path}] ${h.text.slice(0, 60)}…`);

// 3) RAG — 내 노트만 근거로 답하고 출처 인용
const { answer, sources } = await askBrain("localmind는 노트를 어떻게 다루나?");
console.log("\n[RAG]\n" + answer);
console.log("출처:", sources.join(", "));
