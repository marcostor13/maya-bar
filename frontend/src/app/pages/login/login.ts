import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';

import { ToastService } from '../../shared/toast';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, RouterLink],
  template: `
    <div class="login-page">
      <div class="login-card card animate-fade-in">
        <div class="login-header">
          <img src="/logo.png" alt="Maya" class="logo-img" />
          <h1>Bienvenido a Maya</h1>
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

          <p class="register-link">
            ¿No tienes cuenta? <a routerLink="/register">Regístrate gratis</a>
          </p>
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
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
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
      .login-page { padding: 20px 12px; }
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
  private router = inject(Router);
  private toast = inject(ToastService);

  loading = signal(false);
  error = signal('');
  showPassword = signal(false);

  view = signal<'login' | 'forgot' | 'reset'>('login');
  forgotEmail = signal('');
  resetCode = signal('');
  newPassword = signal('');

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  private homeRoute(): string {
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
      next: () => this.router.navigate([this.homeRoute()]),
      error: () => {
        this.error.set('Credenciales incorrectas');
        this.loading.set(false);
      },
    });
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
      error: () => {
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
        this.error.set(err.error?.message || 'Código inválido o expirado');
        this.loading.set(false);
      }
    });
  }
}
