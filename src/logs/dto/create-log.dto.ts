import { LogLevel } from '@prisma/client';
import { IsDateString, IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateLogDto {
  @IsString()
  @IsNotEmpty()
  service!: string;

  @IsEnum(LogLevel)
  level!: LogLevel;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsOptional()
  @IsDateString()
  timestamp?: string;

  @IsOptional()
  @IsString()
  traceId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
