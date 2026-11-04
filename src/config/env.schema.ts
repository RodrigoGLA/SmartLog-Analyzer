import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min, IsNotEmpty } from 'class-validator';

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
}
