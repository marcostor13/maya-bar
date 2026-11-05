import { Component, computed, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LEGAL_CONTACT, LEGAL_DOCS, LegalDocKey } from './legal.data';

/**
 * Páginas legales públicas (privacidad, términos y eliminación de datos).
 * Meta las exige en la configuración de la app y en la revisión: deben ser
 * URLs públicas del dominio del producto, por eso se prerenderizan.
 */
@Component({
  selector: 'app-legal',
  standalone: true,
  imports: [RouterLink],
  template: `
    <header class="lg-header">
      <div class="lg-wrap">
        <a routerLink="/" aria-label="Maya CRM, inicio">
          <img src="/logo-light.png?v=2" alt="Maya CRM" width="132" height="36" />
        </a>
      </div>
    </header>

    <main class="lg-wrap lg-main animate-fade-in">
      <h1>{{ doc().title }}</h1>
      <p class="lg-updated">Última actualización: {{ doc().updated }}</p>
      <p class="lg-intro">{{ doc().intro }}</p>

      @for (s of doc().sections; track s.title) {
        <section class="card lg-section">
          <h2>{{ s.title }}</h2>
          @for (p of s.paragraphs ?? []; track $index) {
            <p>{{ p }}</p>
          }
          @if (s.items?.length) {
            <ul>
              @for (i of s.items; track $index) {
                <li>{{ i }}</li>
              }
            </ul>
          }
        </section>
      }

      <section class="card lg-section">
        <h2>Contacto</h2>
        <p>
          {{ contact.company }} · {{ contact.address }}<br />
          Correo: <a [href]="'mailto:' + contact.email">{{ contact.email }}</a>
        </p>
      </section>

      <nav class="lg-nav" aria-label="Documentos legales">
        <a routerLink="/privacidad">Política de privacidad</a>
        <a routerLink="/terminos">Términos del servicio</a>
        <a routerLink="/eliminacion-datos">Eliminación de datos</a>
      </nav>
    </main>
  `,
  styles: [
    `
      :host { display: block; min-height: 100vh; background: var(--color-bg-app); }
      .lg-wrap { width: 100%; max-width: 820px; margin: 0 auto; padding: 0 24px; box-sizing: border-box; }
      .lg-header { background: var(--color-white); border-bottom: 1px solid var(--color-border); padding: 16px 0; }
      .lg-main { padding-top: 40px; padding-bottom: 64px; }
      h1 { font-family: var(--font-heading); font-size: 32px; color: var(--color-text-main); margin: 0 0 8px; }
      .lg-updated { color: var(--color-text-muted); font-size: 13px; margin: 0 0 24px; }
      .lg-intro { color: var(--color-text-main); line-height: 1.7; margin: 0 0 24px; }
      .lg-section { padding: 24px; margin-bottom: 16px; }
      h2 { font-family: var(--font-heading); font-size: 18px; color: var(--color-text-main); margin: 0 0 12px; }
      p, li { color: var(--color-text-main); line-height: 1.7; font-size: 15px; }
      p { margin: 0 0 10px; }
      ul { margin: 0; padding-left: 20px; }
      li { margin-bottom: 6px; }
      a { color: var(--color-brand); }
      .lg-nav { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 32px; font-size: 14px; }
    `,
  ],
})
export class LegalComponent {
  private route = inject(ActivatedRoute);
  private title = inject(Title);
  private meta = inject(Meta);

  readonly contact = LEGAL_CONTACT;
  readonly doc = computed(() => LEGAL_DOCS[this.route.snapshot.data['doc'] as LegalDocKey]);

  constructor() {
    const d = this.doc();
    this.title.setTitle(`${d.title} — Maya CRM`);
    this.meta.updateTag({ name: 'description', content: d.intro.slice(0, 155) });
  }
}
