import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CALL_STATUSES } from '../call.schema';

/** Teléfono en dígitos con prefijo de país, o BSUID (`PE.1502…`). */
const CONTACT = /^(\d{6,15}|[A-Z]{2}\.[A-Za-z0-9]{6,64})$/;

export class ListCallsQuery {
  @IsOptional() @IsIn(CALL_STATUSES) status?: (typeof CALL_STATUSES)[number];
  @IsOptional() @IsIn(['inbound', 'outbound']) direction?:
    | 'inbound'
    | 'outbound';
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @IsMongoId() userId?: string;
  @IsOptional() @IsMongoId() accountId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
}

export class SdpDto {
  /** SDP completo (con candidatos ICE). Unos pocos KB. */
  @IsString() @IsNotEmpty() @MaxLength(20_000) sdp: string;
}

export class ContactRefDto {
  @IsMongoId() accountId: string;
  @Matches(CONTACT, { message: 'Contacto de WhatsApp no válido' })
  contact: string;
}

export class OutboundCallDto extends ContactRefDto {
  @IsString() @IsNotEmpty() @MaxLength(20_000) sdp: string;
}

export class StatsQuery {
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
}

class WeeklyHoursDto {
  @IsIn([
    'MONDAY',
    'TUESDAY',
    'WEDNESDAY',
    'THURSDAY',
    'FRIDAY',
    'SATURDAY',
    'SUNDAY',
  ])
  day_of_week: string;
  @Matches(/^([01]\d|2[0-3])[0-5]\d$/) open_time: string;
  @Matches(/^([01]\d|2[0-3])[0-5]\d$/) close_time: string;
}

class CallHoursDto {
  @IsIn(['ENABLED', 'DISABLED']) status: 'ENABLED' | 'DISABLED';
  @IsOptional() @IsString() @MaxLength(64) timezone_id?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WeeklyHoursDto)
  weekly_operating_hours?: WeeklyHoursDto[];
}

export class MetaCallingDto {
  @IsOptional() @IsIn(['ENABLED', 'DISABLED']) status?: 'ENABLED' | 'DISABLED';
  @IsOptional()
  @IsIn(['DEFAULT', 'DISABLE_ALL'])
  call_icon_visibility?: 'DEFAULT' | 'DISABLE_ALL';
  @IsOptional()
  @IsIn(['ENABLED', 'DISABLED'])
  callback_permission_status?: 'ENABLED' | 'DISABLED';
  @IsOptional()
  @ValidateNested()
  @Type(() => CallHoursDto)
  call_hours?: CallHoursDto;
}

export class LocalCallingDto {
  @IsOptional() @IsInt() @Min(15) @Max(60) ringTimeoutSec?: number;
  @IsOptional() @IsBoolean() missedReplyEnabled?: boolean;
  @IsOptional() @IsString() @MaxLength(1000) missedReplyText?: string;
}

export class UpdateCallSettingsDto {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => MetaCallingDto)
  meta?: MetaCallingDto;
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LocalCallingDto)
  local?: LocalCallingDto;
}
