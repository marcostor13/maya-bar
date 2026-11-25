/** Trozo de texto; `hit` marca la parte que coincide con la búsqueda. */
export interface HighlightPart {
  text: string;
  hit: boolean;
}

/** Parte `text` en trozos marcando cada aparición de `q`, sin distinguir mayúsculas (HU74). */
export function highlightParts(text: string, q: string): HighlightPart[] {
  const needle = q.trim().toLowerCase();
  if (!text || !needle) return text ? [{ text, hit: false }] : [];
  const lower = text.toLowerCase();
  const parts: HighlightPart[] = [];
  let from = 0;
  for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, from)) {
    if (at > from) parts.push({ text: text.slice(from, at), hit: false });
    parts.push({ text: text.slice(at, at + needle.length), hit: true });
    from = at + needle.length;
  }
  if (from < text.length) parts.push({ text: text.slice(from), hit: false });
  return parts;
}
