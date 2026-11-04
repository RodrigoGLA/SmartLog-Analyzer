import { afterEach, describe, expect, it, vi } from 'vitest';
import { analysisResultSchema } from './analysis-result.schema.js';
import type { LlmAnalysisInput } from './llm-provider.interface.js';
import type { LogPattern } from './log-preprocessor.js';
import { MockLlmProvider } from './mock-llm-provider.js';

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

describe('MockLlmProvider', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('"success" scenario returns a payload that satisfies analysisResultSchema', async () => {
    const provider = new MockLlmProvider('success');
    const result = await provider.analyze(buildInput([buildPattern()]));

    const parsed = analysisResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it('"success" scenario with no patterns still returns a valid, empty-ish payload', async () => {
    const provider = new MockLlmProvider('success');
    const result = await provider.analyze(buildInput([]));

    const parsed = analysisResultSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it('"invalid-format" scenario returns a payload that fails analysisResultSchema', async () => {
    const provider = new MockLlmProvider('invalid-format');
    const result = await provider.analyze(buildInput());

    const parsed = analysisResultSchema.safeParse(result);
    expect(parsed.success).toBe(false);
  });

  it('"timeout" scenario does not resolve within a normal timeout window', async () => {
    vi.useFakeTimers();
    const provider = new MockLlmProvider('timeout');
    let resolved = false;
    void provider.analyze(buildInput()).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(20_000);

    expect(resolved).toBe(false);
  });
});
