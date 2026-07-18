import { Component, HostListener, OnDestroy, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  LucideAngularModule, Mail, MessageSquare, CheckCircle2, X, Users, Zap, Edit2,
  DollarSign, RefreshCw, Info, Wand2, Eye,
} from 'lucide-angular';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ToastService } from '../../shared/toast';
import { CampaignsApiService } from '../../core/api/campaigns-api.service';
import {
  Campaign, CampaignChannel, CampaignMediaType, CampaignPayload, CampaignTargeting,
  ContactList, PRESET_TAGS, WaTemplate,
} from '../../shared/models/campaign.model';
import { CampaignMediaComponent } from './campaign-media';

/** Drawer de creación/edición de campaña (email / WhatsApp WAHA / Cloud API). */
@Component({
  selector: 'app-campaign-editor',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, RouterLink, CampaignMediaComponent],
  template: `
    <div class="overlay" (click)="close()"></div>
    <div class="drawer">
      <div class="drawer-header">
        <h2 class="drawer-title">{{ editingId() ? 'Editar campaña' : 'Nueva campaña' }}</h2>
        <button class="btn btn-icon btn-ghost" (click)="close()">
          <lucide-icon [img]="X" [size]="20"></lucide-icon>
        </button>
      </div>
      <div class="drawer-body">
        @if (formError()) {
          <div class="form-error-box">{{ formError() }}</div>
        }

        <!-- Name -->
        <div class="field">
          <label class="label">Nombre de la campaña *</label>
          <input class="input" [(ngModel)]="form.name" placeholder="Ej: Promo Verano 2026" />
        </div>

        <!-- Channel tabs -->
        <div class="field">
          <label class="label">Canal *</label>
          <div class="channel-tabs">
            <button type="button" class="channel-tab" [class.active]="form.channel === 'email'" (click)="setChannel('email')">
              <lucide-icon [img]="Mail" [size]="14"></lucide-icon>
              Email
            </button>
            <button type="button" class="channel-tab" [class.active]="form.channel === 'waha'" (click)="setChannel('waha')">
              <lucide-icon [img]="MessageSquare" [size]="14"></lucide-icon>
              WhatsApp WAHA
            </button>
            <button type="button" class="channel-tab channel-tab-cloud" [class.active]="form.channel === 'cloudapi'" (click)="setChannel('cloudapi')">
              <lucide-icon [img]="Zap" [size]="14"></lucide-icon>
              Cloud API
            </button>
          </div>
        </div>

        <!-- Email: subject + editor -->
        @if (form.channel === 'email') {
          <div class="field">
            <label class="label">Asunto del email</label>
            <input class="input" [(ngModel)]="form.subject" placeholder="Ej: ¡Oferta exclusiva para ti!" />
          </div>

          <div class="field">
            <div class="email-toolbar">
              <div class="email-mode-tabs">
                <button type="button" class="email-tab" [class.active]="emailMode() === 'manual'" (click)="emailMode.set('manual')">
                  <lucide-icon [img]="Edit2" [size]="13"></lucide-icon>
                  Manual
                </button>
                <button type="button" class="email-tab" [class.active]="emailMode() === 'ai'" (click)="emailMode.set('ai')">
                  <lucide-icon [img]="Wand2" [size]="13"></lucide-icon>
                  Generar con IA
                </button>
              </div>
              <button type="button" class="btn btn-ghost btn-sm" (click)="openEmailPreview()">
                <lucide-icon [img]="Eye" [size]="13"></lucide-icon>
                Vista previa
              </button>
            </div>

            @if (emailMode() === 'ai') {
              <div class="ai-box">
                <div style="display:flex;flex-direction:column;gap:4px">
                  <label class="label" style="font-size:12px">¿Sobre qué es esta campaña?</label>
                  <textarea class="textarea" [(ngModel)]="aiTopic" rows="3"
                    placeholder="Ej: Promo de verano — 20% descuento en cócteles durante enero, para clientes frecuentes..."></textarea>
                </div>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                  <select class="select" [(ngModel)]="aiTone" style="flex:1;min-width:160px">
                    <option value="amigable">Amigable y cercano</option>
                    <option value="profesional">Profesional</option>
                    <option value="exclusivo">Exclusivo / premium</option>
                    <option value="urgente">Urgente / llamada a acción</option>
                  </select>
                  <button type="button" class="btn btn-primary btn-sm" (click)="generateEmailWithAI()"
                    [disabled]="aiGenerating() || !aiTopic.trim()">
                    <lucide-icon [img]="Wand2" [size]="13" [class.spin]="aiGenerating()"></lucide-icon>
                    {{ aiGenerating() ? 'Generando…' : 'Generar email' }}
                  </button>
                </div>
              </div>
            }

            <label class="label">Cuerpo del email *</label>
            <textarea class="textarea" [(ngModel)]="form.body" rows="8"
              placeholder="Hola {nombre}, tenemos algo especial para ti..."></textarea>
            <span style="font-size:11px;color:var(--color-text-muted);margin-top:2px">
              Usa &#123;nombre&#125; para personalizar. La vista previa usa "María" como ejemplo.
            </span>
          </div>
        }

        <!-- Cloud API: Template section -->
        @if (form.channel === 'cloudapi') {
          <div class="field">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <label class="label" style="margin:0">Plantilla aprobada</label>
              <button type="button" class="btn btn-ghost btn-sm" (click)="syncTemplates()" [disabled]="templatesLoading()">
                <lucide-icon [img]="RefreshCw" [size]="12" [class.spin]="templatesLoading()"></lucide-icon>
                Sincronizar
              </button>
            </div>
            @if (templatesLoading()) {
              <div style="text-align:center;padding:16px;color:var(--color-text-muted);font-size:13px">Cargando plantillas...</div>
            } @else if (templates().length === 0) {
              <div class="info-note">
                <lucide-icon [img]="Info" [size]="13"></lucide-icon>
                No hay plantillas. Ve a Configuración → Plantillas WhatsApp y sincroniza desde Meta.
              </div>
            } @else {
              <div class="templates-picker">
                @for (t of templates(); track t._id) {
                  <div class="tpl-card" [class.selected]="form.templateName === t.name" (click)="selectTemplate(t)">
                    <div class="tpl-card-head">
                      <span class="tpl-card-name">{{ t.name }}</span>
                      <span class="tpl-card-status tpl-status-{{ t.status.toLowerCase() }}">{{ t.status }}</span>
                    </div>
                    <div class="tpl-card-body">{{ t.body.substring(0,100) }}{{ t.body.length > 100 ? '…' : '' }}</div>
                    <div class="tpl-card-meta">{{ t.language }} · {{ t.category }}</div>
                  </div>
                }
              </div>
            }
          </div>

          <!-- Template vars -->
          @if (templateVarCount() > 0) {
            <div class="field">
              <label class="label">Variables de la plantilla</label>
              <div style="font-size:12px;color:var(--color-text-muted);margin-bottom:8px">
                Usa <code style="background:var(--color-bg-app);padding:1px 5px;border-radius:4px">&#123;nombre&#125;</code> para personalizar con el nombre del cliente.
              </div>
              @for (i of varIndexes(); track i) {
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                  <span class="var-tag">{{ '{{' + (i+1) + '}}' }}</span>
                  <input class="input" [(ngModel)]="form.templateVars[i]" [placeholder]="'Valor para ' + '{{' + (i+1) + '}}'" />
                </div>
              }
            </div>
          }

          <!-- Pricing preview -->
          @if (form.templateName && selectedTemplate()) {
            <div class="pricing-box">
              <lucide-icon [img]="DollarSign" [size]="16" style="color:#059669;flex-shrink:0"></lucide-icon>
              <div>
                <div class="pricing-label">Costo estimado</div>
                <div class="pricing-value">{{ cloudApiPriceEstimate() }}</div>
              </div>
            </div>
          }
        }

        <!-- Body: waha or cloud without template (email handled above) -->
        @if (form.channel !== 'email' && (form.channel !== 'cloudapi' || !form.templateName)) {
          <div class="field">
            <label class="label">{{ form.channel === 'cloudapi' ? 'Mensaje (libre, solo dentro de ventana 24h)' : 'Mensaje *' }}</label>
            <div style="font-size:12px;color:var(--color-text-muted);margin-bottom:6px">
              Usa <code style="background:var(--color-bg-app);padding:1px 5px;border-radius:4px">&#123;nombre&#125;</code> para personalizar.
            </div>
            <textarea class="textarea" [(ngModel)]="form.body" rows="5"
              placeholder="Hola {nombre}, tenemos algo especial para ti..."></textarea>
          </div>
        }

        <!-- Media (waha: full tabs · email: image/video) -->
        @if (form.channel !== 'cloudapi') {
          <app-campaign-media [channel]="form.channel" [(mediaUrl)]="form.mediaUrl" [(mediaType)]="form.mediaType" />
        }

        <!-- Targeting -->
        <div class="field">
          <label class="label">Destinatarios</label>
          <div class="targeting-tabs">
            <button type="button" class="targeting-tab" [class.active]="form.targeting === 'all'" (click)="setTargeting('all')">Todos los clientes</button>
            <button type="button" class="targeting-tab" [class.active]="form.targeting === 'tags'" (click)="setTargeting('tags')">Por etiquetas</button>
            <button type="button" class="targeting-tab" [class.active]="form.targeting === 'lists'" (click)="setTargeting('lists')">Por listas</button>
          </div>

          @if (form.targeting === 'tags') {
            <div class="tag-chips" style="margin-top:12px">
              @for (tag of PRESET_TAGS; track tag) {
                <button type="button" class="tag-chip" [class.selected]="isTagSelected(tag)" (click)="toggleTag(tag)">{{ tag }}</button>
              }
            </div>
          }

          @if (form.targeting === 'lists') {
            <div class="lists-selector">
              @if (availableLists().length === 0) {
                <div style="font-size:13px;color:var(--color-text-muted);padding:12px;text-align:center">
                  No hay listas. <a routerLink="/lists" style="color:var(--color-brand)">Crear lista</a>
                </div>
              } @else {
                @for (l of availableLists(); track l._id) {
                  <label class="list-option" [class.selected]="isListSelected(l._id)">
                    <input type="checkbox" [checked]="isListSelected(l._id)" (change)="toggleList(l._id)" style="display:none" />
                    <div class="list-dot" [style.background]="l.color"></div>
                    <div style="flex:1">
                      <div style="font-weight:600;font-size:13px">{{ l.name }}</div>
                      <div style="font-size:11px;color:var(--color-text-muted)">{{ l.type === 'dynamic' ? 'Dinámica' : 'Estática' }} · {{ l.memberCount }} miembros</div>
                    </div>
                    @if (isListSelected(l._id)) {
                      <lucide-icon [img]="CheckCircle2" [size]="16" style="color:var(--color-brand)"></lucide-icon>
                    }
                  </label>
                }
              }
            </div>
          }
        </div>

        @if (previewCount() !== null) {
          <div class="preview-count-box">
            <lucide-icon [img]="Users" [size]="16"></lucide-icon>
            <span>{{ previewLabel() }}</span>
          </div>
        }
      </div>
      <div class="drawer-footer">
        <button class="btn btn-ghost" (click)="close()">Cancelar</button>
        <button class="btn btn-primary" (click)="save()" [disabled]="saving()">
          {{ saving() ? 'Guardando...' : 'Guardar borrador' }}
        </button>
      </div>
    </div>

    <!-- Email preview modal -->
    @if (emailPreviewOpen()) {
      <div class="overlay" (click)="emailPreviewOpen.set(false)" style="z-index:200">
        <div class="email-preview-modal" (click)="$event.stopPropagation()">
          <div class="email-preview-header">
            <div style="min-width:0;flex:1">
              <div style="font-size:11px;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">Asunto</div>
              <div style="font-size:15px;font-weight:700;color:var(--color-text-main);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                {{ form.subject || '(sin asunto)' }}
              </div>
            </div>
            <button class="btn btn-icon btn-ghost" (click)="emailPreviewOpen.set(false)">
              <lucide-icon [img]="X" [size]="20"></lucide-icon>
            </button>
          </div>
          <div class="email-preview-scroll">
            <div [innerHTML]="emailPreviewHtml()"></div>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .overlay {
      position: fixed; inset: 0;
      background: rgba(15,23,42,.45); backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center; z-index: 100;
    }
    .drawer {
      position: fixed; top: 0; right: 0; height: 100vh; width: 520px;
      background: var(--color-white); box-shadow: var(--shadow-lg);
      display: flex; flex-direction: column; z-index: 101;
      animation: slideIn var(--transition-spring);
    }
    @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
    .drawer-header { display: flex; align-items: center; justify-content: space-between; padding: 24px 28px; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
    .drawer-title { font-family: var(--font-heading); font-size: 18px; font-weight: 700; margin: 0; }
    .drawer-body { flex: 1; overflow-y: auto; padding: 24px 28px; display: flex; flex-direction: column; gap: 20px; }
    .drawer-footer { padding: 20px 28px; border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: 12px; flex-shrink: 0; }

    .field { display: flex; flex-direction: column; gap: 6px; }
    .label { font-size: 13px; font-weight: 600; color: var(--color-text-main); }
    .form-error-box { background: #FEF2F2; border: 1px solid #FECACA; color: var(--color-error); border-radius: var(--radius-lg); padding: 12px 16px; font-size: 14px; }

    /* Channel tabs */
    .channel-tabs { display: flex; border: 1px solid var(--color-border); border-radius: var(--radius-pill); overflow: hidden; }
    .channel-tab {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
      padding: 9px 12px; border: none; background: transparent;
      font-size: 13px; font-weight: 600; color: var(--color-text-muted);
      cursor: pointer; transition: all var(--transition-fast);
    }
    .channel-tab:hover { background: var(--color-bg-app); color: var(--color-text-main); }
    .channel-tab.active { background: var(--color-brand); color: #fff; }
    .channel-tab-cloud.active { background: #7C3AED; }

    /* Info note */
    .info-note {
      display: flex; align-items: flex-start; gap: 7px;
      padding: 10px 12px; background: #F0F9FF; border: 1px solid #BAE6FD;
      border-radius: var(--radius-lg); font-size: 12px; color: #0369A1; line-height: 1.5;
    }

    /* Template picker */
    .templates-picker { display: flex; flex-direction: column; gap: 8px; max-height: 240px; overflow-y: auto; }
    .tpl-card {
      padding: 12px 14px; border: 1.5px solid var(--color-border);
      border-radius: var(--radius-lg); cursor: pointer; transition: all var(--transition-fast);
    }
    .tpl-card:hover { border-color: var(--color-brand); background: var(--color-brand-light); }
    .tpl-card.selected { border-color: var(--color-brand); background: var(--color-brand-light); }
    .tpl-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
    .tpl-card-name { font-size: 13px; font-weight: 700; color: var(--color-text-main); font-family: monospace; }
    .tpl-card-body { font-size: 12px; color: var(--color-text-muted); line-height: 1.4; }
    .tpl-card-meta { font-size: 11px; color: var(--color-text-muted); margin-top: 4px; }
    .tpl-card-status {
      font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: var(--radius-pill);
      background: var(--color-bg-app); color: var(--color-text-muted);
    }
    .tpl-status-approved { background: #F0FDF4; color: #15803D; }
    .tpl-status-pending  { background: #FEFCE8; color: #854D0E; }
    .tpl-status-rejected { background: #FEF2F2; color: #DC2626; }

    /* Var tag */
    .var-tag {
      font-size: 12px; font-weight: 700; font-family: monospace;
      padding: 6px 10px; background: var(--color-bg-app); border: 1px solid var(--color-border);
      border-radius: var(--radius-lg); white-space: nowrap; color: var(--color-brand);
    }

    /* Pricing box */
    .pricing-box {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 16px; background: #F0FDF4; border: 1px solid #BBF7D0;
      border-radius: var(--radius-lg);
    }
    .pricing-label { font-size: 11px; color: #15803D; font-weight: 600; }
    .pricing-value { font-size: 14px; font-weight: 700; color: #15803D; }

    /* Targeting */
    .targeting-tabs { display: flex; border-bottom: 1px solid var(--color-border); }
    .targeting-tab {
      padding: 8px 16px; border: none; background: transparent; color: var(--color-text-muted);
      font-size: 13px; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent;
      margin-bottom: -1px; transition: all var(--transition-fast);
    }
    .targeting-tab:hover { color: var(--color-text-main); }
    .targeting-tab.active { color: var(--color-brand); border-bottom-color: var(--color-brand); }

    .lists-selector { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; }
    .list-option {
      display: flex; align-items: center; gap: 10px; padding: 10px 14px;
      border: 1.5px solid var(--color-border); border-radius: var(--radius-lg);
      cursor: pointer; transition: all var(--transition-fast);
    }
    .list-option:hover { border-color: var(--color-brand); background: var(--color-brand-light); }
    .list-option.selected { border-color: var(--color-brand); background: var(--color-brand-light); }
    .list-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }

    .tag-chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .tag-chip {
      padding: 6px 14px; border-radius: var(--radius-pill); border: 1.5px solid var(--color-border);
      background: var(--color-white); color: var(--color-text-muted);
      font-size: 13px; font-weight: 600; cursor: pointer; transition: all var(--transition-fast);
    }
    .tag-chip.selected { border-color: var(--color-brand); background: var(--color-brand-light); color: var(--color-brand); }

    .preview-count-box {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 16px; background: #EFF6FF; border: 1px solid #BFDBFE;
      border-radius: var(--radius-lg); font-size: 14px; color: #1D4ED8;
    }

    @keyframes spin { to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; display: inline-block; }

    /* Email editor */
    .email-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 12px; }
    .email-mode-tabs { display: flex; border: 1px solid var(--color-border); border-radius: var(--radius-pill); overflow: hidden; }
    .email-tab {
      display: flex; align-items: center; gap: 5px; padding: 6px 14px; border: none;
      background: transparent; font-size: 12px; font-weight: 600; color: var(--color-text-muted);
      cursor: pointer; transition: all var(--transition-fast);
    }
    .email-tab:hover { background: var(--color-bg-app); color: var(--color-text-main); }
    .email-tab.active { background: var(--color-brand); color: #fff; }

    .ai-box {
      display: flex; flex-direction: column; gap: 10px;
      padding: 14px 16px; background: #F5F3FF; border: 1px solid #DDD6FE;
      border-radius: var(--radius-lg); margin-bottom: 12px;
    }

    /* Email preview modal */
    .email-preview-modal {
      background: var(--color-white); width: calc(100% - 48px); max-width: 700px;
      max-height: 90vh; border-radius: 24px; overflow: hidden;
      display: flex; flex-direction: column; box-shadow: var(--shadow-lg);
    }
    .email-preview-header {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 20px 24px; border-bottom: 1px solid var(--color-border); flex-shrink: 0;
    }
    .email-preview-scroll { flex: 1; overflow-y: auto; background: #f9fafb; }

    @media (max-width: 768px) {
      .drawer { width: 100%; }
      .drawer-header, .drawer-body, .drawer-footer { padding-left: 18px; padding-right: 18px; }
      .channel-tabs { flex-direction: column; border-radius: var(--radius-lg); }
      .channel-tab { width: 100%; padding: 10px 12px; }
      .targeting-tabs { overflow-x: auto; -webkit-overflow-scrolling: touch; flex-wrap: nowrap; }
      .targeting-tab { flex: 0 0 auto; white-space: nowrap; }
      .email-toolbar { flex-wrap: wrap; }
      .email-preview-modal { width: calc(100% - 24px); max-height: 85vh; }
      .email-preview-header { padding: 16px 18px; }
    }

    @media (max-width: 480px) {
      .templates-picker { max-height: 200px; }
      .ai-box select.select { min-width: 0; width: 100%; }
    }
  `],
})
export class CampaignEditorComponent implements OnInit, OnDestroy {
  private api = inject(CampaignsApiService);
  private toast = inject(ToastService);
  private sanitizer = inject(DomSanitizer);

  readonly Mail = Mail; readonly MessageSquare = MessageSquare; readonly CheckCircle2 = CheckCircle2;
  readonly X = X; readonly Users = Users; readonly Zap = Zap; readonly Edit2 = Edit2;
  readonly DollarSign = DollarSign; readonly RefreshCw = RefreshCw; readonly Info = Info;
  readonly Wand2 = Wand2; readonly Eye = Eye;
  readonly PRESET_TAGS = PRESET_TAGS;

  readonly CLOUD_PRICES: Record<string, number> = { MARKETING: 0.0625, UTILITY: 0.0175, AUTHENTICATION: 0.0250 };

  /** Campaña a editar; null para crear una nueva. */
  campaign = input<Campaign | null>(null);
  availableLists = input<ContactList[]>([]);
  /** Emitido tras guardar correctamente (el padre recarga y cierra). */
  saved = output<void>();
  /** Emitido al cancelar/cerrar sin guardar. */
  closed = output<void>();

  templates = signal<WaTemplate[]>([]);
  saving = signal(false);
  formError = signal('');
  previewCount = signal<number | null>(null);
  templatesLoading = signal(false);
  selectedTemplate = signal<WaTemplate | null>(null);
  emailMode = signal<'manual' | 'ai'>('manual');
  emailPreviewOpen = signal(false);
  emailPreviewHtml = signal<SafeHtml>('' as SafeHtml);
  aiGenerating = signal(false);
  aiTopic = '';
  aiTone = 'amigable';

  form = {
    name: '',
    channel: 'email' as CampaignChannel,
    subject: '',
    body: '',
    targeting: 'tags' as CampaignTargeting,
    recipientTags: [] as string[],
    listIds: [] as string[],
    mediaUrl: '',
    mediaType: 'image' as CampaignMediaType,
    templateName: '',
    templateLanguage: 'es',
    templateVars: [] as string[],
  };

  private previewTimer: ReturnType<typeof setTimeout> | null = null;

  editingId = computed(() => this.campaign()?._id ?? null);

  previewLabel = computed(() => {
    const n = this.previewCount();
    if (n === null) return '';
    if (n === 0) return 'Sin clientes en este segmento';
    return `${n} cliente${n !== 1 ? 's' : ''} recibirán esta campaña`;
  });

  templateVarCount = computed(() => {
    const t = this.selectedTemplate();
    if (!t) return 0;
    const matches = t.body.match(/\{\{\d+\}\}/g) ?? [];
    if (matches.length === 0) return 0;
    return Math.max(...matches.map(m => parseInt(m.replace(/\D/g, ''), 10)));
  });

  varIndexes = computed(() => Array.from({ length: this.templateVarCount() }, (_, i) => i));

  cloudApiPriceEstimate = computed(() => {
    const t = this.selectedTemplate();
    const count = this.previewCount() ?? 0;
    if (!t) return '';
    const price = this.CLOUD_PRICES[t.category] ?? 0.0625;
    if (count === 0) return `$${price.toFixed(4)} USD por conversación (${t.category})`;
    return `~$${(count * price).toFixed(2)} USD para ${count} destinatarios · $${price.toFixed(4)}/conversación (${t.category})`;
  });

  ngOnInit() {
    const c = this.campaign();
    if (c) {
      const channel: CampaignChannel = c.type === 'email' ? 'email' : (c.waProvider === 'cloudapi' ? 'cloudapi' : 'waha');
      this.form = {
        name: c.name,
        channel,
        subject: c.subject ?? '',
        body: c.body,
        targeting: c.targeting ?? 'tags',
        recipientTags: [...(c.recipientTags ?? [])],
        listIds: [...(c.listIds ?? [])],
        mediaUrl: c.mediaUrl ?? '',
        mediaType: c.mediaType ?? 'image',
        templateName: c.templateName ?? '',
        templateLanguage: c.templateLanguage ?? 'es',
        templateVars: [...(c.templateVars ?? [])],
      };
    }
    this.schedulePreview();
    if (this.form.channel === 'cloudapi') this.loadTemplates();
  }

  ngOnDestroy() {
    if (this.previewTimer) clearTimeout(this.previewTimer);
  }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.emailPreviewOpen()) { this.emailPreviewOpen.set(false); return; }
    this.close();
  }

  close() {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.closed.emit();
  }

  /** Las plantillas se replican en cada cuenta Cloud API vinculada; para campañas basta una por nombre. */
  private dedupeByName(list: WaTemplate[]): WaTemplate[] {
    const seen = new Set<string>();
    return list.filter(t => (seen.has(t.name) ? false : (seen.add(t.name), true)));
  }

  loadTemplates() {
    if (this.templatesLoading()) return;
    this.templatesLoading.set(true);
    this.api.getTemplates().subscribe({
      next: (data) => {
        const unique = this.dedupeByName(data);
        this.templates.set(unique);
        this.templatesLoading.set(false);
        if (this.form.templateName && !this.selectedTemplate()) {
          this.selectedTemplate.set(unique.find(t => t.name === this.form.templateName) ?? null);
        }
      },
      error: () => this.templatesLoading.set(false),
    });
  }

  syncTemplates() {
    this.templatesLoading.set(true);
    this.api.syncTemplates().subscribe({
      next: (data) => { const unique = this.dedupeByName(data); this.templates.set(unique); this.templatesLoading.set(false); this.toast.success(`${unique.length} plantilla(s) sincronizadas`); },
      error: (err: { error?: { message?: string } }) => { this.templatesLoading.set(false); this.toast.error(err.error?.message || 'Error al sincronizar'); },
    });
  }

  setChannel(ch: CampaignChannel) {
    this.form.channel = ch;
    this.form.mediaUrl = '';
    this.form.mediaType = 'image';
    this.form.templateName = '';
    this.form.templateVars = [];
    this.selectedTemplate.set(null);
    if (ch === 'cloudapi') this.loadTemplates();
  }

  selectTemplate(t: WaTemplate) {
    this.form.templateName = t.name;
    this.form.templateLanguage = t.language;
    this.selectedTemplate.set(t);
    const count = Math.max(...(t.body.match(/\{\{\d+\}\}/g) ?? ['{{0}}']).map(m => parseInt(m.replace(/\D/g, ''), 10)));
    const realCount = isFinite(count) ? count : 0;
    this.form.templateVars = Array.from({ length: realCount }, (_, i) => this.form.templateVars[i] ?? '');
  }

  toggleTag(tag: string) {
    const idx = this.form.recipientTags.indexOf(tag);
    if (idx >= 0) this.form.recipientTags.splice(idx, 1);
    else this.form.recipientTags.push(tag);
    this.schedulePreview();
  }
  isTagSelected(tag: string) { return this.form.recipientTags.includes(tag); }

  setTargeting(t: CampaignTargeting) { this.form.targeting = t; this.schedulePreview(); }

  toggleList(id: string) {
    const idx = this.form.listIds.indexOf(id);
    if (idx >= 0) this.form.listIds.splice(idx, 1);
    else this.form.listIds.push(id);
    this.schedulePreview();
  }
  isListSelected(id: string) { return this.form.listIds.includes(id); }

  private schedulePreview() {
    if (this.previewTimer) clearTimeout(this.previewTimer);
    this.previewTimer = setTimeout(() => this.fetchPreview(), 400);
  }

  private fetchPreview() {
    if (this.form.targeting === 'all') {
      this.api.previewCount().subscribe({ next: (r) => this.previewCount.set(r.count), error: () => {} });
    } else if (this.form.targeting === 'tags') {
      this.api.previewCount(this.form.recipientTags).subscribe({ next: (r) => this.previewCount.set(r.count), error: () => {} });
    } else {
      const total = this.availableLists()
        .filter(l => this.form.listIds.includes(l._id))
        .reduce((s, l) => s + (l.memberCount ?? 0), 0);
      this.previewCount.set(total);
    }
  }

  generateEmailWithAI() {
    if (!this.aiTopic.trim()) return;
    this.aiGenerating.set(true);
    this.api.generateEmail(this.aiTopic, this.aiTone).subscribe({
      next: (data) => {
        this.form.subject = data.subject;
        this.form.body = data.body;
        this.aiGenerating.set(false);
        this.emailMode.set('manual');
        this.toast.success('Email generado — puedes editarlo antes de guardar');
      },
      error: (err: { error?: { message?: string } }) => {
        this.aiGenerating.set(false);
        this.toast.error(err.error?.message || 'Error al generar con IA');
      },
    });
  }

  openEmailPreview() {
    this.emailPreviewHtml.set(
      this.sanitizer.bypassSecurityTrustHtml(this.buildEmailPreviewHtml()),
    );
    this.emailPreviewOpen.set(true);
  }

  private buildEmailPreviewHtml(): string {
    const body = (this.form.body || '').replace(/\{nombre\}/gi, 'María');
    const escaped = body
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const mediaUrl = this.form.mediaUrl;
    const mediaType = this.form.mediaType;
    const mediaHtml = mediaUrl
      ? mediaType === 'video'
        ? `<div style="text-align:center;margin-bottom:24px;"><video src="${mediaUrl}" controls style="max-width:100%;border-radius:16px;"></video></div>`
        : `<div style="text-align:center;margin-bottom:24px;"><img src="${mediaUrl}" alt="" style="max-width:100%;border-radius:16px;" /></div>`
      : '';
    const bodyHtml = escaped
      ? `<div style="font-size:16px;color:#374151;line-height:1.7;white-space:pre-wrap;">${escaped}</div>`
      : `<div style="font-size:15px;color:#9CA3AF;font-style:italic;">El mensaje aparecerá aquí...</div>`;
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <style>body{margin:0;padding:0;background:#f9fafb;}</style>
      </head><body>
      <div style="font-family:'Inter',Arial,sans-serif;background:#f9fafb;padding:32px 16px;">
        <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 10px 15px -3px rgba(0,0,0,.1);">
          <div style="padding:40px;">${mediaHtml}${bodyHtml}</div>
          <div style="background:#111827;padding:20px;text-align:center;">
            <p style="color:#9ca3af;font-size:12px;margin:0;">© 2026 MAYA Platform</p>
          </div>
        </div>
      </div>
    </body></html>`;
  }

  save() {
    if (!this.form.name.trim()) { this.formError.set('El nombre es obligatorio'); return; }
    const isCloud = this.form.channel === 'cloudapi';
    const hasTemplate = isCloud && !!this.form.templateName;
    if (!hasTemplate && !this.form.body.trim()) { this.formError.set('El mensaje es obligatorio'); return; }
    this.formError.set('');
    this.saving.set(true);

    const isWa = this.form.channel !== 'email';
    const body = hasTemplate ? `[Plantilla: ${this.form.templateName}]` : this.form.body;

    const payload: CampaignPayload = {
      name: this.form.name.trim(),
      type: isWa ? 'whatsapp' : 'email',
      waProvider: isWa ? (this.form.channel as 'waha' | 'cloudapi') : undefined,
      subject: !isWa ? (this.form.subject.trim() || undefined) : undefined,
      body,
      targeting: this.form.targeting,
      recipientTags: this.form.targeting === 'tags' ? this.form.recipientTags : [],
      listIds: this.form.targeting === 'lists' ? this.form.listIds : [],
    };
    if (this.form.mediaUrl) {
      payload.mediaUrl = this.form.mediaUrl;
      payload.mediaType = this.form.mediaType;
    }
    if (hasTemplate) {
      payload.templateName = this.form.templateName;
      payload.templateLanguage = this.form.templateLanguage;
      payload.templateVars = this.form.templateVars;
    }

    const req$ = this.editingId()
      ? this.api.updateCampaign(this.editingId()!, payload)
      : this.api.createCampaign(payload);

    req$.subscribe({
      next: () => {
        this.toast.success(this.editingId() ? 'Campaña actualizada' : 'Campaña creada');
        this.saving.set(false);
        this.saved.emit();
      },
      error: (err: { error?: { message?: string } }) => {
        const msg = err.error?.message || 'Error al guardar';
        this.formError.set(msg);
        this.toast.error(msg);
        this.saving.set(false);
      },
    });
  }
}
