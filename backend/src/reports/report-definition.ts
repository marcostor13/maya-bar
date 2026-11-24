import { BadRequestException } from '@nestjs/common';

/** Fuentes, métricas y agrupaciones del constructor de reportes (HU64). */
export const SOURCES = [
  'leads',
  'customers',
  'conversations',
  'campaigns',
  'registrations',
] as const;
export type ReportSource = (typeof SOURCES)[number];

export const METRICS = [
  'count',
  'sum_value',
  'conversion_rate',
  'avg_days_to_close',
] as const;
export type ReportMetric = (typeof METRICS)[number];

export const GROUPS = [
  'owner',
  'stage',
  'status',
  'source',
  'channel',
  'tag',
  'type',
  'event',
  'day',
  'week',
  'month',
  'none',
] as const;
export type ReportGroup = (typeof GROUPS)[number];

export const CHARTS = ['table', 'bar', 'line'] as const;
export type ReportChart = (typeof CHARTS)[number];

export interface ReportFilters {
  /** Fecha sobre la que se filtra y agrupa (`createdAt` o, en oportunidades, `closedAt`). */
  dateField?: 'createdAt' | 'closedAt' | 'sentAt';
  /** Rango relativo (`last_7`, `last_30`, `this_month`, `last_month`, `this_year`) o fechas. */
  range?:
    | 'last_7'
    | 'last_30'
    | 'last_90'
    | 'this_month'
    | 'last_month'
    | 'this_year'
    | 'custom';
  from?: string;
  to?: string;
  status?: string;
  stage?: string;
  source?: string;
  ownerId?: string;
  tag?: string;
  channel?: string;
}

export interface ReportDefinition {
  source: ReportSource;
  metric: ReportMetric;
  groupBy: ReportGroup;
  filters?: ReportFilters;
}

/** Qué se puede combinar con cada fuente. */
export const ALLOWED: Record<
  ReportSource,
  { metrics: ReportMetric[]; groups: ReportGroup[]; dates: string[] }
> = {
  leads: {
    metrics: ['count', 'sum_value', 'conversion_rate', 'avg_days_to_close'],
    groups: [
      'owner',
      'stage',
      'status',
      'source',
      'tag',
      'day',
      'week',
      'month',
      'none',
    ],
    dates: ['createdAt', 'closedAt'],
  },
  customers: {
    metrics: ['count'],
    groups: ['owner', 'source', 'tag', 'day', 'week', 'month', 'none'],
    dates: ['createdAt'],
  },
  conversations: {
    metrics: ['count'],
    groups: ['channel', 'status', 'day', 'week', 'month', 'none'],
    dates: ['createdAt'],
  },
  campaigns: {
    metrics: ['count', 'sum_value'],
    groups: ['type', 'status', 'day', 'week', 'month', 'none'],
    dates: ['createdAt', 'sentAt'],
  },
  registrations: {
    metrics: ['count'],
    groups: ['event', 'status', 'day', 'week', 'month', 'none'],
    dates: ['createdAt'],
  },
};

/** Tope del rango: un reporte nunca recorre más de un año (protege la base). */
export const MAX_RANGE_DAYS = 366;
const DAY = 86_400_000;
const LIMA_OFFSET_MS = 5 * 3_600_000;

/** Inicio del día en Lima (UTC-5) de la fecha dada, como instante UTC. */
function limaStartOfDay(d: Date) {
  const local = new Date(d.getTime() - LIMA_OFFSET_MS);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) +
      LIMA_OFFSET_MS,
  );
}

export function resolveRange(
  f: ReportFilters = {},
  now = new Date(),
): { from: Date; to: Date } {
  const today = limaStartOfDay(now);
  const local = new Date(now.getTime() - LIMA_OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth();
  const monthStart = (yy: number, mm: number) =>
    new Date(Date.UTC(yy, mm, 1) + LIMA_OFFSET_MS);
  let from: Date;
  let to: Date = now;
  switch (f.range ?? 'last_30') {
    case 'last_7':
      from = new Date(today.getTime() - 6 * DAY);
      break;
    case 'last_90':
      from = new Date(today.getTime() - 89 * DAY);
      break;
    case 'this_month':
      from = monthStart(y, m);
      break;
    case 'last_month':
      from = monthStart(y, m - 1);
      to = new Date(monthStart(y, m).getTime() - 1);
      break;
    case 'this_year':
      from = monthStart(y, 0);
      break;
    case 'custom': {
      if (!f.from || isNaN(Date.parse(f.from)))
        throw new BadRequestException('Indica la fecha de inicio');
      from = /^\d{4}-\d{2}-\d{2}$/.test(f.from)
        ? new Date(Date.parse(f.from) + LIMA_OFFSET_MS)
        : new Date(f.from);
      if (f.to && !isNaN(Date.parse(f.to)))
        to = /^\d{4}-\d{2}-\d{2}$/.test(f.to)
          ? new Date(Date.parse(f.to) + LIMA_OFFSET_MS + DAY - 1)
          : new Date(f.to);
      break;
    }
    default:
      from = new Date(today.getTime() - 29 * DAY);
  }
  if (to < from)
    throw new BadRequestException('La fecha final es anterior a la inicial');
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY)
    throw new BadRequestException(
      `El rango máximo es de ${MAX_RANGE_DAYS} días`,
    );
  return { from, to };
}

/** Valida la combinación y devuelve una definición limpia. */
export function validateDefinition(
  d: Partial<ReportDefinition>,
): ReportDefinition {
  const source = d.source as ReportSource;
  if (!SOURCES.includes(source))
    throw new BadRequestException('Fuente no válida');
  const allowed = ALLOWED[source];
  const metric = d.metric ?? 'count';
  if (!allowed.metrics.includes(metric))
    throw new BadRequestException('Esa métrica no aplica a esta fuente');
  const groupBy = d.groupBy ?? 'none';
  if (!allowed.groups.includes(groupBy))
    throw new BadRequestException('Esa agrupación no aplica a esta fuente');
  const f = { ...(d.filters ?? {}) };
  if (f.dateField && !allowed.dates.includes(f.dateField))
    throw new BadRequestException('Ese campo de fecha no aplica a esta fuente');
  const clean: ReportFilters = {};
  for (const k of [
    'dateField',
    'range',
    'from',
    'to',
    'status',
    'stage',
    'source',
    'ownerId',
    'tag',
    'channel',
  ] as const) {
    const v = f[k];
    if (typeof v === 'string' && v.trim())
      (clean as Record<string, string>)[k] = v.trim().slice(0, 100);
  }
  resolveRange(clean); // valida el rango al guardar
  return { source, metric, groupBy, filters: clean };
}
