import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';

import { ToastService } from '../../shared/toast';
import { BrandService } from '../../core/brand.service';

const TOO_MANY = 'Demasiados intentos. Espera un momento y vuelve a intentarlo.';

/**
 * Motivo legible de un login fallido (HU21). El backend solo da el motivo de
 * cuenta (desactivada, empresa suspendida) cuando la contraseña es correcta,
 * así que mostrarlo no revela qué correos existen.
 */
export function loginErrorMessage(err: { status?: number; error?: { message?: unknown } }): string {
  if (err.status === 429) return TOO_MANY;
  if (err.status === 401) {
    const m = typeof err.error?.message === 'string' ? err.error.message : '';
    return /desactivada|suspendida/i.test(m) ? m : 'Credenciales incorrectas';
  }
  return 'No pudimos conectar con el servidor. Inténtalo de nuevo.';
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, RouterLink],
  template: `
    <div class="login-page">
      <div class="login-card card animate-fade-in">
        <div class="login-header">
          @if (brand.logo()) { <img [src]="brand.logo()" [alt]="brand.brand().appName" class="logo-img" /> }
          <h1>Bienvenido a {{ brand.custom() ? brand.brand().appName : 'Maya' }}</h1>
          <p>Ingresa a tu cuenta para continuar.</p>
        </div>

        @if (error()) {
          <div class="alert-error">{{ error() }}</div>
        }

        @if (view() === 'login') {
          <form [formGroup]="form" (ngSubmit)="onSubmit()">
            <div class="form-group">
              <label>Email</label>
              <input class="input" formControlName="email" type="email" placeholder="tu@email.com" autocomplete="email" />
            </div>
            <div class="form-group">
              <div class="label-row">
                <label>Contraseña</label>
                <button type="button" class="text-link" (click)="view.set('forgot')">¿Olvidaste tu contraseña?</button>
              </div>
              <div class="input-eye-wrap">
                <input class="input" formControlName="password" [type]="showPassword() ? 'text' : 'password'" placeholder="••••••••" autocomplete="current-password" />
                <button type="button" class="eye-btn" (click)="showPassword.set(!showPassword())" [attr.aria-label]="showPassword() ? 'Ocultar contraseña' : 'Mostrar contraseña'">
                  @if (showPassword()) {
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  } @else {
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>

            <button type="submit" class="btn btn-primary submit-btn" [disabled]="loading() || form.invalid">
              @if (loading()) { Ingresando... } @else { Ingresar }
            </button>
          </form>

          <!-- En el panel de una agencia (HU72) el alta la hace la agencia. -->
          @if (!brand.custom()) {
            <p class="register-link">
              ¿No tienes cuenta? <a routerLink="/register">Regístrate gratis</a>
            </p>
          }
        } @else if (view() === 'otp') {
          <form (ngSubmit)="onOtpSubmit()">
            <p class="hint">
              @if (otpMethod() === 'email') { Te enviamos un código de 6 dígitos a <strong>{{ emailHint() }}</strong>. }
              @else { Escribe el código de 6 dígitos de tu app de autenticación. }
              También puedes usar un código de respaldo.
            </p>
            <div class="form-group">
              <label for="otp-code">Código de acceso</label>
              <input id="otp-code" class="input otp" name="code" [(ngModel)]="otpCode" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" maxlength="20" />
            </div>
            <label class="remember"><input type="checkbox" name="remember" [(ngModel)]="rememberDevice" /> Recordar este dispositivo 30 días</label>
            <button type="submit" class="btn btn-primary submit-btn" [disabled]="loading() || !otpCode.trim()">
              @if (loading()) { Verificando... } @else { Entrar }
            </button>
            @if (otpMethod() === 'email') {
              <button type="button" class="btn btn-ghost submit-btn" (click)="resendOtp()" [disabled]="loading()">Reenviar código</button>
            }
            <button type="button" class="btn btn-secondary submit-btn" (click)="backToLogin()">Volver</button>
          </form>
        } @else if (view() === 'enroll') {
          <div class="enroll">
            <p class="hint">
              {{ enrollReason() === 'superadmin' ? 'El superadmin debe usar doble factor.' : 'Tu empresa exige doble factor de acceso.' }}
              Configúralo para entrar.
            </p>
            @if (!enrollMethod()) {
              <button type="button" class="btn btn-primary submit-btn" (click)="startEnroll('totp')" [disabled]="loading()">Usar app de autenticación</button>
              <button type="button" class="btn btn-secondary submit-btn" (click)="startEnroll('email')" [disabled]="loading()">Recibir el código por correo</button>
            } @else {
              @if (enrollMethod() === 'totp') {
                <p class="hint">Escanea el código con Google Authenticator, Microsoft Authenticator o similar.</p>
                @if (qr()) { <img class="qr" [src]="qr()" alt="Código QR para la app de autenticación" /> }
                <p class="hint">¿No puedes escanear? Clave: <span class="mono">{{ enrollSecret() }}</span></p>
              } @else {
                <p class="hint">Te enviamos un código a <strong>{{ emailHint() }}</strong>.</p>
              }
              <form (ngSubmit)="confirmEnroll()">
                <div class="form-group">
                  <label for="enroll-code">Código de 6 dígitos</label>
                  <input id="enroll-code" class="input otp" name="ecode" [(ngModel)]="otpCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456" />
                </div>
                <button type="submit" class="btn btn-primary submit-btn" [disabled]="loading() || otpCode.trim().length !== 6">Activar y entrar</button>
              </form>
            }
            <button type="button" class="btn btn-secondary submit-btn" (click)="backToLogin()">Volver</button>
          </div>
        } @else if (view() === 'backup') {
          <div class="enroll">
            <p class="hint"><strong>Guarda estos códigos de respaldo.</strong> Cada uno sirve una sola vez si pierdes el teléfono. No los volverás a ver.</p>
            <ul class="codes">@for (c of backupCodes(); track c) { <li class="mono">{{ c }}</li> }</ul>
            <button type="button" class="btn btn-secondary submit-btn" (click)="copyCodes()">Copiar códigos</button>
            <button type="button" class="btn btn-primary submit-btn" (click)="router.navigate([homeRoute()])">Ya los guardé, continuar</button>
          </div>
        } @else if (view() === 'forgot') {
          <form (ngSubmit)="onForgotSubmit()">
            <div class="form-group">
              <label>Email de tu cuenta</label>
              <input class="input" type="email" [value]="forgotEmail()" (input)="forgotEmail.set($any($event.target).value)" placeholder="tu@email.com" />
            </div>
            <button type="submit" class="btn btn-primary submit-btn" [disabled]="loading() || !forgotEmail()">
              @if (loading()) { Enviando... } @else { Enviar código }
            </button>
            <button type="button" class="btn btn-secondary submit-btn" (click)="view.set('login')">Volver al login</button>
          </form>
        } @else if (view() === 'reset') {
          <form (ngSubmit)="onResetSubmit()">
            <p style="font-size:13px; color:var(--color-text-muted); margin-bottom:16px;">Se ha enviado un código de 6 dígitos a <strong>{{ forgotEmail() }}</strong></p>
            <div class="form-group">
              <label>Código de recuperación</label>
              <input class="input" type="text" [value]="resetCode()" (input)="resetCode.set($any($event.target).value)" placeholder="123456" />
            </div>
            <div class="form-group">
              <label>Nueva contraseña</label>
              <input class="input" type="password" [value]="newPassword()" (input)="newPassword.set($any($event.target).value)" placeholder="••••••••" />
            </div>
            <button type="submit" class="btn btn-primary submit-btn" [disabled]="loading() || !resetCode() || !newPassword()">
              @if (loading()) { Guardando... } @else { Cambiar contraseña }
            </button>
            <button type="button" class="btn btn-secondary submit-btn" (click)="view.set('login')">Volver al login</button>
          </form>
        }
      </div>
    </div>
  `,
  styles: [`
    .login-page {
      /* dvh y no vh: con la barra del navegador visible, 100vh se pasa de
         largo en el móvil y deja el formulario cortado por abajo. */
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: calc(32px + env(safe-area-inset-top, 0px)) 16px calc(32px + env(safe-area-inset-bottom, 0px));
      background: var(--color-bg-light);
    }

    .login-card {
      width: 100%;
      max-width: 400px;
      padding: 40px;
    }

    .login-header {
      text-align: center;
      margin-bottom: 32px;
    }

    .logo-img {
      height: 48px;
      width: auto;
      margin-bottom: 16px;
      object-fit: contain;
    }

    .login-header h1 { font-size: 22px; margin-bottom: 6px; }
    .login-header p { color: var(--color-text-muted); font-size: 14px; margin: 0; }

    .form-group { margin-bottom: 16px; }
    .form-group label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: var(--color-text-muted);
      margin-bottom: 6px;
    }

    .label-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .label-row label { margin-bottom: 0; }
    
    .text-link {
      background: none; border: none; padding: 0;
      font-size: 12px; font-weight: 500; color: var(--color-brand);
      cursor: pointer;
    }
    .text-link:hover { text-decoration: underline; }

    .submit-btn {
      width: 100%;
      padding: 12px;
      font-size: 15px;
      margin-top: 8px;
    }

    .submit-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .alert-error {
      background: #FEF2F2;
      border: 1px solid #FECACA;
      color: var(--color-error);
      padding: 10px 14px;
      border-radius: var(--radius-sm);
      font-size: 13px;
      margin-bottom: 20px;
    }

    .register-link {
      text-align: center;
      font-size: 13px;
      color: var(--color-text-muted);
      margin-top: 20px;
      margin-bottom: 0;
    }

    .register-link a {
      color: var(--color-brand);
      text-decoration: none;
      font-weight: 500;
    }

    .hint { font-size: 13px; color: var(--color-text-muted); margin: 0 0 16px; line-height: 1.5; }
    .otp { letter-spacing: 4px; font-size: 18px; text-align: center; }
    .remember { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--color-text-muted); margin-bottom: 8px; }
    .qr { display: block; width: 180px; height: 180px; margin: 0 auto 12px; }
    .mono { font-family: monospace; word-break: break-all; }
    .codes { list-style: none; padding: 0; margin: 0 0 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
    .codes li { background: var(--color-bg-light); border-radius: var(--radius-sm); padding: 6px 8px; text-align: center; font-size: 14px; }
    .input-eye-wrap { position: relative; }
    .input-eye-wrap .input { padding-right: 42px; width: 100%; box-sizing: border-box; }
    .eye-btn {
      position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
      background: none; border: none; cursor: pointer; padding: 4px;
      color: var(--color-text-muted); display: flex; align-items: center;
      border-radius: 4px; transition: color var(--transition-fast);
    }
    .eye-btn:hover { color: var(--color-text-main); }
    .eye-btn:focus-visible { outline: 2px solid var(--color-brand); }

    @media (max-width: 768px) {
      .login-page { padding: calc(20px + env(safe-area-inset-top, 0px)) 12px calc(20px + env(safe-area-inset-bottom, 0px)); }
      .login-card { padding: 28px 24px; }
      .eye-btn { min-width: 44px; min-height: 44px; justify-content: center; right: 0; }
      .input-eye-wrap .input { padding-right: 46px; }
    }

    @media (max-width: 480px) {
      .login-card { padding: 24px 18px; }
      .login-header h1 { font-size: 20px; }
    }
  `],
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  router = inject(Router);
  private toast = inject(ToastService);
  readonly brand = inject(BrandService);

  loading = signal(false);
  // Doble factor (HU62)
  private challengeToken = '';
  otpMethod = signal<'totp' | 'email'>('totp');
  emailHint = signal('');
  otpCode = '';
  rememberDevice = false;
  enrollReason = signal<'tenant' | 'superadmin'>('tenant');
  enrollMethod = signal<'totp' | 'email' | null>(null);
  enrollSecret = signal('');
  qr = signal('');
  backupCodes = signal<string[]>([]);
  error = signal('');
  showPassword = signal(false);

  view = signal<'login' | 'forgot' | 'reset' | 'otp' | 'enroll' | 'backup'>('login');
  forgotEmail = signal('');
  resetCode = signal('');
  newPassword = signal('');

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  homeRoute(): string {
    const user = this.auth.currentUser();
    if (user?.mustChangePassword) return '/change-password';
    if (user?.role === 'SUPERADMIN') return '/admin/tenants';
    if (user?.role === 'IMPULSADOR') return '/impulsador';
    return '/dashboard';
  }

  onSubmit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set('');

    this.auth.login(this.form.value as any).subscribe({
      next: (res: any) => {
        this.loading.set(false);
        if (res?.twoFactorRequired) {
          this.challengeToken = res.challengeToken;
          this.otpMethod.set(res.method);
          this.emailHint.set(res.emailHint ?? '');
          this.otpCode = '';
          this.view.set('otp');
          return;
        }
        if (res?.twoFactorSetupRequired) {
          this.challengeToken = res.challengeToken;
          this.enrollReason.set(res.reason);
          this.enrollMethod.set(null);
          this.otpCode = '';
          this.view.set('enroll');
          return;
        }
        this.router.navigate([this.homeRoute()]);
      },
      error: (err) => {
        // Cuenta registrada que no confirmó su correo: a la pantalla del código,
        // que le manda uno nuevo al llegar.
        if (err.status === 401 && err.error?.code === 'EMAIL_NOT_VERIFIED') {
          this.loading.set(false);
          this.toast.warning(err.error.message);
          this.router.navigate(['/register'], { state: { verifyEmail: this.form.value.email } });
          return;
        }
        // Solo un 401 es culpa de los datos; lo demás (sin red, 5xx) no debe
        // hacer creer a la persona que escribió mal su contraseña.
        const msg = loginErrorMessage(err);
        this.error.set(msg);
        this.toast.error(msg);
        this.loading.set(false);
      },
    });
  }

  onOtpSubmit() {
    this.loading.set(true);
    this.error.set('');
    this.auth.verifyTwoFactor(this.challengeToken, this.otpCode.trim(), this.rememberDevice).subscribe({
      next: () => { this.loading.set(false); this.router.navigate([this.homeRoute()]); },
      error: (err) => this.fail(err, 'El código no es válido.'),
    });
  }

  resendOtp() {
    this.auth.resendTwoFactor(this.challengeToken).subscribe({
      next: (r) => { this.emailHint.set(r.emailHint); this.toast.success('Te enviamos un código nuevo'); },
      error: (err) => this.fail(err, 'No se pudo reenviar el código'),
    });
  }

  startEnroll(method: 'totp' | 'email') {
    this.loading.set(true);
    this.auth.enrollStart(this.challengeToken, method).subscribe({
      next: async (r) => {
        this.loading.set(false);
        this.enrollMethod.set(method);
        this.emailHint.set(r.emailHint ?? '');
        this.enrollSecret.set(r.secret ?? '');
        if (r.otpauthUrl) {
          try {
            const QRCode = await import('qrcode');
            this.qr.set(await QRCode.toDataURL(r.otpauthUrl, { margin: 1, width: 360 }));
          } catch { this.qr.set(''); }
        }
      },
      error: (err) => this.fail(err, 'No se pudo empezar la configuración'),
    });
  }

  confirmEnroll() {
    this.loading.set(true);
    this.auth.enrollConfirm(this.challengeToken, this.otpCode.trim()).subscribe({
      next: (res: any) => {
        this.loading.set(false);
        this.toast.success('Doble factor activado');
        this.backupCodes.set(res.backupCodes ?? []);
        this.view.set('backup');
      },
      error: (err) => this.fail(err, 'El código no es correcto'),
    });
  }

  copyCodes() {
    navigator.clipboard?.writeText(this.backupCodes().join('\n')).then(
      () => this.toast.success('Códigos copiados'),
      () => this.toast.error('No se pudieron copiar'),
    );
  }

  backToLogin() {
    this.challengeToken = '';
    this.otpCode = '';
    this.error.set('');
    this.view.set('login');
  }

  private fail(err: { status?: number; error?: { message?: unknown } }, fallback: string) {
    const msg = err.status === 429 ? TOO_MANY : typeof err.error?.message === 'string' ? err.error.message : fallback;
    this.error.set(msg);
    this.toast.error(msg);
    this.loading.set(false);
  }

  onForgotSubmit() {
    if (!this.forgotEmail()) return;
    this.loading.set(true);
    this.error.set('');

    this.auth.forgotPassword(this.forgotEmail()).subscribe({
      next: (res) => {
        this.toast.success(res.message || 'Código enviado');
        this.loading.set(false);
        this.view.set('reset');
      },
      error: (err) => {
        // El límite de intentos no revela nada de la cuenta: decirlo evita esperar un código que no saldrá.
        if (err.status === 429) {
          this.error.set(TOO_MANY);
          this.toast.error(TOO_MANY);
          this.loading.set(false);
          return;
        }
        this.toast.success('Si el correo existe, se ha enviado un código.'); // Prevent enumeration
        this.loading.set(false);
        this.view.set('reset');
      }
    });
  }

  onResetSubmit() {
    if (!this.resetCode() || !this.newPassword()) return;
    this.loading.set(true);
    this.error.set('');

    this.auth.resetPassword(this.forgotEmail(), this.resetCode(), this.newPassword()).subscribe({
      next: (res) => {
        this.toast.success(res.message || 'Contraseña actualizada');
        this.loading.set(false);
        this.view.set('login');
        // Pre-fill email for convenience
        this.form.patchValue({ email: this.forgotEmail(), password: '' });
      },
      error: (err) => {
        const msg = err.error?.message || 'Código inválido o expirado';
        this.error.set(msg);
        this.toast.error(msg);
        this.loading.set(false);
      }
    });
  }
}
