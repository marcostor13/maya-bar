import { Component, OnInit, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { LucideAngularModule, RotateCw, Send } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { environment } from '../../../environments/environment';
import { RECEIPT_STATUS, money } from './billing-admin.shared';

interface QueueDoc { status?: string; error?: string; attempts?: number; series?: string; number?: number }
export interface QueuedPayment {
  _id: string;
  concept: string;
  amount: number;
  currency: string;
  paidAt: string;
  providerPaymentId?: string;
  receipt?: QueueDoc & { creditNote?: QueueDoc };
}

export interface EmailLog {
  _id: string;
  type: string;
  subject: string;
  to: string[];
  delivered?: string[];
  sentAt?: string;
  resends?: number;
  createdAt: string;
}

/** Comprobantes con error o en cola (HU49) y bitácora de correos (HU50), en HU57. */
@Component({
  selector: 'app-billing-queues',
  standalone: true,
  imports: [DatePipe, LucideAngularModule],
  template: `
    @if (mode() === 'receipts') {
      <div class="pills" role="radiogroup" aria-label="Comprobantes">
        <button type="button" class="pill" role="radio" [attr.aria-checked]="status() === 'failed'" [class.active]="status() === 'failed'" (click)="setStatus('failed')">Con error</button>
        <button type="button" class="pill" role="radio" [attr.aria-checked]="status() === 'pending'" [class.active]="status() === 'pending'" (click)="setStatus('pending')">En cola</button>
      </div>
      @if (loading()) { <p class="muted">Cargando…</p> }
      @else if (!receipts().length) { <div class="card empty"><p>{{ status() === 'failed' ? 'Ningún comprobante con error.' : 'No hay comprobantes en cola.' }}</p></div> }
      @else {
        <div class="table-card table-cards card">
          <table>
            <thead><tr><th>Fecha</th><th>Concepto</th><th>Monto</th><th>Documento</th><th>Error</th><th></th></tr></thead>
            <tbody>
              @for (p of receipts(); track p._id) {
                <tr [attr.data-receipt]="p._id">
                  <td data-label="Fecha">{{ p.paidAt | date: 'd MMM y' }}</td>
                  <td data-label="">{{ p.concept }}</td>
                  <td data-label="Monto">{{ money(p.amount, p.currency) }}</td>
                  <td data-label="Documento">{{ which(p).label }} <span class="badge" [class]="badge(which(p).doc?.status)">{{ statusLabel(which(p).doc?.status) }}</span></td>
                  <td data-label="Error" class="err">{{ which(p).doc?.error || '—' }}</td>
                  <td data-label="" class="actions">
                    @if (status() === 'failed') {
                      <button type="button" class="btn btn-secondary btn-sm" (click)="retry(p)"><lucide-icon [img]="RotateCw" [size]="14" /> Reintentar</button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    } @else {
      @if (loading()) { <p class="muted">Cargando…</p> }
      @else if (!emails().length) { <div class="card empty"><p>Aún no salió ningún correo de cobro.</p></div> }
      @else {
        <div class="table-card table-cards card">
          <table>
            <thead><tr><th>Fecha</th><th>Asunto</th><th>Para</th><th>Entregado</th><th></th></tr></thead>
            <tbody>
              @for (e of emails(); track e._id) {
                <tr [attr.data-email]="e._id">
                  <td data-label="Fecha">{{ (e.sentAt ?? e.createdAt) | date: 'd MMM y, HH:mm' }}</td>
                  <td data-label="">{{ e.subject }} <span class="muted small">· {{ e.type }}</span></td>
                  <td data-label="Para">{{ e.to.join(', ') }}</td>
                  <td data-label="Entregado">
                    <span class="badge" [class]="(e.delivered?.length ?? 0) >= e.to.length ? 'badge-success' : 'badge-warning'">{{ e.delivered?.length ?? 0 }} de {{ e.to.length }}</span>
                    @if (e.resends) { <span class="muted small">· {{ e.resends }} reenvíos</span> }
                  </td>
                  <td data-label="" class="actions">
                    <button type="button" class="btn btn-ghost btn-sm" (click)="resend(e)"><lucide-icon [img]="Send" [size]="14" /> Reenviar</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    }
  `,
  styles: [`
    .pills { display: flex; gap: 8px; margin-bottom: 16px; }
    .muted { color: var(--color-text-muted); }
    .small { font-size: 12px; }
    .empty { padding: 40px; text-align: center; color: var(--color-text-muted); }
    .err { color: var(--color-error); font-size: 13px; max-width: 320px; }
    .actions { white-space: nowrap; text-align: right; }
  `],
})
export class BillingQueuesComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private api = `${environment.apiUrl}/billing/admin`;
  readonly RotateCw = RotateCw;
  readonly Send = Send;
  readonly money = money;

  mode = input<'receipts' | 'emails'>('receipts');
  status = signal<'failed' | 'pending'>('failed');
  receipts = signal<QueuedPayment[]>([]);
  emails = signal<EmailLog[]>([]);
  loading = signal(true);

  ngOnInit() { this.load(); }

  setStatus(s: 'failed' | 'pending') { this.status.set(s); this.load(); }

  load() {
    this.loading.set(true);
    const fail = (err: { error?: { message?: string } }) => {
      this.loading.set(false);
      this.toast.error(err.error?.message || 'No se pudo cargar la lista');
    };
    if (this.mode() === 'receipts')
      this.http.get<QueuedPayment[]>(`${this.api}/receipts`, { params: { status: this.status() } }).subscribe({
        next: r => { this.receipts.set(r); this.loading.set(false); }, error: fail,
      });
    else
      this.http.get<EmailLog[]>(`${this.api}/emails`).subscribe({
        next: r => { this.emails.set(r); this.loading.set(false); }, error: fail,
      });
  }

  /** El documento que está en ese estado: el comprobante o su nota de crédito. */
  which(p: QueuedPayment): { label: string; doc?: QueueDoc } {
    const s = this.status();
    if (p.receipt?.creditNote?.status === s) return { label: 'Nota de crédito', doc: p.receipt.creditNote };
    return { label: 'Comprobante', doc: p.receipt };
  }
  badge(s?: string) { return RECEIPT_STATUS[s ?? '']?.badge ?? 'badge-neutral'; }
  statusLabel(s?: string) { return RECEIPT_STATUS[s ?? '']?.label ?? '—'; }

  retry(p: QueuedPayment) {
    this.http.post(`${this.api}/receipts/${p._id}/retry`, {}).subscribe({
      next: () => { this.toast.success('Comprobante en cola de nuevo'); this.load(); },
      error: err => this.toast.error(err.error?.message || 'No se pudo reintentar'),
    });
  }

  resend(e: EmailLog) {
    this.http.post(`${this.api}/emails/${e._id}/resend`, {}).subscribe({
      next: () => { this.toast.success('Correo reenviado'); this.load(); },
      error: err => this.toast.error(err.error?.message || 'No se pudo reenviar'),
    });
  }
}
