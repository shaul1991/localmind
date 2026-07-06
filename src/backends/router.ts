import type { Config } from "../config.js";
import type { Backend } from "./types.js";
import { createClaudeBackend } from "./claude.js";
import { createCodexBackend } from "./codex.js";
import { createGeminiBackend } from "./gemini.js";

type BackendName = "claude" | "codex" | "gemini";

export interface Routed {
  backend: Backend;
  /** CLI에 넘길 실제 모델명. */
  model: string;
}

/** 모델 문자열로 백엔드를 판별하는 규칙. 페르소나 런타임(agents/runtime.ts)이
 *  교차 백엔드 판정에 같은 규칙을 재사용한다(중복 정의 시 드리프트). */
export function detectBackend(model: string): BackendName | null {
  const m = model.toLowerCase();
  if (/(^|[/:])(claude|sonnet|opus|haiku|anthropic)/.test(m)) return "claude";
  if (/(^|[/:])(gpt|o1|o3|o4|codex|openai)/.test(m)) return "codex";
  if (/(^|[/:])(gemini|google)/.test(m)) return "gemini";
  return null;
}

export class Router {
  private readonly claude: Backend;
  private readonly codex: Backend;
  private readonly gemini: Backend;

  constructor(private readonly config: Config) {
    this.claude = createClaudeBackend(config);
    this.codex = createCodexBackend(config);
    this.gemini = createGeminiBackend(config);
  }

  byName(name: BackendName): Backend {
    if (name === "codex") return this.codex;
    if (name === "gemini") return this.gemini;
    return this.claude;
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

    // 1) 명시 프리픽스 ("gemini:" 는 뒤가 비어도 매칭돼 기본 모델로 폴백)
    const prefixMatch = /^(claude|codex|gemini):(.*)$/i.exec(model);
    if (prefixMatch) {
      const name = prefixMatch[1].toLowerCase() as BackendName;
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
  private fallbackModel(name: BackendName, model: string): string {
    if (model) return this.normalize(name, model);
    if (name === "codex") return this.config.codexDefaultModel;
    if (name === "gemini") return this.config.geminiDefaultModel;
    return this.config.claudeDefaultModel;
  }

  /** provider 프리픽스(anthropic/, openai/, google/) 제거 등 정규화. */
  private normalize(name: BackendName, model: string): string {
    let m = model;
    m = m.replace(/^(anthropic|openai|google)\//i, "");
    return m || this.fallbackModel(name, "");
  }
}
