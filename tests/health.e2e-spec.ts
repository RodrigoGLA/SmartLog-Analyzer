import { type INestApplication, ValidationPipe } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter.js';
import type { EnvironmentVariables } from '../src/config/env.schema.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PgBossService } from '../src/queue/pg-boss.service.js';
import { startTestPostgres } from './setup/postgres-test-container.js';

describe('Health (e2e)', () => {
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
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('reports the service and its database as healthy', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.details.database.status).toBe('up');
  });
});
