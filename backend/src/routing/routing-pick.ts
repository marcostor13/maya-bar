/** Elección pura del vendedor en el reparto automático (HU59). */

export type RoutingMode = 'round_robin' | 'least_open' | 'weighted';

export interface Availability {
  /** Días de la semana (0 = domingo … 6 = sábado), en Lima. Vacío = todos. */
  days?: number[];
  /** Horas desde (incl.) y hasta (excl.), 0–24, en Lima. */
  from?: number;
  to?: number;
}

export interface Candidate {
  userId: string;
  weight: number;
  /** Oportunidades abiertas que ya lleva. */
  open: number;
  /** Asignaciones automáticas recibidas en esta regla (para el ponderado). */
  received: number;
}

const LIMA_OFFSET_MS = -5 * 3600_000;

/** Si el horario del usuario incluye este instante (sin horario = siempre). */
export function inSchedule(
  a: Availability | undefined | null,
  now: Date,
): boolean {
  if (!a) return true;
  const local = new Date(now.getTime() + LIMA_OFFSET_MS);
  if (a.days?.length && !a.days.includes(local.getUTCDay())) return false;
  const from = a.from ?? 0;
  const to = a.to ?? 24;
  if (from === 0 && to >= 24) return true;
  const h = local.getUTCHours() + local.getUTCMinutes() / 60;
  return from < to ? h >= from && h < to : h >= from || h < to;
}

/**
 * Elige entre los candidatos disponibles (ya filtrados y en el orden del
 * grupo). Devuelve el índice elegido dentro de `members` o -1.
 *
 * - Rotativo: el siguiente al último que recibió (`cursor`), saltando a los
 *   que no están disponibles.
 * - Menos abiertas: el que lleve menos; empate → orden del grupo.
 * - Ponderado: el que más se aleja de su cuota (recibidas / peso).
 */
export function pick(
  mode: RoutingMode,
  members: string[],
  available: Map<string, Candidate>,
  cursor: number,
): number {
  if (!members.length || !available.size) return -1;
  if (mode === 'round_robin') {
    for (let step = 1; step <= members.length; step++) {
      const i =
        (((cursor + step) % members.length) + members.length) % members.length;
      if (available.has(members[i])) return i;
    }
    return -1;
  }
  let best = -1;
  let bestScore = Infinity;
  members.forEach((id, i) => {
    const c = available.get(id);
    if (!c) return;
    const score =
      mode === 'least_open'
        ? c.open
        : (c.received + 1) / Math.max(c.weight, 0.01);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}
