/**
 * 공식 OpenAI SDK로 localmind의 드롭인 호환성을 검증하는 스모크 테스트.
 *
 *   npm run smoke               # 기본 http://127.0.0.1:8787, 모델 sonnet
 *   BASE_URL=... MODEL=gpt-5.5 npm run smoke
 *
 * 서버(npm run dev)가 먼저 떠 있어야 한다.
 */
import OpenAI from "openai";

const baseURL = (process.env.BASE_URL ?? "http://127.0.0.1:8787") + "/v1";
const apiKey = process.env.LOCALMIND_API_KEY ?? "not-needed";
const model = process.env.MODEL ?? "sonnet";

const client = new OpenAI({ baseURL, apiKey });

function ok(label: string): void {
  console.log(`\x1b[32m✓\x1b[0m ${label}`);
}
function fail(label: string, err: unknown): never {
  console.error(`\x1b[31m✗\x1b[0m ${label}`);
  console.error(err);
  process.exit(1);
}

async function testNonStreaming(): Promise<void> {
  try {
    const res = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "Reply with exactly: PONG" }],
    });
    const content = res.choices[0]?.message?.content ?? "";
    if (!content) throw new Error("빈 응답");
    ok(`non-streaming (${model}) → ${JSON.stringify(content.slice(0, 60))} | usage=${JSON.stringify(res.usage)}`);
  } catch (e) {
    fail("non-streaming", e);
  }
}

async function testStreaming(): Promise<void> {
  try {
    const stream = await client.chat.completions.create({
      model,
      stream: true,
      stream_options: { include_usage: true },
      messages: [{ role: "user", content: "Count 1 to 3, comma separated." }],
    });
    let text = "";
    let usageSeen = false;
    for await (const chunk of stream) {
      text += chunk.choices[0]?.delta?.content ?? "";
      if (chunk.usage) usageSeen = true;
    }
    if (!text) throw new Error("스트리밍 텍스트 없음");
    ok(`streaming (${model}) → ${JSON.stringify(text.slice(0, 60))} | usage=${usageSeen}`);
  } catch (e) {
    fail("streaming", e);
  }
}

async function testModels(): Promise<void> {
  try {
    const list = await client.models.list();
    const ids = list.data.map((m) => m.id);
    if (ids.length === 0) throw new Error("모델 목록 비어있음");
    ok(`models.list → ${ids.length}개 (${ids.slice(0, 3).join(", ")}...)`);
  } catch (e) {
    fail("models.list", e);
  }
}

async function main(): Promise<void> {
  console.log(`localmind 스모크 테스트 → ${baseURL} (model=${model})\n`);
  await testModels();
  await testNonStreaming();
  await testStreaming();
  console.log("\n\x1b[32m모든 테스트 통과\x1b[0m");
}

main();
