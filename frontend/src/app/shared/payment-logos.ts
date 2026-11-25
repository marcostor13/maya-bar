import { Component, input } from '@angular/core';
import { LucideAngularModule, Lock } from 'lucide-angular';
import { PAYMENT_LOGOS, YAPE, type PaymentLogo } from './payment-logos.data';


/**
 * Sello de pago seguro (HU76/HU77): "Procesado por Mercado Pago" y los medios
 * con los que se puede pagar. Las suscripciones mensuales solo aceptan tarjeta;
 * los pagos únicos también Yape y PagoEfectivo.
 */
@Component({
  selector: 'app-payment-logos',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="pl" [class.compact]="compact()">
      @if (!compact()) {
        <p class="pl-by">
          <lucide-icon [img]="Lock" [size]="13" />
          <span>Pago seguro procesado por</span>
          <span class="pl-mp" role="img" aria-label="Mercado Pago">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="mp.path" [attr.fill]="mp.hex" /></svg>
            <strong>Mercado Pago</strong>
          </span>
        </p>
      }
      <ul class="pl-list" aria-label="Medios de pago aceptados">
        @for (l of cards; track l.id) {
          <li class="pl-chip" [attr.title]="l.title">
            <svg viewBox="0 0 24 24" role="img" [attr.aria-label]="l.title"><path [attr.d]="l.path" [attr.fill]="l.hex" /></svg>
          </li>
        }
        @if (!cardsOnly()) {
          <li class="pl-chip pl-text" [style.color]="yape.hex" title="Yape">Yape</li>
          <li class="pl-chip pl-text muted" title="PagoEfectivo">PagoEfectivo</li>
        }
      </ul>
    </div>
  `,
  styles: [`
    .pl { display: flex; flex-direction: column; align-items: center; gap: 10px; }
    .pl-by { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 6px; margin: 0;
      font-size: 12.5px; color: var(--color-text-muted); text-align: center; }
    .pl-mp { display: inline-flex; align-items: center; gap: 5px; color: var(--color-text-main); }
    .pl-mp svg { width: 20px; height: 20px; }
    .pl-list { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px; list-style: none; margin: 0; padding: 0; }
    .pl-chip { display: inline-flex; align-items: center; justify-content: center; height: 28px; min-width: 42px; padding: 0 8px;
      box-sizing: border-box; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-white); }
    .pl-chip svg { width: 22px; height: 22px; }
    .pl-text { font: 800 12px var(--font-base); letter-spacing: -0.01em; }
    .pl-text.muted { color: var(--color-text-main); font-weight: 700; }
    .compact .pl-chip { height: 24px; min-width: 36px; }
    .compact .pl-chip svg { width: 18px; height: 18px; }
  `],
})
export class PaymentLogosComponent {
  /** Solo tarjeta (suscripción mensual). */
  cardsOnly = input(false);
  /** Solo la fila de logos, sin la línea de Mercado Pago. */
  compact = input(false);

  readonly Lock = Lock;
  readonly mp: PaymentLogo = PAYMENT_LOGOS['mercadopago'];
  readonly yape = YAPE;
  readonly cards: PaymentLogo[] = ['visa', 'mastercard', 'amex', 'diners'].map(id => PAYMENT_LOGOS[id]);
}
