import { PERIOD_MONTHS } from '../billing/plans.catalog';
import type { BillingPeriod, Currency } from '../billing/plans.catalog';

/** Lo mínimo de la empresa para medir ingresos recurrentes (HU57). */
export interface MrrInput {
  plan?: string;
  subscription?: {
    status?: string;
    period?: BillingPeriod;
    currency?: Currency;
    /** Precio pactado por periodo, sin IGV. */
    amount?: number;
  } | null;
}

export type MoneyByCurrency = Record<Currency, number>;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Mensual equivalente de una suscripción activa; 0 si no cuenta. */
export function monthlyEquivalent(t: MrrInput): number {
  const s = t.subscription;
  if (!s || s.status !== 'active' || !s.period || !PERIOD_MONTHS[s.period])
    return 0;
  const amount = Number(s.amount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return amount / PERIOD_MONTHS[s.period];
}

/**
 * MRR (HU57 C1): suma de las suscripciones activas normalizadas a mensual,
 * sin IGV y por moneda (no se convierten soles a dólares).
 */
export function computeMrr(tenants: MrrInput[]): {
  total: MoneyByCurrency;
  byPlan: { plan: string; count: number; mrr: MoneyByCurrency }[];
} {
  const total: MoneyByCurrency = { PEN: 0, USD: 0 };
  const plans = new Map<string, { count: number; mrr: MoneyByCurrency }>();
  for (const t of tenants) {
    const m = monthlyEquivalent(t);
    if (!m) continue;
    const cur: Currency = t.subscription?.currency === 'USD' ? 'USD' : 'PEN';
    total[cur] += m;
    const key = t.plan ?? 'otro';
    const row = plans.get(key) ?? { count: 0, mrr: { PEN: 0, USD: 0 } };
    row.count += 1;
    row.mrr[cur] += m;
    plans.set(key, row);
  }
  return {
    total: { PEN: round2(total.PEN), USD: round2(total.USD) },
    byPlan: [...plans.entries()].map(([plan, r]) => ({
      plan,
      count: r.count,
      mrr: { PEN: round2(r.mrr.PEN), USD: round2(r.mrr.USD) },
    })),
  };
}
