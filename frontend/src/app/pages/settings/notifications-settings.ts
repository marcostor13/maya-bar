import { Component, computed, inject, signal } from '@angular/core';
import { LucideAngularModule, Bell, BellOff, CheckCircle2 } from 'lucide-angular';
import { PlatformService } from '../../core/platform.service';
import { PushService } from '../../core/push.service';
import { ToastService } from '../../shared/toast';

/**
 * Alta de notificaciones push. Solo aparece dentro de la app nativa: en el
 * navegador no hay nada que activar y una tarjeta desactivada solo confunde.
 */
@Component({
  selector: 'app-notifications-settings',
  standalone: true,
  imports: [LucideAngularModule],
  template: `
    @if (platform.isNative) {
      <div class="section-card">
        <div class="section-header">
          <div class="section-icon">
            <lucide-icon [img]="granted() ? Bell : BellOff" [size]="22" style="color: #E11D48;" />
          </div>
          <div>
            <h2 class="section-title">Notificaciones</h2>
            <p class="section-desc">
              Avisos de mensajes nuevos, registros en formularios y campañas, aunque la app esté cerrada.
            </p>
          </div>
        </div>

        @if (granted()) {
          <div class="status ok">
            <lucide-icon [img]="CheckCircle2" [size]="18" />
            <span>Notificaciones activadas en este dispositivo</span>
          </div>
        } @else if (denied()) {
          <div class="status denied">
            <span>
              Bloqueaste las notificaciones. Android no vuelve a preguntar: actívalas desde
              <strong>Ajustes del sistema → Aplicaciones → Maya → Notificaciones</strong>.
            </span>
          </div>
        } @else {
          <div class="section-footer">
            <button class="btn btn-primary" (click)="enable()" [disabled]="working()">
              <lucide-icon [img]="Bell" [size]="16" />
              {{ working() ? 'Activando…' : 'Activar notificaciones' }}
            </button>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .section-card { background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 28px 32px; margin-bottom: 24px; }
    .section-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .section-icon { width: 44px; height: 44px; border-radius: var(--radius-lg); background: var(--color-brand-light); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .section-title { font-family: var(--font-heading); font-size: 17px; font-weight: 700; margin: 0 0 2px; }
    .section-desc { font-size: 13px; color: var(--color-text-muted); margin: 0; }
    .section-footer { display: flex; align-items: center; justify-content: flex-end; margin-top: 8px; }

    .status { display: flex; align-items: center; gap: 10px; font-size: 13px; line-height: 1.5; border-radius: var(--radius-md); padding: 14px 16px; }
    .status.ok { background: #ECFDF5; color: #047857; }
    .status.denied { background: #FFFBEB; color: #92400E; }

    @media (max-width: 768px) {
      .section-card { padding: 20px; }
      .section-footer > .btn { flex: 1; justify-content: center; }
    }
  `],
})
export class NotificationsSettingsComponent {
  platform = inject(PlatformService);
  private push = inject(PushService);
  private toast = inject(ToastService);

  readonly Bell = Bell;
  readonly BellOff = BellOff;
  readonly CheckCircle2 = CheckCircle2;

  working = signal(false);
  granted = computed(() => this.push.permission() === 'granted');
  denied = computed(() => this.push.permission() === 'denied');

  async enable() {
    this.working.set(true);
    try {
      if (await this.push.enable()) {
        this.toast.success('Notificaciones activadas');
      }
    } finally {
      this.working.set(false);
    }
  }
}
