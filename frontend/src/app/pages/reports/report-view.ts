import { Component, computed, input } from '@angular/core';
import { DecimalPipe } from '@angular/common';

export interface ReportRow { key: string | null; label: string; value: number; count: number }
export interface ReportResult { rows: ReportRow[]; total: number; from: string; to: string; metric: string; groupBy: string }
export type ReportChart = 'table' | 'bar' | 'line';

/** Sufijo de la métrica para leer el valor. */
export function metricSuffix(metric: string): string {
  if (metric === 'conversion_rate') return '%';
  if (metric === 'avg_days_to_close') return ' días';
  return '';
}

/** Dibuja el resultado de un reporte como tabla, barras o línea (HU64). Sin librerías. */
@Component({
  selector: 'app-report-view',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    @if (!result().rows.length) {
      <p class="empty">Sin datos en este rango.</p>
    } @else if (chart() === 'bar') {
      <div class="bars" role="list">
        @for (r of result().rows; track r.key) {
          <div class="bar-row" role="listitem">
            <span class="bar-label" [title]="r.label">{{ r.label }}</span>
            <span class="bar-track"><span class="bar-fill" [style.width.%]="pct(r.value)"></span></span>
            <span class="bar-value">{{ r.value | number: '1.0-2' }}{{ suffix() }}</span>
          </div>
        }
      </div>
    } @else if (chart() === 'line') {
      <svg class="line" viewBox="0 0 300 120" preserveAspectRatio="none" role="img" [attr.aria-label]="'Evolución: ' + summary()">
        <polyline [attr.points]="points()" fill="none" stroke="var(--color-brand)" stroke-width="2" vector-effect="non-scaling-stroke" />
      </svg>
      <div class="axis"><span>{{ result().rows[0].label }}</span><span>{{ result().rows[result().rows.length - 1].label }}</span></div>
    } @else {
      <div class="table-wrap">
        <table>
          <thead><tr><th>Grupo</th><th class="num">Valor</th><th class="num">Registros</th></tr></thead>
          <tbody>
            @for (r of result().rows; track r.key) {
              <tr><td data-label="Grupo">{{ r.label }}</td><td data-label="Valor" class="num">{{ r.value | number: '1.0-2' }}{{ suffix() }}</td><td data-label="Registros" class="num">{{ r.count }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    }
    <p class="total">Total: <strong>{{ result().total | number: '1.0-2' }}{{ suffix() }}</strong></p>
  `,
  styles: [`
    .empty { color: var(--color-text-muted); font-size: 13px; margin: 8px 0; }
    .bars { display: flex; flex-direction: column; gap: 8px; }
    .bar-row { display: grid; grid-template-columns: minmax(80px, 30%) 1fr auto; gap: 10px; align-items: center; font-size: 13px; }
    .bar-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar-track { background: var(--color-bg-light); border-radius: var(--radius-pill); height: 10px; overflow: hidden; }
    .bar-fill { display: block; height: 100%; background: var(--color-brand); border-radius: var(--radius-pill); }
    .bar-value { font-weight: 600; min-width: 48px; text-align: right; }
    .line { width: 100%; height: 140px; display: block; }
    .axis { display: flex; justify-content: space-between; font-size: 12px; color: var(--color-text-muted); }
    .num { text-align: right; }
    .total { font-size: 13px; color: var(--color-text-muted); margin: 10px 0 0; }
  `],
})
export class ReportViewComponent {
  result = input.required<ReportResult>();
  chart = input<ReportChart>('table');

  suffix = computed(() => metricSuffix(this.result().metric));
  private max = computed(() => Math.max(0, ...this.result().rows.map((r) => r.value)));

  pct(v: number) {
    const m = this.max();
    return m > 0 ? Math.max(2, (v / m) * 100) : 0;
  }

  points = computed(() => {
    const rows = this.result().rows;
    const m = this.max() || 1;
    const step = rows.length > 1 ? 300 / (rows.length - 1) : 0;
    return rows.map((r, i) => `${(i * step).toFixed(1)},${(115 - (r.value / m) * 110).toFixed(1)}`).join(' ');
  });

  summary = computed(() => this.result().rows.map((r) => `${r.label} ${r.value}`).join(', '));
}
