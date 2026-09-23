import {
  Component, ElementRef, OnDestroy, computed, effect, inject, input, signal, untracked,
} from '@angular/core';
import { LucideAngularModule, Table2, ChartColumn } from 'lucide-angular';

/**
 * Gráficos SVG/HTML ligeros para el dashboard. Sin librerías: cada gráfico es
 * un componente con sus propios estilos, animación de entrada y tooltip.
 * Colores: tokens --chart-* y --seq-* de styles.scss (paleta validada).
 */

export type VizFormat = 'int' | 'money' | 'pct' | 'min';

export interface VizSeries { name: string; color: string; data: number[] }
export interface VizItem { label: string; value: number; sub?: string }
export interface VizTable { head: string[]; rows: (string | number)[][] }

const LOCALE = 'es-PE';

export function reducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function formatMinutes(m: number | null | undefined): string {
  if (m === null || m === undefined) return '—';
  if (m < 1) return `${Math.max(1, Math.round(m * 60))} s`;
  if (m < 60) return `${Math.round(m * 10) / 10} min`;
  if (m < 1440) {
    const h = Math.floor(m / 60);
    const rest = Math.round(m % 60);
    return rest ? `${h} h ${rest} min` : `${h} h`;
  }
  return `${Math.round((m / 1440) * 10) / 10} d`;
}

export function formatValue(v: number, f: VizFormat = 'int', compact = false): string {
  const n = (o: Intl.NumberFormatOptions) => new Intl.NumberFormat(LOCALE, o).format(v ?? 0);
  const opts: Intl.NumberFormatOptions = compact && Math.abs(v) >= 1000
    ? { notation: 'compact', maximumFractionDigits: 1 }
    : { maximumFractionDigits: 0 };
  if (f === 'money') return `S/ ${n(opts)}`;
  if (f === 'pct') return `${n({ maximumFractionDigits: 0 })}%`;
  if (f === 'min') return formatMinutes(v);
  return n(opts);
}

/** Etiqueta de una cubeta YYYY-MM-DD o YYYY-MM. */
export function bucketLabel(key: string, long = false): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d || 1);
  if (!d) return date.toLocaleDateString(LOCALE, { month: long ? 'long' : 'short', year: '2-digit' });
  return date.toLocaleDateString(LOCALE, long
    ? { weekday: 'short', day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short' });
}

/** Máximo "redondo" del eje y su paso, con 4 divisiones. */
export function niceScale(max: number, integer = true): { max: number; step: number } {
  if (max <= 0) return { max: 4, step: 1 };
  const raw = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  let step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? 10 * mag;
  if (integer) step = Math.max(1, Math.ceil(step));
  return { max: step * 4, step };
}

/** Observa el ancho del host para dibujar en píxeles reales. */
function hostWidth(el: ElementRef<HTMLElement>, onDestroy: (fn: () => void) => void) {
  const width = signal(0);
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver((e) => width.set(Math.floor(e[0].contentRect.width)));
    ro.observe(el.nativeElement);
    onDestroy(() => ro.disconnect());
  } else {
    width.set(600);
  }
  return width;
}

// ── Número animado ────────────────────────────────────────────────────────

@Component({
  selector: 'app-count-up',
  standalone: true,
  template: `{{ text() }}`,
  styles: [':host { font-variant-numeric: tabular-nums; }'],
})
export class CountUpComponent implements OnDestroy {
  value = input<number | null>(0);
  format = input<VizFormat>('int');
  private shown = signal(0);
  private raf = 0;
  text = computed(() => (this.value() === null ? '—' : formatValue(this.shown(), this.format())));

  constructor() {
    effect(() => {
      const to = this.value() ?? 0;
      untracked(() => this.animate(to));
    });
  }

  private animate(to: number) {
    cancelAnimationFrame(this.raf);
    const from = this.shown();
    if (from === to || reducedMotion() || typeof requestAnimationFrame === 'undefined') {
      this.shown.set(to);
      return;
    }
    const start = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / 1000);
      this.shown.set(from + (to - from) * (1 - Math.pow(1 - p, 4)));
      if (p < 1) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  ngOnDestroy() { cancelAnimationFrame(this.raf); }
}

// ── Sparkline ─────────────────────────────────────────────────────────────

let uid = 0;

@Component({
  selector: 'app-sparkline',
  standalone: true,
  template: `
    <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient [attr.id]="gid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" [attr.stop-color]="color()" stop-opacity="0.28" />
          <stop offset="1" [attr.stop-color]="color()" stop-opacity="0" />
        </linearGradient>
      </defs>
      @for (p of [paths()]; track p) {
        <g class="reveal">
          <path [attr.d]="p.area" [attr.fill]="'url(#' + gid + ')'" />
          <path class="line" [attr.d]="p.line" [attr.stroke]="color()" />
        </g>
      }
    </svg>
  `,
  styles: [`
    :host { display: block; height: 40px; }
    svg { width: 100%; height: 100%; overflow: visible; display: block; }
    .line { fill: none; stroke-width: 2; vector-effect: non-scaling-stroke; stroke-linecap: round; stroke-linejoin: round; }
    .reveal { animation: reveal 1.2s cubic-bezier(0.16, 1, 0.3, 1) 0.15s backwards; }
    @keyframes reveal { from { clip-path: inset(-10px 100% -10px -10px); } to { clip-path: inset(-10px -10px -10px -10px); } }
    @media (prefers-reduced-motion: reduce) { .reveal { animation: none; } }
  `],
})
export class SparklineComponent {
  data = input<number[]>([]);
  color = input('var(--chart-1)');
  readonly W = 120;
  readonly H = 40;
  readonly gid = `spark-${++uid}`;

  paths = computed(() => {
    const d = this.data();
    if (!d.length) return { line: '', area: '' };
    const max = Math.max(...d, 1);
    const pts = d.map((v, i) => [
      d.length === 1 ? this.W / 2 : (i / (d.length - 1)) * this.W,
      this.H - 3 - (v / max) * (this.H - 6),
    ]);
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
    return { line, area: `${line}L${this.W},${this.H}L0,${this.H}Z` };
  });
}

// ── Serie temporal: líneas o columnas agrupadas ──────────────────────────

const PAD = { l: 48, r: 12, t: 12, b: 28 };

@Component({
  selector: 'app-time-chart',
  standalone: true,
  template: `
    @if (series().length > 1) {
      <div class="legend">
        @for (s of series(); track s.name) {
          <span><i class="viz-swatch" [style.background]="s.color"></i>{{ s.name }}</span>
        }
      </div>
    }
    <div class="plot" [style.height.px]="height()">
      @if (w() > 0) {
        <svg [attr.width]="w()" [attr.height]="height()" role="img" [attr.aria-label]="ariaLabel()"
             tabindex="0" (keydown)="onKey($event)" (blur)="hover.set(-1)"
             (pointermove)="onMove($event)" (pointerleave)="hover.set(-1)">
          @for (t of geo().ticks; track t.v) {
            <line class="grid" [attr.x1]="pad.l" [attr.x2]="w() - pad.r" [attr.y1]="t.y" [attr.y2]="t.y" />
            <text class="tick" [attr.x]="pad.l - 8" [attr.y]="t.y + 4" text-anchor="end">{{ t.label }}</text>
          }
          @for (x of geo().xLabels; track x.i) {
            <text class="tick" [attr.x]="x.x" [attr.y]="height() - 8" text-anchor="middle">{{ x.label }}</text>
          }
          @if (hover() >= 0) {
            @if (type() === 'line') {
              <line class="cross" [attr.x1]="geo().xs[hover()]" [attr.x2]="geo().xs[hover()]"
                    [attr.y1]="pad.t" [attr.y2]="geo().base" />
            } @else {
              <rect class="band" [attr.x]="geo().xs[hover()] - geo().band / 2" [attr.y]="pad.t"
                    [attr.width]="geo().band" [attr.height]="geo().base - pad.t" rx="8" />
            }
          }
          @for (v of [series()]; track v) {
            @if (type() === 'line') {
              <g class="reveal">
                @for (s of geo().lines; track s.name; let first = $first) {
                  @if (first && area()) { <path [attr.d]="s.area" [attr.fill]="s.color" class="area" /> }
                  <path class="line" [attr.d]="s.d" [attr.stroke]="s.color" />
                }
              </g>
            } @else {
              @for (c of geo().cols; track $index) {
                <path class="col" [attr.d]="c.d" [attr.fill]="c.color" [style.--i]="c.i" />
              }
            }
          }
          @if (hover() >= 0 && type() === 'line') {
            @for (s of geo().lines; track s.name) {
              <circle class="dot" [attr.cx]="geo().xs[hover()]" [attr.cy]="s.ys[hover()]" r="5" [attr.fill]="s.color" />
            }
          }
        </svg>
        @if (hover() >= 0) {
          <div class="viz-tip side" [class.flip]="tipFlip()" [style.left.px]="geo().xs[hover()]" [style.top.px]="pad.t">
            <div class="viz-tip-title">{{ fullLabel(labels()[hover()]) }}</div>
            @for (s of series(); track s.name) {
              <div class="viz-tip-row"><i class="viz-swatch" [style.background]="s.color"></i>{{ s.name }}
                <b>{{ fmt(s.data[hover()] || 0) }}</b></div>
            }
          </div>
        }
      }
    </div>
  `,
  styles: [`
    :host { display: block; position: relative; }
    .legend { display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; color: var(--color-text-muted); margin-bottom: 12px; }
    .legend span { display: inline-flex; align-items: center; gap: 8px; }
    .plot { position: relative; width: 100%; }
    svg { display: block; overflow: visible; outline: none; touch-action: pan-y; }
    svg:focus-visible { outline: 2px solid var(--chart-1); outline-offset: 4px; border-radius: 8px; }
    .grid { stroke: var(--chart-grid); stroke-width: 1; }
    .tick { fill: var(--color-text-muted); font-size: 11px; font-family: var(--font-base); }
    .cross { stroke: var(--color-text-muted); stroke-width: 1; stroke-dasharray: 3 3; }
    .band { fill: var(--color-bg-light); }
    .line { fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
    .area { opacity: 0.1; }
    .dot { stroke: var(--color-white); stroke-width: 2; }
    .viz-tip.side { transform: translateX(14px); }
    .viz-tip.side.flip { transform: translateX(calc(-100% - 14px)); }
    .reveal { animation: reveal 1.4s cubic-bezier(0.16, 1, 0.3, 1) backwards; }
    .col { transform-box: fill-box; transform-origin: bottom; animation: grow 0.8s cubic-bezier(0.22, 1.2, 0.36, 1) backwards; animation-delay: calc(var(--i) * 18ms); }
    @keyframes reveal { from { clip-path: inset(-20px 100% -20px -20px); } to { clip-path: inset(-20px -20px -20px -20px); } }
    @keyframes grow { from { transform: scaleY(0); } }
    @media (prefers-reduced-motion: reduce) { .reveal, .col { animation: none; } }
  `],
})
export class TimeChartComponent implements OnDestroy {
  labels = input<string[]>([]);
  series = input<VizSeries[]>([]);
  type = input<'line' | 'columns'>('line');
  format = input<VizFormat>('int');
  height = input(240);
  area = input(true);
  ariaLabel = input('Gráfico');

  readonly pad = PAD;
  hover = signal(-1);
  private cleanup: (() => void)[] = [];
  w = hostWidth(inject(ElementRef), (fn) => this.cleanup.push(fn));

  geo = computed(() => {
    const w = this.w(), h = this.height(), n = this.labels().length, series = this.series();
    const plotW = Math.max(10, w - PAD.l - PAD.r);
    const base = h - PAD.b;
    const plotH = base - PAD.t;
    const all = series.flatMap((s) => s.data);
    const scale = niceScale(Math.max(0, ...all), this.format() !== 'min');
    const y = (v: number) => base - (v / scale.max) * plotH;
    const isCol = this.type() === 'columns';
    const band = n ? plotW / n : plotW;
    const xs = Array.from({ length: n }, (_, i) =>
      isCol ? PAD.l + band * (i + 0.5) : PAD.l + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2));

    const ticks = [0, 1, 2, 3, 4].map((k) => {
      const v = scale.step * k;
      return { v, y: y(v), label: formatValue(v, this.format(), true) };
    });
    const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 70))));
    const xLabels = xs
      .map((x, i) => ({ i, x, label: bucketLabel(this.labels()[i]) }))
      .filter((l) => (n - 1 - l.i) % every === 0);

    const lines = series.map((s) => {
      const ys = s.data.map(y);
      const d = ys.map((yy, i) => `${i ? 'L' : 'M'}${xs[i].toFixed(1)},${yy.toFixed(1)}`).join('');
      const areaD = n ? `${d}L${xs[n - 1].toFixed(1)},${base}L${xs[0].toFixed(1)},${base}Z` : '';
      return { name: s.name, color: s.color, ys, d, area: areaD };
    });

    const cols: { d: string; color: string; i: number }[] = [];
    if (isCol && series.length) {
      const k = series.length;
      const gap = 2;
      const bw = Math.max(2, Math.min(26, (band * 0.72 - gap * (k - 1)) / k));
      const groupW = bw * k + gap * (k - 1);
      xs.forEach((cx, i) => series.forEach((s, j) => {
        const v = s.data[i] ?? 0;
        if (v <= 0) return;
        const x = cx - groupW / 2 + j * (bw + gap);
        cols.push({ d: roundedTop(x, y(v), bw, base - y(v)), color: s.color, i });
      }));
    }
    return { xs, base, band, ticks, xLabels, lines, cols };
  });

  /** El tooltip va a la derecha del cursor, o a la izquierda en la mitad derecha. */
  tipFlip = computed(() => (this.geo().xs[this.hover()] ?? 0) > this.w() / 2);

  fmt(v: number) { return formatValue(v, this.format()); }
  fullLabel(k: string) { return k ? bucketLabel(k, true) : ''; }

  onMove(e: PointerEvent) {
    const xs = this.geo().xs;
    if (!xs.length) return;
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    xs.forEach((x, i) => { if (Math.abs(x - px) < Math.abs(xs[best] - px)) best = i; });
    this.hover.set(best);
  }

  onKey(e: KeyboardEvent) {
    const n = this.labels().length;
    if (!n) return;
    if (e.key === 'ArrowRight') this.hover.set(Math.min(n - 1, this.hover() + 1));
    else if (e.key === 'ArrowLeft') this.hover.set(Math.max(0, (this.hover() < 0 ? n : this.hover()) - 1));
    else if (e.key === 'Escape') this.hover.set(-1);
    else return;
    e.preventDefault();
  }

  ngOnDestroy() { this.cleanup.forEach((fn) => fn()); }
}

/** Columna con las esquinas de arriba redondeadas (4px) y base recta. */
function roundedTop(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

// ── Barras horizontales ───────────────────────────────────────────────────

@Component({
  selector: 'app-bar-list',
  standalone: true,
  template: `
    @for (it of rows(); track it.label; let i = $index) {
      <div class="row" [title]="it.label + ': ' + fmt(it.value)">
        <div class="head">
          <span class="label">{{ it.label }}</span>
          <span class="val">{{ fmt(it.value) }}@if (it.sub) { <small>{{ it.sub }}</small> }</span>
        </div>
        <div class="track"><div class="fill" [style.width.%]="it.pct" [style.background]="color()" [style.--i]="i"></div></div>
      </div>
    } @empty {
      <p class="empty">{{ empty() }}</p>
    }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; gap: 14px; }
    .row { padding: 2px 0; }
    .head { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; margin-bottom: 6px; }
    .label { color: var(--color-text-main); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .val { color: var(--color-text-main); font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .val small { color: var(--color-text-muted); font-weight: 500; margin-left: 6px; }
    .track { height: 8px; border-radius: var(--radius-pill); background: var(--chart-empty); overflow: hidden; }
    .fill { height: 100%; border-radius: var(--radius-pill); transform-origin: left; min-width: 4px;
      animation: grow 0.9s cubic-bezier(0.16, 1, 0.3, 1) backwards; animation-delay: calc(var(--i) * 70ms + 0.1s);
      transition: width var(--transition-smooth); }
    .row:hover .fill { filter: brightness(0.9); }
    .empty { color: var(--color-text-muted); font-size: 13px; margin: 0; }
    @keyframes grow { from { transform: scaleX(0); } }
    @media (prefers-reduced-motion: reduce) { .fill { animation: none; transition: none; } }
  `],
})
export class BarListComponent {
  items = input<VizItem[]>([]);
  color = input('var(--chart-1)');
  format = input<VizFormat>('int');
  empty = input('Sin datos en este periodo');

  rows = computed(() => {
    const max = Math.max(1, ...this.items().map((i) => i.value));
    return this.items().map((i) => ({ ...i, pct: (i.value / max) * 100 }));
  });

  fmt(v: number) { return formatValue(v, this.format()); }
}

// ── Embudo ────────────────────────────────────────────────────────────────

/** Rampa ordinal azul: el paso más claro aún contrasta 2:1 con el fondo. */
const ORDINAL = ['--seq-250', '--seq-350', '--seq-450', '--seq-550', '--seq-650'];

@Component({
  selector: 'app-funnel',
  standalone: true,
  template: `
    @for (s of rows(); track s.label; let i = $index; let last = $last) {
      <div class="step" [title]="s.label + ': ' + s.count">
        <span class="label">{{ s.label }}</span>
        <div class="bar-wrap">
          <div class="bar" [style.width.%]="s.pct" [style.background]="s.color" [style.--i]="i"></div>
        </div>
        <span class="val">{{ s.count }}@if (s.value !== undefined) { <small>{{ money(s.value) }}</small> }</span>
      </div>
      @if (!last && showRates()) {
        <div class="rate"><span>{{ s.next === null ? '—' : s.next + '%' }} pasa a la siguiente etapa</span></div>
      }
    }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; gap: 4px; }
    .step { display: grid; grid-template-columns: minmax(80px, 30%) 1fr auto; align-items: center; gap: 12px; }
    .label { font-size: 13px; font-weight: 500; color: var(--color-text-main); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .bar-wrap { display: flex; justify-content: center; height: 30px; background: var(--color-bg-light); border-radius: 10px; }
    .bar { height: 100%; border-radius: 10px; min-width: 6px; transform-origin: center;
      animation: grow 0.9s cubic-bezier(0.22, 1.2, 0.36, 1) backwards; animation-delay: calc(var(--i) * 90ms + 0.1s);
      transition: width var(--transition-smooth); }
    .val { font-weight: 600; font-size: 14px; min-width: 44px; text-align: right; font-variant-numeric: tabular-nums; }
    .val small { display: block; font-size: 11px; font-weight: 500; color: var(--color-text-muted); }
    .rate { font-size: 11px; color: var(--color-text-muted); padding-left: calc(30% + 12px); }
    @keyframes grow { from { transform: scaleX(0); opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .bar { animation: none; transition: none; } }
    @media (max-width: 480px) { .step { grid-template-columns: 90px 1fr auto; } .rate { padding-left: 102px; } }
  `],
})
export class FunnelComponent {
  steps = input<{ label: string; count: number; value?: number }[]>([]);
  showRates = input(true);

  rows = computed(() => {
    const s = this.steps();
    const max = Math.max(1, ...s.map((x) => x.count));
    return s.map((x, i) => ({
      ...x,
      pct: (x.count / max) * 100,
      color: `var(${ORDINAL[Math.round((i / Math.max(1, s.length - 1)) * (ORDINAL.length - 1))]})`,
      next: i < s.length - 1 && x.count ? Math.round((s[i + 1].count / x.count) * 100) : null,
    }));
  });

  money(v: number) { return formatValue(v, 'money', true); }
}

// ── Mapa de calor semana × hora ───────────────────────────────────────────

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DAYS_LONG = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const HEAT = ['--chart-empty', '--seq-150', '--seq-250', '--seq-350', '--seq-450', '--seq-550', '--seq-650'];

@Component({
  selector: 'app-heatmap',
  standalone: true,
  template: `
    <div class="grid" (pointerleave)="tip.set(null)">
      <span></span>
      @for (h of hours; track h) { <span class="hour">{{ h % 3 === 0 ? h : '' }}</span> }
      @for (row of cells(); track $index; let d = $index) {
        <span class="day">{{ days[d] }}</span>
        @for (c of row; track $index; let h = $index) {
          <span class="cell" [style.background]="c.color" [style.--c]="h + d"
                (pointerenter)="show($event, d, h, c.v)"></span>
        }
      }
    </div>
    <div class="legend">
      <span>Menos</span>
      @for (c of heat; track c) { <i [style.background]="'var(' + c + ')'"></i> }
      <span>Más</span>
    </div>
    @if (tip(); as t) {
      <div class="viz-tip" [style.left.px]="t.x" [style.top.px]="t.y">
        <div class="viz-tip-title">{{ t.title }}</div>
        <div class="viz-tip-row">Mensajes recibidos <b>{{ t.v }}</b></div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; position: relative; }
    .grid { display: grid; grid-template-columns: 34px repeat(24, minmax(0, 1fr)); gap: 3px; }
    .hour { font-size: 10px; color: var(--color-text-muted); text-align: left; }
    .day { font-size: 11px; color: var(--color-text-muted); align-self: center; }
    .cell { aspect-ratio: 1; border-radius: 4px; min-height: 8px; transition: transform var(--transition-fast);
      animation: pop 0.5s cubic-bezier(0.22, 1.2, 0.36, 1) backwards; animation-delay: calc(var(--c) * 14ms); }
    .cell:hover { transform: scale(1.35); box-shadow: 0 0 0 2px var(--color-white); position: relative; z-index: 1; }
    .legend { display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-top: 12px; font-size: 11px; color: var(--color-text-muted); }
    .legend span { margin: 0 4px; }
    .legend i { width: 14px; height: 14px; border-radius: 4px; }
    @keyframes pop { from { transform: scale(0); opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .cell { animation: none; transition: none; } }
  `],
})
export class HeatmapComponent {
  data = input<number[][]>([]);
  readonly hours = Array.from({ length: 24 }, (_, i) => i);
  readonly days = DAYS;
  readonly heat = HEAT;
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  tip = signal<{ x: number; y: number; title: string; v: number } | null>(null);

  cells = computed(() => {
    const d = this.data();
    const max = Math.max(1, ...d.flat());
    return d.map((row) => row.map((v) => {
      const level = v <= 0 ? 0 : 1 + Math.min(5, Math.floor((v / max) * 6));
      return { v, color: `var(${HEAT[level]})` };
    }));
  });

  show(e: PointerEvent, d: number, h: number, v: number) {
    const host = this.host.nativeElement.getBoundingClientRect();
    const cell = (e.target as HTMLElement).getBoundingClientRect();
    const x = Math.min(Math.max(cell.left - host.left + cell.width / 2, 80), host.width - 80);
    const hh = String(h).padStart(2, '0');
    this.tip.set({ x, y: cell.top - host.top, title: `${DAYS_LONG[d]} ${hh}:00–${hh}:59`, v });
  }
}

// ── Anillo de progreso (un solo porcentaje) ──────────────────────────────

@Component({
  selector: 'app-ring',
  standalone: true,
  imports: [CountUpComponent],
  template: `
    <svg viewBox="0 0 100 100" role="img" [attr.aria-label]="label() + ': ' + (value() ?? 0) + '%'">
      <circle class="track" cx="50" cy="50" r="42" />
      @for (v of [value()]; track v) {
        <circle class="arc" cx="50" cy="50" r="42" pathLength="100" [attr.stroke]="color()"
                [style.stroke-dashoffset]="100 - clamp(v)" />
      }
    </svg>
    <div class="center">
      <strong><app-count-up [value]="value()" format="pct" /></strong>
      <span>{{ label() }}</span>
    </div>
  `,
  styles: [`
    :host { position: relative; display: block; width: 132px; height: 132px; flex-shrink: 0; }
    svg { width: 100%; height: 100%; transform: rotate(-90deg); }
    circle { fill: none; stroke-width: 9; }
    .track { stroke: var(--chart-empty); }
    .arc { stroke-linecap: round; stroke-dasharray: 100; animation: ring 1.3s cubic-bezier(0.16, 1, 0.3, 1) 0.2s backwards; }
    .center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
    strong { font-family: var(--font-heading); font-size: 26px; color: var(--color-text-main); line-height: 1.1; }
    span { font-size: 11px; color: var(--color-text-muted); max-width: 90px; }
    @keyframes ring { from { stroke-dashoffset: 100; } }
    @media (prefers-reduced-motion: reduce) { .arc { animation: none; } }
  `],
})
export class RingComponent {
  value = input<number | null>(0);
  label = input('');
  color = input('var(--chart-1)');
  clamp(v: number | null) { return Math.max(0, Math.min(100, v ?? 0)); }
}

// ── Tarjeta de gráfico con vista de tabla ────────────────────────────────

@Component({
  selector: 'app-chart-card',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <header>
      <div class="titles">
        <h3>{{ heading() }}</h3>
        @if (subtitle()) { <p>{{ subtitle() }}</p> }
      </div>
      <div class="actions">
        <ng-content select="[card-actions]" />
        @if (table()) {
          <button type="button" class="toggle" (click)="showTable.set(!showTable())"
                  [attr.aria-pressed]="showTable()" [title]="showTable() ? 'Ver gráfico' : 'Ver como tabla'">
            <lucide-icon [img]="showTable() ? ChartColumn : Table2" [size]="16" [strokeWidth]="2.2" />
          </button>
        }
      </div>
    </header>
    <div [hidden]="showTable()" class="body"><ng-content /></div>
    @if (showTable() && table(); as t) {
      <div class="table-wrap">
        <table>
          <thead><tr>@for (h of t.head; track $index) { <th>{{ h }}</th> }</tr></thead>
          <tbody>
            @for (r of t.rows; track $index) {
              <tr>@for (c of r; track $index) { <td>{{ c }}</td> }</tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: [`
    :host { display: flex; flex-direction: column; background: var(--color-white); border-radius: var(--radius-lg);
      padding: 24px; box-shadow: var(--shadow-sm); min-width: 0; box-sizing: border-box;
      animation: fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) backwards; animation-delay: calc(var(--i, 0) * 60ms);
      transition: box-shadow var(--transition-smooth); }
    :host(:hover) { box-shadow: var(--shadow-md); }
    header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 20px; }
    h3 { margin: 0; font-family: var(--font-heading); font-size: 16px; font-weight: 600; color: var(--color-text-main); }
    p { margin: 4px 0 0; font-size: 13px; color: var(--color-text-muted); }
    .actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .toggle { width: 34px; height: 34px; border-radius: var(--radius-pill); border: 1px solid var(--color-border);
      background: var(--color-white); color: var(--color-text-muted); display: inline-flex; align-items: center;
      justify-content: center; cursor: pointer; transition: all var(--transition-fast); }
    .toggle:hover, .toggle[aria-pressed='true'] { color: var(--color-text-main); border-color: var(--color-text-muted); }
    .body { flex: 1; min-width: 0; }
    .table-wrap { max-height: 320px; overflow: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; font-weight: 600; color: var(--color-text-muted); padding: 8px 10px; border-bottom: 1px solid var(--color-border); position: sticky; top: 0; background: var(--color-white); }
    td { padding: 8px 10px; border-bottom: 1px solid var(--chart-grid); font-variant-numeric: tabular-nums; }
    @media (prefers-reduced-motion: reduce) { :host { animation: none; } }
    @media (max-width: 768px) { :host { padding: 20px; } }
  `],
})
export class ChartCardComponent {
  heading = input('');
  subtitle = input('');
  table = input<VizTable | null>(null);
  showTable = signal(false);
  readonly Table2 = Table2;
  readonly ChartColumn = ChartColumn;
}
