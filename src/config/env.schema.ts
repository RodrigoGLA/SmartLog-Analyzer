import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';

export const LLM_PROVIDER_VALUES = ['mock', 'gemini'] as const;
export type LlmProviderName = (typeof LLM_PROVIDER_VALUES)[number];

export class EnvironmentVariables {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  LLM_TIMEOUT_MS: number = 20000;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ANALYSIS_MAX_PATTERNS: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ANALYSIS_MAX_RANGE_HOURS: number = 168;

  @IsOptional()
  @IsIn(LLM_PROVIDER_VALUES)
  LLM_PROVIDER: LlmProviderName = 'mock';

  @ValidateIf((env: EnvironmentVariables) => env.LLM_PROVIDER === 'gemini')
  @IsString()
  @IsNotEmpty()
  LLM_API_KEY?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  LLM_MODEL: string = 'gemini-3.5-flash-lite';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2)
  LLM_MAX_CORRECTION_RETRIES: number = 1;
}
