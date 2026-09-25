import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsHexColor,
  IsIn,
  IsInt,
  IsMongoId,
  MaxLength,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { ACTIVITY_TYPES, LEAD_PRIORITIES } from '../lead-stages.catalog';

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

  /** Clave de una etapa del tenant; se valida en el servicio. */
  @IsOptional()
  @IsString()
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

  /** Responsable. Vacío (`''`) la deja en la bolsa sin asignar. */
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
  @IsString()
  @IsNotEmpty()
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

  /** Además del push, avisar por WhatsApp al responsable cuando venza. */
  @IsOptional()
  @IsBoolean()
  remindByWhatsApp?: boolean;
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

  /** Además del push, avisar por WhatsApp al responsable cuando venza. */
  @IsOptional()
  @IsBoolean()
  remindByWhatsApp?: boolean;
}

export class ReleaseLeadDto {
  /** Por qué la suelta; queda en el historial. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class TransferLeadDto {
  @IsMongoId()
  toUserId: string;

  /** Contexto para quien la recibe; llega en el aviso y queda en el historial. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** Etapa nueva del embudo. Siempre es abierta: ganada y perdida ya existen. */
export class CreateLeadStageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  label: string;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number;
}

/** Renombrar, recolorear o cambiar la probabilidad. La clave no cambia nunca. */
export class UpdateLeadStageDto extends PartialType(CreateLeadStageDto) {}

export class ReorderLeadStagesDto {
  /** Todas las claves del embudo, en el orden nuevo. */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  keys: string[];
}
