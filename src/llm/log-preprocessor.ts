export interface RawLogForAnalysis {
  serviceId: number;
  serviceName: string;
  level: string;
  message: string;
  timestamp: Date;
}

export interface LogPattern {
  serviceId: number;
  serviceName: string;
  level: string;
  template: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  sampleMessages: string[];
}

const LEVEL_SEVERITY: Record<string, number> = {
  FATAL: 4,
  ERROR: 3,
  WARN: 2,
  INFO: 1,
  DEBUG: 0,
};

// Order matters: each regex consumes digits/characters that a later, more generic
// regex (e.g. NUM_RE) would otherwise also match inside the same span.
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi;
const ISO_TIMESTAMP_RE = /\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})?\b/g;
const IP_RE = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const LONG_HEX_RE = /\b[0-9a-f]{12,}\b/gi;
const NUM_RE = /\b\d+\b/g;

export class LogPreprocessor {
  normalize(message: string): string {
    return message
      .replace(UUID_RE, '<uuid>')
      .replace(EMAIL_RE, '<email>')
      .replace(ISO_TIMESTAMP_RE, '<ts>')
      .replace(IP_RE, '<ip>')
      .replace(LONG_HEX_RE, '<token>')
      .replace(NUM_RE, '<num>')
      .trim()
      .replace(/\s+/g, ' ');
  }

  buildPatterns(logs: RawLogForAnalysis[], maxPatterns: number): LogPattern[] {
    const byKey = new Map<string, LogPattern>();

    for (const log of logs) {
      const template = this.normalize(log.message);
      const key = `${log.serviceId}|${log.level}|${template}`;
      const existing = byKey.get(key);

      if (!existing) {
        byKey.set(key, {
          serviceId: log.serviceId,
          serviceName: log.serviceName,
          level: log.level,
          template,
          count: 1,
          firstSeen: log.timestamp,
          lastSeen: log.timestamp,
          sampleMessages: [log.message],
        });
        continue;
      }

      existing.count += 1;
      if (log.timestamp < existing.firstSeen) existing.firstSeen = log.timestamp;
      if (log.timestamp > existing.lastSeen) existing.lastSeen = log.timestamp;
      if (existing.sampleMessages.length < 3 && !existing.sampleMessages.includes(log.message)) {
        existing.sampleMessages.push(log.message);
      }
    }

    return [...byKey.values()]
      .sort((a, b) => {
        const severityDiff = (LEVEL_SEVERITY[b.level] ?? 0) - (LEVEL_SEVERITY[a.level] ?? 0);
        return severityDiff !== 0 ? severityDiff : b.count - a.count;
      })
      .slice(0, maxPatterns);
  }
}
