/**
 * Catálogo único de planes, precios y límites (HU40). Lo leen la landing y el
 * checkout (`GET /public/plans`), los límites (HU42), los créditos (HU43) y
 * los comprobantes. Cambiar un precio aquí no cambia lo que ya paga un
 * cliente: su precio pactado se guarda en la suscripción (HU48).
 */

export const PLAN_IDS = ['inicia', 'crece', 'escala', 'empresa'] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const BILLING_PERIODS = ['monthly', 'quarterly', 'annual'] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

export const CURRENCIES = ['PEN', 'USD'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Meses que cubre cada periodo. */
export const PERIOD_MONTHS: Record<BillingPeriod, number> = {
  monthly: 1,
  quarterly: 3,
  annual: 12,
};

/** IGV de Perú; los precios en PEN del catálogo van sin IGV. */
export const IGV_RATE = 0.18;

/** `null` = ilimitado (o a medida en Empresa). */
export interface PlanLimits {
  users: number | null;
  whatsappNumbers: number | null;
  contacts: number | null;
  mailboxes: number | null;
  aiAgents: number | null;
  activeEvents: number | null;
  campaignEmailsPerMonth: number | null;
  aiCreditsPerMonth: number | null;
}

export type LimitKey = keyof PlanLimits;
/** Orden en que se muestran los recursos (Mi plan, HU44). */
export const LIMIT_KEYS: LimitKey[] = [
  'users',
  'whatsappNumbers',
  'contacts',
  'mailboxes',
  'aiAgents',
  'activeEvents',
  'campaignEmailsPerMonth',
  'aiCreditsPerMonth',
];

/** Funciones que se activan por plan. Las consulta HU42. */
export type PlanFeature =
  | 'whatsapp-campaigns'
  | 'events'
  | 'analytics-full'
  | 'lead-routing'
  | 'automations'
  | 'recovery'
  | 'prospecting'
  | 'multi-local'
  | 'custom-roles'
  | 'impulsadores'
  | 'api'
  | 'audit-log';

export interface PlanDef {
  id: PlanId;
  name: string;
  /** Precio mensual sin IGV; `null` = a medida. */
  monthly: Record<Currency, number> | null;
  limits: PlanLimits;
  features: PlanFeature[];
  /** Se vende por contacto comercial, sin checkout. */
  custom?: boolean;
}

/** Prospección en todos los planes: se paga en créditos de IA (HU42, HU43). */
const INICIA_FEATURES: PlanFeature[] = ['prospecting'];
const CRECE_FEATURES: PlanFeature[] = [
  ...INICIA_FEATURES,
  'whatsapp-campaigns',
  'events',
  'analytics-full',
  'lead-routing',
  'automations',
];
const ESCALA_FEATURES: PlanFeature[] = [
  ...CRECE_FEATURES,
  'recovery',
  'multi-local',
  'custom-roles',
  'impulsadores',
  'api',
  'audit-log',
];

const UNLIMITED: PlanLimits = {
  users: null,
  whatsappNumbers: null,
  contacts: null,
  mailboxes: null,
  aiAgents: null,
  activeEvents: null,
  campaignEmailsPerMonth: null,
  aiCreditsPerMonth: null,
};

export const PLANS: Record<PlanId, PlanDef> = {
  inicia: {
    id: 'inicia',
    name: 'Inicia',
    monthly: { PEN: 99, USD: 29 },
    limits: {
      users: 2,
      whatsappNumbers: 1,
      contacts: 2000,
      mailboxes: 1,
      aiAgents: 1,
      activeEvents: 1,
      campaignEmailsPerMonth: 1000,
      aiCreditsPerMonth: 500,
    },
    features: INICIA_FEATURES,
  },
  crece: {
    id: 'crece',
    name: 'Crece',
    monthly: { PEN: 249, USD: 79 },
    limits: {
      users: 5,
      whatsappNumbers: 2,
      contacts: 15000,
      mailboxes: 3,
      aiAgents: 3,
      activeEvents: null,
      campaignEmailsPerMonth: 10000,
      aiCreditsPerMonth: 3000,
    },
    features: CRECE_FEATURES,
  },
  escala: {
    id: 'escala',
    name: 'Escala',
    monthly: { PEN: 549, USD: 169 },
    limits: {
      users: 12,
      whatsappNumbers: 5,
      contacts: 60000,
      mailboxes: 10,
      aiAgents: null,
      activeEvents: null,
      campaignEmailsPerMonth: 40000,
      aiCreditsPerMonth: 10000,
    },
    features: ESCALA_FEATURES,
  },
  empresa: {
    id: 'empresa',
    name: 'Empresa',
    monthly: null,
    custom: true,
    limits: UNLIMITED,
    features: ESCALA_FEATURES,
  },
};

export function isPlanId(v: unknown): v is PlanId {
  return typeof v === 'string' && (PLAN_IDS as readonly string[]).includes(v);
}

/** Precio sin IGV de un periodo: trimestral −5 %, anual = 10 meses. */
export function priceFor(
  plan: PlanId,
  period: BillingPeriod,
  currency: Currency,
): number | null {
  const base = PLANS[plan].monthly?.[currency];
  if (base == null) return null;
  if (period === 'quarterly') return Math.round(base * 3 * 0.95);
  if (period === 'annual') return base * 10;
  return base;
}

/** Importe con IGV, redondeado a céntimos. */
export function withIgv(amount: number): number {
  return Math.round(amount * (1 + IGV_RATE) * 100) / 100;
}

export interface PublicPlan {
  id: PlanId;
  name: string;
  custom: boolean;
  prices: Record<Currency, Record<BillingPeriod, number> | null>;
  limits: PlanLimits;
  features: PlanFeature[];
}

export interface PublicCatalog {
  igvRate: number;
  periods: Record<BillingPeriod, number>;
  plans: PublicPlan[];
}

export function publicCatalog(): PublicCatalog {
  const prices = (id: PlanId, c: Currency) =>
    PLANS[id].monthly
      ? (Object.fromEntries(
          BILLING_PERIODS.map((p) => [p, priceFor(id, p, c)]),
        ) as Record<BillingPeriod, number>)
      : null;
  return {
    igvRate: IGV_RATE,
    periods: PERIOD_MONTHS,
    plans: PLAN_IDS.map((id) => ({
      id,
      name: PLANS[id].name,
      custom: !!PLANS[id].custom,
      prices: { PEN: prices(id, 'PEN'), USD: prices(id, 'USD') },
      limits: PLANS[id].limits,
      features: PLANS[id].features,
    })),
  };
}

/** Equivalencia de los planes anteriores al catálogo. */
export const LEGACY_PLAN_MAP: Record<string, PlanId> = {
  starter: 'inicia',
  pro: 'crece',
  enterprise: 'escala',
};

/** Suma meses sin pasarse de fin de mes (31 ene + 1 mes = 28/29 feb). */
export function addMonths(d: Date, months: number): Date {
  const r = new Date(d);
  const day = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + months);
  const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate();
  r.setDate(Math.min(day, last));
  return r;
}

/** Orden de los planes para saber si un cambio sube o baja (HU52). */
export const PLAN_RANK: Record<PlanId, number> = {
  inicia: 1,
  crece: 2,
  escala: 3,
  empresa: 4,
};

/**
 * Diferencia prorrateada al subir de plan (HU52 C1), sin IGV: lo que falta
 * del periodo vigente × (precio nuevo − precio pactado). Nunca negativa.
 */
export function prorate(p: {
  oldAmount: number;
  newAmount: number;
  period: BillingPeriod;
  periodEnd: Date;
  now?: Date;
}): number {
  const now = p.now ?? new Date();
  const start = addMonths(p.periodEnd, -PERIOD_MONTHS[p.period]);
  const total = p.periodEnd.getTime() - start.getTime();
  const left = Math.max(0, p.periodEnd.getTime() - now.getTime());
  const fraction = total > 0 ? Math.min(1, left / total) : 0;
  return (
    Math.round(Math.max(0, p.newAmount - p.oldAmount) * fraction * 100) / 100
  );
}
