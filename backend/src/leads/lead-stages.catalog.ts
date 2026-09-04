/**
 * Etapas del embudo de seguimiento. Viven en el código, igual que el catálogo
 * de módulos: cada etapa tiene un significado para los KPIs (ganada, perdida)
 * y el tablero, así que no se pueden inventar desde una pantalla.
 */

export interface LeadStage {
  /** Clave estable; es lo que se guarda en `leads.stage`. */
  key: string;
  label: string;
  /** Orden de las columnas del tablero. */
  order: number;
  /** Color de la columna y del badge. */
  color: string;
  /** Probabilidad de cierre sugerida, para el valor ponderado del embudo. */
  probability: number;
  /** Etapa final: la oportunidad ya no está abierta. */
  outcome?: 'won' | 'lost';
}

export const LEAD_STAGES: LeadStage[] = [
  { key: 'new', label: 'Nuevo', order: 0, color: '#6366F1', probability: 10 },
  {
    key: 'contacted',
    label: 'Contactado',
    order: 1,
    color: '#0EA5E9',
    probability: 25,
  },
  {
    key: 'qualified',
    label: 'Calificado',
    order: 2,
    color: '#8B5CF6',
    probability: 45,
  },
  {
    key: 'proposal',
    label: 'Propuesta',
    order: 3,
    color: '#F59E0B',
    probability: 65,
  },
  {
    key: 'negotiation',
    label: 'Negociación',
    order: 4,
    color: '#F97316',
    probability: 80,
  },
  {
    key: 'won',
    label: 'Ganado',
    order: 5,
    color: '#10B981',
    probability: 100,
    outcome: 'won',
  },
  {
    key: 'lost',
    label: 'Perdido',
    order: 6,
    color: '#EF4444',
    probability: 0,
    outcome: 'lost',
  },
];

export const LEAD_STAGE_KEYS = LEAD_STAGES.map((s) => s.key);

/** Primera etapa: donde entra todo lo que se crea sin decir en cuál va. */
export const DEFAULT_LEAD_STAGE = LEAD_STAGES[0].key;

export function stageByKey(key: string): LeadStage | undefined {
  return LEAD_STAGES.find((s) => s.key === key);
}

/** 'open' mientras la etapa no sea terminal; si lo es, su desenlace. */
export function statusForStage(key: string): 'open' | 'won' | 'lost' {
  return stageByKey(key)?.outcome ?? 'open';
}

export function stageLabel(key: string): string {
  return stageByKey(key)?.label ?? key;
}

/** Tipos de actividad del historial de la oportunidad. */
export const ACTIVITY_TYPES = [
  'note',
  'call',
  'whatsapp',
  'email',
  'meeting',
  'task',
  'stage_change',
  'system',
] as const;

export type LeadActivityType = (typeof ACTIVITY_TYPES)[number];

/** Actividades que registra la plataforma sola: nadie las escribe a mano. */
export const AUTO_ACTIVITY_TYPES: LeadActivityType[] = [
  'stage_change',
  'system',
];

export const LEAD_PRIORITIES = ['low', 'medium', 'high'] as const;
export type LeadPriority = (typeof LEAD_PRIORITIES)[number];
