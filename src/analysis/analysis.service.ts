import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnalysisStatus, type Analysis, type AnalysisFinding, type Prisma } from '@prisma/client';
import type { EnvironmentVariables } from '../config/env.schema.js';
import { LogsService } from '../logs/logs.service.js';
import { PgBossService } from '../queue/pg-boss.service.js';
import { ANALYSIS_QUEUE } from '../queue/queue.constants.js';
import type { AnalyzeLogsDto } from './dto/analyze-logs.dto.js';
import { PrismaService } from '../database/prisma.service.js';

export interface AnalysisFilters {
  from: string;
  to: string;
  services?: number[];
  levels?: string[];
}

export interface CreatedAnalysis {
  id: string;
  status: AnalysisStatus;
}

export interface AnalysisResponse {
  id: string;
  status: AnalysisStatus;
  summary?: string;
  suggestions?: string[];
  findings?: { serviceId: number | null; category: string; severity: string; description: string }[];
  error?: { code: string; message: string };
}

@Injectable()
export class AnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pgBoss: PgBossService,
    private readonly logsService: LogsService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async createAnalysis(dto: AnalyzeLogsDto): Promise<CreatedAnalysis> {
    const from = new Date(dto.from);
    const to = new Date(dto.to);

    if (from > to) {
      throw new BadRequestException('`from` must be earlier than or equal to `to`');
    }

    const maxRangeHours = this.config.get('ANALYSIS_MAX_RANGE_HOURS', { infer: true });
    const rangeHours = (to.getTime() - from.getTime()) / (1000 * 60 * 60);
    if (rangeHours > maxRangeHours) {
      throw new UnprocessableEntityException(
        `Range exceeds the maximum allowed of ${maxRangeHours}h`,
      );
    }

    const logCount = await this.logsService.countForAnalysis({
      from,
      to,
      services: dto.services,
      levels: dto.levels,
    });
    if (logCount === 0) {
      throw new UnprocessableEntityException('No logs found for the given range/filters');
    }

    const filters: AnalysisFilters = {
      from: dto.from,
      to: dto.to,
      ...(dto.services ? { services: dto.services } : {}),
      ...(dto.levels ? { levels: dto.levels } : {}),
    };

    const analysis = await this.prisma.analysis.create({
      data: { status: AnalysisStatus.pending, filters: filters as unknown as Prisma.InputJsonValue },
    });

    await this.pgBoss.send(ANALYSIS_QUEUE, { analysisId: analysis.id });

    return { id: analysis.id, status: analysis.status };
  }

  async getById(id: string): Promise<AnalysisResponse> {
    const analysis = await this.prisma.analysis.findUnique({
      where: { id },
      include: { findings: true },
    });

    if (!analysis) {
      throw new NotFoundException(`Analysis ${id} not found`);
    }

    return this.toResponse(analysis);
  }

  private toResponse(analysis: Analysis & { findings: AnalysisFinding[] }): AnalysisResponse {
    const base: AnalysisResponse = { id: analysis.id, status: analysis.status };

    if (analysis.status === AnalysisStatus.completed) {
      return {
        ...base,
        summary: analysis.summary ?? undefined,
        suggestions: (analysis.suggestions as string[] | null) ?? [],
        findings: analysis.findings.map((finding) => ({
          serviceId: finding.serviceId,
          category: finding.category,
          severity: finding.severity,
          description: finding.description,
        })),
      };
    }

    if (analysis.status === AnalysisStatus.failed) {
      return {
        ...base,
        error: { code: analysis.errorCode ?? 'UNKNOWN', message: analysis.errorMessage ?? '' },
      };
    }

    return base;
  }
}
