import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import {
  LucideAngularModule, CreditCard, Gauge, Receipt, FileText, Save, Sparkles,
} from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../shared/toast';
import { BillingStatus, BillingStatusService } from '../../shared/billing-status.service';
import { PlanChangePanelComponent } from './plan-change-panel';
import { AddonsPanelComponent } from './addons-panel';

export interface UsageResource { key: string; limit: number | null; used: number }
export interface CreditBalance {
  period: string; unlimited: boolean; included: number | null; usedFromPlan: number;
  purchased: number; purchasedExpiresAt?: string; remaining: number;
}
export interface UsageResponse { unlimited: boolean; resources: UsageResource[]; credits: CreditBalance }
export interface PaymentRow {
  _id: string; concept: string; amount: number; currency: 'PEN' | 'USD';
  status: 'approved' | 'pending' | 'rejected' | 'refunded'; paidAt: string;
  receipt?: { series?: string; number?: number; pdfUrl?: string; xmlUrl?: string };
}
export interface BillingInfo {
  docType: 'boleta' | 'factura'; docNumber: string; legalName: string; address?: string; email?: string;
}

export const RESOURCE_LABELS: Record<string, string> = {
  users: 'Usuarios',
  whatsappNumbers: 'Números de WhatsApp',
  contacts: 'Contactos',
  mailboxes: 'Buzones de correo',
  aiAgents: 'Agentes de IA',
  activeEvents: 'Eventos publicados',
  campaignEmailsPerMonth: 'Emails de campaña (mes)',
};

const STATUS_LABELS: Record<BillingStatus['status'], string> = {
  trialing: 'En prueba',
  active: 'Activo',
  past_due: 'Pago pendiente',
  expired: 'Vencido',
  canceled: 'Cancelado',
  legacy: 'Cliente anterior',
};
const PERIOD_LABELS = { monthly: 'Mensual', quarterly: 'Trimestral', annual: 'Anual' } as const;
const PAYMENT_LABELS: Record<PaymentRow['status'], string> = {
  approved: 'Pagado', pending: 'Pendiente', rejected: 'Rechazado', refunded: 'Devuelto',
};

/** Porcentaje de uso para la barra (0–100). */
export function usagePercent(used: number, limit: number | null): number {
  if (limit == null || limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

/** Configuración → Mi plan y consumo (HU44). Solo el administrador de la empresa. */
@Component({
  selector: 'app-my-plan',
  standalone: true,
  imports: [FormsModule, RouterLink, DatePipe, DecimalPipe, LucideAngularModule, PlanChangePanelComponent, AddonsPanelComponent],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <h1 class="page-title">Mi plan y consumo</h1>
        <p class="page-subtitle">Tu suscripción, lo que llevas usado este mes, tus pagos y tus comprobantes</p>
      </div>

      <!-- 1. Plan actual -->
      <section class="card section">
        <div class="section-head">
          <div class="section-icon"><lucide-icon [img]="CreditCard" [size]="20" /></div>
          <h2 class="section-title">Plan actual</h2>
        </div>
        @if (status(); as s) {
          <div class="plan-row">
            <div>
              <p class="plan-name">{{ s.planName }}</p>
              <p class="muted">
                @if (s.subscription?.period) { {{ periodLabel(s.subscription!.period!) }} · }
                @if (s.subscription?.amount !== undefined) {
                  {{ s.subscription!.currency === 'USD' ? 'US$' : 'S/' }} {{ s.subscription!.amount | number: '1.2-2' }}
                }
              </p>
            </div>
            <span class="badge" [class]="'badge badge-' + statusTone(s.status)">{{ statusLabel(s.status) }}</span>
          </div>
          @if (nextDateLabel(); as next) {
            <p class="next-date">{{ next.label }}: <strong>{{ next.date | date: 'd MMM y' }}</strong></p>
          }
          @if ((s.status === 'active' || s.status === 'past_due') && s.subscription?.period) {
            <app-plan-change-panel (changed)="reloadStatus()" />
          } @else {
            <div class="actions">
              <a class="btn btn-primary btn-sm" routerLink="/checkout" [queryParams]="{ plan: s.plan === 'inicia' ? 'crece' : s.plan }">
                {{ s.status === 'trialing' || s.status === 'expired' || s.status === 'canceled' || s.legacy ? 'Elegir y pagar plan' : 'Cambiar plan' }}
              </a>
            </div>
          }
        } @else if (statusFailed()) {
          <p class="muted">No se pudo cargar tu plan. Recarga la página.</p>
        } @else {
          <p class="muted">Cargando…</p>
        }
      </section>

      <!-- 2. Consumo del mes -->
      <section class="card section">
        <div class="section-head">
          <div class="section-icon"><lucide-icon [img]="Gauge" [size]="20" /></div>
          <h2 class="section-title">Consumo</h2>
        </div>
        @if (usage(); as u) {
          @if (u.unlimited) { <p class="muted unlimited-note">Tu plan no tiene límites de uso.</p> }
          <ul class="bars">
            @for (r of u.resources; track r.key) {
              <li class="bar-row" [attr.data-key]="r.key">
                <div class="bar-label">
                  <span>{{ label(r.key) }}</span>
                  <span class="bar-count">{{ r.used | number }}{{ r.limit !== null ? ' / ' + (r.limit | number) : '' }}</span>
                </div>
                @if (r.limit !== null) {
                  <div class="bar" role="progressbar" [attr.aria-valuenow]="pct(r)" aria-valuemin="0" aria-valuemax="100">
                    <div class="bar-fill" [class.bar-full]="pct(r) >= 90" [style.width.%]="pct(r)"></div>
                  </div>
                }
              </li>
            }
            <li class="bar-row" data-key="aiCredits">
              <div class="bar-label">
                <span><lucide-icon [img]="Sparkles" [size]="14" /> Créditos de IA (mes)</span>
                <span class="bar-count">
                  @if (u.credits.unlimited) { Sin límite }
                  @else { {{ u.credits.remaining | number }} disponibles }
                </span>
              </div>
              @if (!u.credits.unlimited && u.credits.included) {
                <div class="bar" role="progressbar" [attr.aria-valuenow]="creditPct()" aria-valuemin="0" aria-valuemax="100">
                  <div class="bar-fill" [class.bar-full]="creditPct() >= 90" [style.width.%]="creditPct()"></div>
                </div>
                <p class="muted small">
                  {{ u.credits.usedFromPlan | number }} de {{ u.credits.included | number }} del plan usados
                  @if (u.credits.purchased) { · {{ u.credits.purchased | number }} de recargas }
                </p>
              }
            </li>
          </ul>
        } @else {
          <p class="muted">Cargando…</p>
        }
      </section>

      <!-- Extras y recargas (HU53) -->
      <section class="card section" id="addons">
        <div class="section-head">
          <div class="section-icon"><lucide-icon [img]="Gauge" [size]="20" /></div>
          <h2 class="section-title">Extras y recargas</h2>
        </div>
        <app-addons-panel (changed)="reloadStatus()" />
      </section>

      <!-- 3. Pagos -->
      <section class="card section">
        <div class="section-head">
          <div class="section-icon"><lucide-icon [img]="Receipt" [size]="20" /></div>
          <h2 class="section-title">Pagos</h2>
        </div>
        @if (payments().length) {
          <ul class="payments">
            @for (p of payments(); track p._id) {
              <li class="payment">
                <div class="payment-main">
                  <span class="payment-concept">{{ p.concept }}</span>
                  <span class="muted small">{{ p.paidAt | date: 'd MMM y' }} · {{ paymentLabel(p.status) }}</span>
                </div>
                <span class="payment-amount">{{ p.currency === 'USD' ? 'US$' : 'S/' }} {{ p.amount | number: '1.2-2' }}</span>
                <div class="payment-docs">
                  @if (p.receipt?.pdfUrl) {
                    <a class="btn btn-ghost btn-sm" [href]="p.receipt!.pdfUrl" target="_blank" rel="noopener">
                      <lucide-icon [img]="FileText" [size]="14" /> PDF
                    </a>
                  }
                  @if (p.receipt?.xmlUrl) {
                    <a class="btn btn-ghost btn-sm" [href]="p.receipt!.xmlUrl" target="_blank" rel="noopener">XML</a>
                  }
                </div>
              </li>
            }
          </ul>
        } @else {
          <p class="muted">Todavía no hay pagos.</p>
        }
      </section>

      <!-- 4. Datos de facturación -->
      <section class="card section">
        <div class="section-head">
          <div class="section-icon"><lucide-icon [img]="FileText" [size]="20" /></div>
          <h2 class="section-title">Datos de facturación</h2>
        </div>
        @if (infoReady()) {
        <form class="form" (ngSubmit)="saveInfo()">
          <label class="field">
            <span>Comprobante</span>
            <select class="select" name="docType" [(ngModel)]="info.docType">
              <option value="boleta">Boleta (DNI)</option>
              <option value="factura">Factura (RUC)</option>
            </select>
          </label>
          <label class="field">
            <span>{{ info.docType === 'factura' ? 'RUC' : 'DNI' }}</span>
            <input class="input" name="docNumber" inputmode="numeric" [maxlength]="info.docType === 'factura' ? 11 : 8"
              [(ngModel)]="info.docNumber" required />
          </label>
          <label class="field">
            <span>{{ info.docType === 'factura' ? 'Razón social' : 'Nombre completo' }}</span>
            <input class="input" name="legalName" [(ngModel)]="info.legalName" required />
          </label>
          @if (info.docType === 'factura') {
            <label class="field">
              <span>Dirección fiscal</span>
              <input class="input" name="address" [(ngModel)]="info.address" required />
            </label>
          }
          <label class="field">
            <span>Correo de facturación</span>
            <input class="input" type="email" name="email" [(ngModel)]="info.email" />
          </label>
          @if (formError()) { <p class="form-error">{{ formError() }}</p> }
          <div class="actions">
            <button class="btn btn-primary" type="submit" [disabled]="saving()">
              <lucide-icon [img]="Save" [size]="16" /> Guardar
            </button>
          </div>
        </form>
        } @else {
          <p class="muted">Cargando…</p>
        }
      </section>
    </div>
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    .page-header { margin-bottom: 24px; }
    .page-title { font-family: var(--font-heading); font-size: 26px; font-weight: 700; margin: 0 0 4px; }
    .page-subtitle { font-size: 14px; color: var(--color-text-muted); margin: 0; }
    .section { padding: 24px; margin-bottom: 20px; min-width: 0; }
    .section-head { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
    .section-icon { width: 40px; height: 40px; border-radius: var(--radius-lg); background: var(--color-brand-light);
      color: var(--color-brand); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .section-title { font-family: var(--font-heading); font-size: 17px; font-weight: 700; margin: 0; }
    .muted { color: var(--color-text-muted); margin: 0; font-size: 14px; }
    .small { font-size: 12px; }
    .plan-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    .plan-name { font-family: var(--font-heading); font-size: 22px; font-weight: 700; margin: 0 0 2px; }
    .next-date { margin: 12px 0 0; font-size: 14px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }
    .unlimited-note { margin-bottom: 12px; }
    .bars { list-style: none; margin: 0; padding: 0; display: grid; gap: 16px; }
    .bar-label { display: flex; justify-content: space-between; gap: 8px; font-size: 14px; margin-bottom: 6px; flex-wrap: wrap; }
    .bar-label lucide-icon { vertical-align: -2px; color: var(--color-ai); }
    .bar-count { font-weight: 600; font-variant-numeric: tabular-nums; }
    .bar { height: 8px; border-radius: var(--radius-pill); background: var(--color-bg-light); overflow: hidden; }
    .bar-fill { height: 100%; background: var(--color-brand); border-radius: inherit; transition: width .3s ease; }
    .bar-fill.bar-full { background: var(--color-warning); }
    .payments { list-style: none; margin: 0; padding: 0; }
    .payment { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-top: 1px solid var(--color-border); flex-wrap: wrap; }
    .payment:first-child { border-top: 0; }
    .payment-main { flex: 1 1 180px; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .payment-concept { font-weight: 600; overflow-wrap: anywhere; }
    .payment-amount { font-weight: 700; font-variant-numeric: tabular-nums; }
    .payment-docs { display: flex; gap: 4px; }
    .form { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
    .form .actions, .form .form-error { grid-column: 1 / -1; }
    .field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; min-width: 0; }
    .form-error { color: var(--color-error); margin: 0; font-size: 13px; }
    @media (max-width: 768px) {
      .page { padding: 20px 16px; }
      .page-title { font-size: 22px; }
      .section { padding: 20px 16px; }
      .form { grid-template-columns: 1fr; }
    }
  `],
})
export class MyPlanComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private billing = inject(BillingStatusService);
  private api = `${environment.apiUrl}/billing`;

  readonly CreditCard = CreditCard; readonly Gauge = Gauge; readonly Receipt = Receipt;
  readonly FileText = FileText; readonly Save = Save; readonly Sparkles = Sparkles;

  status = this.billing.status;
  usage = signal<UsageResponse | null>(null);
  payments = signal<PaymentRow[]>([]);
  info: BillingInfo = { docType: 'boleta', docNumber: '', legalName: '', address: '', email: '' };
  saving = signal(false);
  formError = signal('');
  /** Sin Zone.js: el formulario se pinta cuando llegan los datos guardados. */
  infoReady = signal(false);
  statusFailed = signal(false);

  creditPct = computed(() => {
    const c = this.usage()?.credits;
    return c ? usagePercent(c.usedFromPlan, c.included) : 0;
  });

  nextDateLabel = computed(() => {
    const s = this.status();
    if (!s) return null;
    if (s.status === 'trialing' && s.trialEndsAt) return { label: 'Tu prueba termina el', date: s.trialEndsAt };
    const end = s.subscription?.currentPeriodEnd;
    if (!end) return null;
    if (s.status === 'canceled' || s.subscription?.cancelAtPeriodEnd) return { label: 'Acceso hasta', date: end };
    return { label: 'Próximo cobro', date: end };
  });

  reloadStatus(): void {
    this.http.get<BillingStatus>(`${this.api}/status`).subscribe({
      next: st => this.billing.status.set(st),
      error: () => { this.statusFailed.set(true); this.toast.error('No se pudo cargar tu plan'); },
    });
  }

  ngOnInit(): void {
    this.reloadStatus();
    this.http.get<UsageResponse>(`${this.api}/usage`).subscribe({
      next: u => this.usage.set(u),
      error: err => this.toast.error(err.error?.message || 'No se pudo cargar el consumo'),
    });
    this.http.get<PaymentRow[]>(`${this.api}/payments`).subscribe({
      next: p => this.payments.set(p),
      error: err => this.toast.error(err.error?.message || 'No se pudieron cargar los pagos'),
    });
    this.http.get<BillingInfo | null>(`${this.api}/info`).subscribe({
      next: i => { if (i) this.info = { ...this.info, ...i }; this.infoReady.set(true); },
      error: err => {
        this.infoReady.set(true);
        this.toast.error(err.error?.message || 'No se pudieron cargar los datos de facturación');
      },
    });
  }

  label(key: string): string { return RESOURCE_LABELS[key] ?? key; }
  pct(r: UsageResource): number { return usagePercent(r.used, r.limit); }
  statusLabel(s: BillingStatus['status']): string { return STATUS_LABELS[s] ?? s; }
  statusTone(s: BillingStatus['status']): string {
    return s === 'active' || s === 'legacy' ? 'success' : s === 'trialing' ? 'info' : s === 'past_due' ? 'warning' : 'error';
  }
  periodLabel(p: keyof typeof PERIOD_LABELS): string { return PERIOD_LABELS[p]; }
  paymentLabel(s: PaymentRow['status']): string { return PAYMENT_LABELS[s]; }

  saveInfo(): void {
    this.formError.set('');
    this.saving.set(true);
    const body: BillingInfo = {
      docType: this.info.docType,
      docNumber: this.info.docNumber.trim(),
      legalName: this.info.legalName.trim(),
      ...(this.info.docType === 'factura' ? { address: this.info.address?.trim() } : {}),
      ...(this.info.email?.trim() ? { email: this.info.email.trim() } : {}),
    };
    this.http.put<BillingInfo>(`${this.api}/info`, body).subscribe({
      next: () => { this.saving.set(false); this.toast.success('Datos de facturación guardados'); },
      error: err => {
        this.saving.set(false);
        const raw = err.error?.message;
        const msg = Array.isArray(raw) ? raw[0] : raw || 'No se pudieron guardar los datos';
        this.formError.set(msg);
        this.toast.error(msg);
      },
    });
  }
}
