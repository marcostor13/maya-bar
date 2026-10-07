import { Component, HostListener, OnDestroy, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  LucideAngularModule, X, CheckCircle2, Clock, AlertCircle, MinusCircle, ChevronLeft, ChevronRight,
  BarChart3, RefreshCw,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { CampaignsApiService } from '../../core/api/campaigns-api.service';
import {
  Campaign, CampaignRecipient, CampaignStats, RecipientStatus,
} from '../../shared/models/campaign.model';

const STATUS_LABELS: Record<RecipientStatus, string> = {
  pending: 'Pendiente',
  sent: 'Enviado',
  failed: 'Fallido',
  skipped: 'Omitido',
};

/** Detalle de envío de una campaña de email o SMS: qué pasó con cada destinatario. */
@Component({
  selector: 'app-campaign-recipients',
  standalone: true,
  imports: [LucideAngularModule, DatePipe, RouterLink],
  template: `
    <div class="overlay" (click)="closed.emit()" role="dialog" aria-modal="true" aria-label="Destinatarios de la campaña">
      <aside class="drawer" (click)="$event.stopPropagation()">
        <div class="drawer-header">
          <div class="head-text">
            <h2>{{ campaign().name }}</h2>
            <p>{{ campaign().type === 'sms' ? 'SMS' : 'Email' }} · detalle de envío</p>
          </div>
          <button class="btn btn-ghost btn-icon" (click)="closed.emit()" aria-label="Cerrar">
            <lucide-icon [img]="X" [size]="20"></lucide-icon>
          </button>
        </div>

        @if (stats(); as s) {
          <div class="progress" role="progressbar" [attr.aria-valuenow]="percent()" aria-valuemin="0" aria-valuemax="100">
            <div class="bar sent" [style.width.%]="share(s.sent)"></div>
            <div class="bar failed" [style.width.%]="share(s.failed)"></div>
            <div class="bar skipped" [style.width.%]="share(s.skipped)"></div>
          </div>
          <div class="tiles">
            <button class="tile" [class.active]="filter() === ''" (click)="setFilter('')">
              <span class="tile-value">{{ s.total }}</span><span class="tile-label">Total</span>
            </button>
            <button class="tile" [class.active]="filter() === 'sent'" (click)="setFilter('sent')">
              <span class="tile-value ok">{{ s.sent }}</span><span class="tile-label">Enviados</span>
            </button>
            <button class="tile" [class.active]="filter() === 'pending'" (click)="setFilter('pending')">
              <span class="tile-value">{{ s.pending }}</span><span class="tile-label">Pendientes</span>
            </button>
            <button class="tile" [class.active]="filter() === 'failed'" (click)="setFilter('failed')">
              <span class="tile-value bad">{{ s.failed }}</span><span class="tile-label">Fallidos</span>
            </button>
            <button class="tile" [class.active]="filter() === 'skipped'" (click)="setFilter('skipped')">
              <span class="tile-value muted">{{ s.skipped }}</span><span class="tile-label">Omitidos</span>
            </button>
          </div>
        }

        @if (campaign().linkUrl) {
          <a class="btn btn-secondary btn-sm clicks-link" routerLink="/links/analitica"
            [queryParams]="{ campaignId: campaign()._id }">
            <lucide-icon [img]="BarChart3" [size]="14"></lucide-icon>
            Ver quién hizo clic en el link
          </a>
        }

        <div class="drawer-body">
          @if (loading()) {
            <p class="muted center">
              <lucide-icon [img]="RefreshCw" [size]="16" class="spin"></lucide-icon> Cargando…
            </p>
          } @else if (!items().length) {
            <p class="muted center">No hay destinatarios con este estado.</p>
          } @else {
            <ul class="rows">
              @for (r of items(); track r._id) {
                <li class="row">
                  <lucide-icon [img]="icon(r.status)" [size]="16" [class]="'st-' + r.status"></lucide-icon>
                  <div class="row-main">
                    <span class="row-name">{{ r.name || r.to || 'Sin nombre' }}</span>
                    <span class="row-sub">{{ r.to || '—' }}</span>
                    @if (r.error) { <span class="row-error">{{ r.error }}</span> }
                  </div>
                  <div class="row-side">
                    <span class="badge" [class]="'badge ' + badge(r.status)">{{ label(r.status) }}</span>
                    @if (r.sentAt) { <span class="row-date">{{ r.sentAt | date: 'dd/MM HH:mm' }}</span> }
                  </div>
                </li>
              }
            </ul>
          }
        </div>

        <div class="drawer-footer">
          <button class="btn btn-ghost btn-sm btn-icon" (click)="go(page() - 1)" [disabled]="page() <= 1" aria-label="Página anterior">
            <lucide-icon [img]="ChevronLeft" [size]="16"></lucide-icon>
          </button>
          <span class="muted">Página {{ page() }} de {{ pages() }} · {{ total() }} destinatario(s)</span>
          <button class="btn btn-ghost btn-sm btn-icon" (click)="go(page() + 1)" [disabled]="page() >= pages()" aria-label="Página siguiente">
            <lucide-icon [img]="ChevronRight" [size]="16"></lucide-icon>
          </button>
        </div>
      </aside>
    </div>
  `,
  styles: [`
    .overlay { position:fixed; inset:0; background:rgba(15,23,42,0.45); backdrop-filter:blur(3px); display:flex;
      justify-content:flex-end; z-index:100; }
    .drawer { width:100%; max-width:560px; height:100%; background:var(--color-white); display:flex; flex-direction:column;
      box-shadow:var(--shadow-lg); animation:slide-in .35s var(--transition-spring); }
    @keyframes slide-in { from { transform:translateX(40px); opacity:0; } to { transform:none; opacity:1; } }
    .drawer-header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding:24px 28px 16px; }
    .head-text { min-width:0; }
    .head-text h2 { margin:0; font-family:var(--font-heading); font-size:20px; overflow-wrap:anywhere; }
    .head-text p { margin:4px 0 0; font-size:13px; color:var(--color-text-muted); }
    .progress { display:flex; height:8px; margin:0 28px; border-radius:var(--radius-pill); background:var(--color-bg-light); overflow:hidden; }
    .bar { height:100%; transition:width var(--transition-smooth); }
    .bar.sent { background:var(--color-success); }
    .bar.failed { background:var(--color-error); }
    .bar.skipped { background:var(--color-border); }
    .tiles { display:grid; grid-template-columns:repeat(5, 1fr); gap:8px; padding:16px 28px 8px; }
    .tile { display:flex; flex-direction:column; align-items:center; gap:2px; padding:10px 4px; cursor:pointer;
      border:1px solid var(--color-border); border-radius:var(--radius-md); background:var(--color-white); font-family:var(--font-base); }
    .tile.active { border-color:var(--color-brand); background:var(--color-brand-light); }
    .tile-value { font-size:18px; font-weight:700; color:var(--color-text-main); }
    .tile-value.ok { color:var(--color-success); }
    .tile-value.bad { color:var(--color-error); }
    .tile-value.muted { color:var(--color-text-muted); }
    .tile-label { font-size:11px; color:var(--color-text-muted); }
    .clicks-link { margin:8px 28px 0; align-self:flex-start; }
    .drawer-body { flex:1; overflow-y:auto; padding:8px 28px 16px; }
    .drawer-footer { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 28px;
      border-top:1px solid var(--color-border); }
    .muted { color:var(--color-text-muted); font-size:13px; }
    .center { text-align:center; padding:32px 0; }
    .rows { list-style:none; margin:0; padding:0; }
    .row { display:flex; align-items:flex-start; gap:12px; padding:12px 0; border-top:1px solid var(--color-border); }
    .row:first-child { border-top:none; }
    .row-main { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
    .row-name { font-weight:600; font-size:14px; overflow-wrap:anywhere; }
    .row-sub { font-size:12px; color:var(--color-text-muted); overflow-wrap:anywhere; }
    .row-error { font-size:12px; color:var(--color-error); overflow-wrap:anywhere; }
    .row-side { display:flex; flex-direction:column; align-items:flex-end; gap:4px; flex-shrink:0; }
    .row-date { font-size:11px; color:var(--color-text-muted); }
    .st-sent { color:var(--color-success); }
    .st-failed { color:var(--color-error); }
    .st-pending, .st-skipped { color:var(--color-text-muted); }
    .spin { animation:spin 1s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
    @media (max-width: 600px) {
      .drawer { max-width:100%; }
      .tiles { grid-template-columns:repeat(3, 1fr); }
    }
  `],
})
export class CampaignRecipientsComponent implements OnInit, OnDestroy {
  private api = inject(CampaignsApiService);
  private toast = inject(ToastService);

  campaign = input.required<Campaign>();
  closed = output<void>();

  readonly X = X; readonly ChevronLeft = ChevronLeft; readonly ChevronRight = ChevronRight;
  readonly BarChart3 = BarChart3; readonly RefreshCw = RefreshCw;

  items = signal<CampaignRecipient[]>([]);
  stats = signal<CampaignStats | null>(null);
  total = signal(0);
  page = signal(1);
  pageSize = signal(100);
  filter = signal<RecipientStatus | ''>('');
  loading = signal(true);

  pages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  percent = computed(() => {
    const s = this.stats();
    return s && s.total ? Math.round(((s.total - s.pending) / s.total) * 100) : 0;
  });

  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnInit() {
    this.load(true);
    // Mientras se envía, el detalle se refresca solo.
    this.timer = setInterval(() => {
      if ((this.stats()?.pending ?? 0) > 0) this.load(false);
    }, 8000);
  }

  ngOnDestroy() { if (this.timer) clearInterval(this.timer); }

  @HostListener('document:keydown.escape')
  onEscape() { this.closed.emit(); }

  private load(showSpinner: boolean) {
    if (showSpinner) this.loading.set(true);
    this.api.getRecipients(this.campaign()._id, this.filter(), this.page()).subscribe({
      next: res => {
        this.items.set(res.items);
        this.stats.set(res.stats);
        this.total.set(res.total);
        this.pageSize.set(res.pageSize);
        this.loading.set(false);
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading.set(false);
        if (showSpinner) this.toast.error(err.error?.message || 'No se pudo cargar el detalle');
      },
    });
  }

  setFilter(status: RecipientStatus | '') {
    this.filter.set(status);
    this.page.set(1);
    this.load(true);
  }

  go(page: number) {
    if (page < 1 || page > this.pages()) return;
    this.page.set(page);
    this.load(true);
  }

  share(n: number) {
    const total = this.stats()?.total ?? 0;
    return total ? (n / total) * 100 : 0;
  }

  label(status: RecipientStatus) { return STATUS_LABELS[status]; }

  badge(status: RecipientStatus) {
    return status === 'sent' ? 'badge-success' : status === 'failed' ? 'badge-danger' : 'badge-neutral';
  }

  icon(status: RecipientStatus) {
    return status === 'sent' ? CheckCircle2 : status === 'failed' ? AlertCircle : status === 'skipped' ? MinusCircle : Clock;
  }
}
