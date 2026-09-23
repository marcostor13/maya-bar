import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { RANGES } from './analytics.helpers';
import { CHANNEL_FILTERS } from './dashboard-analytics.service';

export class AnalyticsQueryDto {
  @IsOptional()
  @IsIn(RANGES)
  range?: string;

  @IsOptional()
  @IsIn(CHANNEL_FILTERS)
  channel?: string;

  /** Zona horaria IANA del navegador, para agrupar por día local. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tz?: string;
}
