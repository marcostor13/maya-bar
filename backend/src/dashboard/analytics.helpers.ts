/**
 * Cálculos puros de la analítica del dashboard: rango de fechas, cubetas de la
 * serie temporal y tiempos de respuesta. Sin Mongo, para poder probarlos.
 */

export const RANGES = ['7d', '30d', '90d', '12m'] as const;
export type RangeKey = (typeof RANGES)[number];

export type Bucket = 'day' | 'month';

export interface ResolvedRange {
  key: RangeKey;
  from: Date;
  to: Date;
  /** Periodo anterior de la misma duración, para comparar. */
  prevFrom: Date;
  prevTo: Date;
  bucket: Bucket;
  /** Etiquetas de cada cubeta (YYYY-MM-DD o YYYY-MM) en la zona del usuario. */
  buckets: string[];
  timezone: string;
}

const DAY_MS = 86_400_000;

/** Zona horaria IANA válida o Lima por defecto (la mayoría de los tenants). */
export function safeTimezone(tz?: string): string {
  if (!tz) return 'America/Lima';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'America/Lima';
  }
}

/** YYYY-MM-DD de una fecha en una zona horaria. */
export function dayKey(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/**
 * El periodo termina ahora y abarca los últimos N días (o 12 meses, por
 * mes). Las cubetas se generan todas, también las vacías: un día sin
 * mensajes es un cero en la gráfica, no un hueco.
 */
export function resolveRange(
  key: string | undefined,
  timezone: string,
  now = new Date(),
): ResolvedRange {
  const k: RangeKey = (RANGES as readonly string[]).includes(key ?? '')
    ? (key as RangeKey)
    : '30d';
  const to = now;
  let from: Date;
  let bucket: Bucket = 'day';
  const buckets: string[] = [];

  if (k === '12m') {
    bucket = 'month';
    const today = dayKey(now, timezone);
    const [y, m] = today.split('-').map(Number);
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(y, m - 1 - i, 1));
      buckets.push(
        `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      );
    }
    // Desde el día 1 del primer mes (aproximado en UTC; el margen de horas no
    // cambia un conteo mensual de forma apreciable).
    from = new Date(Date.UTC(y, m - 12, 1));
  } else {
    const days = Number(k.replace('d', ''));
    from = new Date(to.getTime() - days * DAY_MS);
    for (let i = days - 1; i >= 0; i--)
      buckets.push(dayKey(new Date(to.getTime() - i * DAY_MS), timezone));
  }

  const span = to.getTime() - from.getTime();
  return {
    key: k,
    from,
    to,
    prevFrom: new Date(from.getTime() - span),
    prevTo: from,
    bucket,
    buckets,
    timezone,
  };
}

/** Coloca los conteos agregados en su cubeta; lo que falta queda en 0. */
export function fillSeries(
  buckets: string[],
  rows: { _id: string; value: number }[],
): number[] {
  const map = new Map(rows.map((r) => [r._id, r.value]));
  return buckets.map((b) => Math.round((map.get(b) ?? 0) * 100) / 100);
}

/** Formato de $dateToString según la cubeta. */
export function bucketFormat(bucket: Bucket): string {
  return bucket === 'month' ? '%Y-%m' : '%Y-%m-%d';
}

export interface ResponseSample {
  conversationId: string;
  direction: 'in' | 'out';
  author: string;
  at: Date;
}

export interface ResponseStats {
  /** Mediana en minutos del primer mensaje del cliente a la primera respuesta. */
  medianMinutes: number | null;
  p90Minutes: number | null;
  /** Porcentaje de turnos respondidos en 5 minutos o menos. */
  withinFiveMinutes: number | null;
  aiMedianMinutes: number | null;
  humanMedianMinutes: number | null;
  answered: number;
  /** Turnos del cliente que siguen sin respuesta. */
  unanswered: number;
}

export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  );
  return sorted[Math.max(0, idx)];
}

const round1 = (n: number | null) =>
  n === null ? null : Math.round(n * 10) / 10;

/**
 * Tiempo de primera respuesta por turno: desde el primer mensaje del cliente
 * que abre un turno (tras una respuesta nuestra, o al empezar) hasta la
 * siguiente respuesta nuestra. Los mensajes de sistema no cuentan.
 *
 * Espera los mensajes ordenados por conversación y fecha.
 */
export function responseStats(samples: ResponseSample[]): ResponseStats {
  const all: number[] = [];
  const ai: number[] = [];
  const human: number[] = [];
  let unanswered = 0;
  let conv = '';
  let waitingSince: Date | null = null;

  const close = () => {
    if (waitingSince) unanswered++;
    waitingSince = null;
  };

  for (const m of samples) {
    if (m.author === 'system') continue;
    if (m.conversationId !== conv) {
      close();
      conv = m.conversationId;
    }
    if (m.direction === 'in') {
      if (!waitingSince) waitingSince = m.at;
      continue;
    }
    if (waitingSince) {
      const minutes = (m.at.getTime() - waitingSince.getTime()) / 60_000;
      all.push(minutes);
      (m.author === 'agent' ? ai : human).push(minutes);
      waitingSince = null;
    }
  }
  close();

  const sort = (a: number[]) => [...a].sort((x, y) => x - y);
  const sAll = sort(all);
  return {
    medianMinutes: round1(percentile(sAll, 50)),
    p90Minutes: round1(percentile(sAll, 90)),
    withinFiveMinutes: sAll.length
      ? Math.round((sAll.filter((m) => m <= 5).length / sAll.length) * 100)
      : null,
    aiMedianMinutes: round1(percentile(sort(ai), 50)),
    humanMedianMinutes: round1(percentile(sort(human), 50)),
    answered: sAll.length,
    unanswered,
  };
}

/** Variación porcentual; null si no hay base con qué comparar. */
export function deltaPct(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}
