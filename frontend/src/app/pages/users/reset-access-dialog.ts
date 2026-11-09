import { Component, ElementRef, HostListener, afterNextRender, inject, input, output, signal, viewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LucideAngularModule, KeyRound, X } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { USER_DIALOG_STYLES } from './user-dialog.styles';

export interface ManagedUser {
  _id: string;
  name?: string;
  email: string;
}

type Mode = 'email' | 'temp';

/**
 * Restablecer el acceso de otra persona: su contraseña actual deja de valer y
 * sus sesiones se cierran. Por correo recibe un código; con contraseña temporal
 * se muestra aquí una sola vez.
 */
@Component({
  selector: 'app-reset-access-dialog',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="ud-overlay" (click)="dismiss()" role="dialog" aria-modal="true" aria-labelledby="ra-title">
      <div class="ud-modal" (click)="$event.stopPropagation()">
        <div class="ud-head">
          <h2 id="ra-title">
            <lucide-icon [img]="KeyRound" [size]="20" [strokeWidth]="2.3"></lucide-icon>
            {{ tempPassword() ? 'Acceso restablecido' : 'Restablecer acceso' }}
          </h2>
          @if (!tempPassword()) {
            <button type="button" class="btn btn-ghost btn-icon" (click)="close()" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="18" [strokeWidth]="2.4"></lucide-icon>
            </button>
          }
        </div>

        @if (tempPassword(); as pass) {
          <p class="ud-sub">Comparte estas credenciales con la persona. La contraseña solo se muestra una vez.</p>
          <div class="ud-cred">
            <div><span>Email</span><strong>{{ user().email }}</strong></div>
            <div><span>Contraseña temporal</span><strong class="ud-pass">{{ pass }}</strong></div>
          </div>
          <p class="ud-muted">Deberá cambiarla al iniciar sesión.</p>
          <div class="ud-actions">
            <button #doneBtn type="button" class="btn btn-primary" (click)="close()">Entendido</button>
          </div>
        } @else {
          <p class="ud-sub">
            La contraseña actual de {{ user().name || user().email }} dejará de funcionar y se cerrarán sus
            sesiones abiertas.
          </p>
          <div class="ud-options" role="radiogroup" aria-label="Cómo recupera el acceso">
            <label class="ud-option" [class.on]="mode() === 'email'">
              <input #firstOption type="radio" name="ra-mode" [checked]="mode() === 'email'" (change)="mode.set('email')" />
              <span>
                <strong>Enviar un código por correo</strong>
                <small>Le llega a {{ user().email }}. Lo usa en "¿Olvidaste tu contraseña?" para elegir una nueva.</small>
              </span>
            </label>
            <label class="ud-option" [class.on]="mode() === 'temp'">
              <input type="radio" name="ra-mode" [checked]="mode() === 'temp'" (change)="mode.set('temp')" />
              <span>
                <strong>Generar una contraseña temporal</strong>
                <small>Te la mostramos ahora para que se la pases. Tendrá que cambiarla al entrar.</small>
              </span>
            </label>
          </div>
          @if (error()) { <p class="ud-error" role="alert">{{ error() }}</p> }
          <div class="ud-actions">
            <button type="button" class="btn btn-secondary" (click)="close()">Cancelar</button>
            <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="submit()">
              {{ busy() ? 'Restableciendo…' : 'Restablecer acceso' }}
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [USER_DIALOG_STYLES],
})
export class ResetAccessDialogComponent {
  private http = inject(HttpClient);
  private toast = inject(ToastService);

  readonly KeyRound = KeyRound;
  readonly X = X;

  user = input.required<ManagedUser>();
  /** `.../users` o `.../admin/users`. */
  apiBase = input.required<string>();
  closed = output<void>();

  mode = signal<Mode>('email');
  busy = signal(false);
  error = signal('');
  tempPassword = signal<string | null>(null);

  private firstOption = viewChild<ElementRef<HTMLInputElement>>('firstOption');

  constructor() {
    afterNextRender(() => this.firstOption()?.nativeElement.focus());
  }

  close() {
    this.closed.emit();
  }

  /** Clic fuera o Escape: con la contraseña temporal a la vista solo se cierra con "Entendido". */
  @HostListener('document:keydown.escape')
  dismiss() {
    if (!this.tempPassword() && !this.busy()) this.closed.emit();
  }

  submit() {
    this.busy.set(true);
    this.error.set('');
    this.http
      .post<{ mode: Mode; tempPassword?: string }>(`${this.apiBase()}/${this.user()._id}/reset-access`, {
        mode: this.mode(),
      })
      .subscribe({
        next: (res) => {
          this.busy.set(false);
          if (res.tempPassword) {
            this.tempPassword.set(res.tempPassword);
            this.toast.success('Acceso restablecido');
          } else {
            this.toast.success(`Código enviado a ${this.user().email}`);
            this.closed.emit();
          }
        },
        error: (err) => {
          this.busy.set(false);
          const msg = err.error?.message || 'No se pudo restablecer el acceso';
          this.error.set(msg);
          this.toast.error(msg);
        },
      });
  }
}
