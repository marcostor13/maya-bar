import { Component, inject, Injectable, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title?: string;
  message: string;
  duration: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _toasts = signal<Toast[]>([]);
  private _closing = signal<Set<string>>(new Set());

  toasts = this._toasts.asReadonly();
  closing = this._closing.asReadonly();

  show(message: string, type: Toast['type'] = 'info', duration = 4000, title?: string): string {
    const id = crypto.randomUUID();
    this._toasts.update(list => [...list, { id, type, title, message, duration }]);
    setTimeout(() => this.dismiss(id), duration);
    return id;
  }

  success(message: string, title?: string) { return this.show(message, 'success', 4000, title); }
  error(message: string, title?: string)   { return this.show(message, 'error', 5000, title); }
  warning(message: string, title?: string) { return this.show(message, 'warning', 4500, title); }
  info(message: string, title?: string)    { return this.show(message, 'info', 4000, title); }

  dismiss(id: string) {
    this._closing.update(set => { const s = new Set(set); s.add(id); return s; });
    setTimeout(() => {
      this._toasts.update(list => list.filter(t => t.id !== id));
      this._closing.update(set => { const s = new Set(set); s.delete(id); return s; });
    }, 350);
  }
}

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container">
      @for (toast of service.toasts(); track toast.id) {
        <div
          class="toast"
          [class.toast-out]="service.closing().has(toast.id)"
          [attr.data-type]="toast.type"
        >
          <div class="toast-icon" [attr.data-type]="toast.type">
            @switch (toast.type) {
              @case ('success') { <span>✓</span> }
              @case ('error')   { <span>✕</span> }
              @case ('warning') { <span>!</span> }
              @default          { <span>i</span> }
            }
          </div>
          <div class="toast-body">
            @if (toast.title) {
              <div class="toast-title">{{ toast.title }}</div>
            }
            <div class="toast-message">{{ toast.message }}</div>
          </div>
          <button class="toast-close" (click)="service.dismiss(toast.id)" aria-label="Cerrar">✕</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    }

    .toast {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      min-width: 320px;
      max-width: 400px;
      background: #fff;
      border-radius: 10px;
      padding: 14px 16px;
      box-shadow: 0 10px 40px rgba(15,23,42,0.12), 0 2px 8px rgba(15,23,42,0.06);
      border-left: 4px solid transparent;
      pointer-events: all;
      animation: slideInToast 320ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
      position: relative;
    }

    @media (max-width: 480px) {
      .toast-container {
        left: 12px;
        right: 12px;
        bottom: max(12px, env(safe-area-inset-bottom, 0px));
      }

      .toast {
        min-width: 0;
        max-width: none;
        width: 100%;
      }
    }

    .toast[data-type="success"] { border-left-color: #22C55E; }
    .toast[data-type="error"]   { border-left-color: #EF4444; }
    .toast[data-type="warning"] { border-left-color: #F59E0B; }
    .toast[data-type="info"]    { border-left-color: #3B82F6; }

    .toast.toast-out {
      animation: slideOutToast 300ms cubic-bezier(0.4, 0, 1, 1) forwards;
    }

    .toast-icon {
      width: 22px;
      height: 22px;
      min-width: 22px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      margin-top: 1px;
    }

    .toast-icon[data-type="success"] { background: #DCFCE7; color: #16A34A; }
    .toast-icon[data-type="error"]   { background: #FEE2E2; color: #DC2626; }
    .toast-icon[data-type="warning"] { background: #FEF3C7; color: #D97706; }
    .toast-icon[data-type="info"]    { background: #DBEAFE; color: #2563EB; }

    .toast-body {
      flex: 1;
      min-width: 0;
    }

    .toast-title {
      font-size: 14px;
      font-weight: 600;
      color: #0F172A;
      margin-bottom: 2px;
      line-height: 1.3;
    }

    .toast-message {
      font-size: 13px;
      color: #334155;
      line-height: 1.5;
    }

    .toast-close {
      background: none;
      border: none;
      cursor: pointer;
      color: #94A3B8;
      font-size: 11px;
      padding: 2px 4px;
      border-radius: 4px;
      line-height: 1;
      margin-top: 1px;
      transition: color 150ms, background 150ms;
    }

    .toast-close:hover {
      color: #475569;
      background: #F1F5F9;
    }

    @keyframes slideInToast {
      from { opacity: 0; transform: translateX(110%); }
      to   { opacity: 1; transform: translateX(0); }
    }

    @keyframes slideOutToast {
      from { opacity: 1; transform: translateX(0); }
      to   { opacity: 0; transform: translateX(110%); }
    }
  `]
})
export class ToastComponent {
  service = inject(ToastService);
}
