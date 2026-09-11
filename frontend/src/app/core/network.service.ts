import { Injectable, inject, signal } from '@angular/core';
import { Network } from '@capacitor/network';
import { PlatformService } from './platform.service';

/**
 * Estado de conexión. En nativo lo da el plugin (detecta también el modo avión
 * y el wifi sin salida); en web se cae a los eventos `online`/`offline`.
 */
@Injectable({ providedIn: 'root' })
export class NetworkService {
  private platform = inject(PlatformService);

  private _online = signal(true);
  online = this._online.asReadonly();

  private started = false;

  async init(): Promise<void> {
    if (!this.platform.isBrowser || this.started) return;
    this.started = true;

    if (this.platform.isNative) {
      const status = await Network.getStatus();
      this._online.set(status.connected);
      await Network.addListener('networkStatusChange', (s) =>
        this._online.set(s.connected),
      );
      return;
    }

    this._online.set(navigator.onLine);
    window.addEventListener('online', () => this._online.set(true));
    window.addEventListener('offline', () => this._online.set(false));
  }
}
