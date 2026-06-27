/**
 * 공식 OpenAI SDK로 함수 호출(A2 프롬프트 PoC)을 검증한다.
 *
 *   npm run smoke:tools
 *   MODEL=gpt-5.5 npm run smoke:tools   # codex 백엔드로
 *
 * 서버(npm run dev)가 먼저 떠 있어야 한다.
 */
import OpenAI from "openai";
import type { ChatCompletionTool } from "openai/resources/chat/completions";

const baseURL = (process.env.BASE_URL ?? "http://127.0.0.1:8787") + "/v1";
const apiKey = process.env.CLI2PORT_API_KEY ?? "not-needed";
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

const tools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get the current weather for a city",
      parameters: {
        type: "object",
        properties: { city: { type: "string", description: "City name" } },
        required: ["city"],
      },
    },
  },
];

/** 1) 도구가 필요한 질문 → tool_calls, 2) 결과 전달 → 최종 답변 */
async function testToolRoundTrip(): Promise<void> {
  try {
    const first = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "What's the weather in Seoul? Call the tool." }],
      tools,
    });
    const choice = first.choices[0];
    const calls = choice.message.tool_calls;
    if (choice.finish_reason !== "tool_calls" || !calls?.length) {
      throw new Error(`tool_calls 기대했으나: finish=${choice.finish_reason}`);
    }
    const call = calls[0];
    const args = JSON.parse(call.function.arguments);
    ok(`tool_call → ${call.function.name}(${JSON.stringify(args)})`);

    const second = await client.chat.completions.create({
      model,
      messages: [
        { role: "user", content: "What's the weather in Seoul? Call the tool." },
        choice.message,
        { role: "tool", tool_call_id: call.id, content: "sunny, 25C" },
      ],
      tools,
    });
    // 메커니즘 검증: 도구 결과를 받은 뒤 텍스트 답변으로 이어가는지.
    // (주입한 결과를 얼마나 충실히 반영하는지는 백엔드 특성에 따라 다름 — README 참고)
    const answer = second.choices[0].message.content ?? "";
    if (second.choices[0].finish_reason !== "stop" || !answer) {
      throw new Error(`최종 답변 실패: finish=${second.choices[0].finish_reason}`);
    }
    ok(`최종 답변 → ${JSON.stringify(answer.slice(0, 70))}`);
  } catch (e) {
    fail("tool round-trip", e);
  }
}

/** 도구가 필요 없는 질문 → 일반 텍스트(도구 호출 없음) */
async function testNoToolNeeded(): Promise<void> {
  try {
    const res = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: "Say the single word: hello" }],
      tools,
    });
    const choice = res.choices[0];
    if (choice.message.tool_calls?.length) throw new Error("불필요한 도구 호출 발생");
    if (!choice.message.content) throw new Error("빈 텍스트 응답");
    ok(`no-tool → ${JSON.stringify(choice.message.content.slice(0, 50))}`);
  } catch (e) {
    fail("no-tool", e);
  }
}

/** 스트리밍 + 도구 호출 (SDK가 tool_calls 델타를 재조립) */
async function testStreamingToolCall(): Promise<void> {
  try {
    const stream = await client.chat.completions.create({
      model,
      stream: true,
      messages: [{ role: "user", content: "Weather in Busan? Use the tool." }],
      tools,
    });
    const acc: Record<number, { name: string; args: string }> = {};
    let finish = "";
    for await (const chunk of stream) {
      const d = chunk.choices[0]?.delta;
      for (const tc of d?.tool_calls ?? []) {
        const slot = (acc[tc.index] ??= { name: "", args: "" });
        if (tc.function?.name) slot.name = tc.function.name;
        if (tc.function?.arguments) slot.args += tc.function.arguments;
      }
      if (chunk.choices[0]?.finish_reason) finish = chunk.choices[0].finish_reason;
    }
    const first = acc[0];
    if (finish !== "tool_calls" || !first?.name) throw new Error(`finish=${finish}`);
    ok(`streaming tool_call → ${first.name}(${first.args}) finish=${finish}`);
  } catch (e) {
    fail("streaming tool_call", e);
  }
}

async function main(): Promise<void> {
  console.log(`cli2port 함수 호출 스모크 테스트 → ${baseURL} (model=${model})\n`);
  await testToolRoundTrip();
  await testNoToolNeeded();
  await testStreamingToolCall();
  console.log("\n\x1b[32m모든 테스트 통과\x1b[0m");
}

main();
