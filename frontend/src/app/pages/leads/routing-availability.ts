import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, CircleCheck, CirclePause, Clock, X } from 'lucide-angular';
import { ToastService } from '../../shared/toast';
import { environment } from '../../../environments/environment';

export interface Availability {
  days?: number[];
  from?: number;
  to?: number;
}

/**
 * Interruptor "Disponible" del reparto automático (HU59): cada vendedor dice
 * si quiere recibir oportunidades nuevas y, si quiere, en qué horario.
 */
@Component({
  selector: 'app-routing-availability',
  standalone: true,
  imports: [FormsModule, LucideAngularModule],
  template: `
    <div class="avail">
      <button type="button" class="btn btn-sm" [class.btn-secondary]="available()" [class.btn-ghost]="!available()"
        [disabled]="busy()" (click)="toggle()" [attr.aria-pressed]="available()"
        [title]="available() ? 'Recibes oportunidades del reparto automático' : 'No recibes oportunidades del reparto automático'">
        <lucide-icon [img]="available() ? CircleCheck : CirclePause" [size]="15" [class.on]="available()" />
        {{ available() ? 'Disponible' : 'No disponible' }}
      </button>
      <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="openSchedule()" aria-label="Mi horario de reparto" title="Mi horario de reparto">
        <lucide-icon [img]="Clock" [size]="15" />
      </button>
    </div>

    @if (editing()) {
      <div class="overlay" (click)="editing.set(false)" (keydown.escape)="editing.set(false)">
        <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="sched-title" (click)="$event.stopPropagation()">
          <div class="modal-head">
            <h2 id="sched-title">Mi horario de reparto</h2>
            <button type="button" class="btn btn-ghost btn-icon" (click)="editing.set(false)" aria-label="Cerrar"><lucide-icon [img]="X" [size]="18" /></button>
          </div>
          <p class="muted">Fuera de este horario (hora de Lima) no te llegan oportunidades nuevas. Sin días marcados, vale cualquier día.</p>
          <div class="days">
            @for (d of dayNames; track $index) {
              <button type="button" class="day" [class.active]="days().includes($index)" (click)="toggleDay($index)" [attr.aria-pressed]="days().includes($index)">{{ d }}</button>
            }
          </div>
          <div class="hours">
            <label>Desde
              <select class="select" [(ngModel)]="from">
                @for (h of hours; track h) { <option [ngValue]="h">{{ h }}:00</option> }
              </select>
            </label>
            <label>Hasta
              <select class="select" [(ngModel)]="to">
                @for (h of hours; track h) { <option [ngValue]="h + 1">{{ h + 1 }}:00</option> }
              </select>
            </label>
          </div>
          <div class="actions">
            <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="clearSchedule()">Sin horario</button>
            <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="saveSchedule()">Guardar</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .avail { display: inline-flex; align-items: center; gap: 4px; }
    .on { color: var(--color-brand); }
    .overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; z-index: 100; }
    .modal { width: calc(100% - 48px); max-width: 480px; padding: 28px 32px; background: var(--color-white); border-radius: var(--radius-lg); }
    .modal-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
    h2 { font-family: var(--font-heading); font-size: 18px; margin: 0; }
    .muted { color: var(--color-text-muted); font-size: 13px; margin: 8px 0 16px; }
    .days { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }
    .day { border: 1px solid var(--color-border); background: var(--color-white); border-radius: var(--radius-pill); padding: 6px 12px; font-size: 13px; cursor: pointer; color: var(--color-text-main); }
    .day.active { background: var(--color-brand); border-color: var(--color-brand); color: var(--color-white); }
    .hours { display: flex; gap: 12px; }
    .hours label { flex: 1; display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; }
    .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px; }
  `],
})
export class RoutingAvailabilityComponent implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private api = `${environment.apiUrl}/routing/availability`;

  readonly CircleCheck = CircleCheck; readonly CirclePause = CirclePause; readonly Clock = Clock; readonly X = X;
  readonly dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  readonly hours = Array.from({ length: 24 }, (_, i) => i);

  available = signal(true);
  schedule = signal<Availability | null>(null);
  editing = signal(false);
  busy = signal(false);
  days = signal<number[]>([]);
  from = 9;
  to = 18;

  ngOnInit() {
    this.http.get<{ available: boolean; availability: Availability | null }>(this.api).subscribe({
      next: (r) => { this.available.set(r.available); this.schedule.set(r.availability); },
      error: () => undefined,
    });
  }

  toggle() {
    this.save({ available: !this.available() }, this.available() ? 'Ya no recibes oportunidades nuevas' : 'Vuelves a recibir oportunidades');
  }

  openSchedule() {
    const s = this.schedule();
    this.days.set([...(s?.days ?? [])]);
    this.from = s?.from ?? 9;
    this.to = s?.to ?? 18;
    this.editing.set(true);
  }

  toggleDay(d: number) {
    this.days.update((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d].sort()));
  }

  saveSchedule() {
    if (this.from === this.to) { this.toast.error('El horario debe durar al menos una hora'); return; }
    this.save({ availability: { days: this.days(), from: this.from, to: this.to } }, 'Horario guardado', true);
  }

  clearSchedule() {
    this.save({ availability: null }, 'Recibes a cualquier hora', true);
  }

  private save(body: { available?: boolean; availability?: Availability | null }, ok: string, close = false) {
    this.busy.set(true);
    this.http.patch<{ available: boolean; availability: Availability | null }>(this.api, body).subscribe({
      next: (r) => {
        this.available.set(r.available);
        this.schedule.set(r.availability);
        this.busy.set(false);
        if (close) this.editing.set(false);
        this.toast.success(ok);
      },
      error: (e: { error?: { message?: string } }) => {
        this.busy.set(false);
        this.toast.error(e.error?.message || 'No se pudo guardar');
      },
    });
  }
}
