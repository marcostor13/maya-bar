import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MetaTrackingService } from '../core/meta-tracking.service';

/**
 * Aviso de cookies de medición (HU84, Ley N.° 29733). Solo aparece en las
 * páginas públicas y mientras no haya una decisión; sin "Aceptar" no se
 * carga el píxel de Meta.
 */
@Component({
  selector: 'app-consent-banner',
  standalone: true,
  imports: [RouterLink],
  template: `
    @if (tracking.bannerVisible()) {
      <section class="consent" role="region" aria-live="polite" aria-label="Preferencias de cookies">
        <p>
          Usamos cookies propias y de Meta para medir nuestros anuncios y saber qué funciona.
          Puedes aceptarlas o quedarte solo con las necesarias.
          <a routerLink="/privacidad">Más información</a>
        </p>
        <div class="actions">
          <button type="button" class="btn btn-secondary btn-sm" (click)="tracking.reject()">Solo necesarias</button>
          <button type="button" class="btn btn-primary btn-sm" (click)="tracking.accept()">Aceptar</button>
        </div>
      </section>
    }
  `,
  styles: [`
    .consent {
      position: fixed; left: 16px; right: 16px; bottom: 16px; z-index: 90;
      max-width: 560px; margin: 0 auto; box-sizing: border-box;
      background: var(--color-white); border: 1px solid var(--color-border);
      border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
      padding: 20px 24px; display: grid; gap: 14px;
      font-family: var(--font-base); font-size: 14px; color: var(--color-text-main);
    }
    p { margin: 0; line-height: 1.5; }
    a { color: var(--color-brand); }
    .actions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
  `],
})
export class ConsentBannerComponent {
  readonly tracking = inject(MetaTrackingService);
}
