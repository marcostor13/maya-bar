/** Escapa el texto del usuario para usarlo literal dentro de una RegExp. */
export function escapeRegex(q: string): string {
  return q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Fragmento de `text` alrededor de la primera aparición de `q` (sin distinguir
 * mayúsculas), de unos `max` caracteres, con "…" donde se recorta (HU74).
 */
export function searchSnippet(text: string, q: string, max = 90): string {
  const clean = (text ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const at = clean.toLowerCase().indexOf(q.trim().toLowerCase());
  if (at < 0) return `${clean.slice(0, max - 1).trimEnd()}…`;
  const before = Math.floor((max - q.length) / 3);
  let start = Math.max(0, at - before);
  const end = Math.min(clean.length, start + max);
  start = Math.max(0, end - max);
  return `${start > 0 ? '…' : ''}${clean.slice(start, end).trim()}${end < clean.length ? '…' : ''}`;
}
