import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { CreateLogDto } from './dto/create-log.dto.js';
import { ListLogsQueryDto } from './dto/list-logs-query.dto.js';
import { LogsService, type LogResponse, type PaginatedLogs } from './logs.service.js';

@Controller('logs')
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateLogDto): Promise<LogResponse> {
    return this.logsService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListLogsQueryDto): Promise<PaginatedLogs> {
    return this.logsService.findAll(query);
  }
}
