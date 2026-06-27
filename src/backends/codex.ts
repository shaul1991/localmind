import os from "node:os";
import type { Config } from "../config.js";
import { log } from "../util/log.js";
import { spawnNdjson } from "../util/proc.js";
import { type Backend, type BackendResult, type BackendRunOptions, BackendError } from "./types.js";

/**
 * codex exec는 시스템 프롬프트 플래그가 없으므로 프롬프트 앞에 붙여 전달한다.
 */
function buildPrompt(system: string | undefined, prompt: string): string {
  if (system && system.trim()) {
    return `<system_instructions>\n${system.trim()}\n</system_instructions>\n\n${prompt}`;
  }
  return prompt;
}

export function createCodexBackend(config: Config): Backend {
  return {
    name: "codex",
    async *run(opts: BackendRunOptions): AsyncGenerator<string, BackendResult, void> {
      // exec 레벨 옵션은 resume 서브커맨드보다 반드시 앞에 와야 한다.
      const base = [
        "exec",
        "--json",
        "--skip-git-repo-check",
        "-s",
        "read-only", // 워크스페이스 쓰기 금지 (순수 응답 지향)
        "-c",
        'approval_policy="never"', // 승인 프롬프트로 멈추지 않게
        "-C",
        os.tmpdir(),
      ];

      // resume 시 system은 세션에 이미 반영돼 있으므로 다시 주입하지 않는다.
      const args = opts.resumeId
        ? [...base, "resume", opts.resumeId, "-"]
        : [...base, "-m", opts.model, "-"];
      const input = opts.resumeId ? opts.prompt : buildPrompt(opts.system, opts.prompt);

      const proc = spawnNdjson({
        bin: config.codexBin,
        args,
        input,
        cwd: os.tmpdir(),
        signal: opts.signal,
      });

      let emitted = "";
      let finalText = "";
      let inputTokens = 0;
      let outputTokens = 0;
      let sessionId: string | undefined;
      let errored: string | null = null;
      let sawMessage = false;

      for await (const raw of proc.lines) {
        const obj = raw as Record<string, any>;
        switch (obj.type) {
          case "thread.started":
            if (typeof obj.thread_id === "string") sessionId = obj.thread_id;
            break;
          case "item.completed": {
            const item = obj.item as Record<string, any> | undefined;
            if (item?.type === "agent_message" && typeof item.text === "string") {
              sawMessage = true;
              finalText = item.text;
              // 이미 내보낸 접두사 이후의 새 텍스트만 yield (보통 전체가 한 번에 옴)
              if (item.text.startsWith(emitted)) {
                const delta = item.text.slice(emitted.length);
                if (delta) yield delta;
              } else {
                yield item.text;
              }
              emitted = item.text;
            }
            break;
          }
          // 일부 버전은 증분 델타를 흘릴 수 있다.
          case "item.delta":
          case "item.updated": {
            const item = obj.item as Record<string, any> | undefined;
            const t: string | undefined =
              (obj.delta as string | undefined) ?? (item?.text as string | undefined);
            if (item && item.type && item.type !== "agent_message") break;
            if (typeof t === "string" && t && t.startsWith(emitted)) {
              const delta = t.slice(emitted.length);
              if (delta) {
                yield delta;
                emitted = t;
                finalText = t;
                sawMessage = true;
              }
            }
            break;
          }
          case "turn.completed": {
            const u = obj.usage as Record<string, any> | undefined;
            if (u) {
              if (u.input_tokens != null) inputTokens = u.input_tokens;
              if (u.output_tokens != null) outputTokens = u.output_tokens;
            }
            break;
          }
          case "turn.failed":
          case "error": {
            errored = obj.error?.message || obj.message || "codex_error";
            break;
          }
          default:
            break;
        }
      }

      const { code, stderr } = await proc.done;

      if (errored) {
        throw new BackendError(`codex 오류: ${errored}\n${stderr.slice(-2000)}`, "codex_error");
      }
      if (!sawMessage && code !== 0) {
        throw new BackendError(
          `codex CLI가 비정상 종료했습니다 (code ${code}).\n${stderr.slice(-2000)}`,
          "codex_spawn_error",
        );
      }

      log.debug(`codex done: ${outputTokens} out tokens`);

      return {
        text: finalText,
        usage: { inputTokens, outputTokens },
        finishReason: "stop",
        model: opts.model,
        sessionId,
      };
    },
  };
}
