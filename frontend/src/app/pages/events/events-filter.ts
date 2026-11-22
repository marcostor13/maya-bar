import { AppEvent, Local } from '../../shared/models/event.model';
import { localDay } from './event-tabs';

/** Filtro de la lista de eventos (HU28). */
export type EventsFilter = 'upcoming' | 'past' | 'drafts';

const dayOf = (ev: AppEvent) => (ev.date ?? '').slice(0, 10);

/**
 * Próximos: no borradores de hoy en adelante, del más cercano al más lejano.
 * Pasados: no borradores anteriores a hoy, del más reciente al más antiguo.
 * Borradores: por fecha.
 */
export function filterEvents(events: AppEvent[], filter: EventsFilter, today: Date): AppEvent[] {
  const now = localDay(today);
  const asc = (a: AppEvent, b: AppEvent) => dayOf(a).localeCompare(dayOf(b));
  if (filter === 'drafts') return events.filter(e => e.status === 'draft').sort(asc);
  const live = events.filter(e => e.status !== 'draft');
  if (filter === 'upcoming') return live.filter(e => dayOf(e) >= now).sort(asc);
  return live.filter(e => dayOf(e) < now).sort((a, b) => asc(b, a));
}

/** Local que se abre al entrar: el único, o el último usado si sigue existiendo. */
export function pickLocal(locals: Local[], saved: string | null): string {
  if (locals.length === 1) return locals[0]._id;
  return saved && locals.some(l => l._id === saved) ? saved : '';
}
