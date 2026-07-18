import { Component, inject, signal, OnInit, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, RefreshCw, Save, Eye, EyeOff, Plus, Trash2, X, Layout, Sparkles,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { AccountsApiService } from '../../core/api/accounts-api.service';
import { TenantSettings, WaTemplate, WaTemplateCategory } from '../../shared/models/accounts.model';
import { WhatsappSettingsComponent } from './whatsapp-settings';
import { InstagramSettingsComponent } from './instagram-settings';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, WhatsappSettingsComponent, InstagramSettingsComponent],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1 class="page-title">Configuración</h1>
          <p class="page-subtitle">Integraciones y ajustes de la plataforma</p>
        </div>
      </div>

      <!-- WhatsApp Accounts Card -->
      <app-whatsapp-settings
        (defaultProviderChange)="onWaProviderChange($event)"
        (cloudAccountsChange)="onCloudAccountsChange($event)" />

      <!-- Instagram Accounts Card -->
      <app-instagram-settings />

      <!-- IA / Agentes Card -->
      <div class="section-card">
        <div class="section-header">
          <div class="section-icon" style="background: #EEF2FF;">
            <lucide-icon [img]="Sparkles" [size]="22" style="color: #4F46E5;"></lucide-icon>
          </div>
          <div>
            <h2 class="section-title">Inteligencia Artificial</h2>
            <p class="section-desc">API keys para los agentes de IA. Selecciona el proveedor en cada agente.</p>
          </div>
        </div>

        <div class="fields-grid">
          <div class="field">
            <label class="label">OpenAI API Key</label>
            <div class="input-wrap">
              <input class="input" [type]="showAiKey()['openai'] ? 'text' : 'password'" [(ngModel)]="aiKeys.openaiApiKey" placeholder="sk-..." />
              <button class="eye-btn" (click)="toggleAiKey('openai')" type="button">
                <lucide-icon [img]="showAiKey()['openai'] ? EyeOff : Eye" [size]="16"></lucide-icon>
              </button>
            </div>
            <span class="field-hint">platform.openai.com/api-keys</span>
          </div>
          <div class="field">
            <label class="label">DeepSeek API Key</label>
            <div class="input-wrap">
              <input class="input" [type]="showAiKey()['deepseek'] ? 'text' : 'password'" [(ngModel)]="aiKeys.deepseekApiKey" placeholder="sk-..." />
              <button class="eye-btn" (click)="toggleAiKey('deepseek')" type="button">
                <lucide-icon [img]="showAiKey()['deepseek'] ? EyeOff : Eye" [size]="16"></lucide-icon>
              </button>
            </div>
            <span class="field-hint">platform.deepseek.com</span>
          </div>
          <div class="field">
            <label class="label">Gemini API Key (Google)</label>
            <div class="input-wrap">
              <input class="input" [type]="showAiKey()['gemini'] ? 'text' : 'password'" [(ngModel)]="aiKeys.geminiApiKey" placeholder="AIza..." />
              <button class="eye-btn" (click)="toggleAiKey('gemini')" type="button">
                <lucide-icon [img]="showAiKey()['gemini'] ? EyeOff : Eye" [size]="16"></lucide-icon>
              </button>
            </div>
            <span class="field-hint">aistudio.google.com/apikey</span>
          </div>
          <div class="field">
            <label class="label">Claude API Key (Anthropic)</label>
            <div class="input-wrap">
              <input class="input" [type]="showAiKey()['claude'] ? 'text' : 'password'" [(ngModel)]="aiKeys.claudeApiKey" placeholder="sk-ant-..." />
              <button class="eye-btn" (click)="toggleAiKey('claude')" type="button">
                <lucide-icon [img]="showAiKey()['claude'] ? EyeOff : Eye" [size]="16"></lucide-icon>
              </button>
            </div>
            <span class="field-hint">console.anthropic.com</span>
          </div>
        </div>

        <div class="section-footer">
          <button class="btn btn-primary" (click)="saveAi()" [disabled]="savingAi()">
            <lucide-icon [img]="Save" [size]="16"></lucide-icon>
            {{ savingAi() ? 'Guardando...' : 'Guardar keys de IA' }}
          </button>
        </div>
      </div>

      <!-- Templates Card (hay al menos una cuenta Cloud API vinculada) -->
      @if (cloudAccounts() > 0) {
        <div class="section-card">
          <div class="section-header">
            <div class="section-icon" style="background: #F5F3FF;">
              <lucide-icon [img]="Layout" [size]="22" style="color: #7C3AED;"></lucide-icon>
            </div>
            <div>
              <h2 class="section-title">Plantillas WhatsApp</h2>
              <p class="section-desc">Plantillas aprobadas por Meta, aplicadas a todas las cuentas Cloud API vinculadas</p>
            </div>
            <div class="section-actions">
              <button class="btn btn-secondary btn-sm" (click)="syncTemplates()" [disabled]="syncingTemplates()">
                <lucide-icon [img]="RefreshCw" [size]="14" [class.spin]="syncingTemplates()"></lucide-icon>
                Sincronizar desde Meta
              </button>
              <button class="btn btn-primary btn-sm" (click)="openTemplateModal()">
                <lucide-icon [img]="Plus" [size]="14"></lucide-icon>
                Nueva plantilla
              </button>
            </div>
          </div>

          @if (templatesLoading()) {
            <div style="text-align:center; padding: 24px; color: var(--color-text-muted); font-size: 14px;">
              <lucide-icon [img]="RefreshCw" [size]="20" class="spin" style="margin-bottom:8px;"></lucide-icon>
              <div>Cargando plantillas...</div>
            </div>
          } @else if (templates().length === 0) {
            <div style="text-align: center; padding: 32px 24px; color: var(--color-text-muted); font-size: 14px;">
              No hay plantillas. Haz clic en <strong>Sincronizar desde Meta</strong> para importar las plantillas existentes, o crea una nueva.
            </div>
          } @else {
            <div class="templates-list">
              @for (t of templates(); track t._id) {
                <div class="tpl-row">
                  <div class="tpl-row-main">
                    <div class="tpl-name">{{ t.name }}</div>
                    <div class="tpl-body">{{ t.body.substring(0, 80) }}{{ t.body.length > 80 ? '…' : '' }}</div>
                  </div>
                  <div class="tpl-badges">
                    @if (t.accountLabel) {
                      <span class="tpl-badge tpl-account">{{ t.accountLabel }}</span>
                    }
                    <span class="tpl-badge tpl-status-{{ t.status.toLowerCase() }}">{{ t.status }}</span>
                    <span class="tpl-badge tpl-lang">{{ t.language }}</span>
                    <span class="tpl-badge tpl-cat">{{ t.category }}</span>
                  </div>
                  <button class="btn btn-icon btn-ghost btn-sm tpl-del-btn" (click)="deleteTemplate(t)">
                    <lucide-icon [img]="Trash2" [size]="14"></lucide-icon>
                  </button>
                </div>
              }
            </div>
          }
        </div>
      }
    </div>

    <!-- Template Create Modal -->
    @if (templateModalOpen()) {
      <div class="overlay" (click)="closeTemplateModal()">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3 class="modal-title">Nueva plantilla</h3>
            <button class="btn btn-icon btn-ghost btn-sm" (click)="closeTemplateModal()">
              <lucide-icon [img]="X" [size]="18"></lucide-icon>
            </button>
          </div>
          <div class="modal-body">
            @if (tplError()) {
              <div class="error-box" style="margin-bottom: 16px;">{{ tplError() }}</div>
            }
            <div class="field">
              <label class="label">Nombre (solo minúsculas, números, guiones bajos) *</label>
              <input class="input" [(ngModel)]="tplForm.name" placeholder="promo_verano_2026" />
            </div>
            <div class="field">
              <label class="label">Categoría *</label>
              <select class="select" [(ngModel)]="tplForm.category">
                <option value="MARKETING">MARKETING — Promociones y ofertas</option>
                <option value="UTILITY">UTILITY — Confirmaciones, recordatorios</option>
                <option value="AUTHENTICATION">AUTHENTICATION — Códigos de verificación</option>
              </select>
            </div>
            <div class="field">
              <label class="label">Idioma *</label>
              <select class="select" [(ngModel)]="tplForm.language">
                <option value="es">Español (es)</option>
                <option value="es_MX">Español México (es_MX)</option>
                <option value="es_AR">Español Argentina (es_AR)</option>
                <option value="en_US">English (en_US)</option>
                <option value="pt_BR">Português Brasil (pt_BR)</option>
              </select>
            </div>
            <div class="field">
              <label class="label">Encabezado (opcional)</label>
              <input class="input" [(ngModel)]="tplForm.headerText" placeholder="Texto del encabezado" />
            </div>
            <div class="field">
              <label class="label">Cuerpo del mensaje *</label>
              <div class="field-hint" style="margin-bottom: 4px;">Usa &#123;&#123;1&#125;&#125;, &#123;&#123;2&#125;&#125;, etc. para variables dinámicas.</div>
              <textarea class="textarea" [(ngModel)]="tplForm.body" rows="4"
                placeholder="Hola {{1}}, tenemos una oferta especial: {{2}} de descuento esta semana."></textarea>
            </div>
            <div class="field">
              <label class="label">Pie de mensaje (opcional)</label>
              <input class="input" [(ngModel)]="tplForm.footer" placeholder="Responde STOP para dejar de recibir mensajes" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-ghost" (click)="closeTemplateModal()">Cancelar</button>
            <button class="btn btn-primary" (click)="createTemplate()" [disabled]="savingTemplate()">
              {{ savingTemplate() ? 'Enviando a Meta...' : 'Crear plantilla' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; max-width: 900px; }
    .page-header { margin-bottom: 32px; }
    .page-title { font-family: var(--font-heading); font-size: 26px; font-weight: 700; color: var(--color-text-main); margin: 0 0 4px; }
    .page-subtitle { font-size: 14px; color: var(--color-text-muted); margin: 0; }

    .section-card { background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 28px 32px; margin-bottom: 24px; }
    .section-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .section-icon { width: 44px; height: 44px; border-radius: var(--radius-lg); background: #F0FDF4; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .section-title { font-family: var(--font-heading); font-size: 17px; font-weight: 700; margin: 0 0 2px; }
    .section-desc { font-size: 13px; color: var(--color-text-muted); margin: 0; }
    .section-actions { margin-left: auto; display: flex; gap: 8px; }

    .fields-grid { display: flex; flex-direction: column; gap: 20px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .label { font-size: 13px; font-weight: 600; color: var(--color-text-main); }
    .field-hint { font-size: 12px; color: var(--color-text-muted); }

    .input-wrap { position: relative; display: flex; }
    .input-wrap .input { padding-right: 44px; flex: 1; }
    .eye-btn { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--color-text-muted); display: flex; align-items: center; }
    .eye-btn:hover { color: var(--color-text-main); }

    .error-box { padding: 12px 16px; background: #FEF2F2; border: 1px solid #FECACA; border-radius: var(--radius-lg); font-size: 13px; color: var(--color-error); }

    .section-footer { display: flex; align-items: center; justify-content: flex-end; margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--color-border); }

    /* Templates list */
    .templates-list { display: flex; flex-direction: column; gap: 0; }
    .tpl-row { display: flex; align-items: center; gap: 16px; padding: 14px 0; border-bottom: 1px solid var(--color-border); }
    .tpl-row:last-child { border-bottom: none; }
    .tpl-row-main { flex: 1; min-width: 0; }
    .tpl-name { font-weight: 700; font-size: 13px; color: var(--color-text-main); font-family: monospace; }
    .tpl-body { font-size: 12px; color: var(--color-text-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .tpl-badges { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
    .tpl-badge { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: var(--radius-pill); background: var(--color-bg-app); color: var(--color-text-muted); border: 1px solid var(--color-border); }
    .tpl-status-approved { background: #F0FDF4; color: #15803D; border-color: #BBF7D0; }
    .tpl-status-pending  { background: #FEFCE8; color: #854D0E; border-color: #FEF08A; }
    .tpl-status-rejected { background: #FEF2F2; color: #DC2626; border-color: #FECACA; }
    .tpl-account { background: #F5F3FF; color: #6D28D9; border-color: #DDD6FE; }
    .tpl-del-btn { color: var(--color-text-muted) !important; flex-shrink: 0; }
    .tpl-del-btn:hover { color: var(--color-error) !important; background: #FEF2F2 !important; }

    /* Modal */
    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 100; }
    .modal-card { background: var(--color-white); border-radius: var(--radius-lg); width: calc(100% - 48px); max-width: 520px; box-shadow: var(--shadow-lg); display: flex; flex-direction: column; max-height: 90vh; }
    .modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px; border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
    .modal-title { font-family: var(--font-heading); font-size: 17px; font-weight: 700; margin: 0; }
    .modal-body { padding: 20px 24px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 16px; }
    .modal-footer { padding: 16px 24px; border-top: 1px solid var(--color-border); display: flex; justify-content: flex-end; gap: 10px; flex-shrink: 0; }

    @keyframes spin { to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; display: inline-block; }

    @media (max-width: 968px) {
      .page { padding: 28px 24px; }
    }

    @media (max-width: 768px) {
      .page { padding: 20px 16px; }
      .page-title { font-size: 22px; }
      .section-card { padding: 20px; }
      .section-header { gap: 12px; margin-bottom: 20px; }
      .section-actions { margin-left: 0; width: 100%; }
      .section-actions .btn { flex: 1; justify-content: center; }
      .section-footer { flex-wrap: wrap; gap: 10px; }
      .section-footer > .btn { flex: 1; justify-content: center; }
      .tpl-row { flex-wrap: wrap; }
      .tpl-row-main { flex: 1 1 100%; }
      .tpl-del-btn { margin-left: auto; }
      .modal-header, .modal-body, .modal-footer { padding-left: 16px; padding-right: 16px; }
    }

    @media (max-width: 480px) {
      .page { padding: 16px 12px; }
      .section-card { padding: 16px; margin-bottom: 16px; }
      .fields-grid { gap: 14px; }
      .modal-card { width: calc(100% - 24px); }
    }
  `],
})
export class SettingsComponent implements OnInit {
  private api = inject(AccountsApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly RefreshCw = RefreshCw;
  readonly Save = Save;
  readonly Eye = Eye;
  readonly EyeOff = EyeOff;
  readonly Plus = Plus;
  readonly Trash2 = Trash2;
  readonly X = X;
  readonly Layout = Layout;
  readonly Sparkles = Sparkles;

  /** Provider de la cuenta WhatsApp predeterminada, reportado por la sección de WhatsApp. */
  defaultProvider = signal('');

  /** Número de cuentas Cloud API activas vinculadas, reportado por la sección de WhatsApp. */
  cloudAccounts = signal(0);

  // AI keys
  aiKeys: TenantSettings = { openaiApiKey: '', deepseekApiKey: '', geminiApiKey: '', claudeApiKey: '' };
  showAiKey = signal<Record<string, boolean>>({});
  savingAi = signal(false);
  toggleAiKey(k: string) { this.showAiKey.update(m => ({ ...m, [k]: !m[k] })); }

  // Templates
  templates = signal<WaTemplate[]>([]);
  templatesLoading = signal(false);
  syncingTemplates = signal(false);
  templateModalOpen = signal(false);
  savingTemplate = signal(false);
  tplError = signal('');
  tplForm = { name: '', category: 'MARKETING' as WaTemplateCategory, language: 'es', body: '', headerText: '', footer: '' };

  ngOnInit() {
    this.loadConfig();
  }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.templateModalOpen()) this.closeTemplateModal();
  }

  onWaProviderChange(provider: string) {
    this.defaultProvider.set(provider);
  }

  onCloudAccountsChange(count: number) {
    this.cloudAccounts.set(count);
    if (count > 0) this.loadTemplates();
  }

  // ---- Config (AI keys) ----
  loadConfig() {
    this.api.getSettings().subscribe({
      next: (cfg) => {
        if (!cfg) return;
        this.aiKeys = {
          openaiApiKey: cfg.openaiApiKey ?? '',
          deepseekApiKey: cfg.deepseekApiKey ?? '',
          geminiApiKey: cfg.geminiApiKey ?? '',
          claudeApiKey: cfg.claudeApiKey ?? '',
        };
      },
      error: () => {},
    });
  }

  saveAi() {
    this.savingAi.set(true);
    this.api.updateSettings({ ...this.aiKeys }).subscribe({
      next: () => { this.toast.success('API keys de IA guardadas'); this.savingAi.set(false); },
      error: (err: { error?: { message?: string } }) => { this.toast.error(err.error?.message || 'Error al guardar'); this.savingAi.set(false); },
    });
  }

  // ---- Templates ----
  loadTemplates() {
    if (this.templatesLoading()) return;
    this.templatesLoading.set(true);
    this.api.getTemplates().subscribe({
      next: (data) => { this.templates.set(data); this.templatesLoading.set(false); },
      error: () => this.templatesLoading.set(false),
    });
  }

  syncTemplates() {
    this.syncingTemplates.set(true);
    this.api.syncTemplates().subscribe({
      next: (data) => { this.templates.set(data); this.syncingTemplates.set(false); this.toast.success(`${data.length} plantilla(s) sincronizadas desde Meta`); },
      error: (err: { error?: { message?: string } }) => { this.syncingTemplates.set(false); this.toast.error(err.error?.message || 'Error al sincronizar plantillas'); },
    });
  }

  openTemplateModal() {
    this.tplForm = { name: '', category: 'MARKETING', language: 'es', body: '', headerText: '', footer: '' };
    this.tplError.set('');
    this.templateModalOpen.set(true);
  }

  closeTemplateModal() { this.templateModalOpen.set(false); }

  createTemplate() {
    if (!this.tplForm.name.trim()) { this.tplError.set('El nombre es obligatorio'); return; }
    if (!this.tplForm.body.trim()) { this.tplError.set('El cuerpo del mensaje es obligatorio'); return; }
    this.savingTemplate.set(true);
    this.tplError.set('');
    const dto = {
      name: this.tplForm.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      category: this.tplForm.category,
      language: this.tplForm.language,
      body: this.tplForm.body.trim(),
      headerText: this.tplForm.headerText?.trim() || undefined,
      footer: this.tplForm.footer?.trim() || undefined,
    };
    this.api.createTemplate(dto).subscribe({
      next: (created) => { this.templates.update(list => [...list, ...created]); this.savingTemplate.set(false); this.closeTemplateModal(); this.toast.success(`Plantilla creada en ${created.length} cuenta(s). Pendiente de aprobación por Meta.`); },
      error: (err: { error?: { message?: string } }) => { this.tplError.set(err.error?.message || 'Error al crear plantilla'); this.savingTemplate.set(false); },
    });
  }

  async deleteTemplate(t: WaTemplate) {
    const ok = await this.confirm.confirm({ title: 'Eliminar plantilla', message: `¿Eliminar la plantilla "${t.name}"? Esta acción también la eliminará de Meta.`, confirmText: 'Eliminar', danger: true });
    if (!ok) return;
    this.api.deleteTemplate(t._id).subscribe({
      next: () => { this.templates.update(list => list.filter(x => x._id !== t._id)); this.toast.success('Plantilla eliminada'); },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'Error al eliminar'),
    });
  }
}
