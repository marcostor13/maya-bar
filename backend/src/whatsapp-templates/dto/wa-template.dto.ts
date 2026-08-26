import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { TemplateCategory } from '../wa-template.schema';
import { TEMPLATE_CATEGORIES } from '../wa-template.schema';

export const HEADER_FORMATS = [
  'TEXT',
  'IMAGE',
  'VIDEO',
  'DOCUMENT',
  'LOCATION',
] as const;
export type HeaderFormat = (typeof HEADER_FORMATS)[number];

export const BUTTON_TYPES = [
  'QUICK_REPLY',
  'URL',
  'PHONE_NUMBER',
  'COPY_CODE',
] as const;
export type ButtonType = (typeof BUTTON_TYPES)[number];

/** Cabecera. TEXT admite una variable; IMAGE/VIDEO/DOCUMENT necesitan un handle de Meta. */
export class TemplateHeaderDto {
  @IsIn(HEADER_FORMATS)
  format: HeaderFormat;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  text?: string;

  /**
   * Handle devuelto por la Resumable Upload API de Meta. Si no llega y sí llega
   * `mediaUrl`, el backend sube el archivo y resuelve el handle solo.
   */
  @IsOptional()
  @IsString()
  handle?: string;

  /** URL pública (S3) del archivo de ejemplo para la cabecera multimedia. */
  @IsOptional()
  @IsString()
  mediaUrl?: string;

  /** Ejemplo del valor de la variable de la cabecera TEXT. */
  @IsOptional()
  @IsString()
  example?: string;
}

export class TemplateButtonDto {
  @IsIn(BUTTON_TYPES)
  type: ButtonType;

  /** Texto visible del botón (no aplica a COPY_CODE). */
  @IsOptional()
  @IsString()
  @MaxLength(25)
  text?: string;

  /** URL del botón tipo URL; admite {{1}} al final. */
  @IsOptional()
  @IsString()
  url?: string;

  /** Ejemplo del valor de la variable de la URL. */
  @IsOptional()
  @IsString()
  urlExample?: string;

  /** Teléfono en formato internacional para el botón PHONE_NUMBER. */
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  /** Código de ejemplo para el botón COPY_CODE. */
  @IsOptional()
  @IsString()
  example?: string;
}

export class CreateWaTemplateDto {
  /** Cuenta de WhatsApp (Cloud API) en cuyo WABA se crea la plantilla. */
  @IsMongoId()
  accountId: string;

  /** Meta solo admite minúsculas, números y guiones bajos. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'El nombre solo admite minúsculas, números y guiones bajos',
  })
  name: string;

  @IsIn(TEMPLATE_CATEGORIES)
  category: TemplateCategory;

  @IsString()
  @IsNotEmpty()
  language: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  body: string;

  /** Ejemplos de las variables {{1}}, {{2}}… del cuerpo, en orden. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  bodyExamples?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => TemplateHeaderDto)
  header?: TemplateHeaderDto;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  footer?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => TemplateButtonDto)
  buttons?: TemplateButtonDto[];

  /** Deja que Meta reclasifique la categoría en vez de rechazar la plantilla. */
  @IsOptional()
  @IsBoolean()
  allowCategoryChange?: boolean;
}

/**
 * Meta no permite cambiar nombre ni idioma de una plantilla existente: solo sus
 * componentes y, mientras no esté aprobada, la categoría.
 */
export class UpdateWaTemplateDto {
  @IsOptional()
  @IsIn(TEMPLATE_CATEGORIES)
  category?: TemplateCategory;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  body: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  bodyExamples?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => TemplateHeaderDto)
  header?: TemplateHeaderDto;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  footer?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => TemplateButtonDto)
  buttons?: TemplateButtonDto[];
}
