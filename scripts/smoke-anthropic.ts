/**
 * 공식 Anthropic SDK로 cli2port의 /v1/messages 드롭인 호환성을 검증한다.
 *
 *   npm run smoke:anthropic
 *   BASE_URL=... MODEL=claude-sonnet-4-6 npm run smoke:anthropic
 *
 * 서버(npm run dev)가 먼저 떠 있어야 한다.
 */
import Anthropic from "@anthropic-ai/sdk";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:8787";
const apiKey = process.env.CLI2PORT_API_KEY ?? "not-needed";
const model = process.env.MODEL ?? "sonnet";

const client = new Anthropic({ baseURL, apiKey });

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
    const res = await client.messages.create({
      model,
      max_tokens: 256,
      system: "You are terse.",
      messages: [{ role: "user", content: "Reply with exactly: PONG" }],
    });
    const block = res.content[0];
    const text = block && block.type === "text" ? block.text : "";
    if (!text) throw new Error("빈 응답");
    ok(`non-streaming (${model}) → ${JSON.stringify(text.slice(0, 60))} | usage=${JSON.stringify(res.usage)} | stop=${res.stop_reason}`);
  } catch (e) {
    fail("non-streaming", e);
  }
}

async function testStreaming(): Promise<void> {
  try {
    let text = "";
    const stream = client.messages
      .stream({
        model,
        max_tokens: 256,
        messages: [{ role: "user", content: "Count 1 to 3, comma separated." }],
      })
      .on("text", (t) => {
        text += t;
      });
    const final = await stream.finalMessage();
    if (!text) throw new Error("스트리밍 텍스트 없음");
    ok(`streaming (${model}) → ${JSON.stringify(text.slice(0, 60))} | usage=${JSON.stringify(final.usage)}`);
  } catch (e) {
    fail("streaming", e);
  }
}

async function main(): Promise<void> {
  console.log(`cli2port Anthropic 스모크 테스트 → ${baseURL} (model=${model})\n`);
  await testNonStreaming();
  await testStreaming();
  console.log("\n\x1b[32m모든 테스트 통과\x1b[0m");
}

main();
