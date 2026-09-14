import type {
  RecoveryRecipient,
  RecoverySegment,
  RecoveryStage,
} from './recovery-plan.schema';

/**
 * Funciones puras del plan de recuperación: horarios, nombres de plantilla y
 * validaciones. Sin dependencias de Nest para poder probarlas sin montar nada.
 */

export const RECOVERABLE_STAGES: RecoveryStage[] = [
  'interesado',
  'objecion',
  'vio_precio',
  'sin_conversacion',
];

export const EXCLUDED_STAGES: RecoveryStage[] = [
  'cliente',
  'no_encaja',
  'no_contactar',
  'en_curso',
];

/** Segmentos por orden de prioridad: el primero es el que más convierte. */
export const SEGMENT_DEFS: Record<
  string,
  { name: string; description: string; color: string }
> = {
  interesado: {
    name: 'Interesados que se enfriaron',
    description:
      'Mostraron interés claro (pidieron demo, datos o cómo contratar) y dejaron de responder.',
    color: '#10B981',
  },
  objecion: {
    name: 'Dudas sin resolver',
    description:
      'Dejaron una pregunta u objeción concreta que nadie terminó de responder.',
    color: '#F59E0B',
  },
  vio_precio: {
    name: 'Vieron el precio y se fueron',
    description:
      'Recibieron la información y el precio, pero no volvieron a escribir.',
    color: '#6366F1',
  },
  sin_conversacion: {
    name: 'Nunca llegaron a conversar',
    description:
      'Solo tocaron el botón del anuncio o mandaron un mensaje prellenado.',
    color: '#8B5CF6',
  },
};

export const EXCLUSION_REASONS: Record<string, string> = {
  cliente: 'Ya es cliente',
  no_encaja: 'No es público objetivo o dijo que no le interesa',
  no_contactar: 'Pidió no ser contactado o se mostró molesto',
  en_curso: 'Conversación activa: mejor responder desde Conversaciones',
  suppressed: 'Está en la lista de no contactar',
};

export function normalizeStage(value: unknown): RecoveryStage {
  const all = [...RECOVERABLE_STAGES, ...EXCLUDED_STAGES];
  return all.includes(value as RecoveryStage)
    ? (value as RecoveryStage)
    : 'vio_precio';
}

// ──────────────────────────────────────────────────────────────────────────
// Zona horaria
// ──────────────────────────────────────────────────────────────────────────

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** 0 = domingo … 6 = sábado */
  weekday: number;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_NAMES = [
  'Domingo',
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
];

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function zonedParts(date: Date, tz: string): ZonedParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')) % 24,
    minute: Number(get('minute')),
    weekday: WEEKDAYS.indexOf(get('weekday')),
  };
}

/** Instante UTC de una fecha y hora de pared en la zona indicada. */
export function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
): Date {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const p = zonedParts(new Date(wall), tz);
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - wall;
  return new Date(wall - offset);
}

export function hourHistogram(dates: Date[], tz: string): number[] {
  const hist = new Array<number>(24).fill(0);
  for (const d of dates) hist[zonedParts(d, tz).hour]++;
  return hist;
}

/** Con menos mensajes que esto la hora pico es ruido: se usa la de por defecto. */
const MIN_SAMPLE = 20;
const DEFAULT_HOUR = 19;

/**
 * Hora con más actividad entre las 9:00 y las 20:00, sumando la hora siguiente
 * para no elegir un pico aislado. Antes de las 9 y de las 21 en adelante no se
 * manda marketing aunque haya mensajes.
 */
export function bestHour(hist: number[]): number {
  const total = hist.reduce((a, b) => a + b, 0);
  if (total < MIN_SAMPLE) return DEFAULT_HOUR;
  let best = DEFAULT_HOUR;
  let bestScore = -1;
  for (let h = 9; h <= 20; h++) {
    const score = hist[h] + (hist[h + 1] ?? 0) * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }
  return best;
}

/** Martes, miércoles y jueves: los días con más capacidad de decisión. */
const PREFERRED_WEEKDAYS = [2, 3, 4];
/** Margen para que Meta apruebe las plantillas antes del primer envío. */
const APPROVAL_MARGIN_MS = 24 * 60 * 60 * 1000;

export interface ScheduleSuggestion {
  sendAt: Date;
  reason: string;
}

/**
 * Una fecha por segmento, en días preferentes distintos y consecutivos, a la
 * media hora previa a la hora pico (así las tandas caen sobre el pico).
 */
export function recommendSchedule(
  segmentCount: number,
  hist: number[],
  tz: string,
  now = new Date(),
): ScheduleSuggestion[] {
  const hour = bestHour(hist);
  const total = hist.reduce((a, b) => a + b, 0);
  const share = total ? Math.round(((hist[hour] ?? 0) / total) * 100) : 0;
  const hourReason =
    total >= MIN_SAMPLE
      ? `las ${String(hour).padStart(2, '0')}:00 es la hora en la que más te escriben tus clientes (${share} % de los mensajes)`
      : 'a primera hora de la noche, cuando la gente revisa WhatsApp con calma';

  const start = zonedParts(new Date(now.getTime() + APPROVAL_MARGIN_MS), tz);
  const suggestions: ScheduleSuggestion[] = [];
  for (
    let offset = 0;
    suggestions.length < segmentCount && offset < 60;
    offset++
  ) {
    // Mediodía UTC del día candidato: evita saltos de fecha al cambiar de zona.
    const candidate = new Date(
      Date.UTC(start.year, start.month - 1, start.day + offset, 12),
    );
    const weekday = candidate.getUTCDay();
    if (!PREFERRED_WEEKDAYS.includes(weekday)) continue;
    const sendAt = zonedToUtc(
      candidate.getUTCFullYear(),
      candidate.getUTCMonth() + 1,
      candidate.getUTCDate(),
      hour - 1,
      30,
      tz,
    );
    if (sendAt.getTime() < now.getTime() + APPROVAL_MARGIN_MS) continue;
    suggestions.push({
      sendAt,
      reason: `${WEEKDAY_NAMES[weekday]}: a mitad de semana se decide mejor. Y ${hourReason}.`,
    });
  }
  return suggestions;
}

// ──────────────────────────────────────────────────────────────────────────
// Plantillas
// ──────────────────────────────────────────────────────────────────────────

/** Nombre válido para Meta: minúsculas, dígitos y guiones bajos. */
export function buildTemplateName(key: string, now = new Date()): string {
  const date = now.toISOString().slice(2, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6);
  const slug = key
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return `recuperacion_${slug}_${date}_${rand}`.slice(0, 512);
}

/**
 * Motivo por el que Meta rechazaría el cuerpo, o `null` si es válido.
 * Solo se admite {{1}} (el nombre), y nunca al principio ni al final.
 */
export function validateTemplateBody(body: string): string | null {
  const text = body?.trim() ?? '';
  if (!text) return 'El mensaje está vacío';
  if (text.length > 1024)
    return `El mensaje tiene ${text.length} caracteres; WhatsApp admite 1024`;
  const vars = [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);
  if (vars.some((v) => v !== '1'))
    return 'Solo se puede usar la variable {{1}} (el nombre del cliente)';
  if (/^\{\{\s*1\s*\}\}/.test(text) || /\{\{\s*1\s*\}\}[\s.!?¿¡]*$/.test(text))
    return 'La variable {{1}} no puede ir al principio ni al final del mensaje';
  if (/\n{3,}/.test(text)) return 'No dejes más de una línea en blanco seguida';
  return null;
}

export function usesNameVariable(body: string): boolean {
  return /\{\{\s*1\s*\}\}/.test(body);
}

/**
 * Valor de {{1}}: el primer nombre si parece un nombre de verdad. Si no lo es
 * (vacío, un número, un emoji), "de nuevo" deja la frase "Hola {{1}}," natural.
 */
export function firstNameParam(name: string | undefined): string {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? '';
  if (!/^[\p{L}][\p{L}'-]{1,24}$/u.test(first)) return 'de nuevo';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

// ──────────────────────────────────────────────────────────────────────────
// Envío por tandas
// ──────────────────────────────────────────────────────────────────────────

export const DEFAULT_BATCHING = {
  firstBatchSize: 10,
  firstPauseMinutes: 30,
  batchSize: 15,
  batchIntervalMinutes: 10,
};

/** Destinatarios de la próxima tanda y cuándo toca la siguiente. */
export function nextBatch(
  segment: Pick<
    RecoverySegment,
    | 'recipients'
    | 'firstBatchSize'
    | 'firstPauseMinutes'
    | 'batchSize'
    | 'batchIntervalMinutes'
  >,
  now = new Date(),
): { batch: RecoveryRecipient[]; nextAt: Date; last: boolean } {
  const pending = segment.recipients.filter(
    (r) => !r.sendStatus || r.sendStatus === 'pending',
  );
  const started = segment.recipients.some(
    (r) => r.sendStatus && r.sendStatus !== 'pending',
  );
  const size = Math.max(
    1,
    started ? segment.batchSize : segment.firstBatchSize,
  );
  const pause = started
    ? segment.batchIntervalMinutes
    : segment.firstPauseMinutes;
  const batch = pending.slice(0, size);
  return {
    batch,
    nextAt: new Date(now.getTime() + Math.max(1, pause) * 60_000),
    last: pending.length <= size,
  };
}
