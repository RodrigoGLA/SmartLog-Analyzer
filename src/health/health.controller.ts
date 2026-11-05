import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthCheck, type HealthCheckResult, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { ProblemDetailsDto } from '../common/dto/problem-details.dto.js';
import { PrismaService } from '../database/prisma.service.js';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck({ swaggerDocumentation: false })
  @ApiOperation({ summary: 'Verificar el estado del servicio y su conexión a la base de datos' })
  @ApiResponse({
    status: 200,
    description: 'El servicio y sus dependencias están operativos',
    schema: {
      example: {
        status: 'ok',
        info: { database: { status: 'up' } },
        error: {},
        details: { database: { status: 'up' } },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'Alguna dependencia (ej. la base de datos) no responde',
    type: ProblemDetailsDto,
  })
  check(): Promise<HealthCheckResult> {
    return this.health.check([() => this.db.pingCheck('database', this.prisma)]);
  }
}
