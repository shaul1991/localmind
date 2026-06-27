/** 백엔드(CLI 어댑터)가 구현하는 공통 인터페이스. */

export interface BackendRunOptions {
  /** CLI에 그대로 넘길 모델명 (별칭 또는 풀네임). */
  model: string;
  /** 시스템 프롬프트(없으면 undefined). */
  system?: string;
  /** 평탄화된 사용자 프롬프트. */
  prompt: string;
  /** 요청 취소 신호. */
  signal: AbortSignal;
}

export interface BackendUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface BackendResult {
  text: string;
  usage: BackendUsage;
  /** OpenAI finish_reason로 매핑된 종료 사유. */
  finishReason: string;
  /** 실제 응답한 모델명(가능하면). */
  model: string;
}

export interface Backend {
  readonly name: "claude" | "codex";
  /**
   * 텍스트 델타를 yield하고, 최종 결과를 return하는 async generator.
   * 스트리밍/비스트리밍 모두 이 하나로 처리한다.
   */
  run(opts: BackendRunOptions): AsyncGenerator<string, BackendResult, void>;
}

/** 스트리밍 도중 또는 종료 시 발생한 백엔드 오류. */
export class BackendError extends Error {
  constructor(
    message: string,
    public readonly code: string = "backend_error",
    public readonly status: number = 502,
  ) {
    super(message);
    this.name = "BackendError";
  }
}
