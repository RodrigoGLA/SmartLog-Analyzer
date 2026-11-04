import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProblemDetailsDto } from '../common/dto/problem-details.dto.js';
import { AnalysisService, type CreatedAnalysis } from './analysis.service.js';
import { AnalyzeLogsDto } from './dto/analyze-logs.dto.js';

@ApiTags('logs')
@Controller('logs')
export class AnalyzeController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post('analyze')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Encolar un análisis asíncrono de logs en un rango de fechas' })
  @ApiResponse({
    status: 400,
    description: 'Body inválido, o `from` posterior a `to`',
    type: ProblemDetailsDto,
  })
  @ApiResponse({
    status: 422,
    description: 'El rango excede el máximo permitido, o no hay logs para ese rango/filtros',
    type: ProblemDetailsDto,
  })
  analyze(@Body() dto: AnalyzeLogsDto): Promise<CreatedAnalysis> {
    return this.analysisService.createAnalysis(dto);
  }
}
