import { LogLevel } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../database/prisma.service.js';
import { LogsService } from './logs.service.js';

function createPrismaMock() {
  return {
    service: {
      upsert: vi.fn(),
      findMany: vi.fn(),
    },
    log: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    },
    $transaction: vi.fn(),
  } as unknown as PrismaService & {
    service: { upsert: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    log: {
      create: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      groupBy: ReturnType<typeof vi.fn>;
    };
    $transaction: ReturnType<typeof vi.fn>;
  };
}

describe('LogsService', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: LogsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new LogsService(prisma);
  });

  it('upserts the service by name and creates the log', async () => {
    prisma.service.upsert.mockResolvedValue({ id: 1, name: 'checkout-api' });
    prisma.log.create.mockResolvedValue({
      id: 10n,
      serviceId: 1,
      level: LogLevel.ERROR,
      message: 'boom',
      timestamp: new Date('2026-01-01T00:00:00.000Z'),
      ingestedAt: new Date('2026-01-01T00:00:01.000Z'),
      traceId: null,
      metadata: null,
    });

    const result = await service.create({
      service: 'checkout-api',
      level: LogLevel.ERROR,
      message: 'boom',
    });

    expect(prisma.service.upsert).toHaveBeenCalledWith({
      where: { name: 'checkout-api' },
      update: {},
      create: { name: 'checkout-api' },
    });
    expect(result.id).toBe('10');
    expect(result.service).toBe('checkout-api');
  });

  it('reuses an existing service instead of creating a duplicate', async () => {
    prisma.service.upsert.mockResolvedValue({ id: 5, name: 'payments-api' });
    prisma.log.create.mockResolvedValue({
      id: 1n,
      serviceId: 5,
      level: LogLevel.INFO,
      message: 'ok',
      timestamp: new Date(),
      ingestedAt: new Date(),
      traceId: null,
      metadata: null,
    });

    await service.create({ service: 'payments-api', level: LogLevel.INFO, message: 'ok' });

    expect(prisma.log.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ serviceId: 5 }) }),
    );
  });

  it('paginates results using page and limit', async () => {
    prisma.$transaction.mockResolvedValue([
      [
        {
          id: 1n,
          level: LogLevel.WARN,
          message: 'slow query',
          timestamp: new Date(),
          ingestedAt: new Date(),
          traceId: null,
          metadata: null,
          service: { name: 'db-proxy' },
        },
      ],
      42,
    ]);

    const result = await service.findAll({ page: 2, limit: 10 });

    expect(result.meta).toEqual({ page: 2, limit: 10, total: 42 });
    expect(result.data[0].service).toBe('db-proxy');
    expect(result.data[0].id).toBe('1');
  });

  it('groups stats by level', async () => {
    prisma.log.groupBy.mockResolvedValue([
      { level: LogLevel.ERROR, _count: { _all: 5 } },
      { level: LogLevel.INFO, _count: { _all: 20 } },
    ]);

    const result = await service.getStats({ groupBy: 'level' });

    expect(result.groupBy).toBe('level');
    expect(result.data).toEqual([
      { key: 'INFO', count: 20 },
      { key: 'ERROR', count: 5 },
    ]);
  });

  it('groups stats by service, resolving service names', async () => {
    prisma.log.groupBy.mockResolvedValue([
      { serviceId: 1, _count: { _all: 3 } },
      { serviceId: 2, _count: { _all: 9 } },
    ]);
    prisma.service.findMany.mockResolvedValue([
      { id: 1, name: 'checkout-api' },
      { id: 2, name: 'payments-api' },
    ]);

    const result = await service.getStats({ groupBy: 'service' });

    expect(result.data).toEqual([
      { key: 'payments-api', count: 9 },
      { key: 'checkout-api', count: 3 },
    ]);
  });

  it('rejects a from/to range where from is after to', async () => {
    await expect(
      service.getStats({ groupBy: 'level', from: '2026-02-01', to: '2026-01-01' }),
    ).rejects.toThrow('`from` must be earlier than or equal to `to`');
    expect(prisma.log.groupBy).not.toHaveBeenCalled();
  });
});
