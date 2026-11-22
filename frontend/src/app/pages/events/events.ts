import {
  Component,
  HostListener,
  OnInit,
  inject,
  signal,
  computed,
} from '@angular/core';
import { Router } from '@angular/router';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { injectRoles } from '../../shared/roles';
import { EventsApiService } from '../../core/api/events-api.service';
import { AppEvent, EventStatus, Local, EVENT_STATUS_META } from '../../shared/models/event.model';
import { EventsFilter, filterEvents, pickLocal } from './events-filter';
import {
  LucideAngularModule,
  Zap,
  Plus,
  Pencil,
  Trash2,
  Users,
  Calendar,
  ExternalLink,
  X,
  ImageIcon,
  Share2,
  Copy,
  Check,
  Download,
  MoreHorizontal,
} from 'lucide-angular';

const LOCAL_KEY = 'maya.events.localId';

const FILTERS: { key: EventsFilter; label: string }[] = [
  { key: 'upcoming', label: 'Próximos' },
  { key: 'past', label: 'Pasados' },
  { key: 'drafts', label: 'Borradores' },
];

@Component({
  selector: 'app-events',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="page animate-fade-in">

      <!-- ── Header ── -->
      <div class="page-header">
        <div>
          <h1>Eventos</h1>
          <p class="subtitle">Crea eventos, compártelos y recibe a tus invitados.</p>
        </div>
        <div class="header-actions">
          @if (locals().length > 1) {
            <select class="select local-select" [value]="selectedLocalId()" (change)="onLocalChange($event)" aria-label="Seleccionar local">
              <option value="">— Selecciona un local —</option>
              @for (l of locals(); track l._id) {
                <option [value]="l._id" [selected]="l._id === selectedLocalId()">{{ l.name }}</option>
              }
            </select>
          }
          @if (selectedLocalId() && canCreate()) {
            <button class="btn btn-primary" (click)="openEventDetail(null)">
              <lucide-icon [img]="Plus" [size]="16" [strokeWidth]="2.5"></lucide-icon>
              Nuevo evento
            </button>
          }
        </div>
      </div>

      @if (!selectedLocalId()) {
        <div class="empty-state card">
          <div class="empty-icon"><lucide-icon [img]="Zap" [size]="48" [strokeWidth]="1.5"></lucide-icon></div>
          <h3>Selecciona un local</h3>
          <p>Elige un local para gestionar sus eventos.</p>
        </div>

      } @else if (loading()) {
        <div class="card skeleton-list">
          @for (i of [1,2,3]; track i) { <div class="skeleton-row"></div> }
        </div>

      } @else {
        <div class="filters" role="tablist" aria-label="Filtrar eventos">
          @for (f of FILTERS; track f.key) {
            <button type="button" role="tab" class="filter-btn" [class.active]="filter() === f.key"
              [attr.aria-selected]="filter() === f.key" (click)="filter.set(f.key)">
              {{ f.label }} <span class="filter-count">{{ counts()[f.key] }}</span>
            </button>
          }
        </div>

        @if (visible().length === 0) {
          <div class="empty-state card">
            <div class="empty-icon"><lucide-icon [img]="Calendar" [size]="48" [strokeWidth]="1.5"></lucide-icon></div>
            <h3>{{ emptyTitle() }}</h3>
            @if (events().length === 0 && canCreate()) {
              <p>Crea tu primer evento para este local.</p>
              <button class="btn btn-primary" (click)="openEventDetail(null)">
                <lucide-icon [img]="Plus" [size]="16" [strokeWidth]="2.5"></lucide-icon>
                Nuevo evento
              </button>
            }
          </div>
        } @else {
          <div class="events-grid">
            @for (ev of visible(); track ev._id) {
              <article class="event-card card" [class.draft]="ev.status === 'draft'" tabindex="0"
                [attr.aria-label]="'Abrir ' + ev.title"
                (click)="openEventDetail(ev)" (keydown.enter)="openEventDetail(ev)">
                <div class="event-card-img">
                  @if (ev.imageUrl) {
                    <img [src]="ev.imageUrl" [alt]="ev.title" loading="lazy" />
                  } @else {
                    <div class="img-placeholder">
                      <lucide-icon [img]="ImageIcon" [size]="32" [strokeWidth]="1"></lucide-icon>
                    </div>
                  }
                  @if (ev.date) {
                    <div class="event-date-badge">
                      <span class="month">{{ getMonth(ev.date) }}</span>
                      <span class="day">{{ getDay(ev.date) }}</span>
                    </div>
                  }
                  <div class="event-status">
                    <span class="badge {{ statusMeta(ev.status).cls }}">{{ statusMeta(ev.status).label }}</span>
                  </div>
                </div>

                <div class="event-card-body">
                  <h3 class="event-title">{{ ev.title }}</h3>
                  <div class="event-info">
                    <div class="info-item">
                      <lucide-icon [img]="Calendar" [size]="14"></lucide-icon>
                      <span>{{ formatDate(ev.date) }}{{ ev.startTime ? ' · ' + ev.startTime : '' }}</span>
                    </div>
                    <div class="info-item">
                      <lucide-icon [img]="Users" [size]="14"></lucide-icon>
                      <span>{{ ev.capacity === 0 ? 'Capacidad ilimitada' : ev.capacity + ' cupos' }}</span>
                      <span class="event-price">{{ ev.price === 0 ? 'Gratis' : 'S/ ' + ev.price }}</span>
                    </div>
                  </div>

                  <!-- Las acciones no abren la tarjeta -->
                  <div class="event-footer" (click)="$event.stopPropagation()" (keydown.enter)="$event.stopPropagation()">
                    @if (isImpulsador()) {
                      @if (ev.slug) {
                        <button type="button" class="btn btn-primary btn-sm action-main" (click)="share(ev, true)">
                          <lucide-icon [img]="Share2" [size]="15" [strokeWidth]="2.5"></lucide-icon>
                          Compartir mi link
                        </button>
                      }
                    } @else {
                      @if (ev.slug) {
                        <button type="button" class="btn btn-secondary btn-sm action-main" (click)="share(ev)">
                          <lucide-icon [img]="Share2" [size]="15" [strokeWidth]="2.5"></lucide-icon>
                          Compartir
                        </button>
                      }
                      <button type="button" class="btn btn-ghost btn-sm action-main" (click)="openEventDetail(ev, 'registrations')">
                        <lucide-icon [img]="Users" [size]="15" [strokeWidth]="2.5"></lucide-icon>
                        Asistentes
                      </button>
                      @if (canManage() || ev.slug) {
                        <div class="menu-wrap">
                          <button type="button" class="btn btn-ghost btn-sm btn-icon" aria-haspopup="menu"
                            [attr.aria-expanded]="openMenuId() === ev._id" aria-label="Más acciones"
                            (click)="toggleMenu(ev._id)">
                            <lucide-icon [img]="MoreHorizontal" [size]="18" [strokeWidth]="2.5"></lucide-icon>
                          </button>
                          @if (openMenuId() === ev._id) {
                            <div class="menu card" role="menu">
                              @if (canManage()) {
                                <button type="button" role="menuitem" class="menu-item" (click)="openEventDetail(ev, 'general')">
                                  <lucide-icon [img]="Pencil" [size]="15"></lucide-icon> Editar
                                </button>
                              }
                              @if (ev.slug && ev.status === 'published') {
                                <a role="menuitem" class="menu-item" [href]="publicUrl(ev.slug)" target="_blank" rel="noopener" (click)="openMenuId.set('')">
                                  <lucide-icon [img]="ExternalLink" [size]="15"></lucide-icon> Ver página pública
                                </a>
                              }
                              @if (canManage()) {
                                <button type="button" role="menuitem" class="menu-item danger" (click)="deleteEvent(ev)">
                                  <lucide-icon [img]="Trash2" [size]="15"></lucide-icon> Eliminar
                                </button>
                              }
                            </div>
                          }
                        </div>
                      }
                    }
                  </div>
                </div>
              </article>
            }
          </div>
        }
      }
    </div>

    <!-- ── Compartir (cuando no hay menú nativo) ── -->
    @if (qrModalOpen() && qrEvent()) {
      <div class="overlay" (click)="qrModalOpen.set(false)" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div class="qr-modal card animate-fade-in" (click)="$event.stopPropagation()">
          <div class="qr-modal-header">
            <div>
              <h3 id="share-title">Compartir evento</h3>
              <p class="modal-subtitle">{{ qrEvent()!.title }}</p>
            </div>
            <button class="btn btn-ghost btn-icon" (click)="qrModalOpen.set(false)" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="20" [strokeWidth]="2.5"></lucide-icon>
            </button>
          </div>

          @if (qrEvent()!.status !== 'published') {
            <div class="qr-draft-warn">
              <lucide-icon [img]="Zap" [size]="14"></lucide-icon>
              Este evento aún no está publicado: el link no será accesible hasta que cambies el estado a "Publicado".
            </div>
          }

          <div class="qr-body">
            <div class="qr-image-wrap">
              @if (qrDataUrl()) {
                <img [src]="qrDataUrl()" alt="QR del evento" class="qr-img" />
              } @else {
                <div class="qr-img qr-loading"></div>
              }
            </div>

            <div class="qr-url-row">
              <input class="input qr-url-input" [value]="shareUrl()" readonly aria-label="Link del evento" (click)="$any($event.target).select()" />
              <button class="btn btn-primary" (click)="copyLink()">
                <lucide-icon [img]="copied() ? Check : Copy" [size]="15"></lucide-icon>
                {{ copied() ? 'Copiado' : 'Copiar link' }}
              </button>
            </div>

            @if (qrDataUrl()) {
              <a [href]="qrDataUrl()" [download]="'qr-' + qrEvent()!.slug + '.png'" class="btn btn-secondary qr-download">
                <lucide-icon [img]="Download" [size]="15"></lucide-icon>
                Descargar QR
              </a>
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    .page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:24px; gap:16px; flex-wrap:wrap; }
    .page-header h1 { font-size:24px; font-weight:700; margin:0 0 4px; font-family:var(--font-heading); }
    .subtitle { color:var(--color-text-muted); margin:0; font-size:14px; }
    .header-actions { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
    .local-select { min-width:200px; }

    /* ── Filtros ── */
    .filters { display:flex; gap:4px; padding:4px; margin-bottom:20px; background:var(--color-white); border:1px solid var(--color-border); border-radius:var(--radius-pill); width:fit-content; max-width:100%; overflow-x:auto; }
    .filter-btn { min-height:40px; padding:0 16px; border:none; border-radius:var(--radius-pill); background:transparent; color:var(--color-text-muted); font:600 14px var(--font-base); cursor:pointer; white-space:nowrap; display:inline-flex; align-items:center; gap:6px; }
    .filter-btn.active { background:var(--color-brand-light); color:var(--color-brand); }
    .filter-count { font-size:12px; opacity:.75; }

    /* ── Grid ── */
    .events-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(min(320px, 100%), 1fr)); gap:24px; }
    .event-card { display:flex; flex-direction:column; padding:0; overflow:visible; border-radius:16px; background:var(--color-white); border:1px solid var(--color-border); cursor:pointer; transition:transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.3s ease; }
    .event-card:focus-visible { outline:3px solid var(--color-brand); outline-offset:2px; }
    .event-card.draft { opacity:.9; border-style:dashed; }
    @media (hover: hover) {
      .event-card:hover { transform:translateY(-6px); box-shadow:var(--shadow-lg); }
      .event-card:hover .event-card-img img { transform:scale(1.05); }
    }

    .event-card-img { position:relative; height:200px; width:100%; overflow:hidden; background:var(--color-bg-app); border-bottom:1px solid var(--color-border); border-radius:16px 16px 0 0; }
    .event-card-img::after { content:''; position:absolute; inset:0; background:linear-gradient(to top, rgba(0,0,0,0.3) 0%, transparent 40%); pointer-events:none; }
    .event-card-img img { width:100%; height:100%; object-fit:cover; transition:transform 0.5s ease; }
    .img-placeholder { height:100%; display:flex; align-items:center; justify-content:center; color:var(--color-text-muted); opacity:.3; background:linear-gradient(135deg, var(--color-bg-app), var(--color-border)); }

    .event-date-badge { position:absolute; top:12px; left:12px; background:var(--color-white); border-radius:8px; padding:6px 12px; display:flex; flex-direction:column; align-items:center; box-shadow:var(--shadow-sm); z-index:2; min-width:52px; }
    .event-date-badge .month { font-size:10px; font-weight:800; text-transform:uppercase; color:var(--color-brand); letter-spacing:0.5px; }
    .event-date-badge .day { font-size:20px; font-weight:900; color:var(--color-text-main); line-height:1; margin-top:2px; }
    .event-status { position:absolute; top:12px; right:12px; z-index:2; }

    .event-card-body { padding:20px 24px 16px; flex:1; display:flex; flex-direction:column; gap:12px; }
    .event-title { font-size:18px; font-weight:800; line-height:1.3; margin:0; color:var(--color-text-main); letter-spacing:-0.3px; }
    .event-info { display:flex; flex-direction:column; gap:8px; }
    .info-item { display:flex; align-items:center; gap:10px; color:var(--color-text-muted); font-size:14px; font-weight:500; }
    .info-item lucide-icon { color:var(--color-brand); opacity:.9; }
    .event-price { margin-left:auto; font-size:16px; font-weight:800; color:var(--color-brand); }

    .event-footer { margin-top:auto; padding-top:12px; border-top:1px solid var(--color-border); display:flex; align-items:center; gap:8px; cursor:default; }
    .action-main { flex:1; justify-content:center; }

    .menu-wrap { position:relative; }
    .menu { position:absolute; right:0; bottom:calc(100% + 6px); z-index:20; min-width:200px; padding:6px; display:flex; flex-direction:column; box-shadow:var(--shadow-lg); }
    .menu-item { display:flex; align-items:center; gap:10px; min-height:44px; padding:0 12px; border:none; background:none; border-radius:12px; font:500 14px var(--font-base); color:var(--color-text-main); cursor:pointer; text-decoration:none; text-align:left; }
    .menu-item:hover, .menu-item:focus-visible { background:var(--color-bg-app); }
    .menu-item.danger { color:var(--color-error); }

    /* ── Empty state ── */
    .empty-state { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:80px 40px; gap:16px; text-align:center; }
    .empty-state h3 { margin:0; font-size:18px; font-weight:700; }
    .empty-state p { margin:0; color:var(--color-text-muted); max-width:360px; line-height:1.5; }
    .empty-icon { color:var(--color-brand); opacity:.3; }

    /* ── Compartir ── */
    .overlay { position:fixed; inset:0; background:rgba(15,23,42,0.45); backdrop-filter:blur(3px); -webkit-backdrop-filter:blur(3px); display:flex; align-items:center; justify-content:center; z-index:100; }
    .qr-modal { width:calc(100% - 48px); max-width:420px; padding:28px 32px; max-height:calc(100dvh - 32px); overflow-y:auto; box-sizing:border-box; }
    .qr-modal-header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:16px; }
    .qr-modal-header h3 { margin:0 0 2px; font-size:18px; }
    .modal-subtitle { margin:0; font-size:13px; color:var(--color-text-muted); }
    .qr-draft-warn { display:flex; align-items:flex-start; gap:8px; background:var(--color-brand-light); color:var(--color-text-main); border:1px solid var(--color-border); border-radius:var(--radius-sm); padding:10px 12px; font-size:13px; line-height:1.4; margin-bottom:16px; }
    .qr-body { display:flex; flex-direction:column; align-items:center; gap:16px; }
    .qr-image-wrap { padding:12px; background:var(--color-white); border:1px solid var(--color-border); border-radius:var(--radius-sm); }
    .qr-img { width:200px; height:200px; display:block; max-width:100%; }
    .qr-loading { background:var(--color-bg-app); border-radius:8px; }
    .qr-url-row { display:flex; gap:8px; width:100%; }
    .qr-url-input { flex:1; min-width:0; }
    .qr-download { width:100%; justify-content:center; }

    @media (max-width: 768px) {
      .page { padding: 20px 16px; }
      .header-actions { width:100%; }
      .local-select { flex:1; min-width:0; }
      .filters { width:100%; }
      .filter-btn { flex:1; justify-content:center; min-height:44px; }
      .events-grid { gap:16px; }
      .event-card-img { height:170px; }
      .event-card-body { padding:16px; }
      .event-title { font-size:17px; }
      .event-footer .btn { min-height:44px; }
      .event-footer .btn-icon { width:44px; height:44px; }
      .empty-state { padding:60px 24px; }
    }

    @media (max-width: 480px) {
      .page-header { flex-direction:column; align-items:stretch; }
      .header-actions { flex-direction:column; align-items:stretch; }
      .header-actions .btn { width:100%; justify-content:center; }
      .qr-modal { width:calc(100% - 32px); padding:22px 20px; }
      .qr-url-row { flex-direction:column; }
      .qr-url-row .btn { width:100%; justify-content:center; }
    }
  `],
})
export class EventsComponent implements OnInit {
  private api = inject(EventsApiService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly Zap = Zap; readonly Plus = Plus; readonly Pencil = Pencil;
  readonly Trash2 = Trash2; readonly Users = Users;
  readonly Calendar = Calendar; readonly ExternalLink = ExternalLink;
  readonly X = X; readonly ImageIcon = ImageIcon; readonly Share2 = Share2;
  readonly Copy = Copy; readonly Check = Check; readonly Download = Download;
  readonly MoreHorizontal = MoreHorizontal;
  readonly FILTERS = FILTERS;

  locals          = signal<Local[]>([]);
  selectedLocalId = signal('');
  events          = signal<AppEvent[]>([]);
  loading         = signal(false);

  filter  = signal<EventsFilter>('upcoming');
  visible = computed(() => filterEvents(this.events(), this.filter(), new Date()));
  counts  = computed(() => {
    const today = new Date();
    return {
      upcoming: filterEvents(this.events(), 'upcoming', today).length,
      past: filterEvents(this.events(), 'past', today).length,
      drafts: filterEvents(this.events(), 'drafts', today).length,
    } as Record<EventsFilter, number>;
  });
  emptyTitle = computed(() => {
    if (this.events().length === 0) return 'Sin eventos';
    return { upcoming: 'No hay eventos próximos', past: 'No hay eventos pasados', drafts: 'No hay borradores' }[this.filter()];
  });

  openMenuId = signal('');

  // Compartir
  qrModalOpen = signal(false);
  qrEvent     = signal<AppEvent | null>(null);
  shareUrl    = signal('');
  qrDataUrl   = signal('');
  copied      = signal(false);

  private roles = injectRoles();
  canManage     = this.roles.canManage;
  isImpulsador  = this.roles.isImpulsador;
  canCreate     = this.roles.canCreate;
  private referralCode = this.roles.referralCode;

  ngOnInit() {
    this.api.getLocals().subscribe({
      next: (ls) => {
        this.locals.set(ls);
        const id = pickLocal(ls, this.readSavedLocal());
        if (id) this.selectLocal(id);
      },
      error: () => this.toast.error('No se pudieron cargar los locales'),
    });
  }

  onLocalChange(e: Event) {
    this.selectLocal((e.target as HTMLSelectElement).value);
  }

  private selectLocal(id: string) {
    this.selectedLocalId.set(id);
    try {
      if (id) localStorage.setItem(LOCAL_KEY, id);
    } catch { /* sin almacenamiento: no se recuerda */ }
    if (id) this.loadEvents();
    else this.events.set([]);
  }

  private readSavedLocal(): string | null {
    try { return localStorage.getItem(LOCAL_KEY); } catch { return null; }
  }

  loadEvents() {
    this.loading.set(true);
    this.api.getEvents(this.selectedLocalId()).subscribe({
      next: (evs) => { this.events.set(evs); this.loading.set(false); },
      error: () => { this.loading.set(false); this.toast.error('No se pudieron cargar los eventos'); },
    });
  }

  openEventDetail(ev: AppEvent | null, tab?: string) {
    this.openMenuId.set('');
    if (ev) {
      this.router.navigate(['/events', ev._id], tab ? { queryParams: { tab } } : {});
    } else {
      this.router.navigate(['/events', 'new'], { queryParams: { localId: this.selectedLocalId() } });
    }
  }

  toggleMenu(id: string) {
    this.openMenuId.set(this.openMenuId() === id ? '' : id);
  }

  async deleteEvent(ev: AppEvent) {
    this.openMenuId.set('');
    const ok = await this.confirm.confirm({
      title: 'Eliminar evento',
      message: `¿Eliminar "${ev.title}"? Se borrarán también sus registros.`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    this.api.deleteEvent(ev._id).subscribe({
      next: () => { this.toast.success('Evento eliminado'); this.loadEvents(); },
      error: (err) => this.toast.error(err.error?.message || 'Error al eliminar'),
    });
  }

  /**
   * Compartir: el menú nativo del móvil (WhatsApp, Instagram…) si existe; si
   * no, el modal con link y QR. El impulsador comparte con su `?ref=`.
   */
  async share(ev: AppEvent, withRef = false) {
    if (!ev.slug) return;
    const url = withRef ? this.inviteUrl(ev.slug) : this.publicUrl(ev.slug);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: ev.title, text: ev.title, url });
        return;
      } catch (err) {
        if ((err as { name?: string })?.name === 'AbortError') return;
      }
    }
    this.openShareModal(ev, url);
  }

  private openShareModal(ev: AppEvent, url: string) {
    this.qrEvent.set(ev);
    this.shareUrl.set(url);
    this.qrDataUrl.set('');
    this.copied.set(false);
    this.qrModalOpen.set(true);
    void this.renderQr(url);
  }

  /** QR generado en el navegador: la URL no sale a ningún servicio externo. */
  private async renderQr(url: string) {
    try {
      const QRCode = await import('qrcode');
      this.qrDataUrl.set(await QRCode.default.toDataURL(url, { width: 512, margin: 2 }));
    } catch {
      this.toast.error('No se pudo generar el QR');
    }
  }

  copyLink() {
    const url = this.shareUrl();
    if (!url) return;
    navigator.clipboard.writeText(url).then(
      () => {
        this.copied.set(true);
        this.toast.success('Link copiado al portapapeles');
        setTimeout(() => this.copied.set(false), 2000);
      },
      () => this.toast.error('No se pudo copiar el link'),
    );
  }

  inviteUrl(slug: string): string {
    const code = this.referralCode();
    return code ? `${this.publicUrl(slug)}?ref=${code}` : this.publicUrl(slug);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  statusMeta(status: string) {
    return EVENT_STATUS_META[status as EventStatus] ?? EVENT_STATUS_META.draft;
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  publicUrl(slug: string): string {
    return `${window.location.origin}/e/${slug}`;
  }

  getMonth(dateStr: string): string {
    if (!dateStr) return '';
    const [year, month] = dateStr.split('T')[0].split('-');
    return new Date(+year, +month - 1).toLocaleDateString('es-PE', { month: 'short' }).toUpperCase().replace('.', '');
  }

  getDay(dateStr: string): string {
    if (!dateStr) return '';
    return dateStr.split('T')[0].split('-')[2] || '';
  }

  @HostListener('document:click')
  onDocClick() { if (this.openMenuId()) this.openMenuId.set(''); }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.openMenuId()) { this.openMenuId.set(''); return; }
    if (this.qrModalOpen()) this.qrModalOpen.set(false);
  }
}
