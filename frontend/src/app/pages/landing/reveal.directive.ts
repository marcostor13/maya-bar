import {
  Directive,
  ElementRef,
  OnDestroy,
  afterNextRender,
  inject,
  input,
} from '@angular/core';

/**
 * Aparición al hacer scroll.
 *
 * El elemento se pinta visible por defecto y solo se oculta cuando este código
 * corre en el navegador. Es deliberado: la landing se prerenderiza, y si el
 * estado inicial fuese `opacity: 0` el buscador —y quien navegue sin
 * JavaScript— recibiría una página en blanco.
 *
 * `afterNextRender` no se ejecuta en el servidor, así que sirve de guarda: en
 * el prerenderizado no se añade ninguna clase.
 */
@Directive({
  selector: '[appReveal]',
  standalone: true,
  host: { class: 'reveal' },
})
export class RevealDirective implements OnDestroy {
  /** Retardo en milisegundos, para escalonar los elementos de una rejilla. */
  readonly appReveal = input<number | ''>('');

  private el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private observer?: IntersectionObserver;

  constructor() {
    afterNextRender(() => {
      // Sin soporte de IntersectionObserver o con animaciones reducidas, el
      // elemento se queda como está: visible.
      if (typeof IntersectionObserver === 'undefined') return;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      const delay = this.appReveal();
      if (typeof delay === 'number' && delay > 0) {
        this.el.style.transitionDelay = `${delay}ms`;
      }

      this.el.classList.add('reveal-armed');

      this.observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            this.el.classList.add('reveal-in');
            // Una sola vez: reaparecer al volver a subir distrae más que suma.
            this.observer?.unobserve(entry.target);
          }
        },
        { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
      );

      this.observer.observe(this.el);
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
