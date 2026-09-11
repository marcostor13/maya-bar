import { Injectable, inject } from '@angular/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Keyboard } from '@capacitor/keyboard';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { PlatformService } from './platform.service';
import { BackButtonService } from './back-button.service';

/**
 * Arranque de la capa nativa. Se invoca una vez desde el componente raíz.
 *
 * Nota sobre la barra de estado: con `targetSdk` 36 Android fuerza el modo
 * edge-to-edge, así que `setBackgroundColor` y `setOverlaysWebView` son
 * no-ops — el color bajo la barra lo pinta el propio header de la app usando
 * `--safe-top` (ver `styles.scss`). Aquí solo se fija el color de los iconos.
 */
@Injectable({ providedIn: 'root' })
export class NativeAppService {
  private platform = inject(PlatformService);
  private backButton = inject(BackButtonService);

  private started = false;

  async init(): Promise<void> {
    if (!this.platform.isNative || this.started) return;
    this.started = true;

    document.documentElement.classList.add('is-native', `is-${this.platform.platform}`);

    this.backButton.init();

    try {
      // Iconos oscuros: el header de la app es blanco.
      await StatusBar.setStyle({ style: Style.Light });
    } catch {
      /* La barra de estado no existe en todos los dispositivos/modos. */
    }

    // El redimensionado del teclado en Android se configura en
    // `capacitor.config.ts` (`Keyboard.resize: 'native'`). Aquí solo se marca
    // el body para poder ajustar overlays mientras está abierto.
    try {
      await Keyboard.addListener('keyboardWillShow', () =>
        document.body.classList.add('keyboard-open'),
      );
      await Keyboard.addListener('keyboardWillHide', () =>
        document.body.classList.remove('keyboard-open'),
      );
    } catch {
      /* Plugin no disponible. */
    }
  }

  /** Vibración corta al tocar un elemento de navegación. No-op en web. */
  async tap(): Promise<void> {
    if (!this.platform.isNative) return;
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      /* El dispositivo puede no tener motor de vibración. */
    }
  }

  /** Oculta el splash. Se llama cuando la primera pantalla ya puede pintarse. */
  async hideSplash(): Promise<void> {
    if (!this.platform.isNative) return;
    try {
      await SplashScreen.hide({ fadeOutDuration: 200 });
    } catch {
      /* Ya oculto. */
    }
  }
}
