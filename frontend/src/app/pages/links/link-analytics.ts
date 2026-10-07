import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  LucideAngularModule, ArrowLeft, Download, MousePointerClick, Users, Bot, Clock, Copy,
  ChevronDown, ChevronUp, Smartphone, Monitor, Tablet, RefreshCw, ExternalLink,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import {
  BarListComponent, ChartCardComponent, CountUpComponent, HeatmapComponent, TimeChartComponent,
  VizItem, VizSeries, VizTable,
} from '../../shared/charts';
import {
  LinkStats, LinksApiService, RecentClick, ShortLink, StatItem, saveBlob,
} from '../../core/api/links-api.service';

type ErrorLike = { error?: { message?: string } };

const RANGES = [
  { days: 7, label: '7 días' },
  { days: 30, label: '30 días' },
  { days: 90, label: '90 días' },
];

const DEVICE_LABELS: Record<string, string> = {
  mobile: 'Móvil',
  desktop: 'Escritorio',
  tablet: 'Tablet',
  unknown: 'Desconocido',
};

/** Dashboard de rendimiento de un link, un lote, una campaña o de todos. */
@Component({
  selector: 'app-link-analytics',
  standalone: true,
  imports: [
    LucideAngularModule, RouterLink, DatePipe, TimeChartComponent, BarListComponent,
    HeatmapComponent, ChartCardComponent, CountUpComponent,
  ],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div class="head-left">
          <a class="btn btn-ghost btn-sm back" routerLink="/links">
            <lucide-icon [img]="ArrowLeft" [size]="15"></lucide-icon> Links
          </a>
          <h1>{{ title() }}</h1>
          @if (link(); as l) {
            <p class="page-sub">
              <button class="short" (click)="copy(l.shortUrl)" title="Copiar link">
                {{ l.shortUrl }} <lucide-icon [img]="Copy" [size]="13"></lucide-icon>
              </button>
              <a class="dest" [href]="l.destination" target="_blank" rel="noopener">
                <lucide-icon [img]="ExternalLink" [size]="12"></lucide-icon> {{ l.destination }}
              </a>
            </p>
          } @else {
            <p class="page-sub">{{ subtitle() }}</p>
          }
        </div>
        <div class="header-actions">
          <div class="seg" role="group" aria-label="Periodo">
            @for (r of ranges; track r.days) {
              <button class="seg-btn" [class.active]="days() === r.days" (click)="setRange(r.days)">{{ r.label }}</button>
            }
          </div>
          @if (canExport()) {
            <button class="btn btn-secondary" (click)="exportCsv()" [disabled]="exporting()">
              <lucide-icon [img]="Download" [size]="15"></lucide-icon>
              {{ exporting() ? 'Preparando…' : 'Exportar clics' }}
            </button>
          }
        </div>
      </div>

      @if (loading() && !stats()) {
        <div class="kpis">
          @for (i of [1, 2, 3, 4]; track i) { <div class="card kpi skeleton"></div> }
        </div>
      } @else if (stats(); as s) {
        <div class="kpis">
          <div class="card kpi">
            <span class="kpi-icon"><lucide-icon [img]="MousePointerClick" [size]="18"></lucide-icon></span>
            <span class="kpi-value"><app-count-up [value]="s.totals.clicks" /></span>
            <span class="kpi-label">Clics</span>
          </div>
          <div class="card kpi">
            <span class="kpi-icon"><lucide-icon [img]="Users" [size]="18"></lucide-icon></span>
            <span class="kpi-value"><app-count-up [value]="s.totals.unique" /></span>
            <span class="kpi-label">Visitantes únicos</span>
          </div>
          <div class="card kpi">
            <span class="kpi-icon"><lucide-icon [img]="Clock" [size]="18"></lucide-icon></span>
            <span class="kpi-value small">{{ s.totals.lastClickAt ? (s.totals.lastClickAt | date: 'dd/MM HH:mm') : '—' }}</span>
            <span class="kpi-label">Último clic</span>
          </div>
          <div class="card kpi">
            <span class="kpi-icon muted"><lucide-icon [img]="Bot" [size]="18"></lucide-icon></span>
            <span class="kpi-value"><app-count-up [value]="s.totals.bots" /></span>
            <span class="kpi-label">Bots y previsualizaciones (no cuentan)</span>
          </div>
        </div>

        @if (!s.totals.clicks && !s.totals.bots) {
          <div class="card empty">
            <lucide-icon [img]="MousePointerClick" [size]="40" [strokeWidth]="1.5"></lucide-icon>
            <h3>Aún no hay clics en este periodo</h3>
            <p>Cuando alguien abra el link verás aquí desde dónde, con qué dispositivo y a qué hora.</p>
          </div>
        } @else {
          <app-chart-card heading="Clics en el tiempo" subtitle="Clics totales y visitantes únicos por día" [table]="seriesTable()">
            <app-time-chart [labels]="labels()" [series]="series()" ariaLabel="Clics por día" [height]="260" />
          </app-chart-card>

          <div class="grid3">
            <app-chart-card heading="Dispositivos">
              <app-bar-list [items]="deviceItems()" />
            </app-chart-card>
            <app-chart-card heading="Navegadores">
              <app-bar-list [items]="items(s.browsers)" color="var(--chart-2)" />
            </app-chart-card>
            <app-chart-card heading="Sistemas">
              <app-bar-list [items]="items(s.os)" color="var(--chart-3)" />
            </app-chart-card>
          </div>

          <div class="grid3">
            <app-chart-card heading="Origen" subtitle="Desde dónde llegaron">
              <app-bar-list [items]="items(s.referers)" />
            </app-chart-card>
            <app-chart-card heading="Países">
              <app-bar-list [items]="items(s.countries)" color="var(--chart-2)"
                empty="Sin datos de país (la geolocalización por IP no está activada)" />
            </app-chart-card>
            <app-chart-card heading="Idiomas">
              <app-bar-list [items]="items(s.languages)" color="var(--chart-3)" />
            </app-chart-card>
          </div>

          <app-chart-card heading="Cuándo hacen clic" subtitle="Día de la semana y hora, en tu zona horaria">
            <app-heatmap [data]="s.hours" unit="Clics" />
          </app-chart-card>

          @if (!linkId && s.topLinks.length) {
            <div class="card table-card">
              <h3 class="card-title">Links con más clics</h3>
              <div class="table-wrap">
                <table>
                  <thead><tr><th>Link</th><th class="num">Clics</th><th class="num">Únicos</th><th></th></tr></thead>
                  <tbody>
                    @for (t of s.topLinks; track t._id) {
                      <tr>
                        <td data-label="Link">
                          <div class="t-title">{{ t.title }}</div>
                          <div class="t-sub">{{ t.shortUrl }}</div>
                        </td>
                        <td class="num" data-label="Clics">{{ t.clicks }}</td>
                        <td class="num" data-label="Únicos">{{ t.unique }}</td>
                        <td class="num">
                          <a class="btn btn-ghost btn-sm" routerLink="/links/analitica" [queryParams]="{ linkId: t._id }">Ver</a>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }

          <div class="card table-card">
            <div class="card-head">
              <h3 class="card-title">Clics recientes</h3>
              <label class="check">
                <input type="checkbox" [checked]="showBots()" (change)="showBots.set($any($event.target).checked)" />
                Mostrar bots
              </label>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Cuándo</th><th>Quién</th><th>Dispositivo</th><th>Navegador</th><th>Ubicación / IP</th><th>Origen</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (c of recent(); track c._id) {
                    <tr [class.is-bot]="c.isBot">
                      <td data-label="Cuándo">{{ c.at | date: 'dd/MM/yyyy HH:mm:ss' }}</td>
                      <td data-label="Quién">
                        @if (c.customerName) {
                          <span class="who">{{ c.customerName }}</span>
                        } @else {
                          <span class="muted">Visitante {{ (c.visitorId || '').slice(0, 6) || '—' }}</span>
                        }
                        @if (c.isUnique) { <span class="badge badge-success">Nuevo</span> }
                        @if (c.isBot) { <span class="badge badge-neutral">Bot</span> }
                      </td>
                      <td data-label="Dispositivo">
                        <lucide-icon [img]="deviceIcon(c.device)" [size]="14"></lucide-icon>
                        {{ deviceLabel(c.device) }} · {{ c.os || '—' }}
                      </td>
                      <td data-label="Navegador">{{ c.browser || '—' }} {{ c.browserVersion || '' }}</td>
                      <td data-label="Ubicación / IP">
                        @if (c.country) { {{ c.city ? c.city + ', ' : '' }}{{ c.country }} · }
                        <span class="mono">{{ c.ip || '—' }}</span>
                      </td>
                      <td data-label="Origen">{{ c.refererHost || 'Directo / app' }}</td>
                      <td class="num">
                        <button class="btn btn-ghost btn-sm btn-icon" (click)="toggle(c._id)"
                          [attr.aria-expanded]="open() === c._id" aria-label="Ver todos los datos del clic">
                          <lucide-icon [img]="open() === c._id ? ChevronUp : ChevronDown" [size]="15"></lucide-icon>
                        </button>
                      </td>
                    </tr>
                    @if (open() === c._id) {
                      <tr class="detail-row">
                        <td colspan="7">
                          <dl class="detail">
                            <div><dt>Idioma</dt><dd>{{ c.language || '—' }}</dd></div>
                            <div><dt>Visitante</dt><dd class="mono">{{ c.visitorId || '—' }}</dd></div>
                            <div class="wide"><dt>User-Agent</dt><dd class="mono">{{ c.userAgent || '—' }}</dd></div>
                            <div class="wide"><dt>Parámetros de la URL</dt><dd class="mono">{{ pairs(c.query) }}</dd></div>
                            <div class="wide"><dt>Cookies recibidas</dt><dd class="mono">{{ pairs(c.cookies) }}</dd></div>
                          </dl>
                        </td>
                      </tr>
                    }
                  } @empty {
                    <tr><td colspan="7" class="muted center">Sin clics que mostrar.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .page { width:100%; box-sizing:border-box; padding:32px 40px; display:flex; flex-direction:column; gap:20px; }
    .page-header { display:flex; align-items:flex-start; justify-content:space-between; gap:24px; flex-wrap:wrap; }
    .head-left { min-width:0; }
    .back { margin:0 0 8px -10px; }
    h1 { font-family:var(--font-heading); margin:0 0 6px; overflow-wrap:anywhere; }
    .page-sub { color:var(--color-text-muted); margin:0; display:flex; gap:16px; flex-wrap:wrap; align-items:center; font-size:13px; }
    .short { display:inline-flex; align-items:center; gap:6px; background:var(--color-brand-light); color:var(--color-brand);
      border:none; border-radius:var(--radius-pill); padding:6px 12px; font-family:var(--font-base); font-weight:600; cursor:pointer; }
    .dest { display:inline-flex; align-items:center; gap:4px; color:var(--color-text-muted); text-decoration:none; overflow-wrap:anywhere; }
    .header-actions { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
    .seg { display:inline-flex; background:var(--color-bg-light); border-radius:var(--radius-pill); padding:3px; gap:2px; }
    .seg-btn { padding:7px 14px; border:none; background:none; cursor:pointer; border-radius:var(--radius-pill);
      font-family:var(--font-base); font-size:13px; font-weight:500; color:var(--color-text-muted); }
    .seg-btn.active { background:var(--color-white); color:var(--color-brand); box-shadow:var(--shadow-sm); }
    .kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); gap:16px; }
    .kpi { padding:24px; display:flex; flex-direction:column; gap:6px; }
    .kpi.skeleton { height:128px; background:var(--color-bg-light); }
    .kpi-icon { width:36px; height:36px; border-radius:var(--radius-md); display:grid; place-items:center;
      background:var(--color-brand-light); color:var(--color-brand); }
    .kpi-icon.muted { background:var(--color-bg-light); color:var(--color-text-muted); }
    .kpi-value { font-family:var(--font-heading); font-size:30px; font-weight:700; color:var(--color-text-main); }
    .kpi-value.small { font-size:20px; padding:6px 0; }
    .kpi-label { font-size:13px; color:var(--color-text-muted); }
    .grid3 { display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:20px; }
    .empty { display:flex; flex-direction:column; align-items:center; text-align:center; gap:8px; padding:56px 24px; color:var(--color-text-muted); }
    .empty h3 { margin:8px 0 0; color:var(--color-text-main); font-family:var(--font-heading); }
    .empty p { margin:0; max-width:420px; }
    .table-card { padding:24px; }
    .card-head { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:12px; }
    .card-title { margin:0 0 12px; font-family:var(--font-heading); font-size:16px; }
    .card-head .card-title { margin:0; }
    .check { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--color-text-muted); }
    .num { text-align:right; }
    .t-title { font-weight:600; overflow-wrap:anywhere; }
    .t-sub { font-size:12px; color:var(--color-text-muted); }
    .who { font-weight:600; margin-right:6px; }
    .muted { color:var(--color-text-muted); }
    .center { text-align:center; padding:24px; }
    .mono { font-family:ui-monospace, Menlo, Consolas, monospace; font-size:12px; overflow-wrap:anywhere; }
    .is-bot { opacity:.6; }
    .detail-row td { background:var(--color-bg-light); }
    .detail { display:grid; grid-template-columns:1fr 1fr; gap:12px 24px; margin:0; }
    .detail .wide { grid-column:1 / -1; }
    .detail dt { font-size:11px; text-transform:uppercase; letter-spacing:.04em; color:var(--color-text-muted); margin-bottom:2px; }
    .detail dd { margin:0; }
    @media (max-width: 768px) {
      .page { padding:20px 16px; }
      .detail { grid-template-columns:1fr; }
    }
  `],
})
export class LinkAnalyticsComponent implements OnInit {
  private api = inject(LinksApiService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);

  readonly ArrowLeft = ArrowLeft; readonly Download = Download; readonly MousePointerClick = MousePointerClick;
  readonly Users = Users; readonly Bot = Bot; readonly Clock = Clock; readonly Copy = Copy;
  readonly ChevronDown = ChevronDown; readonly ChevronUp = ChevronUp; readonly RefreshCw = RefreshCw;
  readonly ExternalLink = ExternalLink;
  readonly ranges = RANGES;

  linkId = '';
  batchId = '';
  campaignId = '';

  stats = signal<LinkStats | null>(null);
  link = signal<ShortLink | null>(null);
  loading = signal(true);
  exporting = signal(false);
  days = signal(30);
  showBots = signal(false);
  open = signal<string | null>(null);

  title = computed(() => {
    const l = this.link();
    if (l) return l.title || l.code;
    if (this.batchId) return 'Rendimiento del lote';
    if (this.campaignId) return 'Clics de la campaña';
    return 'Analítica de links';
  });
  subtitle = computed(() =>
    this.batchId
      ? 'Todos los links personales generados en este lote.'
      : this.campaignId
        ? 'Quién abrió el link que recibió en esta campaña.'
        : 'Rendimiento de todos tus links cortos.',
  );
  canExport = computed(() => !!this.linkId || !!this.batchId);

  labels = computed(() => (this.stats()?.series ?? []).map(p => p.date.slice(8, 10) + '/' + p.date.slice(5, 7)));
  series = computed<VizSeries[]>(() => {
    const s = this.stats()?.series ?? [];
    return [
      { name: 'Clics', color: 'var(--chart-1)', data: s.map(p => p.clicks) },
      { name: 'Únicos', color: 'var(--chart-2)', data: s.map(p => p.unique) },
    ];
  });
  seriesTable = computed<VizTable>(() => ({
    head: ['Día', 'Clics', 'Únicos'],
    rows: (this.stats()?.series ?? []).map(p => [p.date, p.clicks, p.unique]),
  }));
  deviceItems = computed<VizItem[]>(() =>
    (this.stats()?.devices ?? []).map(d => ({ label: DEVICE_LABELS[d.label] ?? d.label, value: d.value })),
  );
  recent = computed<RecentClick[]>(() => {
    const all = this.stats()?.recent ?? [];
    return this.showBots() ? all : all.filter(c => !c.isBot);
  });

  ngOnInit() {
    const q = this.route.snapshot.queryParamMap;
    this.linkId = q.get('linkId') ?? '';
    this.batchId = q.get('batchId') ?? '';
    this.campaignId = q.get('campaignId') ?? '';
    if (this.linkId) {
      this.api.get(this.linkId).subscribe({ next: l => this.link.set(l), error: () => {} });
    }
    this.load();
  }

  setRange(days: number) {
    this.days.set(days);
    this.load();
  }

  private load() {
    this.loading.set(true);
    const to = new Date();
    const from = new Date(to.getTime() - this.days() * 24 * 60 * 60 * 1000);
    this.api
      .stats({
        linkId: this.linkId,
        batchId: this.batchId,
        campaignId: this.campaignId,
        from: from.toISOString(),
        to: to.toISOString(),
      })
      .subscribe({
        next: s => { this.stats.set(s); this.loading.set(false); },
        error: (err: ErrorLike) => {
          this.loading.set(false);
          this.toast.error(err.error?.message || 'No se pudo cargar la analítica');
        },
      });
  }

  items(list: StatItem[]): VizItem[] { return list.map(i => ({ label: i.label, value: i.value })); }
  deviceLabel(device?: string) { return DEVICE_LABELS[device ?? ''] ?? (device === 'bot' ? 'Bot' : '—'); }
  deviceIcon(device?: string) { return device === 'mobile' ? Smartphone : device === 'tablet' ? Tablet : device === 'bot' ? Bot : Monitor; }
  toggle(id: string) { this.open.set(this.open() === id ? null : id); }

  pairs(obj?: Record<string, string>): string {
    const entries = Object.entries(obj ?? {});
    return entries.length ? entries.map(([k, v]) => k + '=' + v).join('  ·  ') : '—';
  }

  copy(text: string) {
    navigator.clipboard.writeText(text).then(
      () => this.toast.success('Link copiado'),
      () => this.toast.error('No se pudo copiar'),
    );
  }

  exportCsv() {
    this.exporting.set(true);
    this.api.exportClicks({ linkId: this.linkId, batchId: this.batchId }).subscribe({
      next: blob => { this.exporting.set(false); saveBlob(blob, 'clics.csv'); this.toast.success('CSV descargado'); },
      error: () => { this.exporting.set(false); this.toast.error('No se pudo exportar'); },
    });
  }
}
