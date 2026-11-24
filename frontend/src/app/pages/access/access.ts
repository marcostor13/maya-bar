import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideAngularModule, KeyRound, Mail } from 'lucide-angular';
import { AuthService } from '../../auth/auth.service';
import { ToastService } from '../../shared/toast';

/**
 * Primer acceso tras pagar (HU47): el enlace del correo trae token y correo;
 * aquí se crea la contraseña y se entra directo al onboarding.
 */
@Component({
  selector: 'app-access',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideAngularModule],
  template: `
    <div class="access-page">
      <form class="card access animate-fade-in" (ngSubmit)="submit()">
        <img src="/logo.png?v=2" alt="Maya CRM" class="logo" />
        @if (expired()) {
          <lucide-icon [img]="Mail" [size]="36" class="icon" />
          <h1>El enlace ya se usó o venció</h1>
          @if (sent()) {
            <p>Si tu cuenta aún no tiene contraseña, te llegará un enlace nuevo a <b>{{ email }}</b>.</p>
          } @else {
            <p>Pide un enlace nuevo; te llegará a <b>{{ email }}</b>.</p>
          }
          <button type="button" class="btn btn-primary" (click)="resend()" [disabled]="sending() || sent()">
            {{ sent() ? 'Enlace enviado' : sending() ? 'Enviando…' : 'Reenviar acceso' }}
          </button>
          <a routerLink="/login" class="link">¿Ya tienes contraseña? Ingresa</a>
        } @else {
          <lucide-icon [img]="KeyRound" [size]="36" class="icon" />
          <h1>Crea tu contraseña</h1>
          <p>Para entrar a tu cuenta <b>{{ email }}</b>.</p>
          <label class="field">
            <span>Contraseña (mínimo 8 caracteres)</span>
            <input class="input" type="password" name="password" [(ngModel)]="password" autocomplete="new-password" minlength="8" required />
          </label>
          <label class="field">
            <span>Repite la contraseña</span>
            <input class="input" type="password" name="confirm" [(ngModel)]="confirm" autocomplete="new-password" required />
          </label>
          @if (error()) { <p class="form-error">{{ error() }}</p> }
          <button type="submit" class="btn btn-primary btn-lg" [disabled]="loading()">
            {{ loading() ? 'Entrando…' : 'Guardar y entrar' }}
          </button>
        }
      </form>
    </div>
  `,
  styles: [`
    .access-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px 16px;
      box-sizing: border-box; background: var(--color-bg-app); }
    .access { width: 100%; max-width: 440px; padding: 32px 28px; display: flex; flex-direction: column; gap: 14px; text-align: center; }
    .logo { height: 36px; align-self: center; }
    .icon { align-self: center; color: var(--color-brand); }
    h1 { font-family: var(--font-heading); font-size: 21px; margin: 0; }
    p { margin: 0; color: var(--color-text-muted); font-size: 14px; }
    .field { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; text-align: left; }
    .form-error { color: var(--color-error); font-size: 13px; }
    .link { font-size: 13px; color: var(--color-brand); }
    .btn { justify-content: center; }
  `],
})
export class AccessComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private q = inject(ActivatedRoute).snapshot.queryParamMap;

  readonly KeyRound = KeyRound;
  readonly Mail = Mail;
  readonly email = this.q.get('email') ?? '';
  private readonly token = this.q.get('token') ?? '';

  password = '';
  confirm = '';
  loading = signal(false);
  error = signal('');
  expired = signal(!this.token || !this.email);
  sending = signal(false);
  sent = signal(false);

  submit() {
    if (this.password.length < 8) { this.error.set('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (this.password !== this.confirm) { this.error.set('Las contraseñas no coinciden.'); return; }
    this.error.set('');
    this.loading.set(true);
    this.auth.redeemAccess(this.email, this.token, this.password).subscribe({
      next: () => {
        this.toast.success('¡Bienvenido! Tu cuenta está lista');
        void this.router.navigateByUrl('/onboarding');
      },
      error: err => {
        this.loading.set(false);
        if (err.error?.code === 'ACCESS_LINK_INVALID') { this.expired.set(true); return; }
        const raw = err.error?.message;
        const msg = Array.isArray(raw) ? raw[0] : raw || 'No se pudo crear la contraseña';
        this.error.set(msg);
        this.toast.error(msg);
      },
    });
  }

  resend() {
    if (!this.email) { void this.router.navigateByUrl('/login'); return; }
    this.sending.set(true);
    this.auth.resendAccess(this.email).subscribe({
      next: () => { this.sending.set(false); this.sent.set(true); this.toast.success('Si tu cuenta está pendiente, te llegará un enlace nuevo'); },
      error: err => { this.sending.set(false); this.toast.error(err.error?.message || 'No se pudo reenviar'); },
    });
  }
}
