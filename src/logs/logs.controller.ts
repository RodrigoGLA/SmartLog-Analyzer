import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { LogLevel } from '@prisma/client';
import { ProblemDetailsDto } from '../common/dto/problem-details.dto.js';
import { CreateLogDto } from './dto/create-log.dto.js';
import { ListLogsQueryDto } from './dto/list-logs-query.dto.js';
import { STATS_GROUP_BY_VALUES, StatsQueryDto } from './dto/stats-query.dto.js';
import { LogsService, type LogResponse, type PaginatedLogs, type StatsResponse } from './logs.service.js';

@ApiTags('logs')
@Controller('logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Ingestar un log, registrando el servicio si no existe' })
  @ApiResponse({
    status: 201,
    description: 'Log creado',
    schema: {
      example: {
        id: '42',
        service: 'checkout-api',
        level: 'ERROR',
        message: 'Connection to database timed out',
        timestamp: '2026-11-03T18:12:00.000Z',
        ingestedAt: '2026-11-04T10:00:00.000Z',
        traceId: 'req-abc123',
        metadata: { region: 'us-east-1' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Body inválido', type: ProblemDetailsDto })
  create(@Body() dto: CreateLogDto): Promise<LogResponse> {
    return this.logsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar logs paginados, con filtros opcionales' })
  @ApiQuery({ name: 'service', required: false, type: String, description: 'Nombre del servicio (case-insensitive)' })
  @ApiQuery({ name: 'level', required: false, enum: LogLevel })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'ISO 8601' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'ISO 8601' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Substring en message (case-insensitive)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Default: 1' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Default: 20, máx. 100' })
  @ApiResponse({
    status: 200,
    description: 'Página de logs que matchean los filtros',
    schema: {
      example: {
        data: [
          {
            id: '42',
            service: 'checkout-api',
            level: 'ERROR',
            message: 'Connection to database timed out',
            timestamp: '2026-11-03T18:12:00.000Z',
            ingestedAt: '2026-11-04T10:00:00.000Z',
            traceId: 'req-abc123',
            metadata: { region: 'us-east-1' },
          },
        ],
        meta: { page: 1, limit: 20, total: 137 },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Query inválida, o `from` posterior a `to`',
    type: ProblemDetailsDto,
  })
  findAll(@Query() query: ListLogsQueryDto): Promise<PaginatedLogs> {
    return this.logsService.findAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Agregar logs por servicio o por nivel, con rango de fechas opcional' })
  @ApiQuery({ name: 'groupBy', required: true, enum: STATS_GROUP_BY_VALUES })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'ISO 8601' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'ISO 8601' })
  @ApiResponse({
    status: 200,
    description: 'Conteo agregado por `groupBy`, ordenado de mayor a menor',
    schema: {
      example: {
        groupBy: 'service',
        from: '2026-10-28T00:00:00.000Z',
        to: '2026-11-02T00:00:00.000Z',
        data: [
          { key: 'aws-ecs-payments-api', count: 58 },
          { key: 'checkout-api', count: 23 },
        ],
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Query inválida, o `from` posterior a `to`',
    type: ProblemDetailsDto,
  })
  getStats(@Query() query: StatsQueryDto): Promise<StatsResponse> {
    return this.logsService.getStats(query);
  }
}
