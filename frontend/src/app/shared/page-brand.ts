/**
 * Favicon y título de la pestaña con la marca de la empresa (HU26). Devuelve
 * una función que deja la pestaña como estaba, para cuando se sale de la
 * landing sin recargar la página.
 */
export interface TabBrand {
  title?: string;
  /** Favicon; si falta se usa `logo`. Sin ninguno se conserva el actual. */
  favicon?: string;
  logo?: string;
}

export function applyTabBrand(doc: Document, brand: TabBrand): () => void {
  const prevTitle = doc.title;
  const icon = brand.favicon || brand.logo;
  const links = icon
    ? Array.from(doc.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'))
        // El icono de iOS al guardar la landing en la pantalla de inicio.
        .concat(Array.from(doc.head.querySelectorAll<HTMLLinkElement>('link[rel="apple-touch-icon"]')))
    : [];
  const prev = links.map((l) => ({ link: l, href: l.getAttribute('href'), type: l.getAttribute('type') }));
  let added: HTMLLinkElement | null = null;

  if (brand.title) doc.title = brand.title;
  if (icon) {
    // Se cambian los existentes: el navegador elige entre todos los `icon`
    // y dejaría el de Maya si alguno quedara.
    for (const l of links) {
      l.setAttribute('href', icon);
      l.removeAttribute('type');
    }
    if (!links.some((l) => l.rel !== 'apple-touch-icon')) {
      added = doc.createElement('link');
      added.rel = 'icon';
      added.href = icon;
      doc.head.appendChild(added);
    }
  }

  return () => {
    doc.title = prevTitle;
    for (const p of prev) {
      if (p.href === null) p.link.removeAttribute('href');
      else p.link.setAttribute('href', p.href);
      if (p.type !== null) p.link.setAttribute('type', p.type);
    }
    added?.remove();
  };
}
