import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalysisStatus, type Prisma } from '@prisma/client';
import type { Job } from 'pg-boss';
import type { ZodError } from 'zod';
import type { EnvironmentVariables } from '../config/env.schema.js';
import { PrismaService } from '../database/prisma.service.js';
import { analysisResultSchema, type AnalysisResult } from '../llm/analysis-result.schema.js';
import { LLM_PROVIDER } from '../llm/llm.constants.js';
import { LlmInvalidResponseError, LlmProviderError, LlmTimeoutError, type LlmErrorCode } from '../llm/llm.errors.js';
import type { LlmAnalysisInput, LlmCorrectionContext, LlmProvider } from '../llm/llm-provider.interface.js';
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
      const result = await this.analyzeWithRetries(input, timeoutMs);
      await this.persistSuccess(analysisId, result, inputSnapshot);
    } catch (error) {
      const mapped = this.mapDomainError(error);
      if (!mapped) {
        throw error;
      }
      await this.persistFailure(analysisId, mapped, inputSnapshot);
    }
  }

  /**
   * Hace hasta `LLM_MAX_CORRECTION_RETRIES` reintentos cuando la respuesta del LLM no es válida
   * (JSON que no cumple `analysisResultSchema`, o directamente no es JSON), reenviando el error de
   * validación como contexto de corrección. Cualquier otro error (timeout, falla del proveedor,
   * infraestructura) se propaga de inmediato, sin reintentar — una corrección de prompt no arregla
   * ninguno de esos casos (ver decisión #28 en ARCHITECTURE.md).
   */
  private async analyzeWithRetries(input: LlmAnalysisInput, timeoutMs: number): Promise<AnalysisResult> {
    const maxRetries = this.config.get('LLM_MAX_CORRECTION_RETRIES', { infer: true });
    let correction: LlmCorrectionContext | undefined;
    let lastError: LlmInvalidResponseError | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const raw = await this.withTimeout(this.llmProvider.analyze(input, correction), timeoutMs);
        const parsed = analysisResultSchema.safeParse(raw);
        if (parsed.success) {
          return parsed.data;
        }
        lastError = new LlmInvalidResponseError(this.describeValidationError(parsed.error));
        correction = { previousResponse: raw, validationError: lastError.message };
      } catch (error) {
        if (!(error instanceof LlmInvalidResponseError)) {
          throw error;
        }
        lastError = error;
        correction = { previousResponse: undefined, validationError: error.message };
      }
      this.logger.warn(
        `Analysis: LLM response rejected (attempt ${attempt + 1}/${maxRetries + 1}): ${lastError.message}`,
      );
    }

    throw lastError;
  }

  private describeValidationError(error: ZodError): string {
    return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
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
