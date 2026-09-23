import { Component, HostListener, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, Mail, Plus, Trash2, Pencil, RefreshCw, CheckCircle2, AlertTriangle,
  Loader2, Star, Eye, EyeOff, X, Server, Save, Pause, Play,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { EmailAccountsApiService } from '../../core/api/email-accounts-api.service';
import {
  EMAIL_PRESETS, EmailAccount, EmailAccountForm, EmailPreset, blankEmailForm,
} from '../../shared/models/email.model';

@Component({
  selector: 'app-email-settings',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, DatePipe],
  template: `
    <div class="section-card">
      <div class="section-header">
        <div class="section-icon">
          <lucide-icon [img]="Mail" [size]="22"></lucide-icon>
        </div>
        <div>
          <h2 class="section-title">Correo electrónico</h2>
          <p class="section-desc">Conecta tus buzones: los correos llegan en vivo a Conversaciones y tus agentes de IA pueden responderlos.</p>
        </div>
      </div>

      <div class="connect-row">
        <button class="connect-btn" (click)="connect('gmail')" [disabled]="!providers().gmail || redirecting()">
          <span class="dot gmail"></span>
          <span class="connect-text">
            <strong>Conectar Gmail</strong>
            <small>{{ providers().gmail ? 'Google Workspace o Gmail, en vivo' : 'No habilitado en el servidor' }}</small>
          </span>
        </button>
        <button class="connect-btn" (click)="connect('outlook')" [disabled]="!providers().outlook || redirecting()">
          <span class="dot outlook"></span>
          <span class="connect-text">
            <strong>Conectar Outlook</strong>
            <small>{{ providers().outlook ? 'Outlook.com o Microsoft 365, en vivo' : 'No habilitado en el servidor' }}</small>
          </span>
        </button>
        <button class="connect-btn" (click)="openForm()">
          <span class="dot other"><lucide-icon [img]="Server" [size]="14"></lucide-icon></span>
          <span class="connect-text">
            <strong>Otro servidor</strong>
            <small>IMAP o POP3 + SMTP</small>
          </span>
        </button>
      </div>

      @if (loading()) {
        <div class="loading-row"><lucide-icon [img]="Loader2" [size]="18" class="spin"></lucide-icon> Cargando buzones…</div>
      } @else if (!accounts().length) {
        <div class="empty">
          <lucide-icon [img]="Mail" [size]="28" [strokeWidth]="1.5"></lucide-icon>
          <p>Aún no hay buzones conectados.</p>
        </div>
      } @else {
        <div class="acc-list">
          @for (a of accounts(); track a._id) {
            <div class="acc-card" [class.paused]="!a.active">
              <div class="acc-head">
                <div class="acc-id">
                  <span class="acc-label">
                    {{ a.label }}
                    @if (a.isDefault) { <span class="badge badge-brand">Predeterminado</span> }
                  </span>
                  <span class="acc-sub">{{ a.email }} · {{ providerLabel(a) }}</span>
                </div>
                <div class="acc-actions">
                  <button class="btn btn-sm btn-ghost btn-icon" (click)="test(a)" [disabled]="testing() === a._id" title="Probar conexión" aria-label="Probar conexión">
                    <lucide-icon [img]="testing() === a._id ? Loader2 : RefreshCw" [size]="14" [class.spin]="testing() === a._id"></lucide-icon>
                  </button>
                  @if (!a.isDefault) {
                    <button class="btn btn-sm btn-ghost btn-icon" (click)="makeDefault(a)" title="Usar por defecto" aria-label="Usar por defecto">
                      <lucide-icon [img]="Star" [size]="14"></lucide-icon>
                    </button>
                  }
                  <button class="btn btn-sm btn-ghost btn-icon" (click)="toggleActive(a)" [title]="a.active ? 'Pausar' : 'Reanudar'" [attr.aria-label]="a.active ? 'Pausar' : 'Reanudar'">
                    <lucide-icon [img]="a.active ? Pause : Play" [size]="14"></lucide-icon>
                  </button>
                  <button class="btn btn-sm btn-ghost btn-icon" (click)="openForm(a)" title="Editar" aria-label="Editar">
                    <lucide-icon [img]="Pencil" [size]="14"></lucide-icon>
                  </button>
                  <button class="btn btn-sm btn-ghost btn-icon danger" (click)="remove(a)" title="Eliminar" aria-label="Eliminar">
                    <lucide-icon [img]="Trash2" [size]="14"></lucide-icon>
                  </button>
                </div>
              </div>
              <div class="acc-status" [attr.data-status]="a.active ? a.status : 'paused'">
                @switch (a.active ? a.status : 'paused') {
                  @case ('connected') {
                    <lucide-icon [img]="CheckCircle2" [size]="13"></lucide-icon>
                    {{ a.incomingProtocol === 'imap' ? 'Escuchando en vivo' : 'Revisando cada 2 minutos' }}
                  }
                  @case ('error') { <lucide-icon [img]="AlertTriangle" [size]="13"></lucide-icon> {{ a.lastError || 'Error de conexión' }} }
                  @case ('paused') { <lucide-icon [img]="Pause" [size]="13"></lucide-icon> Pausado: no se leen ni se envían correos }
                  @default { <lucide-icon [img]="Loader2" [size]="13" class="spin"></lucide-icon> Conectando… }
                }
                @if (a.lastSyncAt && a.active) { <span class="muted">· revisado {{ a.lastSyncAt | date: 'd MMM, HH:mm' }}</span> }
              </div>
              @if (a.status === 'error' && a.provider !== 'custom') {
                <button class="btn btn-sm btn-secondary reconnect" (click)="connect(a.provider === 'gmail' ? 'gmail' : 'outlook')">
                  <lucide-icon [img]="RefreshCw" [size]="13"></lucide-icon> Volver a conectar
                </button>
              }
            </div>
          }
        </div>
        <p class="field-hint">Para que un agente responda los correos, actívale el buzón en Agentes IA → canales.</p>
      }
    </div>

    @if (form(); as f) {
      <div class="overlay" (click)="closeForm()" role="dialog" aria-modal="true">
        <aside class="drawer" (click)="$event.stopPropagation()">
          <div class="drawer-header">
            <div>
              <h2>{{ editing() ? 'Editar buzón' : 'Conectar buzón' }}</h2>
              <p class="subtitle">{{ editing() ? editing()!.email : 'Cualquier proveedor con IMAP o POP3 y SMTP' }}</p>
            </div>
            <button class="btn btn-ghost btn-icon" (click)="closeForm()" aria-label="Cerrar"><lucide-icon [img]="X" [size]="20"></lucide-icon></button>
          </div>

          <div class="drawer-scroll">
            @if (!isOAuth()) {
              @if (!editing()) {
                <div class="field">
                  <span class="label">Proveedor</span>
                  <div class="chips">
                    @for (p of presets; track p.key) {
                      <button type="button" class="chip" [class.active]="preset()?.key === p.key" (click)="applyPreset(p)">{{ p.label }}</button>
                    }
                    <button type="button" class="chip" [class.active]="!preset()" (click)="preset.set(null)">Otro</button>
                  </div>
                  @if (preset()?.hint) { <span class="field-hint">{{ preset()!.hint }}</span> }
                </div>
                <div class="field">
                  <label class="label" for="em-email">Correo *</label>
                  <input id="em-email" class="input" type="email" [(ngModel)]="f.email" placeholder="ventas@tuempresa.com" autocomplete="off" />
                </div>
              }
              <div class="field">
                <label class="label" for="em-pass">{{ editing() ? 'Contraseña (déjala vacía para no cambiarla)' : 'Contraseña *' }}</label>
                <div class="input-wrap">
                  <input id="em-pass" class="input" [type]="showPass() ? 'text' : 'password'" [(ngModel)]="f.password" autocomplete="new-password" />
                  <button class="eye-btn" type="button" (click)="showPass.set(!showPass())" [attr.aria-label]="showPass() ? 'Ocultar' : 'Mostrar'">
                    <lucide-icon [img]="showPass() ? EyeOff : Eye" [size]="16"></lucide-icon>
                  </button>
                </div>
                <span class="field-hint">Se guarda cifrada y nunca se vuelve a mostrar.</span>
              </div>
            }

            <div class="field">
              <label class="label" for="em-label">Nombre del buzón *</label>
              <input id="em-label" class="input" [(ngModel)]="f.label" placeholder="Ej: Ventas" />
            </div>
            <div class="field">
              <label class="label" for="em-from">Nombre del remitente</label>
              <input id="em-from" class="input" [(ngModel)]="f.fromName" placeholder="Ej: Maya · Equipo de ventas" />
            </div>
            <div class="field">
              <label class="label" for="em-sig">Firma</label>
              <textarea id="em-sig" class="textarea" rows="3" [(ngModel)]="f.signature" placeholder="Nombre, cargo, teléfono…"></textarea>
            </div>
            <label class="toggle-row">
              <input type="checkbox" [(ngModel)]="f.skipBulk" />
              <span>Ignorar boletines y listas de correo</span>
            </label>

            @if (!isOAuth()) {
              <details class="advanced" [open]="!preset() || !!editing()">
                <summary>Servidores</summary>
                <div class="field">
                  <span class="label">Recibir con</span>
                  <div class="chips">
                    <button type="button" class="chip" [class.active]="f.incomingProtocol === 'imap'" (click)="setProtocol('imap')">IMAP (en vivo)</button>
                    <button type="button" class="chip" [class.active]="f.incomingProtocol === 'pop3'" (click)="setProtocol('pop3')">POP3</button>
                  </div>
                </div>
                <div class="server-row">
                  <div class="field grow">
                    <label class="label" for="em-in-host">Servidor de entrada</label>
                    <input id="em-in-host" class="input" [(ngModel)]="f.incomingHost" placeholder="imap.tuempresa.com" />
                  </div>
                  <div class="field port">
                    <label class="label" for="em-in-port">Puerto</label>
                    <input id="em-in-port" class="input" type="number" [(ngModel)]="f.incomingPort" />
                  </div>
                </div>
                <label class="toggle-row"><input type="checkbox" [(ngModel)]="f.incomingSecure" /><span>SSL/TLS</span></label>
                <div class="server-row">
                  <div class="field grow">
                    <label class="label" for="em-out-host">Servidor SMTP</label>
                    <input id="em-out-host" class="input" [(ngModel)]="f.smtpHost" placeholder="smtp.tuempresa.com" />
                  </div>
                  <div class="field port">
                    <label class="label" for="em-out-port">Puerto</label>
                    <input id="em-out-port" class="input" type="number" [(ngModel)]="f.smtpPort" />
                  </div>
                </div>
                <label class="toggle-row"><input type="checkbox" [(ngModel)]="f.smtpSecure" /><span>SSL/TLS directo (desmarcado = STARTTLS)</span></label>
                <div class="field">
                  <label class="label" for="em-user">Usuario</label>
                  <input id="em-user" class="input" [(ngModel)]="f.username" [placeholder]="f.email || 'Por defecto, el correo'" autocomplete="off" />
                </div>
              </details>
            }
          </div>

          <div class="drawer-footer">
            <button class="btn btn-ghost" (click)="closeForm()">Cancelar</button>
            <button class="btn btn-primary" (click)="save()" [disabled]="saving()">
              <lucide-icon [img]="saving() ? Loader2 : Save" [size]="16" [class.spin]="saving()"></lucide-icon>
              {{ saving() ? 'Probando conexión…' : 'Guardar' }}
            </button>
          </div>
        </aside>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .section-card { background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 28px 32px; margin-bottom: 24px; }
    .section-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
    .section-icon { width: 44px; height: 44px; border-radius: var(--radius-lg); display: grid; place-items: center; flex-shrink: 0;
      background: color-mix(in srgb, var(--color-brand) 10%, var(--color-white)); color: var(--color-brand); }
    .section-title { font-family: var(--font-heading); font-size: 17px; font-weight: 700; margin: 0 0 2px; }
    .section-desc { font-size: 13px; color: var(--color-text-muted); margin: 0; }

    .connect-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-bottom: 20px; }
    .connect-btn { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border: 1px solid var(--color-border);
      border-radius: var(--radius-md); background: var(--color-white); cursor: pointer; text-align: left; min-width: 0;
      transition: all var(--transition-fast); font-family: var(--font-base); }
    .connect-btn:hover:not(:disabled) { border-color: var(--color-brand); box-shadow: var(--shadow-sm); transform: translateY(-1px); }
    .connect-btn:disabled { opacity: .55; cursor: not-allowed; }
    .connect-text { display: flex; flex-direction: column; min-width: 0; }
    .connect-text strong { font-size: 14px; color: var(--color-text-main); }
    .connect-text small { font-size: 12px; color: var(--color-text-muted); }
    .dot { width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; color: var(--color-white); }
    .dot.gmail { background: conic-gradient(#EA4335 0 25%, #FBBC05 0 50%, #34A853 0 75%, #4285F4 0); }
    .dot.outlook { background: linear-gradient(135deg, #0078D4, #28A8EA); }
    .dot.other { background: var(--color-text-muted); }

    .loading-row { display: flex; align-items: center; gap: 10px; color: var(--color-text-muted); font-size: 14px; padding: 8px 0; }
    .empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 24px; color: var(--color-text-muted); font-size: 14px; }
    .empty p { margin: 0; }

    .acc-list { display: flex; flex-direction: column; gap: 12px; }
    .acc-card { border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 16px 20px; }
    .acc-card.paused { opacity: .7; }
    .acc-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
    .acc-id { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .acc-label { font-weight: 700; font-size: 15px; display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .acc-sub { font-size: 12.5px; color: var(--color-text-muted); overflow-wrap: anywhere; }
    .acc-actions { display: flex; gap: 2px; flex-shrink: 0; }
    .danger { color: var(--color-error) !important; }
    .acc-status { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 10px; font-size: 12.5px; font-weight: 600; }
    .acc-status[data-status="connected"] { color: var(--color-success); }
    .acc-status[data-status="error"] { color: var(--color-error); }
    .acc-status[data-status="connecting"], .acc-status[data-status="paused"] { color: var(--color-text-muted); }
    .muted { font-weight: 400; color: var(--color-text-muted); }
    .reconnect { margin-top: 10px; }
    .field-hint { display: block; font-size: 12px; color: var(--color-text-muted); margin-top: 12px; line-height: 1.5; }

    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 100; }
    .drawer { margin-left: auto; height: 100%; width: min(520px, 100%); background: var(--color-white); display: flex; flex-direction: column; box-shadow: var(--shadow-lg); animation: slideIn var(--transition-spring); }
    @keyframes slideIn { from { transform: translateX(30px); opacity: 0; } to { transform: none; opacity: 1; } }
    .drawer-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 24px 28px 16px; padding-top: calc(24px + var(--safe-top)); border-bottom: 1px solid var(--color-border); }
    .drawer-header h2 { margin: 0 0 3px; font: 700 20px var(--font-heading); }
    .subtitle { margin: 0; font-size: 13px; color: var(--color-text-muted); overflow-wrap: anywhere; }
    .drawer-scroll { flex: 1; overflow-y: auto; padding: 20px 28px; display: flex; flex-direction: column; gap: 16px; }
    .drawer-footer { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 28px; padding-bottom: calc(16px + var(--safe-bottom)); border-top: 1px solid var(--color-border); }
    .field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .field .field-hint { margin-top: 0; }
    .label { font-size: 13px; font-weight: 600; color: var(--color-text-main); }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip { border: 1.5px solid var(--color-border); background: var(--color-white); color: var(--color-text-muted); font: 600 12.5px var(--font-base);
      padding: 7px 13px; border-radius: var(--radius-pill); cursor: pointer; transition: all var(--transition-fast); }
    .chip:hover { border-color: var(--color-brand); color: var(--color-brand); }
    .chip.active { background: var(--color-brand); border-color: var(--color-brand); color: var(--color-white); }
    .input-wrap { position: relative; display: flex; }
    .input-wrap .input { padding-right: 44px; flex: 1; }
    .eye-btn { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--color-text-muted); display: flex; }
    .toggle-row { display: flex; align-items: center; gap: 10px; font-size: 13.5px; cursor: pointer; }
    .toggle-row input { width: 17px; height: 17px; accent-color: var(--color-brand); }
    .advanced { border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: 12px 16px; display: flex; flex-direction: column; gap: 14px; }
    .advanced[open] { padding-bottom: 16px; }
    .advanced summary { cursor: pointer; font-weight: 600; font-size: 13.5px; }
    .advanced > * + * { margin-top: 14px; }
    .server-row { display: flex; gap: 10px; }
    .grow { flex: 1; }
    .port { width: 96px; flex-shrink: 0; }

    .spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 768px) {
      .section-card { padding: 20px; }
      .connect-row { grid-template-columns: 1fr; }
      .acc-head { flex-wrap: wrap; }
      .drawer-header, .drawer-scroll, .drawer-footer { padding-left: 16px; padding-right: 16px; }
      .drawer-footer .btn { flex: 1; justify-content: center; }
    }
  `],
})
export class EmailSettingsComponent implements OnInit, OnDestroy {
  private api = inject(EmailAccountsApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly Mail = Mail; readonly Plus = Plus; readonly Trash2 = Trash2; readonly Pencil = Pencil;
  readonly RefreshCw = RefreshCw; readonly CheckCircle2 = CheckCircle2; readonly AlertTriangle = AlertTriangle;
  readonly Loader2 = Loader2; readonly Star = Star; readonly Eye = Eye; readonly EyeOff = EyeOff;
  readonly X = X; readonly Server = Server; readonly Save = Save; readonly Pause = Pause; readonly Play = Play;

  readonly presets = EMAIL_PRESETS;

  accounts = signal<EmailAccount[]>([]);
  loading = signal(true);
  providers = signal({ gmail: false, outlook: false });
  redirecting = signal(false);
  testing = signal<string | null>(null);

  form = signal<EmailAccountForm | null>(null);
  editing = signal<EmailAccount | null>(null);
  preset = signal<EmailPreset | null>(null);
  saving = signal(false);
  showPass = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit() {
    this.load();
    this.api.providers().subscribe({ next: p => this.providers.set(p), error: () => {} });
    this.handleOAuthReturn();
  }

  ngOnDestroy() { if (this.timer) clearTimeout(this.timer); }

  @HostListener('document:keydown.escape')
  onEsc() { if (this.form()) this.closeForm(); }

  load() {
    if (this.timer) clearTimeout(this.timer);
    this.api.list().subscribe({
      next: list => {
        this.accounts.set(list);
        this.loading.set(false);
        // Mientras un buzón se conecta, el estado se refresca solo.
        if (list.some(a => a.active && a.status === 'connecting')) this.timer = setTimeout(() => this.load(), 5000);
      },
      error: () => this.loading.set(false),
    });
  }

  /** Vuelta del callback de Google/Microsoft (ver email-accounts.controller.ts). */
  private handleOAuthReturn() {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('email_oauth');
    if (!result) return;
    if (result === 'success') this.toast.success(`Buzón ${params.get('email') ?? ''} conectado`.replace('  ', ' '));
    else this.toast.error(params.get('reason') || 'No se pudo conectar el correo');
    for (const k of ['email_oauth', 'email', 'reason']) params.delete(k);
    const query = params.toString();
    history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
  }

  providerLabel(a: EmailAccount) {
    if (a.provider === 'gmail') return 'Gmail';
    if (a.provider === 'outlook') return 'Outlook';
    return `${a.incomingProtocol.toUpperCase()} · ${a.incomingHost ?? ''}`;
  }

  connect(provider: 'gmail' | 'outlook') {
    this.redirecting.set(true);
    this.api.startOAuth(provider).subscribe({
      next: r => { window.location.href = r.url; },
      error: (err: { error?: { message?: string } }) => {
        this.redirecting.set(false);
        this.toast.error(err.error?.message || 'No se pudo iniciar la conexión');
      },
    });
  }

  isOAuth() { const e = this.editing(); return !!e && e.provider !== 'custom'; }

  openForm(a?: EmailAccount) {
    this.showPass.set(false);
    this.preset.set(null);
    if (a) {
      this.editing.set(a);
      this.form.set({
        ...blankEmailForm(),
        label: a.label, email: a.email, fromName: a.fromName ?? '', signature: a.signature ?? '',
        incomingProtocol: a.incomingProtocol, incomingHost: a.incomingHost ?? '', incomingPort: a.incomingPort ?? 993,
        incomingSecure: a.incomingSecure, smtpHost: a.smtpHost ?? '', smtpPort: a.smtpPort ?? 465,
        smtpSecure: a.smtpSecure, username: a.username ?? '', skipBulk: a.skipBulk,
      });
    } else {
      this.editing.set(null);
      this.form.set(blankEmailForm());
    }
  }

  closeForm() { this.form.set(null); this.editing.set(null); }

  applyPreset(p: EmailPreset) {
    const f = this.form();
    if (!f) return;
    this.preset.set(p);
    const [inHost, inPort] = f.incomingProtocol === 'imap' ? p.imap : p.pop3;
    this.form.set({
      ...f, incomingHost: inHost, incomingPort: inPort, incomingSecure: true,
      smtpHost: p.smtp[0], smtpPort: p.smtp[1], smtpSecure: p.smtp[2],
      label: f.label || p.label,
    });
  }

  setProtocol(protocol: 'imap' | 'pop3') {
    const f = this.form();
    if (!f) return;
    const p = this.preset();
    const [host, port] = p ? (protocol === 'imap' ? p.imap : p.pop3) : [f.incomingHost, protocol === 'imap' ? 993 : 995];
    this.form.set({ ...f, incomingProtocol: protocol, incomingHost: host, incomingPort: port });
  }

  save() {
    const f = this.form();
    if (!f) return;
    const editing = this.editing();
    if (!f.label.trim()) { this.toast.error('Ponle un nombre al buzón'); return; }
    if (!editing && (!f.email.trim() || !f.password)) { this.toast.error('Escribe el correo y la contraseña'); return; }
    if (!this.isOAuth() && (!f.incomingHost.trim() || !f.smtpHost.trim())) { this.toast.error('Faltan los servidores de entrada y salida'); return; }

    this.saving.set(true);
    const common = { label: f.label.trim(), fromName: f.fromName.trim(), signature: f.signature, skipBulk: f.skipBulk };
    const server = {
      incomingProtocol: f.incomingProtocol, incomingHost: f.incomingHost.trim(), incomingPort: Number(f.incomingPort),
      incomingSecure: f.incomingSecure, smtpHost: f.smtpHost.trim(), smtpPort: Number(f.smtpPort), smtpSecure: f.smtpSecure,
      username: f.username.trim(),
    };
    const req = !editing
      ? this.api.create({ ...f, ...common, ...server, email: f.email.trim() })
      : this.isOAuth()
        ? this.api.update(editing._id, common)
        : this.api.update(editing._id, { ...common, ...server, ...(f.password ? { password: f.password } : {}) });
    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(editing ? 'Buzón actualizado' : 'Buzón conectado: ya se están escuchando los correos');
        this.closeForm();
        this.load();
      },
      error: (err: { error?: { message?: string | string[] } }) => {
        this.saving.set(false);
        const m = err.error?.message;
        this.toast.error((Array.isArray(m) ? m[0] : m) || 'No se pudo guardar el buzón');
      },
    });
  }

  test(a: EmailAccount) {
    this.testing.set(a._id);
    this.api.test(a._id).subscribe({
      next: r => {
        this.testing.set(null);
        if (r.ok) this.toast.success('Conexión correcta: se puede recibir y enviar');
        else this.toast.error(r.error || 'La conexión falló');
      },
      error: (err: { error?: { message?: string } }) => { this.testing.set(null); this.toast.error(err.error?.message || 'No se pudo probar'); },
    });
  }

  makeDefault(a: EmailAccount) {
    this.api.setDefault(a._id).subscribe({
      next: () => { this.toast.success(`${a.label} es ahora el buzón predeterminado`); this.load(); },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'No se pudo cambiar'),
    });
  }

  toggleActive(a: EmailAccount) {
    this.api.update(a._id, { active: !a.active }).subscribe({
      next: () => { this.toast.success(a.active ? 'Buzón pausado' : 'Buzón reanudado'); this.load(); },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'No se pudo cambiar'),
    });
  }

  async remove(a: EmailAccount) {
    const ok = await this.confirm.confirm({
      title: 'Eliminar buzón',
      message: `¿Desconectar ${a.email}? Las conversaciones ya recibidas se conservan, pero no llegarán correos nuevos.`,
      confirmText: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    this.api.remove(a._id).subscribe({
      next: () => { this.toast.success('Buzón eliminado'); this.load(); },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'No se pudo eliminar'),
    });
  }
}
