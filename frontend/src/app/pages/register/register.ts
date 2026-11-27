import { Component, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { ToastService } from '../../shared/toast';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="register-page">
      <div class="register-card card animate-fade-in">
        <div class="register-header">
          <img src="/logo.png?v=2" alt="Maya CRM" class="logo-img" />
          @if (pendingEmail()) {
            <h1>Revisa tu correo</h1>
            <p>Enviamos un código de 6 dígitos a <strong>{{ pendingEmail() }}</strong>.</p>
          } @else {
            <h1>Elige tu plan</h1>
            <p>Las cuentas nuevas se crean al pagar. Te llevamos a los planes…</p>
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
        <a class="btn btn-primary submit-btn" routerLink="/checkout">Ver planes</a>
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
    }
  `],
})
/**
 * Sin registro gratis (HU87): las cuentas nacen al pagar en el checkout. Esta
 * ruta solo confirma el correo de cuentas pendientes (el login manda aquí) y
 * redirige al checkout los enlaces viejos, conservando plan y periodo.
 */
export class RegisterComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  loading = signal(false);
  resending = signal(false);
  error = signal('');
  /** Con valor, la pantalla pide el código enviado a este correo. */
  pendingEmail = signal('');
  code = signal('');

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    // El login manda aquí a quien intenta entrar sin haber confirmado: se le
    // envía un código nuevo y se le pide directamente.
    const email = (history.state as { verifyEmail?: string } | null)?.verifyEmail;
    if (email) {
      this.pendingEmail.set(email);
      this.onResend();
      return;
    }
    this.toCheckout();
  }

  private toCheckout() {
    const q = this.route.snapshot.queryParamMap;
    const queryParams: Record<string, string> = {};
    const plan = q.get('plan');
    const periodo = q.get('periodo') ?? q.get('pago');
    if (plan) queryParams['plan'] = plan;
    if (periodo) queryParams['periodo'] = periodo;
    this.router.navigate(['/checkout'], { queryParams, replaceUrl: true });
  }

  codeValid() {
    return /^\d{6}$/.test(this.code().trim());
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
    this.router.navigate(['/login']);
  }
}
