import { AnalysisStatus } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { LogPreprocessor } from '../llm/log-preprocessor.js';
import type { LlmProvider } from '../llm/llm-provider.interface.js';
import type { LogsService } from '../logs/logs.service.js';
import type { PgBossService } from '../queue/pg-boss.service.js';
import type { PrismaService } from '../database/prisma.service.js';
import { AnalysisWorkerService } from './analysis-worker.service.js';

function createDeps() {
  const pgBoss = { work: vi.fn() } as unknown as PgBossService & { work: ReturnType<typeof vi.fn> };

  const prisma = {
    analysis: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    analysisFinding: { createMany: vi.fn() },
    $transaction: vi.fn().mockResolvedValue(undefined),
  } as unknown as PrismaService & {
    analysis: { findUniqueOrThrow: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    analysisFinding: { createMany: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };

  const logsService = { findManyForAnalysis: vi.fn().mockResolvedValue([]) } as unknown as LogsService & {
    findManyForAnalysis: ReturnType<typeof vi.fn>;
  };

  const llmProvider = { name: 'mock', analyze: vi.fn() } as unknown as LlmProvider & {
    analyze: ReturnType<typeof vi.fn>;
  };

  const preprocessor = new LogPreprocessor();

  const config = {
    get: vi.fn((key: string) => (key === 'LLM_TIMEOUT_MS' ? 1000 : 50)),
  } as unknown as ConfigService & { get: ReturnType<typeof vi.fn> };

  return { pgBoss, prisma, logsService, llmProvider, preprocessor, config };
}

function pendingAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    id: 'abc-123',
    status: AnalysisStatus.pending,
    filters: { from: '2026-01-01T00:00:00.000Z', to: '2026-01-02T00:00:00.000Z' },
    ...overrides,
  };
}

describe('AnalysisWorkerService.handleJob', () => {
  let deps: ReturnType<typeof createDeps>;
  let worker: AnalysisWorkerService;

  beforeEach(() => {
    deps = createDeps();
    worker = new AnalysisWorkerService(
      deps.pgBoss,
      deps.prisma,
      deps.logsService,
      deps.llmProvider,
      deps.preprocessor,
      deps.config,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('persists a completed analysis with its findings on a valid response', async () => {
    deps.prisma.analysis.findUniqueOrThrow.mockResolvedValue(pendingAnalysis());
    deps.llmProvider.analyze.mockResolvedValue({
      summary: 'ok',
      findings: [{ serviceId: 1, category: 'perf', severity: 'HIGH', description: 'slow' }],
      suggestions: ['check x'],
    });

    await worker.handleJob('abc-123');

    expect(deps.prisma.analysis.update).toHaveBeenCalledWith({
      where: { id: 'abc-123' },
      data: { status: AnalysisStatus.processing },
    });
    expect(deps.prisma.analysis.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'abc-123' },
        data: expect.objectContaining({ status: AnalysisStatus.completed, summary: 'ok' }),
      }),
    );
    expect(deps.prisma.analysisFinding.createMany).toHaveBeenCalledWith({
      data: [{ analysisId: 'abc-123', serviceId: 1, category: 'perf', severity: 'HIGH', description: 'slow' }],
    });
  });

  it('is a no-op (idempotent) when the analysis is already completed', async () => {
    deps.prisma.analysis.findUniqueOrThrow.mockResolvedValue(pendingAnalysis({ status: AnalysisStatus.completed }));

    await worker.handleJob('abc-123');

    expect(deps.prisma.analysis.update).not.toHaveBeenCalled();
    expect(deps.llmProvider.analyze).not.toHaveBeenCalled();
  });

  it('persists a failed analysis with LLM_INVALID_RESPONSE on a malformed response, without throwing', async () => {
    deps.prisma.analysis.findUniqueOrThrow.mockResolvedValue(pendingAnalysis());
    deps.llmProvider.analyze.mockResolvedValue({ summary: 42, findings: 'nope' });

    await expect(worker.handleJob('abc-123')).resolves.toBeUndefined();

    expect(deps.prisma.analysis.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: AnalysisStatus.failed, errorCode: 'LLM_INVALID_RESPONSE' }),
      }),
    );
  });

  it('persists a failed analysis with LLM_TIMEOUT when the provider never resolves in time, without throwing', async () => {
    vi.useFakeTimers();
    deps.prisma.analysis.findUniqueOrThrow.mockResolvedValue(pendingAnalysis());
    deps.llmProvider.analyze.mockReturnValue(new Promise(() => {}));

    const promise = worker.handleJob('abc-123');
    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    expect(deps.prisma.analysis.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: AnalysisStatus.failed, errorCode: 'LLM_TIMEOUT' }),
      }),
    );
  });

  it('lets an infrastructure error propagate instead of swallowing it, so pg-boss retries', async () => {
    deps.prisma.analysis.findUniqueOrThrow.mockResolvedValue(pendingAnalysis());
    deps.llmProvider.analyze.mockRejectedValue(new Error('network is down'));

    await expect(worker.handleJob('abc-123')).rejects.toThrow('network is down');

    expect(deps.prisma.analysis.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: AnalysisStatus.failed }) }),
    );
  });
});
