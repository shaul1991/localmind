// 테크니컬 라이터 워크플로우 — 기존 노트 검색 → 근거 있는 초안(RAG) → 중복 방지.
//   make up && make build && NOTES_DIR=~/docs node examples/workflow-docs-draft.mjs
import { capture, searchNotes, askBrain } from "../dist/brain.js";

// (데모용) 문서 노트 한 개 적재 — 실제론 기존 문서 폴더를 NOTES_DIR로
await capture(
  "localmind 인증: LOCALMIND_API_KEY 설정 시 Authorization: Bearer 헤더 필요. 미설정 시 로컬 오픈.",
  "인증 가이드",
);

// 1) 이미 쓴 내용 확인(중복 방지)
console.log("## 기존 문서 검색: '인증 헤더'");
for (const h of await searchNotes("인증 헤더는 어떻게 보내나", 3))
  console.log(`  (${h.score.toFixed(3)}) [${h.path}] ${h.text.slice(0, 60)}…`);

// 2) 근거 있는 초안 (출처 인용)
const { answer, sources } = await askBrain("localmind 인증 방법을 사용자 문서용으로 정리해줘");
console.log("\n## 근거 기반 초안\n" + answer);
console.log("출처:", sources.join(", "));

console.log("\n💡 워크플로우: 문서폴더 NOTES_DIR → search_notes로 기존 확인 → ask_brain 근거 초안 → chat으로 톤 통일");
