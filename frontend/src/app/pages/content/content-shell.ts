import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FUNCTION_LINKS } from './content.links';

/** Cabecera y pie comunes de las páginas de contenido y de `/recursos` (HU79). */
@Component({
  selector: 'app-content-shell',
  standalone: true,
  imports: [RouterLink],
  template: `
    <header class="cs-header">
      <div class="cs-wrap cs-head">
        <a routerLink="/" aria-label="Maya CRM, inicio">
          <img src="/logo.png?v=2" alt="Maya CRM" width="132" height="36" />
        </a>
        <nav class="cs-nav" aria-label="Principal">
          <a routerLink="/recursos" class="hide-sm">Recursos</a>
          <a routerLink="/" fragment="precios" class="hide-sm">Precios</a>
          <a routerLink="/login" class="hide-sm">Ingresar</a>
          <a class="btn btn-primary btn-sm" routerLink="/register">Probar gratis</a>
        </nav>
      </div>
    </header>

    <main class="cs-wrap cs-main">
      <ng-content />
    </main>

    <footer class="cs-footer">
      <div class="cs-wrap cs-foot">
        <nav aria-label="Funciones">
          <h3>Funciones</h3>
          @for (l of links; track l.slug) {
            <a [routerLink]="'/' + l.slug">{{ l.label }}</a>
          }
        </nav>
        <nav aria-label="Maya CRM">
          <h3>Maya CRM</h3>
          <a routerLink="/recursos">Recursos y guías</a>
          <a routerLink="/" fragment="precios">Precios</a>
          <a routerLink="/register">Crear cuenta</a>
          <a routerLink="/privacidad">Privacidad</a>
          <a routerLink="/terminos">Términos</a>
        </nav>
      </div>
    </footer>
  `,
  styles: [
    `
      :host { display: block; min-height: 100vh; min-height: 100dvh; background: var(--color-bg-app); }
      .cs-wrap { width: 100%; max-width: 860px; margin: 0 auto; padding: 0 24px; box-sizing: border-box; }
      .cs-header { background: var(--color-white); border-bottom: 1px solid var(--color-border); padding: 14px 0; position: sticky; top: 0; z-index: 10; }
      .cs-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
      .cs-nav { display: flex; align-items: center; gap: 20px; font-size: 14px; }
      .cs-nav a:not(.btn) { color: var(--color-text-main); text-decoration: none; }
      .cs-nav a:not(.btn):hover { color: var(--color-brand); }
      .cs-main { padding-top: 32px; padding-bottom: 56px; }
      .cs-footer { background: var(--color-white); border-top: 1px solid var(--color-border); padding: 32px 0; }
      .cs-foot { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 24px; }
      .cs-foot nav { display: grid; gap: 8px; align-content: start; }
      .cs-foot h3 { font-family: var(--font-heading); font-size: 14px; margin: 0 0 4px; color: var(--color-text-main); }
      .cs-foot a { color: var(--color-text-muted); font-size: 14px; text-decoration: none; }
      .cs-foot a:hover { color: var(--color-brand); }
      @media (max-width: 640px) { .hide-sm { display: none; } .cs-wrap { padding: 0 16px; } }
    `,
  ],
})
export class ContentShellComponent {
  readonly links = FUNCTION_LINKS;
}
