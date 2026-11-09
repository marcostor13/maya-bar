import { Component, ElementRef, HostListener, OnInit, afterNextRender, inject, input, output, signal, viewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Trash2, X } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { USER_DIALOG_STYLES } from './user-dialog.styles';
import type { ManagedUser } from './reset-access-dialog';

/** Lo que devuelve `GET .../:id/impact`. */
interface DeletionImpact {
  items: { collection: string; label: string; count: number }[];
  total: number;
}

/**
 * Eliminar definitivamente: enseña lo que el usuario tiene asociado y deja
 * elegir a quién reasignarlo (o dejarlo a nivel de empresa).
 */
@Component({
  selector: 'app-user-delete-dialog',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="ud-overlay" (click)="close()" role="dialog" aria-modal="true" aria-labelledby="del-title">
      <div class="ud-modal" (click)="$event.stopPropagation()">
        <div class="ud-head">
          <h2 id="del-title">
            <lucide-icon [img]="Trash2" [size]="20" [strokeWidth]="2.3"></lucide-icon>
            Eliminar a {{ user().name || user().email }}
          </h2>
          <button type="button" class="btn btn-ghost btn-icon" (click)="close()" aria-label="Cerrar">
            <lucide-icon [img]="X" [size]="18" [strokeWidth]="2.4"></lucide-icon>
          </button>
        </div>
        <p class="ud-sub">
          Esta acción no se puede deshacer. Desactivar, en cambio, conserva el usuario y todo su contenido.
        </p>

        @if (loading()) {
          <p class="ud-muted">Calculando qué tiene asociado…</p>
        } @else if (impact(); as imp) {
          @if (imp.total === 0) {
            <p class="ud-muted">Este usuario no tiene contenido asociado.</p>
          } @else {
            <p class="ud-muted">Tiene <strong>{{ imp.total }}</strong> registro(s) asociados:</p>
            <ul class="ud-impact">
              @for (item of imp.items; track item.collection) {
                <li><span>{{ item.label }}</span><strong>{{ item.count }}</strong></li>
              }
            </ul>
            <label class="ud-field">
              <span>¿Qué hacemos con ellos?</span>
              <select class="select" [(ngModel)]="reassignTo" name="reassign" aria-label="Destino del contenido">
                <option value="">Dejarlos a nivel de empresa (los verán los administradores)</option>
                @for (c of candidates(); track c._id) {
                  <option [value]="c._id">Reasignar a {{ c.name || c.email }}</option>
                }
              </select>
            </label>
          }
        }
        @if (error()) { <p class="ud-error" role="alert">{{ error() }}</p> }

        <div class="ud-actions">
          <button #cancelBtn type="button" class="btn btn-secondary" (click)="close()">Cancelar</button>
          <button type="button" class="btn btn-danger" (click)="confirm()" [disabled]="loading() || busy()">
            {{ busy() ? 'Eliminando…' : 'Eliminar definitivamente' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [USER_DIALOG_STYLES],
})
export class UserDeleteDialogComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);

  readonly Trash2 = Trash2;
  readonly X = X;

  user = input.required<ManagedUser>();
  apiBase = input.required<string>();
  deleted = output<string>();
  closed = output<void>();

  impact = signal<DeletionImpact | null>(null);
  candidates = signal<ManagedUser[]>([]);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  reassignTo = '';

  private cancelBtn = viewChild<ElementRef<HTMLButtonElement>>('cancelBtn');

  constructor() {
    afterNextRender(() => this.cancelBtn()?.nativeElement.focus());
  }

  ngOnInit() {
    const base = `${this.apiBase()}/${this.user()._id}`;
    this.http.get<DeletionImpact>(`${base}/impact`).subscribe({
      next: (imp) => {
        this.impact.set(imp);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        const msg = err.error?.message || 'No se pudo calcular el impacto';
        this.error.set(msg);
        this.toast.error(msg);
      },
    });
    this.http.get<ManagedUser[]>(`${base}/reassign-candidates`).subscribe({
      next: (list) => this.candidates.set(list),
      error: () => this.candidates.set([]),
    });
  }

  @HostListener('document:keydown.escape')
  close() {
    if (!this.busy()) this.closed.emit();
  }

  confirm() {
    this.busy.set(true);
    this.error.set('');
    const params = new URLSearchParams({ mode: 'delete' });
    if (this.reassignTo) params.set('reassignTo', this.reassignTo);
    this.http.delete<{ reassigned: number }>(`${this.apiBase()}/${this.user()._id}?${params}`).subscribe({
      next: (res) => {
        this.busy.set(false);
        this.toast.success(
          res.reassigned > 0
            ? `Usuario eliminado; ${res.reassigned} registro(s) ${this.reassignTo ? 'reasignados' : 'liberados'}`
            : 'Usuario eliminado',
        );
        this.deleted.emit(this.user()._id);
      },
      error: (err) => {
        this.busy.set(false);
        const msg = err.error?.message || 'No se pudo eliminar el usuario';
        this.error.set(msg);
        this.toast.error(msg);
      },
    });
  }
}
