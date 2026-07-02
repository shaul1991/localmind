/**
 * transform.ts 단위 테스트 — 메시지 평탄화(순수 함수, 외부 의존 없음).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { contentToText, anthropicSystemToText, flattenMessages, flattenAnthropic } from "./transform.js";
import type { ChatMessage } from "./types.js";

describe("contentToText", () => {
  it("문자열 content는 그대로 반환한다", () => {
    assert.equal(contentToText("안녕하세요"), "안녕하세요");
  });

  it("null content는 빈 문자열", () => {
    assert.equal(contentToText(null), "");
  });

  it("텍스트 파트 배열에서 text만 추출해 개행으로 잇는다", () => {
    const parts = [
      { type: "text" as const, text: "첫 줄" },
      { type: "text" as const, text: "둘째 줄" },
    ];
    assert.equal(contentToText(parts), "첫 줄\n둘째 줄");
  });

  it("이미지 파트는 자리표시자로 남긴다", () => {
    const parts = [
      { type: "text" as const, text: "설명" },
      { type: "image_url" as const, image_url: { url: "http://x" } },
    ];
    assert.equal(contentToText(parts as any), "설명\n[image omitted]");
  });

  it("tool_use 블록을 텍스트로 렌더링한다", () => {
    const parts = [{ type: "tool_use", name: "search", input: { q: "hi" } }];
    assert.equal(contentToText(parts as any), '[tool_call] search({"q":"hi"})');
  });

  it("tool_result 블록을 텍스트로 렌더링한다(중첩 content 재귀)", () => {
    const parts = [{ type: "tool_result", content: "결과 텍스트" }];
    assert.equal(contentToText(parts as any), "[tool_result] 결과 텍스트");
  });
});

describe("anthropicSystemToText", () => {
  it("undefined는 undefined", () => {
    assert.equal(anthropicSystemToText(undefined), undefined);
  });

  it("문자열 system을 그대로 반환한다", () => {
    assert.equal(anthropicSystemToText("너는 조수다"), "너는 조수다");
  });

  it("공백만 있는 system은 undefined", () => {
    assert.equal(anthropicSystemToText("   "), undefined);
  });
});

describe("flattenMessages", () => {
  it("system 메시지를 system 프롬프트로 추출한다", () => {
    const msgs: ChatMessage[] = [
      { role: "system", content: "규칙" },
      { role: "user", content: "질문" },
    ];
    const { system, prompt } = flattenMessages(msgs);
    assert.equal(system, "규칙");
    assert.equal(prompt, "질문");
  });

  it("단일 user 메시지는 라벨 없이 본문만", () => {
    const { system, prompt } = flattenMessages([{ role: "user", content: "안녕" }]);
    assert.equal(system, undefined);
    assert.equal(prompt, "안녕");
  });

  it("멀티턴은 역할 라벨을 붙이고 마지막이 user면 Assistant: 로 유도한다", () => {
    const msgs: ChatMessage[] = [
      { role: "user", content: "첫 질문" },
      { role: "assistant", content: "첫 답변" },
      { role: "user", content: "둘째 질문" },
    ];
    const { prompt } = flattenMessages(msgs);
    assert.match(prompt, /User: 첫 질문/);
    assert.match(prompt, /Assistant: 첫 답변/);
    assert.match(prompt, /User: 둘째 질문/);
    assert.match(prompt, /\n\nAssistant:$/, "마지막이 user면 Assistant 유도 접미가 붙는다");
  });

  it("마지막이 assistant면 유도 접미를 붙이지 않는다", () => {
    const msgs: ChatMessage[] = [
      { role: "user", content: "질문" },
      { role: "assistant", content: "답변" },
    ];
    const { prompt } = flattenMessages(msgs);
    assert.ok(!prompt.endsWith("Assistant:"), "assistant로 끝나면 유도 없음");
    assert.match(prompt, /Assistant: 답변$/);
  });

  it("developer 메시지도 system으로 합친다", () => {
    const msgs: ChatMessage[] = [
      { role: "developer", content: "개발 규칙" } as any,
      { role: "user", content: "질문" },
    ];
    assert.equal(flattenMessages(msgs).system, "개발 규칙");
  });

  it("여러 system 메시지는 빈 줄로 이어붙인다", () => {
    const msgs: ChatMessage[] = [
      { role: "system", content: "규칙1" },
      { role: "system", content: "규칙2" },
      { role: "user", content: "q" },
    ];
    assert.equal(flattenMessages(msgs).system, "규칙1\n\n규칙2");
  });
});

describe("flattenAnthropic", () => {
  it("최상위 system 필드를 우선 사용한다", () => {
    const { system, prompt } = flattenAnthropic("앤트로픽 시스템", [
      { role: "user", content: "질문" },
    ] as any);
    assert.equal(system, "앤트로픽 시스템");
    assert.equal(prompt, "질문");
  });
});
