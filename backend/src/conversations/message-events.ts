import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { Message } from './message.schema';

export type MessageEventKind = 'created' | 'updated';
export type MessageListener = (
  kind: MessageEventKind,
  tenantId: string,
  msg: Message,
) => void;

/**
 * Avisos internos de mensajes nuevos o cambiados. Los publica el gateway (todo
 * mensaje nuevo o actualizado pasa por él) y los escucha, por ejemplo, el
 * webhook de salida de la API de integraciones (HU15), sin acoplar cada flujo.
 */
@Injectable()
export class MessageEvents {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(20);
  }

  on(listener: MessageListener): void {
    this.emitter.on('message', listener);
  }

  publish(kind: MessageEventKind, tenantId: string, payload: unknown): void {
    if (!isMessage(payload)) return;
    this.emitter.emit('message', kind, tenantId, payload);
  }
}

function isMessage(payload: unknown): payload is Message {
  return (
    !!payload &&
    typeof payload === 'object' &&
    'conversationId' in payload &&
    'direction' in payload
  );
}
