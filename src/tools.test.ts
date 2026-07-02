/**
 * tools.ts 단위 테스트 — 프롬프트 기반 함수호출의 정규화·파싱(순수 함수).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeOpenAITools,
  normalizeOpenAIChoice,
  normalizeAnthropicTools,
  normalizeAnthropicChoice,
  buildToolSystemPrompt,
  parseToolCalls,
} from "./tools.js";

describe("normalizeOpenAITools", () => {
  it("function.name이 있는 도구만 뽑아 정규화한다", () => {
    const tools = [
      { type: "function", function: { name: "search", description: "d", parameters: { a: 1 } } },
      { type: "function", function: {} }, // name 없음 → 제외
    ];
    const out = normalizeOpenAITools(tools);
    assert.equal(out.length, 1);
    assert.deepEqual(out[0], { name: "search", description: "d", parameters: { a: 1 } });
  });

  it("배열이 아니면 빈 배열", () => {
    assert.deepEqual(normalizeOpenAITools(undefined), []);
    assert.deepEqual(normalizeOpenAITools({}), []);
  });
});

describe("normalizeAnthropicTools", () => {
  it("name(string)이 있는 도구만 정규화하고 input_schema를 parameters로 옮긴다", () => {
    const tools = [
      { name: "get_weather", description: "d", input_schema: { type: "object" } },
      { description: "no name" },
    ];
    const out = normalizeAnthropicTools(tools);
    assert.equal(out.length, 1);
    assert.deepEqual(out[0], { name: "get_weather", description: "d", parameters: { type: "object" } });
  });

  it("배열이 아니면 빈 배열", () => {
    assert.deepEqual(normalizeAnthropicTools(null), []);
  });
});

describe("normalizeOpenAIChoice", () => {
  it('"none" → none', () => {
    assert.equal(normalizeOpenAIChoice("none"), "none");
  });
  it('"required" → mode required', () => {
    assert.deepEqual(normalizeOpenAIChoice("required"), { mode: "required" });
  });
  it("function 지정 → forced", () => {
    assert.deepEqual(normalizeOpenAIChoice({ function: { name: "f" } }), {
      mode: "required",
      forced: "f",
    });
  });
  it("그 외 → auto", () => {
    assert.deepEqual(normalizeOpenAIChoice(undefined), { mode: "auto" });
  });
});

describe("normalizeAnthropicChoice", () => {
  it("type any → required", () => {
    assert.deepEqual(normalizeAnthropicChoice({ type: "any" }), { mode: "required" });
  });
  it("type tool → forced", () => {
    assert.deepEqual(normalizeAnthropicChoice({ type: "tool", name: "f" }), {
      mode: "required",
      forced: "f",
    });
  });
  it("type none → none", () => {
    assert.equal(normalizeAnthropicChoice({ type: "none" }), "none");
  });
  it("없음/auto → auto", () => {
    assert.deepEqual(normalizeAnthropicChoice(undefined), { mode: "auto" });
    assert.deepEqual(normalizeAnthropicChoice({ type: "auto" }), { mode: "auto" });
  });
});

describe("buildToolSystemPrompt", () => {
  it("forced 선택이면 특정 도구 강제 지시문을 넣는다", () => {
    const p = buildToolSystemPrompt([{ name: "f" }], { mode: "required", forced: "f" });
    assert.match(p, /반드시 "f" 도구를 호출/);
  });
  it("required면 하나 이상 호출 지시문", () => {
    const p = buildToolSystemPrompt([{ name: "f" }], { mode: "required" });
    assert.match(p, /반드시 하나 이상의 도구를 호출/);
  });
});

describe("parseToolCalls", () => {
  it("정상 tool_calls JSON을 파싱한다", () => {
    const text = '{"tool_calls":[{"name":"search","arguments":{"q":"hi"}}]}';
    const calls = parseToolCalls(text);
    assert.ok(calls);
    assert.equal(calls!.length, 1);
    assert.equal(calls![0].name, "search");
    assert.deepEqual(calls![0].arguments, { q: "hi" });
  });

  it("코드펜스로 감싼 JSON도 파싱한다(모델이 ```json 붙인 경우)", () => {
    const text = '```json\n{"tool_calls":[{"name":"f","arguments":{}}]}\n```';
    const calls = parseToolCalls(text);
    assert.ok(calls);
    assert.equal(calls![0].name, "f");
  });

  it("앞뒤 잡담 텍스트가 있어도 첫 균형 JSON을 추출한다", () => {
    const text = '알겠습니다: {"tool_calls":[{"name":"f","arguments":{"x":1}}]} 입니다';
    const calls = parseToolCalls(text);
    assert.ok(calls);
    assert.deepEqual(calls![0].arguments, { x: 1 });
  });

  it("tool_calls가 없는 일반 텍스트는 null", () => {
    assert.equal(parseToolCalls("그냥 평범한 답변입니다."), null);
  });

  it("불균형/깨진 JSON은 null", () => {
    assert.equal(parseToolCalls('{"tool_calls":[{"name":'), null);
  });

  it("arguments가 객체가 아니면 빈 객체로 정규화한다", () => {
    const text = '{"tool_calls":[{"name":"f","arguments":"문자열"}]}';
    const calls = parseToolCalls(text);
    assert.ok(calls);
    assert.deepEqual(calls![0].arguments, {});
  });

  it("name 없는 항목은 걸러내고, 유효한 게 하나도 없으면 null", () => {
    const text = '{"tool_calls":[{"arguments":{}}]}';
    assert.equal(parseToolCalls(text), null);
  });
});
