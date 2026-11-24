import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { LucideAngularModule, CheckCircle2, XCircle, CreditCard, FileText, Loader2 } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { environment } from '../../../environments/environment';

export interface PublicQuote {
  number: string;
  status: 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'paid';
  currency: string;
  items: { name: string; unit?: string; quantity: number; unitPrice: number; discountPct?: number; total: number }[];
  igvRate: number;
  subtotal: number;
  discount: number;
  igv: number;
  total: number;
  validUntil: string | null;
  expired: boolean;
  notes: string;
  createdAt: string;
  canPay: boolean;
  company: { name: string; logo: string; color: string };
  customerName: string;
  pdfUrl: string;
}

const API = `${environment.apiUrl}/public/quotes`;

/** Link público de una cotización (HU68): verla, aceptarla, rechazarla o pagarla. */
@Component({
  selector: 'app-public-quote',
  standalone: true,
  imports: [LucideAngularModule, DecimalPipe, DatePipe, FormsModule],
  template: `
    <main class="pq">
      @if (loading()) {
        <div class="pq-state"><lucide-icon [img]="Loader2" [size]="28" class="spin"></lucide-icon></div>
      } @else if (!q()) {
        <div class="pq-state card"><h1>Cotización no encontrada</h1><p>El link no es válido o la cotización fue eliminada.</p></div>
      } @else {
        @let d = q()!;
        <article class="card pq-card animate-fade-in" [style.--accent]="d.company.color || null">
          <header class="pq-head">
            @if (d.company.logo) { <img [src]="d.company.logo" [alt]="d.company.name" class="pq-logo" /> }
            @else { <strong class="pq-company">{{ d.company.name }}</strong> }
            <div class="pq-meta">
              <h1>Cotización {{ d.number }}</h1>
              <span>Para {{ d.customerName }} · {{ d.createdAt | date:'dd/MM/yyyy' }}</span>
              @if (d.validUntil) { <span [class.expired]="d.expired">Válida hasta {{ d.validUntil | date:'dd/MM/yyyy':'UTC' }}</span> }
            </div>
          </header>

          @if (notice()) { <p class="pq-notice" role="status">{{ notice() }}</p> }

          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Descripción</th><th class="num">Cant.</th><th class="num">P. unit.</th><th class="num">Importe</th></tr></thead>
              <tbody>
                @for (it of d.items; track $index) {
                  <tr>
                    <td data-label="Descripción">{{ it.name }}@if (it.discountPct) { <span class="disc"> (−{{ it.discountPct }} %)</span> }</td>
                    <td data-label="Cant." class="num">{{ it.quantity }}</td>
                    <td data-label="P. unit." class="num">S/ {{ it.unitPrice | number:'1.2-2' }}</td>
                    <td data-label="Importe" class="num">S/ {{ it.total | number:'1.2-2' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <div class="pq-totals">
            <div><span>Subtotal (sin IGV)</span><span>S/ {{ d.subtotal | number:'1.2-2' }}</span></div>
            <div><span>IGV ({{ d.igvRate }} %)</span><span>S/ {{ d.igv | number:'1.2-2' }}</span></div>
            <div class="total"><span>Total</span><span>S/ {{ d.total | number:'1.2-2' }}</span></div>
          </div>

          @if (d.notes) { <p class="pq-notes">{{ d.notes }}</p> }

          @if (d.status === 'accepted' || d.status === 'paid') {
            <div class="pq-done ok"><lucide-icon [img]="CheckCircle2" [size]="22"></lucide-icon>
              {{ d.status === 'paid' ? '¡Pago recibido! Gracias por tu compra.' : 'Aceptaste esta cotización. Te contactaremos para continuar.' }}</div>
          } @else if (d.status === 'rejected') {
            <div class="pq-done"><lucide-icon [img]="XCircle" [size]="22"></lucide-icon> Rechazaste esta cotización.</div>
          } @else if (d.expired) {
            <div class="pq-done">Esta cotización venció. Pide una nueva a {{ d.company.name }}.</div>
          } @else {
            <div class="pq-actions">
              @if (d.canPay) {
                <button type="button" class="btn btn-primary btn-lg" (click)="pay()" [disabled]="busy()">
                  <lucide-icon [img]="CreditCard" [size]="18"></lucide-icon> Pagar S/ {{ d.total | number:'1.2-2' }}
                </button>
              }
              <button type="button" class="btn btn-lg" [class.btn-primary]="!d.canPay" [class.btn-secondary]="d.canPay" (click)="accept()" [disabled]="busy()">
                <lucide-icon [img]="CheckCircle2" [size]="18"></lucide-icon> Aceptar cotización
              </button>
              <button type="button" class="btn btn-ghost" (click)="rejecting.set(!rejecting())" [disabled]="busy()">Rechazar</button>
            </div>
            @if (rejecting()) {
              <div class="pq-reject">
                <label class="field-label" for="pq-reason">¿Por qué la rechazas? (opcional)</label>
                <textarea id="pq-reason" class="textarea" rows="2" maxlength="500" [(ngModel)]="reason"></textarea>
                <button type="button" class="btn btn-danger btn-sm" (click)="reject()" [disabled]="busy()">Confirmar rechazo</button>
              </div>
            }
          }

          <a class="pq-pdf" [href]="d.pdfUrl" target="_blank" rel="noopener"><lucide-icon [img]="FileText" [size]="16"></lucide-icon> Descargar PDF</a>
        </article>
      }
    </main>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: var(--color-bg-app); }
    .pq { width: 100%; box-sizing: border-box; padding: 32px 16px; display: flex; justify-content: center; }
    .pq-state { padding: 48px 24px; text-align: center; max-width: 480px; }
    .pq-card { width: 100%; max-width: 760px; padding: 32px; display: flex; flex-direction: column; gap: 20px; --accent: var(--color-brand); }
    .pq-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
    .pq-logo { max-height: 56px; max-width: 180px; object-fit: contain; }
    .pq-company { font-family: var(--font-heading); font-size: 20px; color: var(--accent); }
    .pq-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; font-size: 13px; color: var(--color-text-muted); text-align: right; }
    .pq-meta h1 { font-family: var(--font-heading); font-size: 22px; margin: 0 0 4px; color: var(--color-text-main); }
    .expired { color: var(--color-error); font-weight: 600; }
    .pq-notice { background: color-mix(in srgb, var(--accent) 10%, var(--color-white)); border-radius: var(--radius-md); padding: 12px 16px; margin: 0; font-size: 14px; }
    .num { text-align: right; }
    .disc { color: var(--color-text-muted); font-size: 12px; }
    .pq-totals { display: flex; flex-direction: column; gap: 6px; margin-left: auto; width: 100%; max-width: 320px; font-size: 14px; }
    .pq-totals div { display: flex; justify-content: space-between; }
    .pq-totals .total { font-size: 22px; font-weight: 800; border-top: 1px solid var(--color-border); padding-top: 8px; color: var(--accent); }
    .pq-notes { white-space: pre-line; font-size: 14px; color: var(--color-text-muted); margin: 0; }
    .pq-actions { display: flex; gap: 12px; flex-wrap: wrap; }
    .pq-actions .btn-primary { background: var(--accent); border-color: var(--accent); }
    .pq-reject { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
    .pq-reject .textarea { width: 100%; }
    .pq-done { display: flex; align-items: center; gap: 10px; padding: 16px; border-radius: var(--radius-md); background: var(--color-bg-app); font-weight: 600; }
    .pq-done.ok { color: var(--color-success); }
    .pq-pdf { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; color: var(--accent); align-self: flex-start; }
    .spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 640px) {
      .pq-card { padding: 20px; }
      .pq-meta { align-items: flex-start; text-align: left; }
      .pq-actions .btn { flex: 1 1 100%; }
    }
  `],
})
export class PublicQuoteComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  readonly CheckCircle2 = CheckCircle2; readonly XCircle = XCircle; readonly CreditCard = CreditCard;
  readonly FileText = FileText; readonly Loader2 = Loader2;

  q = signal<PublicQuote | null>(null);
  loading = signal(true);
  busy = signal(false);
  rejecting = signal(false);
  notice = signal('');
  reason = '';
  private token = '';

  ngOnInit() {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    const pago = this.route.snapshot.queryParamMap.get('pago');
    if (pago === 'pendiente') this.notice.set('Tu pago está en proceso. Te avisaremos en cuanto se confirme.');
    else if (pago === 'error') this.notice.set('El pago no se completó. Puedes intentarlo de nuevo.');
    else if (pago === 'ok') this.notice.set('¡Gracias! Estamos confirmando tu pago con Mercado Pago.');
    this.load();
  }

  load() {
    this.http.get<PublicQuote>(`${API}/${this.token}`).subscribe({
      next: (q) => { this.q.set(q); this.loading.set(false); },
      error: () => { this.q.set(null); this.loading.set(false); },
    });
  }

  async accept() {
    const d = this.q()!;
    const ok = await this.confirm.confirm({
      title: 'Aceptar cotización',
      message: `Confirmas la cotización ${d.number} de ${d.company.name} por S/ ${d.total.toFixed(2)}.`,
      confirmText: 'Aceptar',
    });
    if (!ok) return;
    this.act('accept', {}, 'Cotización aceptada');
  }

  reject() { this.act('reject', { reason: this.reason.trim() }, 'Cotización rechazada'); }

  private act(action: 'accept' | 'reject', body: object, done: string) {
    this.busy.set(true);
    this.http.post(`${API}/${this.token}/${action}`, body).subscribe({
      next: () => { this.busy.set(false); this.rejecting.set(false); this.toast.success(done); this.load(); },
      error: (err) => { this.busy.set(false); this.toast.error(err.error?.message || 'No se pudo completar'); this.load(); },
    });
  }

  pay() {
    this.busy.set(true);
    this.http.post<{ initPoint: string }>(`${API}/${this.token}/pay`, {}).subscribe({
      next: (r) => this.redirect(r.initPoint),
      error: (err) => { this.busy.set(false); this.toast.error(err.error?.message || 'No se pudo iniciar el pago'); },
    });
  }

  /** Separado para simularlo en las pruebas. */
  redirect(url: string) { window.location.assign(url); }
}
