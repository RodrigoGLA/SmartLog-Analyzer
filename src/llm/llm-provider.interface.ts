import type { LogPattern } from './log-preprocessor.js';

export interface LlmAnalysisInput {
  from: Date;
  to: Date;
  totalLogCount: number;
  patterns: LogPattern[];
  truncated: boolean;
}

export interface LlmProvider {
  /** Recorded on `Analysis.provider` by the caller — never trusted from the LLM's own output. */
  readonly name: string;

  /**
   * Returns the raw, unvalidated response from the provider. Callers must validate it
   * against `analysisResultSchema` before trusting its shape.
   */
  analyze(input: LlmAnalysisInput): Promise<unknown>;
}
