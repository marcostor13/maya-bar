import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

const API = environment.apiUrl;

/** Evento propietario de Chrome para el "añadir a pantalla de inicio". */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Mensajes que el service worker manda a la pestaña. */
interface SwMessage {
  type: 'push' | 'navigate' | 'resubscribe';
  url?: string;
  payload?: { conversationId?: string };
}

export type PushPermission = 'default' | 'granted' | 'denied' | 'unsupported';

/**
 * Notificaciones push nativas y instalación como app.
 *
 * El service worker (`public/sw.js`) es quien recibe el push aunque la app esté
 * cerrada; este servicio se encarga de registrarlo, de negociar el permiso con
 * el navegador y de mantener la suscripción sincronizada con el backend.
 *
 * En iOS el permiso SOLO se puede pedir con la plataforma ya instalada en la
 * pantalla de inicio (Safari lo bloquea en la pestaña normal), de ahí
 * `needsInstall()`.
 */
@Injectable({ providedIn: 'root' })
export class PushService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);

  private readonly isBrowser = isPlatformBrowser(this.platformId);

  /** Estado del permiso del navegador. */
  permission = signal<PushPermission>('unsupported');
  /** Hay una suscripción activa registrada en el backend. */
  subscribed = signal(false);
  /** El backend tiene VAPID configurado. Sin esto no se puede activar nada. */
  serverEnabled = signal(false);
  busy = signal(false);
  /** Chrome guardó el evento de instalación: se puede ofrecer el botón. */
  installPrompt = signal<BeforeInstallPromptEvent | null>(null);
  /** Cambia cuando llega un push, para que la bandeja se refresque. */
  lastPush = signal(0);

  private registration: ServiceWorkerRegistration | null = null;
  private started = false;

  supported = computed(() => this.permission() !== 'unsupported');
  canInstall = computed(() => !!this.installPrompt());

  /** Instalada en la pantalla de inicio (Android o iOS). */
  isStandalone(): boolean {
    if (!this.isBrowser) return false;
    return (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true
    );
  }

  private isIos(): boolean {
    if (!this.isBrowser) return false;
    const ua = navigator.userAgent;
    // iPadOS 13+ se anuncia como Mac: el test del touch lo distingue.
    return (
      /iPad|iPhone|iPod/.test(ua) ||
      (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
    );
  }

  /** En iOS hay que instalar la app antes de poder activar los avisos. */
  needsInstall(): boolean {
    return this.isIos() && !this.isStandalone();
  }

  /**
   * Arranque: registra el service worker, escucha sus mensajes y sincroniza la
   * suscripción existente. Se llama al entrar en el shell —también tras un
   * login— y solo registra el service worker la primera vez.
   */
  async init(): Promise<void> {
    if (!this.isBrowser) return;
    if (this.started) {
      // Sesión nueva en la misma pestaña: el dispositivo se vuelve a dar de
      // alta, ahora a nombre de quien acaba de entrar.
      await this.syncSubscription();
      return;
    }
    this.started = true;

    window.addEventListener('beforeinstallprompt', (event: Event) => {
      // Sin `preventDefault` Chrome muestra su propio mini-infobar y el evento
      // se pierde: guardándolo, el botón "Instalar app" lo dispara cuando toca.
      event.preventDefault();
      this.installPrompt.set(event as BeforeInstallPromptEvent);
    });
    window.addEventListener('appinstalled', () => this.installPrompt.set(null));

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      this.permission.set('unsupported');
      return;
    }
    this.permission.set(Notification.permission as PushPermission);

    try {
      this.registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });
      navigator.serviceWorker.addEventListener('message', (event) =>
        this.onSwMessage(event.data as SwMessage),
      );
    } catch (err) {
      console.error('[push] no se pudo registrar el service worker', err);
      this.permission.set('unsupported');
      return;
    }

    await this.syncSubscription();
  }

  /**
   * Si el permiso ya estaba dado, renueva la suscripción en silencio: así
   * sobrevive a un cambio de claves VAPID, a un borrado de la base o a que
   * entre otra persona en el mismo dispositivo.
   */
  private async syncSubscription(): Promise<void> {
    await this.refreshServerState();
    if (
      this.registration &&
      Notification.permission === 'granted' &&
      this.serverEnabled()
    ) {
      await this.subscribe(false).catch(() => undefined);
    }
  }

  /**
   * Cierre de sesión: da de baja el dispositivo en el backend para que quien
   * sale deje de recibir sus avisos, pero conserva la suscripción del navegador
   * —el permiso ya está concedido— para que la siguiente persona que entre en
   * este mismo teléfono la reaproveche sin volver a pedirlo.
   */
  async detach(): Promise<void> {
    if (!this.registration) return;
    const sub = await this.registration.pushManager.getSubscription();
    if (!sub) return;
    await firstValueFrom(
      this.http.request('delete', `${API}/push/subscribe`, {
        body: { endpoint: sub.endpoint },
      }),
    ).catch(() => undefined);
    this.subscribed.set(false);
  }

  /** Estado del push en el servidor (VAPID configurado y dispositivos dados de alta). */
  private async refreshServerState(): Promise<void> {
    try {
      const status = await firstValueFrom(
        this.http.get<{ enabled: boolean; devices: number }>(
          `${API}/push/status`,
        ),
      );
      this.serverEnabled.set(status.enabled);
    } catch {
      this.serverEnabled.set(false);
    }
  }

  /**
   * Pide el permiso y da de alta el dispositivo. Devuelve `true` si el usuario
   * queda suscrito.
   */
  async enable(): Promise<boolean> {
    if (!this.isBrowser || !this.registration) return false;
    this.busy.set(true);
    try {
      const permission = await Notification.requestPermission();
      this.permission.set(permission as PushPermission);
      if (permission !== 'granted') return false;
      return await this.subscribe(true);
    } finally {
      this.busy.set(false);
    }
  }

  /** Da de baja el dispositivo: deja de recibir avisos en este navegador. */
  async disable(): Promise<void> {
    if (!this.registration) return;
    this.busy.set(true);
    try {
      const sub = await this.registration.pushManager.getSubscription();
      if (sub) {
        await firstValueFrom(
          this.http.request('delete', `${API}/push/subscribe`, {
            body: { endpoint: sub.endpoint },
          }),
        ).catch(() => undefined);
        await sub.unsubscribe();
      }
      this.subscribed.set(false);
    } finally {
      this.busy.set(false);
    }
  }

  /** Notificación de prueba a los dispositivos del propio usuario. */
  async sendTest(): Promise<number> {
    const res = await firstValueFrom(
      this.http.post<{ sent: number }>(`${API}/push/test`, {}),
    );
    return res.sent;
  }

  /**
   * Crea (o reutiliza) la suscripción del navegador y la guarda en el backend.
   * @param force vuelve a suscribir aunque ya exista, para renovar las claves.
   */
  private async subscribe(force: boolean): Promise<boolean> {
    if (!this.registration) return false;
    const { publicKey, enabled } = await firstValueFrom(
      this.http.get<{ publicKey: string; enabled: boolean }>(
        `${API}/push/public-key`,
      ),
    );
    this.serverEnabled.set(enabled);
    if (!enabled || !publicKey) return false;

    let sub = await this.registration.pushManager.getSubscription();
    // Una suscripción creada con otra clave VAPID ya no sirve: hay que tirarla
    // antes de pedir la nueva o `subscribe()` falla con InvalidStateError.
    if (sub && force && !this.matchesKey(sub, publicKey)) {
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub) {
      sub = await this.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(publicKey),
      });
    }

    const json = sub.toJSON() as { keys?: { p256dh?: string; auth?: string } };
    if (!json.keys?.p256dh || !json.keys?.auth) return false;

    await firstValueFrom(
      this.http.post(`${API}/push/subscribe`, {
        endpoint: sub.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent,
      }),
    );
    this.subscribed.set(true);
    return true;
  }

  /** Lanza el diálogo nativo de instalación (Android/Chrome). */
  async promptInstall(): Promise<boolean> {
    const prompt = this.installPrompt();
    if (!prompt) return false;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    this.installPrompt.set(null);
    return outcome === 'accepted';
  }

  /** Reacciona a lo que manda el service worker. */
  private onSwMessage(msg: SwMessage) {
    if (!msg) return;
    if (msg.type === 'navigate' && msg.url) {
      void this.router.navigateByUrl(msg.url);
    } else if (msg.type === 'push') {
      // Marca de tiempo: la bandeja la observa para recargar aunque el
      // websocket estuviera dormido en segundo plano.
      this.lastPush.set(Date.now());
    } else if (msg.type === 'resubscribe') {
      void this.subscribe(true).catch(() => undefined);
    }
  }

  private matchesKey(sub: PushSubscription, publicKey: string): boolean {
    const current = sub.options?.applicationServerKey;
    if (!current) return false;
    const bytes = new Uint8Array(current);
    const expected = this.urlBase64ToUint8Array(publicKey);
    return (
      bytes.length === expected.length &&
      bytes.every((byte, i) => byte === expected[i])
    );
  }

  /** La clave VAPID viaja en base64url y `subscribe()` la exige como bytes. */
  private urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(normalized);
    // Se construye sobre un ArrayBuffer explícito: `applicationServerKey` exige
    // un BufferSource respaldado por ArrayBuffer, no por SharedArrayBuffer.
    const output = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
    return output;
  }
}
