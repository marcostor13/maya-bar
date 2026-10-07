import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PartialType, OmitType } from '@nestjs/mapped-types';

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsIn(['email', 'whatsapp', 'sms'])
  type: 'email' | 'whatsapp' | 'sms';

  @IsOptional()
  @IsIn(['waha', 'cloudapi'])
  waProvider?: 'waha' | 'cloudapi';

  @IsOptional()
  @IsString()
  subject?: string;

  /** Texto del mensaje. Un email con plantilla HTML puede no llevarlo. */
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  body?: string;

  @IsOptional()
  @IsIn(['all', 'tags', 'lists', 'contacts'])
  targeting?: 'all' | 'tags' | 'lists' | 'contacts';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recipientTags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  listIds?: string[];

  /** Destinatarios elegidos a mano (`targeting: 'contacts'`). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20000)
  @IsMongoId({ each: true })
  customerIds?: string[];

  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @IsOptional()
  @IsIn(['image', 'video', 'audio', 'document'])
  mediaType?: 'image' | 'video' | 'audio' | 'document';

  @IsOptional()
  @IsString()
  templateName?: string;

  @IsOptional()
  @IsString()
  templateLanguage?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  templateVars?: string[];

  // Cadena vacía = quitar el valor (el formulario siempre manda el campo).

  /** Plantilla HTML de email. */
  @IsOptional()
  @IsString()
  emailTemplateId?: string;

  /** Buzón de la empresa desde el que se envía; vacío = el de la plataforma. */
  @IsOptional()
  @IsString()
  senderAccountId?: string;

  /** Destino de `{link}`: cada destinatario recibe su link corto personal. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  linkUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(253)
  linkDomain?: string;

  /** Fecha ISO para programar el envío; vacío = enviar al pulsar. */
  @IsOptional()
  @IsString()
  scheduledAt?: string;
}

/** El canal no se cambia después de crear la campaña. */
export class UpdateCampaignDto extends PartialType(
  OmitType(CreateCampaignDto, ['type'] as const),
) {}

export class AudiencePreviewDto {
  @IsIn(['email', 'whatsapp', 'sms'])
  type: 'email' | 'whatsapp' | 'sms';

  @IsIn(['all', 'tags', 'lists', 'contacts'])
  targeting: 'all' | 'tags' | 'lists' | 'contacts';

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recipientTags?: string[];

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  listIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20000)
  @IsMongoId({ each: true })
  customerIds?: string[];
}
