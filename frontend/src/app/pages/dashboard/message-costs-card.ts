import { Component, effect, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Wallet, Settings2, X, Info, ExternalLink } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

export interface MessageCosts {
  range: string;
  currency: 'USD';
  ratesEffective: string;
  totalUsd: number;
  whatsapp: {
    usd: number;
    billed: number;
    free: number;
    unknown: number;
    byCategory: { category: string; count: number; usd: number }[];
  };
  sms: { segments: number; messages: number; ratePerSegment: number | null; usd: number | null };
  email: { sent: number; ratePer1000: number | null; usd: number | null };
  instagram: { sent: number; usd: number };
  messenger: { sent: number; usd: number };
  settings: { smsPerSegment?: number; emailPer1000?: number };
}

const CATEGORY_LABELS: Record<string, string> = {
  marketing: 'Marketing',
  marketing_lite: 'Marketing',
  utility: 'Utilidad',
  service: 'Servicio',
  authentication: 'Autenticación',
  'authentication-international': 'Autenticación internacional',
};

/** Costos estimados de los mensajes del periodo, solo para el administrador (HU18). */
@Component({
  selector: 'app-message-costs-card',
  standalone: true,
  imports: [LucideAngularModule, DecimalPipe, FormsModule],
  template: `
    <section class="card costs" aria-labelledby="mc-title">
      <div class="head">
        <h3 id="mc-title"><lucide-icon [img]="Wallet" [size]="18" [strokeWidth]="2.2"></lucide-icon> Costos de mensajes</h3>
        <button class="btn btn-ghost btn-sm" type="button" (click)="openSettings()">
          <lucide-icon [img]="Settings2" [size]="15"></lucide-icon> Tarifas
        </button>
      </div>

      @if (loading()) {
        <p class="muted">Calculando…</p>
      } @else if (error()) {
        <p class="muted" role="alert">No se pudieron calcular los costos.
          <button class="btn btn-ghost btn-sm" type="button" (click)="load()">Reintentar</button></p>
      } @else if (costs(); as c) {
        <div class="total">
          <strong class="total-value">US$ {{ c.totalUsd | number: '1.2-4' }}</strong>
          <span class="muted">estimado del periodo</span>
        </div>
        <ul class="rows">
          <li>
            <span>WhatsApp</span>
            <span class="muted">{{ c.whatsapp.billed }} cobrados · {{ c.whatsapp.free }} gratis</span>
            <strong>US$ {{ c.whatsapp.usd | number: '1.2-4' }}</strong>
          </li>
          @for (cat of c.whatsapp.byCategory; track cat.category) {
            <li class="sub">
              <span>{{ categoryLabel(cat.category) }}</span>
              <span class="muted">{{ cat.count }}</span>
              <strong>US$ {{ cat.usd | number: '1.2-4' }}</strong>
            </li>
          }
          <li>
            <span>SMS</span>
            <span class="muted">{{ c.sms.messages }} mensajes · {{ c.sms.segments }} segmentos</span>
            <strong>{{ c.sms.usd === null ? 'Sin tarifa' : 'US$ ' + (c.sms.usd | number: '1.2-4') }}</strong>
          </li>
          <li>
            <span>Correo</span>
            <span class="muted">{{ c.email.sent }} enviados</span>
            <strong>{{ c.email.usd === null ? 'Sin tarifa' : 'US$ ' + (c.email.usd | number: '1.2-4') }}</strong>
          </li>
          <li>
            <span>Instagram y Messenger</span>
            <span class="muted">{{ c.instagram.sent + c.messenger.sent }} enviados</span>
            <strong>Gratis</strong>
          </li>
        </ul>
        @if (c.whatsapp.unknown) {
          <p class="muted small">{{ c.whatsapp.unknown }} mensajes de WhatsApp aún sin dato de cobro de Meta (llega con el estado de entrega; las cuentas que no usan la API oficial no lo informan).</p>
        }
        <p class="note">
          <lucide-icon [img]="Info" [size]="14"></lucide-icon>
          Estimación con tarifas de lista (WhatsApp desde {{ c.ratesEffective }}); la factura real la emite cada proveedor.
          <a href="https://developers.facebook.com/docs/whatsapp/pricing" target="_blank" rel="noopener">Tarifas de WhatsApp <lucide-icon [img]="ExternalLink" [size]="12"></lucide-icon></a>
          · <a href="https://www.twilio.com/docs/glossary/what-sms-character-limit" target="_blank" rel="noopener">Segmentos SMS <lucide-icon [img]="ExternalLink" [size]="12"></lucide-icon></a>
          · <a href="https://resend.com/pricing" target="_blank" rel="noopener">Correo <lucide-icon [img]="ExternalLink" [size]="12"></lucide-icon></a>
          · <a href="https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview" target="_blank" rel="noopener">Messenger e Instagram <lucide-icon [img]="ExternalLink" [size]="12"></lucide-icon></a>
        </p>
      }
    </section>

    @if (settingsOpen()) {
      <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="mc-set-title" (keydown.escape)="settingsOpen.set(false)">
        <form class="card modal" (ngSubmit)="saveSettings()">
          <div class="head">
            <h2 id="mc-set-title">Tarifas de tus proveedores</h2>
            <button class="btn-icon btn-ghost" type="button" (click)="settingsOpen.set(false)" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="20"></lucide-icon>
            </button>
          </div>
          <p class="muted">En USD. Déjalo vacío si no quieres sumarlo al total.</p>
          <label class="label" for="mc-sms">Costo por segmento de SMS</label>
          <input id="mc-sms" class="input" type="number" min="0" max="10" step="0.0001" name="sms" [(ngModel)]="smsRate" />
          <label class="label" for="mc-email">Costo por cada 1.000 correos</label>
          <input id="mc-email" class="input" type="number" min="0" max="1000" step="0.01" name="email" [(ngModel)]="emailRate" />
          <div class="actions">
            <button class="btn btn-secondary" type="button" (click)="settingsOpen.set(false)">Cancelar</button>
            <button class="btn btn-primary" type="submit" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
          </div>
        </form>
      </div>
    }
  `,
  styles: [`
    .costs { padding: 24px; display: flex; flex-direction: column; gap: 12px; }
    .card:hover { transform: none; }
    .head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    h3, h2 { margin: 0; font-family: var(--font-heading); font-size: 16px; display: flex; align-items: center; gap: 8px; }
    .total { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .total-value { font-family: var(--font-heading); font-size: 26px; }
    .muted { margin: 0; font-size: 13px; color: var(--color-text-muted); }
    .small { font-size: 12px; }
    .rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
    .rows li { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--color-border); font-size: 13.5px; }
    .rows li:last-child { border-bottom: none; }
    .rows li.sub { padding-left: 16px; font-size: 12.5px; }
    .note { margin: 0; font-size: 12px; color: var(--color-text-muted); line-height: 1.5; }
    .note a { color: var(--color-brand); white-space: nowrap; }
    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 100; }
    .modal { width: calc(100% - 48px); max-width: 480px; padding: 28px 32px; display: flex; flex-direction: column; gap: 10px; box-sizing: border-box; }
    .label { font-size: 12.5px; font-weight: 600; }
    .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 8px; flex-wrap: wrap; }
    @media (max-width: 768px) {
      .rows li { grid-template-columns: 1fr auto; }
      .rows li .muted { grid-column: 1 / -1; grid-row: 2; }
      .modal { padding: 22px 18px; width: calc(100% - 32px); }
    }
  `],
})
export class MessageCostsCardComponent {
  private http = inject(HttpClient);
  private toast = inject(ToastService);

  readonly Wallet = Wallet; readonly Settings2 = Settings2; readonly X = X;
  readonly Info = Info; readonly ExternalLink = ExternalLink;

  range = input<string>('30d');

  costs = signal<MessageCosts | null>(null);
  loading = signal(true);
  error = signal(false);
  settingsOpen = signal(false);
  saving = signal(false);
  smsRate: number | null = null;
  emailRate: number | null = null;

  constructor() {
    effect(() => {
      this.range();
      this.load();
    });
  }

  load() {
    this.loading.set(true);
    this.error.set(false);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    this.http.get<MessageCosts>(`${API}/dashboard/costs`, { params: { range: this.range(), tz } }).subscribe({
      next: c => { this.costs.set(c); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(true); },
    });
  }

  categoryLabel(c: string) { return CATEGORY_LABELS[c] ?? c; }

  openSettings() {
    const s = this.costs()?.settings ?? {};
    this.smsRate = s.smsPerSegment ?? null;
    this.emailRate = s.emailPer1000 ?? null;
    this.settingsOpen.set(true);
  }

  saveSettings() {
    const norm = (v: number | null | string) => (v === null || v === '' ? null : Number(v));
    const body = { smsPerSegment: norm(this.smsRate), emailPer1000: norm(this.emailRate) };
    if ((body.smsPerSegment !== null && !(body.smsPerSegment >= 0 && body.smsPerSegment <= 10))
      || (body.emailPer1000 !== null && !(body.emailPer1000 >= 0 && body.emailPer1000 <= 1000))) {
      this.toast.error('Revisa las tarifas: SMS de 0 a 10 y correo de 0 a 1.000 USD');
      return;
    }
    this.saving.set(true);
    this.http.put(`${API}/dashboard/costs/settings`, body).subscribe({
      next: () => {
        this.saving.set(false);
        this.settingsOpen.set(false);
        this.toast.success('Tarifas guardadas');
        this.load();
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err.error?.message || 'No se pudieron guardar las tarifas');
      },
    });
  }
}
