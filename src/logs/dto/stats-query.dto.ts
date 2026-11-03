import { IsIn, IsISO8601, IsOptional } from 'class-validator';

export const STATS_GROUP_BY_VALUES = ['service', 'level'] as const;
export type StatsGroupBy = (typeof STATS_GROUP_BY_VALUES)[number];

export class StatsQueryDto {
  @IsIn(STATS_GROUP_BY_VALUES)
  groupBy!: StatsGroupBy;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
