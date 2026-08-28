import { Injectable, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';

export interface SeoConfig {
  title: string;
  description: string;
  /** Ruta canónica sin dominio, empezando por `/`. */
  path: string;
  image?: string;
  locale?: string;
  siteName?: string;
  /** URL absoluta del sitio, para construir canónicas y og:url. */
  siteUrl: string;
}

/**
 * Etiquetas de indexación. Se aplican sobre el DOM y no sobre `index.html`
 * porque la landing se prerenderiza: lo que este servicio escribe queda dentro
 * del HTML que recibe el buscador, sin necesidad de ejecutar JavaScript.
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private title = inject(Title);
  private meta = inject(Meta);
  private doc = inject(DOCUMENT);

  apply(cfg: SeoConfig): void {
    const url = `${cfg.siteUrl.replace(/\/$/, '')}${cfg.path}`;
    const image = cfg.image ? `${cfg.siteUrl.replace(/\/$/, '')}${cfg.image}` : undefined;
    const siteName = cfg.siteName ?? 'Maya';

    this.title.setTitle(cfg.title);

    const tags: Record<string, string | undefined> = {
      description: cfg.description,
      robots: 'index, follow, max-snippet:-1, max-image-preview:large',
      'og:type': 'website',
      'og:site_name': siteName,
      'og:title': cfg.title,
      'og:description': cfg.description,
      'og:url': url,
      'og:locale': cfg.locale ?? 'es_ES',
      'og:image': image,
      'twitter:card': image ? 'summary_large_image' : 'summary',
      'twitter:title': cfg.title,
      'twitter:description': cfg.description,
      'twitter:image': image,
    };

    for (const [name, content] of Object.entries(tags)) {
      if (!content) continue;
      const selector = name.startsWith('og:') ? `property='${name}'` : `name='${name}'`;
      this.meta.updateTag(
        name.startsWith('og:') ? { property: name, content } : { name, content },
        selector,
      );
    }

    this.setCanonical(url);
  }

  private setCanonical(url: string): void {
    const head = this.doc.head;
    let link = head.querySelector<HTMLLinkElement>("link[rel='canonical']");
    if (!link) {
      link = this.doc.createElement('link');
      link.setAttribute('rel', 'canonical');
      head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  /**
   * Inserta datos estructurados. Angular no permite `<script>` dentro de una
   * plantilla, así que el nodo se crea a mano; en el prerenderizado se serializa
   * junto al resto del `<head>`.
   */
  setJsonLd(id: string, data: unknown): void {
    const head = this.doc.head;
    const existing = head.querySelector(`script[data-jsonld='${id}']`);
    if (existing) existing.remove();

    const script = this.doc.createElement('script');
    script.setAttribute('type', 'application/ld+json');
    script.setAttribute('data-jsonld', id);
    script.textContent = JSON.stringify(data);
    head.appendChild(script);
  }
}
