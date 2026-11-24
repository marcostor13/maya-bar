import type { BillingPeriod, Currency } from './plans.catalog';

/**
 * Paquetes de implementación (HU55). Precio sin IGV, igual a la landing
 * (`SETUP_PACKAGES` en `landing.data.ts`). Se cobran una vez, en la misma
 * compra del plan; con el plan anual se descuentan del total hasta el 10 %
 * del año.
 */
export const SETUP_IDS = ['puesta', 'pro'] as const;
export type SetupId = (typeof SETUP_IDS)[number];

export interface SetupDef {
  id: SetupId;
  name: string;
  price: Record<Currency, number>;
  /** Lo que el equipo deja listo: se copia a la tarea de onboarding. */
  checklist: string[];
}

const PUESTA = [
  'Conectar WhatsApp, Instagram y Messenger',
  'Conectar 1 buzón de correo',
  'Importar la base (hasta 5.000 contactos)',
  'Entrenar 1 agente de IA con sus documentos',
  'Crear 2 formularios listos para publicar',
  'Capacitación de 90 minutos para el equipo',
  '7 días de acompañamiento',
];

export const SETUP_PACKAGES: Record<SetupId, SetupDef> = {
  puesta: {
    id: 'puesta',
    name: 'Puesta en marcha',
    price: { PEN: 490, USD: 149 },
    checklist: PUESTA,
  },
  pro: {
    id: 'pro',
    name: 'Implementación Pro',
    price: { PEN: 1490, USD: 449 },
    checklist: [
      ...PUESTA.slice(0, 5),
      'Verificar el negocio en Meta y dar de alta la API oficial',
      'Hasta 10 plantillas de WhatsApp aprobadas',
      'Hasta 3 agentes de IA entrenados',
      'Embudo, reparto de oportunidades, roles y permisos',
      'Migración desde otro CRM o Excel (hasta 50.000 contactos)',
      '3 capacitaciones: dirección, ventas y marketing',
      '30 días de acompañamiento por WhatsApp',
    ],
  },
};

export const isSetupId = (v: unknown): v is SetupId =>
  typeof v === 'string' && (SETUP_IDS as readonly string[]).includes(v);

/** Tope del descuento en el plan anual: 10 % del precio del año. */
export const SETUP_ANNUAL_CREDIT = 0.1;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Precio y descuento (sin IGV) del paquete para un plan de `planSubtotal`. */
export function setupQuote(
  id: SetupId,
  period: BillingPeriod,
  currency: Currency,
  planSubtotal: number,
): {
  id: SetupId;
  name: string;
  price: number;
  discount: number;
  subtotal: number;
} {
  const p = SETUP_PACKAGES[id];
  const price = p.price[currency];
  const discount =
    period === 'annual'
      ? round2(Math.min(price, planSubtotal * SETUP_ANNUAL_CREDIT))
      : 0;
  return {
    id,
    name: p.name,
    price,
    discount,
    subtotal: round2(price - discount),
  };
}
