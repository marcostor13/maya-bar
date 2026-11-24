import { addMonths } from '../plans.catalog';

export const PERIOD_NAMES_ES: Record<string, string> = {
  monthly: 'mensual',
  quarterly: 'trimestral',
  annual: 'anual',
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Descuento pactado que queda en la suscripción (HU54). */
export interface AgreedDiscount {
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  /** Sin fecha = de por vida. */
  endsAt?: Date;
  /** Planes y periodos en que vale (vacío = todos), como en el cupón. */
  plans?: string[];
  periods?: string[];
}

/** ¿El descuento vale para este plan y periodo en `at`? */
export function discountApplies(
  d: AgreedDiscount | undefined | null,
  plan: string,
  period: string,
  at = new Date(),
): d is AgreedDiscount {
  if (!d || (d.endsAt && new Date(d.endsAt) <= at)) return false;
  if (d.plans?.length && !d.plans.includes(plan)) return false;
  if (d.periods?.length && !d.periods.includes(period)) return false;
  return true;
}

/** Monto que se descuenta (sin IGV) de un precio; nunca más que el precio. */
export function discountAmount(
  d: Pick<AgreedDiscount, 'type' | 'value'>,
  price: number,
): number {
  const raw = d.type === 'percent' ? (price * d.value) / 100 : d.value;
  return round2(Math.min(price, Math.max(0, raw)));
}

/** Precio con el descuento vigente en `at` (si lo hay). */
export function discounted(
  price: number,
  d: AgreedDiscount | undefined | null,
  at = new Date(),
): number {
  if (!d || (d.endsAt && new Date(d.endsAt) <= at)) return price;
  return round2(price - discountAmount(d, price));
}

/**
 * Hasta cuándo dura el descuento: `once` cubre el primer periodo pagado,
 * `months` N meses desde la compra y `forever` no vence.
 */
export function discountEndsAt(
  c: { duration: 'once' | 'months' | 'forever'; durationMonths?: number },
  firstPeriodEnd: Date,
  now = new Date(),
): Date | undefined {
  if (c.duration === 'forever') return undefined;
  if (c.duration === 'once') return firstPeriodEnd;
  return addMonths(now, c.durationMonths ?? 1);
}
