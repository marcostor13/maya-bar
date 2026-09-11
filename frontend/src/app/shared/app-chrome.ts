import { Injectable, signal } from '@angular/core';

/**
 * Estado del "chrome" de la aplicación (cabecera móvil y barra inferior).
 *
 * Algunas pantallas necesitan la pantalla entera —el hilo de un chat abierto en
 * el móvil, por ejemplo—: activan el modo inmersivo y el shell esconde su
 * cabecera y su barra de pestañas, como haría cualquier app de mensajería.
 */
@Injectable({ providedIn: 'root' })
export class AppChromeService {
  /** Oculta cabecera y barra inferior en móvil mientras esté activo. */
  readonly immersive = signal(false);

  enterImmersive() {
    this.immersive.set(true);
  }

  exitImmersive() {
    this.immersive.set(false);
  }
}
