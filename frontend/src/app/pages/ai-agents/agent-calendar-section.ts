import { Component, OnInit, computed, inject, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, CalendarDays, TriangleAlert } from 'lucide-angular';
import { CalendarService, type CalendarConnection } from '../../shared/calendar.service';

/** Franja de atención de un día (0 = domingo) en hora local. */
export interface WorkingHours {
  day: number;
  start: string;
  end: string;
}

/** Agendamiento del agente IA (debe coincidir con AgentCalendarDto del backend). */
export interface AgentCalendar {
  enabled: boolean;
  connectionId?: string;
  durationMinutes: number;
  timeZone: string;
  hours: WorkingHours[];
  bufferMinutes: number;
  minNoticeHours: number;
  maxDaysAhead: number;
  video: boolean;
  title: string;
  instructions?: string;
}

export function blankAgentCalendar(): AgentCalendar {
  return {
    enabled: false,
    connectionId: '',
    durationMinutes: 30,
    timeZone: 'America/Lima',
    hours: [1, 2, 3, 4, 5].map((day) => ({ day, start: '09:00', end: '18:00' })),
    bufferMinutes: 0,
    minNoticeHours: 2,
    maxDaysAhead: 30,
    video: true,
    title: 'Cita',
    instructions: '',
  };
}

/** Solo los campos del DTO: lo que venga de más del servidor no se reenvía. */
export function normalizeAgentCalendar(c?: Partial<AgentCalendar> | null): AgentCalendar {
  const b = blankAgentCalendar();
  const v = { ...b, ...(c ?? {}) };
  return {
    enabled: !!v.enabled,
    connectionId: v.connectionId || '',
    durationMinutes: Number(v.durationMinutes) || b.durationMinutes,
    timeZone: v.timeZone || b.timeZone,
    hours: (v.hours?.length ? v.hours : b.hours).map((h) => ({ day: h.day, start: h.start, end: h.end })),
    bufferMinutes: Number(v.bufferMinutes) || 0,
    minNoticeHours: Number(v.minNoticeHours ?? b.minNoticeHours),
    maxDaysAhead: Number(v.maxDaysAhead) || b.maxDaysAhead,
    video: v.video !== false,
    title: v.title || b.title,
    instructions: v.instructions || '',
  };
}

/** Cuerpo para la API: sin connectionId vacío (el DTO exige un id válido). */
export function agentCalendarPayload(c: AgentCalendar): AgentCalendar {
  const { connectionId, ...rest } = c;
  return connectionId ? { ...rest, connectionId } : rest;
}

const DAYS = [
  { day: 1, label: 'Lunes' }, { day: 2, label: 'Martes' }, { day: 3, label: 'Miércoles' },
  { day: 4, label: 'Jueves' }, { day: 5, label: 'Viernes' }, { day: 6, label: 'Sábado' },
  { day: 0, label: 'Domingo' },
];

const TIME_ZONES = [
  'America/Lima', 'America/Bogota', 'America/Guayaquil', 'America/Mexico_City', 'America/Santiago',
  'America/Argentina/Buenos_Aires', 'America/Caracas', 'America/La_Paz', 'America/Asuncion',
  'America/Montevideo', 'America/Panama', 'America/Costa_Rica', 'America/Guatemala',
  'America/Santo_Domingo', 'America/New_York', 'America/Los_Angeles', 'Europe/Madrid',
];

@Component({
  selector: 'app-agent-calendar-section',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideAngularModule],
  template: `
    <p class="hint lead">
      El agente consulta los horarios libres reales de tu Google Calendar u Outlook y agenda la cita
      durante el chat, con videollamada e invitación por correo. Respeta tu horario de atención y nunca
      ocupa un hueco tomado.
    </p>

    <div class="row-between field">
      <div>
        <label class="label" for="cal-enabled">Agendar citas</label>
        <span class="hint">Le da al agente las herramientas consultar_disponibilidad y agendar_cita.</span>
      </div>
      <label class="switch">
        <input id="cal-enabled" type="checkbox" [ngModel]="config().enabled" (ngModelChange)="patch({ enabled: $event })" />
        <span class="slider"></span>
      </label>
    </div>

    @if (provider() === 'gemini') {
      <div class="notice" role="status">
        <lucide-icon [img]="TriangleAlert" [size]="16" [strokeWidth]="2"></lucide-icon>
        Gemini no ejecuta herramientas en Maya: con este proveedor el agente no puede agendar. Elige otro en Avanzado.
      </div>
    }

    @if (config().enabled) {
      @if (loaded() && !connections().length) {
        <div class="notice" role="status">
          <lucide-icon [img]="TriangleAlert" [size]="16" [strokeWidth]="2"></lucide-icon>
          <span>No hay calendarios conectados. Conecta Google Calendar o Outlook en
            <a routerLink="/settings">Configuración → Calendario</a>; sin eso el agente dirá que un asesor confirmará la cita.</span>
        </div>
      }

      <div class="field">
        <label class="label" for="cal-conn">Calendario</label>
        <select id="cal-conn" class="select" [ngModel]="config().connectionId || ''" (ngModelChange)="patch({ connectionId: $event })">
          <option value="">Predeterminado de la empresa{{ defaultLabel() }}</option>
          @for (c of connections(); track c._id) {
            <option [value]="c._id">{{ c.provider === 'google' ? 'Google' : 'Outlook' }} · {{ c.email }}</option>
          }
        </select>
      </div>

      <div class="grid">
        <div class="field">
          <label class="label" for="cal-dur">Duración</label>
          <select id="cal-dur" class="select" [ngModel]="config().durationMinutes" (ngModelChange)="patch({ durationMinutes: +$event })">
            @for (m of durations; track m) { <option [ngValue]="m">{{ m }} min</option> }
          </select>
        </div>
        <div class="field">
          <label class="label" for="cal-tz">Zona horaria</label>
          <select id="cal-tz" class="select" [ngModel]="config().timeZone" (ngModelChange)="patch({ timeZone: $event })">
            @for (z of timeZones(); track z) { <option [value]="z">{{ z }}</option> }
          </select>
        </div>
      </div>

      <div class="field">
        <span class="label">Horario de atención</span>
        <div class="days">
          @for (d of days; track d.day) {
            <div class="day" [class.off]="!franja(d.day)">
              <label class="day-check">
                <input type="checkbox" [checked]="!!franja(d.day)" (change)="toggleDay(d.day)" [attr.aria-label]="'Atender el ' + d.label" />
                {{ d.label }}
              </label>
              @if (franja(d.day); as f) {
                <input class="input input-time" type="time" [value]="f.start" (change)="setTime(d.day, 'start', $any($event.target).value)" [attr.aria-label]="'Desde, ' + d.label" />
                <span class="hint">a</span>
                <input class="input input-time" type="time" [value]="f.end" (change)="setTime(d.day, 'end', $any($event.target).value)" [attr.aria-label]="'Hasta, ' + d.label" />
              } @else {
                <span class="hint">Cerrado</span>
              }
            </div>
          }
        </div>
        @if (!config().hours.length) { <span class="hint error">Activa al menos un día.</span> }
      </div>

      <div class="grid three">
        <div class="field">
          <label class="label" for="cal-notice">Antelación mínima (h)</label>
          <input id="cal-notice" class="input" type="number" min="0" max="720" [ngModel]="config().minNoticeHours" (ngModelChange)="patch({ minNoticeHours: +$event })" />
        </div>
        <div class="field">
          <label class="label" for="cal-days">Hasta cuántos días</label>
          <input id="cal-days" class="input" type="number" min="1" max="180" [ngModel]="config().maxDaysAhead" (ngModelChange)="patch({ maxDaysAhead: +$event })" />
        </div>
        <div class="field">
          <label class="label" for="cal-buffer">Margen entre citas (min)</label>
          <input id="cal-buffer" class="input" type="number" min="0" max="120" [ngModel]="config().bufferMinutes" (ngModelChange)="patch({ bufferMinutes: +$event })" />
        </div>
      </div>

      <div class="grid">
        <div class="field">
          <label class="label" for="cal-title">Título del evento</label>
          <input id="cal-title" class="input" maxlength="80" [ngModel]="config().title" (ngModelChange)="patch({ title: $event })" placeholder="Cita" />
          <span class="hint">En el calendario: «{{ config().title || 'Cita' }} – nombre del cliente».</span>
        </div>
        <div class="row-between field">
          <div>
            <label class="label" for="cal-video">Videollamada</label>
            <span class="hint">Google Meet u Microsoft Teams según el calendario.</span>
          </div>
          <label class="switch">
            <input id="cal-video" type="checkbox" [ngModel]="config().video" (ngModelChange)="patch({ video: $event })" />
            <span class="slider"></span>
          </label>
        </div>
      </div>

      <div class="field">
        <label class="label" for="cal-instr">Indicaciones para agendar</label>
        <textarea id="cal-instr" class="textarea" rows="3" maxlength="2000" [ngModel]="config().instructions" (ngModelChange)="patch({ instructions: $event })"
          placeholder="Ej.: es una demo de 30 min del producto; antes pregunta el tamaño del equipo de ventas."></textarea>
      </div>

      <p class="hint">
        <lucide-icon [img]="CalendarDays" [size]="14" [strokeWidth]="2"></lucide-icon>
        Cada cita queda como nota en la conversación. En la prueba del agente la cita se simula y no se crea.
      </p>
    }
  `,
  styles: [`
    :host { display: block; }
    .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 18px; }
    .label { font-size: 13px; font-weight: 600; color: var(--color-text-main); }
    .hint { font-size: 12px; color: var(--color-text-muted); display: inline-flex; align-items: center; gap: 6px; }
    .hint.lead { display: block; margin-bottom: 16px; }
    .hint.error { color: var(--color-error); }
    .row-between { flex-direction: row; align-items: center; justify-content: space-between; gap: 16px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .grid.three { grid-template-columns: repeat(3, 1fr); }
    .textarea { resize: vertical; min-height: 80px; }
    .notice { display: flex; align-items: flex-start; gap: 8px; padding: 12px 14px; margin-bottom: 18px; border-radius: var(--radius-lg);
      border: 1px solid var(--color-warning); background: var(--color-bg-app); color: var(--color-text-main); font-size: 13px; }
    .notice lucide-icon { color: var(--color-warning); flex-shrink: 0; margin-top: 1px; }
    .notice a { color: var(--color-brand); font-weight: 600; }
    .days { display: flex; flex-direction: column; gap: 8px; }
    .day { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-height: 40px; }
    .day.off .day-check { color: var(--color-text-muted); }
    .day-check { display: inline-flex; align-items: center; gap: 8px; width: 120px; font-size: 13px; font-weight: 600; cursor: pointer; }
    .day-check input { width: 18px; height: 18px; accent-color: var(--color-brand); }
    .input-time { width: 120px; }
    .switch { position: relative; display: inline-block; width: 44px; height: 24px; flex-shrink: 0; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider { position: absolute; inset: 0; background: var(--color-border); border-radius: 24px; transition: .2s; cursor: pointer; }
    .slider::before { content: ''; position: absolute; height: 18px; width: 18px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: .2s; }
    .switch input:checked + .slider { background: var(--color-brand); }
    .switch input:checked + .slider::before { transform: translateX(20px); }
    .switch input:focus-visible + .slider { outline: 2px solid var(--color-brand); outline-offset: 2px; }
    @media (max-width: 640px) { .grid, .grid.three { grid-template-columns: 1fr; } }
  `],
})
export class AgentCalendarSection implements OnInit {
  readonly CalendarDays = CalendarDays;
  readonly TriangleAlert = TriangleAlert;

  config = model.required<AgentCalendar>();
  /** Proveedor de IA del agente: Gemini no ejecuta herramientas. */
  provider = input<string>('auto');

  private calendar = inject(CalendarService);
  connections = signal<CalendarConnection[]>([]);
  loaded = signal(false);

  readonly days = DAYS;
  readonly durations = [15, 20, 30, 45, 60, 90, 120];
  timeZones = computed(() => {
    const tz = this.config().timeZone;
    return TIME_ZONES.includes(tz) ? TIME_ZONES : [tz, ...TIME_ZONES];
  });
  defaultLabel = computed(() => {
    const d = this.connections().find((c) => c.isDefault);
    return d ? ` (${d.email})` : '';
  });

  ngOnInit() {
    this.calendar.connections().subscribe({
      next: (r) => { this.connections.set(r.connections); this.loaded.set(true); },
      // Sin permiso para ver calendarios: se deja elegir el predeterminado.
      error: () => this.loaded.set(true),
    });
  }

  patch(p: Partial<AgentCalendar>) {
    this.config.set({ ...this.config(), ...p });
  }

  franja(day: number): WorkingHours | undefined {
    return this.config().hours.find((h) => h.day === day);
  }

  toggleDay(day: number) {
    const hours = this.franja(day)
      ? this.config().hours.filter((h) => h.day !== day)
      : [...this.config().hours, { day, start: '09:00', end: '18:00' }];
    this.patch({ hours });
  }

  setTime(day: number, key: 'start' | 'end', value: string) {
    if (!/^\d{2}:\d{2}$/.test(value)) return;
    let done = false;
    // Solo la primera franja del día: si había varias, las demás se conservan.
    const hours = this.config().hours.map((h) => {
      if (h.day !== day || done) return h;
      done = true;
      return { ...h, [key]: value };
    });
    this.patch({ hours });
  }
}
