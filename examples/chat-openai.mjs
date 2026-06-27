// OpenAI SDK(Node)로 localmind 채팅. baseURL만 교체.
//   npm i openai && node examples/chat-openai.mjs
import OpenAI from "openai";

const client = new OpenAI({ baseURL: "http://localhost:4000/v1", apiKey: "sk-local" });

const r = await client.chat.completions.create({
  model: "sonnet",
  messages: [{ role: "user", content: "TypeScript의 Result<T,E> 타입 패턴을 짧은 예시로" }],
});
console.log(r.choices[0].message.content);

// 스트리밍이 필요하면 stream: true
const stream = await client.chat.completions.create({
  model: "sonnet",
  stream: true,
  messages: [{ role: "user", content: "1부터 5까지 세어줘" }],
});
process.stdout.write("\n[stream] ");
for await (const chunk of stream) process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
process.stdout.write("\n");
