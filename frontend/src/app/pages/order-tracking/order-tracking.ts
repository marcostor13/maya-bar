import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';

import { environment } from '../../../environments/environment';
const API = environment.apiUrl;

type OrderStatus = 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';

interface StatusEntry { status: OrderStatus; at: string; }
interface OrderItem { name: string; quantity: number; price: number; subtotal: number; notes?: string; }
interface Order {
  _id: string; tableNumber: string; type: string; status: OrderStatus;
  items: OrderItem[]; subtotal: number; total: number;
  statusHistory: StatusEntry[]; callWaiter: boolean; callBill: boolean; createdAt: string;
}

const STATUS_CONFIG: Record<OrderStatus, { label: string; icon: string; color: string }> = {
  pending:   { label: 'Recibido',        icon: '◉', color: '#F59E0B' },
  preparing: { label: 'En preparación',  icon: '◉', color: '#3B82F6' },
  ready:     { label: 'Listo',           icon: '◉', color: '#22C55E' },
  served:    { label: 'Servido',         icon: '✓', color: '#6B7280' },
  cancelled: { label: 'Cancelado',       icon: '✕', color: '#EF4444' },
};

const TIMELINE_STEPS: OrderStatus[] = ['pending', 'preparing', 'ready', 'served'];

@Component({
  selector: 'app-order-tracking',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="track-page">
      @if (loading()) {
        <div class="track-loading">
          <div class="spinner"></div>
          <p>Cargando pedido...</p>
        </div>
      } @else if (!order()) {
        <div class="track-error">
          <div class="err-icon">✕</div>
          <h2>Pedido no encontrado</h2>
          <p>Verifica el enlace y vuelve a intentarlo.</p>
        </div>
      } @else {
        <header class="track-header">
          <div class="track-title">Estado de tu pedido</div>
          <div class="track-table">Mesa {{ order()!.tableNumber }}</div>
        </header>

        <!-- Status indicator -->
        <div class="status-card">
          @if (order()!.status !== 'cancelled') {
            <div class="timeline">
              @for (step of timelineSteps; track step; let i = $index) {
                <div class="timeline-step" [class.done]="stepDone(step)" [class.active]="order()!.status === step">
                  <div class="step-dot" [style.background]="stepDone(step) ? '#22C55E' : (order()!.status === step ? statusCfg(step).color : '#E2E8F0')">
                    @if (stepDone(step) && order()!.status !== step) { ✓ } @else { {{ i + 1 }} }
                  </div>
                  <div class="step-label">{{ statusCfg(step).label }}</div>
                </div>
                @if (i < timelineSteps.length - 1) {
                  <div class="timeline-line" [class.done]="stepIndex(order()!.status) > i"></div>
                }
              }
            </div>
          } @else {
            <div class="cancelled-banner">
              <span class="cancel-icon">✕</span>
              <span>Pedido cancelado</span>
            </div>
          }
        </div>

        <!-- Items -->
        <div class="items-card card">
          <div class="items-title">Tu pedido</div>
          @for (item of order()!.items; track item.name) {
            <div class="track-item-row">
              <span class="track-qty">{{ item.quantity }}×</span>
              <span class="track-name">{{ item.name }}</span>
              @if (item.notes) { <span class="track-notes">{{ item.notes }}</span> }
              <span class="track-price">S/. {{ item.subtotal.toFixed(2) }}</span>
            </div>
          }
          <div class="total-row">
            <span>Total</span>
            <span class="total-amount">S/. {{ order()!.total.toFixed(2) }}</span>
          </div>
        </div>

        <!-- Action buttons -->
        @if (order()!.status !== 'cancelled' && order()!.status !== 'served') {
          <div class="track-actions">
            <button
              class="action-btn action-waiter"
              [disabled]="order()!.callWaiter || callingWaiter()"
              (click)="callWaiter()"
              aria-label="Llamar al mozo"
            >
              🔔 {{ order()!.callWaiter ? 'Mozo notificado' : 'Llamar al mozo' }}
            </button>
            <button
              class="action-btn action-bill"
              [disabled]="order()!.callBill || callingBill()"
              (click)="callBill()"
              aria-label="Pedir la cuenta"
            >
              💳 {{ order()!.callBill ? 'Cuenta en camino' : 'Pedir la cuenta' }}
            </button>
          </div>
        }

        <!-- History -->
        <div class="history-card card">
          <div class="history-title">Historial</div>
          @for (entry of order()!.statusHistory; track entry.at) {
            <div class="history-row">
              <span class="hist-label">{{ statusCfg(entry.status).label }}</span>
              <span class="hist-time">{{ entry.at | date:'HH:mm:ss' }}</span>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .track-page { min-height: 100vh; background: var(--color-bg-light); padding: 0 0 40px; }

    .track-loading, .track-error { display: flex; flex-direction: column; align-items: center;
      justify-content: center; min-height: 100vh; gap: 16px; color: var(--color-text-muted); }
    .spinner { width: 36px; height: 36px; border: 3px solid var(--color-border); border-top-color: var(--color-brand);
      border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .err-icon { font-size: 40px; color: var(--color-error); }

    .track-header { background: white; padding: 16px 20px; border-bottom: 1px solid var(--color-border);
      display: flex; align-items: center; justify-content: space-between; }
    .track-title { font-size: 16px; font-weight: 700; }
    .track-table { font-size: 13px; font-weight: 600; color: var(--color-brand);
      background: var(--color-brand-light); padding: 4px 10px; border-radius: 20px; }

    .status-card { background: white; margin: 16px; border-radius: var(--radius-md);
      padding: 24px 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
    .timeline { display: flex; align-items: flex-start; gap: 0; }
    .timeline-step { display: flex; flex-direction: column; align-items: center; gap: 6px; flex: 1; }
    .step-dot { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center;
      justify-content: center; font-size: 12px; font-weight: 600; color: white;
      transition: background 0.3s; }
    .step-label { font-size: 11px; color: var(--color-text-muted); text-align: center; line-height: 1.3; }
    .timeline-step.active .step-label { color: var(--color-text-main); font-weight: 600; }
    .timeline-line { flex: 1; height: 2px; background: #E2E8F0; margin-top: 13px; transition: background 0.3s; }
    .timeline-line.done { background: #22C55E; }

    .cancelled-banner { display: flex; align-items: center; gap: 10px; color: var(--color-error);
      font-weight: 600; font-size: 16px; justify-content: center; }
    .cancel-icon { font-size: 20px; }

    .items-card, .history-card { margin: 12px 16px; padding: 16px 20px; }
    .items-title, .history-title { font-size: 13px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.06em; color: var(--color-text-muted); margin-bottom: 12px; }
    .track-item-row { display: flex; align-items: baseline; gap: 8px; padding: 6px 0;
      border-bottom: 1px solid var(--color-border); font-size: 14px; }
    .track-item-row:last-of-type { border-bottom: none; }
    .track-qty { font-weight: 700; color: var(--color-brand); min-width: 20px; }
    .track-name { flex: 1; font-weight: 500; }
    .track-notes { font-size: 12px; color: var(--color-text-muted); font-style: italic; }
    .track-price { font-weight: 600; }
    .total-row { display: flex; justify-content: space-between; padding-top: 10px;
      margin-top: 4px; border-top: 1px solid var(--color-border); font-weight: 600; }
    .total-amount { font-size: 16px; font-weight: 700; color: var(--color-brand); }

    .track-actions { margin: 12px 16px; display: flex; flex-direction: column; gap: 10px; }
    .action-btn { padding: 14px; border-radius: var(--radius-md); border: none; cursor: pointer;
      font-size: 15px; font-weight: 600; transition: all var(--transition-fast); }
    .action-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .action-waiter { background: #FEF3C7; color: #D97706; }
    .action-waiter:hover:not(:disabled) { background: #FDE68A; }
    .action-bill { background: #EFF6FF; color: #3B82F6; }
    .action-bill:hover:not(:disabled) { background: #DBEAFE; }

    .history-row { display: flex; justify-content: space-between; padding: 6px 0;
      border-bottom: 1px solid var(--color-border); font-size: 13px; }
    .history-row:last-child { border-bottom: none; }
    .hist-label { font-weight: 500; }
    .hist-time { color: var(--color-text-muted); }
  `],
})
export class OrderTrackingComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);

  loading = signal(true);
  order = signal<Order | null>(null);
  callingWaiter = signal(false);
  callingBill = signal(false);

  readonly timelineSteps = TIMELINE_STEPS;

  private pollTimer?: ReturnType<typeof setInterval>;

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('orderId') ?? '';
    this.loadOrder(id);
    this.pollTimer = setInterval(() => this.loadOrder(id), 15_000);
  }

  ngOnDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  loadOrder(id: string) {
    this.http.get<Order>(`${API}/public/orders/${id}`).subscribe({
      next: (data) => { this.order.set(data); this.loading.set(false); },
      error: () => { this.order.set(null); this.loading.set(false); },
    });
  }

  statusCfg(status: OrderStatus | string) {
    return STATUS_CONFIG[status as OrderStatus] ?? STATUS_CONFIG.pending;
  }

  stepDone(step: OrderStatus): boolean {
    const current = this.order()?.status ?? 'pending';
    return this.stepIndex(current) >= this.stepIndex(step);
  }

  stepIndex(status: OrderStatus | string): number {
    return TIMELINE_STEPS.indexOf(status as OrderStatus);
  }

  callWaiter() {
    const id = this.order()?._id;
    if (!id) return;
    this.callingWaiter.set(true);
    this.http.post(`${API}/public/orders/${id}/call-waiter`, {}).subscribe({
      next: () => {
        this.callingWaiter.set(false);
        this.order.update((o) => o ? { ...o, callWaiter: true } : o);
      },
      error: () => this.callingWaiter.set(false),
    });
  }

  callBill() {
    const id = this.order()?._id;
    if (!id) return;
    this.callingBill.set(true);
    this.http.post(`${API}/public/orders/${id}/call-bill`, {}).subscribe({
      next: () => {
        this.callingBill.set(false);
        this.order.update((o) => o ? { ...o, callBill: true } : o);
      },
      error: () => this.callingBill.set(false),
    });
  }
}
