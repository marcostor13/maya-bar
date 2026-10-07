import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, Smartphone, Plus, Trash2, Send, Save, KeyRound, Check, TriangleAlert,
  ChevronDown, ChevronUp,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import {
  SmsApiService, SmsBodyType, SmsConfigInput, SmsHeader,
} from '../../core/api/sms-api.service';

type ErrorLike = { error?: { message?: string | string[] } };

interface SecretRow {
  name: string;
  /** Lo que escribe el usuario; vacío = conservar el guardado. */
  value: string;
  hasValue: boolean;
}

interface Preset {
  key: string;
  label: string;
  hint: string;
  config: Pick<SmsConfigInput, 'name' | 'url' | 'method' | 'headers' | 'bodyType' | 'body' | 'successPath' | 'successValue' | 'idPath'>;
  secrets: string[];
}

/** Los presets solo rellenan el formulario: no hay código por proveedor. */
const PRESETS: Preset[] = [
  {
    key: 'twilio',
    label: 'Twilio',
    hint: 'Necesitas el Account SID, el Auth Token y un número o Messaging Service como remitente.',
    config: {
      name: 'Twilio',
      url: 'https://api.twilio.com/2010-04-01/Accounts/{secret:account_sid}/Messages.json',
      method: 'POST',
      headers: [{ key: 'Authorization', value: '{basic:account_sid:auth_token}' }],
      bodyType: 'form',
      body: 'To={to}\nFrom={from}\nBody={message}',
      successPath: '',
      successValue: '',
      idPath: 'sid',
    },
    secrets: ['account_sid', 'auth_token'],
  },
  {
    key: 'infobip',
    label: 'Infobip',
    hint: 'Cambia TU_SUBDOMINIO en la URL por el de tu cuenta y pega tu API key.',
    config: {
      name: 'Infobip',
      url: 'https://TU_SUBDOMINIO.api.infobip.com/sms/2/text/advanced',
      method: 'POST',
      headers: [{ key: 'Authorization', value: 'App {secret:api_key}' }],
      bodyType: 'json',
      body: '{"messages":[{"from":"{from}","destinations":[{"to":"{to_digits}"}],"text":"{message}"}]}',
      successPath: '',
      successValue: '',
      idPath: 'messages.0.messageId',
    },
    secrets: ['api_key'],
  },
  {
    key: 'vonage',
    label: 'Vonage',
    hint: 'Necesitas el API key y el API secret de tu cuenta.',
    config: {
      name: 'Vonage',
      url: 'https://rest.nexmo.com/sms/json',
      method: 'POST',
      headers: [],
      bodyType: 'form',
      body: 'api_key={secret:api_key}\napi_secret={secret:api_secret}\nfrom={from}\nto={to_digits}\ntext={message}',
      successPath: 'messages.0.status',
      successValue: '0',
      idPath: 'messages.0.message-id',
    },
    secrets: ['api_key', 'api_secret'],
  },
  {
    key: 'custom',
    label: 'Otro proveedor',
    hint: 'Copia de la documentación de tu proveedor la URL, las cabeceras y el cuerpo de su API de envío.',
    config: {
      name: '',
      url: 'https://',
      method: 'POST',
      headers: [{ key: 'Authorization', value: 'Bearer {secret:api_key}' }],
      bodyType: 'json',
      body: '{"to":"{to}","from":"{from}","message":"{message}"}',
      successPath: '',
      successValue: '',
      idPath: '',
    },
    secrets: ['api_key'],
  },
];

const TOKENS = [
  { token: '{to}', label: 'Destino con + (ej. +51999888777)' },
  { token: '{to_digits}', label: 'Destino solo dígitos' },
  { token: '{message}', label: 'Texto del mensaje' },
  { token: '{from}', label: 'Remitente' },
  { token: '{secret:nombre}', label: 'Una credencial guardada' },
  { token: '{basic:usuario:clave}', label: 'Cabecera Basic con dos credenciales' },
];

/** Proveedor de SMS: cualquier API HTTP, definida por el usuario. */
@Component({
  selector: 'app-sms-settings',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="section-card">
      <div class="section-header">
        <div class="section-icon"><lucide-icon [img]="Smartphone" [size]="20"></lucide-icon></div>
        <div>
          <h2 class="section-title">SMS</h2>
          <p class="section-desc">Conecta el proveedor de SMS que prefieras para enviar campañas de texto.</p>
        </div>
        <div class="section-actions">
          <span class="badge" [class.badge-success]="form.enabled && !!form.url" [class.badge-neutral]="!form.enabled || !form.url">
            {{ form.enabled && form.url ? 'Activo' : 'Inactivo' }}
          </span>
        </div>
      </div>

      @if (loading()) {
        <p class="muted">Cargando…</p>
      } @else {
        <div class="field">
          <span class="label">Proveedor</span>
          <div class="chips">
            @for (p of presets; track p.key) {
              <button type="button" class="chip" (click)="applyPreset(p)">{{ p.label }}</button>
            }
          </div>
          @if (presetHint()) { <p class="hint">{{ presetHint() }}</p> }
        </div>

        <div class="grid2">
          <label class="field">
            <span class="label">Nombre</span>
            <input class="input" [(ngModel)]="form.name" maxlength="60" placeholder="Ej. Twilio" />
          </label>
          <label class="field">
            <span class="label">Remitente</span>
            <input class="input" [(ngModel)]="form.from" maxlength="40" placeholder="Número o nombre aprobado" />
          </label>
        </div>

        <div class="field">
          <span class="label">
            <lucide-icon [img]="KeyRound" [size]="13"></lucide-icon>
            Credenciales
          </span>
          <p class="hint">Se guardan cifradas y no se vuelven a mostrar. Úsalas en la petición como {{ secretExample }}.</p>
          @for (s of secrets(); track $index; let i = $index) {
            <div class="secret-row">
              <input class="input name" [value]="s.name" (input)="setSecret(i, 'name', $any($event.target).value)"
                placeholder="nombre" aria-label="Nombre de la credencial" />
              <input class="input" type="password" autocomplete="new-password" [value]="s.value"
                (input)="setSecret(i, 'value', $any($event.target).value)"
                [placeholder]="s.hasValue ? 'Guardada — escribe para cambiarla' : 'Pega el valor'"
                aria-label="Valor de la credencial" />
              @if (s.hasValue && !s.value) {
                <lucide-icon [img]="Check" [size]="16" class="ok" aria-label="Guardada"></lucide-icon>
              }
              <button class="btn btn-ghost btn-icon btn-sm" (click)="removeSecret(i)" aria-label="Quitar credencial">
                <lucide-icon [img]="Trash2" [size]="14"></lucide-icon>
              </button>
            </div>
          }
          <button class="btn btn-ghost btn-sm add" (click)="addSecret()">
            <lucide-icon [img]="Plus" [size]="14"></lucide-icon> Añadir credencial
          </button>
        </div>

        <button class="btn btn-ghost btn-sm toggle" (click)="advanced.set(!advanced())">
          <lucide-icon [img]="advanced() ? ChevronUp : ChevronDown" [size]="14"></lucide-icon>
          {{ advanced() ? 'Ocultar la petición' : 'Ver y editar la petición HTTP' }}
        </button>

        @if (advanced()) {
          <div class="request">
            <div class="grid-url">
              <label class="field">
                <span class="label">Método</span>
                <select class="select" [(ngModel)]="form.method">
                  <option value="POST">POST</option><option value="GET">GET</option><option value="PUT">PUT</option>
                </select>
              </label>
              <label class="field">
                <span class="label">URL</span>
                <input class="input mono" [(ngModel)]="form.url" maxlength="1000" placeholder="https://api.proveedor.com/sms" />
              </label>
            </div>

            <div class="field">
              <span class="label">Cabeceras</span>
              @for (h of form.headers; track $index; let i = $index) {
                <div class="secret-row">
                  <input class="input name mono" [(ngModel)]="h.key" placeholder="Authorization" aria-label="Nombre de la cabecera" />
                  <input class="input mono" [(ngModel)]="h.value" placeholder="Bearer {secret:api_key}" aria-label="Valor de la cabecera" />
                  <button class="btn btn-ghost btn-icon btn-sm" (click)="removeHeader(i)" aria-label="Quitar cabecera">
                    <lucide-icon [img]="Trash2" [size]="14"></lucide-icon>
                  </button>
                </div>
              }
              <button class="btn btn-ghost btn-sm add" (click)="addHeader()">
                <lucide-icon [img]="Plus" [size]="14"></lucide-icon> Añadir cabecera
              </button>
            </div>

            <div class="field">
              <span class="label">Cuerpo</span>
              <div class="chips">
                @for (t of bodyTypes; track t.key) {
                  <button type="button" class="chip" [class.active]="form.bodyType === t.key" (click)="form.bodyType = t.key">{{ t.label }}</button>
                }
              </div>
              @if (form.bodyType !== 'none') {
                <textarea class="textarea mono" rows="5" [(ngModel)]="form.body" spellcheck="false"
                  [placeholder]="form.bodyType === 'json' ? jsonPlaceholder : 'to={to}&text={message}'"></textarea>
                <p class="hint">
                  {{ form.bodyType === 'json' ? 'JSON: los valores se escapan solos.' : 'Un parámetro por línea o separados por &. Los valores se codifican solos.' }}
                </p>
              }
              <details class="tokens">
                <summary>Variables disponibles</summary>
                <ul>
                  @for (t of tokens; track t.token) { <li><code>{{ t.token }}</code> {{ t.label }}</li> }
                </ul>
              </details>
            </div>

            <div class="grid2">
              <label class="field">
                <span class="label">Campo que confirma el envío (opcional)</span>
                <input class="input mono" [(ngModel)]="form.successPath" placeholder="messages.0.status" />
              </label>
              <label class="field">
                <span class="label">Valor esperado</span>
                <input class="input mono" [(ngModel)]="form.successValue" placeholder="0" />
              </label>
            </div>
            <p class="hint">Si lo dejas vacío, basta con que el proveedor responda sin error (código 2xx).</p>

            <div class="grid3">
              <label class="field">
                <span class="label">Campo con el id del mensaje</span>
                <input class="input mono" [(ngModel)]="form.idPath" placeholder="sid" />
              </label>
              <label class="field">
                <span class="label">Prefijo de país</span>
                <input class="input" [(ngModel)]="form.defaultCountryCode" maxlength="4" placeholder="51" />
              </label>
              <label class="field">
                <span class="label">Envíos por minuto</span>
                <input class="input" type="number" min="1" max="600" [(ngModel)]="form.ratePerMinute" />
              </label>
            </div>
          </div>
        }

        @if (missing().length) {
          <div class="warn">
            <lucide-icon [img]="TriangleAlert" [size]="14"></lucide-icon>
            Faltan credenciales que la petición usa: {{ missing().join(', ') }}
          </div>
        }

        <label class="check">
          <input type="checkbox" [(ngModel)]="form.enabled" />
          Usar este proveedor para enviar campañas de SMS
        </label>

        <div class="test">
          <input class="input" [(ngModel)]="testTo" maxlength="30" placeholder="Tu número para probar: +51 999 888 777" />
          <button class="btn btn-secondary" (click)="test()" [disabled]="testing() || !testTo.trim()">
            <lucide-icon [img]="Send" [size]="14"></lucide-icon>
            {{ testing() ? 'Enviando…' : 'Enviar prueba' }}
          </button>
        </div>
        @if (testResult()) {
          <pre class="result" [class.bad]="!testOk()">{{ testResult() }}</pre>
        }

        <div class="section-footer">
          <button class="btn btn-primary" (click)="save()" [disabled]="saving()">
            <lucide-icon [img]="Save" [size]="15"></lucide-icon>
            {{ saving() ? 'Guardando…' : 'Guardar' }}
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .section-card { background:var(--color-white); border:1px solid var(--color-border); border-radius:var(--radius-lg);
      padding:24px; margin-bottom:24px; display:flex; flex-direction:column; gap:16px; }
    .section-header { display:flex; align-items:center; gap:16px; }
    .section-icon { width:44px; height:44px; border-radius:var(--radius-lg); display:grid; place-items:center; flex-shrink:0;
      background:var(--color-brand-light); color:var(--color-brand); }
    .section-title { font-family:var(--font-heading); font-size:17px; font-weight:600; margin:0; }
    .section-desc { font-size:13px; color:var(--color-text-muted); margin:0; }
    .section-actions { margin-left:auto; }
    .section-footer { display:flex; justify-content:flex-end; }
    .muted, .hint { font-size:12px; color:var(--color-text-muted); margin:0; }
    .field { display:flex; flex-direction:column; gap:6px; min-width:0; }
    .label { font-size:13px; font-weight:600; color:var(--color-text-main); display:flex; align-items:center; gap:6px; }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .grid3 { display:grid; grid-template-columns:2fr 1fr 1fr; gap:14px; }
    .grid-url { display:grid; grid-template-columns:110px 1fr; gap:14px; }
    .chips { display:flex; gap:8px; flex-wrap:wrap; }
    .chip { padding:7px 14px; font-family:var(--font-base); font-size:13px; font-weight:500; border-radius:var(--radius-pill);
      border:1px solid var(--color-border); background:var(--color-white); color:var(--color-text-muted); cursor:pointer;
      transition:all var(--transition-fast); }
    .chip:hover { border-color:var(--color-brand); color:var(--color-brand); }
    .chip.active { background:var(--color-brand); border-color:var(--color-brand); color:var(--color-white); }
    .secret-row { display:flex; align-items:center; gap:8px; }
    .secret-row .input { flex:1; min-width:0; }
    .secret-row .name { flex:0 0 34%; }
    .ok { color:var(--color-success); flex-shrink:0; }
    .add, .toggle { align-self:flex-start; }
    .request { display:flex; flex-direction:column; gap:14px; padding:16px; border:1px solid var(--color-border);
      border-radius:var(--radius-md); background:var(--color-bg-light); }
    .mono { font-family:ui-monospace, Menlo, Consolas, monospace; font-size:12px; }
    textarea.mono { border-radius:var(--radius-md); }
    .tokens { font-size:12px; color:var(--color-text-muted); }
    .tokens summary { cursor:pointer; }
    .tokens ul { margin:8px 0 0; padding-left:18px; display:flex; flex-direction:column; gap:4px; }
    .tokens code { background:var(--color-white); padding:1px 6px; border-radius:var(--radius-sm); color:var(--color-text-main); }
    .warn { display:flex; align-items:center; gap:8px; font-size:12px; color:var(--color-warning); }
    .check { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--color-text-main); }
    .test { display:flex; gap:10px; flex-wrap:wrap; }
    .test .input { flex:1; min-width:220px; }
    .result { margin:0; padding:12px 14px; font-size:12px; white-space:pre-wrap; overflow-wrap:anywhere; max-height:160px; overflow:auto;
      border-radius:var(--radius-md); background:var(--color-bg-light); border:1px solid var(--color-success); color:var(--color-text-main); }
    .result.bad { border-color:var(--color-error); }
    @media (max-width: 700px) {
      .grid2, .grid3, .grid-url { grid-template-columns:1fr; }
      .secret-row { flex-wrap:wrap; }
      .secret-row .name { flex:1 1 100%; }
    }
  `],
})
export class SmsSettingsComponent implements OnInit {
  private api = inject(SmsApiService);
  private toast = inject(ToastService);

  readonly Smartphone = Smartphone; readonly Plus = Plus; readonly Trash2 = Trash2; readonly Send = Send;
  readonly Save = Save; readonly KeyRound = KeyRound; readonly Check = Check;
  readonly TriangleAlert = TriangleAlert; readonly ChevronDown = ChevronDown; readonly ChevronUp = ChevronUp;

  readonly presets = PRESETS;
  readonly tokens = TOKENS;
  readonly bodyTypes: { key: SmsBodyType; label: string }[] = [
    { key: 'json', label: 'JSON' },
    { key: 'form', label: 'Formulario' },
    { key: 'query', label: 'En la URL' },
    { key: 'none', label: 'Sin cuerpo' },
  ];
  // En el template las llaves literales chocan con la sintaxis de Angular.
  readonly secretExample = '{secret:nombre}';
  readonly jsonPlaceholder = '{"to":"{to}","text":"{message}"}';

  loading = signal(true);
  saving = signal(false);
  testing = signal(false);
  advanced = signal(false);
  presetHint = signal('');
  secrets = signal<SecretRow[]>([]);
  missing = signal<string[]>([]);
  testResult = signal('');
  testOk = signal(true);
  testTo = '';

  form: Omit<SmsConfigInput, 'secrets'> = {
    enabled: false,
    name: '',
    url: '',
    method: 'POST',
    headers: [],
    bodyType: 'json',
    body: '',
    from: '',
    successPath: '',
    successValue: '',
    idPath: '',
    defaultCountryCode: '51',
    ratePerMinute: 60,
  };

  ngOnInit() {
    this.api.getConfig().subscribe({
      next: cfg => {
        const { secrets, missingSecrets, ...rest } = cfg;
        this.form = { ...rest, headers: rest.headers.map(h => ({ ...h })) };
        this.secrets.set(secrets.map(s => ({ name: s.name, value: '', hasValue: s.hasValue })));
        this.missing.set(missingSecrets);
        this.loading.set(false);
      },
      error: (err: ErrorLike) => {
        this.loading.set(false);
        this.toast.error(this.message(err, 'No se pudo cargar la configuración de SMS'));
      },
    });
  }

  applyPreset(p: Preset) {
    const keepFrom = this.form.from;
    this.form = {
      ...this.form,
      ...p.config,
      headers: p.config.headers.map((h: SmsHeader) => ({ ...h })),
      from: keepFrom,
    };
    const current = new Map(this.secrets().map(s => [s.name, s]));
    this.secrets.set(p.secrets.map(name => current.get(name) ?? { name, value: '', hasValue: false }));
    this.presetHint.set(p.hint);
    this.advanced.set(p.key === 'custom' || p.key === 'infobip');
  }

  addSecret() { this.secrets.update(s => [...s, { name: '', value: '', hasValue: false }]); }
  removeSecret(i: number) { this.secrets.update(s => s.filter((_, idx) => idx !== i)); }
  setSecret(i: number, key: 'name' | 'value', value: string) {
    this.secrets.update(s => s.map((row, idx) => (idx === i ? { ...row, [key]: key === 'name' ? value.trim().toLowerCase() : value } : row)));
  }
  addHeader() { this.form.headers = [...this.form.headers, { key: '', value: '' }]; }
  removeHeader(i: number) { this.form.headers = this.form.headers.filter((_, idx) => idx !== i); }

  save(then?: () => void) {
    const rows = this.secrets().filter(s => s.name);
    const input: SmsConfigInput = {
      ...this.form,
      ratePerMinute: Number(this.form.ratePerMinute) || 60,
      headers: this.form.headers.filter(h => h.key.trim()),
      secrets: rows.map(s => ({ name: s.name, ...(s.value ? { value: s.value } : {}) })),
    };
    this.saving.set(true);
    this.api.saveConfig(input).subscribe({
      next: cfg => {
        this.saving.set(false);
        this.secrets.set(cfg.secrets.map(s => ({ name: s.name, value: '', hasValue: s.hasValue })));
        this.missing.set(cfg.missingSecrets);
        this.toast.success('Configuración de SMS guardada');
        then?.();
      },
      error: (err: ErrorLike) => {
        this.saving.set(false);
        this.toast.error(this.message(err, 'No se pudo guardar la configuración'));
      },
    });
  }

  test() {
    // La prueba usa lo guardado: si hay cambios, primero se guardan.
    this.save(() => this.runTest());
  }

  private runTest() {
    this.testing.set(true);
    this.testResult.set('');
    this.api.test(this.testTo.trim(), 'Prueba de SMS desde Maya CRM').subscribe({
      next: res => {
        this.testing.set(false);
        this.testOk.set(true);
        this.testResult.set('Enviado (HTTP ' + res.status + (res.id ? ', id ' + res.id : '') + ')\n' + res.response);
        this.toast.success('SMS de prueba enviado');
      },
      error: (err: ErrorLike) => {
        this.testing.set(false);
        this.testOk.set(false);
        const msg = this.message(err, 'El proveedor rechazó el envío');
        this.testResult.set(msg);
        this.toast.error('La prueba falló: revisa la respuesta del proveedor');
      },
    });
  }

  private message(err: ErrorLike, fallback: string): string {
    const m = err.error?.message;
    return (Array.isArray(m) ? m[0] : m) || fallback;
  }
}
