import { Injectable } from '@nestjs/common';
import type { Log, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service.js';
import type { CreateLogDto } from './dto/create-log.dto.js';
import type { ListLogsQueryDto } from './dto/list-logs-query.dto.js';

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
    const { page, limit } = query;
    const skip = (page - 1) * limit;

    const [logs, total] = await this.prisma.$transaction([
      this.prisma.log.findMany({
        skip,
        take: limit,
        orderBy: { timestamp: 'desc' },
        include: { service: true },
      }),
      this.prisma.log.count(),
    ]);

    return {
      data: logs.map((log) => this.toResponse(log, log.service.name)),
      meta: { page, limit, total },
    };
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
