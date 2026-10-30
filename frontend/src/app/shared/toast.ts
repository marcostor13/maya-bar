import { Component, inject, Injectable, signal } from '@angular/core';
import { CircleAlert, CircleCheck, Info, LucideAngularModule, TriangleAlert, X } from 'lucide-angular';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  duration: number;
}

/** Avisos a la vista a la vez; el más antiguo sale cuando llega otro. */
const MAX_VISIBLE = 3;
const EXIT_MS = 350;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _toasts = signal<Toast[]>([]);
  private _closing = signal<Set<string>>(new Set());
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  toasts = this._toasts.asReadonly();
  closing = this._closing.asReadonly();

  /**
   * `message` admite lo que devuelve el backend tal cual (`err.error?.message`):
   * los errores de validación de Nest llegan como lista de frases.
   */
  show(message: unknown, type: Toast['type'] = 'info', duration = 4000, title?: string): string {
    const text = normalize(message, type);

    // El mismo aviso repetido (doble toque, reintentos) no se apila: se
    // reinicia el tiempo del que ya está a la vista.
    const same = this._toasts().find(
      t => t.type === type && t.message === text && t.title === title && !this._closing().has(t.id),
    );
    if (same) {
      this.schedule(same.id, duration);
      return same.id;
    }

    const id = crypto.randomUUID();
    this._toasts.update(list => [...list, { id, type, title, message: text, duration }]);
    this.schedule(id, duration);

    const open = this._toasts().filter(t => !this._closing().has(t.id));
    open.slice(0, Math.max(0, open.length - MAX_VISIBLE)).forEach(t => this.dismiss(t.id));
    return id;
  }

  success(message: unknown, title?: string) { return this.show(message, 'success', 4000, title); }
  error(message: unknown, title?: string)   { return this.show(message, 'error', 5000, title); }
  warning(message: unknown, title?: string) { return this.show(message, 'warning', 4500, title); }
  info(message: unknown, title?: string)    { return this.show(message, 'info', 4000, title); }

  dismiss(id: string) {
    if (this._closing().has(id) || !this._toasts().some(t => t.id === id)) return;
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this._closing.update(set => { const s = new Set(set); s.add(id); return s; });
    setTimeout(() => {
      this._toasts.update(list => list.filter(t => t.id !== id));
      this._closing.update(set => { const s = new Set(set); s.delete(id); return s; });
    }, EXIT_MS);
  }

  private schedule(id: string, duration: number) {
    clearTimeout(this.timers.get(id));
    this.timers.set(id, setTimeout(() => this.dismiss(id), duration));
  }
}

function normalize(message: unknown, type: Toast['type']): string {
  const fallback = type === 'error' ? 'Ocurrió un error. Inténtalo de nuevo.' : '';
  if (Array.isArray(message)) {
    const parts = message.filter(m => typeof m === 'string' && m.trim()).map(m => (m as string).trim());
    return parts.length ? [...new Set(parts)].join('. ') : fallback;
  }
  if (typeof message !== 'string') return fallback;
  const text = message.trim();
  // Respuestas HTML de un proxy caído o mensajes técnicos de HttpClient no le
  // dicen nada a quien usa la app.
  if (!text || text.startsWith('<') || text.startsWith('Http failure')) return fallback || text;
  return text;
}

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    <div class="toast-container">
      @for (toast of service.toasts(); track toast.id) {
        <div
          class="toast"
          [class.toast-out]="service.closing().has(toast.id)"
          [attr.data-type]="toast.type"
          [attr.role]="toast.type === 'error' ? 'alert' : 'status'"
          [attr.aria-live]="toast.type === 'error' ? 'assertive' : 'polite'"
          (pointerdown)="dragStart($event)"
          (pointermove)="dragMove($event)"
          (pointerup)="dragEnd($event, toast.id)"
          (pointercancel)="dragCancel()"
        >
          <div class="toast-icon" [attr.data-type]="toast.type">
            <lucide-icon [img]="icons[toast.type]" [size]="16" [strokeWidth]="2.4" />
          </div>
          <div class="toast-body">
            @if (toast.title) {
              <div class="toast-title">{{ toast.title }}</div>
            }
            <div class="toast-message">{{ toast.message }}</div>
          </div>
          <button class="toast-close" (click)="service.dismiss(toast.id)" aria-label="Cerrar">
            <lucide-icon [img]="X" [size]="14" [strokeWidth]="2.4" />
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      bottom: calc(24px + var(--safe-bottom) + var(--bottom-nav-height));
      right: calc(24px + var(--safe-right));
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    }

    .toast {
      --toast-accent: var(--color-info);
      display: flex;
      align-items: flex-start;
      gap: 12px;
      width: 380px;
      background: var(--color-white);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-sm);
      padding: 14px 14px 14px 16px;
      box-shadow: var(--shadow-lg), 0 2px 8px rgba(15, 23, 42, 0.06);
      pointer-events: all;
      position: relative;
      overflow: hidden;
      touch-action: pan-y;
      user-select: none;
      animation: toastInSide 320ms cubic-bezier(0.16, 1, 0.3, 1) backwards;
      transition: transform 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 220ms;
    }

    /* Franja de color a la izquierda: identifica el tipo de un vistazo. */
    .toast::before {
      content: '';
      position: absolute;
      inset: 0 auto 0 0;
      width: 4px;
      background: var(--toast-accent);
    }

    .toast[data-type="success"] { --toast-accent: var(--color-success); }
    .toast[data-type="error"]   { --toast-accent: var(--color-error); }
    .toast[data-type="warning"] { --toast-accent: var(--color-warning); }

    .toast.toast-out {
      animation: toastOutSide 300ms cubic-bezier(0.4, 0, 1, 1) forwards;
    }

    .toast.dragging { transition: none; }

    .toast-icon {
      width: 28px;
      height: 28px;
      min-width: 28px;
      border-radius: var(--radius-pill);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--toast-accent);
      background: color-mix(in srgb, var(--toast-accent) 14%, transparent);
    }

    .toast-body {
      flex: 1;
      min-width: 0;
      padding-top: 4px;
    }

    .toast-title {
      font-family: var(--font-base);
      font-size: 14px;
      font-weight: 600;
      color: var(--color-text-main);
      margin-bottom: 2px;
      line-height: 1.3;
    }

    .toast-message {
      font-family: var(--font-base);
      font-size: 13px;
      color: var(--color-text-main);
      line-height: 1.45;
      overflow-wrap: anywhere;
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .toast-close {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--color-text-muted);
      width: 28px;
      height: 28px;
      min-width: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-pill);
      transition: color var(--transition-fast), background var(--transition-fast);
    }

    .toast-close:hover {
      color: var(--color-text-main);
      background: var(--color-bg-light);
    }

    /* Móvil y tablet: arriba, bajo la barra de estado. Abajo tapaban el campo
       de escribir del chat y los botones de guardar de las hojas inferiores. */
    @media (max-width: 968px) {
      .toast-container {
        top: calc(8px + var(--safe-top));
        bottom: auto;
        left: calc(12px + var(--safe-left));
        right: calc(12px + var(--safe-right));
        align-items: center;
        gap: 8px;
      }

      .toast {
        width: 100%;
        max-width: 480px;
        border-radius: var(--radius-md);
        box-shadow: 0 12px 32px -8px rgba(15, 23, 42, 0.22), 0 2px 6px rgba(15, 23, 42, 0.06);
        animation-name: toastInTop;
      }

      .toast.toast-out { animation-name: toastOutTop; }
    }

    @keyframes toastInSide {
      from { opacity: 0; transform: translateX(110%); }
      to   { opacity: 1; transform: translateX(0); }
    }

    @keyframes toastOutSide {
      from { opacity: 1; transform: translateX(var(--drag-x, 0)); }
      to   { opacity: 0; transform: translateX(110%); }
    }

    @keyframes toastInTop {
      from { opacity: 0; transform: translateY(-120%) scale(0.96); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes toastOutTop {
      from { opacity: 1; transform: translate(var(--drag-x, 0), var(--drag-y, 0)); }
      to   { opacity: 0; transform: translate(var(--drag-x, 0), -120%); }
    }

    @media (prefers-reduced-motion: reduce) {
      .toast, .toast.toast-out { animation-duration: 1ms; }
    }
  `]
})
export class ToastComponent {
  service = inject(ToastService);

  readonly X = X;
  readonly icons: Record<Toast['type'], typeof X> = {
    success: CircleCheck,
    error: CircleAlert,
    warning: TriangleAlert,
    info: Info,
  };

  /** Deslizar hacia arriba o a un lado lo cierra, como una notificación del sistema. */
  private drag: { x: number; y: number; el: HTMLElement } | null = null;

  dragStart(e: PointerEvent) {
    if (e.pointerType === 'mouse' || (e.target as HTMLElement).closest('.toast-close')) return;
    this.drag = { x: e.clientX, y: e.clientY, el: e.currentTarget as HTMLElement };
  }

  dragMove(e: PointerEvent) {
    if (!this.drag) return;
    const dx = e.clientX - this.drag.x;
    const dy = Math.min(0, e.clientY - this.drag.y);
    this.drag.el.classList.add('dragging');
    this.drag.el.style.transform = `translate(${dx}px, ${dy}px)`;
    this.drag.el.style.opacity = String(Math.max(0.3, 1 - (Math.abs(dx) + Math.abs(dy)) / 240));
  }

  dragEnd(e: PointerEvent, id: string) {
    if (!this.drag) return;
    const { el } = this.drag;
    const dx = e.clientX - this.drag.x;
    const dy = e.clientY - this.drag.y;
    this.drag = null;
    el.classList.remove('dragging');
    if (dy < -30 || Math.abs(dx) > 80) {
      // La salida arranca desde donde quedó el dedo, sin saltos.
      el.style.setProperty('--drag-x', `${dx}px`);
      el.style.setProperty('--drag-y', `${Math.min(0, dy)}px`);
      el.style.transform = '';
      el.style.opacity = '';
      this.service.dismiss(id);
      return;
    }
    el.style.transform = '';
    el.style.opacity = '';
  }

  dragCancel() {
    if (!this.drag) return;
    this.drag.el.classList.remove('dragging');
    this.drag.el.style.transform = '';
    this.drag.el.style.opacity = '';
    this.drag = null;
  }
}
