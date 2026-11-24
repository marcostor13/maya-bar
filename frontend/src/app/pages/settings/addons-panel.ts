import { Component, OnInit, inject, output, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe, DecimalPipe } from '@angular/common';
import { LucideAngularModule, Plus } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';

export interface AddonItem {
  id: string; name: string; kind: 'monthly' | 'topup'; price: number; owned: number;
  available: boolean; dueNow: number | null; dueNowWithIgv: number | null;
}
export interface AddonsInfo {
  currency: 'PEN' | 'USD'; paid: boolean;
  aiCreditsPurchased: number; aiCreditsPurchasedExpiresAt?: string;
  campaignEmailsPurchased: number; campaignEmailsPurchasedExpiresAt?: string;
  addons: AddonItem[];
}

/** Extras mensuales y recargas (HU53), dentro de Mi plan. */
@Component({
  selector: 'app-addons-panel',
  standalone: true,
  imports: [DatePipe, DecimalPipe, LucideAngularModule],
  template: `
    @if (info(); as i) {
      @if (i.aiCreditsPurchased > 0 || i.campaignEmailsPurchased > 0) {
        <p class="muted small balance">
          @if (i.aiCreditsPurchased > 0) { Créditos de IA comprados: <strong>{{ i.aiCreditsPurchased | number }}</strong> (vencen el {{ i.aiCreditsPurchasedExpiresAt | date: 'd MMM y' }}). }
          @if (i.campaignEmailsPurchased > 0) { Emails de campaña comprados: <strong>{{ i.campaignEmailsPurchased | number }}</strong> (vencen el {{ i.campaignEmailsPurchasedExpiresAt | date: 'd MMM y' }}). }
        </p>
      }
      <div class="list">
        @for (a of i.addons; track a.id) {
          <div class="item" [attr.data-addon]="a.id">
            <div>
              <p class="name">{{ a.name }} @if (a.owned) { <span class="badge badge-success">Tienes {{ a.owned }}</span> }</p>
              <p class="muted small">
                {{ money(a.price, i.currency) }}{{ i.currency === 'PEN' ? ' + IGV' : '' }}{{ a.kind === 'monthly' ? ' al mes, se suma a tu plan' : ' · pago único, dura 12 meses' }}
                @if (!a.available) { · requiere un plan pagado }
              </p>
            </div>
            <button class="btn btn-secondary btn-sm" type="button" (click)="buy(a, i.currency)" [disabled]="busy() || !a.available">
              <lucide-icon [img]="Plus" [size]="14" /> Comprar
            </button>
          </div>
        }
      </div>
    } @else if (failed()) {
      <p class="muted">No se pudieron cargar los extras.</p>
    } @else {
      <p class="muted">Cargando…</p>
    }
  `,
  styles: [`
    .list { display: grid; gap: 12px; }
    .item { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;
      padding: 14px 16px; border: 1px solid var(--color-border); border-radius: var(--radius-lg); }
    .name { font-weight: 700; margin: 0 0 2px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .muted { color: var(--color-text-muted); margin: 0; }
    .small { font-size: 13px; }
    .balance { margin-bottom: 12px; }
  `],
})
export class AddonsPanelComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private api = `${environment.apiUrl}/billing/addons`;
  readonly Plus = Plus;
  readonly changed = output<void>();

  info = signal<AddonsInfo | null>(null);
  failed = signal(false);
  busy = signal(false);

  ngOnInit() { this.load(); }

  load() {
    this.http.get<AddonsInfo>(this.api).subscribe({
      next: r => {
        this.info.set(r); this.failed.set(false);
        // Desde el aviso de límite se llega con #addons.
        if (typeof window !== 'undefined' && window.location.hash === '#addons')
          setTimeout(() => document.getElementById('addons')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      },
      error: () => this.failed.set(true),
    });
  }

  money(n: number | null, cur: 'PEN' | 'USD') {
    return `${cur === 'USD' ? 'US$' : 'S/'} ${(n ?? 0).toFixed(2)}`;
  }

  async buy(a: AddonItem, cur: 'PEN' | 'USD') {
    const ok = await this.confirm.confirm({
      title: `Comprar ${a.name}`,
      message: a.kind === 'monthly'
        ? `Hoy pagas ${this.money(a.dueNowWithIgv, cur)} (con IGV) por los días que quedan del periodo; desde tu próximo cobro o renovación se suma ${this.money(a.price, cur)}${cur === 'PEN' ? ' + IGV' : ''} por cada mes.`
        : `Pagas ${this.money(a.dueNowWithIgv, cur)} una sola vez. El saldo dura 12 meses y se usa después de lo incluido en tu plan.`,
      confirmText: 'Ir a pagar',
    });
    if (!ok) return;
    this.busy.set(true);
    this.http.post<{ redirectUrl?: string; applied?: boolean }>(`${this.api}/buy`, { addon: a.id }).subscribe({
      next: r => {
        if (r.redirectUrl) { window.location.href = r.redirectUrl; return; }
        this.busy.set(false);
        this.toast.success(`${a.name} activado`);
        this.load();
        this.changed.emit();
      },
      error: err => {
        this.busy.set(false);
        this.toast.error((err as { error?: { message?: string } }).error?.message || 'No se pudo iniciar la compra');
      },
    });
  }
}
