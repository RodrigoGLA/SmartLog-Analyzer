import { type INestApplication } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import type { EnvironmentVariables } from '../src/config/env.schema.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { PgBossService } from '../src/queue/pg-boss.service.js';
import { ANALYSIS_QUEUE } from '../src/queue/queue.constants.js';
import { startTestPostgres } from './setup/postgres-test-container.js';

describe('Queue (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let pgBoss: PgBossService;

  beforeAll(async () => {
    container = await startTestPostgres();

    // Mismo motivo que en logs.e2e-spec.ts: `ConfigModule.forRoot` valida el entorno al importar
    // `AppModule`, antes de que este `beforeAll` llegue a correr, así que pisar `process.env`
    // llega tarde. Se reemplazan tanto `PrismaService` como `PgBossService` por instancias
    // apuntadas al Postgres efímero de Testcontainers.
    const testConfig = {
      get: () => container.getConnectionUri(),
    } as unknown as ConfigService<EnvironmentVariables, true>;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(new PrismaService(testConfig))
      .overrideProvider(PgBossService)
      .useValue(new PgBossService(testConfig))
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
    pgBoss = app.get(PgBossService);
  });

  afterAll(async () => {
    await app?.close();
    await container?.stop();
  });

  it('delivers a sent job to a registered worker', async () => {
    const received = new Promise<{ greeting: string }>((resolve, reject) => {
      pgBoss
        .work<{ greeting: string }>(ANALYSIS_QUEUE, async ([job]) => {
          resolve(job.data);
        })
        .catch(reject);
    });

    await pgBoss.send(ANALYSIS_QUEUE, { greeting: 'hello worker' });

    await expect(received).resolves.toEqual({ greeting: 'hello worker' });
  });
});
