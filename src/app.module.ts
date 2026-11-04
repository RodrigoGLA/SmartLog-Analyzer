import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnalysisModule } from './analysis/analysis.module.js';
import { validateEnv } from './config/validate-env.js';
import { DatabaseModule } from './database/database.module.js';
import { LogsModule } from './logs/logs.module.js';
import { QueueModule } from './queue/queue.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    QueueModule,
    LogsModule,
    AnalysisModule,
  ],
})
export class AppModule {}
