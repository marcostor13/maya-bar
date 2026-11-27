import CATALOG from '../../shared/catalog.generated.json';

/**
 * Datos del producto que citan las páginas de contenido y `llms.txt` (HU79).
 * Salen del catálogo generado desde el backend (`npm run catalog`, HU56): si
 * cambia un precio o un límite, las páginas cambian solas.
 */
type CatalogPlan = (typeof CATALOG.plans)[number];

/** Formato único de las páginas (como la landing): miles con punto y decimales con coma. */
const swapSeparators = (s: string) => s.replace(/[.,]/g, (c) => (c === '.' ? ',' : '.'));
export const fmtNum = (v: number) => swapSeparators(v.toLocaleString('en-US'));
export const fmtUsd = (v: number) =>
  `US$ ${swapSeparators(v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }))}`;

const num = (v: number | null, unlimited = 'ilimitados') => (v === null ? unlimited : fmtNum(v));

export interface PlanFact {
  id: string;
  name: string;
  usd: number;
  pen: number;
  users: string;
  whatsappNumbers: string;
  contacts: string;
  aiAgents: string;
  aiCredits: string;
  emails: string;
  events: string;
  mailboxes: string;
  whatsappCampaigns: boolean;
}

function fact(p: CatalogPlan): PlanFact {
  const l = p.limits;
  return {
    id: p.id,
    name: p.name,
    usd: p.prices?.USD?.monthly ?? 0,
    pen: p.prices?.PEN?.monthly ?? 0,
    users: num(l.users),
    whatsappNumbers: num(l.whatsappNumbers),
    contacts: num(l.contacts),
    aiAgents: num(l.aiAgents),
    aiCredits: num(l.aiCreditsPerMonth),
    emails: num(l.campaignEmailsPerMonth),
    events: l.activeEvents === null ? 'ilimitados' : `${num(l.activeEvents)} activo${l.activeEvents === 1 ? '' : 's'}`,
    mailboxes: num(l.mailboxes),
    whatsappCampaigns: (p.features as string[]).includes('whatsapp-campaigns'),
  };
}

/** Planes con precio publicado (sin el plan Empresa, que es a medida). */
export const PLAN_FACTS: PlanFact[] = CATALOG.plans.filter((p) => !p.custom && p.prices).map(fact);

const cheapest = PLAN_FACTS[0];
/** Precio en USD del usuario adicional (complemento del catálogo). */
export const EXTRA_USER_USD = CATALOG.addons.find((a) => a.id === 'extra_user')?.price?.USD ?? 0;
/** "US$ 29 (S/ 99)": el precio de entrada. */
export const FROM_PRICE = `US$ ${cheapest.usd} (S/ ${cheapest.pen})`;

/** Texto común: cómo se paga. */
export const PRICING_NOTE =
  'Precios mensuales sin IGV, por equipo y no por vendedor. El pago trimestral tiene 5 % de descuento y el anual cuesta 10 meses. Sin permanencia y con demo en vivo antes de contratar. Hay plan Empresa a medida.';

/**
 * Tarifas de lista de Meta para WhatsApp Business Platform en Perú (USD por
 * mensaje entregado), vigentes desde el 1-oct-2026. Mismas cifras que
 * `backend/src/dashboard/message-pricing.ts`.
 */
export const WA_PERU = {
  effective: '1 de octubre de 2026',
  marketing: 0.0703,
  utility: 0.03,
  authentication: 0.03,
  source: 'https://developers.facebook.com/docs/whatsapp/pricing',
};

/** Tabla de planes reutilizable en las páginas. */
export function plansTable(): { head: string[]; rows: string[][]; note: string } {
  return {
    head: ['', ...PLAN_FACTS.map((p) => p.name)],
    rows: [
      ['Precio mensual', ...PLAN_FACTS.map((p) => `US$ ${p.usd} · S/ ${p.pen}`)],
      ['Usuarios', ...PLAN_FACTS.map((p) => p.users)],
      ['Números de WhatsApp', ...PLAN_FACTS.map((p) => p.whatsappNumbers)],
      ['Contactos', ...PLAN_FACTS.map((p) => p.contacts)],
      ['Agentes de IA', ...PLAN_FACTS.map((p) => p.aiAgents)],
      ['Créditos de IA al mes', ...PLAN_FACTS.map((p) => p.aiCredits)],
      ['Correos de campaña al mes', ...PLAN_FACTS.map((p) => p.emails)],
      ['Eventos con página y registro', ...PLAN_FACTS.map((p) => p.events)],
      ['Campañas masivas de WhatsApp', ...PLAN_FACTS.map((p) => (p.whatsappCampaigns ? 'Sí' : 'No'))],
    ],
    note: PRICING_NOTE,
  };
}
