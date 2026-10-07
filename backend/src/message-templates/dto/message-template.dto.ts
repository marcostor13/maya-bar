import {
  IsIn,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { MESSAGE_TEMPLATE_CHANNELS } from '../message-template.schema';

export class CreateMessageTemplateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @IsIn(MESSAGE_TEMPLATE_CHANNELS as readonly string[])
  channel: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body: string;
}

export class UpdateMessageTemplateDto extends PartialType(
  CreateMessageTemplateDto,
) {}

export class PreviewMessageDto {
  @IsString()
  @MaxLength(5000)
  body: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  /** Contacto real con el que previsualizar; si falta se usan datos de ejemplo. */
  @IsOptional()
  @IsMongoId()
  customerId?: string;
}
