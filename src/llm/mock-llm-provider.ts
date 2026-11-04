import type { LlmAnalysisInput, LlmProvider } from './llm-provider.interface.js';

export type MockLlmScenario = 'success' | 'invalid-format' | 'timeout';

const NEVER_RESOLVES_DELAY_MS = 24 * 60 * 60 * 1000;

export class MockLlmProvider implements LlmProvider {
  readonly name = 'mock';

  constructor(private readonly scenario: MockLlmScenario = 'success') {}

  analyze(input: LlmAnalysisInput): Promise<unknown> {
    switch (this.scenario) {
      case 'success':
        return Promise.resolve(this.buildSuccessResult(input));
      case 'invalid-format':
        return Promise.resolve({ summary: 42, findings: 'not-an-array' });
      case 'timeout':
        // Resolves far later than any realistic LLM_TIMEOUT_MS, so a caller racing this
        // against a timeout will always observe the timeout branch first.
        return new Promise((resolve) => {
          setTimeout(() => resolve(this.buildSuccessResult(input)), NEVER_RESOLVES_DELAY_MS);
        });
    }
  }

  private buildSuccessResult(input: LlmAnalysisInput) {
    const topPattern = input.patterns[0];
    return {
      summary: topPattern
        ? `Se detectaron ${input.patterns.length} patrones de log entre ${input.from.toISOString()} y ${input.to.toISOString()}, el más frecuente con ${topPattern.count} ocurrencias en el servicio "${topPattern.serviceName}".`
        : `No se encontraron patrones relevantes entre ${input.from.toISOString()} y ${input.to.toISOString()}.`,
      findings: topPattern
        ? [
            {
              serviceId: topPattern.serviceId,
              category: topPattern.level === 'ERROR' || topPattern.level === 'FATAL' ? 'error-rate' : 'availability',
              severity: topPattern.level === 'FATAL' ? 'CRITICAL' : topPattern.level === 'ERROR' ? 'HIGH' : 'MEDIUM',
              description: `Patrón "${topPattern.template}" repetido ${topPattern.count} veces en "${topPattern.serviceName}".`,
            },
          ]
        : [],
      suggestions: topPattern ? ['Revisar el servicio con mayor frecuencia de errores reportado.'] : [],
    };
  }
}
