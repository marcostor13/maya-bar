/** Lo mínimo que hace falta de un mensaje para mezclar dos listas. */
export interface MergeableMessage {
  _id: string;
  at: string;
}

/**
 * Mezcla los últimos mensajes del servidor con los que ya se ven en el chat
 * (HU23). Sirve para recuperar lo perdido mientras el socket estaba caído sin
 * recargar la lista entera:
 * - los del servidor mandan (estado al día) y no se duplican;
 * - se conservan los antiguos ya cargados con "ver más";
 * - las burbujas provisionales (`isTemp`) siguen al final, en su orden;
 * - si llegó una página completa sin ninguno en común con lo cargado, se
 *   perdieron más de los que caben: se quedan solo los nuevos, para no dejar
 *   un hueco que "ver más" nunca rellenaría.
 */
export function mergeMessages<T extends MergeableMessage>(
  current: T[],
  latest: T[],
  isTemp: (m: T) => boolean,
  pageSize = 50,
): T[] {
  const byDate = (a: T, b: T) =>
    +new Date(a.at) - +new Date(b.at) || (a._id < b._id ? -1 : a._id > b._id ? 1 : 0);
  const fromServer = new Map(latest.map((m) => [m._id, m]));
  const temps = current.filter(isTemp);
  const loaded = current.filter((m) => !isTemp(m));
  const gap =
    latest.length >= pageSize && loaded.length > 0 && !loaded.some((m) => fromServer.has(m._id));
  if (gap) return [...[...latest].sort(byDate), ...temps];
  const kept = loaded.filter((m) => !fromServer.has(m._id));
  return [...[...kept, ...latest].sort(byDate), ...temps];
}
