import { describe, expect, it } from 'vitest';
import { validateEnv } from './validate-env.js';

describe('validateEnv', () => {
  it('accepts a valid environment', () => {
    const result = validateEnv({ PORT: '3000', DATABASE_URL: 'postgresql://u:p@localhost:5432/db' });

    expect(result.PORT).toBe(3000);
    expect(result.DATABASE_URL).toBe('postgresql://u:p@localhost:5432/db');
  });

  it('defaults PORT to 3000 when absent', () => {
    const result = validateEnv({ DATABASE_URL: 'postgresql://u:p@localhost:5432/db' });

    expect(result.PORT).toBe(3000);
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() => validateEnv({ PORT: '3000' })).toThrow(/DATABASE_URL/);
  });

  it('throws when PORT is not numeric', () => {
    expect(() =>
      validateEnv({ PORT: 'abc', DATABASE_URL: 'postgresql://u:p@localhost:5432/db' }),
    ).toThrow();
  });

  it('throws when PORT is out of range', () => {
    expect(() =>
      validateEnv({ PORT: '99999', DATABASE_URL: 'postgresql://u:p@localhost:5432/db' }),
    ).toThrow();
  });
});
