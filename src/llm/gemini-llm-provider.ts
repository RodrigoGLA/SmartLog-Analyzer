import { LlmInvalidResponseError, LlmProviderError, LlmTimeoutError } from './llm.errors.js';
import type { LlmAnalysisInput, LlmProvider } from './llm-provider.interface.js';
import { buildPrompt, SYSTEM_PROMPT } from './prompt.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Escrito a mano para el subset tipo-OpenAPI-3.0 que acepta Gemini (sin anyOf/$ref/additionalProperties,
// a diferencia de z.toJSONSchema(analysisResultSchema)). Espejo campo a campo de analysisResultSchema —
// mantener ambos sincronizados a mano si el contrato cambia (ver ARCHITECTURE.md).
export const GEMINI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'Resumen ejecutivo del análisis.' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          serviceId: {
            type: 'integer',
            nullable: true,
            description: 'ID del servicio afectado, o null si no aplica a uno en particular.',
          },
          category: {
            type: 'string',
            description: 'Término corto y descriptivo (no es un enum cerrado).',
          },
          severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
          description: { type: 'string' },
        },
        required: ['category', 'severity', 'description'],
        propertyOrdering: ['serviceId', 'category', 'severity', 'description'],
      },
    },
    suggestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'findings', 'suggestions'],
  propertyOrdering: ['summary', 'findings', 'suggestions'],
} as const;

interface GeminiGenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  promptFeedback?: { blockReason?: string };
}

export class GeminiLlmProvider implements LlmProvider {
  readonly name = 'gemini';

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly timeoutMs: number,
  ) {}

  async analyze(input: LlmAnalysisInput): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(this.buildUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify(this.buildRequestBody(input)),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw this.mapFetchError(error);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new LlmProviderError(`Gemini returned HTTP ${response.status}: ${body.slice(0, 500)}`);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new LlmProviderError(`Gemini returned a non-JSON response: ${message}`);
    }

    return this.extractResult(json);
  }

  private buildUrl(): string {
    return `${GEMINI_API_BASE}/models/${this.model}:generateContent`;
  }

  private buildRequestBody(input: LlmAnalysisInput) {
    return {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: buildPrompt(input) }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: GEMINI_RESPONSE_SCHEMA,
      },
    };
  }

  private mapFetchError(error: unknown): LlmTimeoutError | LlmProviderError {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return new LlmTimeoutError(`Gemini call exceeded ${this.timeoutMs}ms`);
    }
    const message = error instanceof Error ? error.message : String(error);
    return new LlmProviderError(`Gemini request failed: ${message}`);
  }

  private extractResult(json: unknown): unknown {
    const envelope = json as GeminiGenerateContentResponse;
    const blockReason = envelope.promptFeedback?.blockReason;
    const text = envelope.candidates?.[0]?.content?.parts?.[0]?.text;

    if (blockReason || typeof text !== 'string') {
      throw new LlmProviderError(
        blockReason
          ? `Gemini blocked the response: ${blockReason}`
          : 'Gemini returned no usable candidates',
      );
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new LlmInvalidResponseError(`Gemini returned malformed JSON: ${message}`);
    }
  }
}
