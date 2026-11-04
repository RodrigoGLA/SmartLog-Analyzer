import { describe, expect, it } from 'vitest';
import { LogPreprocessor, type RawLogForAnalysis } from './log-preprocessor.js';

function log(overrides: Partial<RawLogForAnalysis> = {}): RawLogForAnalysis {
  return {
    serviceId: 1,
    serviceName: 'checkout-api',
    level: 'ERROR',
    message: 'request failed',
    timestamp: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('LogPreprocessor.normalize', () => {
  const preprocessor = new LogPreprocessor();

  it('masks UUIDs', () => {
    expect(preprocessor.normalize('order 3fa85f64-5717-4562-b3fc-2c963f66afa6 failed')).toBe(
      'order <uuid> failed',
    );
  });

  it('masks emails', () => {
    expect(preprocessor.normalize('notify user@example.com failed')).toBe('notify <email> failed');
  });

  it('masks IPs', () => {
    expect(preprocessor.normalize('connection from 10.0.0.42 refused')).toBe(
      'connection from <ip> refused',
    );
  });

  it('masks ISO timestamps and plain numbers', () => {
    expect(preprocessor.normalize('retry 3 at 2026-01-01T00:00:00.000Z')).toBe(
      'retry <num> at <ts>',
    );
  });
});

describe('LogPreprocessor.buildPatterns', () => {
  const preprocessor = new LogPreprocessor();

  it('groups logs with the same service, level and normalized message into one pattern', () => {
    const logs = [
      log({ message: 'order 111 failed', timestamp: new Date('2026-01-01T00:00:00.000Z') }),
      log({ message: 'order 222 failed', timestamp: new Date('2026-01-01T00:05:00.000Z') }),
      log({ message: 'order 333 failed', timestamp: new Date('2026-01-01T00:10:00.000Z') }),
    ];

    const patterns = preprocessor.buildPatterns(logs, 50);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].count).toBe(3);
    expect(patterns[0].template).toBe('order <num> failed');
    expect(patterns[0].firstSeen).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    expect(patterns[0].lastSeen).toEqual(new Date('2026-01-01T00:10:00.000Z'));
  });

  it('keeps distinct patterns separate by service, level or message', () => {
    const logs = [
      log({ serviceId: 1, level: 'ERROR', message: 'a' }),
      log({ serviceId: 2, level: 'ERROR', message: 'a' }),
      log({ serviceId: 1, level: 'WARN', message: 'a' }),
      log({ serviceId: 1, level: 'ERROR', message: 'b' }),
    ];

    const patterns = preprocessor.buildPatterns(logs, 50);

    expect(patterns).toHaveLength(4);
  });

  it('orders by level severity first, then by frequency', () => {
    const logs = [
      ...Array.from({ length: 10 }, () => log({ level: 'INFO', message: 'noisy info' })),
      log({ level: 'FATAL', message: 'rare fatal' }),
      ...Array.from({ length: 2 }, () => log({ level: 'ERROR', message: 'frequent error' })),
      ...Array.from({ length: 5 }, () => log({ level: 'ERROR', message: 'more frequent error' })),
    ];

    const patterns = preprocessor.buildPatterns(logs, 50);

    expect(patterns[0].level).toBe('FATAL');
    expect(patterns[1]).toMatchObject({ level: 'ERROR', template: 'more frequent error', count: 5 });
    expect(patterns[2]).toMatchObject({ level: 'ERROR', template: 'frequent error', count: 2 });
    expect(patterns[3]).toMatchObject({ level: 'INFO', count: 10 });
  });

  it('caps the result at maxPatterns, keeping the highest-priority ones', () => {
    const words = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];
    const logs = words.map((word) => log({ message: `distinct failure ${word}` }));

    const patterns = preprocessor.buildPatterns(logs, 2);

    expect(patterns).toHaveLength(2);
  });

  it('keeps up to 3 distinct sample messages per pattern', () => {
    const logs = [
      log({ message: 'order 1 failed' }),
      log({ message: 'order 2 failed' }),
      log({ message: 'order 3 failed' }),
      log({ message: 'order 4 failed' }),
    ];

    const patterns = preprocessor.buildPatterns(logs, 50);

    expect(patterns[0].sampleMessages).toHaveLength(3);
  });
});
