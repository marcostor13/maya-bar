import { Component, computed, inject, Injectable, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpContext, HttpContextToken, HttpInterceptorFn } from '@angular/common/http';
import { finalize } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private _count = signal(0);
  isLoading = computed(() => this._count() > 0);

  increment() { this._count.update(c => c + 1); }
  decrement() { this._count.update(c => Math.max(0, c - 1)); }
}

/**
 * Marca una petición como de fondo: no enciende la barra de progreso.
 *
 * Es lo que usan los sondeos periódicos (contador de no leídos, refresco de la
 * bandeja): sin esto la barra parpadearía cada minuto sin que nadie haya pedido
 * nada.
 *
 *     this.http.get(url, { context: silentRequest() })
 */
export const SILENT_REQUEST = new HttpContextToken<boolean>(() => false);

export const silentRequest = () => new HttpContext().set(SILENT_REQUEST, true);

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(SILENT_REQUEST)) return next(req);
  const loading = inject(LoadingService);
  loading.increment();
  return next(req).pipe(
    finalize(() => loading.decrement())
  );
};

@Component({
  selector: 'app-progress-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="progress-bar-host">
      @if (loadingService.isLoading()) {
        <div class="progress-bar"></div>
      }
    </div>
  `,
  styles: [`
    .progress-bar-host {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 3px;
      z-index: 9999;
      pointer-events: none;
    }

    .progress-bar {
      width: 100%;
      height: 100%;
      background: linear-gradient(90deg, #FF5A5F 0%, #FF8A8F 50%, #FF5A5F 100%);
      background-size: 200% 100%;
      animation: shimmer 1.2s infinite linear, fadeInBar 150ms ease forwards;
    }

    @keyframes shimmer {
      from { background-position: 100% 0; }
      to   { background-position: -100% 0; }
    }

    @keyframes fadeInBar {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
  `]
})
export class ProgressBarComponent {
  loadingService = inject(LoadingService);
}
