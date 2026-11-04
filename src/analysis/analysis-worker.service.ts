import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalysisStatus, type Prisma } from '@prisma/client';
import type { Job } from 'pg-boss';
import type { EnvironmentVariables } from '../config/env.schema.js';
import { PrismaService } from '../database/prisma.service.js';
import { analysisResultSchema, type AnalysisResult } from '../llm/analysis-result.schema.js';
import { LLM_PROVIDER } from '../llm/llm.constants.js';
import { LlmInvalidResponseError, LlmProviderError, LlmTimeoutError, type LlmErrorCode } from '../llm/llm.errors.js';
import type { LlmAnalysisInput, LlmProvider } from '../llm/llm-provider.interface.js';
import { LogPreprocessor, type LogPattern } from '../llm/log-preprocessor.js';
import { LogsService } from '../logs/logs.service.js';
import { PgBossService } from '../queue/pg-boss.service.js';
import { ANALYSIS_QUEUE } from '../queue/queue.constants.js';
import type { AnalysisFilters } from './analysis.service.js';

interface AnalysisJobData {
  analysisId: string;
}

@Injectable()
export class AnalysisWorkerService implements OnModuleInit {
  private readonly logger = new Logger(AnalysisWorkerService.name);

  constructor(
    private readonly pgBoss: PgBossService,
    private readonly prisma: PrismaService,
    private readonly logsService: LogsService,
    @Inject(LLM_PROVIDER) private readonly llmProvider: LlmProvider,
    private readonly preprocessor: LogPreprocessor,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.pgBoss.work<AnalysisJobData, void>(ANALYSIS_QUEUE, (jobs) => this.handleBatch(jobs));
  }

  private async handleBatch(jobs: Job<AnalysisJobData>[]): Promise<void> {
    for (const job of jobs) {
      await this.handleJob(job.data.analysisId);
    }
  }

  async handleJob(analysisId: string): Promise<void> {
    const analysis = await this.prisma.analysis.findUniqueOrThrow({ where: { id: analysisId } });

    if (analysis.status === AnalysisStatus.completed || analysis.status === AnalysisStatus.failed) {
      this.logger.warn(`Analysis ${analysisId} already settled (${analysis.status}); skipping.`);
      return;
    }

    await this.prisma.analysis.update({
      where: { id: analysisId },
      data: { status: AnalysisStatus.processing },
    });

    const filters = analysis.filters as unknown as AnalysisFilters;
    const from = new Date(filters.from);
    const to = new Date(filters.to);
    const maxPatterns = this.config.get('ANALYSIS_MAX_PATTERNS', { infer: true });
    const timeoutMs = this.config.get('LLM_TIMEOUT_MS', { infer: true });

    const logs = await this.logsService.findManyForAnalysis({
      from,
      to,
      services: filters.services,
      levels: filters.levels as never,
    });

    const allPatterns = this.preprocessor.buildPatterns(logs, Number.MAX_SAFE_INTEGER);
    const patterns = allPatterns.slice(0, maxPatterns);
    const truncated = allPatterns.length > maxPatterns;

    const input: LlmAnalysisInput = { from, to, totalLogCount: logs.length, patterns, truncated };
    const inputSnapshot = this.buildInputSnapshot(input);

    try {
      const raw = await this.withTimeout(this.llmProvider.analyze(input), timeoutMs);
      const parsed = analysisResultSchema.safeParse(raw);
      if (!parsed.success) {
        throw new LlmInvalidResponseError(parsed.error.issues[0]?.message ?? 'Invalid LLM response shape');
      }

      await this.persistSuccess(analysisId, parsed.data, inputSnapshot);
    } catch (error) {
      const mapped = this.mapDomainError(error);
      if (!mapped) {
        throw error;
      }
      await this.persistFailure(analysisId, mapped, inputSnapshot);
    }
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new LlmTimeoutError()), timeoutMs);
      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  private mapDomainError(error: unknown): { code: LlmErrorCode; message: string } | null {
    if (error instanceof LlmTimeoutError || error instanceof LlmInvalidResponseError || error instanceof LlmProviderError) {
      return { code: error.code, message: error.message };
    }
    return null;
  }

  private buildInputSnapshot(input: LlmAnalysisInput): Prisma.InputJsonValue {
    return {
      totalLogCount: input.totalLogCount,
      truncated: input.truncated,
      patternCount: input.patterns.length,
      patterns: input.patterns.map((pattern: LogPattern) => ({
        serviceId: pattern.serviceId,
        serviceName: pattern.serviceName,
        level: pattern.level,
        template: pattern.template,
        count: pattern.count,
      })),
    };
  }

  private async persistSuccess(
    analysisId: string,
    result: AnalysisResult,
    inputSnapshot: Prisma.InputJsonValue,
  ): Promise<void> {
    const operations: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.analysis.update({
        where: { id: analysisId },
        data: {
          status: AnalysisStatus.completed,
          summary: result.summary,
          suggestions: result.suggestions,
          provider: this.llmProvider.name,
          inputSnapshot,
          completedAt: new Date(),
        },
      }),
    ];

    if (result.findings.length > 0) {
      operations.push(
        this.prisma.analysisFinding.createMany({
          data: result.findings.map((finding) => ({
            analysisId,
            serviceId: finding.serviceId ?? null,
            category: finding.category,
            severity: finding.severity,
            description: finding.description,
          })),
        }),
      );
    }

    await this.prisma.$transaction(operations);
  }

  private async persistFailure(
    analysisId: string,
    error: { code: LlmErrorCode; message: string },
    inputSnapshot: Prisma.InputJsonValue,
  ): Promise<void> {
    await this.prisma.analysis.update({
      where: { id: analysisId },
      data: {
        status: AnalysisStatus.failed,
        errorCode: error.code,
        errorMessage: error.message,
        provider: this.llmProvider.name,
        inputSnapshot,
        completedAt: new Date(),
      },
    });
  }
}
