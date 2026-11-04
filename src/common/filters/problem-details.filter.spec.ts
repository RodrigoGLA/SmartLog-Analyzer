import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProblemDetailsFilter } from './problem-details.filter.js';

function createHost(url = '/api/logs') {
  const send = vi.fn();
  const contentType = vi.fn().mockReturnValue({ send });
  const status = vi.fn().mockReturnValue({ contentType });
  const response = { status };
  const request = { url };

  const host: Partial<ArgumentsHost> = {
    switchToHttp: () =>
      ({
        getResponse: () => response,
        getRequest: () => request,
      }) as never,
  };

  return { host: host as ArgumentsHost, status, contentType, send };
}

describe('ProblemDetailsFilter', () => {
  it('maps a validation BadRequestException to RFC 9457 with an errors array', () => {
    const filter = new ProblemDetailsFilter();
    const exception = new BadRequestException({
      message: ['service should not be empty', 'level must be a valid enum value'],
      error: 'Bad Request',
    });
    const { host, status, send } = createHost();

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(400);
    const body = send.mock.calls[0][0];
    expect(body.title).toBe('Bad Request');
    expect(body.errors).toEqual([
      'service should not be empty',
      'level must be a valid enum value',
    ]);
    expect(body.instance).toBe('/api/logs');
  });

  it('maps a non-HTTP exception to a generic 500 without leaking internals', () => {
    const filter = new ProblemDetailsFilter();
    const exception = new Error('secret stack trace detail');
    const { host, status, send } = createHost();

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(500);
    const body = send.mock.calls[0][0];
    expect(body.title).toBe('Internal Server Error');
    expect(body.detail).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('secret stack trace detail');
  });

  it('maps a terminus HealthCheckResult failure to 503 with which indicator failed', () => {
    const filter = new ProblemDetailsFilter();
    const exception = new ServiceUnavailableException({
      status: 'error',
      info: {},
      error: { database: { status: 'down', message: 'connection refused' } },
      details: { database: { status: 'down', message: 'connection refused' } },
    });
    const { host, status, send } = createHost('/api/health');

    filter.catch(exception, host);

    expect(status).toHaveBeenCalledWith(503);
    const body = send.mock.calls[0][0];
    expect(body.title).toBe('Service Unavailable');
    expect(body.errors).toEqual(['database: connection refused']);
  });
});
