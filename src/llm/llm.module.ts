import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvironmentVariables } from '../config/env.schema.js';
import { GeminiLlmProvider } from './gemini-llm-provider.js';
import { LLM_PROVIDER } from './llm.constants.js';
import { LogPreprocessor } from './log-preprocessor.js';
import { MockLlmProvider } from './mock-llm-provider.js';

@Module({
  providers: [
    LogPreprocessor,
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvironmentVariables, true>) => {
        if (config.get('LLM_PROVIDER', { infer: true }) === 'gemini') {
          return new GeminiLlmProvider(
            config.get('LLM_API_KEY', { infer: true }) ?? '',
            config.get('LLM_MODEL', { infer: true }),
            config.get('LLM_TIMEOUT_MS', { infer: true }),
          );
        }
        return new MockLlmProvider();
      },
    },
  ],
  exports: [LogPreprocessor, LLM_PROVIDER],
})
export class LlmModule {}
