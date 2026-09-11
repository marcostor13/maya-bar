import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  LEAD_PRIORITIES,
  LEAD_STAGE_KEYS,
} from '../../leads/lead-stages.catalog';
// `import type`: MessageType se usa en una firma decorada y el build corre con
// isolatedModules + emitDecoratorMetadata (TS1272).
import type { MessageType } from '../message.schema';

/** Tipos que el frontend puede enviar (los entrantes como `contact` o `unsupported` no aplican). */
const OUTBOUND_TYPES: MessageType[] = [
  'text',
  'image',
  'video',
  'audio',
  'voice',
  'document',
  'sticker',
];

// OJO: el ValidationPipe global usa `whitelist: true` — toda propiedad sin
// decorador de class-validator se descarta antes de llegar al controlador.
export class SendMessageDto {
  /** Texto del mensaje o caption del adjunto. */
  @IsOptional()
  @IsString()
  text?: string;

  /** Por defecto `text`, o `document` si solo llega mediaUrl. */
  @IsOptional()
  @IsIn(OUTBOUND_TYPES)
  type?: MessageType;

  /** URL ya subida a S3 vía POST /upload. */
  @IsOptional()
  @IsString()
  mediaUrl?: string;

  @IsOptional()
  @IsString()
  mediaKey?: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsString()
  filename?: string;

  @IsOptional()
  @IsNumber()
  size?: number;

  @IsOptional()
  @IsNumber()
  durationSeconds?: number;

  /** Por defecto true: escribir manualmente pausa al agente IA. */
  @IsOptional()
  @IsBoolean()
  pauseAgent?: boolean;
}

export class AutoReplyDto {
  @IsBoolean()
  enabled: boolean;
}

export class StatusDto {
  @IsIn(['open', 'closed'])
  status: 'open' | 'closed';
}

/** Alta del contacto (y opcionalmente de una oportunidad) desde el chat. */
export class SaveContactDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsString()
  notes?: string;

  /** Crea además una oportunidad de seguimiento apuntando a esta conversación. */
  @IsOptional()
  @IsBoolean()
  createLead?: boolean;

  @IsOptional()
  @IsString()
  leadTitle?: string;

  @IsOptional()
  @IsNumber()
  leadValue?: number;
}

/** Clasificación rápida del chat: las etiquetas de su contacto. */
export class SetTagsDto {
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags: string[];
}

/** Envío de la conversación al embudo de seguimiento. */
export class SendToPipelineDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsIn(LEAD_STAGE_KEYS)
  stage?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;

  @IsOptional()
  @IsIn(LEAD_PRIORITIES)
  priority?: string;
}

/** Alta/baja del contacto del chat en la lista de no contactar. */
export class DoNotContactDto {
  @IsBoolean()
  blocked: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
