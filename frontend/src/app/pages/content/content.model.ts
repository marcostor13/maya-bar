/**
 * Páginas de contenido indexables (HU79). Cada página es un dato: la plantilla
 * `ContentPageComponent` la pinta, el prerender la deja en HTML y `seo-files.ts`
 * arma con ellas el sitemap, `llms.txt` y `llms-full.txt`.
 */
export type ContentKind = 'funcion' | 'industria' | 'comparativa' | 'guia';

export interface ContentTable {
  head: string[];
  rows: string[][];
  /** Pie de la tabla: fuente o aclaración. */
  note?: string;
}

export interface ContentSection {
  h2: string;
  paragraphs?: string[];
  /** Lista con viñetas. */
  items?: string[];
  /** Lista numerada (pasos). */
  steps?: string[];
  table?: ContentTable;
}

export interface ContentFaq {
  q: string;
  a: string;
}

export interface ContentSource {
  label: string;
  url: string;
}

export interface ContentPage {
  /** Ruta sin barra inicial: `crm-whatsapp`, `comparar/hubspot`. */
  slug: string;
  kind: ContentKind;
  /** `<title>`: máx. ~60 caracteres. */
  title: string;
  /** Meta descripción: máx. ~155 caracteres. */
  description: string;
  h1: string;
  /** Respuesta directa de 2–3 frases: lo primero que leen buscadores e IA. */
  answer: string;
  /** Fecha de la última revisión (AAAA-MM-DD). */
  updated: string;
  sections: ContentSection[];
  faqs: ContentFaq[];
  /** Slugs de páginas relacionadas. */
  related: string[];
  sources?: ContentSource[];
}

export const KIND_LABEL: Record<ContentKind, string> = {
  funcion: 'Funciones',
  industria: 'Industrias',
  comparativa: 'Comparativas',
  guia: 'Guías',
};
