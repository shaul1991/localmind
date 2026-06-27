import os from "node:os";
import type { Config } from "../config.js";
import { log } from "../util/log.js";
import { spawnNdjson } from "../util/proc.js";
import { type Backend, type BackendResult, type BackendRunOptions, BackendError } from "./types.js";

/** 시스템 프롬프트가 없을 때 사용할 기본값(코딩 에이전트 프레이밍 제거용). */
const DEFAULT_SYSTEM = "You are a helpful assistant.";

function mapStopReason(reason: string | null | undefined): string {
  switch (reason) {
    case "max_tokens":
      return "length";
    case "tool_use":
      return "tool_calls";
    case "end_turn":
    case "stop_sequence":
    default:
      return "stop";
  }
}

export function createClaudeBackend(config: Config): Backend {
  return {
    name: "claude",
    async *run(opts: BackendRunOptions): AsyncGenerator<string, BackendResult, void> {
      const args = [
        "-p",
        "--output-format",
        "stream-json",
        "--include-partial-messages",
        "--verbose",
        "--tools",
        "", // 모든 내장 도구 비활성화 → 순수 텍스트 생성
        "--model",
        opts.model,
        "--system-prompt",
        opts.system && opts.system.trim() ? opts.system : DEFAULT_SYSTEM,
        // CLAUDE.md / 환경정보 등 동적 시스템 섹션 제거 → 깔끔한 API 동작
        "--exclude-dynamic-system-prompt-sections",
      ];

      const proc = spawnNdjson({
        bin: config.claudeBin,
        args,
        input: opts.prompt,
        // 프로젝트 CLAUDE.md가 새지 않도록 임시 디렉토리에서 실행
        cwd: os.tmpdir(),
        signal: opts.signal,
      });

      let finalText = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let stopReason: string | null = null;
      let model = opts.model;
      let sawResult = false;
      let apiError: string | null = null;

      for await (const raw of proc.lines) {
        const obj = raw as Record<string, any>;
        switch (obj.type) {
          case "system":
            if (obj.subtype === "init" && typeof obj.model === "string") model = obj.model;
            break;

          case "stream_event": {
            const ev = obj.event as Record<string, any> | undefined;
            if (!ev) break;
            if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
              const t = ev.delta.text as string;
              if (t) {
                finalText += t;
                yield t;
              }
            } else if (ev.type === "message_delta") {
              if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
              if (ev.usage?.output_tokens != null) outputTokens = ev.usage.output_tokens;
              if (ev.usage?.input_tokens != null) inputTokens = ev.usage.input_tokens;
            } else if (ev.type === "message_start") {
              if (ev.message?.model) model = ev.message.model;
              if (ev.message?.usage?.input_tokens != null) inputTokens = ev.message.usage.input_tokens;
            }
            break;
          }

          case "result": {
            sawResult = true;
            if (obj.is_error) apiError = obj.api_error_status || obj.subtype || "claude_error";
            // result.result가 최종 텍스트의 정본. (스트리밍 델타는 이미 yield됨)
            if (typeof obj.result === "string") finalText = obj.result;
            if (obj.stop_reason) stopReason = obj.stop_reason;
            if (obj.usage?.input_tokens != null) inputTokens = obj.usage.input_tokens;
            if (obj.usage?.output_tokens != null) outputTokens = obj.usage.output_tokens;
            break;
          }

          default:
            break;
        }
      }

      const { code, stderr } = await proc.done;

      if (apiError) {
        throw new BackendError(`claude 오류: ${apiError}\n${stderr.slice(-2000)}`, "claude_error");
      }
      if (!sawResult && code !== 0) {
        throw new BackendError(
          `claude CLI가 비정상 종료했습니다 (code ${code}).\n${stderr.slice(-2000)}`,
          "claude_spawn_error",
        );
      }
      if (!sawResult && !finalText) {
        throw new BackendError(
          `claude 응답을 받지 못했습니다.\n${stderr.slice(-2000)}`,
          "claude_empty",
        );
      }

      log.debug(`claude done: ${outputTokens} out tokens, stop=${stopReason}`);

      return {
        text: finalText,
        usage: { inputTokens, outputTokens },
        finishReason: mapStopReason(stopReason),
        model,
      };
    },
  };
}
