import { ContentPage, KIND_LABEL, ContentKind } from './content.model';
import { PLAN_FACTS, PRICING_NOTE } from './facts';

/**
 * Archivos para buscadores y asistentes de IA (HU79), generados desde las
 * páginas de contenido para que nunca queden desactualizados. Los sirve
 * `server.ts`.
 */

const STATIC_PAGES: { path: string; lastmod: string; priority: string; changefreq: string }[] = [
  { path: '/', lastmod: '2026-11-25', priority: '1.0', changefreq: 'weekly' },
  { path: '/recursos', lastmod: '2026-11-25', priority: '0.6', changefreq: 'weekly' },
  { path: '/privacidad', lastmod: '2026-11-05', priority: '0.2', changefreq: 'yearly' },
  { path: '/terminos', lastmod: '2026-11-05', priority: '0.2', changefreq: 'yearly' },
  { path: '/eliminacion-datos', lastmod: '2026-11-05', priority: '0.2', changefreq: 'yearly' },
];

const PRIORITY: Record<ContentKind, string> = {
  funcion: '0.9',
  comparativa: '0.8',
  industria: '0.8',
  guia: '0.7',
};

const xml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildSitemap(siteUrl: string, pages: ContentPage[]): string {
  const base = siteUrl.replace(/\/$/, '');
  const urls = [
    ...STATIC_PAGES.map((p) => ({ loc: `${base}${p.path}`, lastmod: p.lastmod, changefreq: p.changefreq, priority: p.priority })),
    ...pages.map((p) => ({ loc: `${base}/${p.slug}`, lastmod: p.updated, changefreq: 'monthly', priority: PRIORITY[p.kind] })),
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(
      (u) =>
        `  <url><loc>${xml(u.loc)}</loc><lastmod>${u.lastmod}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`,
    ),
    '</urlset>',
    '',
  ].join('\n');
}

function pricingMarkdown(): string {
  return [
    '## Precios',
    '',
    ...PLAN_FACTS.map(
      (p) =>
        `- **${p.name}**: US$ ${p.usd} o S/ ${p.pen} al mes; ${p.users} usuarios, ${p.whatsappNumbers} número(s) de WhatsApp, ${p.contacts} contactos, agentes de IA: ${p.aiAgents}, ${p.aiCredits} créditos de IA al mes, campañas de WhatsApp: ${p.whatsappCampaigns ? 'sí' : 'no'}.`,
    ),
    '- **Empresa**: a medida.',
    '',
    PRICING_NOTE,
  ].join('\n');
}

/**
 * `llms.txt`: la descripción base (archivo `public/llms.txt`) + precios +
 * índice de páginas con su respuesta corta.
 */
export function buildLlms(base: string, siteUrl: string, pages: ContentPage[]): string {
  const url = siteUrl.replace(/\/$/, '');
  const byKind = (Object.keys(KIND_LABEL) as ContentKind[])
    .map((k) => {
      const list = pages.filter((p) => p.kind === k);
      if (!list.length) return '';
      return [`### ${KIND_LABEL[k]}`, '', ...list.map((p) => `- [${p.h1}](${url}/${p.slug}): ${p.answer}`)].join('\n');
    })
    .filter(Boolean);
  return [
    base.trim(),
    '',
    pricingMarkdown(),
    '',
    '## Páginas',
    '',
    ...byKind.flatMap((b) => [b, '']),
    `Texto completo de todas las páginas: ${url}/llms-full.txt`,
    '',
  ].join('\n');
}

/** `llms-full.txt`: el texto completo de cada página, en Markdown. */
export function buildLlmsFull(siteUrl: string, pages: ContentPage[]): string {
  const url = siteUrl.replace(/\/$/, '');
  const out: string[] = ['# Maya CRM — contenido completo', '', pricingMarkdown(), ''];
  for (const p of pages) {
    out.push(`# ${p.h1}`, '', `URL: ${url}/${p.slug} · Actualizado: ${p.updated}`, '', p.answer, '');
    for (const s of p.sections) {
      out.push(`## ${s.h2}`, '');
      for (const para of s.paragraphs ?? []) out.push(para, '');
      if (s.items?.length) out.push(...s.items.map((i) => `- ${i}`), '');
      if (s.steps?.length) out.push(...s.steps.map((i, n) => `${n + 1}. ${i}`), '');
      if (s.table) {
        out.push(`| ${s.table.head.join(' | ')} |`, `|${s.table.head.map(() => '---').join('|')}|`);
        out.push(...s.table.rows.map((r) => `| ${r.join(' | ')} |`), '');
        if (s.table.note) out.push(s.table.note, '');
      }
    }
    if (p.faqs.length) {
      out.push('## Preguntas frecuentes', '');
      for (const f of p.faqs) out.push(`**${f.q}** ${f.a}`, '');
    }
    if (p.sources?.length) out.push('Fuentes: ' + p.sources.map((s) => `${s.label} (${s.url})`).join('; '), '');
  }
  return out.join('\n');
}
