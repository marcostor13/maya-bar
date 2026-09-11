import { Component, inject } from '@angular/core';
import { LucideAngularModule, WifiOff } from 'lucide-angular';
import { NetworkService } from '../core/network.service';

/**
 * Aviso persistente de "sin conexión". Va en el componente raíz para que
 * aparezca también en login y onboarding, no solo dentro del Shell.
 */
@Component({
  selector: 'app-offline-banner',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    @if (!network.online()) {
      <div class="offline" role="status" aria-live="polite">
        <div class="offline-inner">
          <lucide-icon [img]="WifiOff" [size]="16" [strokeWidth]="2.4" />
          <span>Sin conexión</span>
        </div>
      </div>
    }
  `,
  styles: [`
    .offline {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      /* Se pinta bajo la barra de estado para no tapar la hora ni la batería. */
      padding-top: var(--safe-top);
      background: var(--color-warning);
      color: #fff;
      z-index: 60;
      animation: offlineIn 240ms cubic-bezier(0.16, 1, 0.3, 1);
    }

    .offline-inner {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      height: 30px;
      font-family: var(--font-base);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.01em;
    }

    @keyframes offlineIn {
      from { transform: translateY(-100%); }
      to   { transform: translateY(0); }
    }
  `],
})
export class OfflineBannerComponent {
  network = inject(NetworkService);
  readonly WifiOff = WifiOff;
}
