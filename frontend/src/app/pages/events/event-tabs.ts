/** Pestañas del detalle del evento y cómo se agrupan en el móvil (HU29). */
export type ActiveTab =
  | 'general' | 'media' | 'form' | 'invitation'
  | 'marketing' | 'registrations' | 'impulsadores' | 'checkin' | 'stats';

export type TabGroup = 'config' | 'ops';

export const TAB_GROUP: Record<ActiveTab, TabGroup> = {
  general: 'config',
  media: 'config',
  form: 'config',
  invitation: 'config',
  registrations: 'ops',
  checkin: 'ops',
  impulsadores: 'ops',
  stats: 'ops',
  marketing: 'ops',
};

/** Primera pestaña de cada grupo: a la que se salta al cambiar de grupo. */
export const GROUP_FIRST: Record<TabGroup, ActiveTab> = { config: 'general', ops: 'registrations' };

/** Pestañas que editan lo que guarda `saveEvent` (las que muestran la barra de guardado). */
export const SAVE_TABS: ReadonlySet<ActiveTab> = new Set(['general', 'media', 'form']);

export function isTab(v: string | null): v is ActiveTab {
  return !!v && v in TAB_GROUP;
}

/** AAAA-MM-DD de un día en la hora local del dispositivo. */
export function localDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Pestaña con la que se abre un evento: el día del evento lo útil es el
 * check-in; antes, ver quién se registró. Borradores y eventos pasados se
 * abren para editarlos.
 */
export function initialTab(ev: { status: string; date?: string }, today: Date): ActiveTab {
  if (ev.status !== 'published' || !ev.date) return 'general';
  const day = ev.date.slice(0, 10);
  const now = localDay(today);
  if (day === now) return 'checkin';
  return day > now ? 'registrations' : 'general';
}
