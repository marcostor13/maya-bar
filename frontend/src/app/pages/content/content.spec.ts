import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { CONTENT_PAGES, pageBySlug } from './content.data';
import { CONTENT_SLUGS } from './content.slugs';
import { FUNCTION_LINKS } from './content.links';
import { buildLlms, buildLlmsFull, buildSitemap } from './seo-files';
import { PLAN_FACTS, fmtUsd } from './facts';
import { ContentPageComponent, longDate } from './content-page';
import CATALOG from '../../shared/catalog.generated.json';

const SITE = 'https://mayacrm.site';

describe('Páginas de contenido (HU79–HU83)', () => {
  it('las rutas coinciden con los datos y no hay slugs repetidos', () => {
    expect(CONTENT_PAGES.map((p) => p.slug).sort()).toEqual([...CONTENT_SLUGS].sort());
    expect(new Set(CONTENT_SLUGS).size).toBe(CONTENT_SLUGS.length);
    for (const l of FUNCTION_LINKS) expect(pageBySlug(l.slug)?.kind).toBe('funcion');
  });

  it('cada página cumple la estructura SEO/GEO', () => {
    for (const p of CONTENT_PAGES) {
      const where = p.slug;
      expect(p.title.length, where).toBeLessThanOrEqual(70);
      expect(p.description.length, where).toBeGreaterThan(70);
      expect(p.description.length, where).toBeLessThanOrEqual(160);
      expect(p.answer.length, where).toBeGreaterThan(120);
      expect(p.updated, where).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.sections.length, where).toBeGreaterThanOrEqual(1);
      expect(p.faqs.length, where).toBeGreaterThanOrEqual(3);
      expect(p.related.length, where).toBeGreaterThanOrEqual(3);
      for (const r of p.related) expect(pageBySlug(r), `${where} → ${r}`).toBeTruthy();
      for (const s of p.sources ?? []) expect(s.url, where).toMatch(/^https:\/\//);
    }
    expect(new Set(CONTENT_PAGES.map((p) => p.title)).size).toBe(CONTENT_PAGES.length);
  });

  it('los precios salen del catálogo del backend', () => {
    const crece = CATALOG.plans.find((p) => p.id === 'crece')!;
    expect(PLAN_FACTS.find((p) => p.id === 'crece')).toMatchObject({ usd: crece.prices?.USD?.monthly, pen: crece.prices?.PEN?.monthly });
    expect(PLAN_FACTS.some((p) => p.id === 'empresa')).toBe(false);
  });

  it('límites del catálogo y un solo formato de números (miles con punto, decimales con coma)', () => {
    const escala = CATALOG.plans.find((p) => p.id === 'escala')!;
    const f = PLAN_FACTS.find((p) => p.id === 'escala')!;
    expect(f.contacts).toBe(escala.limits.contacts!.toLocaleString('en-US').replace(/,/g, '.'));
    expect(f.mailboxes).toBe(String(escala.limits.mailboxes));
    expect(fmtUsd(0.0703)).toBe('US$ 0,0703');
    expect(fmtUsd(70.3)).toBe('US$ 70,30');
    const text = buildLlmsFull(SITE, CONTENT_PAGES);
    expect(text).not.toMatch(/\d,\d{3}(?!\d)/);
    expect(text).toContain(`${f.name}, ${f.mailboxes}`);
  });

  it('las comparativas dicen la fecha de revisión y sus fuentes', () => {
    for (const p of CONTENT_PAGES.filter((x) => x.kind === 'comparativa')) {
      expect(p.sources?.length, p.slug).toBeGreaterThan(0);
      expect(p.sections[0].table?.note, p.slug).toContain('25 de noviembre de 2026');
    }
  });

  it('sitemap con la landing, recursos, legales y cada página', () => {
    const xml = buildSitemap(SITE, CONTENT_PAGES);
    expect(xml).toContain('<loc>https://mayacrm.site/</loc>');
    expect(xml).toContain('<loc>https://mayacrm.site/recursos</loc>');
    expect(xml).toContain('<loc>https://mayacrm.site/privacidad</loc>');
    for (const s of CONTENT_SLUGS) expect(xml).toContain(`<loc>https://mayacrm.site/${s}</loc>`);
    expect(xml.match(/<url>/g)).toHaveLength(5 + CONTENT_SLUGS.length);
  });

  it('llms.txt conserva la base y añade precios y el índice; llms-full trae el texto', () => {
    const txt = buildLlms('# Maya CRM\n\n> Base.', SITE, CONTENT_PAGES);
    expect(txt.startsWith('# Maya CRM')).toBe(true);
    expect(txt).toContain(`US$ ${PLAN_FACTS[0].usd}`);
    expect(txt).toContain('(https://mayacrm.site/comparar/kommo)');
    expect(txt).toContain('https://mayacrm.site/llms-full.txt');
    const full = buildLlmsFull(SITE, CONTENT_PAGES);
    for (const p of CONTENT_PAGES) expect(full).toContain(`# ${p.h1}`);
    expect(full).toContain('| Marketing |');
  });

  it('fecha larga en español', () => {
    expect(longDate('2026-11-25')).toBe('25 de noviembre de 2026');
  });

  it('la página muestra h1, respuesta, tabla y FAQ, y deja JSON-LD Article, FAQ y migas', async () => {
    await TestBed.configureTestingModule({
      imports: [ContentPageComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: { slug: 'comparar/kommo' } } } },
      ],
    }).compileComponents();
    const f = TestBed.createComponent(ContentPageComponent);
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    const p = pageBySlug('comparar/kommo')!;
    expect(el.querySelector('h1')?.textContent).toContain(p.h1);
    expect(el.querySelector('.answer')?.textContent).toContain('Kommo');
    expect(el.querySelectorAll('table').length).toBeGreaterThan(0);
    expect(el.querySelectorAll('.faq').length).toBe(p.faqs.length);
    expect(el.querySelectorAll('.rel').length).toBe(p.related.length);
    const ld = [...document.head.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent!)['@type']);
    expect(ld).toEqual(expect.arrayContaining(['Article', 'BreadcrumbList', 'FAQPage']));
    expect(document.head.querySelector("link[rel='canonical']")?.getAttribute('href')).toContain('/comparar/kommo');
    expect(document.title).toBe(p.title);
  });
});
