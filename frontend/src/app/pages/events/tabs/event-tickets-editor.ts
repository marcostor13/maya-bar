import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, Plus, Trash2, CreditCard, AlertTriangle } from 'lucide-angular';
import { environment } from '../../../../environments/environment';
import { EventDetailStore } from '../event-detail.store';
import type { TicketType } from '../../../shared/models/event.model';

interface MpStatus { available: boolean; connected: boolean; feePct: number }

/** Venta de entradas en línea: tipos con precio, cupo y fecha de corte (HU67). */
@Component({
  selector: 'app-event-tickets-editor',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideAngularModule],
  template: `
    <section class="tickets card" aria-labelledby="tk-title">
      <div class="tk-head">
        <lucide-icon [img]="CreditCard" [size]="18" [strokeWidth]="2.4"></lucide-icon>
        <h3 id="tk-title">Entradas pagadas en línea</h3>
        <label class="switch">
          <input type="checkbox" name="onlinePayment" [ngModel]="store.onlinePayment()" (ngModelChange)="toggle($event)" />
          <span>{{ store.onlinePayment() ? 'Activado' : 'Desactivado' }}</span>
        </label>
      </div>
      <p class="hint">Tus invitados pagan con tarjeta o Yape en la página del evento y el dinero llega a tu cuenta de Mercado Pago. La entrada solo vale en la puerta si está pagada.</p>

      @if (store.onlinePayment()) {
        @if (status() && !status()!.connected) {
          <p class="warn" role="alert">
            <lucide-icon [img]="AlertTriangle" [size]="16" [strokeWidth]="2.4"></lucide-icon>
            Conecta tu cuenta de Mercado Pago en <a routerLink="/settings" fragment="cfg-event-payments">Configuración → Cobro de entradas</a> para empezar a vender.
          </p>
        }
        @for (t of store.ticketTypes(); track $index; let i = $index) {
          <div class="tk-row">
            <div class="field grow">
              <label class="label" [for]="'tk-name-' + i">Tipo</label>
              <input class="input" [id]="'tk-name-' + i" [name]="'tkName' + i" maxlength="60" placeholder="General, VIP, Preventa…" [ngModel]="t.name" (ngModelChange)="set(i, 'name', $event)" />
            </div>
            <div class="field">
              <label class="label" [for]="'tk-price-' + i">Precio (S/)</label>
              <input class="input" type="number" min="0" step="0.5" [id]="'tk-price-' + i" [name]="'tkPrice' + i" [ngModel]="t.price" (ngModelChange)="set(i, 'price', $event)" />
            </div>
            <div class="field">
              <label class="label" [for]="'tk-cap-' + i">Cupo (0 = sin tope)</label>
              <input class="input" type="number" min="0" [id]="'tk-cap-' + i" [name]="'tkCap' + i" [ngModel]="t.capacity" (ngModelChange)="set(i, 'capacity', $event)" />
            </div>
            <div class="field">
              <label class="label" [for]="'tk-end-' + i">Venta hasta</label>
              <input class="input" type="date" [id]="'tk-end-' + i" [name]="'tkEnd' + i" [ngModel]="t.salesEndAt" (ngModelChange)="set(i, 'salesEndAt', $event || null)" />
            </div>
            <div class="sold">
              @if (t.sold) { <span class="badge badge-info">{{ t.sold }} vendidas</span> }
              <button type="button" class="btn btn-ghost btn-icon" [attr.aria-label]="'Quitar ' + (t.name || 'tipo de entrada')" [disabled]="!!t.sold" (click)="remove(i)">
                <lucide-icon [img]="Trash2" [size]="16" [strokeWidth]="2.4"></lucide-icon>
              </button>
            </div>
          </div>
        }
        <button type="button" class="btn btn-secondary btn-sm" (click)="add()">
          <lucide-icon [img]="Plus" [size]="16" [strokeWidth]="2.4"></lucide-icon> Agregar tipo de entrada
        </button>
        @if (status()) { <p class="hint">Maya cobra una comisión de {{ status()!.feePct }} % por entrada vendida; Mercado Pago descuenta además la suya.</p> }
      }
    </section>
  `,
  styles: [`
    .tickets { padding: 24px; margin: 0 24px 24px; display: flex; flex-direction: column; gap: 14px; }
    .tk-head { display: flex; align-items: center; gap: 10px; }
    .tk-head h3 { font-family: var(--font-heading); font-size: 16px; margin: 0; flex: 1; }
    .switch { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .hint { font-size: 12px; color: var(--color-text-muted); margin: 0; }
    .warn { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--color-warning); margin: 0; }
    .warn a { color: var(--color-brand); }
    .tk-row { display: grid; grid-template-columns: 2fr 1fr 1fr 1.2fr auto; gap: 12px; align-items: end; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .label { font-size: 13px; font-weight: 600; }
    .sold { display: flex; align-items: center; gap: 6px; padding-bottom: 4px; }
    @media (max-width: 768px) {
      .tickets { margin: 0 16px 16px; padding: 16px; }
      .tk-row { grid-template-columns: 1fr 1fr; }
      .tk-row .grow { grid-column: 1 / -1; }
    }
  `],
})
export class EventTicketsEditorComponent implements OnInit {
  readonly CreditCard = CreditCard; readonly Plus = Plus; readonly Trash2 = Trash2; readonly AlertTriangle = AlertTriangle;
  store = inject(EventDetailStore);
  private http = inject(HttpClient);
  status = signal<MpStatus | null>(null);

  ngOnInit() {
    this.http.get<MpStatus>(`${environment.apiUrl}/event-tickets/mp/status`).subscribe({
      next: s => this.status.set(s),
      error: () => this.status.set(null),
    });
  }

  toggle(on: boolean) {
    this.store.onlinePayment.set(on);
    if (on && !this.store.ticketTypes().length)
      this.store.ticketTypes.set([{ name: 'General', price: Number(this.store.form.value.price) || 0, capacity: 0, salesEndAt: null }]);
  }

  add() {
    this.store.ticketTypes.update(list => [...list, { name: '', price: 0, capacity: 0, salesEndAt: null }]);
  }

  remove(i: number) {
    this.store.ticketTypes.update(list => list.filter((_, j) => j !== i));
  }

  set<K extends keyof TicketType>(i: number, key: K, value: TicketType[K]) {
    this.store.ticketTypes.update(list => list.map((t, j) => (j === i ? { ...t, [key]: value } : t)));
  }
}
