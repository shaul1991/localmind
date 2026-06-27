/**
 * A2(프롬프트 기반) 함수 호출 PoC.
 *
 * CLI에는 "외부가 실행할 함수 스펙을 받아 호출만 내뱉고 멈추는" 모드가 없으므로,
 * tools 스펙을 시스템 프롬프트에 주입하고 모델이 약속된 JSON 형식으로 출력하게 한 뒤
 * 그 텍스트를 파싱해 OpenAI tool_calls 응답으로 변환한다.
 */

export interface OpenAITool {
  type: "function";
  function: { name: string; description?: string; parameters?: unknown };
}

export type ToolChoice =
  | "none"
  | "auto"
  | "required"
  | { type: "function"; function: { name: string } };

export interface ParsedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/** tools가 실제로 활성화돼야 하는지(배열이 있고 tool_choice가 none이 아님). */
export function toolsActive(tools: unknown, toolChoice: unknown): tools is OpenAITool[] {
  return Array.isArray(tools) && tools.length > 0 && toolChoice !== "none";
}

/** tools 스펙을 시스템 프롬프트에 주입할 지시문으로 변환. */
export function buildToolSystemPrompt(tools: OpenAITool[], toolChoice: ToolChoice): string {
  const defs = tools.map((t) => ({
    name: t.function?.name,
    description: t.function?.description,
    parameters: t.function?.parameters,
  }));

  let directive = "도구가 필요 없으면 평소처럼 자연어로 답하라(이 JSON 형식을 쓰지 말 것).";
  if (toolChoice === "required") {
    directive = "반드시 하나 이상의 도구를 호출해야 한다.";
  } else if (typeof toolChoice === "object" && toolChoice?.function?.name) {
    directive = `반드시 "${toolChoice.function.name}" 도구를 호출해야 한다.`;
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
