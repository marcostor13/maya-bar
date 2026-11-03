import { Component, PLATFORM_ID, inject, signal, viewChild } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { ToastService } from '../../shared/toast';
import { TurnstileComponent } from '../../shared/turnstile';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, TurnstileComponent],
  template: `
    <div class="register-page">
      <div class="register-card card animate-fade-in">
        <div class="register-header">
          <img src="/logo.png?v=2" alt="Maya CRM" class="logo-img" />
          @if (pendingEmail()) {
            <h1>Revisa tu correo</h1>
            <p>Enviamos un código de 6 dígitos a <strong>{{ pendingEmail() }}</strong>.</p>
          } @else {
            <h1>Empieza gratis</h1>
            <p>14 días de prueba, sin tarjeta de crédito.</p>
          }
        </div>

        @if (error()) {
          <div class="alert-error">{{ error() }}</div>
        }

        @if (pendingEmail()) {
          <form (submit)="$event.preventDefault(); onVerify()" class="register-form verify-form">
            <div class="form-group">
              <label for="verify-code">Código de verificación</label>
              <input id="verify-code" class="input code-input" name="code" [value]="code()"
                (input)="code.set($any($event.target).value)" inputmode="numeric"
                autocomplete="one-time-code" maxlength="6" placeholder="000000" autofocus />
            </div>
            <button type="submit" class="btn btn-primary submit-btn" [disabled]="loading() || !codeValid()">
              @if (loading()) { Verificando... } @else { Confirmar y entrar }
            </button>
            <div class="verify-actions">
              <button type="button" class="btn btn-ghost btn-sm" (click)="onResend()" [disabled]="resending()">
                Reenviar código
              </button>
              <button type="button" class="btn btn-ghost btn-sm" (click)="useOtherEmail()">Usar otro correo</button>
            </div>
          </form>
        } @else {
        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="register-form">
          <div class="form-section">
            <h3 class="form-section-title">Tu negocio</h3>
            <div class="form-group">
              <label>Razón social *</label>
              <input class="input" formControlName="name" placeholder="Ej: Restaurante La Mar S.A.C." />
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>RUC / NIF</label>
                <input class="input" formControlName="ruc" placeholder="20123456789" />
              </div>
              <div class="form-group">
                <label>Teléfono</label>
                <input class="input" formControlName="phone" placeholder="+51 999 999 999" />
              </div>
            </div>
            <div class="form-group">
              <label>Email del negocio *</label>
              <input class="input" formControlName="email" type="email" placeholder="contacto@tunegocio.com" />
            </div>
          </div>

          <div class="form-section">
            <h3 class="form-section-title">Tu cuenta de acceso</h3>
            <div class="form-group">
              <label>Tu nombre *</label>
              <input class="input" formControlName="ownerName" placeholder="Juan Pérez" />
            </div>
            <div class="form-group">
              <label>Contraseña *</label>
              <input class="input" formControlName="ownerPassword" type="password" placeholder="Mínimo 8 caracteres" />
            </div>
          </div>

          @if (siteKey) {
            <app-turnstile [siteKey]="siteKey" (token)="captchaToken.set($event)" />
          }

          <button type="submit" class="btn btn-primary submit-btn" [disabled]="loading() || form.invalid || (!!siteKey && !captchaToken())">
            @if (loading()) { Creando cuenta... } @else { Crear cuenta gratis }
          </button>
        </form>
        }

        <p class="login-link">
          ¿Ya tienes cuenta? <a routerLink="/login">Inicia sesión</a>
        </p>
      </div>
    </div>
  `,
  styles: [`
    .register-page {
      /* dvh y no vh: con la barra del navegador visible, 100vh se pasa de
         largo en el móvil y deja el formulario cortado por abajo. */
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: calc(32px + env(safe-area-inset-top, 0px)) 16px calc(32px + env(safe-area-inset-bottom, 0px));
      background: var(--color-bg-light);
    }

    .register-card {
      width: 100%;
      max-width: 480px;
      padding: 40px;
    }

    .register-header {
      text-align: center;
      margin-bottom: 32px;
    }

    .logo-img {
      height: 44px;
      width: auto;
      margin-bottom: 16px;
      object-fit: contain;
    }

    .register-header h1 {
      font-size: 22px;
      margin-bottom: 6px;
    }

    .register-header p {
      color: var(--color-text-muted);
      font-size: 14px;
      margin: 0;
    }

    .form-section {
      margin-bottom: 24px;
    }

    .form-section-title {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--color-text-muted);
      margin-bottom: 12px;
      font-family: var(--font-base);
    }

    .form-group {
      margin-bottom: 14px;
    }

    .form-group label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: var(--color-text-muted);
      margin-bottom: 6px;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .submit-btn {
      width: 100%;
      padding: 12px;
      font-size: 15px;
      margin-top: 8px;
    }

    .code-input {
      text-align: center;
      font-size: 24px;
      letter-spacing: 8px;
      font-family: monospace;
    }

    .verify-actions {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-top: 16px;
    }

    app-turnstile {
      display: block;
      margin: 8px 0 4px;
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

    .login-link {
      text-align: center;
      font-size: 13px;
      color: var(--color-text-muted);
      margin-top: 20px;
      margin-bottom: 0;
    }

    .login-link a {
      color: var(--color-brand);
      text-decoration: none;
      font-weight: 500;
    }

    @media (max-width: 768px) {
      .register-page { padding: calc(20px + env(safe-area-inset-top, 0px)) 12px calc(20px + env(safe-area-inset-bottom, 0px)); }
      .register-card { padding: 28px 24px; }
    }

    @media (max-width: 480px) {
      .register-card { padding: 24px 18px; }
      .register-header h1 { font-size: 20px; }
      .form-row { grid-template-columns: 1fr; gap: 14px; }
    }
  `],
})
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);

  /** Vacía en las pruebas (y en cualquier entorno sin captcha): el widget no se pinta. */
  readonly siteKey = environment.turnstileSiteKey;
  private turnstile = viewChild(TurnstileComponent);

  loading = signal(false);
  resending = signal(false);
  error = signal('');
  captchaToken = signal<string | null>(null);
  /** Con valor, la pantalla pide el código enviado a este correo. */
  pendingEmail = signal('');
  code = signal('');

  form = this.fb.group({
    name: ['', Validators.required],
    ruc: [''],
    phone: [''],
    email: ['', [Validators.required, Validators.email]],
    ownerName: ['', Validators.required],
    ownerPassword: ['', [Validators.required, Validators.minLength(8)]],
  });

  constructor() {
    // El login manda aquí a quien intenta entrar sin haber confirmado: se le
    // envía un código nuevo y se le pide directamente.
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const email = (history.state as { verifyEmail?: string } | null)?.verifyEmail;
      if (email) {
        this.pendingEmail.set(email);
        this.onResend();
      }
    }
  }

  codeValid() {
    return /^\d{6}$/.test(this.code().trim());
  }

  onSubmit() {
    if (this.form.invalid) return;
    if (this.siteKey && !this.captchaToken()) return;
    this.loading.set(true);
    this.error.set('');

    const val = this.form.value as any;
    const body = this.siteKey ? { ...val, captchaToken: this.captchaToken() } : val;
    this.auth.register(body).subscribe({
      next: (res: any) => {
        this.loading.set(false);
        if (res?.verificationRequired) {
          this.pendingEmail.set(res.email ?? val.email);
          this.toast.success('Te enviamos un código a tu correo');
          return;
        }
        this.router.navigate(['/onboarding']);
      },
      error: (err) => {
        const msg = err.error?.message || 'Error al crear la cuenta';
        this.error.set(msg);
        this.toast.error(msg);
        this.loading.set(false);
        // El token del captcha ya se gastó: hace falta uno nuevo para reintentar.
        this.turnstile()?.reset();
      },
    });
  }

  onVerify() {
    if (!this.codeValid()) return;
    this.loading.set(true);
    this.error.set('');
    this.auth.verifyEmail(this.pendingEmail(), this.code().trim()).subscribe({
      next: () => {
        this.toast.success('Correo confirmado');
        this.router.navigate(['/onboarding']);
      },
      error: (err) => {
        const msg = err.error?.message || 'No pudimos confirmar el código';
        this.error.set(msg);
        this.toast.error(msg);
        this.loading.set(false);
      },
    });
  }

  onResend() {
    this.resending.set(true);
    this.auth.resendVerification(this.pendingEmail()).subscribe({
      next: (res) => {
        this.toast.success(res?.message || 'Código enviado');
        this.resending.set(false);
      },
      error: (err) => {
        this.toast.error(err.error?.message || 'No pudimos reenviar el código');
        this.resending.set(false);
      },
    });
  }

  useOtherEmail() {
    this.pendingEmail.set('');
    this.code.set('');
    this.error.set('');
  }
}
