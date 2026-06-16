import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  ViewChild,
  inject,
  signal,
  computed,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { AuthService } from '../../auth/auth.service';
import {
  LucideAngularModule,
  Zap,
  Plus,
  Pencil,
  Trash2,
  Users,
  Wand2,
  Calendar,
  ExternalLink,
  X,
  Ticket,
  Upload,
  ImageIcon,
  Share2,
  Hash,
  Mail,
  Copy,
  Check,
  Link2,
  QrCode,
  Download,
} from 'lucide-angular';

import { environment } from '../../../environments/environment';
const API = environment.apiUrl;

type EventStatus = 'draft' | 'published' | 'cancelled';
type AiTool = 'copy' | 'social' | 'hashtags' | 'email';

interface AppEvent {
  _id: string;
  localId: string;
  title: string;
  description?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  capacity: number;
  price: number;
  imageUrl?: string;
  status: EventStatus;
  slug?: string;
}

interface Registration {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  partySize: number;
  ticketCode: string;
  status: string;
  createdAt: string;
}

interface Local { _id: string; name: string; }

const STATUS_META: Record<EventStatus, { label: string; cls: string }> = {
  draft:     { label: 'Borrador',  cls: 'badge-neutral' },
  published: { label: 'Publicado', cls: 'badge-success' },
  cancelled: { label: 'Cancelado', cls: 'badge-danger'  },
};

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
          <p class="subtitle">Crea eventos, sube imágenes y genera contenido con IA.</p>
        </div>
        <div class="header-actions">
          <select class="input local-select" (change)="onLocalChange($event)" aria-label="Seleccionar local">
            <option value="">— Selecciona un local —</option>
            @for (l of locals(); track l._id) {
              <option [value]="l._id">{{ l.name }}</option>
            }
          </select>
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

      } @else if (events().length === 0) {
        <div class="empty-state card">
          <div class="empty-icon"><lucide-icon [img]="Calendar" [size]="48" [strokeWidth]="1.5"></lucide-icon></div>
          <h3>Sin eventos</h3>
          <p>Crea tu primer evento para este local.</p>
          @if (canCreate()) {
            <button class="btn btn-primary" (click)="openEventDetail(null)">
              <lucide-icon [img]="Plus" [size]="16" [strokeWidth]="2.5"></lucide-icon>
              Nuevo evento
            </button>
          }
        </div>

      } @else {
        <div class="events-grid">
          @for (ev of events(); track ev._id) {
            <div class="event-card card" [class.draft]="ev.status === 'draft'">
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
                  <span class="badge {{ statusMeta(ev.status).cls }}">
                    {{ statusMeta(ev.status).label }}
                  </span>
                </div>
              </div>
              
              <div class="event-card-body">
                <div class="event-card-header">
                  <h3 class="event-title">{{ ev.title }}</h3>
                  @if (ev.slug && ev.status === 'published') {
                    <a [href]="publicUrl(ev.slug)" target="_blank" class="btn-icon-sm" title="Ver página pública">
                      <lucide-icon [img]="ExternalLink" [size]="14"></lucide-icon>
                    </a>
                  }
                </div>
                
                <div class="event-info">
                  <div class="info-item">
                    <lucide-icon [img]="Calendar" [size]="14"></lucide-icon>
                    <span>{{ formatDate(ev.date) }}</span>
                  </div>
                  <div class="info-item">
                    <lucide-icon [img]="Users" [size]="14"></lucide-icon>
                    <span>{{ ev.capacity === 0 ? 'Capacidad ilimitada' : ev.capacity + ' cupos' }}</span>
                  </div>
                </div>

                <div class="event-footer">
                  <div class="event-price">
                    {{ ev.price === 0 ? 'Gratis' : 'S/ ' + ev.price }}
                  </div>
                  <div class="event-actions">
                    @if (ev.slug && isImpulsador()) {
                      <button class="btn btn-ghost btn-sm btn-icon" (click)="copyInviteLink(ev)" title="Copiar mi link de invitación">
                        <lucide-icon [img]="Link2" [size]="15" [strokeWidth]="2.5"></lucide-icon>
                      </button>
                    }
                    @if (ev.slug && !isImpulsador()) {
                      <button class="btn btn-ghost btn-sm btn-icon" (click)="openQr(ev)" title="Compartir / QR">
                        <lucide-icon [img]="QrCode" [size]="15" [strokeWidth]="2.5"></lucide-icon>
                      </button>
                    }
                    @if (!isImpulsador()) {
                      <button class="btn btn-ghost btn-sm btn-icon" (click)="openEventDetail(ev)" title="Asistentes">
                        <lucide-icon [img]="Users" [size]="15" [strokeWidth]="2.5"></lucide-icon>
                      </button>
                    }
                    @if (canManage()) {
                      <button class="btn btn-ghost btn-sm btn-icon" (click)="openEventDetail(ev)" title="Editar / IA">
                        <lucide-icon [img]="Pencil" [size]="15" [strokeWidth]="2.5"></lucide-icon>
                      </button>
                      <button class="btn btn-ghost btn-sm btn-icon danger" (click)="deleteEvent(ev)" title="Eliminar">
                        <lucide-icon [img]="Trash2" [size]="15" [strokeWidth]="2.5"></lucide-icon>
                      </button>
                    }
                  </div>
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>



    <!-- ── QR / Share modal ── -->
    @if (qrModalOpen() && qrEvent()) {
      <div class="overlay" (click)="qrModalOpen.set(false)" role="dialog" aria-modal="true">
        <div class="qr-modal" (click)="$event.stopPropagation()">
          <div class="qr-modal-header">
            <div>
              <h3>Compartir evento</h3>
              <p class="modal-subtitle">{{ qrEvent()!.title }}</p>
            </div>
            <button class="btn btn-ghost btn-icon" (click)="qrModalOpen.set(false)" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="20" [strokeWidth]="2.5"></lucide-icon>
            </button>
          </div>

          @if (qrEvent()!.status !== 'published') {
            <div class="qr-draft-warn">
              <lucide-icon [img]="Zap" [size]="14"></lucide-icon>
              Este evento aún no está publicado — el link no será accesible hasta que cambies el estado a "Publicado".
            </div>
          }

          <div class="qr-body">
            <div class="qr-image-wrap">
              <img [src]="qrImageUrl()" alt="QR del evento" class="qr-img" loading="lazy" />
            </div>

            <div class="qr-url-row">
              <input class="input qr-url-input" [value]="publicUrl(qrEvent()!.slug!)" readonly (click)="$any($event.target).select()" />
              <button class="btn btn-primary" (click)="copyEventLink(qrEvent()!)">
                <lucide-icon [img]="copiedEventId() === qrEvent()?._id ? Check : Copy" [size]="15"></lucide-icon>
                {{ copiedEventId() === qrEvent()?._id ? 'Copiado' : 'Copiar link' }}
              </button>
            </div>

            <a [href]="qrImageUrl()" [download]="'qr-' + qrEvent()!.slug + '.png'" target="_blank"
               class="btn btn-secondary qr-download">
              <lucide-icon [img]="Download" [size]="15"></lucide-icon>
              Descargar QR
            </a>
          </div>
        </div>
      </div>
    }


  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    .page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:32px; gap:16px; flex-wrap:wrap; }
    .page-header h1 { font-size:24px; font-weight:700; margin:0 0 4px; font-family:var(--font-heading); }
    .subtitle { color:var(--color-text-muted); margin:0; font-size:14px; }
    .header-actions { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
    .local-select { min-width:200px; }

    /* ── Grid ── */
    .events-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:24px; }
    .event-card { display:flex; flex-direction:column; padding:0; overflow:hidden; transition:transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.3s ease; border-radius:16px; background:#fff; border:1px solid var(--color-border); }
    .event-card:hover { transform:translateY(-6px); box-shadow:0 12px 24px rgba(0,0,0,0.08); }
    .event-card.draft { opacity:.85; border-style:dashed; }
    
    .event-card-img { position:relative; height:200px; width:100%; overflow:hidden; background:var(--color-bg-app); border-bottom:1px solid var(--color-border); }
    .event-card-img::after { content:''; position:absolute; inset:0; background:linear-gradient(to top, rgba(0,0,0,0.3) 0%, transparent 40%); pointer-events:none; }
    .event-card-img img { width:100%; height:100%; object-fit:cover; transition:transform 0.5s ease; }
    .event-card:hover .event-card-img img { transform:scale(1.05); }
    .img-placeholder { height:100%; display:flex; align-items:center; justify-content:center; color:var(--color-text-muted); opacity:.3; background:linear-gradient(135deg, var(--color-bg-app), var(--color-border)); }
    
    .event-date-badge { position:absolute; top:12px; left:12px; background:rgba(255,255,255,0.95); backdrop-filter:blur(4px); border-radius:8px; padding:6px 12px; display:flex; flex-direction:column; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(0,0,0,0.1); z-index:2; min-width:52px; }
    .event-date-badge .month { font-size:10px; font-weight:800; text-transform:uppercase; color:var(--color-brand); letter-spacing:0.5px; }
    .event-date-badge .day { font-size:20px; font-weight:900; color:var(--color-text-main); line-height:1; margin-top:2px; }

    .event-status { position:absolute; top:12px; right:12px; z-index:2; }
    
    .event-card-body { padding:24px; flex:1; display:flex; flex-direction:column; gap:16px; }
    .event-card-header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
    .event-title { font-size:18px; font-weight:800; line-height:1.3; margin:0; color:var(--color-text-main); letter-spacing:-0.3px; }
    
    .event-info { display:flex; flex-direction:column; gap:8px; }
    .info-item { display:flex; align-items:center; gap:10px; color:var(--color-text-muted); font-size:14px; font-weight:500; }
    .info-item lucide-icon { color:var(--color-brand); opacity:.9; }
    
    .event-footer { margin-top:auto; padding-top:16px; border-top:1px solid var(--color-border); display:flex; align-items:center; justify-content:space-between; }
    .event-price { font-size:18px; font-weight:800; color:var(--color-brand); }
    .event-actions { display:flex; gap:4px; }
    .btn-icon-sm { background:none; border:none; padding:4px; color:var(--color-text-muted); cursor:pointer; display:inline-flex; border-radius:6px; transition:all .2s; }
    .btn-icon-sm:hover { background:var(--color-bg-app); color:var(--color-brand); }


  `],
})
export class EventsComponent implements OnInit {
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  private http = inject(HttpClient);
  private router = inject(Router);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private auth = inject(AuthService);

  readonly Zap = Zap; readonly Plus = Plus; readonly Pencil = Pencil;
  readonly Trash2 = Trash2; readonly Users = Users; readonly Wand2 = Wand2;
  readonly Calendar = Calendar; readonly ExternalLink = ExternalLink;
  readonly X = X; readonly Ticket = Ticket; readonly Upload = Upload;
  readonly ImageIcon = ImageIcon; readonly Share2 = Share2;
  readonly Hash = Hash; readonly Mail = Mail; readonly Copy = Copy;
  readonly Check = Check; readonly Link2 = Link2;
  readonly QrCode = QrCode; readonly Download = Download;

  locals          = signal<Local[]>([]);
  selectedLocalId = signal('');
  events          = signal<AppEvent[]>([]);
  loading         = signal(false);

  copiedEventId = signal('');

  // QR / Share
  qrModalOpen = signal(false);
  qrEvent     = signal<AppEvent | null>(null);
  qrImageUrl  = computed(() => {
    const ev = this.qrEvent();
    if (!ev?.slug) return '';
    const url = encodeURIComponent(this.publicUrl(ev.slug));
    return `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${url}&bgcolor=ffffff&color=000000&margin=10&format=png`;
  });



  private role = computed(() => this.auth.currentUser()?.role ?? '');
  canManage     = computed(() => ['TENANT_ADMIN', 'MANAGER'].includes(this.role()));
  isImpulsador  = computed(() => this.role() === 'IMPULSADOR');
  canCreate     = computed(() => ['TENANT_ADMIN', 'MANAGER', 'IMPULSADOR'].includes(this.role()));
  private referralCode = computed(() => this.auth.currentUser()?.referralCode ?? null);



  ngOnInit() {
    this.http.get<Local[]>(`${API}/locals`).subscribe({
      next: (ls) => this.locals.set(ls),
    });
  }

  onLocalChange(e: Event) {
    const id = (e.target as HTMLSelectElement).value;
    this.selectedLocalId.set(id);
    if (id) this.loadEvents();
    else this.events.set([]);
  }

  loadEvents() {
    this.loading.set(true);
    this.http.get<AppEvent[]>(`${API}/events`, { params: { localId: this.selectedLocalId() } }).subscribe({
      next: (evs) => { this.events.set(evs); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openEventDetail(ev: AppEvent | null) {
    if (ev) {
      this.router.navigate(['/events', ev._id]);
    } else {
      this.router.navigate(['/events', 'new'], { queryParams: { localId: this.selectedLocalId() } });
    }
  }





  async deleteEvent(ev: AppEvent) {
    const ok = await this.confirm.confirm({
      title: 'Eliminar evento',
      message: `¿Eliminar "${ev.title}"? Se borrarán también sus registros.`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    this.http.delete(`${API}/events/${ev._id}`).subscribe({
      next: () => { this.toast.success('Evento eliminado'); this.loadEvents(); },
      error: (err) => this.toast.error(err.error?.message || 'Error al eliminar'),
    });
  }



  openQr(ev: AppEvent) {
    this.qrEvent.set(ev);
    this.qrModalOpen.set(true);
  }

  copyEventLink(ev: AppEvent) {
    if (!ev.slug) return;
    void navigator.clipboard.writeText(this.publicUrl(ev.slug)).then(() => {
      this.copiedEventId.set(ev._id);
      this.toast.success('Link copiado al portapapeles');
      setTimeout(() => this.copiedEventId.set(''), 2000);
    });
  }

  copyInviteLink(ev: AppEvent) {
    if (!ev.slug) return;
    const code = this.referralCode();
    const url = code ? `${this.publicUrl(ev.slug)}?ref=${code}` : this.publicUrl(ev.slug);
    void navigator.clipboard.writeText(url).then(() => {
      this.toast.success('Link de invitación copiado');
    });
  }

  inviteUrl(slug: string): string {
    const code = this.referralCode();
    return code ? `${this.publicUrl(slug)}?ref=${code}` : this.publicUrl(slug);
  }



  // ── Helpers ───────────────────────────────────────────────────────────────

  statusMeta(status: string) {
    return STATUS_META[status as EventStatus] ?? STATUS_META.draft;
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  publicUrl(slug: string): string {
    return `${window.location.origin}/e/${slug}`;
  }

  getMonth(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    d.setMinutes(d.getMinutes() + d.getTimezoneOffset()); // adjust for TZ if needed, but since it's just a YYYY-MM-DD it might parse at 00:00 UTC. Using UTC methods or splitting string is safer.
    // Safer manual parse
    const [year, month] = dateStr.split('T')[0].split('-');
    const dateObj = new Date(+year, +month - 1);
    return dateObj.toLocaleDateString('es-PE', { month: 'short' }).toUpperCase().replace('.', '');
  }

  getDay(dateStr: string): string {
    if (!dateStr) return '';
    const part = dateStr.split('T')[0].split('-')[2];
    return part || '';
  }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.qrModalOpen()) { this.qrModalOpen.set(false); return; }
  }
}
