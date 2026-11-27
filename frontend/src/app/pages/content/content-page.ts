import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LucideAngularModule, ArrowRight, CheckCircle2, ChevronRight } from 'lucide-angular';
import { SeoService } from '../../shared/seo';
import { environment } from '../../../environments/environment';
import { pageBySlug } from './content.data';
import { ContentPage, KIND_LABEL } from './content.model';
import { ContentShellComponent } from './content-shell';

/** "2026-11-25" → "25 de noviembre de 2026" (sin depender de la zona horaria). */
export function longDate(iso: string): string {
  return new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

/**
 * Página de contenido indexable (HU79): funciones, industrias, comparativas y
 * guías. Se prerenderiza; la estructura "respuesta primero" (definición corta,
 * pasos, tablas y preguntas frecuentes) es la que buscadores e IA citan.
 */
@Component({
  selector: 'app-content-page',
  standalone: true,
  imports: [RouterLink, LucideAngularModule, ContentShellComponent],
  template: `
    @if (page(); as p) {
      <app-content-shell>
        <nav class="crumbs" aria-label="Ruta de navegación">
          <a routerLink="/">Inicio</a>
          <lucide-icon [img]="ChevronRight" [size]="14" aria-hidden="true" />
          <a routerLink="/recursos">Recursos</a>
          <lucide-icon [img]="ChevronRight" [size]="14" aria-hidden="true" />
          <span>{{ kindLabel(p) }}</span>
        </nav>

        <article class="animate-fade-in">
          <header class="art-head">
            <h1>{{ p.h1 }}</h1>
            <p class="updated">Actualizado el <time [attr.datetime]="p.updated">{{ date(p.updated) }}</time></p>
          </header>

          <p class="answer">{{ p.answer }}</p>

          @for (s of p.sections; track s.h2) {
            <section class="block">
              <h2>{{ s.h2 }}</h2>
              @for (para of s.paragraphs ?? []; track $index) {
                <p>{{ para }}</p>
              }
              @if (s.items?.length) {
                <ul class="checks">
                  @for (i of s.items; track $index) {
                    <li><lucide-icon [img]="CheckCircle2" [size]="18" aria-hidden="true" /><span>{{ i }}</span></li>
                  }
                </ul>
              }
              @if (s.steps?.length) {
                <ol class="steps">
                  @for (i of s.steps; track $index) {
                    <li>{{ i }}</li>
                  }
                </ol>
              }
              @if (s.table; as t) {
                <div class="table-wrap">
                  <table>
                    <thead><tr>@for (h of t.head; track $index) { <th scope="col">{{ h }}</th> }</tr></thead>
                    <tbody>
                      @for (r of t.rows; track $index) {
                        <tr>@for (c of r; track $index; let first = $first) {
                          @if (first) { <th scope="row">{{ c }}</th> } @else { <td>{{ c }}</td> }
                        }</tr>
                      }
                    </tbody>
                  </table>
                </div>
                @if (t.note) { <p class="note">{{ t.note }}</p> }
              }
            </section>
          }

          @if (p.faqs.length) {
            <section class="block">
              <h2>Preguntas frecuentes</h2>
              @for (f of p.faqs; track f.q) {
                <div class="faq">
                  <h3>{{ f.q }}</h3>
                  <p>{{ f.a }}</p>
                </div>
              }
            </section>
          }

          @if (p.sources?.length) {
            <section class="sources">
              <h2>Fuentes</h2>
              <ul>
                @for (s of p.sources; track s.url) {
                  <li><a [href]="s.url" target="_blank" rel="noopener">{{ s.label }}</a></li>
                }
              </ul>
            </section>
          }
        </article>

        <section class="card cta">
          <h2>Míralo funcionando antes de contratar</h2>
          <p>Te mostramos una demo en vivo por WhatsApp. Sin permanencia y, si prefieres, lo dejamos funcionando por ti.</p>
          <div class="cta-actions">
            <a class="btn btn-primary btn-lg" href="https://wa.me/{{ waNumber }}?text=Hola%2C%20quiero%20ver%20una%20demo%20de%20Maya%20CRM" target="_blank" rel="noopener">Pide tu demo <lucide-icon [img]="ArrowRight" [size]="18" /></a>
            <a class="btn btn-secondary btn-lg" routerLink="/" fragment="precios">Ver precios</a>
          </div>
        </section>

        @if (related().length) {
          <nav class="related" aria-label="Páginas relacionadas">
            <h2>También te puede servir</h2>
            <div class="rel-grid">
              @for (r of related(); track r.slug) {
                <a class="card rel" [routerLink]="'/' + r.slug">
                  <span class="rel-kind">{{ kindLabel(r) }}</span>
                  <strong>{{ r.h1 }}</strong>
                </a>
              }
            </div>
          </nav>
        }
      </app-content-shell>
    }
  `,
  styles: [
    `
      .crumbs { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 13px; color: var(--color-text-muted); margin-bottom: 20px; }
      .crumbs a { color: var(--color-text-muted); text-decoration: none; }
      .crumbs a:hover { color: var(--color-brand); }
      h1 { font-family: var(--font-heading); font-size: clamp(28px, 5vw, 40px); line-height: 1.15; color: var(--color-text-main); margin: 0 0 8px; }
      .updated { color: var(--color-text-muted); font-size: 13px; margin: 0 0 24px; }
      .answer { font-size: 18px; line-height: 1.7; color: var(--color-text-main); background: var(--color-white); border-left: 4px solid var(--color-brand); border-radius: var(--radius-md, 12px); padding: 20px 24px; margin: 0 0 32px; box-shadow: var(--shadow-sm); }
      .block { margin-bottom: 36px; }
      h2 { font-family: var(--font-heading); font-size: 24px; color: var(--color-text-main); margin: 0 0 14px; }
      h3 { font-family: var(--font-heading); font-size: 17px; color: var(--color-text-main); margin: 0 0 6px; }
      p, li { color: var(--color-text-main); line-height: 1.75; font-size: 16px; }
      p { margin: 0 0 12px; }
      .checks { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
      .checks li { display: flex; gap: 10px; align-items: flex-start; }
      .checks lucide-icon { color: var(--color-success); flex-shrink: 0; margin-top: 4px; }
      .steps { padding-left: 22px; margin: 0; display: grid; gap: 8px; }
      .table-wrap { overflow-x: auto; border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-white); }
      table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 520px; }
      th, td { text-align: left; padding: 12px 16px; border-bottom: 1px solid var(--color-border); vertical-align: top; color: var(--color-text-main); }
      thead th { background: var(--color-bg-app); font-weight: 600; }
      tbody th { font-weight: 600; }
      tr:last-child th, tr:last-child td { border-bottom: none; }
      .note { font-size: 13px; color: var(--color-text-muted); margin-top: 8px; }
      .faq { padding: 16px 0; border-bottom: 1px solid var(--color-border); }
      .faq:last-child { border-bottom: none; }
      .faq p { margin: 0; }
      .sources { margin-bottom: 32px; }
      .sources h2 { font-size: 16px; }
      .sources li { font-size: 14px; }
      .sources a, .faq a { color: var(--color-brand); }
      .cta { padding: 28px; margin: 8px 0 40px; text-align: center; }
      .cta h2 { margin-bottom: 8px; }
      .cta-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 16px; }
      .cta-actions .btn { box-sizing: border-box; }
      .related h2 { font-size: 20px; }
      .rel-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
      .rel { padding: 18px 20px; text-decoration: none; display: grid; gap: 6px; transition: box-shadow 0.2s; }
      .rel:hover { box-shadow: var(--shadow-lg); }
      .rel:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }
      .rel strong { color: var(--color-text-main); font-size: 15px; line-height: 1.4; }
      .rel-kind { font-size: 12px; color: var(--color-brand); font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
      @media (max-width: 640px) {
        .answer { font-size: 16px; padding: 16px 18px; }
        h2 { font-size: 20px; }
        .cta { padding: 24px 18px; }
        .cta-actions .btn { width: 100%; justify-content: center; }
      }
    `,
  ],
})
export class ContentPageComponent {
  readonly waNumber = environment.whatsappNumber;
  private route = inject(ActivatedRoute);
  private seo = inject(SeoService);

  readonly ArrowRight = ArrowRight;
  readonly CheckCircle2 = CheckCircle2;
  readonly ChevronRight = ChevronRight;

  readonly page = computed(() => pageBySlug(this.route.snapshot.data['slug'] as string));
  readonly related = computed(() =>
    (this.page()?.related ?? []).map((s) => pageBySlug(s)).filter((p): p is ContentPage => !!p),
  );
  readonly date = longDate;
  readonly kindLabel = (p: ContentPage) => KIND_LABEL[p.kind];

  constructor() {
    const p = this.page();
    if (!p) return;
    const site = environment.siteUrl.replace(/\/$/, '');
    const url = `${site}/${p.slug}`;
    this.seo.apply({
      title: p.title,
      description: p.description,
      path: `/${p.slug}`,
      image: '/og-image.png',
      siteUrl: environment.siteUrl,
    });
    this.seo.setJsonLd('article', {
      '@context': 'https://schema.org',
      '@type': p.kind === 'guia' ? 'TechArticle' : 'Article',
      headline: p.h1,
      description: p.description,
      inLanguage: 'es',
      dateModified: p.updated,
      mainEntityOfPage: url,
      image: `${site}/og-image.png`,
      author: { '@type': 'Organization', name: 'Maya CRM', url: site },
      publisher: { '@type': 'Organization', name: 'Maya CRM', logo: { '@type': 'ImageObject', url: `${site}/logo.png?v=2` } },
    });
    this.seo.setJsonLd('breadcrumb', {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${site}/` },
        { '@type': 'ListItem', position: 2, name: 'Recursos', item: `${site}/recursos` },
        { '@type': 'ListItem', position: 3, name: p.h1, item: url },
      ],
    });
    if (p.faqs.length)
      this.seo.setJsonLd('faq', {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: p.faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      });
  }
}
