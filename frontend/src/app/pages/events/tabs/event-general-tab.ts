import { Component, inject } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { EventDetailStore } from '../event-detail.store';

@Component({
  selector: 'app-event-general-tab',
  standalone: true,
  imports: [ReactiveFormsModule],
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

        <div class="field mb-5">
          <label class="field-label" for="ev-description">Descripción</label>
          <textarea id="ev-description" class="textarea" formControlName="description" rows="4"
            placeholder="Qué es, qué incluye, cómo llegar..."></textarea>
          <span class="field-hint">Se muestra en la página pública del evento.</span>
        </div>

        <div class="field mb-5">
          <label class="field-label" for="ev-location">Lugar (opcional)</label>
          <input id="ev-location" class="input" formControlName="location" maxlength="200"
            placeholder="Vacío = la dirección del local" autocomplete="street-address" />
          <span class="field-hint">Los invitados lo ven con un botón "Cómo llegar".</span>
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

        <!-- Guardar: barra fija del detalle (HU29). Enter en un campo también guarda. -->
        <button type="submit" hidden aria-hidden="true" tabindex="-1"></button>
      </form>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .p-6 { padding: 24px; }
    .mb-5 { margin-bottom: 20px; } .mb-6 { margin-bottom: 24px; }
    .field-hint { font-size: 12px; color: var(--color-text-muted); }

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
    }
  `],
})
export class EventGeneralTabComponent {
  private store = inject(EventDetailStore);

  form = this.store.form;

  saveEvent() { this.store.saveEvent(); }
}
