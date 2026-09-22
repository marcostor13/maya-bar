import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  LucideAngularModule, Radar, Plus, Search, Sparkles, FileText, Target, Trash2, ArrowRight, X,
  Building2, AlertTriangle, Settings, Loader2, CheckCircle2, CircleSlash,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { ProspectingApiService } from '../../core/api/prospecting-api.service';
import {
  PROSPECT_STATUSES, Prospect, ProspectSearch, ProspectingIntegrations, isBusy,
} from '../../shared/models/prospecting.model';
import { ProspectDrawerComponent } from './prospect-drawer';

type View = 'searches' | 'prospects';

/** Último perfil de servicios escrito: se ofrece al crear la siguiente búsqueda. */
const SERVICES_KEY = 'prospecting.services';

@Component({
  selector: 'app-prospecting',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideAngularModule, ProspectDrawerComponent],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1 class="page-title">Prospección</h1>
          <p class="page-subtitle">Encuentra empresas que necesitan tus servicios, investígalas a fondo y conviértelas en clientes</p>
        </div>
        <button class="btn btn-primary btn-lg" (click)="openForm()">
          <lucide-icon [img]="Plus" [size]="18"></lucide-icon> Nueva búsqueda
        </button>
      </div>

      @if (integrations(); as i) {
        @if (!i.ai || missing().length) {
          <div class="notice" [class.danger]="!i.ai">
            <lucide-icon [img]="AlertTriangle" [size]="18"></lucide-icon>
            <div>
              @if (!i.ai) {
                <strong>Configura una API key de IA.</strong> La prospección la necesita para definir búsquedas, calificar e investigar.
              } @else {
                <strong>Investigación parcial.</strong> Sin {{ missing().join(', ') }} algunas fuentes se omiten.
                @if (!i.places && !i.serper) { Sin Google Places ni Serper, la IA propone las empresas y conviene verificarlas. }
              }
            </div>
            <a class="btn btn-sm btn-secondary" routerLink="/settings"><lucide-icon [img]="Settings" [size]="14"></lucide-icon> Configurar</a>
          </div>
        }
      }

      <div class="view-tabs">
        <button class="view-tab" [class.active]="view() === 'searches'" (click)="setView('searches')">Búsquedas</button>
        <button class="view-tab" [class.active]="view() === 'prospects'" (click)="setView('prospects')">Todos los prospectos</button>
      </div>

      @if (view() === 'searches') {
        @if (loading()) {
          <div class="skeleton"></div>
        } @else if (!searches().length) {
          <div class="hero">
            <span class="hero-icon"><lucide-icon [img]="Radar" [size]="34"></lucide-icon></span>
            <h2 class="hero-title">Tus próximos clientes ya existen</h2>
            <p class="hero-text">Describe lo que vendes y a quién. La IA busca empresas que encajen, las investiga (web, velocidad, redes, reseñas y personas) y prepara material para acercarte.</p>
            <div class="hero-steps">
              @for (s of intro; track s.label; let i = $index) {
                <div class="hero-step">
                  <span class="hero-step-icon"><lucide-icon [img]="s.icon" [size]="20"></lucide-icon></span>
                  <span class="hero-step-n">Paso {{ i + 1 }}</span>
                  <span class="hero-step-label">{{ s.label }}</span>
                </div>
              }
            </div>
            <button class="btn btn-primary btn-lg" (click)="openForm()"><lucide-icon [img]="Sparkles" [size]="18"></lucide-icon> Empezar</button>
          </div>
        } @else {
          <div class="grid">
            @for (s of searches(); track s._id) {
              <div class="card" (click)="openSearch(s)" (keydown.enter)="openSearch(s)" tabindex="0" role="link">
                <div class="card-top">
                  <span [class]="'badge ' + statusCls(s)">{{ statusLabel(s) }}</span>
                  <button class="btn btn-icon btn-ghost btn-sm del" aria-label="Eliminar búsqueda" (click)="removeSearch(s, $event)">
                    <lucide-icon [img]="Trash2" [size]="14"></lucide-icon>
                  </button>
                </div>
                <h3 class="card-title">{{ s.name }}</h3>
                @if (s.status === 'searching') {
                  <p class="card-text"><lucide-icon [img]="Loader2" [size]="13" class="spin"></lucide-icon> {{ s.progress || 'En cola…' }}</p>
                } @else if (s.status === 'failed') {
                  <p class="card-text error">{{ s.error }}</p>
                } @else {
                  <p class="card-text">{{ s.idealProfile || s.idealCustomer || s.services }}</p>
                }
                <div class="stats">
                  <span><lucide-icon [img]="Building2" [size]="14"></lucide-icon> {{ s.total ?? 0 }} empresas</span>
                  <span><lucide-icon [img]="Search" [size]="14"></lucide-icon> {{ s.researched ?? 0 }} investigadas</span>
                  <span><lucide-icon [img]="Target" [size]="14"></lucide-icon> {{ s.converted ?? 0 }} en seguimiento</span>
                </div>
                <div class="card-foot">
                  <span class="date">{{ formatDate(s.createdAt) }}{{ s.location ? ' · ' + s.location : '' }}</span>
                  <span class="cta">Ver <lucide-icon [img]="ArrowRight" [size]="14"></lucide-icon></span>
                </div>
              </div>
            }
          </div>
        }
      } @else {
        <div class="toolbar">
          <input class="input search" type="search" placeholder="Buscar por nombre, sector o ciudad" [(ngModel)]="q" (keyup.enter)="loadProspects()" />
          <select class="select" [(ngModel)]="statusFilter" (ngModelChange)="loadProspects()">
            <option value="">Todos los estados</option>
            @for (st of statuses; track st.key) { <option [value]="st.key">{{ st.label }}</option> }
          </select>
        </div>
        <div class="table-card table-wrap table-cards">
          <table>
            <thead><tr><th>Empresa</th><th>Encaje</th><th>Estado</th><th>Investigación</th><th>Material</th></tr></thead>
            <tbody>
              @for (p of prospects(); track p._id) {
                <tr (click)="selected.set(p._id)" class="row">
                  <td>
                    <div class="company">
                      <div class="name">{{ p.name }}</div>
                      <div class="sub">{{ p.industry || '—' }}{{ p.address ? ' · ' + p.address : '' }}</div>
                    </div>
                  </td>
                  <td data-label="Encaje"><span class="fit" [attr.data-level]="level(p.fitScore)">{{ p.fitScore }}</span></td>
                  <td data-label="Estado"><span [class]="'badge ' + prospectStatus(p).cls">{{ prospectStatus(p).label }}</span></td>
                  <td data-label="Investigación">{{ jobLabel(p.research.state) }}</td>
                  <td data-label="Material">{{ jobLabel(p.material.state) }}</td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="empty-row">{{ loadingProspects() ? 'Cargando…' : 'No hay prospectos con estos filtros.' }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <!-- ───── Nueva búsqueda ───── -->
    @if (formOpen()) {
      <div class="overlay" (click)="formOpen.set(false)" role="dialog" aria-modal="true">
        <aside class="drawer" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <div>
              <h2>Nueva búsqueda</h2>
              <p class="subtitle">Cuanto más detalles tus servicios, mejor elige la IA a quién buscar</p>
            </div>
            <button class="btn btn-ghost btn-icon" (click)="formOpen.set(false)" aria-label="Cerrar"><lucide-icon [img]="X" [size]="20"></lucide-icon></button>
          </div>
          <div class="drawer-scroll">
            <div class="field">
              <label class="label" for="svc">Servicios que ofreces *</label>
              <textarea id="svc" class="textarea" rows="8" [(ngModel)]="form.services"
                placeholder="Ej. Desarrollamos webs y tiendas online, gestionamos Google Ads y Meta Ads, automatizamos la atención por WhatsApp con IA… Incluye precios aproximados, casos de éxito y qué te diferencia."></textarea>
              <span class="hint">Se recuerda para tus próximas búsquedas.</span>
            </div>
            <div class="field">
              <label class="label" for="ideal">Cliente ideal</label>
              <textarea id="ideal" class="textarea" rows="3" [(ngModel)]="form.idealCustomer"
                placeholder="Ej. negocios locales con 5–50 empleados, con buena reputación en Google pero web anticuada o sin web"></textarea>
            </div>
            <div class="field-row">
              <div class="field">
                <label class="label" for="loc">Zona</label>
                <input id="loc" class="input" [(ngModel)]="form.location" placeholder="Ej. Miraflores, Lima" />
              </div>
              <div class="field">
                <label class="label" for="max">Empresas a guardar</label>
                <select id="max" class="select" [(ngModel)]="form.maxResults">
                  @for (n of [10, 20, 30, 40, 60]; track n) { <option [ngValue]="n">{{ n }}</option> }
                </select>
              </div>
            </div>
            <div class="field">
              <label class="label" for="ind">Sectores a priorizar</label>
              <input id="ind" class="input" [(ngModel)]="form.industries" placeholder="Separados por coma: clínicas dentales, inmobiliarias, gimnasios" />
            </div>
            <div class="field">
              <label class="label" for="name">Nombre de la búsqueda</label>
              <input id="name" class="input" [(ngModel)]="form.name" placeholder="Opcional" />
            </div>
          </div>
          <div class="drawer-footer">
            <button class="btn btn-ghost" (click)="formOpen.set(false)">Cancelar</button>
            <button class="btn btn-primary" (click)="create()" [disabled]="saving() || !form.services.trim()">
              <lucide-icon [img]="Radar" [size]="16"></lucide-icon> {{ saving() ? 'Creando…' : 'Buscar empresas' }}
            </button>
          </div>
        </aside>
      </div>
    }

    @if (selected(); as id) {
      <app-prospect-drawer [prospectId]="id" (closed)="selected.set(null)" (changed)="onChanged($event)" (removed)="onRemoved($event)" />
    }
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
    .page-title { font-family: var(--font-heading); font-size: 26px; font-weight: 700; color: var(--color-text-main); margin: 0 0 4px; }
    .page-subtitle { font-size: 14px; color: var(--color-text-muted); margin: 0; }

    .notice { display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-radius: var(--radius-md); background: color-mix(in srgb, var(--color-warning) 10%, var(--color-white)); color: var(--color-text-main); font-size: 13.5px; margin-bottom: 20px; }
    .notice lucide-icon { color: var(--color-warning); flex-shrink: 0; }
    .notice.danger { background: color-mix(in srgb, var(--color-error) 8%, var(--color-white)); }
    .notice.danger lucide-icon { color: var(--color-error); }
    .notice > div { flex: 1; min-width: 0; }

    .view-tabs { display: inline-flex; gap: 4px; padding: 4px; background: var(--color-white); border-radius: var(--radius-pill); box-shadow: var(--shadow-sm); margin-bottom: 20px; }
    .view-tab { border: none; background: none; padding: 9px 18px; border-radius: var(--radius-pill); font: 600 13.5px var(--font-base); color: var(--color-text-muted); cursor: pointer; transition: all var(--transition-fast); }
    .view-tab.active { background: var(--color-brand); color: var(--color-white); box-shadow: var(--shadow-brand); }

    .hero { background: linear-gradient(160deg, var(--color-white) 40%, var(--color-brand-light)); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); padding: 56px 32px; text-align: center; display: flex; flex-direction: column; align-items: center; }
    .hero-icon { width: 76px; height: 76px; border-radius: 24px; background: var(--color-brand); color: var(--color-white); display: grid; place-items: center; box-shadow: var(--shadow-brand); }
    .hero-title { font-family: var(--font-heading); font-size: 26px; font-weight: 700; margin: 24px 0 10px; }
    .hero-text { font-size: 15px; color: var(--color-text-muted); max-width: 580px; line-height: 1.6; margin: 0; }
    .hero-steps { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 32px 0; width: 100%; max-width: 760px; }
    .hero-step { background: var(--color-white); border-radius: var(--radius-md); padding: 18px 12px; box-shadow: var(--shadow-sm); display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .hero-step-icon { color: var(--color-brand); }
    .hero-step-n { font-size: 11px; font-weight: 600; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: .05em; }
    .hero-step-label { font: 600 14px var(--font-heading); }

    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
    .card { background: var(--color-white); border-radius: var(--radius-lg); padding: 24px; box-shadow: var(--shadow-sm); cursor: pointer; transition: all var(--transition-smooth); display: flex; flex-direction: column; min-width: 0; }
    .card:hover, .card:focus-visible { transform: translateY(-4px); box-shadow: var(--shadow-lg); outline: none; }
    .card-top { display: flex; justify-content: space-between; align-items: center; }
    .del { color: var(--color-text-muted) !important; }
    .del:hover { color: var(--color-error) !important; }
    .card-title { font: 600 18px var(--font-heading); margin: 14px 0 4px; overflow-wrap: anywhere; }
    .card-text { font-size: 13px; color: var(--color-text-muted); margin: 0; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .card-text.error { color: var(--color-error); }
    .stats { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 16px; font-size: 13px; color: var(--color-text-muted); }
    .stats span { display: inline-flex; align-items: center; gap: 5px; }
    .card-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: auto; padding-top: 18px; }
    .date { font-size: 12px; color: var(--color-text-muted); min-width: 0; overflow-wrap: anywhere; }
    .cta { display: inline-flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 600; color: var(--color-brand); flex-shrink: 0; }

    .toolbar { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
    .toolbar .search { flex: 1; min-width: 200px; }
    .toolbar .select { max-width: 220px; min-width: 0; }
    .table-card { background: var(--color-white); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
    table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--color-text-muted); padding: 14px 16px; border-bottom: 1px solid var(--color-border); }
    td { padding: 14px 16px; border-bottom: 1px solid var(--color-border); vertical-align: middle; }
    .row { cursor: pointer; transition: background var(--transition-fast); }
    .row:hover { background: var(--color-bg-light); }
    .company { min-width: 0; text-align: left; }
    .name { font-weight: 600; overflow-wrap: anywhere; }
    .sub { font-size: 12px; color: var(--color-text-muted); overflow-wrap: anywhere; }
    .fit { display: inline-grid; place-items: center; min-width: 34px; height: 26px; padding: 0 8px; border-radius: var(--radius-pill); font-weight: 700; font-size: 12.5px; }
    .fit[data-level="high"] { color: var(--color-success); background: color-mix(in srgb, var(--color-success) 12%, transparent); }
    .fit[data-level="mid"] { color: var(--color-warning); background: color-mix(in srgb, var(--color-warning) 12%, transparent); }
    .fit[data-level="low"] { color: var(--color-error); background: color-mix(in srgb, var(--color-error) 10%, transparent); }
    .empty-row { text-align: center; color: var(--color-text-muted); padding: 32px; }

    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 100; }
    .drawer { margin-left: auto; height: 100%; width: min(560px, 100%); background: var(--color-white); display: flex; flex-direction: column; box-shadow: var(--shadow-lg); animation: slideIn var(--transition-spring); }
    @keyframes slideIn { from { transform: translateX(30px); opacity: 0; } to { transform: none; opacity: 1; } }
    .drawer-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 24px 28px 16px; padding-top: calc(24px + var(--safe-top)); border-bottom: 1px solid var(--color-border); }
    .drawer-header h2 { margin: 0 0 3px; font-family: var(--font-heading); font-size: 20px; }
    .subtitle { margin: 0; font-size: 13px; color: var(--color-text-muted); }
    .drawer-scroll { flex: 1; overflow-y: auto; padding: 20px 28px; display: flex; flex-direction: column; gap: 18px; }
    .drawer-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 28px; padding-bottom: calc(16px + var(--safe-bottom)); border-top: 1px solid var(--color-border); }
    .field { display: flex; flex-direction: column; gap: 6px; min-width: 0; flex: 1; }
    .field-row { display: flex; gap: 12px; }
    .label { font-size: 13px; font-weight: 600; color: var(--color-text-main); }
    .hint { font-size: 12px; color: var(--color-text-muted); }

    .spin { animation: spin 1s linear infinite; display: inline-flex; vertical-align: middle; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .skeleton { height: 280px; border-radius: var(--radius-lg); background: linear-gradient(90deg, var(--color-bg-app) 25%, var(--color-white) 50%, var(--color-bg-app) 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
    @keyframes shimmer { to { background-position: -200% 0; } }

    @media (max-width: 768px) {
      .page { padding: 20px 16px; }
      .page-header { flex-direction: column; }
      .page-header .btn { width: 100%; justify-content: center; }
      .notice { flex-wrap: wrap; }
      .hero { padding: 36px 20px; }
      .hero-title { font-size: 21px; }
      .hero-steps { grid-template-columns: 1fr 1fr; }
      .hero .btn { width: 100%; justify-content: center; }
      .grid { grid-template-columns: 1fr; }
      .view-tabs { display: flex; }
      .view-tab { flex: 1; }
      .toolbar .select { max-width: none; flex: 1; }
      .drawer-header, .drawer-scroll, .drawer-footer { padding-left: 16px; padding-right: 16px; }
      .drawer-footer .btn { flex: 1; justify-content: center; }
      .field-row { flex-direction: column; }
    }
  `],
})
export class ProspectingComponent implements OnInit {
  private api = inject(ProspectingApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  readonly Radar = Radar; readonly Plus = Plus; readonly Search = Search; readonly Sparkles = Sparkles;
  readonly Target = Target; readonly Trash2 = Trash2; readonly ArrowRight = ArrowRight; readonly X = X;
  readonly Building2 = Building2; readonly AlertTriangle = AlertTriangle; readonly Settings = Settings;
  readonly Loader2 = Loader2; readonly CheckCircle2 = CheckCircle2; readonly CircleSlash = CircleSlash;

  readonly statuses = PROSPECT_STATUSES;
  readonly intro = [
    { label: 'Buscar empresas', icon: Radar },
    { label: 'Investigar a fondo', icon: Search },
    { label: 'Preparar material', icon: FileText },
    { label: 'Hacer seguimiento', icon: Target },
  ];

  view = signal<View>('searches');
  searches = signal<ProspectSearch[]>([]);
  loading = signal(true);
  prospects = signal<Prospect[]>([]);
  loadingProspects = signal(false);
  integrations = signal<ProspectingIntegrations | null>(null);
  selected = signal<string | null>(null);
  formOpen = signal(false);
  saving = signal(false);
  q = '';
  statusFilter = '';
  form = { services: '', idealCustomer: '', location: '', industries: '', maxResults: 20, name: '' };
  private timer: ReturnType<typeof setTimeout> | null = null;

  missing = computed(() => {
    const i = this.integrations();
    if (!i) return [];
    return [
      !i.places && 'Google Places',
      !i.serper && 'Serper',
      !i.hunter && 'Hunter',
    ].filter(Boolean) as string[];
  });

  ngOnInit() {
    this.destroyRef.onDestroy(() => { if (this.timer) clearTimeout(this.timer); });
    this.api.integrations().subscribe({ next: i => this.integrations.set(i), error: () => {} });
    this.load();
  }

  setView(v: View) {
    this.view.set(v);
    if (v === 'prospects') this.loadProspects();
  }

  load() {
    if (this.timer) clearTimeout(this.timer);
    this.api.searches().subscribe({
      next: (list) => {
        this.searches.set(list);
        this.loading.set(false);
        if (list.some(s => s.status === 'searching')) this.timer = setTimeout(() => this.load(), 5000);
      },
      error: (err: { error?: { message?: string } }) => {
        this.loading.set(false);
        this.toast.error(err.error?.message || 'No se pudieron cargar las búsquedas');
      },
    });
  }

  loadProspects() {
    this.loadingProspects.set(true);
    this.api.prospects({ q: this.q.trim(), status: this.statusFilter }).subscribe({
      next: (list) => { this.prospects.set(list); this.loadingProspects.set(false); },
      error: (err: { error?: { message?: string } }) => {
        this.loadingProspects.set(false);
        this.toast.error(err.error?.message || 'No se pudieron cargar los prospectos');
      },
    });
  }

  openForm() {
    let services = '';
    try { services = localStorage.getItem(SERVICES_KEY) ?? ''; } catch { /* sin almacenamiento */ }
    this.form = { services: services || this.searches()[0]?.services || '', idealCustomer: '', location: '', industries: '', maxResults: 20, name: '' };
    this.formOpen.set(true);
  }

  create() {
    if (!this.form.services.trim()) return;
    this.saving.set(true);
    try { localStorage.setItem(SERVICES_KEY, this.form.services); } catch { /* sin almacenamiento */ }
    this.api.createSearch({
      services: this.form.services,
      idealCustomer: this.form.idealCustomer,
      location: this.form.location,
      industries: this.form.industries.split(',').map(s => s.trim()).filter(Boolean),
      maxResults: this.form.maxResults,
      name: this.form.name.trim() || undefined,
    }).subscribe({
      next: (s) => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.toast.success('Búsqueda en marcha: la IA está encontrando empresas');
        this.router.navigate(['/prospeccion', s._id]);
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.saving.set(false);
        const m = err.error?.message;
        this.toast.error((Array.isArray(m) ? m[0] : m) || 'No se pudo crear la búsqueda');
      },
    });
  }

  openSearch(s: ProspectSearch) { this.router.navigate(['/prospeccion', s._id]); }

  async removeSearch(s: ProspectSearch, event: Event) {
    event.stopPropagation();
    const ok = await this.confirm.confirm({
      title: 'Eliminar búsqueda',
      message: `¿Eliminar «${s.name}» y sus prospectos? Los que ya pasaron a contactos o seguimiento se conservan.`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    this.api.removeSearch(s._id).subscribe({
      next: () => { this.toast.success('Búsqueda eliminada'); this.searches.update(l => l.filter(x => x._id !== s._id)); },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'No se pudo eliminar'),
    });
  }

  onChanged(p: Prospect) {
    this.prospects.update(list => list.map(x => (x._id === p._id ? { ...x, ...p } : x)));
  }

  onRemoved(id: string) {
    this.prospects.update(list => list.filter(x => x._id !== id));
  }

  statusLabel(s: ProspectSearch) {
    return s.status === 'searching' ? 'Buscando' : s.status === 'failed' ? 'Fallida' : `${s.found} encontradas`;
  }

  statusCls(s: ProspectSearch) {
    return s.status === 'searching' ? 'badge-info' : s.status === 'failed' ? 'badge-danger' : 'badge-success';
  }

  prospectStatus(p: Prospect) { return PROSPECT_STATUSES.find(s => s.key === p.status) ?? PROSPECT_STATUSES[0]; }

  jobLabel(state: string) {
    return isBusy(state as never) ? 'En curso…' : state === 'done' ? 'Lista' : state === 'failed' ? 'Falló' : '—';
  }

  level(score: number) { return score >= 70 ? 'high' : score >= 40 ? 'mid' : 'low'; }

  formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
