import { Injectable, inject } from '@angular/core';
import { PlatformService } from './platform.service';
import { NativePushService } from './push.service';

/** Marca de que ya se pidieron los permisos: solo se hace la primera vez. */
const YA_PEDIDOS = 'maya.permisos.pedidos';

/**
 * Permisos del dispositivo, pedidos la primera vez que se abre la app.
 *
 * En Android los permisos se conceden en tiempo de ejecución aunque estén
 * declarados en el manifest. Pedirlos en el primer arranque —y no la primera
 * vez que alguien intenta grabar una nota de voz— evita que la acción falle
 * justo cuando se necesita.
 *
 * El micrófono y la cámara se piden provocando un `getUserMedia` y cerrando el
 * flujo enseguida: es lo que dispara el diálogo del sistema en el WebView, y
 * evita añadir un plugin solo para esto.
 */
@Injectable({ providedIn: 'root' })
export class DevicePermissionsService {
  private platform = inject(PlatformService);
  private push = inject(NativePushService);

  /** Se llama una vez al arrancar. No lanza nunca: un permiso denegado no
   *  puede impedir que la aplicación se use. */
  async pedirAlInstalar(): Promise<void> {
    if (!this.platform.isNative) return;
    if (this.yaSePidieron()) return;

    // Se marca ANTES de pedir: si el usuario deniega, no se le vuelve a
    // preguntar en cada arranque, que es la forma de que acabe odiando la app.
    this.marcar();

    await this.microfonoYCamara();
    await this.push.enable().catch(() => false);
  }

  /**
   * Dispara los diálogos de micrófono y cámara. Se piden juntos porque en la
   * bandeja se usan a la vez: nota de voz y foto.
   */
  private async microfonoYCamara(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) return;
    for (const restriccion of [{ audio: true }, { video: true }]) {
      try {
        const flujo = await navigator.mediaDevices.getUserMedia(restriccion);
        // Cerrar enseguida: solo interesaba el diálogo, no el flujo. Si se
        // deja abierto, Android muestra el indicador de grabación activa.
        flujo.getTracks().forEach((t) => t.stop());
      } catch {
        /* Denegado o sin hardware: se seguirá pidiendo al usarlo de verdad. */
      }
    }
  }

  private yaSePidieron(): boolean {
    try {
      return localStorage.getItem(YA_PEDIDOS) === '1';
    } catch {
      return false;
    }
  }

  private marcar(): void {
    try {
      localStorage.setItem(YA_PEDIDOS, '1');
    } catch {
      /* Modo privado o almacenamiento bloqueado: se pedirá otra vez. */
    }
  }
}
