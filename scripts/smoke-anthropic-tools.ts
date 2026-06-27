/**
 * 공식 Anthropic SDK로 /v1/messages의 tool_use(함수 호출)를 검증한다.
 *
 *   npm run smoke:anthropic:tools
 *   MODEL=codex:gpt-5.5 npm run smoke:anthropic:tools
 *
 * 서버(npm run dev)가 먼저 떠 있어야 한다.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { Tool, MessageParam } from "@anthropic-ai/sdk/resources/messages";

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

const tools: Tool[] = [
  {
    name: "get_weather",
    description: "Get the current weather for a city",
    input_schema: {
      type: "object",
      properties: { city: { type: "string", description: "City name" } },
      required: ["city"],
    },
  },
];

async function testToolRoundTrip(): Promise<void> {
  try {
    const first = await client.messages.create({
      model,
      max_tokens: 512,
      tools,
      messages: [{ role: "user", content: "What's the weather in Seoul? Call the tool." }],
    });
    const toolUse = first.content.find((b) => b.type === "tool_use");
    if (first.stop_reason !== "tool_use" || !toolUse || toolUse.type !== "tool_use") {
      throw new Error(`tool_use 기대했으나: stop=${first.stop_reason}`);
    }
    ok(`tool_use → ${toolUse.name}(${JSON.stringify(toolUse.input)})`);

    const followUp: MessageParam[] = [
      { role: "user", content: "What's the weather in Seoul? Call the tool." },
      { role: "assistant", content: first.content },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: toolUse.id, content: "sunny, 25C" }],
      },
    ];
    const second = await client.messages.create({ model, max_tokens: 512, tools, messages: followUp });
    const text = second.content.find((b) => b.type === "text");
    if (second.stop_reason !== "end_turn" || !text || text.type !== "text" || !text.text) {
      throw new Error(`최종 답변 실패: stop=${second.stop_reason}`);
    }
    ok(`최종 답변 → ${JSON.stringify(text.text.slice(0, 70))}`);
  } catch (e) {
    fail("tool round-trip", e);
  }
}

async function testNoToolNeeded(): Promise<void> {
  try {
    const res = await client.messages.create({
      model,
      max_tokens: 256,
      tools,
      messages: [{ role: "user", content: "Say the single word: hello" }],
    });
    if (res.content.some((b) => b.type === "tool_use")) throw new Error("불필요한 tool_use 발생");
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text" || !text.text) throw new Error("빈 텍스트");
    ok(`no-tool → ${JSON.stringify(text.text.slice(0, 50))}`);
  } catch (e) {
    fail("no-tool", e);
  }
}

async function testStreamingToolUse(): Promise<void> {
  try {
    const stream = client.messages.stream({
      model,
      max_tokens: 512,
      tools,
      messages: [{ role: "user", content: "Weather in Busan? Use the tool." }],
    });
    const final = await stream.finalMessage();
    const toolUse = final.content.find((b) => b.type === "tool_use");
    if (final.stop_reason !== "tool_use" || !toolUse || toolUse.type !== "tool_use") {
      throw new Error(`stop=${final.stop_reason}`);
    }
    ok(`streaming tool_use → ${toolUse.name}(${JSON.stringify(toolUse.input)})`);
  } catch (e) {
    fail("streaming tool_use", e);
  }
}

async function main(): Promise<void> {
  console.log(`cli2port Anthropic tool_use 스모크 → ${baseURL} (model=${model})\n`);
  await testToolRoundTrip();
  await testNoToolNeeded();
  await testStreamingToolUse();
  console.log("\n\x1b[32m모든 테스트 통과\x1b[0m");
}

main();
