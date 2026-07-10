import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../auth/auth.service';
import { environment } from '../../../environments/environment';

const API = environment.apiUrl;

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="cp-wrap">
      <div class="cp-card card animate-fade-in">
        <div class="cp-header">
          <div class="cp-icon">🔐</div>
          <h1>Cambiar contraseña</h1>
          <p class="cp-sub">Tu cuenta tiene una contraseña temporal. Debes establecer una nueva para continuar.</p>
        </div>

        <form (ngSubmit)="submit()" #f="ngForm" class="cp-form">
          <div class="field">
            <label>Contraseña temporal</label>
            <div class="input-eye-wrap">
              <input
                class="input"
                [type]="showCurrent() ? 'text' : 'password'"
                name="currentPassword"
                [(ngModel)]="form.currentPassword"
                required
                placeholder="Contraseña recibida"
              />
              <button type="button" class="eye-btn" (click)="showCurrent.set(!showCurrent())">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  @if (showCurrent()) {
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  } @else {
                    <path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z"/>
                    <circle cx="12" cy="12" r="3"/>
                  }
                </svg>
              </button>
            </div>
          </div>

          <div class="field">
            <label>Nueva contraseña</label>
            <div class="input-eye-wrap">
              <input
                class="input"
                [type]="showNew() ? 'text' : 'password'"
                name="newPassword"
                [(ngModel)]="form.newPassword"
                required
                minlength="8"
                placeholder="Mínimo 8 caracteres"
              />
              <button type="button" class="eye-btn" (click)="showNew.set(!showNew())">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  @if (showNew()) {
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  } @else {
                    <path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12z"/>
                    <circle cx="12" cy="12" r="3"/>
                  }
                </svg>
              </button>
            </div>
          </div>

          <div class="field">
            <label>Confirmar contraseña</label>
            <input
              class="input"
              type="password"
              name="confirm"
              [(ngModel)]="form.confirm"
              required
              placeholder="Repite la nueva contraseña"
            />
          </div>

          @if (error()) {
            <p class="form-error">{{ error() }}</p>
          }

          <button class="btn btn-primary" type="submit" [disabled]="loading() || !f.valid">
            @if (loading()) { Guardando… } @else { Establecer contraseña }
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .cp-wrap {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-bg-light);
      padding: 24px;
    }

    .cp-card {
      width: 100%;
      max-width: 420px;
      padding: 40px 36px;
    }

    .cp-header {
      text-align: center;
      margin-bottom: 28px;
    }

    .cp-icon {
      font-size: 36px;
      margin-bottom: 12px;
    }

    h1 {
      font-family: var(--font-heading);
      font-size: 22px;
      font-weight: 700;
      color: var(--color-text-main);
      margin: 0 0 8px;
    }

    .cp-sub {
      font-size: 13px;
      color: var(--color-text-muted);
      line-height: 1.5;
      margin: 0;
    }

    .cp-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    label {
      font-size: 13px;
      font-weight: 500;
      color: var(--color-text-main);
    }

    .input-eye-wrap {
      position: relative;
    }

    .input-eye-wrap .input {
      width: 100%;
      box-sizing: border-box;
      padding-right: 40px;
    }

    .eye-btn {
      position: absolute;
      right: 10px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      cursor: pointer;
      color: var(--color-text-muted);
      padding: 2px;
      display: flex;
      align-items: center;
    }

    .form-error {
      font-size: 13px;
      color: var(--color-error);
      margin: 0;
    }

    .btn-primary {
      margin-top: 4px;
    }

    @media (max-width: 768px) {
      .cp-wrap { padding: 16px; }
      .cp-card { padding: 28px 22px; }
      .eye-btn { min-width: 44px; min-height: 44px; justify-content: center; right: 0; }
      .input-eye-wrap .input { padding-right: 46px; }
    }

    @media (max-width: 480px) {
      .cp-card { padding: 24px 16px; }
      h1 { font-size: 20px; }
    }
  `],
})
export class ChangePasswordComponent {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private router = inject(Router);

  form = { currentPassword: '', newPassword: '', confirm: '' };
  loading = signal(false);
  error = signal('');
  showCurrent = signal(false);
  showNew = signal(false);

  submit() {
    this.error.set('');
    if (this.form.newPassword !== this.form.confirm) {
      this.error.set('Las contraseñas no coinciden');
      return;
    }
    if (this.form.newPassword.length < 8) {
      this.error.set('La contraseña debe tener al menos 8 caracteres');
      return;
    }
    this.loading.set(true);
    this.http
      .patch<any>(`${API}/auth/change-password`, {
        currentPassword: this.form.currentPassword,
        newPassword: this.form.newPassword,
      })
      .subscribe({
        next: (res) => {
          this.loading.set(false);
          this.auth.updateSession(res);
          const role = res.user?.role;
          this.router.navigate([role === 'SUPERADMIN' ? '/admin/tenants' : '/dashboard']);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err.error?.message || 'Error al cambiar la contraseña');
        },
      });
  }
}
