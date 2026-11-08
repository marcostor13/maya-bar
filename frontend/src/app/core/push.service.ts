import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PushNotifications } from '@capacitor/push-notifications';
import { App } from '@capacitor/app';
import { PlatformService } from './platform.service';
import { ToastService } from '../shared/toast';
import { environment } from '../../environments/environment';

export type NativePushPermission = 'unsupported' | 'prompt' | 'granted' | 'denied';

/** El usuario apagó los avisos en este móvil: no se reactivan solos. */
export const NATIVE_OPT_OUT_KEY = 'maya.push.native.optout';
/** Id del dispositivo actual en el backend, para marcarlo en la lista. */
export const NATIVE_DEVICE_KEY = 'maya.push.native.deviceId';

/**
 * Notificaciones push nativas (FCM).
 *
 * El ciclo es: permiso → `register()` → el sistema devuelve un token → el
 * token se guarda en el backend asociado al usuario. Al cerrar sesión hay que
 * darlo de baja o el siguiente dueño del móvil recibiría avisos ajenos.
 */
@Injectable({ providedIn: 'root' })
export class NativePushService {
  private platform = inject(PlatformService);
  private http = inject(HttpClient);
  private router = inject(Router);
  private toast = inject(ToastService);

  private apiUrl = environment.apiUrl;

  /** Token FCM actual, necesario para la baja. */
  private token = signal<string | null>(null);

  permission = signal<NativePushPermission>(this.platform.isNative ? 'prompt' : 'unsupported');
  readonly registered = signal(false);
  /** El backend tiene Firebase configurado. */
  readonly serverEnabled = signal(true);

  private listenersReady = false;

  /**
   * Arranque tras el login. Si el permiso ya está concedido registra en
   * silencio; si no, NO lo pide: en Android 13+ solo hay una oportunidad, y
   * gastarla nada más entrar es la forma segura de que digan que no.
   */
  async init(): Promise<void> {
    if (!this.platform.isNative) return;

    await this.attachListeners();
    void this.refreshServerState();

    const status = await PushNotifications.checkPermissions();
    this.permission.set(this.mapPermission(status.receive));
    if (status.receive === 'granted' && !this.optedOut()) await this.register();
  }

  /** ¿El backend puede enviar a la app? (Firebase configurado). */
  async refreshServerState(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ enabled: boolean }>(`${this.apiUrl}/devices/status`),
      );
      this.serverEnabled.set(res.enabled);
    } catch {
      this.serverEnabled.set(false);
    }
  }

  /** Id de este móvil en el backend (si está dado de alta). */
  currentDeviceId(): string | null {
    return localStorage.getItem(NATIVE_DEVICE_KEY);
  }

  private optedOut(): boolean {
    return localStorage.getItem(NATIVE_OPT_OUT_KEY) === '1';
  }

  /**
   * El usuario apaga los avisos en este móvil desde Configuración: baja en el
   * backend y queda anotado para que no se reactiven al abrir la app.
   */
  async turnOff(): Promise<void> {
    localStorage.setItem(NATIVE_OPT_OUT_KEY, '1');
    await this.disable();
    try {
      await PushNotifications.unregister();
    } catch {
      /* Sin registro previo no hay nada que soltar. */
    }
  }

  /** Alta explícita desde Configuración. Aquí sí se pide el permiso. */
  async enable(): Promise<boolean> {
    if (!this.platform.isNative) {
      this.toast.warning('Las notificaciones solo están disponibles en la app móvil');
      return false;
    }

    await this.attachListeners();
    localStorage.removeItem(NATIVE_OPT_OUT_KEY);

    let status = await PushNotifications.checkPermissions();
    if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
      status = await PushNotifications.requestPermissions();
    }
    this.permission.set(this.mapPermission(status.receive));

    if (status.receive !== 'granted') {
      this.toast.error(
        'Permiso denegado. Actívalo en los ajustes del sistema, en Notificaciones de Maya.',
      );
      return false;
    }

    await this.register();
    return true;
  }

  /** Baja del dispositivo. Se llama ANTES de limpiar la sesión. */
  async disable(): Promise<void> {
    const token = this.token();
    if (!token) return;
    try {
      await firstValueFrom(
        this.http.delete(`${this.apiUrl}/devices/${encodeURIComponent(token)}`),
      );
    } catch {
      // Si el backend no responde, el token caducará solo: FCM deja de
      // aceptarlo cuando se desinstala la app y el servidor lo purga.
    }
    this.token.set(null);
    this.registered.set(false);
    localStorage.removeItem(NATIVE_DEVICE_KEY);
  }

  /**
   * Sesión caducada: suelta el token FCM sin pasar por el backend (no hay
   * token de sesión). FCM lo da por muerto y el backend lo borra al siguiente
   * envío; al volver a entrar se registra uno nuevo.
   */
  async dropLocal(): Promise<void> {
    if (!this.platform.isNative) return;
    try {
      await PushNotifications.unregister();
    } catch {
      /* Sin registro no hay nada que soltar. */
    }
    this.token.set(null);
    this.registered.set(false);
    localStorage.removeItem(NATIVE_DEVICE_KEY);
  }

  /**
   * Retira de la barra del teléfono los avisos de una conversación ya leída.
   * El backend los etiqueta con `conv_<id>`; sin `id`, retira los de todas.
   */
  async clearConversation(id?: string): Promise<void> {
    if (!this.platform.isNative) return;
    try {
      const { notifications } = await PushNotifications.getDeliveredNotifications();
      const stale = notifications.filter((n) =>
        id ? n.tag === `conv_${id}` : !!n.tag?.startsWith('conv_'),
      );
      if (stale.length) await PushNotifications.removeDeliveredNotifications({ notifications: stale });
    } catch {
      /* Sin permiso de notificaciones no hay nada que retirar. */
    }
  }

  private async register(): Promise<void> {
    // El canal debe existir antes de que llegue la primera notificación o
    // Android la coloca en el canal por defecto, sin sonido ni color.
    try {
      await PushNotifications.createChannel({
        id: 'maya_default',
        name: 'Mensajes',
        description: 'Mensajes nuevos, registros y avisos de campañas',
        importance: 5,
        visibility: 1,
        lights: true,
        lightColor: '#E11D48',
        vibration: true,
      });
    } catch {
      /* Los canales solo existen en Android 8+. */
    }

    await PushNotifications.register();
  }

  private async attachListeners(): Promise<void> {
    if (this.listenersReady || !this.platform.isNative) return;
    this.listenersReady = true;

    await PushNotifications.addListener('registration', (token) => {
      this.token.set(token.value);
      void this.sendToken(token.value);
    });

    await PushNotifications.addListener('registrationError', (err) => {
      // Casi siempre significa que falta `google-services.json` en el build.
      console.error('[push] registro fallido', err);
      this.registered.set(false);
      this.toast.error('No se pudieron activar las notificaciones en este móvil. Inténtalo de nuevo más tarde.');
    });

    // App en primer plano: Android no pinta la notificación del sistema, así
    // que el aviso lo damos nosotros (salvo que ya esté viendo ese chat).
    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      if (this.isWatching(notification.data?.['conversationId'] as string | undefined)) return;
      const title = notification.title ?? 'Maya CRM';
      const body = notification.body ?? '';
      this.toast.info(body ? `${title}: ${body}` : title);
    });

    // El usuario tocó la notificación: llevarle a donde ocurrió.
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const route = action.notification.data?.['route'] as string | undefined;
      if (route) void this.router.navigateByUrl(route);
    });
  }

  /** ¿El usuario tiene abierta esa conversación ahora mismo? */
  isWatching(conversationId: string | undefined): boolean {
    return (
      !!conversationId &&
      document.visibilityState === 'visible' &&
      this.router.url.startsWith('/inbox') &&
      this.router.url.includes(conversationId)
    );
  }

  private async sendToken(token: string): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.post<{ id?: string }>(`${this.apiUrl}/devices`, {
          token,
          platform: this.platform.platform === 'ios' ? 'ios' : 'android',
          appVersion: await this.appVersion(),
        }),
      );
      if (res?.id) localStorage.setItem(NATIVE_DEVICE_KEY, res.id);
      this.registered.set(true);
    } catch {
      this.registered.set(false);
      this.toast.error('No se pudo registrar este móvil para recibir notificaciones.');
    }
  }

  /** Versión de la app instalada, para distinguir dispositivos en la lista. */
  private async appVersion(): Promise<string | undefined> {
    try {
      return (await App.getInfo()).version.slice(0, 32);
    } catch {
      return undefined;
    }
  }

  private mapPermission(state: string): NativePushPermission {
    if (state === 'granted') return 'granted';
    if (state === 'denied') return 'denied';
    return 'prompt';
  }
}
