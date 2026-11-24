import { TestBed } from '@angular/core/testing';
import { ScoreBadgeComponent } from './score-badge';

describe('Insignia de puntaje (HU70)', () => {
  function render(score: number | undefined, heat?: 'hot' | 'warm' | 'cold', reason?: string) {
    const f = TestBed.createComponent(ScoreBadgeComponent);
    f.componentRef.setInput('score', score);
    if (heat) f.componentRef.setInput('heatLabel', heat);
    if (reason) f.componentRef.setInput('reason', reason);
    f.detectChanges();
    return f.nativeElement as HTMLElement;
  }

  it('muestra temperatura, puntaje y el motivo como ayuda', () => {
    const el = render(82, 'hot', 'Pide precio y lo necesita esta semana');
    const s = el.querySelector('.score')!;
    expect(s.textContent).toContain('Caliente 82');
    expect(s.getAttribute('title')).toBe('Pide precio y lo necesita esta semana');
    expect(s.getAttribute('data-heat')).toBe('hot');
  });

  it('deduce la temperatura del número y no pinta nada sin puntaje', () => {
    expect(render(45).textContent).toContain('Tibio 45');
    expect(render(10).textContent).toContain('Frío 10');
    expect(render(undefined).querySelector('.score')).toBeNull();
  });
});
