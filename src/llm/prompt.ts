import type { LlmAnalysisInput } from './llm-provider.interface.js';

export const SYSTEM_PROMPT = `Eres un ingeniero de SRE que analiza logs de microservicios agrupados en patrones (no logs
crudos: cada patrón ya representa N ocurrencias del mismo tipo de evento, con placeholders como
<uuid>/<num>/<ip>/<email>/<ts>/<token> en lugar de los valores originales).

Respondé ÚNICAMENTE con un JSON que cumpla este contrato, sin texto adicional:
{
  "summary": string,
  "findings": [
    { "serviceId": number | null, "category": string, "severity": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL", "description": string }
  ],
  "suggestions": [string]
}

Para "category" usá un término corto y descriptivo (ej. performance, error-rate, security,
availability, data-integrity, dependency-failure) — no estás limitado a esta lista, elegí el que
mejor describa el hallazgo.`;

export function buildPrompt(input: LlmAnalysisInput): string {
  const header = [
    `Rango analizado: ${input.from.toISOString()} a ${input.to.toISOString()}.`,
    `Total de logs en el rango: ${input.totalLogCount}.`,
    `Patrones incluidos: ${input.patterns.length}${input.truncated ? ' (truncado al tope configurado; se priorizaron los de mayor severidad y frecuencia)' : ''}.`,
  ].join('\n');

  const patterns = input.patterns
    .map((pattern, index) => {
      const sample = pattern.sampleMessages[0] ?? pattern.template;
      return (
        `${index + 1}. [${pattern.level}] servicio="${pattern.serviceName}" (id=${pattern.serviceId}) ` +
        `x${pattern.count}, primera=${pattern.firstSeen.toISOString()}, última=${pattern.lastSeen.toISOString()}\n` +
        `   patrón: ${pattern.template}\n` +
        `   ejemplo: ${sample}`
      );
    })
    .join('\n');

  return `${header}\n\n${patterns}`;
}
