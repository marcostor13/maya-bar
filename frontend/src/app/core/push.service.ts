import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PushNotifications } from '@capacitor/push-notifications';
import { PlatformService } from './platform.service';
import { ToastService } from '../shared/toast';
import { environment } from '../../environments/environment';

export type PushPermission = 'unsupported' | 'prompt' | 'granted' | 'denied';

/**
 * Notificaciones push nativas (FCM).
 *
 * El ciclo es: permiso → `register()` → el sistema devuelve un token → el
 * token se guarda en el backend asociado al usuario. Al cerrar sesión hay que
 * darlo de baja o el siguiente dueño del móvil recibiría avisos ajenos.
 */
@Injectable({ providedIn: 'root' })
export class PushService {
  private platform = inject(PlatformService);
  private http = inject(HttpClient);
  private router = inject(Router);
  private toast = inject(ToastService);

  private apiUrl = environment.apiUrl;

  /** Token FCM actual, necesario para la baja. */
  private token = signal<string | null>(null);

  permission = signal<PushPermission>(this.platform.isNative ? 'prompt' : 'unsupported');
  readonly registered = signal(false);

  private listenersReady = false;

  /**
   * Arranque tras el login. Si el permiso ya está concedido registra en
   * silencio; si no, NO lo pide: en Android 13+ solo hay una oportunidad, y
   * gastarla nada más entrar es la forma segura de que digan que no.
   */
  async init(): Promise<void> {
    if (!this.platform.isNative) return;

    await this.attachListeners();

    const status = await PushNotifications.checkPermissions();
    this.permission.set(this.mapPermission(status.receive));
    if (status.receive === 'granted') await this.register();
  }

  /** Alta explícita desde Configuración. Aquí sí se pide el permiso. */
  async enable(): Promise<boolean> {
    if (!this.platform.isNative) {
      this.toast.warning('Las notificaciones solo están disponibles en la app móvil');
      return false;
    }

    await this.attachListeners();

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
  }

  private async register(): Promise<void> {
    // El canal debe existir antes de que llegue la primera notificación o
    // Android la coloca en el canal por defecto, sin sonido ni color.
    try {
      await PushNotifications.createChannel({
        id: 'maya_default',
        name: 'Avisos de Maya',
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
    });

    // App en primer plano: Android no pinta la notificación del sistema, así
    // que el aviso lo damos nosotros.
    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      const title = notification.title ?? 'Maya';
      const body = notification.body ?? '';
      this.toast.info(body ? `${title}: ${body}` : title);
    });

    // El usuario tocó la notificación: llevarle a donde ocurrió.
    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const route = action.notification.data?.['route'] as string | undefined;
      if (route) void this.router.navigateByUrl(route);
    });
  }

  private async sendToken(token: string): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post(`${this.apiUrl}/devices`, {
          token,
          platform: this.platform.platform === 'ios' ? 'ios' : 'android',
        }),
      );
      this.registered.set(true);
    } catch {
      this.registered.set(false);
    }
  }

  private mapPermission(state: string): PushPermission {
    if (state === 'granted') return 'granted';
    if (state === 'denied') return 'denied';
    return 'prompt';
  }
}
