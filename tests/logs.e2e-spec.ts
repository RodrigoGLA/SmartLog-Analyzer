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
import { startTestPostgres } from './setup/postgres-test-container.js';

describe('Logs (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;

  beforeAll(async () => {
    container = await startTestPostgres();

    // `ConfigModule.forRoot` valida el entorno al importar `AppModule`, antes de que este
    // `beforeAll` llegue a correr — pisar `process.env.DATABASE_URL` acá llega demasiado tarde
    // para que lo vea. En vez de pelear con ese timing, se reemplaza directamente el provider de
    // `PrismaService` por una instancia apuntada al Postgres efímero de Testcontainers.
    const testConfig = {
      get: () => container.getConnectionUri(),
    } as unknown as ConfigService<EnvironmentVariables, true>;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(new PrismaService(testConfig))
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

  it('creates a log, auto-registering its service, and lists it back', async () => {
    await request(app.getHttpServer())
      .post('/api/logs')
      .send({ service: 'checkout-api', level: 'ERROR', message: 'payment gateway timeout' })
      .expect(201);

    const response = await request(app.getHttpServer()).get('/api/logs').expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].service).toBe('checkout-api');
    expect(response.body.data[0].message).toBe('payment gateway timeout');
    expect(response.body.meta.total).toBe(1);
  });

  it('rejects an invalid level with an RFC 9457 problem details body', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/logs')
      .send({ service: 'checkout-api', level: 'NOT_A_LEVEL', message: 'oops' })
      .expect(400);

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body.errors).toBeDefined();
  });

  it('aggregates logs by service via /api/logs/stats', async () => {
    await request(app.getHttpServer())
      .post('/api/logs')
      .send({ service: 'checkout-api', level: 'ERROR', message: 'second error' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/api/logs/stats')
      .query({ groupBy: 'service' })
      .expect(200);

    expect(response.body.groupBy).toBe('service');
    const checkout = response.body.data.find((entry: { key: string }) => entry.key === 'checkout-api');
    expect(checkout.count).toBe(2);
  });

  it('rejects /api/logs/stats when from is after to', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/logs/stats')
      .query({ groupBy: 'level', from: '2026-02-01', to: '2026-01-01' })
      .expect(400);

    expect(response.headers['content-type']).toContain('application/problem+json');
  });
});
