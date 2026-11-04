import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBoss } from 'pg-boss';
import type { EnvironmentVariables } from '../config/env.schema.js';
import { ANALYSIS_QUEUE } from './queue.constants.js';

@Injectable()
export class PgBossService extends PgBoss implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PgBossService.name);

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    super({ connectionString: config.get('DATABASE_URL', { infer: true }) });
    this.on('error', (error) => this.logger.error('pg-boss error', error));
  }

  async onModuleInit(): Promise<void> {
    await this.start();
    await this.createQueue(ANALYSIS_QUEUE, {
      retryLimit: 3,
      retryBackoff: true,
      // pg-boss defaults to 900s; the worker's own LLM_TIMEOUT_MS bounds the handler well
      // below this, so a job stuck this long only happens if the handler itself hangs.
      expireInSeconds: 60,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }
}
