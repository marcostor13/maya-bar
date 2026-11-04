/**
 * Texto del agente listo para un chat (WhatsApp, Instagram, Messenger): esos
 * canales no entienden Markdown, y un `[Pagar](https://…)` llega con los
 * corchetes a la vista. WhatsApp solo enlaza la URL desnuda.
 */
export function formatForChat(text: string): string {
  return (
    text
      // [texto](url) → "texto: url" (si el texto es la misma URL, solo la URL)
      .replace(
        /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
        (_, label: string, url: string) =>
          label.trim() === url ? url : `${label.trim()}: ${url}`,
      )
      // <https://…> → https://…
      .replace(/<(https?:\/\/[^\s>]+)>/g, '$1')
      // **negrita** / __negrita__ → *negrita* (la negrita de WhatsApp)
      .replace(/\*\*([^*\n]+)\*\*/g, '*$1*')
      .replace(/__([^_\n]+)__/g, '*$1*')
      // ### Título → *Título*
      .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
  );
}

/** URLs del texto que apuntan a `base` (la tienda), sin repetir. */
export function storeUrlsIn(text: string, base: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/https?:\/\/[^\s<>()[\]"'*]+/g)) {
    // Un punto o coma final es puntuación de la frase, no parte del link.
    const url = m[0].replace(/[.,;:!?¡¿]+$/, '');
    if (
      url === base ||
      url.startsWith(`${base}/`) ||
      url.startsWith(`${base}?`)
    )
      found.add(url);
  }
  return [...found];
}
