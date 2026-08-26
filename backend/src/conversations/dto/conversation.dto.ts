import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
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
