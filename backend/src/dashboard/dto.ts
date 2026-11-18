import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
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

/** Tarifas de la empresa en USD (HU18). `null` las quita. */
export class CostSettingsDto {
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(10)
  smsPerSegment?: number | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(1000)
  emailPer1000?: number | null;
}
