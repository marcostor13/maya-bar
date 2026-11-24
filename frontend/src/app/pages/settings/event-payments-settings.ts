import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LucideAngularModule, Ticket, Loader2, Unplug, CheckCircle2 } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { environment } from '../../../environments/environment';

export interface MpSellerStatus {
  available: boolean;
  connected: boolean;
  mpUserId: string | null;
  liveMode: boolean;
  connectedAt: string | null;
  feePct: number;
}

const API = `${environment.apiUrl}/event-tickets/mp`;

/** Cuenta de Mercado Pago de la empresa para vender entradas (HU67). */
@Component({
  selector: 'app-event-payments-settings',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="section-card">
      <div class="section-header">
        <div class="section-icon"><lucide-icon [img]="Ticket" [size]="22"></lucide-icon></div>
        <div>
          <h2 class="section-title">Cobro de entradas</h2>
          <p class="section-desc">Conecta tu cuenta de Mercado Pago para vender entradas de tus eventos y cobrar cotizaciones con tarjeta o Yape. El dinero llega directo a tu cuenta.</p>
        </div>
      </div>

      @if (loading()) {
        <div class="loading-row"><lucide-icon [img]="Loader2" [size]="18" class="spin"></lucide-icon> Cargando…</div>
      } @else if (status()?.connected) {
        <div class="acc-card">
          <div class="acc-id">
            <span class="acc-label">
              <lucide-icon [img]="CheckCircle2" [size]="16" class="ok"></lucide-icon>
              <strong>Mercado Pago conectado</strong>
              <span class="badge" [class.badge-success]="status()!.liveMode" [class.badge-warning]="!status()!.liveMode">{{ status()!.liveMode ? 'Producción' : 'Prueba' }}</span>
            </span>
            <span class="acc-sub">Cuenta {{ status()!.mpUserId }}</span>
          </div>
          <button class="btn btn-sm btn-ghost danger" (click)="disconnect()" [disabled]="busy()">
            <lucide-icon [img]="Unplug" [size]="14"></lucide-icon> Desconectar
          </button>
        </div>
      } @else {
        <button class="btn btn-primary" (click)="connect()" [disabled]="busy() || !status()?.available">
          <lucide-icon [img]="Ticket" [size]="16"></lucide-icon> Conectar Mercado Pago
        </button>
        @if (status() && !status()!.available) {
          <p class="field-hint">El cobro de entradas aún no está habilitado en la plataforma.</p>
        }
      }
      @if (status()) {
        <p class="field-hint">Maya cobra una comisión de {{ status()!.feePct }} % por entrada vendida, además de la comisión de Mercado Pago. Activa la venta en cada evento, en la pestaña General.</p>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .section-card { background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 28px 32px; margin-bottom: 24px; }
    .section-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
    .section-icon { width: 44px; height: 44px; border-radius: var(--radius-lg); display: grid; place-items: center; flex-shrink: 0;
      background: color-mix(in srgb, var(--color-brand) 10%, var(--color-white)); color: var(--color-brand); }
    .section-title { font-family: var(--font-heading); font-size: 17px; font-weight: 700; margin: 0 0 2px; }
    .section-desc { font-size: 13px; color: var(--color-text-muted); margin: 0; }
    .loading-row { display: flex; align-items: center; gap: 10px; color: var(--color-text-muted); font-size: 14px; }
    .acc-card { border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 16px 20px;
      display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    .acc-id { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .acc-label { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .acc-sub { font-size: 12.5px; color: var(--color-text-muted); }
    .ok { color: var(--color-success); }
    .danger { color: var(--color-error) !important; }
    .field-hint { display: block; font-size: 12px; color: var(--color-text-muted); margin-top: 12px; line-height: 1.5; }
    .spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 768px) {
      .section-card { padding: 20px; }
      .acc-card { flex-direction: column; align-items: stretch; }
    }
  `],
})
export class EventPaymentsSettingsComponent implements OnInit {
  readonly Ticket = Ticket; readonly Loader2 = Loader2; readonly Unplug = Unplug; readonly CheckCircle2 = CheckCircle2;
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  status = signal<MpSellerStatus | null>(null);
  loading = signal(true);
  busy = signal(false);

  ngOnInit() {
    this.load();
    this.handleOAuthReturn();
  }

  load() {
    this.http.get<MpSellerStatus>(`${API}/status`).subscribe({
      next: s => { this.status.set(s); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  /** Vuelta de Mercado Pago (ver event-tickets.controller.ts). */
  private handleOAuthReturn() {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('mp');
    if (!result) return;
    if (result === 'connected') this.toast.success('Mercado Pago conectado: ya puedes vender entradas');
    else this.toast.error(params.get('reason') || 'No se pudo conectar Mercado Pago');
    params.delete('mp');
    params.delete('reason');
    const query = params.toString();
    history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : '') + window.location.hash);
  }

  connect() {
    this.busy.set(true);
    this.http.post<{ url: string }>(`${API}/connect`, {}).subscribe({
      next: r => { window.location.href = r.url; },
      error: err => { this.busy.set(false); this.toast.error(err.error?.message || 'No se pudo iniciar la conexión'); },
    });
  }

  async disconnect() {
    const ok = await this.confirm.confirm({
      title: 'Desconectar Mercado Pago',
      message: 'Tus eventos dejarán de vender entradas en línea hasta que vuelvas a conectar una cuenta. Las entradas ya pagadas siguen valiendo.',
      confirmText: 'Desconectar',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(true);
    this.http.delete(`${API}`).subscribe({
      next: () => { this.busy.set(false); this.toast.success('Mercado Pago desconectado'); this.load(); },
      error: err => { this.busy.set(false); this.toast.error(err.error?.message || 'No se pudo desconectar'); },
    });
  }
}
