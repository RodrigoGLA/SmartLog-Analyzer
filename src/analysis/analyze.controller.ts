import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AnalysisService, type CreatedAnalysis } from './analysis.service.js';
import { AnalyzeLogsDto } from './dto/analyze-logs.dto.js';

@ApiTags('logs')
@Controller('logs')
export class AnalyzeController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post('analyze')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Encolar un análisis asíncrono de logs en un rango de fechas' })
  analyze(@Body() dto: AnalyzeLogsDto): Promise<CreatedAnalysis> {
    return this.analysisService.createAnalysis(dto);
  }
}
