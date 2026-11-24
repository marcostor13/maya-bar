import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, BarChart3, Plus, Download, Pin, PinOff, Trash2, Pencil, Send } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { FormPageComponent, snapshotOf } from '../../shared/form-page';
import { ReportViewComponent, type ReportChart, type ReportResult } from './report-view';

type Source = 'leads' | 'customers' | 'conversations' | 'campaigns' | 'registrations';
interface Allowed { metrics: string[]; groups: string[]; dates: string[] }
interface Filters { dateField?: string; range?: string; from?: string; to?: string; status?: string; stage?: string; source?: string; ownerId?: string; tag?: string; channel?: string }
export interface SavedReport {
  _id: string; name: string; source: Source; metric: string; groupBy: string; filters: Filters; chart: ReportChart;
  pinned: boolean; sharedRoles: string[]; createdBy: string; schedule?: { frequency: 'weekly' | 'monthly'; emails: string[]; lastSentAt?: string } | null;
}
interface Editing {
  _id?: string; name: string; source: Source; metric: string; groupBy: string; filters: Filters; chart: ReportChart;
  pinned: boolean; sharedRoles: string[]; scheduled: boolean; frequency: 'weekly' | 'monthly'; emails: string;
}

export const SOURCE_LABEL: Record<Source, string> = {
  leads: 'Oportunidades', customers: 'Contactos', conversations: 'Conversaciones', campaigns: 'Campañas', registrations: 'Registros a eventos',
};
export const METRIC_LABEL: Record<string, string> = {
  count: 'Cantidad', sum_value: 'Suma de monto', conversion_rate: 'Tasa de conversión (ganadas / total)', avg_days_to_close: 'Días medios hasta ganar',
};
export const GROUP_LABEL: Record<string, string> = {
  owner: 'Vendedor', stage: 'Etapa', status: 'Estado', source: 'Origen', channel: 'Canal', tag: 'Etiqueta', type: 'Canal de campaña',
  event: 'Evento', day: 'Día', week: 'Semana', month: 'Mes', none: 'Sin agrupar (total)',
};
const DATE_LABEL: Record<string, string> = { createdAt: 'Fecha de creación', closedAt: 'Fecha de cierre', sentAt: 'Fecha de envío' };
const RANGES: [string, string][] = [
  ['last_7', 'Últimos 7 días'], ['last_30', 'Últimos 30 días'], ['last_90', 'Últimos 90 días'],
  ['this_month', 'Este mes'], ['last_month', 'Mes pasado'], ['this_year', 'Este año'], ['custom', 'Personalizado'],
];

/** Reportes configurables (HU64): armar, guardar, fijar en el dashboard, compartir, exportar y programar. */
@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, FormPageComponent, ReportViewComponent],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1 class="page-title">Reportes</h1>
          <p class="page-subtitle">Arma tus propios reportes de ventas, contactos y campañas. Fíjalos en el dashboard o recíbelos por correo.</p>
        </div>
        @if (canManage()) {
          <button class="btn btn-primary" (click)="openNew()"><lucide-icon [img]="Plus" [size]="16" /> Nuevo reporte</button>
        }
      </div>

      @if (loading()) {
        <p class="muted">Cargando…</p>
      } @else if (!items().length) {
        <div class="empty card">
          <lucide-icon [img]="BarChart3" [size]="32" />
          <p>Aún no hay reportes. {{ canManage() ? 'Crea el primero, por ejemplo "Oportunidades ganadas por vendedor este mes".' : 'Tu gerente puede compartirte reportes.' }}</p>
        </div>
      } @else {
        <div class="grid">
          @for (r of items(); track r._id) {
            <div class="card report">
              <div class="report-head">
                <div>
                  <h3>{{ r.name }}</h3>
                  <p class="muted">{{ sourceLabel[r.source] }} · {{ metricLabel[r.metric] }} · por {{ groupLabel[r.groupBy] }}</p>
                </div>
                <div class="actions">
                  @if (canEdit(r)) {
                    <button class="btn btn-icon btn-ghost btn-sm" (click)="togglePin(r)" [attr.aria-label]="r.pinned ? 'Quitar del dashboard' : 'Fijar en el dashboard'">
                      <lucide-icon [img]="r.pinned ? PinOff : Pin" [size]="15" />
                    </button>
                    <button class="btn btn-icon btn-ghost btn-sm" (click)="openEdit(r)" aria-label="Editar reporte"><lucide-icon [img]="Pencil" [size]="15" /></button>
                  }
                  <button class="btn btn-icon btn-ghost btn-sm" (click)="exportCsv(r)" aria-label="Exportar CSV"><lucide-icon [img]="Download" [size]="15" /></button>
                  @if (canEdit(r) && r.schedule) {
                    <button class="btn btn-icon btn-ghost btn-sm" (click)="sendNow(r)" aria-label="Enviar ahora por correo"><lucide-icon [img]="Send" [size]="15" /></button>
                  }
                  @if (canEdit(r)) {
                    <button class="btn btn-icon btn-ghost btn-sm" (click)="remove(r)" aria-label="Eliminar reporte"><lucide-icon [img]="Trash2" [size]="15" /></button>
                  }
                </div>
              </div>
              @if (r.pinned) { <span class="badge-success">En el dashboard</span> }
              @if (r.schedule) { <span class="badge-neutral">Por correo {{ r.schedule.frequency === 'weekly' ? 'cada lunes' : 'cada día 1' }}</span> }
              @if (results()[r._id]; as res) {
                <app-report-view [result]="res" [chart]="r.chart" />
              } @else {
                <p class="muted">Calculando…</p>
              }
            </div>
          }
        </div>
      }
    </div>

    @if (editing(); as e) {
      <app-form-page
        [title]="e._id ? 'Editar reporte' : 'Nuevo reporte'"
        subtitle="Elige qué contar, cómo agruparlo y en qué periodo."
        backLabel="Reportes"
        [urlKey]="e._id || 'nuevo'"
        [dirty]="isDirty()"
        (closed)="editing.set(null)">
        <ng-container formActions>
          <button class="btn btn-secondary" (click)="preview()" [disabled]="busy()">Vista previa</button>
          <button class="btn btn-primary" (click)="save()" [disabled]="busy() || !e.name.trim()">Guardar</button>
        </ng-container>

        <div class="form-grid">
          <div class="field full"><label for="r-name">Nombre</label>
            <input id="r-name" class="input" [(ngModel)]="e.name" placeholder="Oportunidades ganadas por vendedor" maxlength="120" /></div>

          <div class="field"><label for="r-src">Fuente</label>
            <select id="r-src" class="select" [(ngModel)]="e.source" (ngModelChange)="onSource()">
              @for (s of sources; track s) { <option [value]="s">{{ sourceLabel[s] }}</option> }
            </select></div>
          <div class="field"><label for="r-metric">Métrica</label>
            <select id="r-metric" class="select" [(ngModel)]="e.metric">
              @for (m of allowed(e.source).metrics; track m) { <option [value]="m">{{ metricLabel[m] }}</option> }
            </select></div>
          <div class="field"><label for="r-group">Agrupar por</label>
            <select id="r-group" class="select" [(ngModel)]="e.groupBy">
              @for (g of allowed(e.source).groups; track g) { <option [value]="g">{{ groupLabel[g] }}</option> }
            </select></div>
          <div class="field"><label for="r-chart">Visualización</label>
            <select id="r-chart" class="select" [(ngModel)]="e.chart">
              <option value="table">Tabla</option><option value="bar">Barras</option><option value="line">Línea</option>
            </select></div>

          <div class="field"><label for="r-date">Fecha</label>
            <select id="r-date" class="select" [(ngModel)]="e.filters.dateField">
              @for (d of allowed(e.source).dates; track d) { <option [value]="d">{{ dateLabel[d] }}</option> }
            </select></div>
          <div class="field"><label for="r-range">Periodo</label>
            <select id="r-range" class="select" [(ngModel)]="e.filters.range">
              @for (r of ranges; track r[0]) { <option [value]="r[0]">{{ r[1] }}</option> }
            </select></div>
          @if (e.filters.range === 'custom') {
            <div class="field"><label for="r-from">Desde</label><input id="r-from" class="input" type="date" [(ngModel)]="e.filters.from" /></div>
            <div class="field"><label for="r-to">Hasta</label><input id="r-to" class="input" type="date" [(ngModel)]="e.filters.to" /></div>
          }

          @if (e.source === 'leads') {
            <div class="field"><label for="r-status">Estado</label>
              <select id="r-status" class="select" [(ngModel)]="e.filters.status">
                <option value="">Todos</option><option value="open">Abiertas</option><option value="won">Ganadas</option><option value="lost">Perdidas</option>
              </select></div>
          }
          @if (e.source === 'leads' || e.source === 'customers') {
            <div class="field"><label for="r-origin">Origen</label><input id="r-origin" class="input" [(ngModel)]="e.filters.source" placeholder="Todos" /></div>
            <div class="field"><label for="r-tag">Etiqueta</label><input id="r-tag" class="input" [(ngModel)]="e.filters.tag" placeholder="Todas" /></div>
          }
          @if (e.source === 'conversations') {
            <div class="field"><label for="r-channel">Canal</label>
              <select id="r-channel" class="select" [(ngModel)]="e.filters.channel">
                <option value="">Todos</option><option value="whatsapp">WhatsApp</option><option value="instagram">Instagram</option>
                <option value="messenger">Messenger</option><option value="email">Email</option>
              </select></div>
          }

          <div class="field full">
            <label class="check"><input type="checkbox" [(ngModel)]="e.pinned" /> Fijar en el dashboard</label>
          </div>
          <div class="field full">
            <span class="label">Compartir con los roles</span>
            <div class="roles">
              @for (r of roles(); track r.key) {
                <label class="check"><input type="checkbox" [checked]="e.sharedRoles.includes(r.key)" (change)="toggleRole(r.key)" /> {{ r.label }}</label>
              }
            </div>
            <p class="hint">El administrador y quien lo crea siempre lo ven. Los roles elegidos lo ven en Reportes y, si está fijado, en su dashboard.</p>
          </div>
          <div class="field full">
            <label class="check"><input type="checkbox" [(ngModel)]="e.scheduled" /> Enviar por correo</label>
            @if (e.scheduled) {
              <div class="sched">
                <select class="select" [(ngModel)]="e.frequency" aria-label="Frecuencia">
                  <option value="weekly">Cada lunes (8:00)</option><option value="monthly">Cada día 1 (8:00)</option>
                </select>
                <input class="input" [(ngModel)]="e.emails" placeholder="gerencia@empresa.pe, ventas@empresa.pe" aria-label="Correos" />
              </div>
            }
          </div>
        </div>

        @if (previewResult(); as p) {
          <div class="card preview"><h3>Vista previa</h3><app-report-view [result]="p" [chart]="e.chart" /></div>
        }
      </app-form-page>
    }
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    .page-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
    .muted { color: var(--color-text-muted); font-size: 13px; margin: 2px 0 8px; }
    .empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 48px 24px; text-align: center; color: var(--color-text-muted); }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 20px; }
    .report { padding: 24px; display: flex; flex-direction: column; gap: 8px; }
    .report-head { display: flex; justify-content: space-between; gap: 8px; }
    .report-head h3 { font-family: var(--font-heading); font-size: 16px; margin: 0; }
    .actions { display: flex; gap: 2px; flex-shrink: 0; }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
    .field label, .label { display: block; font-size: 13px; font-weight: 500; color: var(--color-text-muted); margin-bottom: 6px; }
    .field .input, .field .select { width: 100%; box-sizing: border-box; }
    .full { grid-column: 1 / -1; }
    .check { display: inline-flex !important; align-items: center; gap: 8px; color: var(--color-text-main) !important; margin-right: 16px; }
    .roles { display: flex; flex-wrap: wrap; gap: 8px; }
    .hint { font-size: 12px; color: var(--color-text-muted); margin: 6px 0 0; }
    .sched { display: grid; grid-template-columns: 220px 1fr; gap: 10px; margin-top: 8px; }
    .preview { margin-top: 24px; padding: 24px; }
    .preview h3 { margin: 0 0 12px; font-size: 15px; }
    @media (max-width: 768px) { .page { padding: 20px 16px; } .grid { grid-template-columns: 1fr; } .sched { grid-template-columns: 1fr; } }
  `],
})
export class ReportsComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private base = `${environment.apiUrl}/reports`;
  readonly BarChart3 = BarChart3; readonly Plus = Plus; readonly Download = Download; readonly Pin = Pin;
  readonly PinOff = PinOff; readonly Trash2 = Trash2; readonly Pencil = Pencil; readonly Send = Send;
  readonly sourceLabel = SOURCE_LABEL; readonly metricLabel = METRIC_LABEL; readonly groupLabel = GROUP_LABEL;
  readonly dateLabel = DATE_LABEL; readonly ranges = RANGES;
  readonly sources = Object.keys(SOURCE_LABEL) as Source[];

  items = signal<SavedReport[]>([]);
  results = signal<Record<string, ReportResult>>({});
  loading = signal(true);
  busy = signal(false);
  editing = signal<Editing | null>(null);
  previewResult = signal<ReportResult | null>(null);
  roles = signal<{ key: string; label: string }[]>([]);
  private meta: Record<string, Allowed> = {};
  private snapshot = '';

  canManage = () => ['TENANT_ADMIN', 'MANAGER'].includes(this.auth.currentUser()?.role ?? '');
  canEdit = (r: SavedReport) => this.auth.currentUser()?.role === 'TENANT_ADMIN' || (this.canManage() && r.createdBy === this.auth.currentUser()?.id);

  ngOnInit() {
    this.http.get<{ allowed: Record<string, Allowed> }>(`${this.base}/meta`).subscribe({ next: (m) => (this.meta = m.allowed), error: () => undefined });
    this.load();
  }

  allowed(s: Source): Allowed {
    return this.meta[s] ?? { metrics: ['count'], groups: ['none'], dates: ['createdAt'] };
  }

  load() {
    this.http.get<SavedReport[]>(this.base).subscribe({
      next: (r) => {
        this.items.set(r);
        this.loading.set(false);
        for (const rep of r) this.runOne(rep._id);
      },
      error: (err) => { this.loading.set(false); this.toast.error(err.error?.message || 'No se pudieron cargar los reportes'); },
    });
  }

  private runOne(id: string) {
    this.http.get<{ result: ReportResult }>(`${this.base}/${id}/run`).subscribe({
      next: (r) => this.results.update((m) => ({ ...m, [id]: r.result })),
      error: () => undefined,
    });
  }

  private loadRoles() {
    if (this.roles().length) return;
    this.http.get<{ key: string; label: string }[]>(`${environment.apiUrl}/roles`).subscribe({
      next: (r) => this.roles.set(r.filter((x) => x.key !== 'TENANT_ADMIN' && x.key !== 'SUPERADMIN')),
      error: () => undefined,
    });
  }

  openNew() {
    this.loadRoles();
    this.previewResult.set(null);
    this.editing.set({
      name: '', source: 'leads', metric: 'count', groupBy: 'owner', filters: { dateField: 'createdAt', range: 'this_month', status: '' },
      chart: 'bar', pinned: false, sharedRoles: [], scheduled: false, frequency: 'weekly', emails: '',
    });
    this.snapshot = snapshotOf(this.editing());
  }

  openEdit(r: SavedReport) {
    this.loadRoles();
    this.previewResult.set(null);
    this.editing.set({
      _id: r._id, name: r.name, source: r.source, metric: r.metric, groupBy: r.groupBy,
      filters: { dateField: 'createdAt', range: 'last_30', ...r.filters }, chart: r.chart, pinned: r.pinned, sharedRoles: [...(r.sharedRoles ?? [])],
      scheduled: !!r.schedule, frequency: r.schedule?.frequency ?? 'weekly', emails: (r.schedule?.emails ?? []).join(', '),
    });
    this.snapshot = snapshotOf(this.editing());
  }

  isDirty() { return snapshotOf(this.editing()) !== this.snapshot; }

  onSource() {
    const e = this.editing();
    if (!e) return;
    const a = this.allowed(e.source);
    if (!a.metrics.includes(e.metric)) e.metric = a.metrics[0];
    if (!a.groups.includes(e.groupBy)) e.groupBy = a.groups[0];
    if (!a.dates.includes(e.filters.dateField ?? '')) e.filters.dateField = a.dates[0];
    e.filters = { dateField: e.filters.dateField, range: e.filters.range, from: e.filters.from, to: e.filters.to };
  }

  toggleRole(key: string) {
    const e = this.editing();
    if (!e) return;
    e.sharedRoles = e.sharedRoles.includes(key) ? e.sharedRoles.filter((k) => k !== key) : [...e.sharedRoles, key];
  }

  private definition(e: Editing) {
    const filters = Object.fromEntries(Object.entries(e.filters).filter(([, v]) => typeof v === 'string' && v.trim() !== ''));
    if (filters['range'] !== 'custom') { delete filters['from']; delete filters['to']; }
    return { source: e.source, metric: e.metric, groupBy: e.groupBy, filters };
  }

  preview() {
    const e = this.editing();
    if (!e) return;
    this.busy.set(true);
    this.http.post<ReportResult>(`${this.base}/run`, this.definition(e)).subscribe({
      next: (r) => { this.busy.set(false); this.previewResult.set(r); },
      error: (err) => { this.busy.set(false); this.toast.error(err.error?.message || 'No se pudo calcular el reporte'); },
    });
  }

  save() {
    const e = this.editing();
    if (!e) return;
    const emails = e.emails.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
    const body = {
      ...this.definition(e), name: e.name.trim(), chart: e.chart, pinned: e.pinned, sharedRoles: e.sharedRoles,
      schedule: e.scheduled ? { frequency: e.frequency, emails } : null,
    };
    this.busy.set(true);
    const req = e._id ? this.http.patch<SavedReport>(`${this.base}/${e._id}`, body) : this.http.post<SavedReport>(this.base, body);
    req.subscribe({
      next: () => { this.busy.set(false); this.editing.set(null); this.toast.success('Reporte guardado'); this.load(); },
      error: (err) => { this.busy.set(false); this.toast.error(err.error?.message || 'No se pudo guardar el reporte'); },
    });
  }

  togglePin(r: SavedReport) {
    this.http.patch<SavedReport>(`${this.base}/${r._id}`, { pinned: !r.pinned }).subscribe({
      next: (u) => { this.items.update((l) => l.map((x) => (x._id === r._id ? { ...x, pinned: u.pinned } : x))); this.toast.success(u.pinned ? 'Fijado en el dashboard' : 'Quitado del dashboard'); },
      error: (err) => this.toast.error(err.error?.message || 'No se pudo cambiar'),
    });
  }

  async remove(r: SavedReport) {
    const ok = await this.confirm.confirm({ title: 'Eliminar reporte', message: `Se eliminará "${r.name}" para todos los que lo ven.`, confirmText: 'Eliminar', danger: true });
    if (!ok) return;
    this.http.delete(`${this.base}/${r._id}`).subscribe({
      next: () => { this.items.update((l) => l.filter((x) => x._id !== r._id)); this.toast.success('Reporte eliminado'); },
      error: (err) => this.toast.error(err.error?.message || 'No se pudo eliminar'),
    });
  }

  sendNow(r: SavedReport) {
    this.http.post<{ sent: number }>(`${this.base}/${r._id}/send`, {}).subscribe({
      next: (s) => this.toast.success(`Reporte enviado a ${s.sent} ${s.sent === 1 ? 'correo' : 'correos'}`),
      error: (err) => this.toast.error(err.error?.message || 'No se pudo enviar'),
    });
  }

  exportCsv(r: SavedReport) {
    this.http.get(`${this.base}/${r._id}/export.csv`, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${r.name}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.toast.error('No se pudo exportar'),
    });
  }
}
