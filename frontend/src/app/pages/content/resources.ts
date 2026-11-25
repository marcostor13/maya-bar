import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../shared/seo';
import { environment } from '../../../environments/environment';
import { CONTENT_PAGES } from './content.data';
import { ContentKind, KIND_LABEL } from './content.model';
import { ContentShellComponent } from './content-shell';

/** Índice de páginas de contenido (`/recursos`, HU79). */
@Component({
  selector: 'app-resources',
  standalone: true,
  imports: [RouterLink, ContentShellComponent],
  template: `
    <app-content-shell>
      <h1 class="animate-fade-in">Recursos de Maya CRM</h1>
      <p class="lead">Funciones, casos por industria, comparativas y guías para vender mejor por WhatsApp.</p>
      @for (g of groups; track g.kind) {
        <section class="group">
          <h2>{{ g.label }}</h2>
          <div class="grid">
            @for (p of g.pages; track p.slug) {
              <a class="card item" [routerLink]="'/' + p.slug">
                <strong>{{ p.h1 }}</strong>
                <span>{{ p.description }}</span>
              </a>
            }
          </div>
        </section>
      }
    </app-content-shell>
  `,
  styles: [
    `
      h1 { font-family: var(--font-heading); font-size: clamp(28px, 5vw, 38px); margin: 0 0 8px; color: var(--color-text-main); }
      .lead { color: var(--color-text-muted); font-size: 17px; margin: 0 0 32px; line-height: 1.6; }
      .group { margin-bottom: 32px; }
      h2 { font-family: var(--font-heading); font-size: 20px; margin: 0 0 12px; color: var(--color-text-main); }
      .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
      .item { padding: 20px 24px; display: grid; gap: 6px; text-decoration: none; transition: box-shadow 0.2s; }
      .item:hover { box-shadow: var(--shadow-lg); }
      .item:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }
      .item strong { color: var(--color-text-main); font-size: 16px; line-height: 1.35; }
      .item span { color: var(--color-text-muted); font-size: 14px; line-height: 1.5; }
    `,
  ],
})
export class ResourcesComponent {
  readonly groups = (Object.keys(KIND_LABEL) as ContentKind[])
    .map((kind) => ({ kind, label: KIND_LABEL[kind], pages: CONTENT_PAGES.filter((p) => p.kind === kind) }))
    .filter((g) => g.pages.length);

  constructor() {
    inject(SeoService).apply({
      title: 'Recursos: funciones, comparativas y guías — Maya CRM',
      description:
        'Guías, comparativas y casos por industria para vender por WhatsApp con un CRM: costos de mensajes, IA, campañas y formularios.',
      path: '/recursos',
      image: '/og-image.png',
      siteUrl: environment.siteUrl,
    });
  }
}
