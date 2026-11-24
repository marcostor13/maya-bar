import { Component, computed, input } from '@angular/core';
import { LucideAngularModule, Flame, Thermometer, Snowflake } from 'lucide-angular';

export type Heat = 'hot' | 'warm' | 'cold';

const LABEL: Record<Heat, string> = { hot: 'Caliente', warm: 'Tibio', cold: 'Frío' };

/** Insignia del puntaje de un lead (HU70): temperatura, número y motivo. */
@Component({
  selector: 'app-score-badge',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    @if (score() !== null && score() !== undefined) {
      <span class="score" [attr.data-heat]="heat()" [title]="reason() || label()" [attr.aria-label]="label() + ', ' + score() + ' de 100' + (reason() ? '. ' + reason() : '')">
        <lucide-icon [img]="icon()" [size]="11" [strokeWidth]="2.6"></lucide-icon>
        {{ label() }} {{ score() }}
      </span>
    }
  `,
  styles: [`
    :host { display: inline-flex; }
    .score { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 700; white-space: nowrap; }
    .score[data-heat="hot"] { background: color-mix(in srgb, var(--color-error) 12%, var(--color-white)); color: var(--color-error); }
    .score[data-heat="warm"] { background: color-mix(in srgb, var(--color-warning) 14%, var(--color-white)); color: var(--color-warning); }
    .score[data-heat="cold"] { background: color-mix(in srgb, var(--color-info) 12%, var(--color-white)); color: var(--color-info); }
  `],
})
export class ScoreBadgeComponent {
  score = input<number | null | undefined>(null);
  heatLabel = input<Heat | null | undefined>(null);
  reason = input<string | null | undefined>('');

  heat = computed<Heat>(() => this.heatLabel() ?? ((this.score() ?? 0) >= 70 ? 'hot' : (this.score() ?? 0) >= 40 ? 'warm' : 'cold'));
  label = computed(() => LABEL[this.heat()]);
  icon = computed(() => (this.heat() === 'hot' ? Flame : this.heat() === 'warm' ? Thermometer : Snowflake));
}
