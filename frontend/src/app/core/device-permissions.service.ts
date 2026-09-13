import { Injectable, inject } from '@angular/core';
import { PlatformService } from './platform.service';
import { NativePushService } from './push.service';

/**
 * Marca de que ya se pidieron los permisos: solo se hace la primera vez.
 *
 * La versión sube a `v2` a propósito. En la v1 el micrófono no se podía
 * conceder nunca (faltaba MODIFY_AUDIO_SETTINGS en el manifest, sin el cual
 * Capacitor deniega el permiso al WebView), y la marca se guardaba igualmente:
 * quien ya tenía la app instalada se quedaba sin que volviera a preguntarle
 * jamás. Cambiar la clave descarta esa marca envenenada.
 */
const YA_PEDIDOS = 'maya.permisos.pedidos.v2';

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

    await this.microfonoYCamara();
    await this.push.enable().catch(() => false);

    // Se marca DESPUÉS de preguntar, no antes. Marcar antes parecía más
    // seguro —evita insistir si el usuario cierra la app a media pregunta—,
    // pero convierte cualquier fallo al pedir el permiso en permanente: la
    // marca queda puesta aunque el diálogo no haya llegado a salir. Si la app
    // muere durante el diálogo se vuelve a preguntar al siguiente arranque,
    // que es mucho menos grave que no preguntar nunca más.
    this.marcar();
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
