import {
  IsEmail,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

/** Un email con imágenes en línea pesa; más que esto ya es un error. */
const MAX_HTML = 400_000;

export class CreateEmailTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  preheader?: string;

  @IsIn(['blocks', 'html'])
  mode: 'blocks' | 'html';

  @IsOptional()
  @IsObject()
  design?: Record<string, unknown>;

  @IsString()
  @MaxLength(MAX_HTML)
  html: string;
}

export class UpdateEmailTemplateDto extends PartialType(
  CreateEmailTemplateDto,
) {}

export class GenerateEmailTemplateDto {
  /** Qué se quiere comunicar. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(1500)
  brief: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  tone?: string;

  /** Qué debe hacer quien lo lee (comprar, agendar, responder…). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  goal?: string;

  /** Destino del botón principal. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  ctaUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  brandColor?: string;
}

export class TestEmailTemplateDto {
  @IsEmail()
  to: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_HTML)
  html: string;

  /** Buzón conectado por el que sale; sin él se usa el predeterminado. */
  @IsOptional()
  @IsMongoId()
  accountId?: string;
}
