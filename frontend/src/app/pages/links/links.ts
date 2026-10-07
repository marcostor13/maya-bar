import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LucideAngularModule, Plus, X, Copy, BarChart3, Pause, Play, Trash2, Search, Link2, Layers, Globe,
  ChevronDown, ChevronUp, ExternalLink, MousePointerClick, Users, Pencil,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { PermissionsService } from '../../auth/permissions.service';
import { LinkInput, LinksApiService, ShortLink } from '../../core/api/links-api.service';
import { LinkBatchesComponent } from './link-batches';
import { LinkDomainsComponent } from './link-domains';

type ErrorLike = { error?: { message?: string | string[] } };
type Tab = 'links' | 'batches' | 'domains';

/** Links cortos con seguimiento: sueltos, en lote y con dominio propio. */
@Component({
  selector: 'app-links',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, DatePipe, RouterLink, LinkBatchesComponent, LinkDomainsComponent],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1>Links cortos</h1>
          <p class="page-sub">
            Acorta cualquier dirección, compártela por SMS, correo o WhatsApp y mide quién hace clic,
            desde dónde y con qué dispositivo.
          </p>
        </div>
        <div class="header-actions">
          <a class="btn btn-secondary" routerLink="/links/analitica">
            <lucide-icon [img]="BarChart3" [size]="16"></lucide-icon>
            Analítica general
          </a>
          @if (tab() === 'links' && canCreate()) {
            <button class="btn btn-primary" (click)="openForm()">
              <lucide-icon [img]="Plus" [size]="17" [strokeWidth]="2.5"></lucide-icon>
              Nuevo link
            </button>
          }
        </div>
      </div>

      <div class="tabs" role="tablist">
        <button class="tab" role="tab" [class.active]="tab() === 'links'" (click)="tab.set('links')">
          <lucide-icon [img]="Link2" [size]="15"></lucide-icon> Links
        </button>
        <button class="tab" role="tab" [class.active]="tab() === 'batches'" (click)="tab.set('batches')">
          <lucide-icon [img]="Layers" [size]="15"></lucide-icon> Links masivos
        </button>
        <button class="tab" role="tab" [class.active]="tab() === 'domains'" (click)="tab.set('domains')">
          <lucide-icon [img]="Globe" [size]="15"></lucide-icon> Dominios
        </button>
      </div>

      @switch (tab()) {
        @case ('links') {
          <div class="kpis">
            <div class="card kpi">
              <lucide-icon [img]="Link2" [size]="18"></lucide-icon>
              <span class="kpi-value">{{ links().length }}</span><span class="kpi-label">Links</span>
            </div>
            <div class="card kpi">
              <lucide-icon [img]="MousePointerClick" [size]="18"></lucide-icon>
              <span class="kpi-value">{{ totalClicks() }}</span><span class="kpi-label">Clics</span>
            </div>
            <div class="card kpi">
              <lucide-icon [img]="Users" [size]="18"></lucide-icon>
              <span class="kpi-value">{{ totalUnique() }}</span><span class="kpi-label">Visitantes únicos</span>
            </div>
          </div>

          <div class="search card">
            <lucide-icon [img]="Search" [size]="16"></lucide-icon>
            <input class="input" type="search" placeholder="Buscar por título, código o destino"
              [ngModel]="search()" (ngModelChange)="search.set($event)" aria-label="Buscar links" />
          </div>

          @if (loading()) {
            <div class="card skeleton"></div>
          } @else if (!visible().length) {
            <div class="card empty">
              <lucide-icon [img]="Link2" [size]="40" [strokeWidth]="1.5"></lucide-icon>
              <h3>{{ links().length ? 'Sin resultados' : 'Aún no hay links' }}</h3>
              <p>{{ links().length ? 'Prueba con otra búsqueda.' : 'Crea el primero y empieza a medir tus clics.' }}</p>
              @if (!links().length && canCreate()) {
                <button class="btn btn-primary" (click)="openForm()">
                  <lucide-icon [img]="Plus" [size]="16"></lucide-icon> Crear link
                </button>
              }
            </div>
          } @else {
            <div class="table-wrap card">
              <table>
                <thead>
                  <tr><th>Link</th><th>Destino</th><th class="num">Clics</th><th class="num">Únicos</th><th>Último clic</th><th>Estado</th><th></th></tr>
                </thead>
                <tbody>
                  @for (l of visible(); track l._id) {
                    <tr>
                      <td data-label="Link">
                        <div class="t-title">{{ l.title || l.code }}</div>
                        <button class="short" (click)="copy(l.shortUrl)" title="Copiar link">
                          {{ l.shortUrl }} <lucide-icon [img]="Copy" [size]="12"></lucide-icon>
                        </button>
                      </td>
                      <td data-label="Destino">
                        <a class="dest" [href]="l.destination" target="_blank" rel="noopener" [title]="l.destination">
                          {{ l.destination }}
                        </a>
                      </td>
                      <td class="num strong" data-label="Clics">{{ l.clicks }}</td>
                      <td class="num" data-label="Únicos">{{ l.uniqueClicks }}</td>
                      <td data-label="Último clic">{{ l.lastClickAt ? (l.lastClickAt | date: 'dd/MM/yyyy HH:mm') : '—' }}</td>
                      <td data-label="Estado">
                        <span class="badge" [class]="'badge ' + stateBadge(l)">{{ stateLabel(l) }}</span>
                      </td>
                      <td>
                        <div class="actions">
                          <a class="btn btn-secondary btn-sm" routerLink="/links/analitica" [queryParams]="{ linkId: l._id }">
                            <lucide-icon [img]="BarChart3" [size]="14"></lucide-icon> Ver
                          </a>
                          @if (canEdit()) {
                            <button class="btn btn-ghost btn-sm btn-icon" (click)="openForm(l)" title="Editar" aria-label="Editar link">
                              <lucide-icon [img]="Pencil" [size]="15"></lucide-icon>
                            </button>
                            <button class="btn btn-ghost btn-sm btn-icon" (click)="toggleStatus(l)"
                              [title]="l.status === 'active' ? 'Pausar' : 'Reactivar'" [attr.aria-label]="l.status === 'active' ? 'Pausar link' : 'Reactivar link'">
                              <lucide-icon [img]="l.status === 'active' ? Pause : Play" [size]="15"></lucide-icon>
                            </button>
                          }
                          @if (canDelete()) {
                            <button class="btn btn-ghost btn-sm btn-icon" (click)="remove(l)" title="Eliminar" aria-label="Eliminar link">
                              <lucide-icon [img]="Trash2" [size]="15"></lucide-icon>
                            </button>
                          }
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }
        @case ('batches') { <app-link-batches [domains]="activeDomains()" /> }
        @case ('domains') { <app-link-domains (changed)="loadDomains()" /> }
      }
    </div>

    @if (formOpen()) {
      <div class="overlay" (click)="formOpen.set(false)" role="dialog" aria-modal="true" aria-label="Link corto">
        <aside class="drawer" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <h2>{{ editing() ? 'Editar link' : 'Nuevo link corto' }}</h2>
            <button class="btn btn-ghost btn-icon" (click)="formOpen.set(false)" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="20"></lucide-icon>
            </button>
          </div>
          <div class="drawer-body">
            <label class="field">
              <span class="label">Dirección de destino</span>
              <input class="input" id="link-destination" [(ngModel)]="form.destination" maxlength="2000"
                placeholder="https://tu-sitio.com/pagina" />
            </label>
            <label class="field">
              <span class="label">Título (para reconocerlo)</span>
              <input class="input" [(ngModel)]="form.title" maxlength="120" placeholder="Ej. Catálogo de octubre" />
            </label>
            @if (editing(); as e) {
              <p class="hint">
                La dirección corta <strong>{{ e.shortUrl }}</strong> no cambia: quien ya la tenga
                llegará al destino nuevo.
              </p>
            } @else {
              <div class="grid2">
                <label class="field">
                  <span class="label">Dominio</span>
                  <select class="select" [(ngModel)]="form.domain">
                    <option value="">{{ defaultDomainLabel() }}</option>
                    @for (d of activeDomains(); track d) { <option [value]="d">{{ d }}</option> }
                  </select>
                </label>
                <label class="field">
                  <span class="label">Alias (opcional)</span>
                  <input class="input" [(ngModel)]="form.alias" maxlength="40" placeholder="promo-octubre" />
                </label>
              </div>
              <p class="hint">Sin alias se genera un código corto al azar. {{ previewUrl() }}</p>
            }

            <button class="btn btn-ghost btn-sm toggle" (click)="moreOpen.set(!moreOpen())">
              <lucide-icon [img]="moreOpen() ? ChevronUp : ChevronDown" [size]="14"></lucide-icon>
              Etiquetas UTM y caducidad
            </button>
            @if (moreOpen()) {
              <div class="grid2">
                <label class="field"><span class="label">utm_source</span>
                  <input class="input" [(ngModel)]="utm.source" maxlength="100" placeholder="sms" /></label>
                <label class="field"><span class="label">utm_medium</span>
                  <input class="input" [(ngModel)]="utm.medium" maxlength="100" placeholder="campaña" /></label>
                <label class="field"><span class="label">utm_campaign</span>
                  <input class="input" [(ngModel)]="utm.campaign" maxlength="100" placeholder="octubre" /></label>
                <label class="field"><span class="label">utm_content</span>
                  <input class="input" [(ngModel)]="utm.content" maxlength="100" /></label>
              </div>
              <label class="field">
                <span class="label">Caduca el</span>
                <input class="input" type="datetime-local" [(ngModel)]="form.expiresAt" />
              </label>
              <p class="hint">Las etiquetas UTM se añaden al destino para que tu analítica web identifique el origen.</p>
            }
          </div>
          <div class="drawer-footer">
            <button class="btn btn-ghost" (click)="formOpen.set(false)">Cancelar</button>
            <button class="btn btn-primary" (click)="save()" [disabled]="saving() || !form.destination.trim()">
              {{ saving() ? 'Guardando…' : (editing() ? 'Guardar cambios' : 'Crear link') }}
            </button>
          </div>
        </aside>
      </div>
    }
  `,
  styles: [`
    .page { width:100%; box-sizing:border-box; padding:32px 40px; display:flex; flex-direction:column; gap:20px; }
    .page-header { display:flex; align-items:flex-start; justify-content:space-between; gap:24px; flex-wrap:wrap; }
    h1 { font-family:var(--font-heading); margin:0 0 6px; }
    .page-sub { color:var(--color-text-muted); margin:0; max-width:640px; }
    .header-actions { display:flex; gap:10px; flex-wrap:wrap; }
    .tabs { display:flex; gap:4px; border-bottom:1px solid var(--color-border); overflow-x:auto; }
    .tab { display:inline-flex; align-items:center; gap:8px; padding:12px 16px; background:none; border:none; cursor:pointer;
      border-bottom:2px solid transparent; font-family:var(--font-base); font-size:14px; font-weight:500;
      color:var(--color-text-muted); white-space:nowrap; transition:all var(--transition-fast); }
    .tab.active { color:var(--color-brand); border-bottom-color:var(--color-brand); }
    .kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:16px; }
    .kpi { padding:20px 24px; display:grid; grid-template-columns:auto 1fr; align-items:center; column-gap:12px; color:var(--color-brand); }
    .kpi-value { font-family:var(--font-heading); font-size:26px; font-weight:700; color:var(--color-text-main); }
    .kpi-label { grid-column:1 / -1; font-size:13px; color:var(--color-text-muted); }
    .search { display:flex; align-items:center; gap:10px; padding:12px 20px; color:var(--color-text-muted); }
    .search .input { flex:1; }
    .skeleton { height:200px; background:var(--color-bg-light); }
    .empty { display:flex; flex-direction:column; align-items:center; text-align:center; gap:8px; padding:56px 24px; color:var(--color-text-muted); }
    .empty h3 { margin:8px 0 0; color:var(--color-text-main); font-family:var(--font-heading); }
    .empty p { margin:0 0 12px; }
    .num { text-align:right; }
    .strong { font-weight:700; font-size:15px; }
    .t-title { font-weight:600; margin-bottom:4px; overflow-wrap:anywhere; }
    .short { display:inline-flex; align-items:center; gap:6px; border:none; cursor:pointer; font-family:var(--font-base);
      font-size:12px; font-weight:600; background:var(--color-brand-light); color:var(--color-brand);
      border-radius:var(--radius-pill); padding:4px 10px; overflow-wrap:anywhere; text-align:left; }
    .dest { display:block; max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      color:var(--color-text-muted); font-size:13px; text-decoration:none; }
    .dest:hover { color:var(--color-brand); }
    .actions { display:flex; gap:4px; justify-content:flex-end; align-items:center; }

    .overlay { position:fixed; inset:0; background:rgba(15,23,42,0.45); backdrop-filter:blur(3px); display:flex;
      justify-content:flex-end; z-index:100; }
    .drawer { width:100%; max-width:520px; height:100%; background:var(--color-white); display:flex; flex-direction:column;
      box-shadow:var(--shadow-lg); animation:slide-in .35s var(--transition-spring); }
    @keyframes slide-in { from { transform:translateX(40px); opacity:0; } to { transform:none; opacity:1; } }
    .drawer-header { display:flex; align-items:center; justify-content:space-between; padding:24px 28px 16px; }
    .drawer-header h2 { margin:0; font-family:var(--font-heading); font-size:20px; }
    .drawer-body { flex:1; overflow-y:auto; padding:8px 28px 24px; display:flex; flex-direction:column; gap:16px; }
    .drawer-footer { display:flex; justify-content:flex-end; gap:10px; padding:16px 28px; border-top:1px solid var(--color-border); }
    .field { display:flex; flex-direction:column; gap:8px; min-width:0; }
    .label { font-size:13px; font-weight:600; color:var(--color-text-main); }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .hint { margin:0; font-size:12px; color:var(--color-text-muted); overflow-wrap:anywhere; }
    .toggle { align-self:flex-start; }
    @media (max-width: 768px) {
      .page { padding:20px 16px; }
      .drawer { max-width:100%; }
      .grid2 { grid-template-columns:1fr; }
      .dest { max-width:100%; white-space:normal; overflow-wrap:anywhere; }
    }
  `],
})
export class LinksComponent implements OnInit {
  private api = inject(LinksApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private permissions = inject(PermissionsService);

  readonly Plus = Plus; readonly X = X; readonly Copy = Copy; readonly BarChart3 = BarChart3;
  readonly Pause = Pause; readonly Play = Play; readonly Trash2 = Trash2; readonly Search = Search;
  readonly Link2 = Link2; readonly Layers = Layers; readonly Globe = Globe; readonly ChevronDown = ChevronDown;
  readonly ChevronUp = ChevronUp; readonly ExternalLink = ExternalLink;
  readonly MousePointerClick = MousePointerClick; readonly Users = Users; readonly Pencil = Pencil;

  tab = signal<Tab>('links');
  links = signal<ShortLink[]>([]);
  loading = signal(true);
  search = signal('');
  formOpen = signal(false);
  /** Link que se está editando; null al crear uno nuevo. */
  editing = signal<ShortLink | null>(null);
  moreOpen = signal(false);
  saving = signal(false);
  activeDomains = signal<string[]>([]);
  defaultDomain = signal('');
  platformBase = signal('');

  form = { destination: '', title: '', alias: '', domain: '', expiresAt: '' };
  utm = { source: '', medium: '', campaign: '', content: '' };

  canCreate = computed(() => this.permissions.canAct('campaigns', 'create'));
  canEdit = computed(() => this.permissions.canAct('campaigns', 'edit'));
  canDelete = computed(() => this.permissions.canAct('campaigns', 'delete'));

  visible = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.links();
    return this.links().filter(l =>
      l.title.toLowerCase().includes(q) || l.code.toLowerCase().includes(q) || l.destination.toLowerCase().includes(q),
    );
  });
  totalClicks = computed(() => this.links().reduce((n, l) => n + l.clicks, 0));
  totalUnique = computed(() => this.links().reduce((n, l) => n + l.uniqueClicks, 0));
  defaultDomainLabel = computed(() =>
    this.defaultDomain() ? 'Predeterminado (' + this.defaultDomain() + ')' : 'El de la plataforma',
  );

  ngOnInit() {
    this.load();
    this.loadDomains();
  }

  @HostListener('document:keydown.escape')
  onEscape() { if (this.formOpen()) this.formOpen.set(false); }

  private load() {
    this.api.list().subscribe({
      next: l => { this.links.set(l); this.loading.set(false); },
      error: (err: ErrorLike) => { this.loading.set(false); this.toast.error(this.message(err, 'No se pudieron cargar los links')); },
    });
  }

  loadDomains() {
    this.api.domains().subscribe({
      next: res => {
        const active = res.domains.filter(d => d.status === 'active');
        this.activeDomains.set(active.map(d => d.domain));
        this.defaultDomain.set(active.find(d => d.isDefault)?.domain ?? '');
        this.platformBase.set(res.platformBase);
      },
      error: () => {},
    });
  }

  previewUrl(): string {
    const domain = this.form.domain || this.defaultDomain();
    const base = domain ? 'https://' + domain + '/' : this.platformBase();
    return base ? 'Quedará como ' + base + (this.form.alias.trim() || 'aB3xK9p') : '';
  }

  stateLabel(l: ShortLink) {
    if (l.expiresAt && new Date(l.expiresAt).getTime() < Date.now()) return 'Caducado';
    return l.status === 'active' ? 'Activo' : 'Pausado';
  }
  stateBadge(l: ShortLink) {
    const label = this.stateLabel(l);
    return label === 'Activo' ? 'badge-success' : label === 'Pausado' ? 'badge-warning' : 'badge-neutral';
  }

  openForm(link: ShortLink | null = null) {
    this.editing.set(link);
    this.form = {
      destination: link?.destination ?? '',
      title: link?.title ?? '',
      alias: '',
      domain: '',
      expiresAt: link?.expiresAt ? this.toLocalInput(new Date(link.expiresAt)) : '',
    };
    this.utm = {
      source: link?.utm?.source ?? '',
      medium: link?.utm?.medium ?? '',
      campaign: link?.utm?.campaign ?? '',
      content: link?.utm?.content ?? '',
    };
    // Al editar se abren si ya tienen algo, para que no pase desapercibido.
    this.moreOpen.set(!!link && (!!link.expiresAt || Object.values(this.utm).some(Boolean)));
    this.formOpen.set(true);
    setTimeout(() => document.getElementById('link-destination')?.focus());
  }

  private toLocalInput(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
      'T' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  private saveEdit(link: ShortLink) {
    this.saving.set(true);
    this.api
      .update(link._id, {
        destination: this.form.destination.trim(),
        title: this.form.title.trim(),
        // Se manda siempre: vacío quita la caducidad o las etiquetas que hubiera.
        expiresAt: this.form.expiresAt ? new Date(this.form.expiresAt).toISOString() : '',
        utm: Object.fromEntries(Object.entries(this.utm).filter(([, v]) => v.trim())),
      })
      .subscribe({
        next: updated => {
          this.saving.set(false);
          this.formOpen.set(false);
          this.links.update(list => list.map(x => (x._id === updated._id ? updated : x)));
          this.toast.success('Link actualizado');
        },
        error: (err: ErrorLike) => { this.saving.set(false); this.toast.error(this.message(err, 'No se pudo actualizar el link')); },
      });
  }

  save() {
    const current = this.editing();
    if (current) { this.saveEdit(current); return; }
    const input: LinkInput = {
      destination: this.form.destination.trim(),
      title: this.form.title.trim() || undefined,
      alias: this.form.alias.trim() || undefined,
      // Vacío = que el backend use el predeterminado (o el de la plataforma).
      domain: this.form.domain || undefined,
      expiresAt: this.form.expiresAt ? new Date(this.form.expiresAt).toISOString() : undefined,
    };
    const utm = Object.fromEntries(Object.entries(this.utm).filter(([, v]) => v.trim()));
    if (Object.keys(utm).length) input.utm = utm;
    this.saving.set(true);
    this.api.create(input).subscribe({
      next: link => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.links.update(list => [link, ...list]);
        this.copy(link.shortUrl, 'Link creado y copiado');
      },
      error: (err: ErrorLike) => { this.saving.set(false); this.toast.error(this.message(err, 'No se pudo crear el link')); },
    });
  }

  toggleStatus(l: ShortLink) {
    const status = l.status === 'active' ? 'paused' : 'active';
    this.api.update(l._id, { status }).subscribe({
      next: updated => {
        this.links.update(list => list.map(x => (x._id === updated._id ? updated : x)));
        this.toast.success(status === 'paused' ? 'Link pausado: deja de redirigir' : 'Link reactivado');
      },
      error: (err: ErrorLike) => this.toast.error(this.message(err, 'No se pudo cambiar el estado')),
    });
  }

  async remove(l: ShortLink) {
    const ok = await this.confirm.confirm({
      title: 'Eliminar link',
      message: 'El link ' + l.shortUrl + ' dejará de funcionar y se perderá su historial de clics.',
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    this.api.remove(l._id).subscribe({
      next: () => { this.links.update(list => list.filter(x => x._id !== l._id)); this.toast.success('Link eliminado'); },
      error: (err: ErrorLike) => this.toast.error(this.message(err, 'No se pudo eliminar')),
    });
  }

  copy(text: string, okMessage = 'Link copiado') {
    navigator.clipboard.writeText(text).then(
      () => this.toast.success(okMessage),
      () => this.toast.error('No se pudo copiar'),
    );
  }

  private message(err: ErrorLike, fallback: string): string {
    const m = err.error?.message;
    return (Array.isArray(m) ? m[0] : m) || fallback;
  }
}
