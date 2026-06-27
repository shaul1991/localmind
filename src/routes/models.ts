import type { Request, Response } from "express";
import type { Config } from "../config.js";

/**
 * GET /v1/models — OpenAI 호환 모델 목록.
 * 실제로는 model 필드 라우팅이 자유로우므로, 대표적인 별칭만 노출한다.
 */
export function createModelsHandler(config: Config) {
  return function modelsHandler(_req: Request, res: Response): void {
    const created = 1700000000;
    const ids = [
      // claude 계열
      "claude-sonnet-4-6",
      "claude-opus-4-8",
      "claude-haiku-4-5",
      "sonnet",
      "opus",
      "haiku",
      // codex 계열
      config.codexDefaultModel,
      "gpt-5.5",
      // 명시 프리픽스 예시
      "claude:sonnet",
      "codex:gpt-5.5",
    ];
    const seen = new Set<string>();
    const data = ids
      .filter((id) => id && !seen.has(id) && (seen.add(id), true))
      .map((id) => ({
        id,
        object: "model",
        created,
        owned_by: id.includes("codex") || id.startsWith("gpt") ? "codex" : "claude",
      }));

    res.json({ object: "list", data });
  };
}
