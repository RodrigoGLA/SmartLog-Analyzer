import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBoss } from 'pg-boss';
import type { EnvironmentVariables } from '../config/env.schema.js';
import { ANALYSIS_QUEUE } from './queue.constants.js';

@Injectable()
export class PgBossService extends PgBoss implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PgBossService.name);

  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {
    super({ connectionString: config.get('DATABASE_URL', { infer: true }) });
    this.on('error', (error) => this.logger.error('pg-boss error', error));
  }

  async onModuleInit(): Promise<void> {
    await this.start();
    const timeoutMs = this.config.get('LLM_TIMEOUT_MS', { infer: true });
    const maxRetries = this.config.get('LLM_MAX_CORRECTION_RETRIES', { infer: true });
    // pg-boss defaults a 900s. Se calcula en vez de dejarlo fijo porque el worker puede reintentar
    // la llamada al LLM hasta `maxRetries` veces (reintento "con corrección", decisión #28) antes de
    // rendirse — el peor caso es que las `maxRetries + 1` llamadas agoten LLM_TIMEOUT_MS cada una.
    // Un valor fijo no acompañaría ese cálculo: si se sube LLM_TIMEOUT_MS o el tope de reintentos,
    // pg-boss podría considerar "colgado" un job que en realidad sigue reintentando legítimamente, y
    // reintentarlo él mismo en paralelo mientras el handler original todavía está corriendo. El "+30"
    // es margen fijo para el resto del handler (consultas a la base, preprocesado, persistencia).
    const expireInSeconds = Math.ceil((timeoutMs * (maxRetries + 1)) / 1000) + 30;
    await this.createQueue(ANALYSIS_QUEUE, {
      retryLimit: 3,
      retryBackoff: true,
      expireInSeconds,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }
}
