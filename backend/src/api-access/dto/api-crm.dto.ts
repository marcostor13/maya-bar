import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiTemplateDto } from './api-access.dto';
import { HOOK_EVENTS, type HookEvent } from '../api-hooks.service';

/** Crear o actualizar un contacto (HU65): se busca por email y luego por teléfono. */
export class UpsertApiContactDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateApiContactDto extends UpsertApiContactDto {}

export class ApiTagsDto {
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  tags: string[];
}

export class CreateApiLeadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  /** Contacto existente; si no viene, se usa `contact` (se crea o reutiliza). */
  @IsOptional()
  @IsMongoId()
  contactId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertApiContactDto)
  contact?: UpsertApiContactDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  stage?: string;

  @IsOptional()
  @IsMongoId()
  ownerId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  tags?: string[];
}

export class ApiListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** Solo lo creado o cambiado después de esta fecha ISO (polling de Make). */
  @IsOptional()
  @IsString()
  since?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;
}

export class SubscribeHookDto {
  @IsIn(HOOK_EVENTS)
  event: HookEvent;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  targetUrl: string;
}

/** Enviar una plantilla de WhatsApp a un contacto o teléfono. */
export class ApiWhatsappTemplateDto {
  @IsOptional()
  @IsMongoId()
  contactId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  to?: string;

  @ValidateNested()
  @Type(() => ApiTemplateDto)
  template: ApiTemplateDto;
}
