/**
 * OpenAI Chat Completions API 호환 타입.
 * https://platform.openai.com/docs/api-reference/chat
 */

export type Role = "system" | "user" | "assistant" | "tool" | "developer";

/** content는 문자열 또는 멀티모달 파트 배열일 수 있다. */
export type MessageContent = string | ContentPart[] | null;

export interface ContentPart {
  type: string; // "text" | "image_url" | ...
  text?: string;
  [k: string]: unknown;
}

export interface ChatMessage {
  role: Role;
  content: MessageContent;
  name?: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  stop?: string | string[];
  // 미지원 필드(tools 등)는 무시한다.
  [k: string]: unknown;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionChoice {
  index: number;
  message: { role: "assistant"; content: string };
  finish_reason: string;
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: Usage;
  system_fingerprint?: string;
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: {
    index: number;
    delta: { role?: "assistant"; content?: string };
    finish_reason: string | null;
  }[];
  usage?: Usage | null;
}
