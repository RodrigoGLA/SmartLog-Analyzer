import { afterEach, describe, expect, it, vi } from 'vitest';
import { analysisResultSchema } from './analysis-result.schema.js';
import { GEMINI_RESPONSE_SCHEMA, GeminiLlmProvider } from './gemini-llm-provider.js';
import type { LlmAnalysisInput, LlmCorrectionContext } from './llm-provider.interface.js';
import { LlmInvalidResponseError, LlmProviderError, LlmTimeoutError } from './llm.errors.js';
import type { LogPattern } from './log-preprocessor.js';
import { buildCorrectionPrompt, buildPrompt, SYSTEM_PROMPT } from './prompt.js';

function buildInput(patterns: LogPattern[] = []): LlmAnalysisInput {
  return {
    from: new Date('2026-01-01T00:00:00.000Z'),
    to: new Date('2026-01-02T00:00:00.000Z'),
    totalLogCount: patterns.reduce((sum, p) => sum + p.count, 0),
    patterns,
    truncated: false,
  };
}

function buildPattern(overrides: Partial<LogPattern> = {}): LogPattern {
  return {
    serviceId: 1,
    serviceName: 'checkout-api',
    level: 'ERROR',
    template: 'order <num> failed',
    count: 5,
    firstSeen: new Date('2026-01-01T00:00:00.000Z'),
    lastSeen: new Date('2026-01-01T12:00:00.000Z'),
    sampleMessages: ['order 1 failed'],
    ...overrides,
  };
}

function okResponse(text: string) {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(text),
    json: () =>
      Promise.resolve({
        candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
      }),
  } as unknown as Response;
}

function emptyCandidatesResponse(extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve('{}'),
    json: () => Promise.resolve({ candidates: [], ...extra }),
  } as unknown as Response;
}

describe('GeminiLlmProvider', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the parsed analysis object on a successful call', async () => {
    const provider = new GeminiLlmProvider('test-key', 'gemini-3.5-flash-lite', 5000);
    const validResult = { summary: 'ok', findings: [], suggestions: [] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(JSON.stringify(validResult))));

    const result = await provider.analyze(buildInput());

    expect(result).toEqual(validResult);
    expect(analysisResultSchema.safeParse(result).success).toBe(true);
  });

  it('throws LlmProviderError on a non-2xx HTTP response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: () => Promise.resolve('quota exceeded'),
      } as unknown as Response),
    );
    const provider = new GeminiLlmProvider('test-key', 'gemini-3.5-flash-lite', 5000);

    await expect(provider.analyze(buildInput())).rejects.toThrow(LlmProviderError);
    await expect(provider.analyze(buildInput())).rejects.toThrow(/429/);
  });

  it('throws LlmProviderError on a network-level fetch rejection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const provider = new GeminiLlmProvider('test-key', 'gemini-3.5-flash-lite', 5000);

    await expect(provider.analyze(buildInput())).rejects.toThrow(LlmProviderError);
  });

  it.each(['TimeoutError', 'AbortError'])(
    'throws LlmTimeoutError when fetch rejects with a %s',
    async (name) => {
      const error = new Error('aborted');
      error.name = name;
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(error));
      const provider = new GeminiLlmProvider('test-key', 'gemini-3.5-flash-lite', 5000);

      await expect(provider.analyze(buildInput())).rejects.toThrow(LlmTimeoutError);
    },
  );

  it('throws LlmProviderError when there are no candidates', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(emptyCandidatesResponse()));
    const provider = new GeminiLlmProvider('test-key', 'gemini-3.5-flash-lite', 5000);

    await expect(provider.analyze(buildInput())).rejects.toThrow(LlmProviderError);
  });

  it('throws LlmProviderError with the block reason when content was blocked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(emptyCandidatesResponse({ promptFeedback: { blockReason: 'SAFETY' } })),
    );
    const provider = new GeminiLlmProvider('test-key', 'gemini-3.5-flash-lite', 5000);

    await expect(provider.analyze(buildInput())).rejects.toThrow(/SAFETY/);
  });

  it('throws LlmInvalidResponseError when the text part is not valid JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse('{not valid json')));
    const provider = new GeminiLlmProvider('test-key', 'gemini-3.5-flash-lite', 5000);

    await expect(provider.analyze(buildInput())).rejects.toThrow(LlmInvalidResponseError);
  });

  it('throws LlmProviderError when the response body is not JSON at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      } as unknown as Response),
    );
    const provider = new GeminiLlmProvider('test-key', 'gemini-3.5-flash-lite', 5000);

    await expect(provider.analyze(buildInput())).rejects.toThrow(LlmProviderError);
  });

  it('sends the expected request: URL, auth header, prompts and structured-output config', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(JSON.stringify({ summary: 's', findings: [], suggestions: [] })));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new GeminiLlmProvider('test-key', 'gemini-3.5-flash-lite', 5000);
    const input = buildInput([buildPattern()]);

    await provider.analyze(input);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent');
    expect(url).not.toContain('key=');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-key');

    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction.parts[0].text).toBe(SYSTEM_PROMPT);
    expect(body.contents[0].parts[0].text).toBe(buildPrompt(input));
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.generationConfig.responseSchema).toEqual(GEMINI_RESPONSE_SCHEMA);
  });

  it('sends a 3-turn chat with the previous response and correction when retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse(JSON.stringify({ summary: 's', findings: [], suggestions: [] })));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new GeminiLlmProvider('test-key', 'gemini-3.5-flash-lite', 5000);
    const correction: LlmCorrectionContext = {
      previousResponse: { summary: 42, findings: 'not-an-array' },
      validationError: 'summary: Expected string, received number',
    };

    await provider.analyze(buildInput(), correction);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body.contents).toHaveLength(3);
    expect(body.contents[0].role).toBe('user');
    expect(body.contents[1]).toEqual({ role: 'model', parts: [{ text: JSON.stringify(correction.previousResponse) }] });
    expect(body.contents[2].role).toBe('user');
    expect(body.contents[2].parts[0].text).toBe(buildCorrectionPrompt(correction));
  });

  it('exposes "gemini" as its name', () => {
    const provider = new GeminiLlmProvider('test-key', 'gemini-3.5-flash-lite', 5000);
    expect(provider.name).toBe('gemini');
  });
});
