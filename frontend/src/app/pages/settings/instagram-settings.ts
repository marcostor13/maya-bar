import { Component, inject, signal, OnInit, HostListener } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, CheckCircle2, RefreshCw, Save, WifiOff,
  Eye, EyeOff, Plus, Trash2, Pencil, Instagram, Link,
} from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { AccountsApiService } from '../../core/api/accounts-api.service';
import { IgAccount, IgStatus, blankIgAccount } from '../../shared/models/accounts.model';

@Component({
  selector: 'app-instagram-settings',
  standalone: true,
  imports: [FormsModule, LucideAngularModule, DatePipe],
  template: `
    <!-- Instagram Accounts Card -->
    <div class="section-card">
      <div class="section-header">
        <div class="section-icon" style="background: #FCE7F3;">
          <lucide-icon [img]="Instagram" [size]="22" style="color: #DB2777;"></lucide-icon>
        </div>
        <div>
          <h2 class="section-title">Instagram</h2>
          <p class="section-desc">Conecta uno o varios DM de Instagram. Estas cuentas quedan disponibles para los agentes de IA.</p>
        </div>
      </div>

      @if (!igAccForm()) {
        <button class="btn btn-primary" style="margin-bottom:16px" [disabled]="connectingIg()" (click)="connectInstagram()">
          <lucide-icon [img]="Instagram" [size]="16"></lucide-icon>
          {{ connectingIg() ? 'Redirigiendo…' : 'Conectar con Instagram' }}
        </button>

        @if (igAccountsLoading()) {
          <div class="loading-row">
            <lucide-icon [img]="RefreshCw" [size]="20" class="spin"></lucide-icon> Cargando cuentas…
          </div>
        } @else if (igAccounts().length === 0) {
          <div class="empty-accounts">
            <lucide-icon [img]="Instagram" [size]="28" [strokeWidth]="1.5" style="color: var(--color-text-muted);"></lucide-icon>
            <p>Aún no hay cuentas de Instagram.</p>
          </div>
        } @else {
          <div class="webhook-hint" style="margin-bottom:16px">
            <span>Webhook de la app (se configura una sola vez en Meta, aplica a todas las cuentas):</span>
            <code>{{ igWebhookUrl() }}</code>
          </div>
          <div class="acc-list">
            @for (acc of igAccounts(); track acc._id) {
              <div class="acc-card">
                <div class="acc-card-head">
                  <div class="acc-id">
                    <span class="account-label">{{ acc.label }}</span>
                    <span class="account-sub">{{ acc.username ? '@' + acc.username : 'Instagram Messaging' }}</span>
                    <span class="account-sub">IG ID: {{ acc.igBusinessAccountId || '(sin ID)' }}</span>
                  </div>
                  <div class="acc-card-actions">
                    @if (acc.tokenExpiresAt) {
                      <button class="btn btn-sm btn-ghost btn-icon" (click)="renewIgToken(acc)" title="Renovar token">
                        <lucide-icon [img]="RefreshCw" [size]="14" style="color: var(--color-brand);"></lucide-icon>
                      </button>
                    }
                    <button class="btn btn-sm btn-ghost btn-icon" (click)="subscribeIgWebhook(acc)" title="Suscribir webhook">
                      <lucide-icon [img]="Link" [size]="14"></lucide-icon>
                    </button>
                    <button class="btn btn-sm btn-ghost btn-icon" (click)="checkIgStatus(acc)" title="Verificar estado">
                      <lucide-icon [img]="RefreshCw" [size]="14"></lucide-icon>
                    </button>
                    <button class="btn btn-sm btn-ghost btn-icon" (click)="editIgAccount(acc)" title="Editar">
                      <lucide-icon [img]="Pencil" [size]="14"></lucide-icon>
                    </button>
                    <button class="btn btn-sm btn-ghost btn-icon" (click)="deleteIgAccount(acc)" title="Eliminar">
                      <lucide-icon [img]="Trash2" [size]="14" style="color: var(--color-error);"></lucide-icon>
                    </button>
                  </div>
                </div>

                @if (igStatusMap()[acc._id]) {
                  <div class="acc-status" [class.ok]="igStatusMap()[acc._id].connected">
                    @if (igStatusMap()[acc._id].connected) {
                      <lucide-icon [img]="CheckCircle2" [size]="13"></lucide-icon> Conectado
                    } @else {
                      <lucide-icon [img]="WifiOff" [size]="13"></lucide-icon> Desconectado
                    }
                    {{ igStatusMap()[acc._id].username ? '· @' + igStatusMap()[acc._id].username : '' }}
                    {{ igStatusMap()[acc._id].error || '' }}
                  </div>
                }

                @if (acc.tokenExpiresAt) {
                  <div class="webhook-hint">
                    <span>Token vence:</span> {{ acc.tokenExpiresAt | date:'d MMM y' }}
                  </div>
                }
              </div>
            }
          </div>
        }

        <button class="btn btn-ghost" style="margin-top: 16px;" (click)="newIgAccount()">
          <lucide-icon [img]="Plus" [size]="16"></lucide-icon> Añadir manualmente (avanzado)
        </button>
      } @else {
        <!-- Instagram account form -->
        <div class="fields-grid">
          <div class="field">
            <label class="label">Nombre de la cuenta *</label>
            <input class="input" [(ngModel)]="igAccForm()!.label" placeholder="Ej: Instagram Principal" />
          </div>
          <div class="field">
            <label class="label">Usuario (informativo)</label>
            <input class="input" [(ngModel)]="igAccForm()!.username" placeholder="mi_restaurante" />
          </div>
          <div class="field">
            <label class="label">Instagram User ID *</label>
            <input class="input" [(ngModel)]="igAccForm()!.igBusinessAccountId" placeholder="1789…" />
            <span class="field-hint">ID de la cuenta profesional de Instagram (Instagram Login).</span>
          </div>
          <div class="field">
            <label class="label">Access Token de Instagram *</label>
            <div class="input-wrap">
              <input class="input" [type]="showIgToken() ? 'text' : 'password'" [(ngModel)]="igAccForm()!.pageAccessToken" placeholder="IGAAG…" />
              <button class="eye-btn" (click)="showIgToken.set(!showIgToken())" type="button">
                <lucide-icon [img]="showIgToken() ? EyeOff : Eye" [size]="16"></lucide-icon>
              </button>
            </div>
            <span class="field-hint">Token de larga duración (instagram_business_basic + instagram_business_manage_messages). Tras guardar, usa el botón de enlace para suscribir el webhook.</span>
          </div>
          <div class="field">
            <label class="label">Facebook Page ID (opcional)</label>
            <input class="input" [(ngModel)]="igAccForm()!.pageId" placeholder="Solo si usas el flujo clásico ligado a una Página" />
          </div>
        </div>

        <div class="section-footer" style="justify-content: space-between;">
          <button class="btn btn-ghost" (click)="igAccForm.set(null)">Cancelar</button>
          <button class="btn btn-primary" [disabled]="savingIgAcc()" (click)="saveIgAccount()">
            <lucide-icon [img]="Save" [size]="16"></lucide-icon>
            {{ savingIgAcc() ? 'Guardando…' : 'Guardar cuenta' }}
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
    .acc-card-actions { display: flex; gap: 2px; flex-shrink: 0; }
    .acc-status { display: inline-flex; align-items: center; gap: 6px; margin-top: 12px; font-size: 12px; font-weight: 600; color: var(--color-error); }
    .acc-status.ok { color: #16A34A; }

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
export class InstagramSettingsComponent implements OnInit {
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
  readonly Instagram = Instagram;
  readonly Link = Link;

  igAccounts = signal<IgAccount[]>([]);
  igAccountsLoading = signal(false);
  igAccForm = signal<IgAccount | null>(null);
  savingIgAcc = signal(false);
  connectingIg = signal(false);
  showIgToken = signal(false);
  igStatusMap = signal<Record<string, IgStatus>>({});

  ngOnInit() {
    this.loadIgAccounts();
    this.handleIgOAuthReturn();
  }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.igAccForm()) this.igAccForm.set(null);
  }

  /** Procesa el redirect de vuelta desde el callback OAuth de Instagram (ver instagram-oauth-callback.controller.ts). */
  private handleIgOAuthReturn() {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('ig_oauth');
    if (!result) return;
    if (result === 'success') {
      this.toast.success('Cuenta de Instagram conectada');
      this.loadIgAccounts();
    } else {
      this.toast.error(params.get('reason') || 'No se pudo conectar la cuenta de Instagram');
    }
    params.delete('ig_oauth');
    params.delete('reason');
    const query = params.toString();
    history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
  }

  loadIgAccounts() {
    this.igAccountsLoading.set(true);
    this.api.getIgAccounts().subscribe({
      next: (a) => { this.igAccounts.set(a); this.igAccountsLoading.set(false); },
      error: () => this.igAccountsLoading.set(false),
    });
  }

  newIgAccount() { this.igAccForm.set(blankIgAccount()); this.showIgToken.set(false); }
  editIgAccount(a: IgAccount) { this.igAccForm.set({ ...a }); this.showIgToken.set(false); }

  igWebhookUrl(): string {
    return this.api.igWebhookUrl();
  }

  saveIgAccount() {
    const acc = this.igAccForm();
    if (!acc) return;
    if (!acc.label.trim()) { this.toast.error('El nombre es obligatorio'); return; }
    this.savingIgAcc.set(true);
    const { _id, ...body } = acc;
    const req = _id
      ? this.api.updateIgAccount(_id, body)
      : this.api.createIgAccount(body);
    req.subscribe({
      next: () => {
        this.toast.success('Cuenta guardada');
        this.savingIgAcc.set(false);
        this.igAccForm.set(null);
        this.loadIgAccounts();
      },
      error: (err: { error?: { message?: string } }) => { this.toast.error(err.error?.message || 'Error al guardar'); this.savingIgAcc.set(false); },
    });
  }

  async deleteIgAccount(a: IgAccount) {
    const ok = await this.confirm.confirm({
      title: 'Eliminar cuenta', message: `¿Eliminar la cuenta de Instagram "${a.label}"?`,
      confirmText: 'Eliminar', danger: true,
    });
    if (!ok) return;
    this.api.deleteIgAccount(a._id).subscribe({
      next: () => { this.toast.success('Cuenta eliminada'); this.loadIgAccounts(); },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'Error al eliminar'),
    });
  }

  checkIgStatus(a: IgAccount) {
    this.api.getIgStatus(a._id).subscribe({
      next: (s) => this.igStatusMap.update(m => ({ ...m, [a._id]: s })),
      error: (err: { error?: { message?: string } }) => this.igStatusMap.update(m => ({ ...m, [a._id]: { connected: false, error: err.error?.message || 'Error' } })),
    });
  }

  connectInstagram() {
    this.connectingIg.set(true);
    this.api.startIgOauth().subscribe({
      next: (r) => { window.location.href = r.url; },
      error: (err: { error?: { message?: string } }) => {
        this.toast.error(err.error?.message || 'No se pudo iniciar la conexión con Instagram');
        this.connectingIg.set(false);
      },
    });
  }

  renewIgToken(a: IgAccount) {
    this.api.refreshIgToken(a._id).subscribe({
      next: () => { this.toast.success('Token renovado'); this.loadIgAccounts(); },
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'No se pudo renovar el token'),
    });
  }

  subscribeIgWebhook(a: IgAccount) {
    this.api.subscribeIgWebhook(a._id).subscribe({
      next: (r) => r.success ? this.toast.success(r.message) : this.toast.error(r.message),
      error: (err: { error?: { message?: string } }) => this.toast.error(err.error?.message || 'No se pudo suscribir el webhook'),
    });
  }
}
