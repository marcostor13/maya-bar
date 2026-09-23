import { TestBed } from '@angular/core/testing';
import {
  BarListComponent, FunnelComponent, TimeChartComponent, bucketLabel, formatMinutes, formatValue, niceScale,
} from './charts';

describe('charts helpers', () => {
  it('niceScale redondea el eje a 4 divisiones', () => {
    expect(niceScale(0)).toEqual({ max: 4, step: 1 });
    expect(niceScale(77)).toEqual({ max: 80, step: 20 });
    expect(niceScale(3)).toEqual({ max: 4, step: 1 });
    expect(niceScale(9000)).toEqual({ max: 10000, step: 2500 });
  });

  it('formatMinutes elige la unidad', () => {
    expect(formatMinutes(null)).toBe('—');
    expect(formatMinutes(0.3)).toBe('18 s');
    expect(formatMinutes(1.44)).toBe('1.4 min');
    expect(formatMinutes(90)).toBe('1 h 30 min');
    expect(formatMinutes(2880)).toBe('2 d');
  });

  it('formatValue formatea dinero, porcentaje y compactos', () => {
    expect(formatValue(1500, 'money')).toMatch(/^S\/ 1,500$/);
    expect(formatValue(62, 'pct')).toBe('62%');
    expect(formatValue(12500, 'int', true)).toMatch(/12[.,]5/);
  });

  it('bucketLabel entiende días y meses', () => {
    expect(bucketLabel('2026-09-23')).toMatch(/23/);
    expect(bucketLabel('2026-09')).toMatch(/26/);
  });
});

describe('chart components', () => {
  it('bar-list escala al máximo y muestra vacío', () => {
    const f = TestBed.createComponent(BarListComponent);
    f.componentRef.setInput('items', [{ label: 'A', value: 10 }, { label: 'B', value: 5 }]);
    f.detectChanges();
    expect(f.componentInstance.rows().map((r) => r.pct)).toEqual([100, 50]);
    f.componentRef.setInput('items', []);
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Sin datos');
  });

  it('funnel calcula el paso entre etapas', () => {
    const f = TestBed.createComponent(FunnelComponent);
    f.componentRef.setInput('steps', [{ label: 'A', count: 10 }, { label: 'B', count: 4 }, { label: 'C', count: 0 }]);
    f.detectChanges();
    expect(f.componentInstance.rows().map((r) => r.next)).toEqual([40, 0, null]);
  });

  it('time-chart arma líneas y columnas y mueve el foco con el teclado', () => {
    const f = TestBed.createComponent(TimeChartComponent);
    const c = f.componentInstance;
    f.componentRef.setInput('labels', ['2026-09-21', '2026-09-22', '2026-09-23']);
    f.componentRef.setInput('series', [{ name: 'A', color: 'red', data: [1, 3, 2] }, { name: 'B', color: 'blue', data: [0, 1, 4] }]);
    c.w.set(400);
    f.detectChanges();
    expect(c.geo().lines).toHaveLength(2);
    expect(c.geo().xs).toHaveLength(3);
    c.onKey(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(c.hover()).toBe(2);
    f.componentRef.setInput('type', 'columns');
    f.detectChanges();
    // Los ceros no dibujan columna.
    expect(c.geo().cols).toHaveLength(5);
  });
});
