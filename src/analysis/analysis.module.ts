import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module.js';
import { LogsModule } from '../logs/logs.module.js';
import { AnalysisController } from './analysis.controller.js';
import { AnalysisService } from './analysis.service.js';
import { AnalysisWorkerService } from './analysis-worker.service.js';
import { AnalyzeController } from './analyze.controller.js';

@Module({
  imports: [LlmModule, LogsModule],
  controllers: [AnalyzeController, AnalysisController],
  providers: [AnalysisService, AnalysisWorkerService],
})
export class AnalysisModule {}
