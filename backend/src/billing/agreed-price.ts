import { addonsCost } from './addons.catalog';
import {
  discountAmount,
  discountApplies,
  type AgreedDiscount,
} from './coupons/coupon-math';
import {
  priceFor,
  type BillingPeriod,
  type Currency,
  type PlanId,
} from './plans.catalog';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Precio pactado de un periodo: plan con el descuento vigente en `at`
 * (cupón, HU54) más los add-ons mensuales contratados (HU53), sin IGV.
 */
export function agreedPrice(
  t:
    | {
        addonItems?: Record<string, number>;
        subscription?: { discount?: AgreedDiscount };
      }
    | null
    | undefined,
  plan: PlanId,
  period: BillingPeriod,
  currency: Currency,
  at = new Date(),
): number {
  const list = priceFor(plan, period, currency) ?? 0;
  const d = t?.subscription?.discount;
  // El cupón guarda sus planes y periodos: al cambiar a otro, ya no descuenta.
  const planPrice = discountApplies(d, plan, period, at)
    ? list - discountAmount(d, list)
    : list;
  return round2(planPrice + addonsCost(t?.addonItems, period, currency));
}
