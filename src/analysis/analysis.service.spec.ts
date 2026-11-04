import { AnalysisStatus, Severity } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { LogsService } from '../logs/logs.service.js';
import type { PgBossService } from '../queue/pg-boss.service.js';
import type { PrismaService } from '../database/prisma.service.js';
import { AnalysisService } from './analysis.service.js';

function createDeps() {
  const prisma = {
    analysis: { create: vi.fn(), findUnique: vi.fn() },
  } as unknown as PrismaService & { analysis: { create: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> } };

  const pgBoss = { send: vi.fn() } as unknown as PgBossService & { send: ReturnType<typeof vi.fn> };

  const logsService = { countForAnalysis: vi.fn() } as unknown as LogsService & {
    countForAnalysis: ReturnType<typeof vi.fn>;
  };

  const config = { get: vi.fn().mockReturnValue(168) } as unknown as ConfigService & {
    get: ReturnType<typeof vi.fn>;
  };

  return { prisma, pgBoss, logsService, config };
}

describe('AnalysisService', () => {
  let deps: ReturnType<typeof createDeps>;
  let service: AnalysisService;

  beforeEach(() => {
    deps = createDeps();
    service = new AnalysisService(deps.prisma, deps.pgBoss, deps.logsService, deps.config);
  });

  it('rejects when `from` is after `to`', async () => {
    await expect(
      service.createAnalysis({ from: '2026-02-01T00:00:00.000Z', to: '2026-01-01T00:00:00.000Z' }),
    ).rejects.toThrow('`from` must be earlier than or equal to `to`');
    expect(deps.logsService.countForAnalysis).not.toHaveBeenCalled();
  });

  it('rejects when the range exceeds ANALYSIS_MAX_RANGE_HOURS', async () => {
    deps.config.get.mockReturnValue(1);

    await expect(
      service.createAnalysis({ from: '2026-01-01T00:00:00.000Z', to: '2026-01-03T00:00:00.000Z' }),
    ).rejects.toThrow('Range exceeds the maximum allowed');
    expect(deps.logsService.countForAnalysis).not.toHaveBeenCalled();
  });

  it('rejects with 422 when there are no logs in range, without creating an Analysis', async () => {
    deps.logsService.countForAnalysis.mockResolvedValue(0);

    await expect(
      service.createAnalysis({ from: '2026-01-01T00:00:00.000Z', to: '2026-01-02T00:00:00.000Z' }),
    ).rejects.toThrow('No logs found');
    expect(deps.prisma.analysis.create).not.toHaveBeenCalled();
    expect(deps.pgBoss.send).not.toHaveBeenCalled();
  });

  it('creates a pending Analysis and enqueues a job when there are logs in range', async () => {
    deps.logsService.countForAnalysis.mockResolvedValue(3);
    deps.prisma.analysis.create.mockResolvedValue({ id: 'abc-123', status: AnalysisStatus.pending });

    const result = await service.createAnalysis({
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-02T00:00:00.000Z',
      services: [1],
      levels: ['ERROR'],
    });

    expect(result).toEqual({ id: 'abc-123', status: AnalysisStatus.pending });
    expect(deps.prisma.analysis.create).toHaveBeenCalledWith({
      data: {
        status: AnalysisStatus.pending,
        filters: {
          from: '2026-01-01T00:00:00.000Z',
          to: '2026-01-02T00:00:00.000Z',
          services: [1],
          levels: ['ERROR'],
        },
      },
    });
    expect(deps.pgBoss.send).toHaveBeenCalledWith('analysis', { analysisId: 'abc-123' });
  });

  it('getById throws NotFoundException when the analysis does not exist', async () => {
    deps.prisma.analysis.findUnique.mockResolvedValue(null);

    await expect(service.getById('missing-id')).rejects.toThrow('not found');
  });

  it('getById returns summary/findings/suggestions when completed', async () => {
    deps.prisma.analysis.findUnique.mockResolvedValue({
      id: 'abc-123',
      status: AnalysisStatus.completed,
      summary: 'All good',
      suggestions: ['check x'],
      findings: [{ serviceId: 1, category: 'perf', severity: Severity.HIGH, description: 'slow' }],
    });

    const result = await service.getById('abc-123');

    expect(result).toEqual({
      id: 'abc-123',
      status: AnalysisStatus.completed,
      summary: 'All good',
      suggestions: ['check x'],
      findings: [{ serviceId: 1, category: 'perf', severity: Severity.HIGH, description: 'slow' }],
    });
  });

  it('getById returns an error object when failed', async () => {
    deps.prisma.analysis.findUnique.mockResolvedValue({
      id: 'abc-123',
      status: AnalysisStatus.failed,
      errorCode: 'LLM_TIMEOUT',
      errorMessage: 'took too long',
      findings: [],
    });

    const result = await service.getById('abc-123');

    expect(result).toEqual({
      id: 'abc-123',
      status: AnalysisStatus.failed,
      error: { code: 'LLM_TIMEOUT', message: 'took too long' },
    });
  });

  it('getById returns only id/status while pending or processing', async () => {
    deps.prisma.analysis.findUnique.mockResolvedValue({
      id: 'abc-123',
      status: AnalysisStatus.processing,
      findings: [],
    });

    const result = await service.getById('abc-123');

    expect(result).toEqual({ id: 'abc-123', status: AnalysisStatus.processing });
  });
});
