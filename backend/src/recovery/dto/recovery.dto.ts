import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateRecoveryPlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsInt()
  @IsIn([7, 15, 30, 60, 90])
  lookbackDays: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  context?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  timezone?: string;
}

export class SegmentEditDto {
  @IsString()
  @Matches(/^[a-z0-9_]{1,40}$/)
  key: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @IsString()
  @MaxLength(1024)
  message: string;

  @IsBoolean()
  enabled: boolean;

  /** Conversaciones del segmento, en orden. */
  @IsArray()
  @IsString({ each: true })
  recipients: string[];
}

export class UpdateRecoveryPlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SegmentEditDto)
  segments?: SegmentEditDto[];
}

export class RewriteMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  instruction?: string;
}

export class SegmentScheduleDto {
  @IsString()
  key: string;

  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsDateString()
  sendAt?: string;

  @IsInt()
  @Min(1)
  @Max(200)
  firstBatchSize: number;

  @IsInt()
  @Min(1)
  @Max(240)
  firstPauseMinutes: number;

  @IsInt()
  @Min(1)
  @Max(200)
  batchSize: number;

  @IsInt()
  @Min(1)
  @Max(240)
  batchIntervalMinutes: number;
}

export class ScheduleRecoveryDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SegmentScheduleDto)
  segments: SegmentScheduleDto[];
}
