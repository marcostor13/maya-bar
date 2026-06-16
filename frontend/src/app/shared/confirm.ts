import { Component, HostListener, inject, Injectable, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ConfirmState {
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  danger: boolean;
  resolve: (v: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private _state = signal<ConfirmState | null>(null);
  state = this._state.asReadonly();

  confirm(opts: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    danger?: boolean;
  }): Promise<boolean> {
    return new Promise(resolve => {
      this._state.set({
        title: opts.title,
        message: opts.message,
        confirmText: opts.confirmText ?? 'Confirmar',
        cancelText: opts.cancelText ?? 'Cancelar',
        danger: opts.danger ?? false,
        resolve
      });
    });
  }

  respond(value: boolean) {
    const s = this._state();
    if (s) {
      s.resolve(value);
      this._state.set(null);
    }
  }
}

@Component({
  selector: 'app-confirm',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (service.state(); as state) {
      <div class="confirm-backdrop" (click)="service.respond(false)">
        <div class="confirm-card animate-scale-in" (click)="$event.stopPropagation()">
          <div class="confirm-icon-wrap" [class.danger]="state.danger">
            @if (state.danger) {
              <span class="confirm-icon">!</span>
            } @else {
              <span class="confirm-icon">⚠</span>
            }
          </div>
          <div class="confirm-title">{{ state.title }}</div>
          <div class="confirm-message">{{ state.message }}</div>
          <div class="confirm-actions">
            <button class="btn btn-secondary" (click)="service.respond(false)" aria-label="Cancelar">
              {{ state.cancelText }}
            </button>
            <button
              class="btn"
              [class.btn-primary]="!state.danger"
              [class.btn-danger]="state.danger"
              (click)="service.respond(true)"
              autofocus
              aria-label="Confirmar"
            >
              {{ state.confirmText }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .confirm-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.4);
      backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px);
      z-index: 2000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      animation: fadeBackdrop 200ms ease forwards;
    }

    .confirm-card {
      background: #fff;
      border-radius: 14px;
      padding: 32px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(15,23,42,0.15), 0 4px 16px rgba(15,23,42,0.08);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 0;
    }

    .confirm-icon-wrap {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #FEF3C7;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      margin-bottom: 16px;
    }

    .confirm-icon-wrap.danger {
      background: #FEE2E2;
    }

    .confirm-icon { line-height: 1; }

    .confirm-title {
      font-size: 17px;
      font-weight: 600;
      color: #0F172A;
      margin-bottom: 10px;
      font-family: 'Sora', sans-serif;
    }

    .confirm-message {
      font-size: 14px;
      color: #334155;
      line-height: 1.6;
      margin-bottom: 28px;
    }

    .confirm-actions {
      display: flex;
      gap: 10px;
      justify-content: center;
      width: 100%;
    }

    .confirm-actions .btn {
      flex: 1;
    }

    .btn-danger {
      background: #EF4444;
      color: #fff;
      border-color: transparent;
    }

    .btn-danger:hover {
      background: #DC2626;
    }

    @keyframes fadeBackdrop {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    @keyframes scaleIn {
      from { opacity: 0; transform: scale(0.94); }
      to   { opacity: 1; transform: scale(1); }
    }

    .animate-scale-in {
      animation: scaleIn 200ms ease forwards;
    }
  `]
})
export class ConfirmDialogComponent {
  service = inject(ConfirmService);

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.service.state()) this.service.respond(false);
  }
}
