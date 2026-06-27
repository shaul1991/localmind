import type { ChatMessage, ContentPart, MessageContent } from "./types.js";
import type { AnthropicMessage, AnthropicSystem } from "./types-anthropic.js";

/** content(문자열 | 파트 배열 | null)에서 텍스트만 추출한다. */
export function contentToText(content: MessageContent): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part.type === "text" && typeof part.text === "string") return part.text;
      // 비텍스트 파트(이미지 등)는 자리표시자로 남긴다(CLI는 텍스트만 받음).
      if (part.type === "image_url" || part.type === "image") return "[image omitted]";
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

/** Anthropic의 최상위 system(문자열 | 블록 배열)에서 텍스트를 추출한다. */
export function anthropicSystemToText(system: AnthropicSystem | undefined): string | undefined {
  if (system == null) return undefined;
  const text = typeof system === "string" ? system : contentToText(system as ContentPart[]);
  return text.trim() ? text : undefined;
}

/**
 * Anthropic Messages 요청을 CLI가 받을 형태로 변환한다.
 * system은 최상위 필드, messages는 user/assistant만 존재한다.
 */
export function flattenAnthropic(
  system: AnthropicSystem | undefined,
  messages: AnthropicMessage[],
): FlattenedPrompt {
  // Anthropic 메시지는 OpenAI ChatMessage와 content 구조가 호환되므로 평탄화 로직 재사용.
  const flat = flattenMessages(messages as unknown as ChatMessage[]);
  return { system: anthropicSystemToText(system) ?? flat.system, prompt: flat.prompt };
}

export interface FlattenedPrompt {
  system?: string;
  prompt: string;
}

/**
 * OpenAI messages 배열을 CLI가 받을 수 있는 형태로 변환한다.
 *  - system/developer 메시지 → system 프롬프트로 합침
 *  - 나머지(user/assistant/tool) → 단일 프롬프트로 평탄화
 *
 * 단일 user 메시지면 라벨 없이 그대로 사용하고,
 * 멀티턴이면 "User:/Assistant:" 라벨을 붙여 대화 맥락을 보존한다.
 */
export function flattenMessages(messages: ChatMessage[]): FlattenedPrompt {
  const systemParts: string[] = [];
  const turns: { role: ChatMessage["role"]; text: string }[] = [];

  for (const m of messages) {
    const text = contentToText(m.content);
    if (m.role === "system" || m.role === "developer") {
      if (text) systemParts.push(text);
    } else {
      turns.push({ role: m.role, text });
    }
  }

  const system = systemParts.length ? systemParts.join("\n\n") : undefined;

  // 대화 턴이 하나뿐(보통 user)이면 라벨 없이 본문만.
  const nonEmptyTurns = turns.filter((t) => t.text.trim() !== "");
  if (nonEmptyTurns.length <= 1) {
    return { system, prompt: nonEmptyTurns[0]?.text ?? "" };
  }

  // 멀티턴: 역할 라벨을 붙여 평탄화하고, 마지막에 assistant 응답을 유도한다.
  const label = (r: ChatMessage["role"]): string => {
    switch (r) {
      case "assistant":
        return "Assistant";
      case "tool":
        return "Tool";
      default:
        return "User";
    }
  };

  const body = nonEmptyTurns.map((t) => `${label(t.role)}: ${t.text}`).join("\n\n");
  const prompt =
    nonEmptyTurns[nonEmptyTurns.length - 1].role === "assistant"
      ? body
      : `${body}\n\nAssistant:`;

  return { system, prompt };
}
