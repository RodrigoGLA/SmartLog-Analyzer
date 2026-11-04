import { type INestApplication, ValidationPipe } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter.js';
import type { EnvironmentVariables } from '../src/config/env.schema.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { LLM_PROVIDER } from '../src/llm/llm.constants.js';
import type { LlmAnalysisInput, LlmCorrectionContext, LlmProvider } from '../src/llm/llm-provider.interface.js';
import { PgBossService } from '../src/queue/pg-boss.service.js';
import { startTestPostgres } from './setup/postgres-test-container.js';

// Controllable test double: each `it()` sets `analyzeImpl` before acting, so the same
// overridden provider instance can simulate different LLM behaviors (success, transient
// failure) across test cases without rebuilding the whole Nest app each time.
let analyzeImpl: (input: LlmAnalysisInput, correction?: LlmCorrectionContext) => Promise<unknown> = () =>
  Promise.resolve({ summary: 'ok', findings: [], suggestions: [] });

const testLlmProvider: LlmProvider = {
  name: 'test-double',
  analyze: (input, correction) => analyzeImpl(input, correction),
};

async function waitForTerminalStatus(
  app: INestApplication,
  id: string,
  timeoutMs = 15000,
): Promise<{ status: string; [key: string]: unknown }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await request(app.getHttpServer()).get(`/api/analysis/${id}`).expect(200);
    if (response.body.status === 'completed' || response.body.status === 'failed') {
      return response.body;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Analysis ${id} did not reach a terminal status within ${timeoutMs}ms`);
}

describe('Analysis (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;

  beforeAll(async () => {
    container = await startTestPostgres();

    const testConfig = {
      get: (key: string) => {
        if (key === 'DATABASE_URL') return container.getConnectionUri();
        if (key === 'LLM_TIMEOUT_MS') return 20000;
        if (key === 'LLM_MAX_CORRECTION_RETRIES') return 1;
        return undefined;
      },
    } as unknown as ConfigService<EnvironmentVariables, true>;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(new PrismaService(testConfig))
      .overrideProvider(PgBossService)
      .useValue(new PgBossService(testConfig))
      .overrideProvider(LLM_PROVIDER)
      .useValue(testLlmProvider)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
  });

  afterEach(() => {
    analyzeImpl = () => Promise.resolve({ summary: 'ok', findings: [], suggestions: [] });
  });

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('runs a full analysis end to end: POST /analyze -> worker -> GET /analysis/:id', async () => {
    await request(app.getHttpServer())
      .post('/api/logs')
      .send({
        service: 'checkout-api',
        level: 'ERROR',
        message: 'payment gateway timeout',
        timestamp: '2026-01-01T00:00:00.000Z',
      })
      .expect(201);

    analyzeImpl = async () => ({
      summary: 'Checkout API had a timeout spike',
      findings: [{ category: 'error-rate', severity: 'HIGH', description: 'Gateway timeouts' }],
      suggestions: ['Check the payment gateway status page'],
    });

    const createResponse = await request(app.getHttpServer())
      .post('/api/logs/analyze')
      .send({ from: '2026-01-01T00:00:00.000Z', to: '2026-01-02T00:00:00.000Z' })
      .expect(202);

    expect(createResponse.body.status).toBe('pending');
    const analysisId = createResponse.body.id as string;

    const result = await waitForTerminalStatus(app, analysisId);

    expect(result.status).toBe('completed');
    expect(result.summary).toBe('Checkout API had a timeout spike');
    expect(result.findings).toEqual([
      { serviceId: null, category: 'error-rate', severity: 'HIGH', description: 'Gateway timeouts' },
    ]);
  });

  it('rejects with 422 when there are no logs in the given range', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/logs/analyze')
      .send({ from: '2020-01-01T00:00:00.000Z', to: '2020-01-02T00:00:00.000Z' })
      .expect(422);

    expect(response.headers['content-type']).toContain('application/problem+json');
  });

  it('recovers after a transient failure thanks to the queue retry policy', async () => {
    await request(app.getHttpServer())
      .post('/api/logs')
      .send({
        service: 'payments-api',
        level: 'ERROR',
        message: 'downstream 503',
        timestamp: '2026-03-01T00:00:00.000Z',
      })
      .expect(201);

    let attempts = 0;
    analyzeImpl = async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('simulated transient provider failure');
      }
      return { summary: 'recovered after retry', findings: [], suggestions: [] };
    };

    const createResponse = await request(app.getHttpServer())
      .post('/api/logs/analyze')
      .send({ from: '2026-03-01T00:00:00.000Z', to: '2026-03-02T00:00:00.000Z' })
      .expect(202);

    const result = await waitForTerminalStatus(app, createResponse.body.id as string, 20000);

    expect(result.status).toBe('completed');
    expect(result.summary).toBe('recovered after retry');
    expect(attempts).toBeGreaterThanOrEqual(2);
  });

  it('recovers from an invalid-shaped response by retrying with a correction, and completes', async () => {
    await request(app.getHttpServer())
      .post('/api/logs')
      .send({
        service: 'checkout-api',
        level: 'ERROR',
        message: 'invalid-then-valid test',
        timestamp: '2026-04-01T00:00:00.000Z',
      })
      .expect(201);

    let calls = 0;
    analyzeImpl = async () => {
      calls += 1;
      if (calls === 1) {
        return { summary: 42, findings: 'not-an-array' };
      }
      return { summary: 'corrected on retry', findings: [], suggestions: [] };
    };

    const createResponse = await request(app.getHttpServer())
      .post('/api/logs/analyze')
      .send({ from: '2026-04-01T00:00:00.000Z', to: '2026-04-02T00:00:00.000Z' })
      .expect(202);

    const result = await waitForTerminalStatus(app, createResponse.body.id as string);

    expect(result.status).toBe('completed');
    expect(result.summary).toBe('corrected on retry');
    expect(calls).toBe(2);
  });

  it('gives up after exhausting correction retries and marks the analysis failed', async () => {
    await request(app.getHttpServer())
      .post('/api/logs')
      .send({
        service: 'checkout-api',
        level: 'ERROR',
        message: 'always-invalid test',
        timestamp: '2026-05-01T00:00:00.000Z',
      })
      .expect(201);

    analyzeImpl = async () => ({ summary: 42, findings: 'not-an-array' });

    const createResponse = await request(app.getHttpServer())
      .post('/api/logs/analyze')
      .send({ from: '2026-05-01T00:00:00.000Z', to: '2026-05-02T00:00:00.000Z' })
      .expect(202);

    const result = await waitForTerminalStatus(app, createResponse.body.id as string);

    expect(result.status).toBe('failed');
    expect((result.error as { code: string }).code).toBe('LLM_INVALID_RESPONSE');
  });
});
