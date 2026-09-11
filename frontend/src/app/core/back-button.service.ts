import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { PlatformService } from './platform.service';
import { ConfirmService } from '../shared/confirm';
import { ToastService } from '../shared/toast';

/** Devuelve `true` si la capa consumió la pulsación de "atrás". */
export type BackHandler = () => boolean;

/**
 * Botón físico de "atrás" de Android.
 *
 * Sin esto el comportamiento por defecto de Capacitor es cerrar la app en
 * cuanto no hay historial, lo que se siente roto con un drawer o un modal
 * abierto. El orden es: capas superpuestas → historial → salir.
 */
@Injectable({ providedIn: 'root' })
export class BackButtonService {
  private platform = inject(PlatformService);
  private router = inject(Router);
  private confirm = inject(ConfirmService);
  private toast = inject(ToastService);

  /** Pila de capas visibles (drawers, hojas, modales de página). */
  private handlers: BackHandler[] = [];
  private lastBackPress = 0;
  private started = false;

  /**
   * Registra una capa que debe cerrarse antes de navegar hacia atrás.
   * Devuelve la función para darla de baja (llamar en `ngOnDestroy`).
   */
  register(handler: BackHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  /** Se llama una sola vez desde el componente raíz. */
  init() {
    if (!this.platform.isNative || this.started) return;
    this.started = true;
    void App.addListener('backButton', ({ canGoBack }) => this.onBack(canGoBack));
  }

  private onBack(canGoBack: boolean) {
    // 1. El diálogo de confirmación es la capa más alta (z-index 2000).
    if (this.confirm.state()) {
      this.confirm.respond(false);
      return;
    }

    // 2. Capas registradas, de la más reciente a la más antigua.
    for (let i = this.handlers.length - 1; i >= 0; i--) {
      if (this.handlers[i]()) return;
    }

    // 3. Historial. Se ignora en las pantallas de entrada: volver desde ahí
    //    llevaría a `/`, que `rootEntryGuard` reenvía de vuelta — un bucle.
    if (canGoBack && !this.isEntryUrl(this.router.url)) {
      window.history.back();
      return;
    }

    // 4. Salir con doble pulsación.
    if (Date.now() - this.lastBackPress < 2000) {
      void App.exitApp();
      return;
    }
    this.lastBackPress = Date.now();
    this.toast.info('Pulsa de nuevo para salir');
  }

  /** Primeras pantallas posibles según los módulos del usuario (ver `homeFor`). */
  private isEntryUrl(url: string): boolean {
    const path = url.split('?')[0].split('#')[0];
    return [
      '/login',
      '/inicio',
      '/dashboard',
      '/impulsador',
      '/admin/tenants',
      '/change-password',
    ].includes(path);
  }
}
