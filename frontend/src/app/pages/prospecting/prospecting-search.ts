import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  LucideAngularModule, ArrowLeft, Search, Plus, RefreshCw, Loader2, X, Star, Globe, AlertTriangle,
  ChevronDown, ChevronUp,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ProspectingApiService } from '../../core/api/prospecting-api.service';
import {
  PROSPECT_STATUSES, Prospect, ProspectSearch, isBusy,
} from '../../shared/models/prospecting.model';
import { ProspectDrawerComponent } from './prospect-drawer';

const SOURCE_LABEL: Record<string, string> = {
  google_places: 'Google Maps', serper: 'Google', ai: 'IA', manual: 'Manual',
};

@Component({
  selector: 'app-prospecting-search',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideAngularModule, ProspectDrawerComponent],
  template: `
    <div class="page animate-fade-in">
      <a class="back" routerLink="/prospeccion"><lucide-icon [img]="ArrowLeft" [size]="16"></lucide-icon> Prospección</a>

      @if (search(); as s) {
        <div class="page-header">
          <div class="head-text">
            <h1 class="page-title">{{ s.name }}</h1>
            <p class="page-subtitle">{{ s.location || 'Sin zona' }} · {{ s.prospects?.length ?? 0 }} empresas · {{ sourcesText(s) }}</p>
          </div>
          <div class="head-actions">
            <button class="btn btn-secondary" (click)="openAdd()"><lucide-icon [img]="Plus" [size]="16"></lucide-icon> Agregar empresa</button>
            @if (s.status !== 'searching') {
              <button class="btn btn-ghost" (click)="retry()"><lucide-icon [img]="RefreshCw" [size]="16"></lucide-icon> Buscar más</button>
            }
          </div>
        </div>

        @if (s.status === 'searching') {
          <div class="progress-card">
            <lucide-icon [img]="Loader2" [size]="22" class="spin"></lucide-icon>
            <div>
              <strong>Buscando empresas…</strong>
              <p>{{ s.progress || 'En cola…' }}</p>
            </div>
          </div>
        } @else if (s.status === 'failed' || s.error) {
          <div class="alert"><lucide-icon [img]="AlertTriangle" [size]="16"></lucide-icon> {{ s.error }}</div>
        }

        <div class="brief">
          <button class="brief-toggle" (click)="briefOpen.set(!briefOpen())">
            Perfil de la búsqueda <lucide-icon [img]="briefOpen() ? ChevronUp : ChevronDown" [size]="16"></lucide-icon>
          </button>
          @if (briefOpen()) {
            <div class="brief-body">
              @if (s.idealProfile) { <div><span class="brief-label">Cliente ideal según la IA</span><p>{{ s.idealProfile }}</p></div> }
              <div><span class="brief-label">Servicios</span><p class="pre">{{ s.services }}</p></div>
              @if (s.queries.length) {
                <div><span class="brief-label">Búsquedas realizadas</span>
                  <div class="tags">@for (q of s.queries; track q) { <span class="tag">{{ q }}</span> }</div>
                </div>
              }
            </div>
          }
        </div>

        <div class="toolbar">
          <div class="filters">
            <button class="chip" [class.active]="!filter()" (click)="filter.set('')">Todas ({{ s.prospects?.length ?? 0 }})</button>
            @for (st of statuses; track st.key) {
              @if (countBy(st.key); as n) {
                <button class="chip" [class.active]="filter() === st.key" (click)="filter.set(st.key)">{{ st.label }} ({{ n }})</button>
              }
            }
          </div>
          <div class="bulk">
            <span class="muted">{{ selectedIds().size }} seleccionadas</span>
            <button class="btn btn-primary" (click)="researchSelected()" [disabled]="!selectedIds().size || queuing()">
              <lucide-icon [img]="Search" [size]="16"></lucide-icon> Investigar
            </button>
          </div>
        </div>

        <div class="table-card table-wrap table-cards">
          <table>
            <thead>
              <tr>
                <th class="check"><input type="checkbox" [checked]="allSelected()" (change)="toggleAll()" aria-label="Seleccionar todas" /></th>
                <th>Empresa</th><th>Encaje</th><th>Google</th><th>Estado</th><th>Investigación</th>
              </tr>
            </thead>
            <tbody>
              @for (p of visible(); track p._id) {
                <tr class="row" (click)="selected.set(p._id)">
                  <td class="check" data-label="" (click)="$event.stopPropagation()">
                    <label class="check-label"><input type="checkbox" [checked]="selectedIds().has(p._id)" (change)="toggle(p._id)" [attr.aria-label]="'Seleccionar ' + p.name" /> <span class="only-mobile">Seleccionar</span></label>
                  </td>
                  <td data-label="">
                    <div class="company">
                    <div class="name">{{ p.name }}</div>
                    <div class="sub">{{ p.industry || '—' }} · {{ sourceLabel(p.source) }}
                      @if (p.website) { · <lucide-icon [img]="Globe" [size]="11"></lucide-icon> {{ p.domain || 'web' }} } @else { · sin web }
                    </div>
                    @if (p.fitReason) { <div class="reason">{{ p.fitReason }}</div> }
                    </div>
                  </td>
                  <td data-label="Encaje"><span class="fit" [attr.data-level]="level(p.fitScore)">{{ p.fitScore }}</span></td>
                  <td data-label="Google">
                    @if (p.rating) { <span class="rating"><lucide-icon [img]="Star" [size]="12"></lucide-icon> {{ p.rating }} ({{ p.reviewsCount ?? 0 }})</span> } @else { — }
                  </td>
                  <td data-label="Estado"><span [class]="'badge ' + statusOf(p).cls">{{ statusOf(p).label }}</span></td>
                  <td data-label="Investigación">
                    @switch (p.research.state) {
                      @case ('done') { <span class="job ok">Investigada{{ p.material.state === 'done' ? ' · material' : '' }}</span> }
                      @case ('failed') { <span class="job fail">Falló</span> }
                      @case ('idle') { <span class="job">Pendiente</span> }
                      @default { <span class="job run"><lucide-icon [img]="Loader2" [size]="12" class="spin"></lucide-icon> {{ p.research.state === 'queued' ? 'En cola' : 'Investigando' }}</span> }
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="empty-row">{{ s.status === 'searching' ? 'Las empresas aparecerán aquí en cuanto termine la búsqueda.' : 'No hay empresas en esta vista.' }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="skeleton"></div>
      }
    </div>

    @if (addOpen()) {
      <div class="overlay" (click)="addOpen.set(false)" role="dialog" aria-modal="true">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <h2>Agregar empresa</h2>
            <button class="btn btn-ghost btn-icon" (click)="addOpen.set(false)" aria-label="Cerrar"><lucide-icon [img]="X" [size]="18"></lucide-icon></button>
          </div>
          <div class="field"><label class="label" for="an">Nombre *</label><input id="an" class="input" [(ngModel)]="add.name" /></div>
          <div class="field"><label class="label" for="aw">Web</label><input id="aw" class="input" [(ngModel)]="add.website" placeholder="empresa.com" /></div>
          <div class="field"><label class="label" for="ap">Teléfono</label><input id="ap" class="input" [(ngModel)]="add.phone" /></div>
          <div class="field"><label class="label" for="ai">Sector</label><input id="ai" class="input" [(ngModel)]="add.industry" /></div>
          <div class="field"><label class="label" for="aa">Dirección / ciudad</label><input id="aa" class="input" [(ngModel)]="add.address" /></div>
          <div class="modal-foot">
            <button class="btn btn-ghost" (click)="addOpen.set(false)">Cancelar</button>
            <button class="btn btn-primary" (click)="saveAdd()" [disabled]="!add.name.trim() || queuing()">Agregar</button>
          </div>
        </div>
      </div>
    }

    @if (selected(); as id) {
      <app-prospect-drawer [prospectId]="id" (closed)="selected.set(null)" (changed)="onChanged($event)" (removed)="onRemoved($event)" />
    }
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    .back { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--color-text-muted); text-decoration: none; margin-bottom: 12px; }
    .back:hover { color: var(--color-brand); }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 20px; }
    .head-text { min-width: 0; }
    .page-title { font-family: var(--font-heading); font-size: 26px; font-weight: 700; margin: 0 0 4px; overflow-wrap: anywhere; }
    .page-subtitle { font-size: 14px; color: var(--color-text-muted); margin: 0; }
    .head-actions { display: flex; gap: 8px; flex-shrink: 0; }

    .progress-card { display: flex; gap: 14px; align-items: center; padding: 18px 22px; border-radius: var(--radius-lg); background: color-mix(in srgb, var(--color-ai) 8%, var(--color-white)); color: var(--color-ai); margin-bottom: 16px; }
    .progress-card p { margin: 2px 0 0; font-size: 13px; color: var(--color-text-muted); }
    .progress-card strong { color: var(--color-text-main); }
    .alert { display: flex; gap: 10px; align-items: center; padding: 12px 16px; border-radius: var(--radius-md); background: color-mix(in srgb, var(--color-error) 8%, var(--color-white)); color: var(--color-error); font-size: 13px; margin-bottom: 16px; }

    .brief { background: var(--color-white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); margin-bottom: 16px; }
    .brief-toggle { width: 100%; display: flex; justify-content: space-between; align-items: center; background: none; border: none; padding: 16px 24px; font: 600 14px var(--font-heading); cursor: pointer; color: var(--color-text-main); }
    .brief-body { padding: 0 24px 20px; display: flex; flex-direction: column; gap: 14px; font-size: 13.5px; }
    .brief-body p { margin: 4px 0 0; line-height: 1.55; overflow-wrap: anywhere; }
    .pre { white-space: pre-wrap; }
    .brief-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: var(--color-text-muted); }
    .tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .tag { font-size: 12px; padding: 4px 10px; border-radius: var(--radius-pill); background: var(--color-bg-app); border: 1px solid var(--color-border); }

    .toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
    .filters { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; min-width: 0; }
    .chip { flex: 0 0 auto; border: 1.5px solid var(--color-border); background: var(--color-white); color: var(--color-text-muted); font: 600 12.5px var(--font-base); padding: 7px 14px; border-radius: var(--radius-pill); cursor: pointer; transition: all var(--transition-fast); }
    .chip.active { background: var(--color-brand); border-color: var(--color-brand); color: var(--color-white); }
    .bulk { display: flex; align-items: center; gap: 10px; }
    .muted { font-size: 13px; color: var(--color-text-muted); }

    .table-card { background: var(--color-white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
    table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--color-text-muted); padding: 14px 16px; border-bottom: 1px solid var(--color-border); white-space: nowrap; }
    td { padding: 14px 16px; border-bottom: 1px solid var(--color-border); vertical-align: middle; }
    th.check, td.check { width: 36px; padding-right: 0; }
    input[type="checkbox"] { width: 17px; height: 17px; accent-color: var(--color-brand); cursor: pointer; }
    .check-label { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; }
    .only-mobile { display: none; }
    .row { cursor: pointer; transition: background var(--transition-fast); }
    .row:hover { background: var(--color-bg-light); }
    .company { min-width: 0; text-align: left; }
    .name { font-weight: 600; overflow-wrap: anywhere; }
    .sub { font-size: 12px; color: var(--color-text-muted); overflow-wrap: anywhere; }
    .reason { font-size: 12px; color: var(--color-text-muted); margin-top: 4px; max-width: 520px; line-height: 1.45; }
    .fit { display: inline-grid; place-items: center; min-width: 34px; height: 26px; padding: 0 8px; border-radius: var(--radius-pill); font-weight: 700; font-size: 12.5px; }
    .fit[data-level="high"] { color: var(--color-success); background: color-mix(in srgb, var(--color-success) 12%, transparent); }
    .fit[data-level="mid"] { color: var(--color-warning); background: color-mix(in srgb, var(--color-warning) 12%, transparent); }
    .fit[data-level="low"] { color: var(--color-error); background: color-mix(in srgb, var(--color-error) 10%, transparent); }
    .rating { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
    .rating lucide-icon { color: var(--color-warning); }
    .job { font-size: 12.5px; color: var(--color-text-muted); display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
    .job.ok { color: var(--color-success); font-weight: 600; }
    .job.fail { color: var(--color-error); font-weight: 600; }
    .job.run { color: var(--color-ai); font-weight: 600; }
    .empty-row { text-align: center; color: var(--color-text-muted); padding: 32px; }

    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 100; }
    .modal-card { background: var(--color-white); border-radius: var(--radius-lg); width: calc(100% - 48px); max-width: 480px; padding: 28px 32px; box-shadow: var(--shadow-lg); display: flex; flex-direction: column; gap: 14px; box-sizing: border-box; max-height: 90vh; overflow-y: auto; }
    .modal-head { display: flex; justify-content: space-between; align-items: center; }
    .modal-head h2 { margin: 0; font: 700 18px var(--font-heading); }
    .modal-foot { display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .label { font-size: 13px; font-weight: 600; }

    .spin { animation: spin 1s linear infinite; display: inline-flex; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .skeleton { height: 320px; border-radius: var(--radius-lg); background: linear-gradient(90deg, var(--color-bg-app) 25%, var(--color-white) 50%, var(--color-bg-app) 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
    @keyframes shimmer { to { background-position: -200% 0; } }

    @media (max-width: 768px) {
      .page { padding: 20px 16px; }
      .page-header { flex-direction: column; }
      .head-actions { width: 100%; }
      .head-actions .btn { flex: 1; justify-content: center; }
      .toolbar { flex-direction: column; align-items: stretch; }
      .filters { margin: 0 -16px; padding: 0 16px; }
      .bulk { justify-content: space-between; }
      .only-mobile { display: inline; font-size: 13px; color: var(--color-text-muted); }
      td.check { width: auto; }
      .modal-card { width: calc(100% - 24px); padding: 22px 20px; }
    }
  `],
})
export class ProspectingSearchComponent implements OnInit {
  private api = inject(ProspectingApiService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);

  readonly ArrowLeft = ArrowLeft; readonly Search = Search; readonly Plus = Plus; readonly RefreshCw = RefreshCw;
  readonly Loader2 = Loader2; readonly X = X; readonly Star = Star; readonly Globe = Globe;
  readonly AlertTriangle = AlertTriangle; readonly ChevronDown = ChevronDown; readonly ChevronUp = ChevronUp;

  readonly statuses = PROSPECT_STATUSES;

  search = signal<ProspectSearch | null>(null);
  filter = signal('');
  selectedIds = signal<Set<string>>(new Set());
  selected = signal<string | null>(null);
  briefOpen = signal(false);
  addOpen = signal(false);
  queuing = signal(false);
  add = { name: '', website: '', phone: '', industry: '', address: '' };
  private id = '';
  private timer: ReturnType<typeof setTimeout> | null = null;

  visible = computed(() => {
    const list = this.search()?.prospects ?? [];
    const f = this.filter();
    return f ? list.filter(p => p.status === f) : list;
  });

  allSelected = computed(() => {
    const v = this.visible();
    return v.length > 0 && v.every(p => this.selectedIds().has(p._id));
  });

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    this.destroyRef.onDestroy(() => { if (this.timer) clearTimeout(this.timer); });
    this.load();
  }

  load() {
    if (this.timer) clearTimeout(this.timer);
    this.api.search(this.id).subscribe({
      next: (s) => {
        this.search.set(s);
        // La búsqueda y las investigaciones corren en segundo plano.
        const busy = s.status === 'searching' || (s.prospects ?? []).some(p => isBusy(p.research.state) || isBusy(p.material.state));
        if (busy) this.timer = setTimeout(() => this.load(), 5000);
      },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'No se pudo cargar la búsqueda'),
    });
  }

  countBy(status: string) { return (this.search()?.prospects ?? []).filter(p => p.status === status).length; }

  toggle(id: string) {
    this.selectedIds.update(set => {
      const next = new Set(set);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  toggleAll() {
    const ids = this.visible().map(p => p._id);
    this.selectedIds.set(this.allSelected() ? new Set() : new Set(ids));
  }

  researchSelected() {
    const ids = [...this.selectedIds()];
    if (!ids.length) return;
    this.queuing.set(true);
    this.api.research(ids).subscribe({
      next: (res) => {
        this.queuing.set(false);
        this.selectedIds.set(new Set());
        this.toast.success(res.queued
          ? `${res.queued} ${res.queued === 1 ? 'empresa en cola' : 'empresas en cola'} de investigación`
          : 'Las empresas seleccionadas ya se están investigando');
        this.load();
      },
      error: (err: { error?: { message?: string } }) => { this.queuing.set(false); this.toast.error(err.error?.message || 'No se pudo iniciar la investigación'); },
    });
  }

  retry() {
    this.api.retrySearch(this.id).subscribe({
      next: () => { this.toast.success('Buscando más empresas…'); this.load(); },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'No se pudo relanzar la búsqueda'),
    });
  }

  openAdd() {
    this.add = { name: '', website: '', phone: '', industry: '', address: '' };
    this.addOpen.set(true);
  }

  saveAdd() {
    if (!this.add.name.trim()) return;
    this.queuing.set(true);
    this.api.createProspect({ ...this.add, searchId: this.id }).subscribe({
      next: () => { this.queuing.set(false); this.addOpen.set(false); this.toast.success('Empresa agregada'); this.load(); },
      error: (err: { error?: { message?: string } }) => { this.queuing.set(false); this.toast.error(err.error?.message || 'No se pudo agregar'); },
    });
  }

  onChanged(p: Prospect) {
    this.search.update(s => s && ({ ...s, prospects: (s.prospects ?? []).map(x => (x._id === p._id ? { ...x, ...p } : x)) }));
  }

  onRemoved(id: string) {
    this.search.update(s => s && ({ ...s, prospects: (s.prospects ?? []).filter(x => x._id !== id) }));
  }

  statusOf(p: Prospect) { return PROSPECT_STATUSES.find(s => s.key === p.status) ?? PROSPECT_STATUSES[0]; }

  sourceLabel(s: string) { return SOURCE_LABEL[s] ?? s; }

  sourcesText(s: ProspectSearch) {
    return s.sources.length ? `Fuentes: ${s.sources.map(x => SOURCE_LABEL[x] ?? x).join(', ')}` : 'Sin fuentes aún';
  }

  level(score: number) { return score >= 70 ? 'high' : score >= 40 ? 'mid' : 'low'; }
}
