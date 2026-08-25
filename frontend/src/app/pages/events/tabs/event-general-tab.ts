import { Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, Save } from 'lucide-angular';
import { EventDetailStore } from '../event-detail.store';

@Component({
  selector: 'app-event-general-tab',
  standalone: true,
  imports: [ReactiveFormsModule, LucideAngularModule, RouterLink],
  template: `
    <div class="p-6">

      <form [formGroup]="form" (ngSubmit)="saveEvent()">

        <div class="field mb-5">
          <label class="field-label">Título del evento *</label>
          <input class="input input-lg" formControlName="title" placeholder="Ej: Cena Degustación 5 Tiempos" autofocus />
          @if (form.get('title')?.invalid && form.get('title')?.touched) {
            <span class="field-hint-error">El título es requerido</span>
          }
        </div>

        <div class="field-row mb-5">
          <div class="field">
            <label class="field-label">Fecha *</label>
            <input class="input" type="date" formControlName="date" />
            @if (form.get('date')?.invalid && form.get('date')?.touched) {
              <span class="field-hint-error">La fecha es requerida</span>
            }
          </div>
          <div class="field">
            <label class="field-label">Estado</label>
            <select class="input" formControlName="status">
              <option value="draft">Borrador</option>
              <option value="published">Publicado</option>
              <option value="cancelled">Cancelado</option>
            </select>
          </div>
        </div>

        <div class="field-row mb-5">
          <div class="field">
            <label class="field-label">Precio (S/)</label>
            <input class="input" type="number" formControlName="price" min="0" />
          </div>
          <div class="field">
            <label class="field-label">Capacidad máx. (0 = ilimitada)</label>
            <input class="input" type="number" formControlName="capacity" min="0" />
          </div>
        </div>

        <div class="field-row mb-6">
          <div class="field">
            <label class="field-label">Hora inicio</label>
            <input class="input" type="time" formControlName="startTime" />
          </div>
          <div class="field">
            <label class="field-label">Hora fin</label>
            <input class="input" type="time" formControlName="endTime" />
          </div>
        </div>

        <div class="form-actions border-t pt-5 mt-2 flex justify-end">
          <button type="button" class="btn btn-secondary mr-3" routerLink="/events">Cancelar</button>
          <button type="submit" class="btn btn-primary" [disabled]="saving() || form.invalid">
            <lucide-icon [img]="Save" [size]="16" [strokeWidth]="2.5"></lucide-icon>
            {{ saving() ? 'Guardando...' : (isNew() ? 'Crear Evento' : 'Actualizar Evento') }}
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .p-6 { padding: 24px; }
    .mb-5 { margin-bottom: 20px; } .mb-6 { margin-bottom: 24px; } .mt-2 { margin-top: 8px; }
    .pt-5 { padding-top: 20px; } .mr-3 { margin-right: 12px; }
    .flex { display: flex; }
    .justify-end { justify-content: flex-end; }
    .border-t { border-top: 1px solid var(--color-border); }

    /* ── Fields ── */
    .field { display: flex; flex-direction: column; gap: 8px; }
    .field-row { display: flex; gap: 20px; }
    .field-row .field { flex: 1; }
    .field-label { font-size: 14px; font-weight: 600; color: var(--color-text-main); }
    .input-lg { font-size: 16px; padding: 12px 16px; }
    .field-hint-error { font-size: 12px; color: var(--color-error); margin-top: 2px; }

    @media (max-width: 768px) {
      .p-6 { padding: 16px; }

      .field-row { flex-direction: column; gap: 16px; }

      .form-actions { flex-direction: column-reverse; gap: 10px; }
      .form-actions .btn { width: 100%; justify-content: center; margin: 0; }
    }
  `],
})
export class EventGeneralTabComponent {
  private store = inject(EventDetailStore);

  readonly Save = Save;

  form = this.store.form;
  saving = this.store.saving;
  isNew = this.store.isNew;

  saveEvent() { this.store.saveEvent(); }
}
