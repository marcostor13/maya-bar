import { Component, input, output } from '@angular/core';
import { LucideAngularModule, Braces } from 'lucide-angular';
import type { TemplateVariable } from '../../core/api/templates-api.service';

/**
 * Inserta un texto donde está el cursor de un campo y devuelve el valor
 * resultante. El cursor queda justo después de lo insertado.
 */
export function insertAtCursor(el: HTMLTextAreaElement | HTMLInputElement, text: string): string {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const value = el.value.slice(0, start) + text + el.value.slice(end);
  el.value = value;
  const caret = start + text.length;
  // El foco vuelve al campo para poder seguir escribiendo sin tocar el ratón.
  queueMicrotask(() => {
    el.focus();
    el.setSelectionRange(caret, caret);
  });
  return value;
}

/** Variables como chips: un clic las inserta, nadie las escribe a mano. */
@Component({
  selector: 'app-variable-chips',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="var-row" role="group" aria-label="Variables disponibles">
      <span class="var-label">
        <lucide-icon [img]="Braces" [size]="13"></lucide-icon>
        Insertar
      </span>
      @for (v of variables(); track v.token) {
        <button type="button" class="var-chip" (click)="pick.emit(v.token)"
          [title]="v.token + ' → ' + v.example">
          {{ v.label }}
        </button>
      }
    </div>
  `,
  styles: [`
    .var-row { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
    .var-label { display:inline-flex; align-items:center; gap:4px; font-size:12px; color:var(--color-text-muted); margin-right:2px; }
    .var-chip { padding:4px 10px; font-size:12px; font-family:var(--font-base); font-weight:500; cursor:pointer;
      border-radius:var(--radius-pill); border:1px solid var(--color-border); background:var(--color-white);
      color:var(--color-brand); transition:all var(--transition-fast); }
    .var-chip:hover { background:var(--color-brand-light); border-color:var(--color-brand); }
  `],
})
export class VariableChipsComponent {
  variables = input<TemplateVariable[]>([]);
  pick = output<string>();
  readonly Braces = Braces;
}
