import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { linkify } from './linkify';

/**
 * Texto de un mensaje con los links y correos clicables.
 *
 * El host usa `display: contents`, así que hereda el `white-space: pre-wrap` y
 * el corte de palabras del elemento que lo contiene: se pone dentro del mismo
 * `<p>` o `<span>` que antes tenía la interpolación.
 *
 * El color del link se puede ajustar con `--rich-text-link` (por defecto la
 * marca); sobre un fondo de marca conviene `inherit`.
 */
@Component({
  selector: 'app-rich-text',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@for (s of segments(); track $index) {@if (s.href) {<a class="rt-link" [href]="s.href" [attr.target]="s.external ? '_blank' : null" rel="noopener noreferrer">{{ s.text }}</a>} @else {<ng-container>{{ s.text }}</ng-container>}}`,
  styles: [`
    :host { display: contents; }
    .rt-link {
      color: var(--rich-text-link, var(--color-brand));
      text-decoration: underline;
      text-decoration-thickness: 1px;
      text-underline-offset: 2px;
      overflow-wrap: anywhere;
      border-radius: 4px;
    }
    .rt-link:hover { text-decoration-thickness: 2px; }
    .rt-link:focus-visible { outline: 2px solid var(--color-brand); outline-offset: 2px; }
  `],
})
export class RichText {
  readonly text = input<string | null | undefined>('');
  readonly segments = computed(() => linkify(this.text()));
}
