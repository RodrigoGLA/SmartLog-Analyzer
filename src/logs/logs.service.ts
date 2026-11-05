import { BadRequestException, Injectable } from '@nestjs/common';
import type { Log, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import type { RawLogForAnalysis } from '../llm/log-preprocessor.js';
import type { CreateLogDto } from './dto/create-log.dto.js';
import type { ListLogsQueryDto } from './dto/list-logs-query.dto.js';
import type { StatsGroupBy, StatsQueryDto } from './dto/stats-query.dto.js';

export interface AnalysisLogFilters {
  from: Date;
  to: Date;
  services?: number[];
  levels?: Log['level'][];
}

export interface LogResponse {
  id: string;
  service: string;
  level: Log['level'];
  message: string;
  timestamp: Date;
  ingestedAt: Date;
  traceId: string | null;
  metadata: Log['metadata'];
}

export interface PaginatedLogs {
  data: LogResponse[];
  meta: { page: number; limit: number; total: number };
}

export interface StatsEntry {
  key: string;
  count: number;
}

export interface StatsResponse {
  groupBy: StatsGroupBy;
  from: string | null;
  to: string | null;
  data: StatsEntry[];
}

@Injectable()
export class LogsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateLogDto): Promise<LogResponse> {
    const service = await this.prisma.service.upsert({
      where: { name: dto.service },
      update: {},
      create: { name: dto.service },
    });

    const log = await this.prisma.log.create({
      data: {
        serviceId: service.id,
        level: dto.level,
        message: dto.message,
        timestamp: dto.timestamp ? new Date(dto.timestamp) : new Date(),
        traceId: dto.traceId,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
      },
    });

    return this.toResponse(log, service.name);
  }

  async findAll(query: ListLogsQueryDto): Promise<PaginatedLogs> {
    const { page, limit, service, level, search } = query;
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from > to) {
      throw new BadRequestException('`from` must be earlier than or equal to `to`');
    }

    const where: Prisma.LogWhereInput = {
      ...(service && { service: { name: { equals: service, mode: 'insensitive' } } }),
      ...(level && { level }),
      ...(search && { message: { contains: search, mode: 'insensitive' } }),
    };
    if (from || to) {
      where.timestamp = { ...(from && { gte: from }), ...(to && { lte: to }) };
    }

    const skip = (page - 1) * limit;
    const [logs, total] = await this.prisma.$transaction([
      this.prisma.log.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
        include: { service: true },
      }),
      this.prisma.log.count({ where }),
    ]);

    return {
      data: logs.map((log) => this.toResponse(log, log.service.name)),
      meta: { page, limit, total },
    };
  }

  async getStats(query: StatsQueryDto): Promise<StatsResponse> {
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    if (from && to && from > to) {
      throw new BadRequestException('`from` must be earlier than or equal to `to`');
    }

    const where: Prisma.LogWhereInput = {};
    if (from || to) {
      where.timestamp = { ...(from && { gte: from }), ...(to && { lte: to }) };
    }

    const data =
      query.groupBy === 'level' ? await this.statsByLevel(where) : await this.statsByService(where);

    return {
      groupBy: query.groupBy,
      from: query.from ?? null,
      to: query.to ?? null,
      data: data.sort((a, b) => b.count - a.count),
    };
  }

  async countForAnalysis(filters: AnalysisLogFilters): Promise<number> {
    return this.prisma.log.count({ where: this.buildAnalysisWhere(filters) });
  }

  async findManyForAnalysis(filters: AnalysisLogFilters): Promise<RawLogForAnalysis[]> {
    const logs = await this.prisma.log.findMany({
      where: this.buildAnalysisWhere(filters),
      include: { service: true },
    });

    return logs.map((log) => ({
      serviceId: log.serviceId,
      serviceName: log.service.name,
      level: log.level,
      message: log.message,
      timestamp: log.timestamp,
    }));
  }

  private buildAnalysisWhere(filters: AnalysisLogFilters): Prisma.LogWhereInput {
    return {
      timestamp: { gte: filters.from, lte: filters.to },
      ...(filters.services?.length ? { serviceId: { in: filters.services } } : {}),
      ...(filters.levels?.length ? { level: { in: filters.levels } } : {}),
    };
  }

  private async statsByLevel(where: Prisma.LogWhereInput): Promise<StatsEntry[]> {
    const grouped = await this.prisma.log.groupBy({ by: ['level'], where, _count: { _all: true } });
    return grouped.map((g) => ({ key: g.level, count: g._count._all }));
  }

  private async statsByService(where: Prisma.LogWhereInput): Promise<StatsEntry[]> {
    const grouped = await this.prisma.log.groupBy({ by: ['serviceId'], where, _count: { _all: true } });
    const services = await this.prisma.service.findMany({
      where: { id: { in: grouped.map((g) => g.serviceId) } },
    });
    const nameById = new Map(services.map((s) => [s.id, s.name]));
    return grouped.map((g) => ({
      key: nameById.get(g.serviceId) ?? String(g.serviceId),
      count: g._count._all,
    }));
  }

  private toResponse(log: Log, serviceName: string): LogResponse {
    return {
      id: log.id.toString(),
      service: serviceName,
      level: log.level,
      message: log.message,
      timestamp: log.timestamp,
      ingestedAt: log.ingestedAt,
      traceId: log.traceId,
      metadata: log.metadata,
    };
  }
}
