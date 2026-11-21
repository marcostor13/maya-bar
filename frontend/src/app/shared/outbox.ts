import { DestroyRef, Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Subject, firstValueFrom, timeout } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ConversationsRealtimeService } from './conversations-realtime';
import { silentRequest } from './loader';
import { environment } from '../../environments/environment';

const API = environment.apiUrl;
const KEY = 'maya.outbox.';
/** Con cobertura débil una petición puede quedarse colgada: se da por sin red. */
export const SEND_TIMEOUT_MS = 30_000;
/** La pasarela respondió pero el backend no (caído o en pleno despliegue). */
const GATEWAY_DOWN = new Set([502, 503, 504]);

/** Lo que se manda a `POST /conversations/:id/messages`, con su `clientId`. */
export interface OutboxBody {
  clientId: string;
  text: string;
  type: string;
  mediaUrl?: string;
  mediaKey?: string;
  mimeType?: string;
  filename?: string;
  size?: number;
  replyToId?: string;
  subject?: string;
}

/**
 * Un mensaje escrito que el servidor todavía no confirmó (HU24).
 * - `queued`: sin red; sale solo al volver la conexión.
 * - `sending`: en camino.
 * - `failed`: el servidor lo rechazó; espera a que el operador lo reintente.
 */
export interface OutboxItem {
  clientId: string;
  conversationId: string;
  body: OutboxBody;
  createdAt: string;
  state: 'queued' | 'sending' | 'failed';
  error?: string;
}

/** Id del mensaje en el dispositivo: el servidor no lo duplica si llega dos veces. */
export function newClientId(): string {
  const rnd = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  return `c${Date.now().toString(36)}${rnd}`;
}

/**
 * El mensaje no llegó al backend: sin red, tiempo agotado o la pasarela sin
 * backend detrás. Se reintenta solo; cualquier otra respuesta es un rechazo.
 */
export function isNetworkError(err: unknown): boolean {
  return err instanceof HttpErrorResponse ? err.status === 0 || GATEWAY_DOWN.has(err.status) : true;
}

/**
 * Cola de mensajes salientes de la bandeja (HU24). Todo envío pasa por aquí y
 * se guarda en el dispositivo hasta que el servidor lo guarda, así que
 * quedarse sin cobertura o cerrar la app no pierde lo escrito. Al volver la
 * red se vacía en orden; el `clientId` hace que un reenvío no duplique.
 */
@Injectable({ providedIn: 'root' })
export class OutboxService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private realtime = inject(ConversationsRealtimeService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** El servidor guardó el mensaje: la burbuja provisional pasa a ser la real. */
  readonly sent$ = new Subject<{ item: OutboxItem; message: { _id: string } & Record<string, unknown> }>();
  /** Cambió el estado de un mensaje de la cola (en cola, enviando, fallido). */
  readonly changed$ = new Subject<OutboxItem>();

  private items: OutboxItem[] = [];
  private loadedFor: string | null = null;
  private flushing = false;

  constructor() {
    if (!this.isBrowser) return;
    const onOnline = () => void this.flush();
    window.addEventListener('online', onOnline);
    // Reconexión del socket o vuelta a la app (HU23): buen momento para vaciar.
    const sub = this.realtime.resync$.subscribe(() => void this.flush());
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', onOnline);
      sub.unsubscribe();
    });
  }

  /** Mensajes de la cola de un chat, en orden. */
  forConversation(conversationId: string): OutboxItem[] {
    return this.list().filter(i => i.conversationId === conversationId);
  }

  /** Guarda el mensaje y lo intenta enviar (detrás de los que ya esperaban). */
  async send(conversationId: string, body: OutboxBody): Promise<void> {
    this.list().push({
      clientId: body.clientId,
      conversationId,
      body,
      createdAt: new Date().toISOString(),
      state: 'queued',
    });
    this.save();
    await this.flush();
  }

  /** Reintento manual de uno que el servidor rechazó. */
  async retry(clientId: string): Promise<void> {
    const item = this.list().find(i => i.clientId === clientId);
    if (!item || item.state === 'sending') return;
    this.update(item, { state: 'queued', error: undefined });
    await this.flush();
  }

  /** Lo quita de la cola (el operador lo descartó). */
  discard(clientId: string): void {
    this.items = this.list().filter(i => i.clientId !== clientId);
    this.save();
  }

  /**
   * Envía en orden lo que está en cola. Un fallo de red detiene la tanda (lo
   * siguiente tampoco saldría y se respeta el orden); un rechazo del servidor
   * deja ese como fallido y sigue con los demás.
   */
  async flush(): Promise<void> {
    if (this.flushing || !this.isBrowser) return;
    this.flushing = true;
    try {
      for (;;) {
        const item = this.list().find(i => i.state === 'queued');
        if (!item) return;
        this.update(item, { state: 'sending' });
        try {
          const message = await firstValueFrom(
            this.http.post<{ _id: string } & Record<string, unknown>>(
              `${API}/conversations/${item.conversationId}/messages`,
              item.body,
              { context: silentRequest() },
            ).pipe(timeout(SEND_TIMEOUT_MS)),
          );
          this.items = this.list().filter(i => i.clientId !== item.clientId);
          this.save();
          this.sent$.next({ item, message });
        } catch (err) {
          if (isNetworkError(err)) {
            this.update(item, { state: 'queued' });
            return;
          }
          const msg = (err as HttpErrorResponse).error?.message;
          this.update(item, {
            state: 'failed',
            error: (Array.isArray(msg) ? msg[0] : msg) || 'No se pudo enviar',
          });
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  private update(item: OutboxItem, patch: Partial<OutboxItem>) {
    Object.assign(item, patch);
    this.save();
    this.changed$.next({ ...item });
  }

  /** La cola del usuario actual (se carga del dispositivo la primera vez). */
  private list(): OutboxItem[] {
    const userId = this.auth.currentUser()?.id ?? '';
    if (this.loadedFor !== userId) {
      this.loadedFor = userId;
      this.items = this.read(userId);
    }
    return this.items;
  }

  private read(userId: string): OutboxItem[] {
    if (!this.isBrowser || !userId) return [];
    try {
      const raw = localStorage.getItem(KEY + userId);
      const items = raw ? (JSON.parse(raw) as OutboxItem[]) : [];
      // Lo que iba "enviando" al cerrar la app vuelve a la cola: el clientId evita duplicarlo.
      return Array.isArray(items)
        ? items.map(i => (i.state === 'sending' ? { ...i, state: 'queued' as const } : i))
        : [];
    } catch {
      return [];
    }
  }

  private save() {
    if (!this.isBrowser || !this.loadedFor) return;
    try {
      if (this.items.length) localStorage.setItem(KEY + this.loadedFor, JSON.stringify(this.items));
      else localStorage.removeItem(KEY + this.loadedFor);
    } catch {
      // Sin almacenamiento (modo privado lleno): la cola sigue en memoria.
    }
  }
}
