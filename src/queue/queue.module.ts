import { Global, Module } from '@nestjs/common';
import { PgBossService } from './pg-boss.service.js';

@Global()
@Module({
  providers: [PgBossService],
  exports: [PgBossService],
})
export class QueueModule {}
