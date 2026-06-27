import type { Config } from "../config.js";
import type { Backend } from "./types.js";
import { createClaudeBackend } from "./claude.js";
import { createCodexBackend } from "./codex.js";

export interface Routed {
  backend: Backend;
  /** CLI에 넘길 실제 모델명. */
  model: string;
}

/** 모델 문자열로 백엔드를 판별하는 규칙. */
function detectBackend(model: string): "claude" | "codex" | null {
  const m = model.toLowerCase();
  if (/(^|[/:])(claude|sonnet|opus|haiku|anthropic)/.test(m)) return "claude";
  if (/(^|[/:])(gpt|o1|o3|o4|codex|openai)/.test(m)) return "codex";
  return null;
}

export class Router {
  private readonly claude: Backend;
  private readonly codex: Backend;

  constructor(private readonly config: Config) {
    this.claude = createClaudeBackend(config);
    this.codex = createCodexBackend(config);
  }

  byName(name: "claude" | "codex"): Backend {
    return name === "codex" ? this.codex : this.claude;
  }

  /**
   * 요청의 model 필드를 백엔드 + 실제 모델명으로 해석한다.
   *
   * 우선순위:
   *  1) 명시 프리픽스: "claude:<model>" / "codex:<model>"
   *  2) 모델명 패턴 매칭 (claude*, gpt*, o3*, codex* ...)
   *  3) 설정의 기본 백엔드
   */
  resolve(rawModel: string | undefined): Routed {
    const model = (rawModel ?? "").trim();

    // 1) 명시 프리픽스
    const prefixMatch = /^(claude|codex):(.+)$/i.exec(model);
    if (prefixMatch) {
      const name = prefixMatch[1].toLowerCase() as "claude" | "codex";
      const rest = prefixMatch[2].trim();
      return { backend: this.byName(name), model: this.fallbackModel(name, rest) };
    }

    // 2) 패턴 매칭
    const detected = model ? detectBackend(model) : null;
    if (detected) {
      return { backend: this.byName(detected), model: this.normalize(detected, model) };
    }

    // 3) 기본 백엔드
    const name = this.config.defaultBackend;
    return { backend: this.byName(name), model: this.fallbackModel(name, model) };
  }

  /** 모델명이 비었으면 백엔드 기본 모델로 대체. */
  private fallbackModel(name: "claude" | "codex", model: string): string {
    if (model) return this.normalize(name, model);
    return name === "codex" ? this.config.codexDefaultModel : this.config.claudeDefaultModel;
  }

  /** provider 프리픽스(anthropic/, openai/) 제거 등 정규화. */
  private normalize(name: "claude" | "codex", model: string): string {
    let m = model;
    m = m.replace(/^(anthropic|openai)\//i, "");
    return m || this.fallbackModel(name, "");
  }
}
