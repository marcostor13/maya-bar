import { PERIOD_MONTHS } from './plans.catalog';
import type { BillingPeriod, Currency, LimitKey } from './plans.catalog';

/**
 * Add-ons y recargas (HU53). Precios sin IGV, iguales a los de la landing
 * (`ADDONS` en `landing.data.ts`).
 *
 * - `monthly`: suma a un límite mientras dure la suscripción y entra en el
 *   cobro de cada periodo.
 * - `topup`: pago único; el saldo dura 12 meses y se gasta después de lo
 *   incluido en el plan.
 */
export const ADDON_IDS = [
  'extra_user',
  'extra_whatsapp',
  'extra_contacts',
  'credits_1000',
  'credits_5000',
  'emails_10000',
] as const;
export type AddonId = (typeof ADDON_IDS)[number];

export interface AddonDef {
  id: AddonId;
  name: string;
  kind: 'monthly' | 'topup';
  /** Precio por unidad sin IGV (mensual para `monthly`). */
  price: Record<Currency, number>;
  /** Límite que amplía cada unidad (`monthly`). */
  limit?: LimitKey;
  /** Cuánto suma cada unidad: límite o saldo. */
  amount: number;
  /** Saldo que recarga (`topup`). */
  balance?: 'aiCredits' | 'campaignEmails';
}

export const ADDONS: Record<AddonId, AddonDef> = {
  extra_user: {
    id: 'extra_user',
    name: 'Usuario adicional',
    kind: 'monthly',
    price: { PEN: 39, USD: 12 },
    limit: 'users',
    amount: 1,
  },
  extra_whatsapp: {
    id: 'extra_whatsapp',
    name: 'Número de WhatsApp adicional',
    kind: 'monthly',
    price: { PEN: 49, USD: 15 },
    limit: 'whatsappNumbers',
    amount: 1,
  },
  extra_contacts: {
    id: 'extra_contacts',
    name: '10.000 contactos adicionales',
    kind: 'monthly',
    price: { PEN: 35, USD: 10 },
    limit: 'contacts',
    amount: 10_000,
  },
  credits_1000: {
    id: 'credits_1000',
    name: '1.000 créditos de IA',
    kind: 'topup',
    price: { PEN: 49, USD: 15 },
    balance: 'aiCredits',
    amount: 1000,
  },
  credits_5000: {
    id: 'credits_5000',
    name: '5.000 créditos de IA',
    kind: 'topup',
    price: { PEN: 199, USD: 59 },
    balance: 'aiCredits',
    amount: 5000,
  },
  emails_10000: {
    id: 'emails_10000',
    name: '10.000 emails de campaña',
    kind: 'topup',
    price: { PEN: 29, USD: 9 },
    balance: 'campaignEmails',
    amount: 10_000,
  },
};

export const isAddonId = (v: unknown): v is AddonId =>
  typeof v === 'string' && (ADDON_IDS as readonly string[]).includes(v);

/** Meses que dura una recarga. */
export const TOPUP_MONTHS = 12;

/** Costo por periodo (sin IGV) de los add-ons mensuales contratados. */
export function addonsCost(
  items: Record<string, number> | undefined,
  period: BillingPeriod,
  currency: Currency,
): number {
  let total = 0;
  for (const [id, qty] of Object.entries(items ?? {}))
    if (isAddonId(id) && ADDONS[id].kind === 'monthly' && qty > 0)
      total += ADDONS[id].price[currency] * qty * PERIOD_MONTHS[period];
  return total;
}
