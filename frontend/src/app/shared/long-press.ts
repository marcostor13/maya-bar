import { Directive, OnDestroy, output } from '@angular/core';

/**
 * Pulsación larga táctil (HU38): ~450 ms sin mover el dedo.
 * Desplazar la lista (moverse más de 10 px) la cancela; con ratón no se dispara.
 */
@Directive({
  selector: '[appLongPress]',
  standalone: true,
  host: {
    '(pointerdown)': 'onDown($event)',
    '(pointermove)': 'onMove($event)',
    '(pointerup)': 'cancel()',
    '(pointercancel)': 'cancel()',
    '(contextmenu)': 'onContextMenu($event)',
  },
})
export class LongPressDirective implements OnDestroy {
  readonly appLongPress = output<void>();
  static readonly DELAY = 450;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private start: { x: number; y: number } | null = null;
  private fired = false;

  onDown(e: PointerEvent) {
    if (e.pointerType === 'mouse') return;
    this.cancel();
    this.fired = false;
    this.start = { x: e.clientX, y: e.clientY };
    this.timer = setTimeout(() => {
      this.timer = null;
      this.fired = true;
      navigator.vibrate?.(30);
      this.appLongPress.emit();
    }, LongPressDirective.DELAY);
  }

  onMove(e: PointerEvent) {
    if (!this.start || !this.timer) return;
    if (Math.hypot(e.clientX - this.start.x, e.clientY - this.start.y) > 10) this.cancel();
  }

  /** El menú del sistema (copiar/seleccionar) no aparece encima del nuestro. */
  onContextMenu(e: Event) {
    if (this.timer || this.fired) e.preventDefault();
  }

  cancel() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.start = null;
  }

  ngOnDestroy() {
    this.cancel();
  }
}
