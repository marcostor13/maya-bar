import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, PlugZap, Save } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { environment } from '../../../environments/environment';

export type PlatformProvider = 'deepseek' | 'claude' | 'openai' | 'gemini';

export interface PlatformAiView {
  enabled: boolean;
  provider?: PlatformProvider;
  model?: string;
  hasKey: boolean;
  keyHint?: string;
  updatedAt?: string;
}

interface ModelOption { id: string; label: string; note?: string; recommended?: boolean }

const PROVIDERS: { id: PlatformProvider; label: string }[] = [
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'claude', label: 'Claude (Anthropic)' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'gemini', label: 'Gemini (Google)' },
];

/** Superadmin: cuenta de IA que usan gratis las empresas sin key propia (HU85). */
@Component({
  selector: 'app-admin-platform-ai',
  standalone: true,
  imports: [DatePipe, FormsModule, LucideAngularModule],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1>IA de la plataforma</h1>
          <p class="subtitle">La usan gratis, sin descontar créditos, todas las empresas que no conectaron su propia API key de IA. Solo con el modelo que elijas aquí.</p>
        </div>
      </div>

      @if (loading()) {
        <div class="card box"><p class="muted">Cargando…</p></div>
      } @else {
        <div class="card box">
          <label class="check">
            <input type="checkbox" [(ngModel)]="enabled" data-test="enabled" />
            <span><strong>Activar la IA de la plataforma</strong><br />
              <span class="muted small">Desactivada, las empresas sin key propia vuelven a usar las keys del servidor y a gastar créditos.</span></span>
          </label>

          <div class="field">
            <label class="label" for="pai-provider">Proveedor</label>
            <select id="pai-provider" class="select" [(ngModel)]="provider" (ngModelChange)="onProviderChange()" data-test="provider">
              <option value="">Elige un proveedor</option>
              @for (p of providers; track p.id) { <option [value]="p.id">{{ p.label }}</option> }
            </select>
            @if (provider === 'gemini') {
              <p class="hint">Con Gemini los agentes no usan herramientas (agenda, tienda, derivar a humano).</p>
            }
          </div>

          <div class="field">
            <label class="label" for="pai-key">API key</label>
            <input id="pai-key" class="input" type="password" autocomplete="off" [(ngModel)]="apiKey" data-test="key"
                   [placeholder]="keyPlaceholder()" />
            <p class="hint">Se guarda cifrada y no se vuelve a mostrar. Déjala vacía para conservar la guardada.</p>
          </div>

          <div class="field">
            <label class="label" for="pai-model">Modelo</label>
            <div class="row">
              <select id="pai-model" class="select" [(ngModel)]="model" data-test="model" [disabled]="!provider">
                <option value="">Elige un modelo</option>
                @if (model && !inList(model)) { <option [value]="model">{{ model }}</option> }
                @for (m of models(); track m.id) {
                  <option [value]="m.id">{{ m.label }}{{ m.recommended ? ' — recomendado' : '' }}</option>
                }
              </select>
              <button type="button" class="btn btn-secondary btn-sm" (click)="loadModels()" [disabled]="!provider || modelsLoading()" data-test="load-models">
                {{ modelsLoading() ? 'Consultando…' : 'Ver modelos' }}
              </button>
            </div>
            <input class="input custom" [(ngModel)]="model" placeholder="O escribe el id exacto, ej. claude-haiku-4-5" aria-label="Id del modelo" />
            @if (modelNote(); as note) { <p class="hint">{{ note }}</p> }
          </div>

          @if (testResult(); as r) {
            <p class="result" [class.ok]="r.ok" role="status">{{ r.text }}</p>
          }

          <div class="actions">
            @if (view()?.updatedAt) { <span class="muted small">Actualizado {{ view()!.updatedAt | date:'d MMM y, HH:mm' }}</span> }
            <button type="button" class="btn btn-secondary" (click)="test()" [disabled]="testing() || !provider || !model" data-test="test">
              <lucide-icon [img]="PlugZap" [size]="16" /> {{ testing() ? 'Probando…' : 'Probar' }}
            </button>
            <button type="button" class="btn btn-primary" (click)="save()" [disabled]="saving()" data-test="save">
              <lucide-icon [img]="Save" [size]="16" /> {{ saving() ? 'Guardando…' : 'Guardar' }}
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 32px 40px; width: 100%; box-sizing: border-box; }
    .page-header { margin-bottom: 24px; }
    .page-header h1 { margin-bottom: 4px; font-size: 26px; font-family: var(--font-heading); }
    .subtitle { color: var(--color-text-muted); font-size: 14px; margin: 0; max-width: 720px; }
    .box { padding: 24px; display: grid; gap: 20px; max-width: 640px; }
    .muted { color: var(--color-text-muted); margin: 0; }
    .small { font-size: 13px; }
    .check { display: flex; gap: 12px; align-items: flex-start; cursor: pointer; font-size: 14px; }
    .check input { margin-top: 3px; width: 18px; height: 18px; }
    .field { display: grid; gap: 6px; }
    .label { font-size: 13px; font-weight: 600; color: var(--color-text-muted); }
    .hint { font-size: 12px; color: var(--color-text-muted); margin: 0; }
    .row { display: flex; gap: 8px; align-items: center; }
    .row .select { flex: 1; }
    .custom { margin-top: 4px; }
    .result { margin: 0; font-size: 13px; color: var(--color-error); }
    .result.ok { color: var(--color-success); }
    .actions { display: flex; gap: 10px; justify-content: flex-end; align-items: center; flex-wrap: wrap; }
    .actions .muted { margin-right: auto; }
    @media (max-width: 640px) { .page { padding: 20px 16px; } .row { flex-direction: column; align-items: stretch; } }
  `],
})
export class AdminPlatformAiComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private api = `${environment.apiUrl}/admin/platform-ai`;
  readonly PlugZap = PlugZap;
  readonly Save = Save;
  readonly providers = PROVIDERS;

  view = signal<PlatformAiView | null>(null);
  loading = signal(true);
  saving = signal(false);
  testing = signal(false);
  modelsLoading = signal(false);
  models = signal<ModelOption[]>([]);
  testResult = signal<{ ok: boolean; text: string } | null>(null);

  enabled = false;
  provider: PlatformProvider | '' = '';
  model = '';
  apiKey = '';

  ngOnInit() {
    this.http.get<PlatformAiView>(this.api).subscribe({
      next: v => { this.apply(v); this.loading.set(false); },
      error: err => { this.loading.set(false); this.toast.error(err.error?.message || 'No se pudo cargar la IA de la plataforma'); },
    });
  }

  private apply(v: PlatformAiView) {
    this.view.set(v);
    this.enabled = v.enabled;
    this.provider = v.provider ?? '';
    this.model = v.model ?? '';
    this.apiKey = '';
  }

  keyPlaceholder(): string {
    const v = this.view();
    return v?.hasKey && v.provider === this.provider ? `Guardada ${v.keyHint ?? ''}` : 'Pega la API key del proveedor';
  }

  inList(id: string) { return this.models().some(m => m.id === id); }

  modelNote(): string | null { return this.models().find(m => m.id === this.model)?.note ?? null; }

  onProviderChange() {
    this.models.set([]);
    this.model = '';
    this.testResult.set(null);
  }

  private keyBody() { return this.apiKey.trim() ? { apiKey: this.apiKey.trim() } : {}; }

  loadModels() {
    if (!this.provider) return;
    this.modelsLoading.set(true);
    this.http.post<{ source: 'live' | 'catalog'; models: ModelOption[] }>(`${this.api}/models`, { provider: this.provider, ...this.keyBody() })
      .subscribe({
        next: r => {
          this.models.set(r.models);
          this.modelsLoading.set(false);
          if (r.source === 'catalog') this.toast.warning('El proveedor no respondió: se muestran los modelos sugeridos');
        },
        error: err => { this.modelsLoading.set(false); this.toast.error(err.error?.message || 'No se pudieron consultar los modelos'); },
      });
  }

  test() {
    this.testing.set(true);
    this.testResult.set(null);
    this.http.post<{ ok: boolean; reply: string }>(`${this.api}/test`, { provider: this.provider, model: this.model.trim(), ...this.keyBody() })
      .subscribe({
        next: r => {
          this.testing.set(false);
          this.testResult.set({ ok: true, text: `Conexión correcta. Respuesta: "${r.reply}"` });
          this.toast.success('La IA respondió correctamente');
        },
        error: err => {
          this.testing.set(false);
          const msg = err.error?.message || 'La prueba falló';
          this.testResult.set({ ok: false, text: msg });
          this.toast.error(msg);
        },
      });
  }

  save() {
    this.saving.set(true);
    const body = {
      enabled: this.enabled,
      ...(this.provider ? { provider: this.provider } : {}),
      ...(this.model.trim() ? { model: this.model.trim() } : {}),
      ...this.keyBody(),
    };
    this.http.put<PlatformAiView>(this.api, body).subscribe({
      next: v => {
        this.saving.set(false);
        this.apply(v);
        this.toast.success(v.enabled ? 'IA de la plataforma activada' : 'Cambios guardados');
      },
      error: err => { this.saving.set(false); this.toast.error(err.error?.message || 'No se pudo guardar'); },
    });
  }
}
