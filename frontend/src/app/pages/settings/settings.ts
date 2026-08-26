import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, Save, Eye, EyeOff, Sparkles,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { AccountsApiService } from '../../core/api/accounts-api.service';
import { TenantSettings } from '../../shared/models/accounts.model';
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
      <app-whatsapp-settings (defaultProviderChange)="onWaProviderChange($event)" />

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
    .field-hint { font-size: 12px; color: var(--color-text-muted); }

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

}
