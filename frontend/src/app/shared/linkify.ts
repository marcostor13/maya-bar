/**
 * Parte un texto en trozos de texto y de link (URLs `http(s)://`, `www.` y
 * correos). Es puro y no produce HTML: quien lo pinta usa la interpolación de
 * Angular, así que un `<script>` del cliente se ve como texto.
 *
 * Solo genera `href` con `https?:` o `mailto:`; `javascript:` o `data:` no
 * encajan en el patrón y quedan como texto.
 */
export interface TextSegment {
  text: string;
  /** Presente solo si el trozo es un link. */
  href?: string;
  /** `true` para web (se abre en otra pestaña); `false` para `mailto:`. */
  external?: boolean;
}

const LINK_RE =
  /\b(?:https?:\/\/[^\s<>"']+|www\.[^\s<>"']+|[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})/gi;

/** Puntuación que cierra la frase, no la URL. */
const TRAILING = new Set(['.', ',', ';', ':', '!', '?', '*', '"', "'", '¡', '¿', ']', '}', '>']);

/** Quita la puntuación final y los `)` que no abrió la propia URL. */
function trimUrl(url: string): string {
  let end = url.length;
  for (;;) {
    const last = url[end - 1];
    if (TRAILING.has(last)) {
      end--;
      continue;
    }
    if (last === ')') {
      const part = url.slice(0, end);
      const open = part.split('(').length - 1;
      const close = part.split(')').length - 1;
      if (close > open) {
        end--;
        continue;
      }
    }
    return url.slice(0, end);
  }
}

export function linkify(text: string | null | undefined): TextSegment[] {
  if (!text) return [];
  const out: TextSegment[] = [];
  let last = 0;
  const pushText = (to: number) => {
    if (to > last) out.push({ text: text.slice(last, to) });
  };

  for (const match of text.matchAll(LINK_RE)) {
    const start = match.index;
    const raw = match[0];
    const lower = raw.toLowerCase();
    let link: TextSegment | null = null;
    let value = raw;

    if (lower.startsWith('http://') || lower.startsWith('https://')) {
      value = trimUrl(raw);
      if (value.length > value.indexOf('//') + 2) link = { text: value, href: value, external: true };
    } else if (lower.startsWith('www.')) {
      value = trimUrl(raw);
      // "www." solo, o sin un dominio detrás, no es una dirección.
      if (/^www\.[^./]+\.[^.]/i.test(value)) link = { text: value, href: `https://${value}`, external: true };
    } else {
      link = { text: raw, href: `mailto:${raw}`, external: false };
    }

    if (!link) continue;
    pushText(start);
    out.push(link);
    last = start + value.length;
  }
  pushText(text.length);
  return out;
}
