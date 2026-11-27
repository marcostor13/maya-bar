import { HttpException, HttpStatus } from '@nestjs/common';
import type {
  SubscriptionStatus,
  TenantSubscription,
} from '../tenants/tenant.schema';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Lo mínimo de la empresa que decide si puede operar. */
export interface BillingSnapshot {
  plan?: string;
  legacy?: boolean;
  trialEndsAt?: Date | string | null;
  subscription?: TenantSubscription | null;
  /** Empresa demo (HU86): solo para mirar (HU88). */
  demo?: boolean;
}

export interface AccessState {
  /** Estado efectivo a `now` (una prueba vencida ya cuenta como `expired`). */
  status: SubscriptionStatus | 'legacy';
  /** Solo lectura: puede entrar, ver y exportar, no enviar ni crear (HU41, HU51). */
  readOnly: boolean;
  trialEndsAt?: Date;
  /** Días que quedan de prueba, redondeando hacia arriba. */
  trialDaysLeft?: number;
  /** Mensaje para el usuario cuando está en solo lectura. */
  reason?: string;
  /** Empresa demo: ninguna escritura pasa, ni las que el cobro deja abiertas (HU88). */
  demo?: boolean;
}

const toDate = (v?: Date | string | null) => (v ? new Date(v) : undefined);

export const TRIAL_ENDED_MESSAGE = 'Tu prueba terminó, elige un plan';
export const SUBSCRIPTION_ENDED_MESSAGE =
  'Tu plan no está activo. Renueva o elige un plan para seguir.';

/**
 * Regla única de acceso por estado de cobro. Pura: recibe el reloj para poder
 * probarla sin esperas.
 */
export function accessOf(t: BillingSnapshot, now = new Date()): AccessState {
  const sub = t.subscription;
  // Clientes anteriores al catálogo sin suscripción: sin cambios (HU40).
  if (!sub) {
    if (t.legacy || !t.trialEndsAt)
      return { status: 'legacy', readOnly: false };
  }
  const status: SubscriptionStatus = sub?.status ?? 'trialing';
  const trialEndsAt = toDate(t.trialEndsAt);

  if (status === 'trialing') {
    if (!trialEndsAt || trialEndsAt > now)
      return {
        status,
        readOnly: false,
        trialEndsAt,
        trialDaysLeft: trialEndsAt
          ? Math.max(
              0,
              Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS),
            )
          : undefined,
      };
    return {
      status: 'expired',
      readOnly: true,
      trialEndsAt,
      trialDaysLeft: 0,
      reason: TRIAL_ENDED_MESSAGE,
    };
  }
  if (status === 'active') return { status, readOnly: false };
  if (status === 'past_due') {
    const grace = toDate(sub?.graceEndsAt);
    if (!grace || grace > now) return { status, readOnly: false };
    return {
      status: 'expired',
      readOnly: true,
      reason: SUBSCRIPTION_ENDED_MESSAGE,
    };
  }
  if (status === 'canceled') {
    const end = toDate(sub?.currentPeriodEnd);
    if (end && end > now) return { status, readOnly: false };
  }
  return {
    status: status === 'canceled' ? 'canceled' : 'expired',
    readOnly: true,
    reason:
      trialEndsAt && !sub?.currentPeriodEnd
        ? TRIAL_ENDED_MESSAGE
        : SUBSCRIPTION_ENDED_MESSAGE,
  };
}

/** 402 con código estable para que el frontend ofrezca elegir plan. */
export class SubscriptionRequiredException extends HttpException {
  constructor(message: string) {
    super(
      { statusCode: 402, code: 'SUBSCRIPTION_REQUIRED', message },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}

/**
 * ¿La empresa puede operar? (HU48 §5). Une la suspensión manual del
 * superadmin (HU16) con el estado de cobro: la usan los guards y procesos.
 */
export function canUse(
  t: BillingSnapshot & { isActive?: boolean },
  now = new Date(),
): boolean {
  if (t.isActive === false) return false;
  return !accessOf(t, now).readOnly;
}
