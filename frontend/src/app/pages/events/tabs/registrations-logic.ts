/** Utilidades de la lista de asistentes en el móvil (HU31). */

/** Número para wa.me: solo dígitos y, si es un móvil peruano de 9 dígitos, con el 51 delante. */
export function waNumber(phone: string | undefined | null): string {
  let d = (phone ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 9 && d.startsWith('9')) d = '51' + d;
  return d.length >= 8 ? d : '';
}

export function waLink(phone: string | undefined | null): string {
  const n = waNumber(phone);
  return n ? `https://wa.me/${n}` : '';
}

export function telLink(phone: string | undefined | null): string {
  const p = (phone ?? '').trim();
  return p ? `tel:${p.replace(/[^\d+]/g, '')}` : '';
}

export interface SortOption { key: string; label: string; sortBy: string; sortOrder: 'asc' | 'desc' }

export const SORT_OPTIONS: SortOption[] = [
  { key: 'createdAt:desc', label: 'Más recientes', sortBy: 'createdAt', sortOrder: 'desc' },
  { key: 'createdAt:asc', label: 'Más antiguos', sortBy: 'createdAt', sortOrder: 'asc' },
  { key: 'name:asc', label: 'Nombre A-Z', sortBy: 'name', sortOrder: 'asc' },
  { key: 'name:desc', label: 'Nombre Z-A', sortBy: 'name', sortOrder: 'desc' },
  { key: 'partySize:desc', label: 'Más personas', sortBy: 'partySize', sortOrder: 'desc' },
];
