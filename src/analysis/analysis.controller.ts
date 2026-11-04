import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ProblemDetailsDto } from '../common/dto/problem-details.dto.js';
import { AnalysisService, type AnalysisResponse } from './analysis.service.js';

@ApiTags('analysis')
@Controller('analysis')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Consultar el estado/resultado de un análisis por id' })
  @ApiResponse({ status: 400, description: 'El id no es un UUID válido', type: ProblemDetailsDto })
  @ApiResponse({ status: 404, description: 'No existe un análisis con ese id', type: ProblemDetailsDto })
  getById(@Param('id', new ParseUUIDPipe()) id: string): Promise<AnalysisResponse> {
    return this.analysisService.getById(id);
  }
}
