import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TerminusModule } from '@nestjs/terminus';
import { describe, expect, it } from 'vitest';
import { PrismaService } from '../database/prisma.service.js';
import { HealthController } from './health.controller.js';

// `PrismaHealthIndicator` always tries `$runCommandRaw` first (its Mongo ping) and only falls
// back to `$queryRawUnsafe` (its SQL ping) when that throws the specific error a real
// `PrismaClient` on Postgres raises for that method — so the mock has to raise the same error.
function createPrismaMock(queryRawUnsafe: () => Promise<unknown>) {
  return {
    $runCommandRaw: () => Promise.reject(new Error('Use the mongodb provider.')),
    $queryRawUnsafe: queryRawUnsafe,
  } as unknown as PrismaService;
}

describe('HealthController', () => {
  it('reports the database as up when it responds', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: createPrismaMock(() => Promise.resolve(1)) }],
    }).compile();
    const controller = moduleRef.get(HealthController);

    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.details.database.status).toBe('up');
  });

  it('throws ServiceUnavailableException with a HealthCheckResult when the database is unreachable', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: createPrismaMock(() => Promise.reject(new Error('connection refused'))) },
      ],
    }).compile();
    const controller = moduleRef.get(HealthController);

    await expect(controller.check()).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      const body = (error as ServiceUnavailableException).getResponse() as {
        status: string;
        error: Record<string, { status: string }>;
      };
      expect(body.status).toBe('error');
      expect(body.error.database.status).toBe('down');
      return true;
    });
  });
});
