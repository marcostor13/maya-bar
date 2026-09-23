import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';

export interface LeadOwnerOption {
  _id: string;
  name: string;
  email: string;
  role: string;
  /** Oportunidades abiertas que ya lleva: ayuda a repartir con criterio. */
  openLeads?: number;
}

export type AssignMode = 'transfer' | 'release';

/**
 * Modal para derivar una oportunidad a otra persona o soltarla a la bolsa.
 * Solo recoge los datos; la página hace la llamada y muestra el resultado.
 */
@Component({
  selector: 'app-lead-assign',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="overlay" (click)="cancel.emit()" role="dialog" aria-modal="true">
      <div class="modal-card" (click)="$event.stopPropagation()">
        <div class="head">
          <h2>{{ mode() === 'transfer' ? 'Derivar oportunidad' : 'Soltar oportunidad' }}</h2>
          <button class="btn btn-ghost btn-icon" (click)="cancel.emit()" aria-label="Cerrar">
            <lucide-icon [img]="X" [size]="20" [strokeWidth]="2.5" />
          </button>
        </div>
        <p class="lead-title">{{ leadTitle() }}</p>

        @if (mode() === 'transfer') {
          <label class="label" for="assign-to">Para</label>
          <div class="people" id="assign-to" role="radiogroup">
            @for (o of candidates(); track o._id) {
              <button type="button" class="person" role="radio" [attr.aria-checked]="to() === o._id"
                      [class.on]="to() === o._id" (click)="to.set(o._id)">
                <span class="avatar">{{ initials(o.name) }}</span>
                <span class="who"><strong>{{ o.name }}{{ o._id === meId() ? ' (yo)' : '' }}</strong><small>{{ o.email }}</small></span>
                <span class="load" [title]="'Oportunidades abiertas'">{{ o.openLeads ?? 0 }} abiertas</span>
              </button>
            } @empty {
              <p class="empty">No hay otras personas con acceso a Seguimiento.</p>
            }
          </div>
          <label class="label" for="assign-note">Nota para quien la recibe</label>
          <textarea id="assign-note" class="textarea" rows="3" [(ngModel)]="text"
                    placeholder="Contexto: qué se habló, qué falta, por qué se la pasas…"></textarea>
        } @else {
          <p class="hint">Vuelve a la bolsa sin asignar y cualquiera del equipo podrá tomarla.</p>
          <label class="label" for="release-reason">Motivo (opcional)</label>
          <textarea id="release-reason" class="textarea" rows="3" [(ngModel)]="text"
                    placeholder="No es mi zona, no puedo atenderla esta semana…"></textarea>
        }

        <div class="actions">
          <button class="btn btn-secondary" (click)="cancel.emit()">Cancelar</button>
          <button class="btn btn-primary" [disabled]="busy() || (mode() === 'transfer' && !to())" (click)="submit()">
            {{ busy() ? 'Guardando…' : mode() === 'transfer' ? 'Derivar' : 'Soltar' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 110; }
    .modal-card { width: calc(100% - 48px); max-width: 480px; max-height: calc(100vh - 64px); overflow-y: auto; box-sizing: border-box;
      padding: 28px 32px; background: var(--color-white); border-radius: var(--radius-lg); box-shadow: var(--shadow-lg);
      display: flex; flex-direction: column; gap: 10px; animation: pop var(--transition-spring); }
    @keyframes pop { from { transform: scale(0.96); opacity: 0; } }
    .head { display: flex; align-items: center; justify-content: space-between; }
    h2 { margin: 0; font-family: var(--font-heading); font-size: 20px; }
    .lead-title { margin: 0 0 6px; font-size: 13px; color: var(--color-text-muted); }
    .label { font-size: 12px; font-weight: 600; margin-top: 6px; }
    .hint { margin: 0; font-size: 13px; color: var(--color-text-muted); line-height: 1.5; }
    .people { display: flex; flex-direction: column; gap: 6px; max-height: 260px; overflow-y: auto; }
    .person { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: 1.5px solid var(--color-border); border-radius: var(--radius-md);
      background: var(--color-white); cursor: pointer; text-align: left; font: inherit; transition: all var(--transition-fast); }
    .person:hover { border-color: var(--color-text-muted); }
    .person.on { border-color: var(--color-brand); background: var(--color-brand-light); }
    .avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--color-bg-app); color: var(--color-text-main); font-size: 11px; font-weight: 700;
      display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .who { display: flex; flex-direction: column; min-width: 0; flex: 1; }
    .who strong { font-size: 13px; }
    .who small { font-size: 11.5px; color: var(--color-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .load { font-size: 11px; font-weight: 600; color: var(--color-text-muted); background: var(--color-bg-light); padding: 3px 8px; border-radius: var(--radius-pill); white-space: nowrap; }
    .empty { margin: 0; font-size: 13px; color: var(--color-text-muted); }
    .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; }
    @media (prefers-reduced-motion: reduce) { .modal-card { animation: none; } }
  `],
})
export class LeadAssignComponent {
  mode = input<AssignMode>('transfer');
  leadTitle = input('');
  owners = input<LeadOwnerOption[]>([]);
  /** Responsable actual: no se ofrece como destino. */
  currentOwnerId = input('');
  meId = input('');
  busy = input(false);

  confirm = output<{ toUserId?: string; text: string }>();
  cancel = output<void>();

  readonly X = X;
  to = signal('');
  text = '';

  candidates = computed(() => this.owners().filter((o) => o._id !== this.currentOwnerId()));

  initials(name: string): string {
    return name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  }

  submit() {
    if (this.mode() === 'transfer' && !this.to()) return;
    this.confirm.emit({ toUserId: this.mode() === 'transfer' ? this.to() : undefined, text: this.text.trim() });
  }
}
