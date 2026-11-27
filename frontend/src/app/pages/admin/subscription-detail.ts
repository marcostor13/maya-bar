import { Component, HostListener, OnInit, inject, input, output, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Repeat, Banknote, Undo2, Mail, KeyRound, FileText } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { FormPageComponent } from '../../shared/form-page';
import { environment } from '../../../environments/environment';
import { PERIOD_LABEL, PLAN_OPTIONS, RECEIPT_STATUS, SUB_STATUS, money, planName } from './billing-admin.shared';

interface ReceiptView { status: string; code?: string; pdfUrl?: string; error?: string; skippedReason?: string }
export interface SubscriptionDetail {
  tenant: {
    _id: string; name: string; email: string; ruc?: string; plan: string; trialEndsAt?: string;
    subscription: {
      status: string; period?: string; currency?: string; amount?: number; currentPeriodEnd?: string;
      cancelAtPeriodEnd?: boolean; mpPreapprovalId?: string; discount?: { code: string };
    } | null;
  };
  payments: {
    _id: string; concept: string; amount: number; currency: string; status: string; provider: string;
    paymentType?: string; paidAt: string; receipt?: ReceiptView & { creditNote?: ReceiptView };
  }[];
  onboarding: { _id: string; packageName: string; status: string }[];
  actions: { _id: string; action: string; actorEmail: string; createdAt: string; details?: Record<string, unknown> }[];
}

const ACTION_LABEL: Record<string, string> = {
  extend_trial: 'Alargó la prueba',
  change_plan: 'Cambió el plan o el precio',
  manual_payment: 'Registró un pago manual',
  refund: 'Reembolsó un pago',
  resend_access: 'Reenvió el acceso',
  resend_receipt: 'Reenvió un comprobante',
};

type Modal = 'plan' | 'refund' | null;

/** Ficha de una suscripción con su historial y acciones (HU57). */
@Component({
  selector: 'app-subscription-detail',
  standalone: true,
  imports: [DatePipe, FormsModule, LucideAngularModule, FormPageComponent],
  template: `
    <app-form-page
      [title]="d()?.tenant?.name ?? 'Suscripción'"
      [subtitle]="d()?.tenant?.email ?? ''"
      backLabel="Suscripciones"
      [urlKey]="tenantId()"
      (closed)="closed.emit()">
      <ng-container formActions>
        <button type="button" class="btn btn-secondary btn-sm" [disabled]="busy()" (click)="resendAccess()"><lucide-icon [img]="KeyRound" [size]="15" /> Reenviar acceso</button>
        <button type="button" class="btn btn-primary btn-sm" (click)="openPayment()"><lucide-icon [img]="Banknote" [size]="15" /> Pago manual</button>
      </ng-container>

      @if (d(); as v) {
        <section class="card block">
          <div class="block-head">
            <h2>Suscripción</h2>
            <div class="row-actions">
              @if (canChangePlan(v)) {
                <button type="button" class="btn btn-ghost btn-sm" (click)="openPlan(v)"><lucide-icon [img]="Repeat" [size]="15" /> Cambiar plan o precio</button>
              }
            </div>
          </div>
          <dl class="facts">
            <div><dt>Plan</dt><dd>{{ planName(v.tenant.plan) }}</dd></div>
            <div><dt>Estado</dt><dd><span class="badge" [class]="statusOf(v).badge">{{ statusOf(v).label }}</span></dd></div>
            <div><dt>Periodo</dt><dd>{{ v.tenant.subscription?.period ? periodLabel[v.tenant.subscription!.period!] : '—' }}</dd></div>
            <div><dt>Precio pactado</dt><dd data-testid="amount">{{ v.tenant.subscription?.amount != null ? money(v.tenant.subscription!.amount!, v.tenant.subscription!.currency) + ' sin IGV' : '—' }}</dd></div>
            <div><dt>Vence</dt>
              <dd>{{ (v.tenant.subscription?.currentPeriodEnd ?? v.tenant.trialEndsAt) | date: 'd MMM y' }}</dd></div>
            <div><dt>Cobro</dt><dd>{{ v.tenant.subscription?.mpPreapprovalId ? 'Automático (Mercado Pago)' : 'Pago único o manual' }}</dd></div>
            @if (v.tenant.subscription?.discount) { <div><dt>Cupón</dt><dd>{{ v.tenant.subscription!.discount!.code }}</dd></div> }
            @if (v.tenant.subscription?.cancelAtPeriodEnd) { <div><dt>Baja</dt><dd>Se cancela al vencer</dd></div> }
          </dl>
        </section>

        <section class="card block">
          <h2>Pagos y comprobantes</h2>
          @if (!v.payments.length) {
            <p class="muted">Sin pagos.</p>
          } @else {
            <div class="table-card table-cards">
              <table>
                <thead><tr><th>Fecha</th><th>Concepto</th><th>Monto</th><th>Estado</th><th>Comprobante</th><th></th></tr></thead>
                <tbody>
                  @for (p of v.payments; track p._id) {
                    <tr [attr.data-payment]="p._id">
                      <td data-label="Fecha">{{ p.paidAt | date: 'd MMM y' }}</td>
                      <td data-label="">{{ p.concept }} <span class="muted small">· {{ p.provider === 'manual' ? 'Manual' : 'Mercado Pago' }}</span></td>
                      <td data-label="Monto">{{ money(p.amount, p.currency) }}</td>
                      <td data-label="Estado"><span class="badge" [class]="payBadge(p.status)">{{ payLabel(p.status) }}</span></td>
                      <td data-label="Comprobante">
                        @if (p.receipt; as r) {
                          <span class="badge" [class]="receiptOf(r.status).badge" [attr.title]="r.error || r.skippedReason || null">{{ receiptOf(r.status).label }}</span>
                          @if (r.pdfUrl) { <a class="doc" [href]="r.pdfUrl" target="_blank" rel="noopener"><lucide-icon [img]="FileText" [size]="13" /> {{ r.code }}</a> }
                          @if (r.creditNote; as nc) {
                            <div class="small">NC: <span class="badge" [class]="receiptOf(nc.status).badge">{{ receiptOf(nc.status).label }}</span>
                              @if (nc.pdfUrl) { <a class="doc" [href]="nc.pdfUrl" target="_blank" rel="noopener">{{ nc.code }}</a> }</div>
                          }
                        } @else { <span class="muted">—</span> }
                      </td>
                      <td data-label="" class="actions">
                        @if (p.receipt?.status === 'issued') {
                          <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="resendReceipt(p._id, 'receipt')" aria-label="Reenviar comprobante"><lucide-icon [img]="Mail" [size]="15" /></button>
                        }
                        @if (p.receipt?.creditNote?.status === 'issued') {
                          <button type="button" class="btn btn-ghost btn-sm" [disabled]="busy()" (click)="resendReceipt(p._id, 'creditNote')">Reenviar NC</button>
                        }
                        @if (p.status === 'approved') {
                          <button type="button" class="btn btn-danger btn-sm" [disabled]="busy()" [attr.data-refund]="p._id" (click)="openRefund(p)"><lucide-icon [img]="Undo2" [size]="15" /> Reembolsar</button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>

        @if (v.onboarding.length) {
          <section class="card block">
            <h2>Implementación</h2>
            @for (o of v.onboarding; track o._id) { <p>{{ o.packageName }} · {{ o.status }}</p> }
          </section>
        }

        <section class="card block">
          <h2>Acciones del equipo</h2>
          @if (!v.actions.length) { <p class="muted">Nadie ha hecho cambios a mano.</p> }
          <ul class="log">
            @for (a of v.actions; track a._id) {
              <li><strong>{{ actionLabel(a.action) }}</strong> <span class="muted small">· {{ a.actorEmail }} · {{ a.createdAt | date: 'd MMM y, HH:mm' }}</span>
                @if (detailsOf(a); as dt) { <div class="small">{{ dt }}</div> }</li>
            }
          </ul>
        </section>
      } @else {
        <p class="muted">Cargando…</p>
      }
    </app-form-page>

    @if (modal() === 'refund' && refunding(); as rp) {
      <div class="overlay" (click)="modal.set(null)">
        <form class="modal card modal-card" role="dialog" aria-modal="true" aria-labelledby="refund-title" (click)="$event.stopPropagation()" (ngSubmit)="refund()">
          <h3 id="refund-title">Reembolsar {{ money(rp.amount, rp.currency) }}</h3>
          <p class="muted small">{{ rp.provider === 'mercadopago' ? 'Se devuelve por Mercado Pago' : 'El dinero lo devuelves tú' }} y se emite la nota de crédito. La suscripción no cambia.</p>
          <label for="refund-reason">Motivo</label>
          <input id="refund-reason" class="input" name="reason" maxlength="500" [(ngModel)]="refundReason" required />
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" (click)="modal.set(null)">Cancelar</button>
            <button type="submit" class="btn btn-danger" [disabled]="busy()">Reembolsar</button>
          </div>
        </form>
      </div>
    }

    @if (modal() === 'plan') {
      <div class="overlay" (click)="modal.set(null)">
        <form class="modal card modal-card" role="dialog" aria-modal="true" aria-labelledby="plan-title" (click)="$event.stopPropagation()" (ngSubmit)="changePlan()">
          <h3 id="plan-title">Cambiar plan o precio</h3>
          <p class="muted small">El precio pactado reemplaza al de catálogo y al cupón. El periodo pagado no cambia.</p>
          <label for="cp-plan">Plan</label>
          <select id="cp-plan" class="select" name="plan" [(ngModel)]="planForm.plan">
            @for (p of plans; track p.id) { <option [value]="p.id">{{ p.name }}</option> }
          </select>
          <label for="cp-amount">Precio por periodo, sin IGV</label>
          <input id="cp-amount" class="input" type="number" min="0" step="0.01" name="amount" [(ngModel)]="planForm.amount" required />
          <label for="cp-reason">Motivo</label>
          <input id="cp-reason" class="input" name="reason" maxlength="500" [(ngModel)]="planForm.reason" />
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" (click)="modal.set(null)">Cancelar</button>
            <button type="submit" class="btn btn-primary" [disabled]="busy()">Guardar</button>
          </div>
        </form>
      </div>
    }

    @if (paymentOpen()) {
      <app-form-page title="Registrar pago manual" subtitle="Transferencia o Yape directo: activa el plan y emite el comprobante."
        backLabel="Suscripción" urlKey="pago-manual" [dirty]="paymentDirty()" (closed)="paymentOpen.set(false)">
        <ng-container formActions>
          <button type="button" class="btn btn-ghost" (click)="paymentOpen.set(false)">Cancelar</button>
          <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="manualPayment()">Registrar pago</button>
        </ng-container>
        <div class="card block form-grid">
          <div><label for="mp-plan">Plan</label>
            <select id="mp-plan" class="select" name="mpplan" [(ngModel)]="pay.plan">
              @for (p of plans; track p.id) { <option [value]="p.id">{{ p.name }}</option> }
            </select></div>
          <div><label for="mp-period">Periodo</label>
            <select id="mp-period" class="select" name="mpperiod" [(ngModel)]="pay.period">
              <option value="monthly">Mensual</option><option value="quarterly">Trimestral</option><option value="annual">Anual</option>
            </select></div>
          <div><label for="mp-currency">Moneda</label>
            <select id="mp-currency" class="select" name="mpcurrency" [(ngModel)]="pay.currency">
              <option value="PEN">Soles</option><option value="USD">Dólares</option>
            </select></div>
          <div><label for="mp-total">Monto cobrado {{ pay.currency === 'PEN' ? '(con IGV)' : '' }}</label>
            <input id="mp-total" class="input" type="number" min="1" step="0.01" name="mptotal" [(ngModel)]="pay.total" /></div>
          <div><label for="mp-method">Medio</label>
            <select id="mp-method" class="select" name="mpmethod" [(ngModel)]="pay.method">
              <option value="transfer">Transferencia</option><option value="yape">Yape directo</option><option value="other">Otro</option>
            </select></div>
          <div><label for="mp-ref">N.º de operación</label>
            <input id="mp-ref" class="input" name="mpref" maxlength="200" [(ngModel)]="pay.reference" /></div>
        </div>
      </app-form-page>
    }
  `,
  styles: [`
    .block { padding: 24px; margin-bottom: 20px; }
    .block h2 { margin: 0 0 16px; font-size: 17px; font-family: var(--font-heading); }
    .block-head { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
    .row-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; margin: 0; }
    .facts dt { font-size: 12px; color: var(--color-text-muted); font-weight: 600; margin-bottom: 4px; }
    .facts dd { margin: 0; font-weight: 600; }
    .muted { color: var(--color-text-muted); }
    .small { font-size: 12px; }
    .doc { display: inline-flex; align-items: center; gap: 4px; margin-left: 6px; color: var(--color-brand); font-size: 13px; }
    .actions { white-space: nowrap; text-align: right; }
    .log { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
    label { display: block; font-size: 13px; font-weight: 600; color: var(--color-text-muted); margin: 12px 0 6px; }
    .form-grid label { margin-top: 0; }
    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center; z-index: 100; }
    .modal { width: calc(100% - 48px); max-width: 480px; padding: 28px 32px; }
    .modal h3 { margin: 0 0 8px; font-family: var(--font-heading); }
    .modal-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px; }
  `],
})
export class SubscriptionDetailComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private api = `${environment.apiUrl}/billing/admin/subscriptions`;
  readonly Repeat = Repeat;
  readonly Banknote = Banknote;
  readonly Undo2 = Undo2;
  readonly Mail = Mail;
  readonly KeyRound = KeyRound;
  readonly FileText = FileText;
  readonly money = money;
  readonly planName = planName;
  readonly periodLabel = PERIOD_LABEL;
  readonly plans = PLAN_OPTIONS;

  tenantId = input.required<string>();
  closed = output<void>();
  changed = output<void>();

  d = signal<SubscriptionDetail | null>(null);
  modal = signal<Modal>(null);
  busy = signal(false);
  paymentOpen = signal(false);
  planForm = { plan: 'crece', amount: 0, reason: '' };
  pay = { plan: 'crece', period: 'monthly', currency: 'PEN', total: 0, method: 'transfer', reference: '' };
  /** Clave de idempotencia del pago manual: una por formulario abierto. */
  private requestId = '';
  refunding = signal<SubscriptionDetail['payments'][number] | null>(null);
  refundReason = '';
  private payInitial = '';

  ngOnInit() { this.load(); }

  @HostListener('document:keydown.escape')
  onEscape() { if (this.modal()) this.modal.set(null); }

  load() {
    this.http.get<SubscriptionDetail>(`${this.api}/${this.tenantId()}`).subscribe({
      next: r => this.d.set(r),
      error: err => this.toast.error(err.error?.message || 'No se pudo cargar la suscripción'),
    });
  }

  statusOf(v: SubscriptionDetail) {
    const s = v.tenant.subscription?.status ?? (v.tenant.trialEndsAt ? 'trialing' : 'legacy');
    return SUB_STATUS[s] ?? { label: s, badge: 'badge-neutral' };
  }
  canChangePlan(v: SubscriptionDetail) {
    const s = v.tenant.subscription;
    return !!s?.period && (s.status === 'active' || s.status === 'past_due');
  }
  payLabel(s: string) { return ({ approved: 'Aprobado', pending: 'Pendiente', rejected: 'Rechazado', refunded: 'Reembolsado' } as Record<string, string>)[s] ?? s; }
  payBadge(s: string) { return ({ approved: 'badge-success', pending: 'badge-info', rejected: 'badge-danger', refunded: 'badge-neutral' } as Record<string, string>)[s] ?? 'badge-neutral'; }
  receiptOf(s: string) { return RECEIPT_STATUS[s] ?? { label: s, badge: 'badge-neutral' }; }
  actionLabel(a: string) { return ACTION_LABEL[a] ?? a; }

  private post(path: string, body: object, ok: string, after?: () => void) {
    this.busy.set(true);
    this.http.post(`${this.api}/${path}`, body).subscribe({
      next: () => { this.busy.set(false); this.toast.success(ok); after?.(); this.load(); this.changed.emit(); },
      error: err => { this.busy.set(false); this.toast.error(err.error?.message || 'No se pudo completar la acción'); },
    });
  }

  openPlan(v: SubscriptionDetail) {
    this.planForm = { plan: v.tenant.plan, amount: v.tenant.subscription?.amount ?? 0, reason: '' };
    this.modal.set('plan');
  }

  changePlan() {
    this.post(`${this.tenantId()}/change-plan`, { ...this.planForm, amount: Number(this.planForm.amount) }, 'Plan actualizado', () => this.modal.set(null));
  }

  openPayment() {
    const s = this.d()?.tenant.subscription;
    this.pay = {
      plan: this.d()?.tenant.plan ?? 'crece', period: s?.period ?? 'monthly', currency: s?.currency ?? 'PEN',
      total: 0, method: 'transfer', reference: '',
    };
    this.payInitial = JSON.stringify(this.pay);
    this.requestId = crypto.randomUUID();
    this.paymentOpen.set(true);
  }

  paymentDirty() { return JSON.stringify(this.pay) !== this.payInitial; }

  async manualPayment() {
    const total = Number(this.pay.total);
    if (!(total > 0)) { this.toast.error('Indica el monto cobrado'); return; }
    const ok = await this.confirm.confirm({
      title: 'Registrar pago manual',
      message: `Se activa el plan ${planName(this.pay.plan)} (${PERIOD_LABEL[this.pay.period].toLowerCase()}) desde hoy por ${money(total, this.pay.currency)}. ` +
        (this.pay.currency === 'PEN' ? 'Se emite la boleta o factura.' : 'En dólares el comprobante sigue la configuración de pagos del exterior.'),
      confirmText: 'Registrar',
    });
    if (!ok) return;
    this.post(`${this.tenantId()}/manual-payment`, { ...this.pay, total, reference: this.pay.reference || undefined, requestId: this.requestId },
      'Pago registrado: el comprobante está en camino', () => this.paymentOpen.set(false));
  }

  openRefund(p: SubscriptionDetail['payments'][number]) {
    this.refunding.set(p);
    this.refundReason = '';
    this.modal.set('refund');
  }

  refund() {
    const p = this.refunding();
    if (!p) return;
    if (!this.refundReason.trim()) { this.toast.error('Indica el motivo del reembolso'); return; }
    this.post(`payments/${p._id}/refund`, { reason: this.refundReason.trim() }, 'Pago reembolsado', () => this.modal.set(null));
  }

  detailsOf(a: SubscriptionDetail['actions'][number]): string {
    const d = a.details ?? {};
    const cur = String(d['currency'] ?? 'PEN');
    switch (a.action) {
      case 'extend_trial': return `+${d['days']} días`;
      case 'change_plan': {
        const to = d['to'] as { plan?: string; amount?: number } | undefined;
        return `${planName(to?.plan)} a ${money(to?.amount)}${d['reason'] ? ` · ${d['reason']}` : ''}`;
      }
      case 'manual_payment': return `${planName(String(d['plan']))} ${PERIOD_LABEL[String(d['period'])]?.toLowerCase() ?? ''} · ${money(Number(d['total']), cur)}${d['reference'] ? ` · op. ${d['reference']}` : ''}`;
      case 'refund': return `${money(Number(d['amount']), cur)}${d['reason'] ? ` · ${d['reason']}` : ''}`;
      default: return '';
    }
  }

  resendReceipt(paymentId: string, kind: 'receipt' | 'creditNote') {
    this.post(`payments/${paymentId}/resend-receipt`, { kind }, kind === 'receipt' ? 'Comprobante reenviado' : 'Nota de crédito reenviada');
  }

  resendAccess() {
    this.post(`${this.tenantId()}/resend-access`, {}, 'Acceso reenviado');
  }
}
