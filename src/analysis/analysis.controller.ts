import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AnalysisService, type AnalysisResponse } from './analysis.service.js';

@ApiTags('analysis')
@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Consultar el estado/resultado de un análisis por id' })
  getById(@Param('id', new ParseUUIDPipe()) id: string): Promise<AnalysisResponse> {
    return this.analysisService.getById(id);
  }
}
