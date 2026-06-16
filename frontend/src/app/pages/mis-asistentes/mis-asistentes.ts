import { Component, inject, signal, computed, OnInit, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { LucideAngularModule, Users, Send, X, CheckCircle, Filter, MessageSquare, Mail, Image, XCircle } from 'lucide-angular';

import { environment } from '../../../environments/environment';
const API = environment.apiUrl;

interface Registration {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  partySize: number;
  ticketCode: string;
  status: string;
  checkedIn?: boolean;
  checkedInAt?: string;
  eventId: string;
  eventTitle?: string;
  eventDate?: string;
  createdAt: string;
}

@Component({
  selector: 'app-mis-asistentes',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1>Mis Asistentes</h1>
          <p class="page-sub">Personas registradas en tus eventos</p>
        </div>
      </div>

      <!-- Filtro por evento -->
      <div class="filter-bar card">
        <lucide-icon [img]="Filter" [size]="16" [strokeWidth]="2.5" style="color:var(--color-text-muted)"></lucide-icon>
        <select class="input filter-select" [(ngModel)]="filterEvent">
          <option value="">Todos los eventos</option>
          @for (e of eventOptions(); track e.id) {
            <option [value]="e.id">{{ e.title }}</option>
          }
        </select>
        <span class="filter-count">{{ filtered().length }} asistente{{ filtered().length !== 1 ? 's' : '' }}</span>
      </div>

      @if (loading()) {
        <div class="skeleton-list">
          @for (item of [1,2,3,4,5]; track item) {
            <div class="skeleton-row card"></div>
          }
        </div>
      } @else if (filtered().length === 0) {
        <div class="empty-state card">
          <lucide-icon [img]="Users" [size]="40" [strokeWidth]="1.5" style="color:var(--color-text-muted);margin-bottom:12px"></lucide-icon>
          <p>Aún no tienes asistentes registrados.</p>
          <span style="font-size:13px;color:var(--color-text-muted)">Regístrate en un evento para ver a tus asistentes aquí.</span>
        </div>
      } @else {
        <div class="table-wrap card">
          <table>
            <thead>
              <tr>
                <th>Asistente</th>
                <th>Evento</th>
                <th>Ticket</th>
                <th>Personas</th>
                <th>Check-in</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              @for (r of filtered(); track r._id) {
                <tr>
                  <td>
                    <div class="attendee-info">
                      <span class="attendee-name">{{ r.name }}</span>
                      <span class="attendee-contact">{{ r.email }}{{ r.phone ? ' · ' + r.phone : '' }}</span>
                    </div>
                  </td>
                  <td>
                    <div class="event-info">
                      <span>{{ r.eventTitle ?? '—' }}</span>
                      @if (r.eventDate) {
                        <span class="event-date">{{ formatDate(r.eventDate) }}</span>
                      }
                    </div>
                  </td>
                  <td><code class="ticket-code">{{ r.ticketCode }}</code></td>
                  <td class="center-cell">{{ r.partySize }}</td>
                  <td class="center-cell">
                    @if (r.checkedIn) {
                      <span class="badge-success">Ingresó</span>
                    } @else {
                      <button class="btn btn-sm btn-secondary" (click)="doCheckIn(r)">
                        <lucide-icon [img]="CheckCircle" [size]="13" [strokeWidth]="2.5"></lucide-icon>
                        Check-in
                      </button>
                    }
                  </td>
                  <td class="actions-cell">
                    <button class="btn btn-sm btn-secondary" (click)="openMessage(r)" title="Enviar mensaje">
                      <lucide-icon [img]="Send" [size]="13" [strokeWidth]="2.5"></lucide-icon>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <!-- Modal: Enviar mensaje -->
    @if (msgTarget()) {
      <div class="overlay" (click)="closeMessage()" role="dialog" aria-modal="true">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h2>Enviar mensaje</h2>
            <button class="btn btn-icon btn-ghost" (click)="closeMessage()">
              <lucide-icon [img]="X" [size]="20" [strokeWidth]="2.5"></lucide-icon>
            </button>
          </div>

          <div class="modal-body">
            <p class="msg-to">
              Para: <strong>{{ msgTarget()!.name }}</strong>
              <span style="color:var(--color-text-muted)"> · {{ msgTarget()!.email }}{{ msgTarget()!.phone ? ' / ' + msgTarget()!.phone : '' }}</span>
            </p>

            <!-- Canal -->
            <div class="form-group">
              <label class="form-label">Canal</label>
              <div class="channel-selector">
                <button
                  class="channel-btn"
                  [class.active]="msg.channel === 'whatsapp'"
                  (click)="msg.channel = 'whatsapp'"
                  [disabled]="!msgTarget()!.phone"
                  [title]="!msgTarget()!.phone ? 'Sin número de teléfono' : ''"
                >
                  <lucide-icon [img]="MessageSquare" [size]="16" [strokeWidth]="2.5"></lucide-icon>
                  WhatsApp
                </button>
                <button
                  class="channel-btn"
                  [class.active]="msg.channel === 'email'"
                  (click)="msg.channel = 'email'"
                >
                  <lucide-icon [img]="Mail" [size]="16" [strokeWidth]="2.5"></lucide-icon>
                  Email
                </button>
              </div>
              @if (!msgTarget()!.phone && msg.channel === 'whatsapp') {
                <span class="field-hint" style="color:var(--color-error)">Este asistente no tiene teléfono registrado.</span>
              }
            </div>

            <!-- Asunto (solo email) -->
            @if (msg.channel === 'email') {
              <div class="form-group">
                <label class="form-label">Asunto</label>
                <input class="input" type="text" [(ngModel)]="msg.subject" placeholder="Asunto del email" />
              </div>
            }

            <!-- Mensaje -->
            <div class="form-group">
              <label class="form-label">Mensaje *</label>
              <textarea class="input textarea" rows="4" [(ngModel)]="msg.body" placeholder="Escribe tu mensaje…"></textarea>
            </div>

            <!-- Media upload -->
            <div class="form-group">
              <label class="form-label">Imagen o video (opcional)</label>
              @if (msg.mediaUrl) {
                <div class="media-preview">
                  @if (msg.mediaType === 'video') {
                    <video [src]="msg.mediaUrl" class="media-thumb" controls></video>
                  } @else {
                    <img [src]="msg.mediaUrl" class="media-thumb" alt="preview" />
                  }
                  <button class="btn btn-icon btn-ghost media-clear" type="button" (click)="clearMedia()" title="Quitar">
                    <lucide-icon [img]="XCircle" [size]="18" [strokeWidth]="2.5"></lucide-icon>
                  </button>
                </div>
              } @else {
                <label class="upload-zone" [class.uploading]="uploadingMedia()">
                  <input type="file" accept="image/*,video/*" (change)="onMediaFile($event)" style="display:none" />
                  <lucide-icon [img]="Image" [size]="22" [strokeWidth]="1.5" style="color:var(--color-text-muted)"></lucide-icon>
                  <span class="upload-label">{{ uploadingMedia() ? 'Subiendo…' : 'Haz clic para subir imagen o video' }}</span>
                  <span class="upload-hint">JPG, PNG, MP4 · Imágenes hasta 10 MB · Videos hasta 200 MB</span>
                </label>
              }
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn btn-ghost" (click)="closeMessage()">Cancelar</button>
            <button
              class="btn btn-primary"
              (click)="sendMessage()"
              [disabled]="sending() || uploadingMedia() || !msg.body.trim() || (msg.channel === 'whatsapp' && !msgTarget()!.phone)"
            >
              {{ sending() ? 'Enviando…' : 'Enviar' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    .page-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 28px; }
    .page-header h1 { font-family: var(--font-heading); font-size: 28px; font-weight: 700; color: var(--color-text-main); margin: 0; }
    .page-sub { color: var(--color-text-muted); font-size: 14px; margin: 4px 0 0; }

    .filter-bar { display: flex; align-items: center; gap: 12px; padding: 14px 20px; margin-bottom: 20px; flex-wrap: wrap; }
    .filter-select { flex: 1; min-width: 180px; max-width: 320px; }
    .filter-count { margin-left: auto; font-size: 13px; color: var(--color-text-muted); font-weight: 500; white-space: nowrap; }

    .skeleton-list { display: flex; flex-direction: column; gap: 8px; }
    .skeleton-row { height: 56px; border-radius: var(--radius-lg); background: linear-gradient(90deg, var(--color-bg-app) 25%, var(--color-border) 50%, var(--color-bg-app) 75%); background-size: 200% 100%; animation: shimmer 1.4s infinite; }
    @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

    .empty-state { display: flex; flex-direction: column; align-items: center; padding: 56px 24px; text-align: center; gap: 8px; color: var(--color-text-muted); }

    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 12px; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.05em; padding: 12px 16px; border-bottom: 1px solid var(--color-border); }
    td { padding: 13px 16px; border-bottom: 1px solid var(--color-border); font-size: 14px; color: var(--color-text-main); vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    .center-cell { text-align: center; }
    .actions-cell { width: 60px; text-align: right; }

    .attendee-info { display: flex; flex-direction: column; gap: 2px; }
    .attendee-name { font-weight: 600; }
    .attendee-contact { font-size: 12px; color: var(--color-text-muted); }

    .event-info { display: flex; flex-direction: column; gap: 2px; }
    .event-date { font-size: 12px; color: var(--color-text-muted); }

    .ticket-code { font-family: monospace; font-size: 13px; font-weight: 700; color: var(--color-brand); background: var(--color-brand-light); padding: 2px 8px; border-radius: 6px; }
    .badge-success { display: inline-flex; align-items: center; gap: 4px; background: #DCFCE7; color: #16A34A; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: var(--radius-pill); }

    /* Modal */
    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 100; }
    .modal-card { width: calc(100% - 48px); max-width: 500px; background: var(--color-white); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg); display: flex; flex-direction: column; max-height: 90vh; animation: fadeUp var(--transition-spring) both; }
    @keyframes fadeUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
    .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 24px 28px; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
    .modal-header h2 { font-family: var(--font-heading); font-size: 18px; font-weight: 700; margin: 0; }
    .modal-body { padding: 24px 28px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; }
    .modal-footer { padding: 16px 28px; border-top: 1px solid var(--color-border); display: flex; gap: 10px; justify-content: flex-end; flex-shrink: 0; }

    .msg-to { font-size: 14px; color: var(--color-text-main); margin: 0; }
    .form-group { display: flex; flex-direction: column; gap: 6px; }
    .form-label { font-size: 13px; font-weight: 600; color: var(--color-text-main); }
    .field-hint { font-size: 12px; }
    .textarea { resize: vertical; min-height: 96px; }

    .channel-selector { display: flex; gap: 8px; }
    .channel-btn { display: flex; align-items: center; gap: 6px; padding: 8px 18px; border-radius: var(--radius-pill); border: 1.5px solid var(--color-border); background: var(--color-bg-app); color: var(--color-text-muted); font-size: 14px; font-weight: 600; cursor: pointer; transition: all var(--transition-fast); }
    .channel-btn.active { border-color: var(--color-brand); background: var(--color-brand-light); color: var(--color-brand); }
    .channel-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .channel-btn:not(:disabled):hover { border-color: var(--color-text-muted); }

    /* Media upload */
    .upload-zone {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 6px; padding: 20px 16px; border: 2px dashed var(--color-border);
      border-radius: var(--radius-lg); background: var(--color-bg-app);
      cursor: pointer; transition: border-color var(--transition-fast);
    }
    .upload-zone:hover { border-color: var(--color-brand); }
    .upload-zone.uploading { opacity: 0.6; pointer-events: none; }
    .upload-label { font-size: 13px; color: var(--color-text-muted); font-weight: 500; }
    .upload-hint { font-size: 11px; color: var(--color-text-muted); }

    .media-preview { position: relative; border-radius: var(--radius-lg); overflow: hidden; background: var(--color-bg-app); border: 1px solid var(--color-border); }
    .media-thumb { width: 100%; max-height: 200px; object-fit: cover; display: block; }
    .media-clear { position: absolute; top: 8px; right: 8px; background: var(--color-white) !important; box-shadow: var(--shadow-sm); border-radius: 50%; }
  `],
})
export class MisAsistentesComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly Users = Users;
  readonly Send = Send;
  readonly X = X;
  readonly CheckCircle = CheckCircle;
  readonly Filter = Filter;
  readonly MessageSquare = MessageSquare;
  readonly Mail = Mail;
  readonly Image = Image;
  readonly XCircle = XCircle;

  regs = signal<Registration[]>([]);
  loading = signal(true);
  filterEvent = '';
  msgTarget = signal<Registration | null>(null);
  sending = signal(false);
  uploadingMedia = signal(false);

  msg: { channel: 'whatsapp' | 'email'; subject: string; body: string; mediaUrl: string; mediaType: 'image' | 'video' } = {
    channel: 'whatsapp',
    subject: '',
    body: '',
    mediaUrl: '',
    mediaType: 'image',
  };

  eventOptions = computed(() => {
    const map = new Map<string, string>();
    for (const r of this.regs()) {
      if (r.eventId && r.eventTitle) map.set(r.eventId, r.eventTitle);
    }
    return Array.from(map.entries()).map(([id, title]) => ({ id, title }));
  });

  filtered = computed(() => {
    if (!this.filterEvent) return this.regs();
    return this.regs().filter(r => r.eventId === this.filterEvent);
  });

  @HostListener('document:keydown.escape')
  onEsc() { this.closeMessage(); }

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.http.get<Registration[]>(`${API}/impulsador/registrations`).subscribe({
      next: r => { this.regs.set(r); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openMessage(r: Registration) {
    this.msg = { channel: r.phone ? 'whatsapp' : 'email', subject: '', body: '', mediaUrl: '', mediaType: 'image' };
    this.msgTarget.set(r);
  }

  closeMessage() { this.msgTarget.set(null); }

  onMediaFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.msg.mediaType = file.type.startsWith('video/') ? 'video' : 'image';
    this.uploadingMedia.set(true);
    const fd = new FormData();
    fd.append('file', file);
    this.http.post<{ url: string }>(`${API}/upload?folder=messages`, fd).subscribe({
      next: r => { this.msg.mediaUrl = r.url; this.uploadingMedia.set(false); },
      error: (err: any) => {
        this.toast.error(err?.error?.message || 'Error al subir archivo');
        this.uploadingMedia.set(false);
      },
    });
  }

  clearMedia() { this.msg.mediaUrl = ''; this.msg.mediaType = 'image'; }

  sendMessage() {
    const target = this.msgTarget();
    if (!target || !this.msg.body.trim()) return;
    this.sending.set(true);
    const payload: Record<string, unknown> = { channel: this.msg.channel, body: this.msg.body };
    if (this.msg.channel === 'email' && this.msg.subject) payload['subject'] = this.msg.subject;
    if (this.msg.mediaUrl) { payload['mediaUrl'] = this.msg.mediaUrl; payload['mediaType'] = this.msg.mediaType; }

    this.http.post<{ sent: boolean }>(`${API}/impulsador/registrations/${target._id}/message`, payload).subscribe({
      next: () => { this.toast.success('Mensaje enviado'); this.closeMessage(); this.sending.set(false); },
      error: (err: any) => { this.toast.error(err?.error?.message || 'Error al enviar'); this.sending.set(false); },
    });
  }

  async doCheckIn(r: Registration) {
    const ok = await this.confirm.confirm({
      title: 'Check-in',
      message: `¿Confirmar ingreso de ${r.name}?`,
      confirmText: 'Confirmar',
    });
    if (!ok) return;
    this.http.patch(`${API}/impulsador/registrations/${r._id}/check-in`, {}).subscribe({
      next: () => {
        this.toast.success('Check-in registrado');
        this.regs.update(list => list.map(x => x._id === r._id ? { ...x, checkedIn: true } : x));
      },
      error: (err: any) => this.toast.error(err?.error?.message || 'Error al registrar check-in'),
    });
  }

  formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
