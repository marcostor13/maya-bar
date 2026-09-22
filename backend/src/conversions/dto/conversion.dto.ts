import {
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CONVERSION_EVENTS } from '../conversion-event.schema';
import type { ConversionEventType } from '../conversion-event.schema';

/** Conversión reportada a mano desde la plataforma (cobros fuera del CRM). */
export class ReportConversionDto {
  @IsIn(CONVERSION_EVENTS)
  event: ConversionEventType;

  /** Contacto del CRM; si no se manda, se busca por teléfono. */
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
