/**
 * Anthropic Messages API 호환 타입.
 * https://docs.anthropic.com/en/api/messages
 */

import type { ContentPart } from "./types.js";

export type AnthropicRole = "user" | "assistant";

export type AnthropicContent = string | ContentPart[];

export interface AnthropicMessage {
  role: AnthropicRole;
  content: AnthropicContent;
}

/** system은 문자열 또는 텍스트 블록 배열일 수 있다. */
export type AnthropicSystem = string | ContentPart[];

export interface AnthropicToolDef {
  name: string;
  description?: string;
  input_schema?: unknown;
}

export type AnthropicToolChoice =
  | { type: "auto" }
  | { type: "any" }
  | { type: "none" }
  | { type: "tool"; name: string };

export interface AnthropicMessagesRequest {
  model: string;
  /** Anthropic 스펙상 필수지만, CLI는 출력 상한을 강제할 수 없어 받기만 한다. */
  max_tokens?: number;
  system?: AnthropicSystem;
  messages: AnthropicMessage[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  metadata?: Record<string, unknown>;
  tools?: AnthropicToolDef[];
  tool_choice?: AnthropicToolChoice;
  [k: string]: unknown;
}

export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface AnthropicTextBlock {
  type: "text";
  text: string;
}

export interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock;

export interface AnthropicMessageResponse {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: AnthropicContentBlock[];
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: AnthropicUsage;
}
