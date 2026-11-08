import { Component } from '@angular/core';
import { LucideAngularModule, Bell } from 'lucide-angular';
import { NotificationsPanelComponent } from '../../shared/notifications-panel';

/**
 * Configuración → Notificaciones. Mismo panel que la campana de la cabecera:
 * vale para la app de Android y para el navegador (incluida la PWA de iPhone).
 */
@Component({
  selector: 'app-notifications-settings',
  standalone: true,
  imports: [LucideAngularModule, NotificationsPanelComponent],
  template: `
    <div class="section-card" id="notificaciones">
      <div class="section-header">
        <div class="section-icon">
          <lucide-icon [img]="Bell" [size]="22" class="brand" />
        </div>
        <div>
          <h2 class="section-title">Notificaciones</h2>
          <p class="section-desc">
            Avisos de mensajes nuevos, leads, registros en formularios y recuperación, aunque la app esté cerrada.
          </p>
        </div>
      </div>
      <app-notifications-panel />
    </div>
  `,
  styles: [`
    .section-card { background: var(--color-white); border: 1px solid var(--color-border); border-radius: var(--radius-lg); padding: 28px 32px; margin-bottom: 24px; }
    .section-header { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .section-icon { width: 44px; height: 44px; border-radius: var(--radius-lg); background: var(--color-brand-light); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .brand { color: var(--color-brand); }
    .section-title { font-family: var(--font-heading); font-size: 17px; font-weight: 700; margin: 0 0 2px; }
    .section-desc { font-size: 13px; color: var(--color-text-muted); margin: 0; }
    @media (max-width: 768px) { .section-card { padding: 20px; } }
  `],
})
export class NotificationsSettingsComponent {
  readonly Bell = Bell;
}
