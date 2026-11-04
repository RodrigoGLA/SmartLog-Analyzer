import { Module } from '@nestjs/common';
import { LLM_PROVIDER } from './llm.constants.js';
import { LogPreprocessor } from './log-preprocessor.js';
import { MockLlmProvider } from './mock-llm-provider.js';

@Module({
  providers: [LogPreprocessor, { provide: LLM_PROVIDER, useClass: MockLlmProvider }],
  exports: [LogPreprocessor, LLM_PROVIDER],
})
export class LlmModule {}
