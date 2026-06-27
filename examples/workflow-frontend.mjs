// 프론트엔드 워크플로우 — 컴포넌트 카피 변형 생성 + 접근성 검토(스트리밍).
//   make up && npm i openai && node examples/workflow-frontend.mjs
import OpenAI from "openai";

const client = new OpenAI({ baseURL: "http://localhost:4000/v1", apiKey: "sk-local" });

// 1) 빈 상태(empty state) 카피 3안
const r = await client.chat.completions.create({
  model: "sonnet",
  messages: [{ role: "user", content: "할 일이 하나도 없는 빈 상태 화면 카피 3안(각 1줄, 친근한 톤)" }],
});
console.log("## 빈 상태 카피 3안\n" + r.choices[0].message.content);

// 2) 접근성 검토 (스트리밍으로 즉시 미리보기)
console.log("\n## 접근성 검토 (스트리밍)");
const s = await client.chat.completions.create({
  model: "sonnet",
  stream: true,
  messages: [{ role: "user", content: "버튼 라벨 '확인'의 스크린리더 접근성 개선안을 1~2줄로" }],
});
for await (const c of s) process.stdout.write(c.choices[0]?.delta?.content ?? "");
console.log("\n\n💡 워크플로우: chat 초안 → 스트리밍 미리보기·반복 → `ask`로 접근성 검토 → 확정 문구는 capture_note");
