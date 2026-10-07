import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LINK_CHANNELS } from '../link.schemas';

const ALIAS_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,39}$/;
const DOMAIN_RE =
  /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/i;

export class UtmDto {
  @IsOptional() @IsString() @MaxLength(100) source?: string;
  @IsOptional() @IsString() @MaxLength(100) medium?: string;
  @IsOptional() @IsString() @MaxLength(100) campaign?: string;
  @IsOptional() @IsString() @MaxLength(100) term?: string;
  @IsOptional() @IsString() @MaxLength(100) content?: string;
}

export class CreateLinkDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  destination: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  /** Código elegido a mano; si falta se genera uno aleatorio. */
  @IsOptional()
  @IsString()
  @Matches(ALIAS_RE, {
    message:
      'El alias debe tener entre 3 y 40 caracteres: letras, números, guion o guion bajo',
  })
  alias?: string;

  /** Dominio corto registrado; vacío = el de la plataforma. */
  @IsOptional()
  @IsString()
  @MaxLength(253)
  domain?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UtmDto)
  utm?: UtmDto;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateLinkDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  destination?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsIn(['active', 'paused'])
  status?: 'active' | 'paused';

  @IsOptional()
  @ValidateNested()
  @Type(() => UtmDto)
  utm?: UtmDto;

  /** Cadena vacía = quitar la caducidad. */
  @IsOptional()
  @IsString()
  expiresAt?: string;
}

export class CreateDomainDto {
  @IsString()
  @Matches(DOMAIN_RE, { message: 'Escribe un dominio válido, sin https://' })
  domain: string;
}

export class BatchRowDto {
  @IsOptional() @IsString() @MaxLength(160) name?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  /** Resto de columnas del archivo, usables como `{campo:Columna}`. */
  @IsOptional() @IsObject() fields?: Record<string, string>;
}

export class CreateBatchDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  destination: string;

  @IsOptional()
  @IsString()
  @MaxLength(253)
  domain?: string;

  @IsIn(LINK_CHANNELS as readonly string[])
  channel: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UtmDto)
  utm?: UtmDto;

  // Una de las tres fuentes:
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsMongoId({ each: true })
  listIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10000)
  @IsMongoId({ each: true })
  customerIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10000)
  @ValidateNested({ each: true })
  @Type(() => BatchRowDto)
  rows?: BatchRowDto[];
}
