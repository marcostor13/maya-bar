import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, ShieldCheck } from 'lucide-angular';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';

export interface TwoFactorStatus {
  enabled: boolean;
  method: 'totp' | 'email' | null;
  backupCodesLeft: number;
  required: boolean;
  requiredBy: 'tenant' | 'superadmin' | null;
  tenantRequires: boolean;
}
type Err = { error?: { message?: string } };

/** Configuración → Seguridad: doble factor propio y, para el admin, obligatorio para el equipo (HU62). */
@Component({
  selector: 'app-security-settings',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="section-card">
      <div class="section-header">
        <div class="section-icon"><lucide-icon [img]="ShieldCheck" [size]="22" class="brand" /></div>
        <div>
          <h2 class="section-title">Seguridad</h2>
          <p class="section-desc">Doble factor de acceso: una contraseña filtrada no basta para entrar.</p>
        </div>
      </div>

      @if (status(); as s) {
        @if (s.enabled) {
          <p class="state ok">Doble factor activo · {{ s.method === 'totp' ? 'app de autenticación' : 'código por correo' }} · {{ s.backupCodesLeft }} códigos de respaldo</p>
        } @else {
          <p class="state">Doble factor desactivado.</p>
        }

        @if (!s.enabled && !setupMethod()) {
          <div class="row">
            <button class="btn btn-primary btn-sm" (click)="start('totp')" [disabled]="busy()">Activar con app de autenticación</button>
            <button class="btn btn-secondary btn-sm" (click)="start('email')" [disabled]="busy()">Activar con código por correo</button>
          </div>
        }

        @if (setupMethod()) {
          <div class="setup">
            @if (setupMethod() === 'totp') {
              <p class="hint">Escanea el código con tu app (Google Authenticator, Microsoft Authenticator, 1Password…).</p>
              @if (qr()) { <img class="qr" [src]="qr()" alt="Código QR para la app de autenticación" /> }
              <p class="hint">Clave manual: <span class="mono">{{ secret() }}</span></p>
            } @else {
              <p class="hint">Te enviamos un código a {{ emailHint() }}.</p>
            }
            <div class="row">
              <input class="input code" [(ngModel)]="code" inputmode="numeric" maxlength="6" placeholder="123456" aria-label="Código de 6 dígitos" />
              <button class="btn btn-primary btn-sm" (click)="confirmSetup()" [disabled]="busy() || code.trim().length !== 6">Confirmar</button>
              <button class="btn btn-ghost btn-sm" (click)="setupMethod.set(null)">Cancelar</button>
            </div>
          </div>
        }

        @if (backupCodes().length) {
          <div class="setup">
            <p class="hint"><strong>Guarda estos códigos de respaldo.</strong> Cada uno sirve una vez y no los volverás a ver.</p>
            <ul class="codes">@for (c of backupCodes(); track c) { <li class="mono">{{ c }}</li> }</ul>
            <div class="row">
              <button class="btn btn-secondary btn-sm" (click)="copyCodes()">Copiar</button>
              <button class="btn btn-ghost btn-sm" (click)="backupCodes.set([])">Ya los guardé</button>
            </div>
          </div>
        }

        @if (s.enabled) {
          <div class="row">
            <input class="input pwd" type="password" [(ngModel)]="password" placeholder="Tu contraseña" aria-label="Contraseña para confirmar" />
            <button class="btn btn-secondary btn-sm" (click)="regenerate()" [disabled]="busy() || !password">Nuevos códigos de respaldo</button>
            @if (!s.required) {
              <button class="btn btn-danger btn-sm" (click)="disable()" [disabled]="busy() || !password">Desactivar</button>
            }
          </div>
          @if (s.required) { <p class="hint">Tu empresa exige el doble factor: no se puede desactivar.</p> }
        }

        @if (isAdmin()) {
          <label class="policy">
            <input type="checkbox" [ngModel]="s.tenantRequires" (ngModelChange)="setPolicy($event)" [disabled]="busy()" />
            Exigir doble factor a todo el equipo
          </label>
          <p class="hint">Quien no lo tenga deberá configurarlo al iniciar sesión. Si alguien pierde el teléfono, reinícialo desde Usuarios.</p>
        }
      }
    </div>
  `,
  styles: [`
    .section-card { background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 28px 32px; margin-bottom: 24px; }
    .section-header { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
    .section-icon { width: 44px; height: 44px; border-radius: var(--radius-lg); background: var(--color-brand-light); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .brand { color: var(--color-brand); }
    .section-title { font-family: var(--font-heading); font-size: 17px; font-weight: 700; margin: 0 0 2px; }
    .section-desc, .hint { font-size: 13px; color: var(--color-text-muted); margin: 0; }
    .hint { margin: 6px 0; line-height: 1.5; }
    .state { font-size: 14px; margin: 0 0 12px; }
    .state.ok { color: var(--color-success); font-weight: 600; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 8px 0; }
    .setup { border-top: 1px solid var(--color-border); padding-top: 12px; margin-top: 12px; }
    .qr { width: 180px; height: 180px; display: block; }
    .mono { font-family: monospace; word-break: break-all; }
    .code { max-width: 140px; letter-spacing: 3px; text-align: center; }
    .pwd { max-width: 220px; }
    .codes { list-style: none; padding: 0; margin: 8px 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 6px; }
    .codes li { background: var(--color-bg-light); border-radius: var(--radius-sm); padding: 6px; text-align: center; }
    .policy { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 500; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--color-border); }
    @media (max-width: 768px) { .section-card { padding: 20px; } }
  `],
})
export class SecuritySettingsComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);
  private base = `${environment.apiUrl}/auth/2fa`;
  readonly ShieldCheck = ShieldCheck;

  status = signal<TwoFactorStatus | null>(null);
  busy = signal(false);
  setupMethod = signal<'totp' | 'email' | null>(null);
  secret = signal('');
  emailHint = signal('');
  qr = signal('');
  backupCodes = signal<string[]>([]);
  code = '';
  password = '';

  isAdmin = () => this.auth.currentUser()?.role === 'TENANT_ADMIN';

  ngOnInit() { this.load(); }

  load() {
    this.http.get<TwoFactorStatus>(`${this.base}/status`).subscribe({
      next: (s) => this.status.set(s),
      error: (e: Err) => this.toast.error(e.error?.message || 'No se pudo cargar la seguridad'),
    });
  }

  start(method: 'totp' | 'email') {
    this.busy.set(true);
    this.http.post<{ secret?: string; otpauthUrl?: string; emailHint?: string }>(`${this.base}/setup`, { method }).subscribe({
      next: async (r) => {
        this.busy.set(false);
        this.code = '';
        this.setupMethod.set(method);
        this.secret.set(r.secret ?? '');
        this.emailHint.set(r.emailHint ?? '');
        this.qr.set('');
        if (r.otpauthUrl) {
          try {
            const QRCode = await import('qrcode');
            this.qr.set(await QRCode.toDataURL(r.otpauthUrl, { margin: 1, width: 360 }));
          } catch { /* queda la clave manual */ }
        }
      },
      error: (e: Err) => { this.busy.set(false); this.toast.error(e.error?.message || 'No se pudo empezar'); },
    });
  }

  confirmSetup() {
    this.busy.set(true);
    this.http.post<{ backupCodes: string[] }>(`${this.base}/setup/confirm`, { code: this.code.trim() }).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.setupMethod.set(null);
        this.backupCodes.set(r.backupCodes);
        this.toast.success('Doble factor activado');
        this.load();
      },
      error: (e: Err) => { this.busy.set(false); this.toast.error(e.error?.message || 'El código no es correcto'); },
    });
  }

  regenerate() {
    this.busy.set(true);
    this.http.post<{ backupCodes: string[] }>(`${this.base}/backup-codes`, { password: this.password }).subscribe({
      next: (r) => { this.busy.set(false); this.password = ''; this.backupCodes.set(r.backupCodes); this.toast.success('Códigos de respaldo nuevos'); this.load(); },
      error: (e: Err) => { this.busy.set(false); this.toast.error(e.error?.message || 'No se pudieron generar'); },
    });
  }

  async disable() {
    const ok = await this.confirm.confirm({ title: 'Desactivar doble factor', message: 'Tu cuenta quedará protegida solo por la contraseña.', confirmText: 'Desactivar', danger: true });
    if (!ok) return;
    this.busy.set(true);
    this.http.post(`${this.base}/disable`, { password: this.password }).subscribe({
      next: () => { this.busy.set(false); this.password = ''; this.toast.success('Doble factor desactivado'); this.load(); },
      error: (e: Err) => { this.busy.set(false); this.toast.error(e.error?.message || 'No se pudo desactivar'); },
    });
  }

  setPolicy(required: boolean) {
    this.busy.set(true);
    this.http.put<{ required: boolean }>(`${this.base}/policy`, { required }).subscribe({
      next: () => { this.busy.set(false); this.toast.success(required ? 'Doble factor obligatorio para el equipo' : 'Doble factor opcional'); this.load(); },
      error: (e: Err) => { this.busy.set(false); this.toast.error(e.error?.message || 'No se pudo guardar'); this.load(); },
    });
  }

  copyCodes() {
    navigator.clipboard?.writeText(this.backupCodes().join('\n')).then(
      () => this.toast.success('Códigos copiados'),
      () => this.toast.error('No se pudieron copiar'),
    );
  }
}
