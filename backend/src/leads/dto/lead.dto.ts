import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import {
  ACTIVITY_TYPES,
  LEAD_PRIORITIES,
  LEAD_STAGE_KEYS,
} from '../lead-stages.catalog';

export class CreateLeadDto {
  /** Contacto existente. Si no viene, hay que mandar los datos en `customer`. */
  @IsOptional()
  @IsString()
  customerId?: string;

  /** Alta rápida: crea (o reutiliza) el contacto junto con la oportunidad. */
  @IsOptional()
  customer?: { name: string; email?: string; phone?: string };

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(LEAD_STAGE_KEYS)
  stage?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsIn(LEAD_PRIORITIES)
  priority?: string;

  @IsOptional()
  @IsString()
  ownerId?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;
}

export class UpdateLeadDto extends PartialType(CreateLeadDto) {
  @IsOptional()
  @IsString()
  lostReason?: string;
}

export class MoveLeadDto {
  @IsIn(LEAD_STAGE_KEYS)
  stage: string;

  /** Posición destino dentro de la columna (0 = arriba del todo). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  position?: number;

  @IsOptional()
  @IsString()
  lostReason?: string;
}

export class CreateActivityDto {
  @IsIn(ACTIVITY_TYPES)
  type: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsDateString()
  at?: string;

  /** Convierte la actividad en tarea: es el vencimiento del próximo paso. */
  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class UpdateActivityDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}
