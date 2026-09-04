import { Component, computed, inject, signal } from '@angular/core';
import {
  LucideAngularModule, Bell, BellOff, BellRing, Download, Share, Plus, X, Check,
} from 'lucide-angular';
import { PushService } from './push.service';
import { ToastService } from './toast';

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
  imports: [LucideAngularModule],
  template: `
    <button
      class="bell-btn"
      [class.on]="active()"
      (click)="open.set(true)"
      [title]="active() ? 'Notificaciones activas' : 'Activar notificaciones'"
      aria-label="Notificaciones"
    >
      <lucide-icon [img]="active() ? BellRing : Bell" [size]="20" [strokeWidth]="2.2"></lucide-icon>
      @if (!active() && push.supported()) {
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
              <p class="sheet-sub">Avisos en este dispositivo cuando entre un mensaje nuevo.</p>
            </div>
            <button class="btn-icon btn-ghost" (click)="open.set(false)" aria-label="Cerrar">
              <lucide-icon [img]="X" [size]="18" [strokeWidth]="2.4"></lucide-icon>
            </button>
          </div>

          <div class="sheet-body">
            @switch (state()) {
              @case ('unsupported') {
                <p class="note">Este navegador no admite notificaciones push. Prueba desde Chrome en Android o instalando la plataforma en tu iPhone.</p>
              }
              @case ('needs-install') {
                <p class="note">En iPhone y iPad las notificaciones solo funcionan con la plataforma instalada en la pantalla de inicio.</p>
                <ol class="steps">
                  <li>
                    <lucide-icon [img]="Share" [size]="15" [strokeWidth]="2.2"></lucide-icon>
                    Toca <strong>Compartir</strong> en la barra de Safari.
                  </li>
                  <li>
                    <lucide-icon [img]="Plus" [size]="15" [strokeWidth]="2.2"></lucide-icon>
                    Elige <strong>Añadir a pantalla de inicio</strong>.
                  </li>
                  <li>
                    <lucide-icon [img]="BellRing" [size]="15" [strokeWidth]="2.2"></lucide-icon>
                    Abre Maya desde el icono nuevo y vuelve aquí para activarlas.
                  </li>
                </ol>
              }
              @case ('server-off') {
                <p class="note">Las notificaciones aún no están habilitadas en el servidor. Pide a tu administrador que configure las claves VAPID.</p>
              }
              @case ('denied') {
                <p class="note">Bloqueaste las notificaciones para este sitio. Vuelve a permitirlas desde los ajustes del navegador (candado de la barra de direcciones) y recarga.</p>
              }
              @case ('on') {
                <div class="status ok">
                  <lucide-icon [img]="Check" [size]="16" [strokeWidth]="2.6"></lucide-icon>
                  Notificaciones activas en este dispositivo.
                </div>
                <div class="sheet-actions">
                  <button class="btn btn-secondary" [disabled]="push.busy()" (click)="test()">Enviar prueba</button>
                  <button class="btn btn-ghost danger" [disabled]="push.busy()" (click)="disable()">
                    <lucide-icon [img]="BellOff" [size]="16" [strokeWidth]="2.2"></lucide-icon>
                    Desactivar
                  </button>
                </div>
              }
              @default {
                <p class="note">Recibe un aviso en el móvil por cada mensaje nuevo de Conversaciones, aunque tengas la app cerrada.</p>
                <button class="btn btn-primary btn-lg full" [disabled]="push.busy()" (click)="enable()">
                  <lucide-icon [img]="BellRing" [size]="17" [strokeWidth]="2.2"></lucide-icon>
                  {{ push.busy() ? 'Activando…' : 'Activar notificaciones' }}
                </button>
              }
            }

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
      animation: sheetIn var(--transition-spring);
    }
    /* En escritorio es un modal centrado: el asa solo aparece en móvil. */
    .sheet-grip { display: none; }
    .sheet-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .sheet-head h2 { margin: 0 0 4px; font-family: var(--font-heading); font-size: 19px; }
    .sheet-sub { margin: 0; font-size: 13px; color: var(--color-text-muted); }
    .sheet-body { display: flex; flex-direction: column; gap: 14px; margin-top: 18px; }

    .note { margin: 0; font-size: 13.5px; line-height: 1.55; color: var(--color-text-muted); }

    .steps { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 10px; font-size: 13.5px; color: var(--color-text-main); }
    .steps li { line-height: 1.5; }
    .steps lucide-icon { vertical-align: -3px; margin-right: 4px; color: var(--color-brand); }

    .status {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 16px; border-radius: var(--radius-md);
      font-size: 13.5px; font-weight: 600;
    }
    .status.ok { background: #ECFDF5; color: var(--color-success); }

    .sheet-actions { display: flex; gap: 10px; flex-wrap: wrap; }
    .sheet-actions .btn { flex: 1; gap: 8px; }
    .btn-ghost { background: transparent; border: 1px solid var(--color-border); color: var(--color-text-muted); }
    .btn-ghost.danger { color: var(--color-error); }
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
      .sheet-actions .btn { min-height: 46px; }
    }

  `],
})
export class PushCenterComponent {
  push = inject(PushService);
  private toast = inject(ToastService);

  readonly Bell = Bell;
  readonly BellOff = BellOff;
  readonly BellRing = BellRing;
  readonly Download = Download;
  readonly Share = Share;
  readonly Plus = Plus;
  readonly X = X;
  readonly Check = Check;

  open = signal(false);

  active = computed(() => this.push.permission() === 'granted' && this.push.subscribed());

  /** Qué se le puede ofrecer al usuario según navegador, permiso y servidor. */
  state = computed<'unsupported' | 'needs-install' | 'server-off' | 'denied' | 'on' | 'off'>(() => {
    if (!this.push.supported()) return this.push.needsInstall() ? 'needs-install' : 'unsupported';
    if (this.push.needsInstall()) return 'needs-install';
    if (!this.push.serverEnabled()) return 'server-off';
    if (this.push.permission() === 'denied') return 'denied';
    return this.active() ? 'on' : 'off';
  });

  async enable() {
    const ok = await this.push.enable();
    if (ok) this.toast.success('Notificaciones activadas en este dispositivo');
    else if (this.push.permission() === 'denied')
      this.toast.error('El navegador bloqueó las notificaciones');
    else this.toast.error('No se pudieron activar las notificaciones');
  }

  async disable() {
    await this.push.disable();
    this.toast.info('Ya no recibirás avisos en este dispositivo');
  }

  async test() {
    try {
      const sent = await this.push.sendTest();
      if (sent > 0) this.toast.success('Notificación de prueba enviada');
      else this.toast.warning('No hay dispositivos activos para este usuario');
    } catch {
      this.toast.error('No se pudo enviar la prueba');
    }
  }

  async install() {
    const accepted = await this.push.promptInstall();
    if (accepted) this.toast.success('Maya se está instalando en tu dispositivo');
  }
}
