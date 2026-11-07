/**
 * Cálculo de horarios libres para agendar. Funciones puras, sin dependencias:
 * la conversión de zona horaria usa `Intl`, que conoce los cambios de horario.
 */

/** Franja de atención de un día de la semana (0 = domingo) en hora local. */
export interface WorkingHours {
  day: number;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

export interface Interval {
  start: Date;
  end: Date;
}

export interface SlotRules {
  timeZone: string;
  hours: WorkingHours[];
  durationMinutes: number;
  bufferMinutes: number;
  minNoticeHours: number;
  maxDaysAhead: number;
}

/** Horario por defecto: lunes a viernes de 9 a 18. */
export const DEFAULT_WORKING_HOURS: WorkingHours[] = [1, 2, 3, 4, 5].map(
  (day) => ({ day, start: '09:00', end: '18:00' }),
);

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function isValidHours(h: WorkingHours): boolean {
  return (
    Number.isInteger(h.day) &&
    h.day >= 0 &&
    h.day <= 6 &&
    HHMM.test(h.start) &&
    HHMM.test(h.end) &&
    h.start < h.end
  );
}

/** Partes de la fecha `d` vista en la zona `tz`. */
function partsIn(d: Date, tz: string) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  }).formatToParts(d);
  const get = (t: string) => f.find((p) => p.type === t)?.value ?? '';
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: weekdays.indexOf(get('weekday')),
  };
}

/** Minutos que la zona `tz` está adelantada respecto a UTC en el instante `d`. */
function offsetMinutes(d: Date, tz: string): number {
  const p = partsIn(d, tz);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return Math.round((asUtc - d.getTime()) / 60_000);
}

/** Instante UTC de una fecha y hora locales de la zona `tz`. */
export function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // Dos pasadas: la segunda corrige si el desfase cambia justo en ese día.
  let ts = guess - offsetMinutes(new Date(guess), tz) * 60_000;
  ts = guess - offsetMinutes(new Date(ts), tz) * 60_000;
  return new Date(ts);
}

/** "lunes 10 de noviembre, 15:30" en la zona del agente. */
export function formatLocal(d: Date, tz: string, locale = 'es'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);
}

/** ISO local sin zona ("2026-11-10T15:30") para que el modelo lo lea y lo devuelva. */
export function localIso(d: Date, tz: string): string {
  const p = partsIn(d, tz);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${z(p.month)}-${z(p.day)}T${z(p.hour)}:${z(p.minute)}`;
}

/**
 * Interpreta lo que manda el modelo: ISO con zona ("…Z", "…-05:00") tal cual;
 * ISO sin zona ("2026-11-10T15:30") como hora local del agente.
 */
export function parseLocalOrIso(value: string, tz: string): Date | null {
  const v = value.trim();
  const local = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?$/.exec(
    v,
  );
  if (local) {
    const [, y, mo, d, h, mi] = local.map(Number);
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
    return zonedToUtc(y, mo, d, h, mi, tz);
  }
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(
      v,
    )
  )
    return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Límites en los que se puede agendar según antelación mínima y días máximos. */
export function bookingWindow(rules: SlotRules, now: Date): Interval {
  return {
    start: new Date(now.getTime() + rules.minNoticeHours * 3_600_000),
    end: new Date(now.getTime() + rules.maxDaysAhead * 86_400_000),
  };
}

/**
 * ¿Cabe una cita que empieza en `start`? Debe estar dentro del horario de un
 * día, dentro de la ventana permitida y sin chocar (con margen) con lo ocupado.
 */
export function isSlotAllowed(
  start: Date,
  rules: SlotRules,
  busy: Interval[],
  now: Date,
): boolean {
  const end = new Date(start.getTime() + rules.durationMinutes * 60_000);
  const win = bookingWindow(rules, now);
  if (start < win.start || end > win.end) return false;

  const p = partsIn(start, rules.timeZone);
  const fits = rules.hours.some((h) => {
    if (h.day !== p.weekday) return false;
    const [sh, sm] = h.start.split(':').map(Number);
    const [eh, em] = h.end.split(':').map(Number);
    const from = zonedToUtc(p.year, p.month, p.day, sh, sm, rules.timeZone);
    const to = zonedToUtc(p.year, p.month, p.day, eh, em, rules.timeZone);
    return start >= from && end <= to;
  });
  if (!fits) return false;

  const pad = rules.bufferMinutes * 60_000;
  const slot = {
    start: new Date(start.getTime() - pad),
    end: new Date(end.getTime() + pad),
  };
  return !busy.some((b) => overlaps(slot, b));
}

/**
 * Horarios libres entre `from` y `to`, en orden, como máximo `limit`. Se
 * prueba cada 30 minutos (o cada duración si es menor) dentro de cada franja.
 */
export function freeSlots(
  rules: SlotRules,
  busy: Interval[],
  range: Interval,
  now: Date,
  limit = 8,
): Date[] {
  const win = bookingWindow(rules, now);
  const from = new Date(Math.max(range.start.getTime(), win.start.getTime()));
  const to = new Date(Math.min(range.end.getTime(), win.end.getTime()));
  if (from >= to) return [];

  const step = Math.min(30, rules.durationMinutes) * 60_000;
  const out: Date[] = [];
  // Se recorre día a día en la zona del agente (el día local puede no coincidir con el UTC).
  const first = partsIn(from, rules.timeZone);
  let cursor = zonedToUtc(
    first.year,
    first.month,
    first.day,
    0,
    0,
    rules.timeZone,
  );
  for (let i = 0; i <= rules.maxDaysAhead + 1 && cursor < to; i++) {
    const p = partsIn(cursor, rules.timeZone);
    const franjas = rules.hours
      .filter((h) => h.day === p.weekday)
      .sort((a, b) => a.start.localeCompare(b.start));
    for (const h of franjas) {
      const [sh, sm] = h.start.split(':').map(Number);
      const [eh, em] = h.end.split(':').map(Number);
      const dayStart = zonedToUtc(
        p.year,
        p.month,
        p.day,
        sh,
        sm,
        rules.timeZone,
      );
      const dayEnd = zonedToUtc(p.year, p.month, p.day, eh, em, rules.timeZone);
      for (
        let t = dayStart.getTime();
        t + rules.durationMinutes * 60_000 <= dayEnd.getTime();
        t += step
      ) {
        const s = new Date(t);
        if (s < from || s >= to) continue;
        if (isSlotAllowed(s, rules, busy, now)) out.push(s);
        if (out.length >= limit) return out;
      }
    }
    // Día siguiente: mediodía local + 24 h evita errores en los cambios de hora.
    const noon = zonedToUtc(p.year, p.month, p.day, 12, 0, rules.timeZone);
    const next = partsIn(new Date(noon.getTime() + 86_400_000), rules.timeZone);
    cursor = zonedToUtc(next.year, next.month, next.day, 0, 0, rules.timeZone);
  }
  return out;
}
