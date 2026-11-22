import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LongPressDirective } from './long-press';
import { TimeChartComponent } from './charts';

@Component({
  standalone: true,
  imports: [LongPressDirective],
  template: `<div class="target" (appLongPress)="count.set(count() + 1)">hola</div>`,
})
class HostComponent { count = signal(0); }

const ptr = (type: string, x = 10, y = 10, pointerType = 'touch') => {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.assign(e, { pointerId: 1, pointerType });
  return e;
};

describe('LongPressDirective (HU38)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = () => {
    const f = TestBed.createComponent(HostComponent);
    f.detectChanges();
    return { f, el: f.nativeElement.querySelector('.target') as HTMLElement };
  };

  it('C1: mantener 450 ms con el dedo dispara la acción', () => {
    const { f, el } = setup();
    el.dispatchEvent(ptr('pointerdown'));
    vi.advanceTimersByTime(460);
    expect(f.componentInstance.count()).toBe(1);
  });

  it('C1: desplazar la lista la cancela', () => {
    const { f, el } = setup();
    el.dispatchEvent(ptr('pointerdown', 10, 10));
    el.dispatchEvent(ptr('pointermove', 10, 40));
    vi.advanceTimersByTime(600);
    expect(f.componentInstance.count()).toBe(0);
  });

  it('soltar antes de tiempo o usar ratón no la dispara', () => {
    const { f, el } = setup();
    el.dispatchEvent(ptr('pointerdown'));
    vi.advanceTimersByTime(200);
    el.dispatchEvent(ptr('pointerup'));
    el.dispatchEvent(ptr('pointerdown', 10, 10, 'mouse'));
    vi.advanceTimersByTime(600);
    expect(f.componentInstance.count()).toBe(0);
  });
});

describe('TimeChartComponent: toque (HU38)', () => {
  it('C3: tocar fija el tooltip y tocar fuera lo cierra', () => {
    const f = TestBed.createComponent(TimeChartComponent);
    f.componentRef.setInput('labels', ['2026-01-01', '2026-01-02']);
    f.componentRef.setInput('series', [{ name: 'A', color: '#000', data: [1, 2] }]);
    const c = f.componentInstance;
    c.w.set(300);
    f.detectChanges();
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 300, height: 240 } as DOMRect);
    const down = ptr('pointerdown', c.geo().xs[1] ?? 250, 50);
    Object.defineProperty(down, 'currentTarget', { value: svg });
    c.onMove(down as unknown as PointerEvent);
    expect(c.hover()).toBe(1);
    c.onLeave(ptr('pointerleave') as unknown as PointerEvent);
    expect(c.hover()).toBe(1);
    document.body.dispatchEvent(ptr('pointerdown'));
    expect(c.hover()).toBe(-1);
    f.destroy();
  });
});
