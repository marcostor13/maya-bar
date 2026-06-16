import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ToastService } from '../../shared/toast';
import { AuthService } from '../../auth/auth.service';
import { io, Socket } from 'socket.io-client';
import { LucideAngularModule, LayoutDashboard, CheckCircle2, MessageSquare } from 'lucide-angular';

import { environment } from '../../../environments/environment';
const API = environment.apiUrl;
const SLA_MINUTES = 15;

type OrderStatus = 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';

interface OrderItem {
  itemId: string; name: string; price: number; quantity: number;
  notes?: string; stations: string[]; subtotal: number;
}
interface Order {
  _id: string; tableNumber: string; type: string; status: OrderStatus;
  items: OrderItem[]; total: number; notes?: string; guestName?: string;
  callWaiter: boolean; callBill: boolean; createdAt: string;
}
interface Local { _id: string; name: string; }

const TYPE_LABELS: Record<string, string> = {
  'dine-in': 'Mesa', 'delivery': 'Delivery', 'takeaway': 'Para llevar',
};

@Component({
  selector: 'app-kds',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1>KDS — {{ stationLabel() }}</h1>
          <p class="subtitle">Pedidos activos de tu estación. Toca "Listo" para marcar.</p>
        </div>
        <div class="header-actions">
          <select class="input local-select" (change)="onLocalChange($event)" aria-label="Seleccionar local">
            <option value="">— Selecciona un local —</option>
            @for (l of locals(); track l._id) {
              <option [value]="l._id">{{ l.name }}</option>
            }
          </select>
          <div class="ws-indicator" [class.connected]="wsConnected()">
            <span class="ws-dot"></span>
            {{ wsConnected() ? 'En vivo' : 'Desconectado' }}
          </div>
        </div>
      </div>

      @if (!selectedLocalId()) {
        <div class="empty-state card">
          <div class="empty-icon"><lucide-icon [img]="LayoutDashboard" [size]="48" [strokeWidth]="2"></lucide-icon></div>
          <h3>Selecciona un local</h3>
          <p>Elige un local para ver tu estación de trabajo.</p>
        </div>
      } @else if (loading()) {
        <div class="kds-grid">
          @for (i of [1,2,3,4]; track i) { <div class="card skeleton-card"></div> }
        </div>
      } @else if (filteredOrders().length === 0) {
        <div class="empty-state card">
          <div class="empty-icon"><lucide-icon [img]="CheckCircle2" [size]="48" [strokeWidth]="1.5"></lucide-icon></div>
          <h3>Sin pedidos activos</h3>
          <p>Todo al día. Los nuevos pedidos aparecerán aquí.</p>
        </div>
      } @else {
        <div class="kds-grid">
          @for (order of filteredOrders(); track order._id) {
            <div class="kds-card card" [class.overdue]="isOverdue(order)" [class.preparing]="order.status === 'preparing'">
              <div class="kds-head">
                <div class="kds-table">
                  @if (order.type !== 'dine-in') {
                    <span class="type-badge type-{{ order.type }}">{{ typeLabel(order.type) }}</span>
                  }
                  Mesa {{ order.tableNumber }}
                </div>
                <div class="kds-meta">
                  <span class="kds-time" [class.overdue-time]="isOverdue(order)">
                    {{ elapsedLabel(order.createdAt) }}
                  </span>
                  <span class="status-dot" [class]="'dot-' + order.status"></span>
                </div>
              </div>

              @if (order.notes) {
                <div class="order-notes">
                  <lucide-icon [img]="MessageSquare" [size]="14" [strokeWidth]="2" style="margin-right: 4px; vertical-align: middle;"></lucide-icon>
                  {{ order.notes }}
                </div>
              }

              <div class="kds-items">
                @for (item of stationItems(order); track item.name) {
                  <div class="kds-item">
                    <span class="item-qty">{{ item.quantity }}×</span>
                    <div class="item-detail">
                      <span class="item-name">{{ item.name }}</span>
                      @if (item.notes) { <span class="item-notes">{{ item.notes }}</span> }
                    </div>
                  </div>
                }
              </div>

              <div class="kds-actions">
                @if (order.callWaiter) {
                  <span class="alert-badge">🔔 Mozo</span>
                }
                @if (order.callBill) {
                  <span class="alert-badge alert-bill">💳 Cuenta</span>
                }
                @if (nextStatus(order.status)) {
                  <button class="btn btn-primary bump-btn" (click)="advance(order)"
                    [attr.aria-label]="'Marcar ' + nextLabel(order.status)">
                    {{ nextLabel(order.status) }} ✓
                  </button>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; }
    .page { padding: 32px 40px; width: 100%; box-sizing: border-box; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; flex-wrap: wrap; gap: 12px; }
    .page-header h1 { margin-bottom: 4px; font-size: 26px; }
    .subtitle { color: var(--color-text-muted); font-size: 14px; margin: 0; }
    .header-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .local-select { min-width: 200px; }

    .ws-indicator { display: flex; align-items: center; gap: 6px; font-size: 12px;
      color: var(--color-text-muted); padding: 6px 12px; border-radius: var(--radius-pill);
      border: 1px solid var(--color-border); background: var(--color-white); }
    .ws-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-error);
      transition: background var(--transition-fast); }
    .ws-indicator.connected .ws-dot { background: var(--color-success); }
    .ws-indicator.connected { color: var(--color-success); }

    .kds-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }

    .kds-card { padding: 16px 20px; border-left: 4px solid var(--color-border);
      transition: border-color var(--transition-fast); }
    .kds-card.preparing { border-left-color: #3B82F6; }
    .kds-card.overdue { border-left-color: var(--color-error); background: #FFF5F5; }

    .kds-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
    .kds-table { font-size: 17px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
    .kds-meta { display: flex; align-items: center; gap: 8px; }
    .kds-time { font-size: 13px; color: var(--color-text-muted); font-weight: 600; }
    .kds-time.overdue-time { color: var(--color-error); }

    .status-dot { width: 10px; height: 10px; border-radius: 50%; }
    .dot-pending { background: #F59E0B; }
    .dot-preparing { background: #3B82F6; }
    .dot-ready { background: var(--color-success); }

    .type-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: var(--radius-pill); }
    .type-delivery { background: #EDE9FE; color: #7C3AED; }
    .type-takeaway { background: #FEF3C7; color: #D97706; }

    .order-notes { font-size: 12px; color: var(--color-text-muted); font-style: italic;
      margin-bottom: 10px; padding: 6px 10px; background: var(--color-bg-app);
      border-radius: var(--radius-sm); }

    .kds-items { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; }
    .kds-item { display: flex; gap: 10px; align-items: flex-start; }
    .item-qty { font-size: 18px; font-weight: 700; color: var(--color-brand);
      min-width: 28px; line-height: 1.3; }
    .item-detail { display: flex; flex-direction: column; }
    .item-name { font-size: 15px; font-weight: 600; }
    .item-notes { font-size: 12px; color: var(--color-text-muted); font-style: italic; }

    .kds-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      border-top: 1px solid var(--color-border); padding-top: 12px; }
    .alert-badge { font-size: 12px; font-weight: 600; padding: 4px 10px;
      border-radius: var(--radius-pill); background: #FEF3C7; color: #D97706; }
    .alert-bill { background: #EFF6FF; color: #3B82F6; }
    .bump-btn { margin-left: auto; padding: 10px 20px; font-size: 14px; }

    .skeleton-card { height: 200px; animation: shimmer 1.4s infinite;
      background: linear-gradient(90deg, #f0f0f0 25%, #fff 50%, #f0f0f0 75%);
      background-size: 400% 100%; }
    @keyframes shimmer { 0%{background-position:100% 0} 100%{background-position:-100% 0} }

    .empty-state { text-align: center; padding: 60px 40px; }
    .empty-icon { font-size: 40px; margin-bottom: 16px; }
    .empty-state h3 { margin-bottom: 8px; }
    .empty-state p { color: var(--color-text-muted); margin-bottom: 0; }
  `],
})
export class KdsComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private auth = inject(AuthService);

  loading = signal(true);
  orders = signal<Order[]>([]);
  locals = signal<Local[]>([]);
  selectedLocalId = signal('');
  wsConnected = signal(false);

  // Icons
  readonly LayoutDashboard = LayoutDashboard;
  readonly CheckCircle2 = CheckCircle2;
  readonly MessageSquare = MessageSquare;

  private socket: Socket | null = null;

  private role = computed(() => this.auth.currentUser()?.role ?? '');

  stationLabel = computed(() => {
    const r = this.role();
    if (r === 'KITCHEN') return 'Cocina';
    if (r === 'BAR') return 'Bar';
    return 'General';
  });

  private station = computed(() => {
    const r = this.role();
    if (r === 'KITCHEN') return 'kitchen';
    if (r === 'BAR') return 'bar';
    return null;
  });

  filteredOrders = computed(() =>
    this.orders()
      .filter((o) => o.status === 'pending' || o.status === 'preparing')
      .filter((o) => {
        const st = this.station();
        if (!st) return true;
        return o.items.some((i) => i.stations.includes(st));
      })
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
  );

  ngOnInit() {
    this.loadLocals();
  }

  ngOnDestroy() {
    this.disconnectWs();
  }

  loadLocals() {
    this.http.get<Local[]>(`${API}/locals`).subscribe({
      next: (data) => {
        this.locals.set(data);
        if (data.length > 0) {
          this.selectedLocalId.set(data[0]._id);
          this.loadOrders();
          this.connectWs(data[0]._id);
        } else {
          this.loading.set(false);
        }
      },
      error: () => this.loading.set(false),
    });
  }

  onLocalChange(event: Event) {
    const id = (event.target as HTMLSelectElement).value;
    this.selectedLocalId.set(id);
    this.disconnectWs();
    if (id) {
      this.loadOrders();
      this.connectWs(id);
    }
  }

  loadOrders() {
    const localId = this.selectedLocalId();
    if (!localId) return;
    this.loading.set(true);
    this.http.get<Order[]>(`${API}/orders`, { params: { localId } }).subscribe({
      next: (data) => { this.orders.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  private connectWs(localId: string) {
    const user = this.auth.currentUser();
    if (!user?.tenantId) return;
    this.socket = io(`${API}/orders`, {
      query: { tenantId: user.tenantId, localId },
      transports: ['websocket'],
    });
    this.socket.on('connect', () => this.wsConnected.set(true));
    this.socket.on('disconnect', () => this.wsConnected.set(false));
    this.socket.on('order:new', (order: Order) => {
      this.orders.update((prev) => [order, ...prev]);
    });
    this.socket.on('order:updated', (updated: Order) => {
      this.orders.update((prev) =>
        prev.map((o) => (o._id === updated._id ? updated : o)),
      );
    });
  }

  private disconnectWs() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.wsConnected.set(false);
    }
  }

  stationItems(order: Order): OrderItem[] {
    const st = this.station();
    if (!st) return order.items;
    return order.items.filter((i) => i.stations.includes(st));
  }

  isOverdue(order: Order): boolean {
    const age = (Date.now() - new Date(order.createdAt).getTime()) / 60000;
    return age > SLA_MINUTES;
  }

  elapsedLabel(createdAt: string): string {
    const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
    if (mins < 1) return '< 1 min';
    return `${mins} min`;
  }

  typeLabel(type: string): string {
    return TYPE_LABELS[type] ?? type;
  }

  nextStatus(status: OrderStatus): OrderStatus | null {
    if (status === 'pending') return 'preparing';
    if (status === 'preparing') return 'ready';
    return null;
  }

  nextLabel(status: OrderStatus): string {
    if (status === 'pending') return 'Preparando';
    if (status === 'preparing') return 'Listo';
    return '';
  }

  advance(order: Order) {
    const next = this.nextStatus(order.status);
    if (!next) return;
    this.http.patch(`${API}/orders/${order._id}/status`, { status: next }).subscribe({
      next: () => this.toast.success(`Pedido → ${this.nextLabel(order.status)}`),
      error: () => this.toast.error('Error al actualizar estado'),
    });
  }
}
