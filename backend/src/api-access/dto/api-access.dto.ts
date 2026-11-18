import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { API_CHANNELS, type ApiChannel } from '../api-access.schema';

export class CreateApiAccessDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @IsIn(API_CHANNELS)
  channel: ApiChannel;

  @IsMongoId()
  accountId: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  allowedDomains: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  allowedIps?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  perMinuteLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  perDayLimit?: number;
}

export class UpdateApiAccessDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  allowedDomains?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  allowedIps?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  perMinuteLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  perDayLimit?: number;
}

export const API_MEDIA_TYPES = ['image', 'video', 'audio', 'document'] as const;
export type ApiMediaType = (typeof API_MEDIA_TYPES)[number];

export class ApiTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(15)
  language?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(1024, { each: true })
  variables?: string[];

  /** Valor del {{1}} de una cabecera de texto con variable. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  headerText?: string;

  /** URL https de la imagen/vídeo/documento de la cabecera. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  headerMediaUrl?: string;
}

/** Cuerpo de `POST /public/v1/messages`. */
export class SendApiMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  to: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  mediaUrl?: string;

  @IsOptional()
  @IsIn(API_MEDIA_TYPES)
  mediaType?: ApiMediaType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  filename?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ApiTemplateDto)
  template?: ApiTemplateDto;
}

/** URL de aviso del acceso (HU15). */
export class SetWebhookDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  url: string;
}
