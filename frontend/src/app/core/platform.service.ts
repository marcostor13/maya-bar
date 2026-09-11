import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Capacitor } from '@capacitor/core';

/**
 * Única fuente de verdad sobre dónde se está ejecutando la app.
 *
 * El mismo código se sirve en tres contextos: prerender en Node (landing),
 * navegador y WebView de Capacitor. Cualquier API nativa debe consultarse aquí
 * antes de usarse — en el build SSR `Capacitor` existe pero devuelve `web`, y
 * `window`/`navigator` directamente no existen.
 */
@Injectable({ providedIn: 'root' })
export class PlatformService {
  private platformId = inject(PLATFORM_ID);

  /** `false` durante el prerender de la landing. */
  readonly isBrowser = isPlatformBrowser(this.platformId);

  /** `true` solo dentro de la app empaquetada (Android/iOS). */
  readonly isNative = this.isBrowser && Capacitor.isNativePlatform();

  /** `'android' | 'ios' | 'web'`. */
  readonly platform = this.isBrowser ? Capacitor.getPlatform() : 'server';

  readonly isAndroid = this.platform === 'android';
}
