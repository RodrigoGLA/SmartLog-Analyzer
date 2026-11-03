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
}
