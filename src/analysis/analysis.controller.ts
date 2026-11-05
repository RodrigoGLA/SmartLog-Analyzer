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
  @ApiResponse({
    status: 200,
    description:
      'Estado del análisis. Si está `pending`/`processing` solo trae `id` y `status`; ' +
      '`completed` suma `summary`/`suggestions`/`findings`; `failed` suma `error`. ' +
      'El ejemplo muestra el caso `completed`.',
    schema: {
      example: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'completed',
        summary: 'Resumen generado por el LLM a partir de los logs del rango analizado.',
        suggestions: ['Sugerencia concreta 1', 'Sugerencia concreta 2'],
        findings: [
          {
            serviceId: 3,
            category: 'database',
            severity: 'CRITICAL',
            description: 'Descripción puntual del problema detectado.',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 400, description: 'El id no es un UUID válido', type: ProblemDetailsDto })
  @ApiResponse({ status: 404, description: 'No existe un análisis con ese id', type: ProblemDetailsDto })
  getById(@Param('id', new ParseUUIDPipe()) id: string): Promise<AnalysisResponse> {
    return this.analysisService.getById(id);
  }
}
