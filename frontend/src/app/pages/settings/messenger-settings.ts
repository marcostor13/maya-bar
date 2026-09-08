import { Component, inject, signal, OnInit, HostListener } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, CheckCircle2, RefreshCw, Save, WifiOff,
  Eye, EyeOff, Plus, Trash2, Pencil, Facebook, Link, Copy,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { AccountsApiService } from '../../core/api/accounts-api.service';
import { MsAccount, MsStatus, WebhookConfig, blankMsAccount } from '../../shared/models/accounts.model';

@Component({
  selector: 'app-messenger-settings',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, DatePipe],
  template: `
    <!-- Messenger Accounts Card -->
    <div class="section-card">
      <div class="section-header">
        <div class="section-icon" style="background: #E0EAFF;">
          <lucide-icon [img]="Facebook" [size]="22" style="color: #0866FF;"></lucide-icon>
        </div>
        <div>
          <h2 class="section-title">Messenger</h2>
          <p class="section-desc">Conecta las páginas de Facebook cuyos mensajes quieres atender. Estas cuentas quedan disponibles para los agentes de IA.</p>
        </div>
      </div>

      @if (!msAccForm()) {
        <button class="btn btn-primary" style="margin-bottom:16px" [disabled]="connectingMs()" (click)="connectMessenger()">
          <lucide-icon [img]="Facebook" [size]="16"></lucide-icon>
          {{ connectingMs() ? 'Redirigiendo…' : 'Conectar con Facebook' }}
        </button>

        <div class="webhook-box">
          <div class="webhook-box-title">
            <lucide-icon [img]="Link" [size]="14"></lucide-icon>
            Webhook de la app (Meta → App Dashboard → Messenger → Webhooks)
          </div>
          <div class="webhook-hint">
            <span>URL de devolución de llamada:</span>
            <code>{{ msWebhookUrl() }}</code>
            <button class="btn btn-sm btn-ghost btn-icon" (click)="copy(msWebhookUrl(), 'URL del webhook copiada')" title="Copiar URL del webhook">
              <lucide-icon [img]="Copy" [size]="13"></lucide-icon>
            </button>
          </div>
          <div class="webhook-hint">
            <span>Token de verificación:</span>
            <code>{{ msWebhookConfig().verifyToken || '(falta MESSENGER_VERIFY_TOKEN en el servidor)' }}</code>
            @if (msWebhookConfig().verifyToken) {
              <button class="btn btn-sm btn-ghost btn-icon" (click)="copy(msWebhookConfig().verifyToken!, 'Verify token copiado')" title="Copiar verify token">
                <lucide-icon [img]="Copy" [size]="13"></lucide-icon>
              </button>
            }
          </div>
          <span class="field-hint">Se configura una sola vez en Meta y aplica a todas las páginas conectadas.</span>
        </div>

        @if (msAccountsLoading()) {
          <div class="loading-row">
            <lucide-icon [img]="RefreshCw" [size]="20" class="spin"></lucide-icon> Cargando cuentas…
          </div>
        } @else if (msAccounts().length === 0) {
          <div class="empty-accounts">
            <lucide-icon [img]="Facebook" [size]="28" [strokeWidth]="1.5" style="color: var(--color-text-muted);"></lucide-icon>
            <p>Aún no hay páginas de Facebook conectadas.</p>
          </div>
        } @else {
          <div class="acc-list">
            @for (acc of msAccounts(); track acc._id) {
              <div class="acc-card">
                <div class="acc-card-head">
                  <div class="acc-id">
                    <span class="account-label">{{ acc.label }}</span>
                    <span class="account-sub">{{ acc.username ? '@' + acc.username : 'Messenger' }}</span>
                    <span class="account-sub">Page ID: {{ acc.pageId || '(sin ID)' }}</span>
                  </div>
                  <div class="acc-card-actions">
                    <button class="btn btn-sm btn-ghost btn-icon" (click)="subscribeMsWebhook(acc)" title="Suscribir webhook">
                      <lucide-icon [img]="Link" [size]="14"></lucide-icon>
                    </button>
                    <button class="btn btn-sm btn-ghost btn-icon" (click)="checkMsStatus(acc)" title="Verificar estado">
                      <lucide-icon [img]="RefreshCw" [size]="14"></lucide-icon>
                    </button>
                    <button class="btn btn-sm btn-ghost btn-icon" (click)="editMsAccount(acc)" title="Editar">
                      <lucide-icon [img]="Pencil" [size]="14"></lucide-icon>
                    </button>
                    <button class="btn btn-sm btn-ghost btn-icon" (click)="deleteMsAccount(acc)" title="Eliminar">
                      <lucide-icon [img]="Trash2" [size]="14" style="color: var(--color-error);"></lucide-icon>
                    </button>
                  </div>
                </div>

                @if (msStatusMap()[acc._id]) {
                  <div class="acc-status" [class.ok]="msStatusMap()[acc._id].connected">
                    @if (msStatusMap()[acc._id].connected) {
                      <lucide-icon [img]="CheckCircle2" [size]="13"></lucide-icon> Conectado
                    } @else {
                      <lucide-icon [img]="WifiOff" [size]="13"></lucide-icon> Desconectado
                    }
                    {{ msStatusMap()[acc._id].name ? '· ' + msStatusMap()[acc._id].name : '' }}
                    {{ msStatusMap()[acc._id].error || '' }}
                  </div>
                }

                @if (acc.tokenExpiresAt) {
                  <div class="webhook-hint">
                    <span>Autorización renovada hasta:</span> {{ acc.tokenExpiresAt | date:'d MMM y' }}
                  </div>
                }
              </div>
            }
          </div>
        }

        <button class="btn btn-ghost" style="margin-top: 16px;" (click)="newMsAccount()">
          <lucide-icon [img]="Plus" [size]="16"></lucide-icon> Añadir manualmente (avanzado)
        </button>
      } @else {
        <!-- Messenger account form -->
        <div class="fields-grid">
          <div class="field">
            <label class="label">Nombre de la cuenta *</label>
            <input class="input" [(ngModel)]="msAccForm()!.label" placeholder="Ej: Página principal" />
          </div>
          <div class="field">
            <label class="label">Usuario de la página (informativo)</label>
            <input class="input" [(ngModel)]="msAccForm()!.username" placeholder="mi_restaurante" />
          </div>
          <div class="field">
            <label class="label">Facebook Page ID *</label>
            <input class="input" [(ngModel)]="msAccForm()!.pageId" placeholder="1020…" />
            <span class="field-hint">ID de la página cuyos mensajes se van a atender.</span>
          </div>
          <div class="field">
            <label class="label">Page Access Token *</label>
            <div class="input-wrap">
              <input class="input" [type]="showMsToken() ? 'text' : 'password'" [(ngModel)]="msAccForm()!.pageAccessToken" placeholder="EAAG…" />
              <button class="eye-btn" (click)="showMsToken.set(!showMsToken())" type="button">
                <lucide-icon [img]="showMsToken() ? EyeOff : Eye" [size]="16"></lucide-icon>
              </button>
            </div>
            <span class="field-hint">Token de la página (pages_messaging + pages_manage_metadata). Tras guardar, usa el botón de enlace para suscribir el webhook.</span>
          </div>
        </div>

        <div class="section-footer" style="justify-content: space-between;">
          <button class="btn btn-ghost" (click)="msAccForm.set(null)">Cancelar</button>
          <button class="btn btn-primary" [disabled]="savingMsAcc()" (click)="saveMsAccount()">
            <lucide-icon [img]="Save" [size]="16"></lucide-icon>
            {{ savingMsAcc() ? 'Guardando…' : 'Guardar cuenta' }}
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    .section-card { background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 28px 32px; margin-bottom: 24px; }
    .section-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .section-icon { width: 44px; height: 44px; border-radius: var(--radius-lg); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
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
    .acc-card-actions { display: flex; gap: 2px; flex-shrink: 0; }
    .acc-status { display: inline-flex; align-items: center; gap: 6px; margin-top: 12px; font-size: 12px; font-weight: 600; color: var(--color-error); }
    .acc-status.ok { color: #16A34A; }

    .webhook-box { border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 16px 20px; margin-bottom: 20px; background: var(--color-bg-app); }
    .webhook-box-title { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--color-text-main); }
    .webhook-box .webhook-hint { margin-top: 10px; }
    .webhook-box code { background: var(--color-white); }

    .webhook-hint { margin-top: 14px; font-size: 11px; color: var(--color-text-muted); display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .webhook-hint code { background: var(--color-bg-app); padding: 3px 8px; border-radius: 6px; font-size: 11px; word-break: break-all; }

    .section-footer { display: flex; align-items: center; justify-content: flex-end; margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--color-border); }

    @keyframes spin { to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; display: inline-block; }

    @media (max-width: 768px) {
      .section-card { padding: 20px; }
      .section-header { gap: 12px; margin-bottom: 20px; }
      .acc-card { padding: 14px 16px; }
      .acc-card-head { flex-wrap: wrap; }
      .acc-card-actions { flex-wrap: wrap; justify-content: flex-start; }
      .section-footer { flex-wrap: wrap; gap: 10px; }
      .section-footer > .btn { flex: 1; justify-content: center; }
    }

    @media (max-width: 480px) {
      .section-card { padding: 16px; margin-bottom: 16px; }
      .section-card > .btn { width: 100%; justify-content: center; }
      .fields-grid { gap: 14px; }
    }
  `],
})
export class MessengerSettingsComponent implements OnInit {
  private api = inject(AccountsApiService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly CheckCircle2 = CheckCircle2;
  readonly RefreshCw = RefreshCw;
  readonly Save = Save;
  readonly WifiOff = WifiOff;
  readonly Eye = Eye;
  readonly EyeOff = EyeOff;
  readonly Plus = Plus;
  readonly Trash2 = Trash2;
  readonly Pencil = Pencil;
  readonly Facebook = Facebook;
  readonly Link = Link;
  readonly Copy = Copy;

  msAccounts = signal<MsAccount[]>([]);
  msAccountsLoading = signal(false);
  msAccForm = signal<MsAccount | null>(null);
  savingMsAcc = signal(false);
  connectingMs = signal(false);
  showMsToken = signal(false);
  msStatusMap = signal<Record<string, MsStatus>>({});
  msWebhookConfig = signal<WebhookConfig>({});

  ngOnInit() {
    this.loadMsAccounts();
    this.loadMsWebhookConfig();
    this.handleMsOAuthReturn();
  }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.msAccForm()) this.msAccForm.set(null);
  }

  /** Procesa el redirect de vuelta desde el callback OAuth de Messenger (ver messenger-oauth-callback.controller.ts). */
  private handleMsOAuthReturn() {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('ms_oauth');
    if (!result) return;
    if (result === 'success') {
      const n = Number(params.get('connected') || 0);
      this.toast.success(n > 1 ? `${n} páginas de Facebook conectadas` : 'Página de Facebook conectada');
      this.loadMsAccounts();
    } else {
      this.toast.error(params.get('reason') || 'No se pudo conectar la página de Facebook');
    }
    params.delete('ms_oauth');
    params.delete('connected');
    params.delete('reason');
    const query = params.toString();
    history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
  }

  loadMsAccounts() {
    this.msAccountsLoading.set(true);
    this.api.getMsAccounts().subscribe({
      next: (a) => { this.msAccounts.set(a); this.msAccountsLoading.set(false); },
      error: () => this.msAccountsLoading.set(false),
    });
  }

  newMsAccount() { this.msAccForm.set(blankMsAccount()); this.showMsToken.set(false); }
  editMsAccount(a: MsAccount) { this.msAccForm.set({ ...a }); this.showMsToken.set(false); }

  msWebhookUrl(): string {
    return this.msWebhookConfig().url || this.api.msWebhookUrl();
  }

  loadMsWebhookConfig() {
    this.api.getMsWebhookConfig().subscribe({
      next: (c) => this.msWebhookConfig.set(c),
      error: () => this.msWebhookConfig.set({}),
    });
  }

  copy(text: string, message: string) {
    navigator.clipboard.writeText(text).then(
      () => this.toast.success(message),
      () => this.toast.error('No se pudo copiar al portapapeles'),
    );
  }

  saveMsAccount() {
    const acc = this.msAccForm();
    if (!acc) return;
    if (!acc.label.trim()) { this.toast.error('El nombre es obligatorio'); return; }
    this.savingMsAcc.set(true);
    const { _id, ...body } = acc;
    const req = _id
      ? this.api.updateMsAccount(_id, body)
      : this.api.createMsAccount(body);
    req.subscribe({
      next: () => {
        this.toast.success('Cuenta guardada');
        this.savingMsAcc.set(false);
        this.msAccForm.set(null);
        this.loadMsAccounts();
      },
      error: (err: { error?: { message?: string } }) => { this.toast.error(err.error?.message || 'Error al guardar'); this.savingMsAcc.set(false); },
    });
  }

  async deleteMsAccount(a: MsAccount) {
    const ok = await this.confirm.confirm({
      title: 'Eliminar cuenta', message: `¿Eliminar la página de Facebook "${a.label}"?`,
      confirmText: 'Eliminar', danger: true,
    });
    if (!ok) return;
    this.api.deleteMsAccount(a._id).subscribe({
      next: () => { this.toast.success('Cuenta eliminada'); this.loadMsAccounts(); },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'Error al eliminar'),
    });
  }

  checkMsStatus(a: MsAccount) {
    this.api.getMsStatus(a._id).subscribe({
      next: (s) => this.msStatusMap.update(m => ({ ...m, [a._id]: s })),
      error: (err: { error?: { message?: string } }) => this.msStatusMap.update(m => ({ ...m, [a._id]: { connected: false, error: err.error?.message || 'Error' } })),
    });
  }

  connectMessenger() {
    this.connectingMs.set(true);
    this.api.startMsOauth().subscribe({
      next: (r) => { window.location.href = r.url; },
      error: (err: { error?: { message?: string } }) => {
        this.toast.error(err.error?.message || 'No se pudo iniciar la conexión con Facebook');
        this.connectingMs.set(false);
      },
    });
  }

  subscribeMsWebhook(a: MsAccount) {
    this.api.subscribeMsWebhook(a._id).subscribe({
      next: (r) => r.success ? this.toast.success(r.message) : this.toast.error(r.message),
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'No se pudo suscribir el webhook'),
    });
  }
}
