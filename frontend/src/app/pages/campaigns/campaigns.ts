import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import {
  LucideAngularModule, Plus, Send, Edit2, Trash2, Megaphone, Mail, MessageSquare,
  CheckCircle2, Clock, AlertCircle, Copy, Search, Image, Video, RotateCcw, Mic, FileText,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { CampaignsApiService } from '../../core/api/campaigns-api.service';
import { Campaign, CampaignChannel, CampaignEstimate, ContactList } from '../../shared/models/campaign.model';
import { CampaignEditorComponent } from './campaign-editor';

@Component({
  selector: 'app-campaigns',
  standalone: true,
  imports: [LucideAngularModule, CampaignEditorComponent],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1 class="page-title">Campañas</h1>
          <p class="page-subtitle">Email y WhatsApp para tus clientes</p>
        </div>
        <button class="btn btn-primary btn-lg" (click)="openDrawer()">
          <lucide-icon [img]="Plus" [size]="18"></lucide-icon>
          Nueva Campaña
        </button>
      </div>

      <div class="stats-row">
        <div class="stat-card"><div class="stat-value">{{ campaigns().length }}</div><div class="stat-label">Total campañas</div></div>
        <div class="stat-card"><div class="stat-value">{{ sentCount() }}</div><div class="stat-label">Enviadas</div></div>
        <div class="stat-card"><div class="stat-value">{{ draftCount() }}</div><div class="stat-label">Borradores</div></div>
        <div class="stat-card"><div class="stat-value">{{ totalRecipients() }}</div><div class="stat-label">Destinatarios totales</div></div>
      </div>

      <div class="filter-bar">
        <div class="status-tabs">
          <button class="status-tab" [class.active]="statusFilter() === 'all'" (click)="statusFilter.set('all')">
            Todas <span class="tab-count">{{ campaigns().length }}</span>
          </button>
          <button class="status-tab" [class.active]="statusFilter() === 'draft'" (click)="statusFilter.set('draft')">
            Borradores <span class="tab-count">{{ draftCount() }}</span>
          </button>
          <button class="status-tab" [class.active]="statusFilter() === 'sent'" (click)="statusFilter.set('sent')">
            Enviadas <span class="tab-count">{{ sentCount() }}</span>
          </button>
        </div>
        <div class="search-wrap">
          <lucide-icon [img]="Search" [size]="15" class="search-icon"></lucide-icon>
          <input class="input search-input" placeholder="Buscar campaña..."
            (input)="searchQuery.set($any($event.target).value)" [value]="searchQuery()" />
        </div>
      </div>

      <div class="card" style="padding: 0; overflow: hidden;">
        @if (loading()) {
          <div class="empty-state">
            <lucide-icon [img]="Megaphone" [size]="40" style="color:var(--color-text-muted);opacity:.4"></lucide-icon>
            <p style="color:var(--color-text-muted)">Cargando...</p>
          </div>
        } @else if (filteredCampaigns().length === 0) {
          <div class="empty-state">
            <lucide-icon [img]="Megaphone" [size]="48" style="color:var(--color-text-muted);opacity:.3"></lucide-icon>
            <p style="color:var(--color-text-muted);margin-top:12px">{{ campaigns().length === 0 ? 'No hay campañas aún.' : 'Sin resultados.' }}</p>
            @if (campaigns().length === 0) {
              <button class="btn btn-primary btn-sm" (click)="openDrawer()" style="margin-top:16px">Crear primera campaña</button>
            }
          </div>
        } @else {
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Campaña</th>
                  <th>Canal</th>
                  <th>Audiencia</th>
                  <th>Estado</th>
                  <th style="text-align:right">Destinatarios</th>
                  <th>Envío</th>
                  <th style="width:180px"></th>
                </tr>
              </thead>
              <tbody>
                @for (c of filteredCampaigns(); track c._id) {
                  <tr>
                    <td>
                      <div style="display:flex;align-items:center;gap:8px">
                        <div>
                          <div class="campaign-name">{{ c.name }}</div>
                          @if (c.subject) {
                            <div class="campaign-subject">{{ c.subject }}</div>
                          }
                          @if (c.templateName) {
                            <div class="campaign-subject" style="font-family:monospace">{{ c.templateName }}</div>
                          }
                        </div>
                        @if (c.mediaUrl) {
                          <span class="media-indicator" [title]="mediaTitle(c)">
                            <lucide-icon [img]="mediaIcon(c)" [size]="12"></lucide-icon>
                          </span>
                        }
                      </div>
                    </td>
                    <td>
                      <span class="type-badge"
                        [class.type-email]="channelOf(c) === 'email'"
                        [class.type-wa]="channelOf(c) === 'waha'"
                        [class.type-cloud]="channelOf(c) === 'cloudapi'">
                        <lucide-icon [img]="channelOf(c) === 'email' ? Mail : MessageSquare" [size]="12"></lucide-icon>
                        {{ channelLabel(c) }}
                      </span>
                    </td>
                    <td class="audience-cell">
                      @if (c.targeting === 'lists' && c.listIds.length) {
                        <div class="audience-badges">
                          @for (lid of c.listIds.slice(0,2); track lid) {
                            <span class="badge-list" [style.background]="listColor(lid) + '22'" [style.color]="listColor(lid)">{{ listName(lid) }}</span>
                          }
                          @if (c.listIds.length > 2) {
                            <span class="badge-list" style="background:var(--color-bg-app);color:var(--color-text-muted)">+{{ c.listIds.length - 2 }}</span>
                          }
                        </div>
                      } @else if (c.targeting !== 'all' && c.recipientTags.length) {
                        <div class="audience-badges">
                          @for (tag of c.recipientTags.slice(0,3); track tag) {
                            <span class="badge-secondary" style="font-size:11px">{{ tag }}</span>
                          }
                          @if (c.recipientTags.length > 3) {
                            <span class="badge-secondary" style="font-size:11px">+{{ c.recipientTags.length - 3 }}</span>
                          }
                        </div>
                      } @else {
                        <span class="all-label">Todos los clientes</span>
                      }
                    </td>
                    <td>
                      <span class="status-badge status-{{ c.status }}">
                        <lucide-icon [img]="statusIcon(c.status)" [size]="12"></lucide-icon>
                        {{ statusLabel(c.status) }}
                      </span>
                      @if (c.errorMessage) {
                        <div class="error-msg" [title]="c.errorMessage">
                          <lucide-icon [img]="AlertCircle" [size]="11"></lucide-icon>
                          {{ c.errorMessage.length > 40 ? c.errorMessage.slice(0,40) + '…' : c.errorMessage }}
                        </div>
                      }
                    </td>
                    <td style="text-align:right;font-weight:700;font-size:15px;color:var(--color-text-main)">
                      {{ c.status === 'draft' ? '—' : (c.recipientCount || 0) }}
                    </td>
                    <td class="date-cell">{{ c.sentAt ? formatDate(c.sentAt) : '—' }}</td>
                    <td>
                      <div class="row-actions">
                        @if (c.status === 'sending') {
                          <span style="font-size:12px;color:var(--color-text-muted)">Enviando...</span>
                        } @else {
                          <button class="btn btn-icon btn-ghost btn-sm" (click)="openDrawer(c)" title="Editar">
                            <lucide-icon [img]="Edit2" [size]="14"></lucide-icon>
                          </button>
                          @if (c.status === 'draft') {
                            @if (channelOf(c) === 'waha') {
                              <button class="btn btn-icon btn-ghost btn-sm" (click)="copyWhatsApp(c)" title="Copiar mensaje">
                                <lucide-icon [img]="Copy" [size]="14"></lucide-icon>
                              </button>
                            }
                            <button class="btn btn-sm btn-primary" (click)="sendCampaign(c)">
                              <lucide-icon [img]="Send" [size]="13"></lucide-icon>
                              Enviar
                            </button>
                          } @else {
                            <button class="btn btn-sm btn-secondary" (click)="resendCampaign(c)">
                              <lucide-icon [img]="RotateCcw" [size]="13"></lucide-icon>
                              Reenviar
                            </button>
                          }
                          <button class="btn btn-icon btn-ghost btn-sm action-delete" (click)="deleteCampaign(c)" title="Eliminar">
                            <lucide-icon [img]="Trash2" [size]="14"></lucide-icon>
                          </button>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="table-footer">{{ filteredCampaigns().length }} campaña(s)</div>
        }
      </div>
    </div>

    @if (drawerOpen()) {
      <app-campaign-editor
        [campaign]="editing()"
        [availableLists]="availableLists()"
        (saved)="onEditorSaved()"
        (closed)="drawerOpen.set(false)" />
    }
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 28px; }
    .page-title { font-family: var(--font-heading); font-size: 26px; font-weight: 700; color: var(--color-text-main); margin: 0 0 4px; }
    .page-subtitle { font-size: 14px; color: var(--color-text-muted); margin: 0; }

    .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
    .stat-card { background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 20px 24px; }
    .stat-value { font-size: 28px; font-weight: 800; color: var(--color-text-main); font-family: var(--font-heading); }
    .stat-label { font-size: 12px; color: var(--color-text-muted); margin-top: 4px; }

    .empty-state { display: flex; flex-direction: column; align-items: center; padding: 64px 24px; }

    .type-badge {
      display: inline-flex; align-items: center; gap: 5px;
      font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: var(--radius-pill);
    }
    .type-email { background: #EFF6FF; color: #2563EB; }
    .type-wa    { background: #F0FDF4; color: #16A34A; }
    .type-cloud { background: #F5F3FF; color: #7C3AED; }

    .status-badge {
      display: inline-flex; align-items: center; gap: 5px;
      font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: var(--radius-pill);
    }
    .status-draft   { background: var(--color-bg-app); color: var(--color-text-muted); }
    .status-sending { background: #FEF9C3; color: #854D0E; }
    .status-sent    { background: #F0FDF4; color: #16A34A; }
    .status-failed  { background: #FEF2F2; color: var(--color-error); }

    /* Filter bar */
    .filter-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
    .status-tabs { display: flex; gap: 4px; }
    .status-tab {
      padding: 7px 14px; border-radius: var(--radius-pill); border: 1px solid var(--color-border);
      background: var(--color-white); font-size: 13px; font-weight: 600;
      color: var(--color-text-muted); cursor: pointer; transition: all var(--transition-fast);
      display: flex; align-items: center; gap: 6px;
    }
    .status-tab:hover { border-color: var(--color-brand); color: var(--color-brand); }
    .status-tab.active { background: var(--color-brand); border-color: var(--color-brand); color: #fff; }
    .status-tab.active .tab-count { background: rgba(255,255,255,.25); color: #fff; }
    .tab-count { font-size: 11px; background: var(--color-bg-app); border-radius: var(--radius-pill); padding: 1px 6px; }
    .search-wrap { position: relative; min-width: 220px; }
    .search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--color-text-muted); pointer-events: none; }
    .search-input { padding-left: 36px; }

    /* Table */
    .table-wrap { background: var(--color-white); border: 1px solid var(--color-border); border-radius: 16px; overflow: hidden; }
    .table-wrap table { width: 100%; border-collapse: collapse; }
    .table-wrap th { padding: 13px 16px; text-align: left; font-size: 12px; font-weight: 700; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: .05em; background: var(--color-bg-app); border-bottom: 1px solid var(--color-border); }
    .table-wrap td { padding: 14px 16px; border-bottom: 1px solid var(--color-border); font-size: 14px; vertical-align: middle; }
    .table-wrap tr:last-child td { border-bottom: none; }
    .table-wrap tr:hover td { background: var(--color-bg-app); }
    .table-footer { padding: 12px 20px; font-size: 13px; color: var(--color-text-muted); background: var(--color-bg-app); border: 1px solid var(--color-border); border-top: none; border-radius: 0 0 16px 16px; }

    .campaign-name { font-weight: 600; font-size: 14px; color: var(--color-text-main); }
    .campaign-subject { font-size: 12px; color: var(--color-text-muted); margin-top: 2px; }
    .audience-cell { max-width: 220px; }
    .audience-badges { display: flex; flex-wrap: wrap; gap: 4px; }
    .all-label { font-size: 13px; color: var(--color-text-muted); }
    .date-cell { font-size: 13px; color: var(--color-text-muted); white-space: nowrap; }
    .row-actions { display: flex; gap: 6px; justify-content: flex-end; align-items: center; }
    .action-delete { color: var(--color-text-muted) !important; }
    .action-delete:hover { color: var(--color-error) !important; background: #FEF2F2 !important; }

    .media-indicator {
      display: inline-flex; align-items: center; justify-content: center;
      width: 20px; height: 20px; border-radius: var(--radius-pill);
      background: var(--color-bg-app); color: var(--color-text-muted);
      border: 1px solid var(--color-border); flex-shrink: 0;
    }
    .error-msg {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 11px; color: var(--color-error); margin-top: 4px;
      background: #FEF2F2; padding: 2px 8px; border-radius: var(--radius-pill);
      max-width: 200px; cursor: default;
    }
    .badge-list {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: var(--radius-pill);
    }

    @media (max-width: 768px) {
      .page { padding: 20px 16px; }
      .page-header { flex-wrap: wrap; gap: 12px; }
      .page-header .btn { width: 100%; justify-content: center; }
      .stats-row { grid-template-columns: repeat(2, 1fr); gap: 12px; }
      .filter-bar { flex-direction: column; align-items: stretch; }
      .status-tabs { flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 4px; }
      .status-tab { flex: 0 0 auto; white-space: nowrap; min-height: 40px; }
      .search-wrap { min-width: 0; width: 100%; }
      .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      .table-wrap table { min-width: 800px; }
    }

    @media (max-width: 480px) {
      .page { padding: 16px 12px; }
      .page-title { font-size: 22px; }
      .stats-row { grid-template-columns: repeat(2, 1fr); gap: 10px; }
      .stat-card { padding: 14px 16px; }
      .stat-value { font-size: 22px; }
    }
  `],
})
export class CampaignsComponent implements OnInit, OnDestroy {
  private api = inject(CampaignsApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly Plus = Plus; readonly Send = Send; readonly Edit2 = Edit2;
  readonly Trash2 = Trash2; readonly Megaphone = Megaphone; readonly Mail = Mail;
  readonly MessageSquare = MessageSquare; readonly CheckCircle2 = CheckCircle2;
  readonly Clock = Clock; readonly AlertCircle = AlertCircle; readonly Copy = Copy;
  readonly Search = Search; readonly Image = Image; readonly Video = Video;
  readonly RotateCcw = RotateCcw; readonly Mic = Mic; readonly FileText = FileText;

  campaigns = signal<Campaign[]>([]);
  availableLists = signal<ContactList[]>([]);
  loading = signal(true);
  drawerOpen = signal(false);
  editing = signal<Campaign | null>(null);
  statusFilter = signal<'all' | 'draft' | 'sent'>('all');
  searchQuery = signal('');

  private pollTimer: ReturnType<typeof setInterval> | null = null;

  sentCount       = computed(() => this.campaigns().filter(c => c.status === 'sent').length);
  draftCount      = computed(() => this.campaigns().filter(c => c.status === 'draft').length);
  totalRecipients = computed(() => this.campaigns().filter(c => c.status === 'sent').reduce((s, c) => s + (c.recipientCount || 0), 0));

  filteredCampaigns = computed(() => {
    let list = this.campaigns();
    const sf = this.statusFilter();
    const q = this.searchQuery().toLowerCase();
    if (sf !== 'all') list = list.filter(c => c.status === sf);
    if (q) list = list.filter(c => c.name.toLowerCase().includes(q));
    return list;
  });

  ngOnInit() { this.load(); this.loadLists(); }

  ngOnDestroy() { this.stopPolling(); }

  load() {
    this.loading.set(true);
    this.api.getCampaigns().subscribe({
      next: (data) => {
        this.campaigns.set(data);
        this.loading.set(false);
        if (data.some(c => c.status === 'sending')) this.startPolling();
      },
      error: () => { this.toast.error('Error al cargar campañas'); this.loading.set(false); },
    });
  }

  loadLists() {
    this.api.getLists().subscribe({
      next: (data) => this.availableLists.set(data),
      error: () => {},
    });
  }

  private startPolling() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => {
      if (!this.campaigns().some(c => c.status === 'sending')) { this.stopPolling(); return; }
      this.api.getCampaigns().subscribe({
        next: (data) => {
          this.campaigns.set(data);
          if (!data.some(c => c.status === 'sending')) {
            this.stopPolling();
            this.toast.success('Envío WAHA completado');
          }
        },
      });
    }, 5000);
  }

  private stopPolling() {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
  }

  openDrawer(c?: Campaign) {
    this.editing.set(c ?? null);
    this.drawerOpen.set(true);
  }

  onEditorSaved() {
    this.drawerOpen.set(false);
    this.load();
  }

  listName(id: string): string { return this.availableLists().find(l => l._id === id)?.name ?? id; }
  listColor(id: string): string { return this.availableLists().find(l => l._id === id)?.color ?? '#6366F1'; }

  channelOf(c: Campaign): CampaignChannel {
    if (c.type === 'email') return 'email';
    return c.waProvider === 'cloudapi' ? 'cloudapi' : 'waha';
  }
  channelLabel(c: Campaign): string {
    const ch = this.channelOf(c);
    if (ch === 'email') return 'Email';
    if (ch === 'cloudapi') return 'WA Cloud';
    return 'WA WAHA';
  }
  mediaIcon(c: Campaign) {
    if (c.mediaType === 'video') return this.Video;
    if (c.mediaType === 'audio') return this.Mic;
    if (c.mediaType === 'document') return this.FileText;
    return this.Image;
  }
  mediaTitle(c: Campaign): string {
    const map: Record<string, string> = { video: 'Video', audio: 'Audio', document: 'Documento', image: 'Imagen' };
    return 'Incluye ' + (map[c.mediaType ?? 'image'] ?? 'media');
  }

  async sendCampaign(c: Campaign) {
    const estimate = await this.fetchEstimate(c._id);
    const timeMsg = this.buildEstimateMsg(c, estimate);
    const ok = await this.confirm.confirm({
      title: 'Enviar campaña',
      message: `¿Enviar "${c.name}" a los clientes del segmento?${timeMsg}`,
      confirmText: 'Enviar ahora',
      danger: false,
    });
    if (!ok) return;
    this.api.sendCampaign(c._id).subscribe({
      next: (updated) => {
        this.campaigns.update(list => list.map(x => x._id === updated._id ? updated : x));
        if (updated.status === 'sending') {
          this.toast.success('Enviando por WAHA en background. Se actualizará automáticamente.');
          this.startPolling();
        } else {
          this.toast.success('Campaña enviada correctamente');
        }
      },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'Error al enviar'),
    });
  }

  async resendCampaign(c: Campaign) {
    const estimate = await this.fetchEstimate(c._id);
    const timeMsg = this.buildEstimateMsg(c, estimate);
    const ok = await this.confirm.confirm({
      title: 'Reenviar campaña',
      message: `¿Reenviar "${c.name}" al mismo segmento?${timeMsg}`,
      confirmText: 'Reenviar',
      danger: false,
    });
    if (!ok) return;
    this.api.resendCampaign(c._id).subscribe({
      next: (updated) => {
        this.campaigns.update(list => list.map(x => x._id === updated._id ? updated : x));
        if (updated.status === 'sending') {
          this.toast.success('Reenviando por WAHA en background. Se actualizará automáticamente.');
          this.startPolling();
        } else {
          this.toast.success('Campaña reenviada');
        }
      },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'Error al reenviar'),
    });
  }

  private fetchEstimate(id: string): Promise<CampaignEstimate | null> {
    return new Promise(resolve => {
      this.api.getEstimate(id).subscribe({
        next: (e) => resolve(e),
        error: () => resolve(null),
      });
    });
  }

  private buildEstimateMsg(c: Campaign, e: CampaignEstimate | null): string {
    if (!e) return '';
    const ch = this.channelOf(c);
    const parts: string[] = [`\n\nDestinatarios: ${e.recipientCount}`];
    if (ch === 'cloudapi') {
      const price = e.cloudApiPricePerMsg ?? 0.0625;
      const total = (e.recipientCount * price).toFixed(2);
      parts.push(`Costo estimado: ~$${total} USD · $${price.toFixed(4)} por conversación.`);
      parts.push(`Tiempo: casi inmediato (Cloud API oficial).`);
    } else if (ch === 'waha') {
      if (e.remaining < e.recipientCount) {
        parts.push(`Límite diario: se enviarán ${e.remaining} de ${e.recipientCount} (${e.sentToday} ya enviados hoy, límite ${e.dailyLimit}).`);
      }
      if (e.remaining > 0) {
        parts.push(`Tiempo estimado: ~${e.estimatedMinutes} min (envío escalonado, 30–60 s entre mensajes).`);
      } else {
        parts.push(`Límite diario alcanzado (${e.dailyLimit} mensajes). Configúralo en Ajustes.`);
      }
    }
    return '\n' + parts.join('\n');
  }

  async deleteCampaign(c: Campaign) {
    const ok = await this.confirm.confirm({ title: 'Eliminar campaña', message: `¿Eliminar "${c.name}"?`, confirmText: 'Eliminar', danger: true });
    if (!ok) return;
    this.api.deleteCampaign(c._id).subscribe({
      next: () => { this.toast.success('Campaña eliminada'); this.load(); },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'Error al eliminar'),
    });
  }

  copyWhatsApp(c: Campaign) {
    navigator.clipboard.writeText(c.body).then(
      () => this.toast.success('Mensaje copiado'),
      () => this.toast.error('No se pudo copiar'),
    );
  }

  statusLabel(s: string): string {
    const map: Record<string, string> = { draft: 'Borrador', sending: 'Enviando...', sent: 'Enviada', failed: 'Error' };
    return map[s] ?? s;
  }

  statusIcon(s: string) {
    const map: Record<string, unknown> = { draft: this.Clock, sending: this.Clock, sent: this.CheckCircle2, failed: this.AlertCircle };
    return (map[s] ?? this.Clock) as typeof this.Clock;
  }

  formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
