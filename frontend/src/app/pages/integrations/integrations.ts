import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, Plug, Plus, KeyRound, Copy, RefreshCw, Ban, Pencil, Globe,
  BookOpen, MessageCircle, Instagram, Facebook, X, Check, ShieldCheck,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { FormPageComponent, snapshotOf } from '../../shared/form-page';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

type Channel = 'whatsapp' | 'instagram' | 'messenger';

export interface ApiAccess {
  _id: string;
  name: string;
  channel: Channel;
  accountId: string;
  accountLabel: string;
  keyPrefix: string;
  allowedDomains: string[];
  allowedIps: string[];
  perMinuteLimit: number;
  perDayLimit: number;
  revoked: boolean;
  revokedAt?: string;
  lastUsedAt?: string;
  sentCount: number;
  createdAt?: string;
}

export interface ShareableAccount {
  channel: Channel;
  id: string;
  label: string;
  detail?: string;
  active: boolean;
}

const CHANNEL_LABELS: Record<Channel, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  messenger: 'Messenger',
};

interface AccessForm {
  name: string;
  accountKey: string;
  domains: string;
  ips: string;
  perMinuteLimit: number;
  perDayLimit: number;
}

const emptyForm = (): AccessForm => ({
  name: '',
  accountKey: '',
  domains: '',
  ips: '',
  perMinuteLimit: 60,
  perDayLimit: 2000,
});

const lines = (text: string) =>
  text.split(/[\n,]/).map(s => s.trim()).filter(Boolean);

@Component({
  selector: 'app-integrations',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, FormPageComponent],
  template: `
    <div class="page animate-fade-in">
      <div class="page-header">
        <div>
          <h1>Integraciones</h1>
          <p class="page-sub">
            Envía mensajes por tus cuentas conectadas desde tu propio sistema (por ejemplo, el
            servidor de tu web). Cada acceso tiene su clave secreta, una sola cuenta y los
            dominios que autorices.
          </p>
        </div>
        <button class="btn btn-primary btn-block-mobile" (click)="openCreate()">
          <lucide-icon [img]="Plus" [size]="17" [strokeWidth]="2.5"></lucide-icon>
          Nuevo acceso
        </button>
      </div>

      <div class="card endpoint">
        <div class="ep-row">
          <span class="ep-method">POST</span>
          <code class="ep-url">{{ endpoint }}</code>
          <button class="btn btn-sm btn-secondary" (click)="copy(endpoint, 'URL copiada')">
            <lucide-icon [img]="Copy" [size]="14" [strokeWidth]="2.4"></lucide-icon> Copiar
          </button>
        </div>
        <button class="btn btn-ghost btn-sm docs-toggle" (click)="docsOpen.set(!docsOpen())" [attr.aria-expanded]="docsOpen()">
          <lucide-icon [img]="BookOpen" [size]="15" [strokeWidth]="2.4"></lucide-icon>
          {{ docsOpen() ? 'Ocultar documentación' : 'Cómo usarlo' }}
        </button>
        @if (docsOpen()) {
          <div class="docs">
            <p><strong>Desde tu servidor, nunca desde el navegador del visitante:</strong> la clave da permiso para escribir a tus clientes.</p>
            <ul>
              <li><code>Authorization: Bearer &lt;clave&gt;</code> — la clave del acceso.</li>
              <li><code>Origin: https://tudominio.com</code> — uno de los dominios autorizados. Desde un servidor esta cabecera la pones tú: es un segundo control; para uno fuerte, limita también las IPs.</li>
              <li><code>Idempotency-Key</code> (opcional) — si repites la petición con la misma clave, no se envía dos veces.</li>
            </ul>
            <p><strong>Cuerpo (JSON):</strong></p>
            <ul>
              <li><code>to</code> — WhatsApp: número internacional (<code>+51999888777</code>). Instagram/Messenger: id del contacto en ese canal.</li>
              <li><code>text</code> — texto del mensaje.</li>
              <li><code>mediaUrl</code> + <code>mediaType</code> (<code>image</code>, <code>video</code>, <code>audio</code>, <code>document</code>) + <code>filename</code> — archivo por URL https.</li>
              <li><code>template</code> — solo WhatsApp: <code>{{ templateExample }}</code>. Obligatoria si el contacto no te escribió en las últimas 24 h.</li>
            </ul>
            <p><strong>Respuestas:</strong> <code>201</code> enviado · <code>400</code> datos inválidos · <code>401</code> clave inválida o revocada · <code>403</code> dominio o IP no autorizados · <code>409</code> la cuenta ya no está conectada · <code>422</code> fuera de la ventana de 24 h, plantilla no válida o contacto bloqueado · <code>429</code> límite superado (mira <code>Retry-After</code>).</p>
            <p>Estado de un mensaje: <code>GET {{ endpoint }}/&lt;id&gt;</code> → <code>pending</code>, <code>sent</code>, <code>delivered</code>, <code>read</code> o <code>failed</code>.</p>
          </div>
        }
      </div>

      @if (loading()) {
        <div class="empty-state card">Cargando…</div>
      } @else if (loadError()) {
        <div class="empty-state card" role="alert">
          <p>No se pudieron cargar los accesos.</p>
          <button class="btn btn-secondary btn-sm" (click)="load()">Reintentar</button>
        </div>
      } @else if (accesses().length === 0) {
        <div class="empty-state card">
          <lucide-icon [img]="Plug" [size]="38" [strokeWidth]="1.5"></lucide-icon>
          <p>Todavía no has creado ningún acceso.</p>
          <span>Crea uno, elige la cuenta que quieres compartir y autoriza el dominio de tu web.</span>
        </div>
      } @else {
        <div class="access-list">
          @for (a of accesses(); track a._id) {
            <div class="card access" [class.revoked]="a.revoked">
              <div class="ac-head">
                <span class="ch-icon" [attr.data-channel]="a.channel">
                  <lucide-icon [img]="channelIcon(a.channel)" [size]="18" [strokeWidth]="2.2"></lucide-icon>
                </span>
                <div class="ac-title">
                  <h3>{{ a.name }}</h3>
                  <span class="ac-account">{{ channelLabel(a.channel) }} · {{ a.accountLabel || 'Cuenta' }}</span>
                </div>
                @if (a.revoked) {
                  <span class="badge badge-neutral">Revocado</span>
                } @else {
                  <span class="badge badge-success">Activo</span>
                }
              </div>
              <div class="ac-meta">
                <span class="meta-item"><lucide-icon [img]="KeyRound" [size]="14" [strokeWidth]="2.4"></lucide-icon> <code>{{ a.keyPrefix }}…</code></span>
                <span class="meta-item"><lucide-icon [img]="Globe" [size]="14" [strokeWidth]="2.4"></lucide-icon> {{ a.allowedDomains.join(', ') }}</span>
                @if (a.allowedIps.length) {
                  <span class="meta-item"><lucide-icon [img]="ShieldCheck" [size]="14" [strokeWidth]="2.4"></lucide-icon> {{ a.allowedIps.join(', ') }}</span>
                }
              </div>
              <div class="ac-stats">
                @if (a.createdAt) { <span>Creado: {{ shortDate(a.createdAt) }}</span> }
                <span>{{ a.sentCount }} {{ a.sentCount === 1 ? 'envío' : 'envíos' }}</span>
                <span>Último uso: {{ a.lastUsedAt ? shortDate(a.lastUsedAt) : 'nunca' }}</span>
                <span>Límite: {{ a.perMinuteLimit }}/min · {{ a.perDayLimit }}/día</span>
              </div>
              @if (!a.revoked) {
                <div class="ac-actions">
                  <button class="btn btn-sm btn-secondary" (click)="openEdit(a)" [attr.aria-label]="'Editar ' + a.name">
                    <lucide-icon [img]="Pencil" [size]="14" [strokeWidth]="2.4"></lucide-icon> Editar
                  </button>
                  <button class="btn btn-sm btn-secondary" (click)="regenerate(a)" [attr.aria-label]="'Regenerar la clave de ' + a.name">
                    <lucide-icon [img]="RefreshCw" [size]="14" [strokeWidth]="2.4"></lucide-icon> Regenerar clave
                  </button>
                  <button class="btn btn-sm btn-danger" (click)="revoke(a)" [attr.aria-label]="'Revocar ' + a.name">
                    <lucide-icon [img]="Ban" [size]="14" [strokeWidth]="2.4"></lucide-icon> Revocar
                  </button>
                </div>
              }
            </div>
          }
        </div>
      }
    </div>

    @if (formOpen()) {
      <form (ngSubmit)="save()" #f="ngForm">
        <app-form-page
          [title]="editing() ? 'Editar acceso' : 'Nuevo acceso'"
          backLabel="Integraciones"
          [urlKey]="editing() ? 'editar-' + editing()!._id : 'nuevo'"
          [dirty]="isDirty()"
          (closed)="closeForm()">
          <ng-container formActions>
            <button class="btn btn-primary" type="submit" [disabled]="saving()">
              {{ saving() ? 'Guardando…' : (editing() ? 'Guardar' : 'Crear acceso') }}
            </button>
          </ng-container>

          <div class="card form-card">
            <div class="field">
              <label class="label" for="ia-name">Nombre</label>
              <input id="ia-name" class="input" name="name" [(ngModel)]="form.name" maxlength="80" placeholder="Web de la tienda" required />
            </div>

            @if (!editing()) {
              <div class="field">
                <label class="label" for="ia-account">Cuenta que compartes</label>
                @if (accounts().length === 0) {
                  <p class="hint warn">No tienes cuentas de WhatsApp, Instagram o Messenger conectadas. Conéctalas en Configuración.</p>
                } @else {
                  <select id="ia-account" class="select" name="account" [(ngModel)]="form.accountKey" required>
                    <option value="" disabled>Elige una cuenta</option>
                    @for (acc of accounts(); track acc.channel + acc.id) {
                      <option [value]="acc.channel + ':' + acc.id" [disabled]="!acc.active">
                        {{ channelLabel(acc.channel) }} · {{ acc.label }}{{ acc.detail ? ' (' + acc.detail + ')' : '' }}{{ acc.active ? '' : ' — inactiva' }}
                      </option>
                    }
                  </select>
                }
                <p class="hint">El acceso solo podrá enviar por esta cuenta.</p>
              </div>
            }

            <div class="field">
              <label class="label" for="ia-domains">Dominios autorizados</label>
              <textarea id="ia-domains" class="textarea" name="domains" rows="3" [(ngModel)]="form.domains" placeholder="mitienda.pe&#10;*.miempresa.com"></textarea>
              <p class="hint">Uno por línea. <code>mitienda.pe</code> admite también <code>www.</code>; <code>*.miempresa.com</code> admite sus subdominios. Tu servidor debe enviar la cabecera <code>Origin</code> con uno de ellos.</p>
            </div>

            <div class="field">
              <label class="label" for="ia-ips">IPs autorizadas (opcional)</label>
              <textarea id="ia-ips" class="textarea" name="ips" rows="2" [(ngModel)]="form.ips" placeholder="203.0.113.10"></textarea>
              <p class="hint">Si las indicas, solo se aceptan llamadas desde estas IPs. Es la protección más fuerte para un servidor.</p>
            </div>

            <div class="row">
              <div class="field">
                <label class="label" for="ia-min">Envíos por minuto</label>
                <input id="ia-min" class="input" type="number" name="perMinute" min="1" max="600" [(ngModel)]="form.perMinuteLimit" />
              </div>
              <div class="field">
                <label class="label" for="ia-day">Envíos por día</label>
                <input id="ia-day" class="input" type="number" name="perDay" min="1" max="100000" [(ngModel)]="form.perDayLimit" />
              </div>
            </div>
            @if (formError()) { <p class="form-error" role="alert">{{ formError() }}</p> }
          </div>
        </app-form-page>
      </form>
    }

    @if (newKey(); as k) {
      <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="key-title">
        <div class="card key-modal">
          <div class="km-head">
            <h2 id="key-title">Guarda tu clave</h2>
            <button class="btn-icon btn-ghost" type="button" (click)="closeKey()" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="20" [strokeWidth]="2.4"></lucide-icon>
            </button>
          </div>
          <p class="km-sub">Es la única vez que se muestra. Si la pierdes, regenera una nueva.</p>
          <div class="key-box">
            <code class="key-value">{{ k.key }}</code>
            <button class="btn btn-sm btn-primary" type="button" (click)="copy(k.key, 'Clave copiada')">
              <lucide-icon [img]="Copy" [size]="14" [strokeWidth]="2.4"></lucide-icon> Copiar
            </button>
          </div>
          <div class="example-tabs" role="tablist">
            <button type="button" role="tab" class="tab" [class.active]="exampleTab() === 'curl'" [attr.aria-selected]="exampleTab() === 'curl'" (click)="exampleTab.set('curl')">cURL</button>
            <button type="button" role="tab" class="tab" [class.active]="exampleTab() === 'js'" [attr.aria-selected]="exampleTab() === 'js'" (click)="exampleTab.set('js')">JavaScript</button>
          </div>
          <pre class="example">{{ example() }}</pre>
          <div class="km-actions">
            <button class="btn btn-secondary" type="button" (click)="copy(example(), 'Ejemplo copiado')">
              <lucide-icon [img]="Copy" [size]="15" [strokeWidth]="2.4"></lucide-icon> Copiar ejemplo
            </button>
            <button class="btn btn-primary" type="button" (click)="closeKey()">
              <lucide-icon [img]="Check" [size]="15" [strokeWidth]="2.6"></lucide-icon> Ya la guardé
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .page { width: 100%; box-sizing: border-box; padding: 32px 40px; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; flex-wrap: wrap; margin-bottom: 24px; }
    .page-header h1 { margin: 0 0 4px; font-family: var(--font-heading); font-size: 26px; }
    .page-sub { margin: 0; color: var(--color-text-muted); font-size: 13.5px; max-width: 680px; line-height: 1.55; }

    .card:hover { transform: none; }
    .endpoint { padding: 18px 24px; margin-bottom: 20px; display: flex; flex-direction: column; gap: 10px; }
    .ep-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .ep-method { font: 700 12px var(--font-base); color: var(--color-white); background: var(--color-brand); padding: 4px 10px; border-radius: var(--radius-pill); }
    .ep-url { flex: 1; min-width: 0; font-size: 13.5px; overflow-wrap: anywhere; }
    .docs-toggle { align-self: flex-start; gap: 6px; }
    .docs { font-size: 13.5px; line-height: 1.6; color: var(--color-text-main); border-top: 1px solid var(--color-border); padding-top: 12px; }
    .docs p { margin: 8px 0; }
    .docs ul { margin: 4px 0 8px; padding-left: 20px; }
    .docs code, .hint code { font-size: 12.5px; background: var(--color-bg-app); padding: 1px 6px; border-radius: 6px; overflow-wrap: anywhere; }

    .empty-state { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 48px 24px; text-align: center; color: var(--color-text-muted); }
    .empty-state p { margin: 0; font-size: 15px; font-weight: 600; color: var(--color-text-main); }
    .empty-state span { font-size: 13.5px; max-width: 420px; line-height: 1.55; }

    .access-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; }
    .access { padding: 24px; display: flex; flex-direction: column; gap: 14px; }
    .access.revoked { opacity: .65; }
    .ac-head { display: flex; align-items: center; gap: 12px; }
    .ch-icon { width: 38px; height: 38px; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; background: var(--color-brand-light); color: var(--color-brand); flex-shrink: 0; }
    .ac-title { flex: 1; min-width: 0; }
    .ac-title h3 { margin: 0; font-family: var(--font-heading); font-size: 16px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ac-account { font-size: 12.5px; color: var(--color-text-muted); }
    .ac-meta { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
    .meta-item { display: inline-flex; align-items: center; gap: 6px; overflow-wrap: anywhere; min-width: 0; }
    .meta-item lucide-icon { color: var(--color-text-muted); flex-shrink: 0; }
    .ac-stats { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; color: var(--color-text-muted); }
    .ac-actions { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 12px; border-top: 1px solid var(--color-border); }
    .ac-actions .btn { gap: 6px; }

    .form-card { padding: 24px; display: flex; flex-direction: column; gap: 16px; max-width: 760px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .label { font-size: 12.5px; font-weight: 600; }
    .hint { margin: 0; font-size: 12.5px; color: var(--color-text-muted); line-height: 1.5; }
    .hint.warn { color: var(--color-error); font-weight: 600; }
    .form-error { margin: 0; font-size: 13px; color: var(--color-error); font-weight: 600; }

    .overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 100; }
    .key-modal { width: calc(100% - 48px); max-width: 640px; padding: 28px 32px; max-height: calc(100vh - 48px); overflow: auto; box-sizing: border-box; }
    .km-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .km-head h2 { margin: 0; font-family: var(--font-heading); font-size: 19px; }
    .km-sub { margin: 4px 0 16px; font-size: 13px; color: var(--color-text-muted); }
    .key-box { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: var(--radius-md); background: var(--color-bg-app); border: 1px solid var(--color-border); }
    .key-value { flex: 1; min-width: 0; font-size: 13px; overflow-wrap: anywhere; }
    .example-tabs { display: flex; gap: 6px; margin: 18px 0 8px; }
    .tab { border: 1px solid var(--color-border); background: var(--color-white); border-radius: var(--radius-pill); padding: 6px 14px; font: 600 12.5px var(--font-base); cursor: pointer; color: var(--color-text-main); }
    .tab.active { background: var(--color-brand); border-color: var(--color-brand); color: var(--color-white); }
    .example { margin: 0; padding: 14px; border-radius: var(--radius-md); background: var(--color-text-main); color: var(--color-white); font-size: 12px; line-height: 1.55; overflow-x: auto; white-space: pre; }
    .km-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; flex-wrap: wrap; }
    .km-actions .btn { gap: 6px; }

    @media (max-width: 768px) {
      .page { padding: 20px 16px; }
      .page-header h1 { font-size: 22px; }
      .endpoint { padding: 16px; }
      .access-list { grid-template-columns: 1fr; }
      .access { padding: 18px; }
      .row { grid-template-columns: 1fr; }
      .form-card { padding: 18px; }
      .key-modal { padding: 22px 18px; width: calc(100% - 32px); }
      .key-box { flex-direction: column; align-items: stretch; }
      .km-actions .btn { flex: 1; min-height: 46px; }
    }
  `],
})
export class IntegrationsComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly Plug = Plug; readonly Plus = Plus; readonly KeyRound = KeyRound; readonly Copy = Copy;
  readonly RefreshCw = RefreshCw; readonly Ban = Ban; readonly Pencil = Pencil; readonly Globe = Globe;
  readonly BookOpen = BookOpen; readonly X = X; readonly Check = Check; readonly ShieldCheck = ShieldCheck;

  readonly endpoint = `${API}/public/v1/messages`;
  readonly templateExample = '{ "name": "pedido_listo", "language": "es", "variables": ["Ana", "#123"] }';

  accesses = signal<ApiAccess[]>([]);
  accounts = signal<ShareableAccount[]>([]);
  loading = signal(true);
  loadError = signal(false);
  docsOpen = signal(false);

  formOpen = signal(false);
  editing = signal<ApiAccess | null>(null);
  saving = signal(false);
  formError = signal('');
  form: AccessForm = emptyForm();
  private formSnapshot = '';

  newKey = signal<{ key: string; access: ApiAccess } | null>(null);
  exampleTab = signal<'curl' | 'js'>('curl');

  example = computed(() => {
    const k = this.newKey();
    if (!k) return '';
    const origin = `https://${(k.access.allowedDomains[0] ?? 'tudominio.com').replace(/^\*\./, '')}`;
    const to = k.access.channel === 'whatsapp' ? '+51999888777' : 'ID_DEL_CONTACTO';
    if (this.exampleTab() === 'curl') {
      return [
        `curl -X POST ${this.endpoint} \\`,
        `  -H "Authorization: Bearer ${k.key}" \\`,
        `  -H "Origin: ${origin}" \\`,
        `  -H "Content-Type: application/json" \\`,
        `  -H "Idempotency-Key: pedido-123" \\`,
        `  -d '{"to": "${to}", "text": "Hola, tu pedido está listo"}'`,
      ].join('\n');
    }
    return [
      `// En tu servidor (Node 18+). No pongas la clave en el navegador.`,
      `const res = await fetch('${this.endpoint}', {`,
      `  method: 'POST',`,
      `  headers: {`,
      `    'Authorization': 'Bearer ' + process.env.MAYA_API_KEY,`,
      `    'Origin': '${origin}',`,
      `    'Content-Type': 'application/json',`,
      `    'Idempotency-Key': 'pedido-123',`,
      `  },`,
      `  body: JSON.stringify({ to: '${to}', text: 'Hola, tu pedido está listo' }),`,
      `});`,
      `const data = await res.json(); // { id, status, conversationId, ... }`,
    ].join('\n');
  });

  ngOnInit() {
    this.load();
    this.http.get<ShareableAccount[]>(`${API}/api-access/accounts`).subscribe({
      next: list => this.accounts.set(list),
      error: () => this.toast.error('No se pudieron cargar tus cuentas conectadas'),
    });
  }

  load() {
    this.loadError.set(false);
    this.http.get<ApiAccess[]>(`${API}/api-access`).subscribe({
      next: list => { this.accesses.set(list); this.loading.set(false); },
      error: () => { this.loading.set(false); this.loadError.set(true); this.toast.error('No se pudieron cargar los accesos'); },
    });
  }

  channelLabel(c: Channel) { return CHANNEL_LABELS[c] ?? c; }
  channelIcon(c: Channel) { return c === 'instagram' ? Instagram : c === 'messenger' ? Facebook : MessageCircle; }

  openCreate() {
    this.editing.set(null);
    this.form = emptyForm();
    const first = this.accounts().find(a => a.active);
    if (first) this.form.accountKey = `${first.channel}:${first.id}`;
    this.openForm();
  }

  openEdit(a: ApiAccess) {
    this.editing.set(a);
    this.form = {
      name: a.name,
      accountKey: `${a.channel}:${a.accountId}`,
      domains: a.allowedDomains.join('\n'),
      ips: a.allowedIps.join('\n'),
      perMinuteLimit: a.perMinuteLimit,
      perDayLimit: a.perDayLimit,
    };
    this.openForm();
  }

  private openForm() {
    this.formError.set('');
    this.formSnapshot = snapshotOf(this.form);
    this.formOpen.set(true);
  }

  isDirty() { return snapshotOf(this.form) !== this.formSnapshot; }
  closeForm() { this.formOpen.set(false); }

  save() {
    const error = this.validate();
    if (error) { this.formError.set(error); this.toast.error(error); return; }
    const editing = this.editing();
    const common = {
      name: this.form.name.trim(),
      allowedDomains: lines(this.form.domains),
      allowedIps: lines(this.form.ips),
      perMinuteLimit: Number(this.form.perMinuteLimit),
      perDayLimit: Number(this.form.perDayLimit),
    };
    this.saving.set(true);
    this.formError.set('');
    if (editing) {
      this.http.patch<ApiAccess>(`${API}/api-access/${editing._id}`, common).subscribe({
        next: () => { this.saving.set(false); this.formOpen.set(false); this.toast.success('Acceso actualizado'); this.load(); },
        error: err => this.fail(err, 'No se pudo guardar el acceso'),
      });
      return;
    }
    const [channel, accountId] = this.form.accountKey.split(':');
    this.http.post<{ access: ApiAccess; key: string }>(`${API}/api-access`, { ...common, channel, accountId }).subscribe({
      next: res => {
        this.saving.set(false);
        this.formOpen.set(false);
        this.toast.success('Acceso creado');
        this.showKey(res);
        this.load();
      },
      error: err => this.fail(err, 'No se pudo crear el acceso'),
    });
  }

  private validate(): string {
    if (!this.form.name.trim()) return 'Ponle un nombre al acceso.';
    if (!this.editing() && !this.form.accountKey) return 'Elige la cuenta que quieres compartir.';
    if (lines(this.form.domains).length === 0) return 'Autoriza al menos un dominio.';
    const perMin = Number(this.form.perMinuteLimit);
    const perDay = Number(this.form.perDayLimit);
    if (!Number.isInteger(perMin) || perMin < 1 || perMin > 600) return 'Los envíos por minuto van de 1 a 600.';
    if (!Number.isInteger(perDay) || perDay < 1 || perDay > 100000) return 'Los envíos por día van de 1 a 100 000.';
    return '';
  }

  private fail(err: { error?: { message?: string | string[] } }, fallback: string) {
    this.saving.set(false);
    const msg = err.error?.message || fallback;
    const text = Array.isArray(msg) ? msg.join(' ') : msg;
    this.formError.set(text);
    this.toast.error(text);
  }

  async regenerate(a: ApiAccess) {
    const ok = await this.confirm.confirm({
      title: 'Regenerar clave',
      message: `La clave actual de "${a.name}" dejará de funcionar en este momento. Tendrás que poner la nueva en tu sistema.`,
      confirmText: 'Regenerar',
      danger: true,
    });
    if (!ok) return;
    this.http.post<{ access: ApiAccess; key: string }>(`${API}/api-access/${a._id}/regenerate`, {}).subscribe({
      next: res => { this.toast.success('Clave regenerada'); this.showKey(res); this.load(); },
      error: err => this.toast.error(err.error?.message || 'No se pudo regenerar la clave'),
    });
  }

  async revoke(a: ApiAccess) {
    const ok = await this.confirm.confirm({
      title: 'Revocar acceso',
      message: `"${a.name}" dejará de poder enviar mensajes en este momento. No se puede deshacer.`,
      confirmText: 'Revocar',
      danger: true,
    });
    if (!ok) return;
    this.http.post<ApiAccess>(`${API}/api-access/${a._id}/revoke`, {}).subscribe({
      next: () => { this.toast.success('Acceso revocado'); this.load(); },
      error: err => this.toast.error(err.error?.message || 'No se pudo revocar el acceso'),
    });
  }

  private showKey(res: { access: ApiAccess; key: string }) {
    this.exampleTab.set('curl');
    this.newKey.set(res);
  }

  closeKey() { this.newKey.set(null); }

  async copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success(done);
    } catch {
      this.toast.error('No se pudo copiar: selecciónalo y cópialo a mano');
    }
  }

  shortDate(iso: string): string {
    return new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
}
