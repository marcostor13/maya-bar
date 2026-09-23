import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, Save, Eye, EyeOff, Sparkles, Radar,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { AccountsApiService } from '../../core/api/accounts-api.service';
import { TenantSettings } from '../../shared/models/accounts.model';
import { WhatsappSettingsComponent } from './whatsapp-settings';
import { InstagramSettingsComponent } from './instagram-settings';
import { MessengerSettingsComponent } from './messenger-settings';
import { NotificationsSettingsComponent } from './notifications-settings';
import { EmailSettingsComponent } from './email-settings';

type ProspectingKey = 'googlePlacesApiKey' | 'pageSpeedApiKey' | 'serperApiKey' | 'hunterApiKey';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    FormsModule, LucideAngularModule, WhatsappSettingsComponent,
    InstagramSettingsComponent, MessengerSettingsComponent,
    NotificationsSettingsComponent, EmailSettingsComponent,
  ],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1 class="page-title">Configuración</h1>
          <p class="page-subtitle">Integraciones y ajustes de la plataforma</p>
        </div>
      </div>

      <!-- Notificaciones push (solo visible dentro de la app nativa) -->
      <app-notifications-settings />

      <!-- WhatsApp Accounts Card -->
      <app-whatsapp-settings (defaultProviderChange)="onWaProviderChange($event)" />

      <!-- Instagram Accounts Card -->
      <app-instagram-settings />

      <!-- Messenger Accounts Card -->
      <app-messenger-settings />

      <!-- Correo electrónico -->
      <app-email-settings />

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

      <!-- Prospección Card -->
      <div class="section-card">
        <div class="section-header">
          <div class="section-icon" style="background: #ECFEFF;">
            <lucide-icon [img]="Radar" [size]="22" style="color: #0E7490;"></lucide-icon>
          </div>
          <div>
            <h2 class="section-title">Prospección</h2>
            <p class="section-desc">Fuentes para encontrar e investigar empresas. Todas son opcionales: con más fuentes, más completa la investigación.</p>
          </div>
        </div>

        <div class="fields-grid">
          @for (f of prospectingFields; track f.key) {
            <div class="field">
              <label class="label">{{ f.label }}</label>
              <div class="input-wrap">
                <input class="input" [type]="showAiKey()[f.key] ? 'text' : 'password'" [(ngModel)]="prospectingKeys[f.key]" [placeholder]="f.placeholder" />
                <button class="eye-btn" (click)="toggleAiKey(f.key)" type="button">
                  <lucide-icon [img]="showAiKey()[f.key] ? EyeOff : Eye" [size]="16"></lucide-icon>
                </button>
              </div>
              <span class="field-hint">{{ f.hint }}</span>
            </div>
          }
        </div>

        <div class="section-footer">
          <button class="btn btn-primary" (click)="saveProspecting()" [disabled]="savingProspecting()">
            <lucide-icon [img]="Save" [size]="16"></lucide-icon>
            {{ savingProspecting() ? 'Guardando...' : 'Guardar keys de prospección' }}
          </button>
        </div>
      </div>

    </div>
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
    .field-hint { font-size: 12.5px; color: var(--color-text-muted); line-height: 1.5; }

    .input-wrap { position: relative; display: flex; }
    .input-wrap .input { padding-right: 44px; flex: 1; }
    .eye-btn { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--color-text-muted); display: flex; align-items: center; }
    .eye-btn:hover { color: var(--color-text-main); }

    .error-box { padding: 12px 16px; background: #FEF2F2; border: 1px solid #FECACA; border-radius: var(--radius-lg); font-size: 13px; color: var(--color-error); }

    .section-footer { display: flex; align-items: center; justify-content: flex-end; margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--color-border); }


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

  readonly Save = Save;
  readonly Eye = Eye;
  readonly EyeOff = EyeOff;
  readonly Sparkles = Sparkles;
  readonly Radar = Radar;

  readonly prospectingFields: { key: ProspectingKey; label: string; placeholder: string; hint: string }[] = [
    { key: 'googlePlacesApiKey', label: 'Google Places API Key', placeholder: 'AIza...', hint: 'Busca empresas en Google Maps con reseñas, teléfono y web. console.cloud.google.com → Places API (New)' },
    { key: 'pageSpeedApiKey', label: 'PageSpeed Insights API Key', placeholder: 'AIza...', hint: 'Mide velocidad, SEO y accesibilidad de la web. Si la dejas vacía se usa la de Google Places.' },
    { key: 'serperApiKey', label: 'Serper API Key (búsqueda en Google)', placeholder: '...', hint: 'Encuentra webs, redes sociales, noticias y personas en LinkedIn. serper.dev' },
    { key: 'hunterApiKey', label: 'Hunter.io API Key', placeholder: '...', hint: 'Encuentra correos y cargos de las personas de la empresa. hunter.io/api-keys' },
  ];
  prospectingKeys: Record<ProspectingKey, string> = { googlePlacesApiKey: '', pageSpeedApiKey: '', serperApiKey: '', hunterApiKey: '' };
  savingProspecting = signal(false);

  /** Provider de la cuenta WhatsApp predeterminada, reportado por la sección de WhatsApp. */
  defaultProvider = signal('');

  // AI keys
  aiKeys: TenantSettings = { openaiApiKey: '', deepseekApiKey: '', geminiApiKey: '', claudeApiKey: '' };
  showAiKey = signal<Record<string, boolean>>({});
  savingAi = signal(false);
  toggleAiKey(k: string) { this.showAiKey.update(m => ({ ...m, [k]: !m[k] })); }

  ngOnInit() {
    this.loadConfig();
  }

  onWaProviderChange(provider: string) {
    this.defaultProvider.set(provider);
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
        this.prospectingKeys = {
          googlePlacesApiKey: cfg.googlePlacesApiKey ?? '',
          pageSpeedApiKey: cfg.pageSpeedApiKey ?? '',
          serperApiKey: cfg.serperApiKey ?? '',
          hunterApiKey: cfg.hunterApiKey ?? '',
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

  saveProspecting() {
    this.savingProspecting.set(true);
    this.api.updateSettings({ ...this.prospectingKeys }).subscribe({
      next: () => { this.toast.success('Keys de prospección guardadas'); this.savingProspecting.set(false); },
      error: (err: { error?: { message?: string } }) => { this.toast.error(err.error?.message || 'Error al guardar'); this.savingProspecting.set(false); },
    });
  }

}
