import { Component, ElementRef, HostListener, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Crown, X } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { ConfirmService } from '../../shared/confirm';
import { USER_DIALOG_STYLES } from './user-dialog.styles';
import type { ManagedUser } from './reset-access-dialog';

/** Pasar la administración a otra persona y quedarse con otro rol. */
@Component({
  selector: 'app-transfer-admin-dialog',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="ud-overlay" (click)="close()" role="dialog" aria-modal="true" aria-labelledby="ta-title">
      <div class="ud-modal" (click)="$event.stopPropagation()">
        <div class="ud-head">
          <h2 id="ta-title">
            <lucide-icon [img]="Crown" [size]="20" [strokeWidth]="2.3"></lucide-icon>
            Traspasar administración
          </h2>
          <button type="button" class="btn btn-ghost btn-icon" (click)="close()" aria-label="Cerrar">
            <lucide-icon [img]="X" [size]="18" [strokeWidth]="2.4"></lucide-icon>
          </button>
        </div>
        <p class="ud-sub">
          La persona elegida pasa a ser administradora. Tú te quedas con el rol que elijas y tendrás que
          volver a cargar la plataforma.
        </p>

        @if (candidates().length === 0) {
          <p class="ud-muted">No hay otros usuarios activos. Crea uno antes de traspasar.</p>
        } @else {
          <label class="ud-field">
            <span>Nuevo administrador</span>
            <select #firstField class="select" [(ngModel)]="toUserId" name="to">
              <option value="" disabled>Elige a una persona</option>
              @for (c of candidates(); track c._id) {
                <option [value]="c._id">{{ c.name || c.email }}</option>
              }
            </select>
          </label>
          <label class="ud-field">
            <span>Tu rol después del traspaso</span>
            <select class="select" [(ngModel)]="newRole" name="role">
              @for (r of myRoles(); track r.key) {
                <option [value]="r.key">{{ r.label }}</option>
              }
            </select>
          </label>
        }
        @if (error()) { <p class="ud-error" role="alert">{{ error() }}</p> }

        <div class="ud-actions">
          <button type="button" class="btn btn-secondary" (click)="close()">Cancelar</button>
          <button type="button" class="btn btn-primary" (click)="submit()"
            [disabled]="busy() || !toUserId || !newRole">
            {{ busy() ? 'Traspasando…' : 'Traspasar' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [USER_DIALOG_STYLES],
})
export class TransferAdminDialogComponent {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private confirm = inject(ConfirmService);

  readonly Crown = Crown;
  readonly X = X;

  candidates = input.required<ManagedUser[]>();
  roles = input.required<{ key: string; label: string }[]>();
  apiBase = input.required<string>();
  done = output<void>();
  closed = output<void>();

  /** No se puede elegir "administrador" para uno mismo: eso no sería traspasar. */
  myRoles = computed(() => this.roles().filter((r) => r.key !== 'TENANT_ADMIN'));

  toUserId = '';
  newRole = 'MANAGER';
  busy = signal(false);
  error = signal('');

  private firstField = viewChild<ElementRef<HTMLSelectElement>>('firstField');

  constructor() {
    afterNextRender(() => {
      if (!this.myRoles().some((r) => r.key === this.newRole)) this.newRole = this.myRoles()[0]?.key ?? '';
      this.firstField()?.nativeElement.focus();
    });
  }

  @HostListener('document:keydown.escape')
  close() {
    // Con la confirmación abierta, Escape solo cierra la confirmación.
    if (this.busy() || this.confirm.state()) return;
    this.closed.emit();
  }

  async submit() {
    const to = this.candidates().find((c) => c._id === this.toUserId);
    const ok = await this.confirm.confirm({
      title: 'Traspasar administración',
      message: `${to?.name || to?.email} será administrador y tú dejarás de serlo. ¿Continuar?`,
      confirmText: 'Traspasar',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(true);
    this.error.set('');
    this.http
      .post(`${this.apiBase()}/transfer-admin`, { toUserId: this.toUserId, newRole: this.newRole })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.toast.success('Administración traspasada');
          this.done.emit();
        },
        error: (err) => {
          this.busy.set(false);
          const msg = err.error?.message || 'No se pudo traspasar la administración';
          this.error.set(msg);
          this.toast.error(msg);
        },
      });
  }
}
