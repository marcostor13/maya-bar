import { Component, computed, inject, signal } from '@angular/core';
import { LucideAngularModule, Bell, BellRing, Download, X } from 'lucide-angular';
import { PushService } from './push.service';
import { ToastService } from './toast';
import { NotificationsPanelComponent } from './notifications-panel';
import { NativePushService } from '../core/push.service';
import { PlatformService } from '../core/platform.service';

/**
 * Campana de notificaciones: activa/desactiva los avisos push del móvil y
 * ofrece instalar la plataforma como app.
 *
 * Vive en la cabecera para que activarlos sea lo primero que se ve al entrar
 * desde el móvil, que es donde sirven de algo.
 */
@Component({
  selector: 'app-push-center',
  standalone: true,
  imports: [LucideAngularModule, NotificationsPanelComponent],
  template: `
    <button
      class="bell-btn"
      [class.on]="active()"
      (click)="open.set(true)"
      [title]="active() ? 'Notificaciones activas' : 'Activar notificaciones'"
      aria-label="Notificaciones"
    >
      <lucide-icon [img]="active() ? BellRing : Bell" [size]="20" [strokeWidth]="2.2"></lucide-icon>
      @if (!active() && (isNative || push.supported())) {
        <span class="dot" aria-hidden="true"></span>
      }
    </button>

    @if (open()) {
      <div class="overlay" (click)="open.set(false)">
        <div class="sheet" (click)="$event.stopPropagation()">
          <div class="sheet-grip" aria-hidden="true"></div>
          <div class="sheet-head">
            <div>
              <h2>Notificaciones</h2>
              <p class="sheet-sub">Avisos de chats, leads y formularios en tus dispositivos.</p>
            </div>
            <button class="btn-icon btn-ghost" (click)="open.set(false)" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="18" [strokeWidth]="2.4"></lucide-icon>
            </button>
          </div>

          <div class="sheet-body">
            <app-notifications-panel />

            @if (push.canInstall()) {
              <button class="btn btn-secondary full install" (click)="install()">
                <lucide-icon [img]="Download" [size]="16" [strokeWidth]="2.2"></lucide-icon>
                Instalar la app en este dispositivo
              </button>
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .bell-btn {
      position: relative;
      display: flex; align-items: center; justify-content: center;
      width: 40px; height: 40px; min-width: 40px;
      border-radius: 50%;
      border: 1px solid var(--color-border);
      background: var(--color-white);
      color: var(--color-text-muted);
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    .bell-btn:hover { color: var(--color-text-main); box-shadow: var(--shadow-sm); }
    .bell-btn.on { color: var(--color-brand); background: var(--color-brand-light); border-color: transparent; }
    .dot {
      position: absolute; top: 7px; right: 8px;
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--color-brand);
      box-shadow: 0 0 0 2px var(--color-white);
    }

    .overlay {
      position: fixed; inset: 0;
      background: rgba(15, 23, 42, 0.45);
      backdrop-filter: blur(3px);
      display: flex; align-items: center; justify-content: center;
      z-index: 300;
    }

    .sheet {
      width: calc(100% - 48px); max-width: 440px;
      background: var(--color-white);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-lg);
      padding: 28px 32px;
      max-height: calc(100vh - 48px);
      overflow-y: auto;
      animation: sheetIn var(--transition-spring);
    }
    /* En escritorio es un modal centrado: el asa solo aparece en móvil. */
    .sheet-grip { display: none; }
    .sheet-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .sheet-head h2 { margin: 0 0 4px; font-family: var(--font-heading); font-size: 19px; }
    .sheet-sub { margin: 0; font-size: 13px; color: var(--color-text-muted); }
    .sheet-body { display: flex; flex-direction: column; gap: 14px; margin-top: 18px; }

    .full { width: 100%; gap: 8px; }
    .install { margin-top: 4px; }

    @keyframes sheetIn {
      from { opacity: 0; transform: translateY(16px) scale(0.98); }
      to   { opacity: 1; transform: none; }
    }

    /* En móvil se comporta como una hoja inferior nativa. */
    @media (max-width: 640px) {
      .overlay { align-items: flex-end; }
      .sheet {
        width: 100%; max-width: none;
        border-radius: var(--radius-lg) var(--radius-lg) 0 0;
        padding: 12px 20px calc(24px + env(safe-area-inset-bottom, 0px));
        animation: sheetUp var(--transition-spring);
      }
    }

  `],
})
export class PushCenterComponent {
  push = inject(PushService);
  private native = inject(NativePushService);
  private toast = inject(ToastService);
  readonly isNative = inject(PlatformService).isNative;

  readonly Bell = Bell;
  readonly BellRing = BellRing;
  readonly Download = Download;
  readonly X = X;

  open = signal(false);

  /** Hay avisos activos en este dispositivo (app Android o navegador). */
  active = computed(() =>
    this.isNative
      ? this.native.permission() === 'granted' && this.native.registered()
      : this.push.permission() === 'granted' && this.push.subscribed(),
  );

  async install() {
    const accepted = await this.push.promptInstall();
    if (accepted) this.toast.success('Maya se está instalando en tu dispositivo');
  }
}
