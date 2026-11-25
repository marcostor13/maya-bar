/**
 * Vista previa de los enlaces de eventos (WhatsApp, Facebook, LinkedIn…).
 * Los rastreadores no ejecutan JavaScript: leen el HTML que entrega el
 * servidor. `server.ts` usa estas funciones para poner en ese HTML el título,
 * la descripción y la imagen del evento en lugar de los de Maya.
 */

export interface EventForMeta {
  title: string;
  description?: string;
  date?: string;
  startTime?: string;
  location?: string;
  imageUrl?: string;
  invitationDesign?: { background?: { type?: string; url?: string } };
}

export interface EventMeta {
  title: string;
  description: string;
  image?: string;
  /** Portada real (imagen grande) o solo un logo (tarjeta pequeña). */
  largeImage: boolean;
  url: string;
  siteName: string;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Texto plano de una línea, sin etiquetas HTML y recortado. */
export function plain(s: string | undefined, max: number): string {
  const t = (s ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
}

function absolute(url: string | undefined, base: string): string | undefined {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return base.replace(/\/$/, '') + url;
  return undefined;
}

/** "sáb 6 de diciembre · 19:00 · Lima" */
export function whenWhere(ev: EventForMeta): string {
  const parts: string[] = [];
  if (ev.date) {
    const d = new Date(ev.date);
    if (!isNaN(d.getTime())) {
      parts.push(
        new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d),
      );
    }
  }
  if (ev.startTime) parts.push(ev.startTime);
  if (ev.location) parts.push(plain(ev.location, 60));
  return parts.join(' · ');
}

export function eventMeta(
  data: { event: EventForMeta; brand?: { name?: string; logo?: string } | null },
  pageUrl: string,
  siteUrl: string,
): EventMeta {
  const ev = data.event;
  const when = whenWhere(ev);
  const desc = plain(ev.description, 200);
  const description = plain([when, desc].filter(Boolean).join(' — '), 200) || plain(ev.title, 200);
  const bg = ev.invitationDesign?.background;
  const cover = absolute(ev.imageUrl, siteUrl) ?? (bg?.type === 'image' ? absolute(bg.url, siteUrl) : undefined);
  return {
    title: plain(ev.title, 90),
    description,
    image: cover ?? absolute(data.brand?.logo, siteUrl) ?? absolute('/icons/icon-512.png', siteUrl),
    largeImage: !!cover,
    url: pageUrl,
    siteName: plain(data.brand?.name, 60) || 'Maya CRM',
  };
}

/**
 * Cambia el `<title>` y la descripción del HTML y añade las etiquetas Open
 * Graph y Twitter del evento. Quita antes las que hubiera para no duplicarlas.
 */
export function injectMeta(html: string, m: EventMeta): string {
  const tags = [
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${esc(m.siteName)}">`,
    `<meta property="og:title" content="${esc(m.title)}">`,
    `<meta property="og:description" content="${esc(m.description)}">`,
    `<meta property="og:url" content="${esc(m.url)}">`,
    `<meta property="og:locale" content="es_PE">`,
    ...(m.image ? [`<meta property="og:image" content="${esc(m.image)}">`] : []),
    `<meta name="twitter:card" content="${m.largeImage ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${esc(m.title)}">`,
    `<meta name="twitter:description" content="${esc(m.description)}">`,
    ...(m.image ? [`<meta name="twitter:image" content="${esc(m.image)}">`] : []),
    `<link rel="canonical" href="${esc(m.url)}">`,
  ].join('\n  ');
  return html
    .replace(/<meta\s+(?:property|name)="(?:og|twitter):[^"]*"[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '')
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(m.title)}</title>`)
    .replace(/<meta\s+name="description"[^>]*>/i, `<meta name="description" content="${esc(m.description)}">`)
    .replace(/<\/head>/i, `  ${tags}\n</head>`);
}
