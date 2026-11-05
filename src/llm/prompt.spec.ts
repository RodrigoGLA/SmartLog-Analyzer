import { describe, expect, it } from 'vitest';
import type { LlmCorrectionContext } from './llm-provider.interface.js';
import { buildCorrectionPrompt } from './prompt.js';

describe('buildCorrectionPrompt', () => {
  it('includes the validation error so the LLM knows what to fix', () => {
    const correction: LlmCorrectionContext = {
      previousResponse: { summary: 42, findings: 'not-an-array' },
      validationError: 'summary: Expected string, received number',
    };

    const prompt = buildCorrectionPrompt(correction);

    expect(prompt).toContain('summary: Expected string, received number');
    expect(prompt).toContain('JSON corregido');
  });
});
