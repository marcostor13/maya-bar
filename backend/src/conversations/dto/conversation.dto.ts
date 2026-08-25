import { MessageType } from '../message.schema';

export class SendMessageDto {
  /** Texto del mensaje o caption del adjunto. */
  text?: string;

  /** Por defecto `text`, o `document` si solo llega mediaUrl. */
  type?: MessageType;

  /** URL ya subida a S3 vía POST /upload. */
  mediaUrl?: string;
  mediaKey?: string;
  mimeType?: string;
  filename?: string;
  size?: number;
  durationSeconds?: number;

  /** Por defecto true: escribir manualmente pausa al agente IA. */
  pauseAgent?: boolean;
}

export class AutoReplyDto {
  enabled: boolean;
}

export class StatusDto {
  status: 'open' | 'closed';
}
