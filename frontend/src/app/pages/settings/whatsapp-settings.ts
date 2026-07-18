import { Component, inject, signal, computed, OnInit, OnDestroy, HostListener, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, MessageSquare, CheckCircle2, RefreshCw, Save, WifiOff,
  QrCode, Eye, EyeOff, Plus, Trash2, Smartphone, Pencil, Star, Webhook, Link,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { AccountsApiService } from '../../core/api/accounts-api.service';
import { WaAccount, WaStatus, WaTestResult, blankWaAccount } from '../../shared/models/accounts.model';

declare const FB: any;

@Component({
  selector: 'app-whatsapp-settings',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, DatePipe],
  template: `
    <!-- WhatsApp Accounts Card -->
    <div class="section-card">
      <div class="section-header">
        <div class="section-icon">
          <lucide-icon [img]="MessageSquare" [size]="22" style="color: #16A34A;"></lucide-icon>
        </div>
        <div>
          <h2 class="section-title">WhatsApp</h2>
          <p class="section-desc">Conecta uno o varios números vía WAHA o Cloud API. La cuenta predeterminada se usa para campañas y envíos.</p>
        </div>
      </div>

      @if (!accForm()) {
        <button class="btn btn-primary" style="margin-bottom:20px" [disabled]="connectingWa()" (click)="connectWhatsApp()">
          <lucide-icon [img]="Smartphone" [size]="16"></lucide-icon>
          {{ connectingWa() ? 'Conectando…' : 'Conectar con WhatsApp' }}
        </button>

        <div class="field" style="max-width: 260px; margin-bottom: 20px;">
          <label class="label">Límite diario de mensajes</label>
          <input class="input" type="number" [(ngModel)]="dailyLimit" min="1" max="500" placeholder="50"
            (change)="saveDailyLimit()" />
          <span class="field-hint">Aplica a todo el tenant. 50 para números nuevos, hasta 150 con historial.</span>
        </div>

        @if (accountsLoading()) {
          <div class="loading-row">
            <lucide-icon [img]="RefreshCw" [size]="20" class="spin"></lucide-icon> Cargando cuentas…
          </div>
        } @else if (accounts().length === 0) {
          <div class="empty-accounts">
            <lucide-icon [img]="Smartphone" [size]="28" [strokeWidth]="1.5" style="color: var(--color-text-muted);"></lucide-icon>
            <p>Aún no hay cuentas de WhatsApp.</p>
          </div>
        } @else {
          <div class="acc-list">
            @for (acc of accounts(); track acc._id) {
              <div class="acc-card">
                <div class="acc-card-head">
                  <div class="acc-id">
                    <span class="account-label">{{ acc.label }}</span>
                    @if (acc.isDefault) {
                      <span class="badge-default"><lucide-icon [img]="Star" [size]="11"></lucide-icon> Predeterminada</span>
                    }
                    <span class="account-sub">{{ acc.provider === 'waha' ? 'WAHA' : 'Cloud API' }}{{ acc.phoneNumber ? ' · ' + acc.phoneNumber : '' }}</span>
                  </div>
                  <div class="acc-card-actions">
                    @if (!acc.isDefault) {
                      <button class="btn btn-sm btn-ghost btn-icon" (click)="setDefault(acc)" title="Marcar como predeterminada">
                        <lucide-icon [img]="Star" [size]="14"></lucide-icon>
                      </button>
                    }
                    @if (acc.tokenExpiresAt) {
                      <button class="btn btn-sm btn-ghost btn-icon" (click)="renewWaToken(acc)" title="Renovar token">
                        <lucide-icon [img]="RefreshCw" [size]="14" style="color: var(--color-brand);"></lucide-icon>
                      </button>
                    }
                    @if (acc.provider === 'cloudapi') {
                      <button class="btn btn-sm btn-ghost btn-icon" (click)="configureWebhook(acc)" [disabled]="webhookLoading() === acc._id" title="Suscribir webhook">
                        <lucide-icon [img]="Link" [size]="14" [class.spin]="webhookLoading() === acc._id"></lucide-icon>
                      </button>
                    }
                    <button class="btn btn-sm btn-ghost btn-icon" (click)="checkStatus(acc)" title="Verificar estado">
                      <lucide-icon [img]="RefreshCw" [size]="14"></lucide-icon>
                    </button>
                    @if (acc.provider === 'waha') {
                      <button class="btn btn-sm btn-ghost btn-icon" (click)="toggleQr(acc)" title="Conectar (QR)">
                        <lucide-icon [img]="QrCode" [size]="14"></lucide-icon>
                      </button>
                      <button class="btn btn-sm btn-ghost btn-icon" (click)="configureWebhook(acc)" [disabled]="webhookLoading() === acc._id" title="Reconfigurar webhook">
                        <lucide-icon [img]="Webhook" [size]="14" [class.spin]="webhookLoading() === acc._id"></lucide-icon>
                      </button>
                    }
                    <button class="btn btn-sm btn-ghost btn-icon" (click)="toggleTest(acc)" title="Probar envío">
                      <lucide-icon [img]="MessageSquare" [size]="14"></lucide-icon>
                    </button>
                    <button class="btn btn-sm btn-ghost btn-icon" (click)="editAccount(acc)" title="Editar">
                      <lucide-icon [img]="Pencil" [size]="14"></lucide-icon>
                    </button>
                    <button class="btn btn-sm btn-ghost btn-icon" (click)="deleteAccount(acc)" title="Eliminar">
                      <lucide-icon [img]="Trash2" [size]="14" style="color: var(--color-error);"></lucide-icon>
                    </button>
                  </div>
                </div>

                @if (statusMap()[acc._id]) {
                  <div class="acc-status" [class.ok]="statusMap()[acc._id].connected">
                    @if (statusMap()[acc._id].connected) {
                      <lucide-icon [img]="CheckCircle2" [size]="13"></lucide-icon> Conectado
                    } @else {
                      <lucide-icon [img]="WifiOff" [size]="13"></lucide-icon> Desconectado
                    }
                    {{ statusMap()[acc._id].state ? '· ' + statusMap()[acc._id].state : '' }}
                    {{ statusMap()[acc._id].error || '' }}
                  </div>
                }

                @if (acc.tokenExpiresAt) {
                  <div class="webhook-hint">
                    <span>Token vence:</span> {{ acc.tokenExpiresAt | date:'d MMM y' }}
                  </div>
                }

                <!-- QR panel -->
                @if (qrActiveId() === acc._id) {
                  <div class="acc-panel">
                    <p class="panel-hint">WhatsApp → Dispositivos vinculados → Vincular un dispositivo → escanea:</p>
                    @if (qrLoading()) {
                      <div class="qr-placeholder">
                        <lucide-icon [img]="RefreshCw" [size]="28" class="spin" style="color: var(--color-text-muted);"></lucide-icon>
                      </div>
                    } @else if (qrMap()[acc._id]) {
                      <img [src]="qrMap()[acc._id]" alt="QR WhatsApp" class="qr-image" />
                    } @else if (qrError()) {
                      <div class="error-box">{{ qrError() }}</div>
                    }
                    <button class="btn btn-secondary btn-sm" (click)="loadQr(acc)" style="margin-top: 12px;">
                      <lucide-icon [img]="RefreshCw" [size]="13"></lucide-icon> Actualizar QR
                    </button>
                  </div>
                }

                <!-- Test panel -->
                @if (testActiveId() === acc._id) {
                  <div class="acc-panel">
                    <div class="test-row">
                      <input class="input" [(ngModel)]="testPhone" placeholder="51999999999 (con código de país)" style="flex:1" />
                      <button class="btn btn-secondary btn-sm" (click)="testAccount(acc)" [disabled]="testLoading()">
                        @if (testLoading()) { <lucide-icon [img]="RefreshCw" [size]="13" class="spin"></lucide-icon> }
                        @else { <lucide-icon [img]="MessageSquare" [size]="13"></lucide-icon> }
                        Enviar prueba
                      </button>
                    </div>
                    @if (testResult()) {
                      <div [class]="testResult()!.success ? 'success-box' : 'error-box'" style="margin-top:10px;font-size:13px">
                        @if (testResult()!.success) { ✅ Enviado a {{ testResult()!.formattedPhone }}&#64;c.us }
                        @else { ❌ {{ testResult()!.error }} }
                      </div>
                    }
                  </div>
                }

                <div class="webhook-hint">
                  <span>Webhook entrante:</span>
                  <code>{{ webhookUrl(acc) }}</code>
                </div>
              </div>
            }
          </div>
        }

        <button class="btn btn-ghost" style="margin-top: 16px;" (click)="newAccount()">
          <lucide-icon [img]="Plus" [size]="16"></lucide-icon> Añadir manualmente (WAHA / avanzado)
        </button>
      } @else {
        <!-- Account form -->
        <div class="fields-grid">
          <div class="field">
            <label class="label">Nombre de la cuenta *</label>
            <input class="input" [(ngModel)]="accForm()!.label" placeholder="Ej: Línea Reservas" />
          </div>
          <div class="field">
            <label class="label">Proveedor *</label>
            <select class="select" [(ngModel)]="accForm()!.provider">
              <option value="waha">WAHA</option>
              <option value="cloudapi">WhatsApp Cloud API</option>
            </select>
          </div>
          <div class="field">
            <label class="label">Número (informativo)</label>
            <input class="input" [(ngModel)]="accForm()!.phoneNumber" placeholder="+51 999 999 999" />
          </div>

          @if (accForm()!.provider === 'waha') {
            <div class="field">
              <label class="label">URL de WAHA *</label>
              <input class="input" [(ngModel)]="accForm()!.wahaApiUrl" placeholder="https://waha.midominio.com" />
            </div>
            <div class="field">
              <label class="label">API Key</label>
              <div class="input-wrap">
                <input class="input" [type]="showKey() ? 'text' : 'password'" [(ngModel)]="accForm()!.wahaApiKey" placeholder="X-Api-Key" />
                <button class="eye-btn" (click)="showKey.set(!showKey())" type="button">
                  <lucide-icon [img]="showKey() ? EyeOff : Eye" [size]="16"></lucide-icon>
                </button>
              </div>
            </div>
            <div class="field">
              <label class="label">Nombre de sesión</label>
              <input class="input" [(ngModel)]="accForm()!.wahaSession" placeholder="default" />
            </div>
          } @else {
            <div class="field">
              <label class="label">Phone Number ID *</label>
              <input class="input" [(ngModel)]="accForm()!.waPhoneNumberId" placeholder="1234567890" />
            </div>
            <div class="field">
              <label class="label">Access Token *</label>
              <div class="input-wrap">
                <input class="input" [type]="showToken() ? 'text' : 'password'" [(ngModel)]="accForm()!.waAccessToken" placeholder="EAAG…" />
                <button class="eye-btn" (click)="showToken.set(!showToken())" type="button">
                  <lucide-icon [img]="showToken() ? EyeOff : Eye" [size]="16"></lucide-icon>
                </button>
              </div>
            </div>
            <div class="field">
              <label class="label">WhatsApp Business Account ID</label>
              <input class="input" [(ngModel)]="accForm()!.waBusinessAccountId" placeholder="(opcional, para plantillas)" />
            </div>
            <div class="field">
              <label class="label">Verify Token (webhook)</label>
              <input class="input" [(ngModel)]="accForm()!.waVerifyToken" placeholder="token-secreto-para-meta" />
            </div>
          }
        </div>

        <div class="section-footer" style="justify-content: space-between;">
          <button class="btn btn-ghost" (click)="accForm.set(null)">Cancelar</button>
          <button class="btn btn-primary" [disabled]="savingAcc()" (click)="saveAccount()">
            <lucide-icon [img]="Save" [size]="16"></lucide-icon>
            {{ savingAcc() ? 'Guardando…' : 'Guardar cuenta' }}
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    .section-card { background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 28px 32px; margin-bottom: 24px; }
    .section-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .section-icon { width: 44px; height: 44px; border-radius: var(--radius-lg); background: #F0FDF4; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .section-title { font-family: var(--font-heading); font-size: 17px; font-weight: 700; margin: 0 0 2px; }
    .section-desc { font-size: 13px; color: var(--color-text-muted); margin: 0; }

    .fields-grid { display: flex; flex-direction: column; gap: 20px; }
    .field { display: flex; flex-direction: column; gap: 6px; }
    .label { font-size: 13px; font-weight: 600; color: var(--color-text-main); }
    .field-hint { font-size: 12px; color: var(--color-text-muted); }

    .input-wrap { position: relative; display: flex; }
    .input-wrap .input { padding-right: 44px; flex: 1; }
    .eye-btn { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--color-text-muted); display: flex; align-items: center; }
    .eye-btn:hover { color: var(--color-text-main); }

    .loading-row { display: flex; align-items: center; gap: 10px; color: var(--color-text-muted); font-size: 14px; padding: 12px 0; }
    .empty-accounts { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 32px; color: var(--color-text-muted); font-size: 14px; }

    /* Account cards */
    .acc-list { display: flex; flex-direction: column; gap: 14px; }
    .acc-card { border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 18px 20px; }
    .acc-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .acc-id { display: flex; flex-direction: column; gap: 3px; }
    .account-label { font-weight: 700; font-size: 15px; color: var(--color-text-main); }
    .account-sub { font-size: 12px; color: var(--color-text-muted); }
    .badge-default { display: inline-flex; align-items: center; gap: 4px; width: fit-content; background: #FEF9C3; color: #854D0E; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: var(--radius-pill); }
    .acc-card-actions { display: flex; gap: 2px; flex-shrink: 0; }
    .acc-status { display: inline-flex; align-items: center; gap: 6px; margin-top: 12px; font-size: 12px; font-weight: 600; color: var(--color-error); }
    .acc-status.ok { color: #16A34A; }

    .acc-panel { margin-top: 14px; padding: 16px; background: var(--color-bg-app); border-radius: var(--radius-lg); }
    .panel-hint { font-size: 12px; color: var(--color-text-muted); margin: 0 0 12px; }
    .test-row { display: flex; align-items: center; gap: 8px; }
    .qr-placeholder { width: 220px; height: 220px; border: 2px dashed var(--color-border); border-radius: var(--radius-lg); display: flex; align-items: center; justify-content: center; }
    .qr-image { width: 220px; height: 220px; border-radius: var(--radius-lg); border: 4px solid var(--color-white); box-shadow: var(--shadow-lg); }

    .webhook-hint { margin-top: 14px; font-size: 11px; color: var(--color-text-muted); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .webhook-hint code { background: var(--color-bg-app); padding: 3px 8px; border-radius: 6px; font-size: 11px; word-break: break-all; }

    .error-box { padding: 12px 16px; background: #FEF2F2; border: 1px solid #FECACA; border-radius: var(--radius-lg); font-size: 13px; color: var(--color-error); }
    .success-box { display: flex; align-items: center; gap: 10px; padding: 14px 18px; background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: var(--radius-lg); font-size: 14px; color: #15803D; }

    .section-footer { display: flex; align-items: center; justify-content: flex-end; margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--color-border); }

    @keyframes spin { to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; display: inline-block; }

    @media (max-width: 768px) {
      .section-card { padding: 20px; }
      .section-header { gap: 12px; margin-bottom: 20px; }
      .acc-card { padding: 14px 16px; }
      .acc-card-head { flex-wrap: wrap; }
      .acc-card-actions { flex-wrap: wrap; justify-content: flex-start; }
      .test-row { flex-direction: column; align-items: stretch; }
      .section-footer { flex-wrap: wrap; gap: 10px; }
      .section-footer > .btn { flex: 1; justify-content: center; }
      .qr-image, .qr-placeholder { max-width: 100%; height: auto; aspect-ratio: 1 / 1; }
    }

    @media (max-width: 480px) {
      .section-card { padding: 16px; margin-bottom: 16px; }
      .section-card > .btn { width: 100%; justify-content: center; }
      .fields-grid { gap: 14px; }
    }
  `],
})
export class WhatsappSettingsComponent implements OnInit, OnDestroy {
  private api = inject(AccountsApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly MessageSquare = MessageSquare;
  readonly CheckCircle2 = CheckCircle2;
  readonly RefreshCw = RefreshCw;
  readonly Save = Save;
  readonly WifiOff = WifiOff;
  readonly QrCode = QrCode;
  readonly Eye = Eye;
  readonly EyeOff = EyeOff;
  readonly Plus = Plus;
  readonly Trash2 = Trash2;
  readonly Smartphone = Smartphone;
  readonly Pencil = Pencil;
  readonly Star = Star;
  readonly Webhook = Webhook;
  readonly Link = Link;

  /** Emite el provider de la cuenta predeterminada ('' si no hay) tras cada carga de cuentas. */
  defaultProviderChange = output<string>();

  /** Emite cuántas cuentas Cloud API activas hay vinculadas tras cada carga de cuentas. */
  cloudAccountsChange = output<number>();

  // Accounts
  accounts = signal<WaAccount[]>([]);
  accountsLoading = signal(false);
  accForm = signal<WaAccount | null>(null);
  savingAcc = signal(false);
  connectingWa = signal(false);
  statusMap = signal<Record<string, WaStatus>>({});

  private fbSdkPromise: Promise<void> | null = null;
  private waSignupData: { wabaId: string; phoneNumberId: string } | null = null;
  private waMessageListener = (event: MessageEvent) => {
    if (!event.origin.endsWith('facebook.com')) return;
    try {
      // El SDK a veces manda event.data ya parseado (objeto) y a veces como string JSON.
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
      if (data.event === 'FINISH' || data.event === 'FINISH_ONLY_WABA') {
        const wabaId = data.data?.waba_id ?? data.data?.business_id;
        const phoneNumberId = data.data?.phone_number_id;
        if (wabaId && phoneNumberId) {
          this.waSignupData = { wabaId, phoneNumberId };
        } else {
          console.warn('WA_EMBEDDED_SIGNUP FINISH sin waba_id/phone_number_id:', data);
        }
      } else {
        console.warn('WA_EMBEDDED_SIGNUP evento no manejado:', data);
      }
    } catch (err) {
      console.warn('No se pudo parsear mensaje de Embedded Signup:', event.data, err);
    }
  };

  qrMap = signal<Record<string, string>>({});
  qrActiveId = signal('');
  qrLoading = signal(false);
  qrError = signal('');
  testActiveId = signal('');
  testPhone = '';
  testLoading = signal(false);
  testResult = signal<WaTestResult | null>(null);
  showKey = signal(false);
  showToken = signal(false);
  webhookLoading = signal('');

  defaultProvider = computed(() => this.accounts().find(a => a.isDefault)?.provider ?? '');

  // Daily limit
  dailyLimit = 50;

  private statusInterval: ReturnType<typeof setInterval> | null = null;

  ngOnInit() {
    this.loadConfig();
    this.loadAccounts();
    window.addEventListener('message', this.waMessageListener);
  }

  ngOnDestroy() {
    this.stopPolling();
    window.removeEventListener('message', this.waMessageListener);
  }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.accForm()) this.accForm.set(null);
  }

  // ---- Config (daily limit) ----
  loadConfig() {
    this.api.getSettings().subscribe({
      next: (cfg) => {
        if (!cfg) return;
        this.dailyLimit = cfg.waDailyLimit ?? 50;
      },
      error: () => {},
    });
  }

  saveDailyLimit() {
    this.api.updateSettings({ waDailyLimit: Number(this.dailyLimit) || 50 }).subscribe({
      next: () => this.toast.success('Límite diario guardado'),
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'Error al guardar'),
    });
  }

  // ---- Accounts ----
  loadAccounts() {
    this.accountsLoading.set(true);
    this.api.getWaAccounts().subscribe({
      next: (a) => {
        this.accounts.set(a);
        this.accountsLoading.set(false);
        this.defaultProviderChange.emit(this.defaultProvider());
        this.cloudAccountsChange.emit(
          a.filter((x) => x.provider === 'cloudapi' && x.active).length,
        );
      },
      error: () => this.accountsLoading.set(false),
    });
  }

  newAccount() { this.accForm.set(blankWaAccount()); this.showKey.set(false); this.showToken.set(false); }
  editAccount(a: WaAccount) { this.accForm.set({ ...a }); this.showKey.set(false); this.showToken.set(false); }

  webhookUrl(a: WaAccount): string {
    return this.api.waWebhookUrl(a);
  }

  saveAccount() {
    const acc = this.accForm();
    if (!acc) return;
    if (!acc.label.trim()) { this.toast.error('El nombre es obligatorio'); return; }
    this.savingAcc.set(true);
    const { _id, ...body } = acc;
    const req = _id
      ? this.api.updateWaAccount(_id, body)
      : this.api.createWaAccount(body);
    req.subscribe({
      next: () => { this.toast.success('Cuenta guardada'); this.savingAcc.set(false); this.accForm.set(null); this.loadAccounts(); },
      error: (err: { error?: { message?: string } }) => { this.toast.error(err.error?.message || 'Error al guardar'); this.savingAcc.set(false); },
    });
  }

  async deleteAccount(a: WaAccount) {
    const ok = await this.confirm.confirm({ title: 'Eliminar cuenta', message: `¿Eliminar la cuenta "${a.label}"?`, confirmText: 'Eliminar', danger: true });
    if (!ok) return;
    this.api.deleteWaAccount(a._id).subscribe({
      next: () => { this.toast.success('Cuenta eliminada'); this.loadAccounts(); },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'Error al eliminar'),
    });
  }

  setDefault(a: WaAccount) {
    this.api.setDefaultWaAccount(a._id).subscribe({
      next: () => { this.toast.success(`"${a.label}" es ahora la cuenta predeterminada`); this.loadAccounts(); },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'Error'),
    });
  }

  configureWebhook(a: WaAccount) {
    this.webhookLoading.set(a._id);
    this.api.configureWaWebhook(a._id).subscribe({
      next: (r) => {
        this.webhookLoading.set('');
        if (r.success) this.toast.success(r.message);
        else this.toast.error(r.message);
      },
      error: (err: { error?: { message?: string } }) => { this.webhookLoading.set(''); this.toast.error(err.error?.message || 'Error al configurar webhook'); },
    });
  }

  checkStatus(a: WaAccount) {
    this.api.getWaStatus(a._id).subscribe({
      next: (s) => this.statusMap.update(m => ({ ...m, [a._id]: s })),
      error: (err: { error?: { message?: string } }) => this.statusMap.update(m => ({ ...m, [a._id]: { connected: false, error: err.error?.message || 'Error' } })),
    });
  }

  toggleQr(a: WaAccount) {
    if (this.qrActiveId() === a._id) { this.qrActiveId.set(''); this.stopPolling(); return; }
    this.testActiveId.set('');
    this.qrActiveId.set(a._id);
    this.loadQr(a);
    this.startPolling(a);
  }

  loadQr(a: WaAccount) {
    this.qrLoading.set(true);
    this.qrError.set('');
    this.api.getWaQr(a._id).subscribe({
      next: (r) => {
        this.qrLoading.set(false);
        if (r.qrcode) {
          const src = r.qrcode.startsWith('data:') ? r.qrcode : `data:image/png;base64,${r.qrcode}`;
          this.qrMap.update(m => ({ ...m, [a._id]: src }));
        } else {
          this.qrError.set(r.error ?? 'No se pudo obtener el QR');
        }
      },
      error: () => { this.qrLoading.set(false); this.qrError.set('Error al conectar con WAHA'); },
    });
  }

  toggleTest(a: WaAccount) {
    if (this.testActiveId() === a._id) { this.testActiveId.set(''); return; }
    this.qrActiveId.set('');
    this.stopPolling();
    this.testActiveId.set(a._id);
    this.testResult.set(null);
  }

  testAccount(a: WaAccount) {
    if (!this.testPhone.trim()) { this.toast.error('Ingresa un número'); return; }
    this.testLoading.set(true);
    this.testResult.set(null);
    this.api.testWaAccount(a._id, this.testPhone).subscribe({
      next: (r) => { this.testResult.set(r); this.testLoading.set(false); },
      error: (err: { error?: { message?: string } }) => { this.testResult.set({ success: false, formattedPhone: this.testPhone, error: err.error?.message || 'Error de red' }); this.testLoading.set(false); },
    });
  }

  private startPolling(a: WaAccount) {
    this.stopPolling();
    this.statusInterval = setInterval(() => {
      this.checkStatus(a);
      if (this.statusMap()[a._id]?.connected) { this.stopPolling(); return; }
      if (this.qrActiveId() === a._id) this.loadQr(a);
    }, 10000);
  }

  private stopPolling() {
    if (this.statusInterval) { clearInterval(this.statusInterval); this.statusInterval = null; }
  }

  renewWaToken(a: WaAccount) {
    this.api.refreshWaToken(a._id).subscribe({
      next: () => { this.toast.success('Token renovado'); this.loadAccounts(); },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'No se pudo renovar el token'),
    });
  }

  /** Carga el SDK de JavaScript de Facebook una sola vez (memoizado). */
  private loadFacebookSdk(appId: string): Promise<void> {
    if (this.fbSdkPromise) return this.fbSdkPromise;
    this.fbSdkPromise = new Promise((resolve) => {
      const w = window as any;
      if (w.FB) { w.FB.init({ appId, xfbml: true, version: 'v21.0' }); resolve(); return; }
      w.fbAsyncInit = () => { w.FB.init({ appId, xfbml: true, version: 'v21.0' }); resolve(); };
      const script = document.createElement('script');
      script.src = 'https://connect.facebook.net/en_US/sdk.js';
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    });
    return this.fbSdkPromise;
  }

  connectWhatsApp() {
    this.connectingWa.set(true);
    this.waSignupData = null;
    this.api.getWaOauthConfig().subscribe({
      next: async (cfg) => {
        if (!cfg.appId || !cfg.configId) {
          this.toast.error('La conexión con WhatsApp no está configurada en el servidor');
          this.connectingWa.set(false);
          return;
        }
        await this.loadFacebookSdk(cfg.appId);
        FB.login((response: any) => {
          if (response?.authResponse?.code) {
            this.finishWaConnect(response.authResponse.code);
          } else {
            this.connectingWa.set(false);
          }
        }, {
          config_id: cfg.configId,
          response_type: 'code',
          override_default_response_type: true,
        });
      },
      error: (err: { error?: { message?: string } }) => {
        this.toast.error(err.error?.message || 'No se pudo iniciar la conexión con WhatsApp');
        this.connectingWa.set(false);
      },
    });
  }

  /** El postMessage con waba_id/phone_number_id puede llegar varios segundos después del callback de FB.login. */
  private finishWaConnect(code: string, attempt = 0) {
    if (!this.waSignupData && attempt < 100) {
      setTimeout(() => this.finishWaConnect(code, attempt + 1), 100);
      return;
    }
    if (!this.waSignupData) {
      this.toast.error('No se recibió la información de la cuenta de WhatsApp. Intenta de nuevo.');
      this.connectingWa.set(false);
      return;
    }
    this.api.connectWaOauth({
      code, wabaId: this.waSignupData.wabaId, phoneNumberId: this.waSignupData.phoneNumberId,
    }).subscribe({
      next: () => {
        this.toast.success('Cuenta de WhatsApp conectada');
        this.connectingWa.set(false);
        this.loadAccounts();
      },
      error: (err: { error?: { message?: string } }) => {
        this.toast.error(err.error?.message || 'No se pudo conectar la cuenta de WhatsApp');
        this.connectingWa.set(false);
      },
    });
  }
}
