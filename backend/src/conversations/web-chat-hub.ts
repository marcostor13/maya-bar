import { Injectable } from '@nestjs/common';

/** Lo que recibe el widget de cada mensaje (HU69). */
export interface WebChatEvent {
  id: string;
  direction: string;
  author: string;
  type: string;
  text: string;
  mediaUrl?: string;
  filename?: string;
  at: string;
}

type Listener = (e: WebChatEvent) => void;

/**
 * Reparte en memoria los mensajes del equipo o del agente a los visitantes del
 * chat web conectados por SSE. Si el visitante no está conectado, el widget
 * recupera lo perdido con el historial al reconectar.
 */
@Injectable()
export class WebChatHub {
  private readonly rooms = new Map<string, Set<Listener>>();

  private room(widgetId: string, visitorId: string) {
    return `${widgetId}:${visitorId}`;
  }

  subscribe(widgetId: string, visitorId: string, fn: Listener): () => void {
    const key = this.room(widgetId, visitorId);
    const set = this.rooms.get(key) ?? new Set<Listener>();
    set.add(fn);
    this.rooms.set(key, set);
    return () => {
      set.delete(fn);
      if (!set.size) this.rooms.delete(key);
    };
  }

  publish(widgetId: string, visitorId: string, e: WebChatEvent) {
    for (const fn of this.rooms.get(this.room(widgetId, visitorId)) ?? []) {
      try {
        fn(e);
      } catch {
        /* un visitante desconectado no frena a los demás */
      }
    }
  }

  listeners(widgetId: string, visitorId: string): number {
    return this.rooms.get(this.room(widgetId, visitorId))?.size ?? 0;
  }
}
