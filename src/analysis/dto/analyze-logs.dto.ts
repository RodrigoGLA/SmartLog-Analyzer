import { LogLevel } from '@prisma/client';
import { IsArray, IsEnum, IsISO8601, IsInt, IsOptional } from 'class-validator';

export class AnalyzeLogsDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  services?: number[];

  @IsOptional()
  @IsArray()
  @IsEnum(LogLevel, { each: true })
  levels?: LogLevel[];
}
