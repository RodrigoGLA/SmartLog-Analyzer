import { describe, expect, it } from 'vitest';
import { analysisResultSchema } from './analysis-result.schema.js';

describe('analysisResultSchema', () => {
  it('accepts a minimal valid result', () => {
    const result = analysisResultSchema.safeParse({
      summary: 'All good',
      findings: [],
      suggestions: [],
    });

    expect(result.success).toBe(true);
  });

  it('accepts a complete valid result', () => {
    const result = analysisResultSchema.safeParse({
      summary: 'Checkout API had a burst of 500s',
      findings: [
        { serviceId: 1, category: 'error-rate', severity: 'HIGH', description: 'Spike of 5xx responses' },
        { serviceId: null, category: 'security', severity: 'CRITICAL', description: 'Suspicious pattern' },
      ],
      suggestions: ['Check downstream payment provider status'],
    });

    expect(result.success).toBe(true);
  });

  it.each([
    ['missing summary', { findings: [], suggestions: [] }],
    ['summary is empty', { summary: '', findings: [], suggestions: [] }],
    ['findings is not an array', { summary: 'x', findings: 'nope', suggestions: [] }],
    [
      'severity outside the enum',
      {
        summary: 'x',
        findings: [{ category: 'c', severity: 'EXTREME', description: 'd' }],
        suggestions: [],
      },
    ],
    [
      'finding category is empty',
      {
        summary: 'x',
        findings: [{ category: '', severity: 'LOW', description: 'd' }],
        suggestions: [],
      },
    ],
    ['suggestions is not an array', { summary: 'x', findings: [], suggestions: 'nope' }],
  ])('rejects when %s', (_label, payload) => {
    const result = analysisResultSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});
