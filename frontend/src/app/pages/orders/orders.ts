import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { AuthService } from '../../auth/auth.service';
import { io, Socket } from 'socket.io-client';
import { LucideAngularModule, ArrowLeft, QrCode, ClipboardList } from 'lucide-angular';

import { environment } from '../../../environments/environment';
const API = environment.apiUrl;

type OrderStatus = 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';

interface OrderItem { itemId: string; name: string; quantity: number; price: number; subtotal: number; notes?: string; stations: string[]; }
interface Order {
  _id: string; tableNumber: string; type: string; status: OrderStatus;
  items: OrderItem[]; subtotal: number; total: number;
  notes?: string; guestName?: string; callWaiter: boolean; callBill: boolean; createdAt: string;
}
interface TableQr { number: number; name: string; qrUrl: string; qrDataUrl?: string; }
interface Local { _id: string; name: string; tableCount: number; }

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pendiente', preparing: 'En preparación', ready: 'Listo',
  served: 'Servido', cancelled: 'Cancelado',
};
const STATUS_NEXT: Partial<Record<OrderStatus, OrderStatus>> = {
  pending: 'preparing', preparing: 'ready', ready: 'served',
};
const TYPE_LABELS: Record<string, string> = {
  'dine-in': 'Mesa', 'delivery': 'Delivery', 'takeaway': 'Para llevar',
};

@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [DatePipe, LucideAngularModule],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1>Pedidos</h1>
          <p class="subtitle">Cola de pedidos en tiempo real.</p>
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
          @if (selectedLocalId() && canManageQr()) {
            <button class="btn btn-secondary btn-sm" (click)="toggleQrTab()">
              @if (showQrTab()) {
                <lucide-icon [img]="ArrowLeft" [size]="16"></lucide-icon> Cola
              } @else {
                <lucide-icon [img]="QrCode" [size]="16"></lucide-icon> Mesas QR
              }
            </button>
          }
        </div>
      </div>

      @if (!selectedLocalId()) {
        <div class="splash card">
          <div class="empty-icon"><lucide-icon [img]="ClipboardList" [size]="48" [strokeWidth]="2"></lucide-icon></div>
          <h3>Selecciona un local</h3>
          <p>Elige un local del selector para ver sus pedidos y mesas.</p>
        </div>
      } @else if (showQrTab()) {
        <!-- QR Tables -->
        <div class="qr-section">
          <div class="qr-toolbar">
            @if (tables().length) {
              <button class="btn btn-secondary" (click)="printQrs()" aria-label="Imprimir QR de mesas">Imprimir QRs</button>
            }
          </div>
          @if (loadingTables()) {
            <div class="loading-state">Generando QR...</div>
          } @else if (tables().length === 0) {
            <div class="empty-state">
              <div class="empty-icon"><lucide-icon [img]="QrCode" [size]="32" [strokeWidth]="2"></lucide-icon></div>
              <p>No hay mesas configuradas. Crea una mesa para generar su QR.</p>
            </div>
          } @else {
            <div class="tables-grid" id="qr-print-area">
              @for (t of tables(); track t.number) {
                <div class="table-card card">
                  <div class="table-number">{{ t.name }}</div>
                  @if (t.qrDataUrl) {
                    <img [src]="t.qrDataUrl" [alt]="'QR ' + t.name" class="qr-img" />
                  } @else {
                    <div class="qr-placeholder">...</div>
                  }
                  <div class="qr-url-wrap">
                    <span class="qr-url-text">{{ t.qrUrl }}</span>
                    <button class="copy-btn" (click)="copyUrl(t.qrUrl)" aria-label="Copiar URL del QR">Copiar</button>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      } @else {
        <!-- Orders queue -->
        <div class="status-tabs">
          @for (tab of statusTabs; track tab.value) {
            <button class="tab-btn" [class.active]="activeTab() === tab.value"
              (click)="activeTab.set(tab.value)">
              {{ tab.label }}
              @if (countByStatus(tab.value) > 0) {
                <span class="tab-count">{{ countByStatus(tab.value) }}</span>
              }
            </button>
          }
        </div>

        @if (loading()) {
          <div class="orders-grid">
            @for (i of [1,2,3]; track i) { <div class="card skeleton-order"></div> }
          </div>
        } @else if (filteredOrders().length === 0) {
          <div class="empty-state">
            <div class="empty-icon"><lucide-icon [img]="ClipboardList" [size]="32" [strokeWidth]="2"></lucide-icon></div>
            <p>No hay pedidos en esta cola.</p>
          </div>
        } @else {
          <div class="orders-grid">
            @for (order of filteredOrders(); track order._id) {
              <div class="order-card card" [class]="'order-card--' + order.status">
                <div class="order-head">
                  <div class="order-table">
                    @if (order.type !== 'dine-in') {
                      <span class="type-badge type-{{ order.type }}">{{ typeLabel(order.type) }}</span>
                    }
                    Mesa {{ order.tableNumber }}
                  </div>
                  <div class="order-badges">
                    @if (order.callWaiter) {
                      <span class="badge badge-waiter">🔔 Mozo</span>
                    }
                    @if (order.callBill) {
                      <span class="badge badge-bill">💳 Cuenta</span>
                    }
                    <span class="badge" [class]="'badge-status-' + order.status">
                      {{ statusLabel(order.status) }}
                    </span>
                  </div>
                </div>
                @if (order.notes) {
                  <div class="order-notes">📝 {{ order.notes }}</div>
                }
                <div class="order-items">
                  @for (item of order.items; track item.name) {
                    <div class="order-item-row">
                      <span class="item-qty">{{ item.quantity }}×</span>
                      <span class="item-name">{{ item.name }}</span>
                      @if (item.notes) { <span class="item-notes">— {{ item.notes }}</span> }
                    </div>
                  }
                </div>
                <div class="order-foot">
                  <span class="order-time">{{ order.createdAt | date:'HH:mm' }}</span>
                  <span class="order-total">S/. {{ order.total.toFixed(2) }}</span>
                  <div class="order-actions">
                    @if (canAdvance()) {
                      @if (nextStatus(order.status)) {
                        <button class="btn btn-primary btn-sm" (click)="advance(order)"
                          [attr.aria-label]="'Avanzar a ' + statusLabel(nextStatus(order.status)!)">
                          {{ statusLabel(nextStatus(order.status)!) }} →
                        </button>
                      }
                    }
                    @if (canCancel() && order.status !== 'cancelled' && order.status !== 'served') {
                      <button class="btn btn-danger btn-sm" (click)="cancel(order)"
                        aria-label="Cancelar pedido">Cancelar</button>
                    }
                  </div>
                </div>
              </div>
            }
          </div>
        }
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
    .local-select { min-width: 220px; }

    .ws-indicator { display: flex; align-items: center; gap: 6px; font-size: 12px;
      color: var(--color-text-muted); padding: 6px 12px; border-radius: var(--radius-pill);
      border: 1px solid var(--color-border); background: var(--color-white); }
    .ws-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-error);
      transition: background var(--transition-fast); }
    .ws-indicator.connected .ws-dot { background: var(--color-success); }
    .ws-indicator.connected { color: var(--color-success); }

    .status-tabs { display: flex; gap: 2px; margin-bottom: 20px; border-bottom: 1px solid var(--color-border); flex-wrap: wrap; }
    .tab-btn { padding: 8px 16px; border: none; background: none; cursor: pointer; font-size: 14px;
      font-weight: 500; color: var(--color-text-muted); border-bottom: 2px solid transparent;
      margin-bottom: -1px; display: flex; align-items: center; gap: 6px; transition: all var(--transition-fast); }
    .tab-btn.active { color: var(--color-brand); border-bottom-color: var(--color-brand); }
    .tab-btn:hover:not(.active) { color: var(--color-text-main); }
    .tab-count { background: var(--color-brand); color: white; font-size: 11px; font-weight: 700;
      padding: 1px 6px; border-radius: 20px; }

    .orders-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
    .order-card { padding: 16px 20px; }
    .order-card--pending { border-left: 3px solid #F59E0B; }
    .order-card--preparing { border-left: 3px solid #3B82F6; }
    .order-card--ready { border-left: 3px solid var(--color-success); }
    .order-card--served { border-left: 3px solid var(--color-text-muted); }
    .order-card--cancelled { border-left: 3px solid var(--color-error); opacity: 0.7; }

    .order-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .order-table { font-size: 16px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
    .order-badges { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }

    .type-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: var(--radius-pill); }
    .type-delivery { background: #EDE9FE; color: #7C3AED; }
    .type-takeaway { background: #FEF3C7; color: #D97706; }

    .order-notes { font-size: 12px; color: var(--color-text-muted); font-style: italic;
      margin-bottom: 8px; padding: 4px 8px; background: var(--color-bg-app); border-radius: var(--radius-sm); }

    .badge { display: inline-block; padding: 2px 7px; border-radius: 20px; font-size: 11px; font-weight: 600; }
    .badge-waiter { background: #FEF3C7; color: #D97706; }
    .badge-bill { background: #EFF6FF; color: var(--color-ai); }
    .badge-status-pending { background: #FEF3C7; color: #D97706; }
    .badge-status-preparing { background: #EFF6FF; color: #3B82F6; }
    .badge-status-ready { background: #F0FDF4; color: var(--color-success); }
    .badge-status-served { background: var(--color-bg-app); color: var(--color-text-muted); }
    .badge-status-cancelled { background: #FEF2F2; color: var(--color-error); }

    .order-items { display: flex; flex-direction: column; gap: 3px; margin-bottom: 10px; }
    .order-item-row { display: flex; gap: 6px; font-size: 13px; }
    .item-qty { font-weight: 700; color: var(--color-brand); min-width: 20px; }
    .item-name { font-weight: 500; }
    .item-notes { color: var(--color-text-muted); font-style: italic; }

    .order-foot { display: flex; align-items: center; gap: 8px; border-top: 1px solid var(--color-border); padding-top: 10px; }
    .order-time { font-size: 12px; color: var(--color-text-muted); }
    .order-total { font-size: 14px; font-weight: 600; margin-left: auto; }
    .order-actions { display: flex; gap: 6px; }

    .skeleton-order { height: 160px; animation: shimmer 1.4s infinite;
      background: linear-gradient(90deg, #f0f0f0 25%, #fff 50%, #f0f0f0 75%);
      background-size: 400% 100%; }
    @keyframes shimmer { 0%{background-position:100% 0} 100%{background-position:-100% 0} }

    .qr-section { }
    .qr-toolbar { display: flex; gap: 10px; margin-bottom: 20px; }
    .tables-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
    .table-card { padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
    .table-number { font-size: 15px; font-weight: 600; }
    .qr-img { width: 160px; height: 160px; }
    .qr-placeholder { width: 160px; height: 160px; background: var(--color-bg-app);
      border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center;
      font-size: 12px; color: var(--color-text-muted); }
    .qr-url-wrap { display: flex; gap: 6px; align-items: center; width: 100%; }
    .qr-url-text { font-size: 10px; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; flex: 1; }
    .copy-btn { background: none; border: 1px solid var(--color-border); border-radius: var(--radius-sm);
      padding: 2px 8px; font-size: 11px; cursor: pointer; color: var(--color-text-muted);
      transition: all var(--transition-fast); white-space: nowrap; }
    .copy-btn:hover { background: var(--color-brand); color: white; border-color: var(--color-brand); }

    .loading-state { padding: 60px; text-align: center; color: var(--color-text-muted); }
    .empty-state { text-align: center; padding: 60px 40px; }
    .empty-icon { font-size: 40px; margin-bottom: 16px; }
    .empty-state h3 { margin-bottom: 8px; }
    .empty-state p { color: var(--color-text-muted); margin-bottom: 0; }
    .splash { text-align: center; padding: 60px 40px; }

    @media print {
      .page-header, .status-tabs, .header-actions, .qr-toolbar { display: none; }
      .tables-grid { grid-template-columns: repeat(4, 1fr); }
    }
  `],
})
export class OrdersComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private auth = inject(AuthService);

  private role = computed(() => this.auth.currentUser()?.role ?? '');
  canManageQr  = computed(() => ['TENANT_ADMIN', 'MANAGER'].includes(this.role()));
  canAdvance   = computed(() => ['TENANT_ADMIN', 'MANAGER', 'SERVER', 'KITCHEN', 'BAR'].includes(this.role()));
  canCancel    = computed(() => ['TENANT_ADMIN', 'MANAGER'].includes(this.role()));

  loading = signal(true);
  orders = signal<Order[]>([]);
  locals = signal<Local[]>([]);
  selectedLocalId = signal('');
  activeTab = signal<string>('all');
  showQrTab = signal(false);
  
  // Icons
  readonly ArrowLeft = ArrowLeft;
  readonly QrCode = QrCode;
  readonly ClipboardList = ClipboardList;

  tables = signal<TableQr[]>([]);
  loadingTables = signal(false);
  wsConnected = signal(false);

  private socket: Socket | null = null;

  readonly statusTabs = [
    { value: 'all', label: 'Todos' },
    { value: 'pending', label: 'Pendientes' },
    { value: 'preparing', label: 'En prep.' },
    { value: 'ready', label: 'Listos' },
    { value: 'served', label: 'Servidos' },
  ];

  filteredOrders = computed(() => {
    const tab = this.activeTab();
    const all = this.orders();
    return tab === 'all' ? all : all.filter((o) => o.status === tab);
  });

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
    this.tables.set([]);
    this.showQrTab.set(false);
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

  countByStatus(tab: string): number {
    if (tab === 'all') return 0;
    return this.orders().filter((o) => o.status === tab).length;
  }

  statusLabel(s: string): string {
    return STATUS_LABELS[s as OrderStatus] ?? s;
  }

  typeLabel(type: string): string {
    return TYPE_LABELS[type] ?? type;
  }

  nextStatus(s: OrderStatus): OrderStatus | undefined {
    return STATUS_NEXT[s];
  }

  advance(order: Order) {
    const next = this.nextStatus(order.status);
    if (!next) return;
    this.http.patch(`${API}/orders/${order._id}/status`, { status: next }).subscribe({
      next: () => this.toast.success(`Pedido → ${this.statusLabel(next)}`),
      error: () => this.toast.error('Error al actualizar estado'),
    });
  }

  async cancel(order: Order) {
    const ok = await this.confirm.confirm({
      title: '¿Cancelar pedido?',
      message: `Mesa ${order.tableNumber} — ${order.items.length} ítem(s). Esta acción no se puede deshacer.`,
      confirmText: 'Cancelar pedido',
      danger: true,
    });
    if (!ok) return;
    this.http.delete(`${API}/orders/${order._id}`).subscribe({
      next: () => this.toast.success('Pedido cancelado'),
      error: () => this.toast.error('Error al cancelar'),
    });
  }

  toggleQrTab() {
    const next = !this.showQrTab();
    this.showQrTab.set(next);
    if (next && this.tables().length === 0) this.loadTablesForLocal();
  }

  loadTablesForLocal() {
    const localId = this.selectedLocalId();
    if (!localId) return;
    this.loadingTables.set(true);
    this.http
      .get<TableQr[]>(`${API}/orders/tables`, { params: { localId } })
      .subscribe({
        next: async (data) => {
          this.loadingTables.set(false);
          const withQr = await Promise.all(
            data.map(async (t) => ({ ...t, qrDataUrl: await this.generateQr(t.qrUrl) })),
          );
          this.tables.set(withQr);
        },
        error: () => { this.loadingTables.set(false); this.toast.error('Error al cargar mesas'); },
      });
  }

  private async generateQr(url: string): Promise<string> {
    try {
      const QRCode = await import('qrcode');
      return await QRCode.default.toDataURL(url, { width: 200, margin: 1 });
    } catch {
      return '';
    }
  }

  copyUrl(url: string) {
    navigator.clipboard.writeText(url).catch(() => undefined);
    this.toast.success('URL copiada');
  }

  printQrs() {
    window.print();
  }
}
