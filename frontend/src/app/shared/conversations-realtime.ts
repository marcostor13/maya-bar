import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { AuthService } from '../auth/auth.service';
import { silentRequest } from './loader';
import { environment } from '../../environments/environment';

const API = environment.apiUrl;

/** Mensaje tal como lo emite el gateway (`message:new` / `message:updated`). */
export interface RealtimeMessage {
  _id: string;
  conversationId: string;
  direction: 'in' | 'out';
  [key: string]: unknown;
}

/** Conversación tal como la emite el gateway (`conversation:updated`). */
export interface RealtimeConversation {
  _id: string;
  unreadCount: number;
  [key: string]: unknown;
}

/**
 * Un único websocket de conversaciones para toda la aplicación.
 *
 * Antes lo abría la propia bandeja, así que el contador del menú no podía
 * enterarse de nada mientras estabas en otra pantalla. Centralizarlo aquí deja
 * una sola conexión por sesión y permite que la insignia de "Conversaciones"
 * se actualice en tiempo real desde cualquier página.
 */
@Injectable({ providedIn: 'root' })
export class ConversationsRealtimeService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  readonly messageNew$ = new Subject<RealtimeMessage>();
  readonly messageUpdated$ = new Subject<RealtimeMessage>();
  readonly conversationUpdated$ = new Subject<RealtimeConversation>();
  readonly typing$ = new Subject<{ conversationId: string; typing: boolean }>();

  /** Total de mensajes sin leer del tenant, para la insignia del menú. */
  unread = signal(0);
  connected = signal(false);

  private socket: Socket | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  /** Conecta (una sola vez) y arranca el contador. Idempotente. */
  connect(): void {
    if (!this.isBrowser || this.socket) return;
    const tenantId = this.auth.currentUser()?.tenantId;
    if (!tenantId) return;

    this.socket = io(`${API}/conversations`, {
      query: { tenantId },
      transports: ['websocket'],
    });

    this.socket.on('connect', () => this.connected.set(true));
    this.socket.on('disconnect', () => this.connected.set(false));
    this.socket.on('message:new', (msg: RealtimeMessage) =>
      this.messageNew$.next(msg),
    );
    this.socket.on('message:updated', (msg: RealtimeMessage) =>
      this.messageUpdated$.next(msg),
    );
    this.socket.on('conversation:updated', (conv: RealtimeConversation) => {
      this.conversationUpdated$.next(conv);
      this.refreshUnread();
    });
    this.socket.on(
      'conversation:typing',
      (p: { conversationId: string; typing: boolean }) => this.typing$.next(p),
    );

    this.refreshUnread();
    // Red de seguridad si el socket se cae o el móvil suspende la pestaña.
    this.refreshTimer = setInterval(() => this.refreshUnread(), 60_000);
  }

  /** Cierra la conexión al cerrar sesión: el siguiente usuario abre la suya. */
  disconnect(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.connected.set(false);
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    this.unread.set(0);
  }

  /** Relee el total sin leer. Silencioso: un 403 solo significa "sin módulo". */
  refreshUnread(): void {
    if (!this.isBrowser || !this.auth.currentUser()?.tenantId) return;
    this.http
      .get<{ total: number }>(`${API}/conversations/unread-count`, {
        context: silentRequest(),
      })
      .subscribe({
        next: (res) => this.unread.set(res.total ?? 0),
        error: () => undefined,
      });
  }
}
