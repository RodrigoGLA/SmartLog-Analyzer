import type { LogPattern } from './log-preprocessor.js';

export interface LlmAnalysisInput {
  from: Date;
  to: Date;
  totalLogCount: number;
  patterns: LogPattern[];
  truncated: boolean;
}

export interface LlmCorrectionContext {
  /** El objeto que devolvió el intento anterior, o `undefined` si ni siquiera era JSON válido. */
  previousResponse: unknown;
  /** Descripción legible de por qué se rechazó (issues de Zod, o "no era JSON válido"). */
  validationError: string;
}

export interface LlmProvider {
  /** Recorded on `Analysis.provider` by the caller — never trusted from the LLM's own output. */
  readonly name: string;

  /**
   * Returns the raw, unvalidated response from the provider. Callers must validate it
   * against `analysisResultSchema` before trusting its shape.
   *
   * `correction`, cuando está presente, es un reintento: el llamador ya intentó una vez, la
   * respuesta no fue válida, y pide que el provider lo tenga en cuenta (ej. agregándolo como
   * contexto adicional al prompt).
   */
  analyze(input: LlmAnalysisInput, correction?: LlmCorrectionContext): Promise<unknown>;
}
