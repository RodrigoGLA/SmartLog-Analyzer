import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { LogLevel } from '@prisma/client';
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
  findAll(@Query() query: ListLogsQueryDto): Promise<PaginatedLogs> {
    return this.logsService.findAll(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Agregar logs por servicio o por nivel, con rango de fechas opcional' })
  @ApiQuery({ name: 'groupBy', required: true, enum: STATS_GROUP_BY_VALUES })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'ISO 8601' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'ISO 8601' })
  getStats(@Query() query: StatsQueryDto): Promise<StatsResponse> {
    return this.logsService.getStats(query);
  }
}
