/** Textos y formatos comunes del panel de suscripciones (HU57). */

export const SUB_STATUS: Record<string, { label: string; badge: string }> = {
  trialing: { label: 'En prueba', badge: 'badge-info' },
  active: { label: 'Activa', badge: 'badge-success' },
  past_due: { label: 'Pago pendiente', badge: 'badge-warning' },
  expired: { label: 'Vencida', badge: 'badge-danger' },
  canceled: { label: 'Cancelada', badge: 'badge-neutral' },
  legacy: { label: 'Anterior al catálogo', badge: 'badge-neutral' },
};

export const PERIOD_LABEL: Record<string, string> = {
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  annual: 'Anual',
};

export const PLAN_OPTIONS = [
  { id: 'inicia', name: 'Inicia' },
  { id: 'crece', name: 'Crece' },
  { id: 'escala', name: 'Escala' },
  { id: 'empresa', name: 'Empresa' },
] as const;

export const RECEIPT_STATUS: Record<string, { label: string; badge: string }> = {
  pending: { label: 'En cola', badge: 'badge-info' },
  issued: { label: 'Emitido', badge: 'badge-success' },
  failed: { label: 'Con error', badge: 'badge-danger' },
  skipped: { label: 'No aplica', badge: 'badge-neutral' },
  manual: { label: 'Por facturar', badge: 'badge-warning' },
};

export function money(n: number | null | undefined, currency = 'PEN'): string {
  const v = Number(n ?? 0);
  return `${currency === 'USD' ? 'US$' : 'S/'} ${v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function planName(id?: string): string {
  return PLAN_OPTIONS.find(p => p.id === id)?.name ?? id ?? '—';
}
