/**
 * A2(프롬프트 기반) 함수 호출 PoC.
 *
 * CLI에는 "외부가 실행할 함수 스펙을 받아 호출만 내뱉고 멈추는" 모드가 없으므로,
 * tools 스펙을 시스템 프롬프트에 주입하고 모델이 약속된 JSON 형식으로 출력하게 한 뒤
 * 그 텍스트를 파싱해 tool_calls/tool_use 응답으로 변환한다.
 *
 * OpenAI(/v1/chat/completions)와 Anthropic(/v1/messages) 양쪽이 공유한다.
 */

/** 백엔드 무관 내부 도구 표현. */
export interface ToolDef {
  name: string;
  description?: string;
  parameters?: unknown; // JSON Schema
}

/** 정규화된 도구 선택. "none"이면 비활성. */
export type NormalizedChoice = "none" | { mode: "auto" | "required"; forced?: string };

export interface ParsedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

// ── OpenAI 포맷 정규화 ────────────────────────────────────────
export interface OpenAITool {
  type: "function";
  function: { name: string; description?: string; parameters?: unknown };
}

export function normalizeOpenAITools(tools: unknown): ToolDef[] {
  if (!Array.isArray(tools)) return [];
  return tools
    .filter((t: any) => t?.function?.name)
    .map((t: any) => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    }));
}

export function normalizeOpenAIChoice(choice: unknown): NormalizedChoice {
  if (choice === "none") return "none";
  if (choice === "required") return { mode: "required" };
  if (typeof choice === "object" && choice && (choice as any).function?.name) {
    return { mode: "required", forced: (choice as any).function.name };
  }
  return { mode: "auto" };
}

// ── Anthropic 포맷 정규화 ─────────────────────────────────────
export interface AnthropicToolDef {
  name: string;
  description?: string;
  input_schema?: unknown;
}

export function normalizeAnthropicTools(tools: unknown): ToolDef[] {
  if (!Array.isArray(tools)) return [];
  return tools
    .filter((t: any) => typeof t?.name === "string")
    .map((t: any) => ({ name: t.name, description: t.description, parameters: t.input_schema }));
}

export function normalizeAnthropicChoice(choice: unknown): NormalizedChoice {
  const c = choice as any;
  if (!c || c.type === "auto") return { mode: "auto" };
  if (c.type === "none") return "none";
  if (c.type === "any") return { mode: "required" };
  if (c.type === "tool" && typeof c.name === "string") return { mode: "required", forced: c.name };
  return { mode: "auto" };
}

/** tools 스펙을 시스템 프롬프트에 주입할 지시문으로 변환. */
export function buildToolSystemPrompt(defs: ToolDef[], choice: NormalizedChoice): string {
  let directive = "도구가 필요 없으면 평소처럼 자연어로 답하라(이 JSON 형식을 쓰지 말 것).";
  if (choice !== "none" && choice.forced) {
    directive = `반드시 "${choice.forced}" 도구를 호출해야 한다.`;
  } else if (choice !== "none" && choice.mode === "required") {
    directive = "반드시 하나 이상의 도구를 호출해야 한다.";
  }

  return [
    "You can call the following tools (functions) to help answer the user.",
    "도구를 호출하기로 했다면, 다른 텍스트나 코드펜스 없이 오직 아래 형식의 JSON 객체 하나만 출력하라:",
    '{"tool_calls": [{"name": "<도구 이름>", "arguments": { <인자 객체> }}]}',
    directive,
    "",
    "사용 가능한 도구 (JSON Schema):",
    JSON.stringify(defs, null, 2),
  ].join("\n");
}

/** 텍스트에서 최상위 균형 잡힌 첫 JSON 객체 문자열을 추출(문자열/이스케이프 인식). */
function extractFirstJsonObject(text: string): string | null {
  let s = text.trim();
  // 코드펜스 제거
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = s.indexOf("{");
  if (start < 0) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') {
      inStr = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * CLI 출력 텍스트가 도구 호출이면 ParsedToolCall[]를, 아니면 null을 반환.
 */
export function parseToolCalls(text: string): ParsedToolCall[] | null {
  const candidate = extractFirstJsonObject(text);
  if (!candidate || !candidate.includes("tool_calls")) return null;

  let obj: any;
  try {
    obj = JSON.parse(candidate);
  } catch {
    return null;
  }
  if (!obj || !Array.isArray(obj.tool_calls)) return null;

  const calls: ParsedToolCall[] = obj.tool_calls
    .filter((c: any) => c && typeof c.name === "string")
    .map((c: any) => ({
      name: c.name as string,
      arguments:
        c.arguments && typeof c.arguments === "object" && !Array.isArray(c.arguments)
          ? (c.arguments as Record<string, unknown>)
          : {},
    }));

  return calls.length ? calls : null;
}
