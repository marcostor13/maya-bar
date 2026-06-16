import { Component, inject, signal } from '@angular/core';
import { FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="register-page">
      <div class="register-card card animate-fade-in">
        <div class="register-header">
          <div class="logo-mark">BAR<span>.</span></div>
          <h1>Empieza gratis</h1>
          <p>14 días de prueba, sin tarjeta de crédito.</p>
        </div>

        @if (error()) {
          <div class="alert-error">{{ error() }}</div>
        }

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

          <button type="submit" class="btn btn-primary submit-btn" [disabled]="loading() || form.invalid">
            @if (loading()) { Creando cuenta... } @else { Crear cuenta gratis }
          </button>
        </form>

        <p class="login-link">
          ¿Ya tienes cuenta? <a routerLink="/login">Inicia sesión</a>
        </p>
      </div>
    </div>
  `,
  styles: [`
    .register-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
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

    .logo-mark {
      font-family: var(--font-heading);
      font-size: 28px;
      font-weight: 700;
      color: var(--color-text-main);
      margin-bottom: 16px;
    }

    .logo-mark span { color: var(--color-brand); }

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
  `],
})
export class RegisterComponent {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  loading = signal(false);
  error = signal('');

  form = this.fb.group({
    name: ['', Validators.required],
    ruc: [''],
    phone: [''],
    email: ['', [Validators.required, Validators.email]],
    ownerName: ['', Validators.required],
    ownerPassword: ['', [Validators.required, Validators.minLength(8)]],
  });

  onSubmit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set('');

    const val = this.form.value as any;
    this.auth.register(val).subscribe({
      next: () => this.router.navigate(['/onboarding']),
      error: (err) => {
        this.error.set(err.error?.message || 'Error al crear la cuenta');
        this.loading.set(false);
      },
    });
  }
}
