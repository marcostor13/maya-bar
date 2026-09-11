import { Component, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  LucideAngularModule, LucideIconData,
  LayoutDashboard, MessagesSquare, ContactRound, Megaphone, Zap, List, FileText,
  Gauge, MapPin, Users, Ellipsis,
} from 'lucide-angular';
import { PermissionsService } from '../../auth/permissions.service';
import { NativeAppService } from '../../core/native-app.service';

export interface TabDef {
  /** Clave del módulo en `PermissionsService`. */
  module: string;
  route: string;
  label: string;
  icon: LucideIconData;
}

/**
 * Orden de preferencia de las pestañas. Se muestran las primeras a las que el
 * usuario tenga acceso; el resto del menú queda bajo "Más".
 */
const TABS_DEFAULT: TabDef[] = [
  { module: 'dashboard', route: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
  { module: 'inbox', route: '/inbox', label: 'Chats', icon: MessagesSquare },
  { module: 'customers', route: '/customers', label: 'Clientes', icon: ContactRound },
  { module: 'campaigns', route: '/campaigns', label: 'Campañas', icon: Megaphone },
  { module: 'events', route: '/events', label: 'Eventos', icon: Zap },
  { module: 'lists', route: '/lists', label: 'Listas', icon: List },
  { module: 'forms', route: '/forms', label: 'Formularios', icon: FileText },
];

const TABS_IMPULSADOR: TabDef[] = [
  { module: 'impulsador-panel', route: '/impulsador', label: 'Panel', icon: Gauge },
  { module: 'visits', route: '/visitas', label: 'Visitas', icon: MapPin },
  { module: 'events', route: '/events', label: 'Eventos', icon: Zap },
  { module: 'my-guests', route: '/mis-asistentes', label: 'Asistentes', icon: Users },
  { module: 'inbox', route: '/inbox', label: 'Chats', icon: MessagesSquare },
];

/** Cuántas pestañas antes de "Más". Con el slot de "Más" son 5, el máximo
 *  cómodo a 360px de ancho. */
const MAX_TABS = 4;

/**
 * Pestañas visibles para un usuario. Se llama desde un `computed`, así que la
 * lectura de `permissions.ready()` registra la dependencia y la barra se
 * repinta en cuanto llega la matriz de módulos.
 */
export function tabsFor(role: string, permissions: PermissionsService): TabDef[] {
  permissions.ready();
  // SUPERADMIN no tiene módulos de empresa: se queda con el menú lateral.
  if (role === 'SUPERADMIN') return [];
  const source = role === 'IMPULSADOR' ? TABS_IMPULSADOR : TABS_DEFAULT;
  return source.filter((t) => permissions.can(t.module)).slice(0, MAX_TABS);
}

@Component({
  selector: 'app-bottom-tabs',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, LucideAngularModule],
  template: `
    <nav class="tabs" aria-label="Navegación principal">
      @for (tab of tabs(); track tab.route) {
        <a
          class="tab"
          [routerLink]="tab.route"
          routerLinkActive="active"
          (click)="tapped()"
        >
          <lucide-icon [img]="tab.icon" [size]="22" [strokeWidth]="2.2" />
          <span class="tab-label">{{ tab.label }}</span>
        </a>
      }
      <button class="tab" type="button" (click)="openMore()" aria-label="Más opciones">
        <lucide-icon [img]="Ellipsis" [size]="22" [strokeWidth]="2.2" />
        <span class="tab-label">Más</span>
      </button>
    </nav>
  `,
  styles: [`
    :host {
      display: block;
      flex-shrink: 0;
    }

    .tabs {
      display: flex;
      align-items: stretch;
      background: var(--color-white);
      border-top: 1px solid var(--color-border);
      /* La barra se extiende por debajo de la barra de gestos de Android y la
         pinta con su propio fondo; el contenido táctil queda por encima. */
      padding-bottom: var(--safe-bottom);
      padding-left: var(--safe-left);
      padding-right: var(--safe-right);
      box-shadow: 0 -4px 20px -8px rgba(15, 23, 42, 0.12);
    }

    .tab {
      flex: 1 1 0;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      height: 60px;
      padding: 0 2px;
      border: none;
      background: transparent;
      color: var(--color-text-muted);
      text-decoration: none;
      font-family: var(--font-base);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: color var(--transition-fast);
      position: relative;
      -webkit-tap-highlight-color: transparent;
    }

    .tab-label {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tab.active {
      color: var(--color-brand);
    }

    /* Indicador superior en vez de fondo pill: a cinco columnas el pill se ve
       apretado y corta las etiquetas largas. */
    .tab.active::before {
      content: '';
      position: absolute;
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 28px;
      height: 3px;
      border-radius: 0 0 var(--radius-pill) var(--radius-pill);
      background: var(--color-brand);
    }

    .tab:active {
      background: var(--color-bg-app);
    }
  `],
})
export class BottomTabsComponent {
  private native = inject(NativeAppService);

  tabs = input.required<TabDef[]>();

  /** Abrir el menú completo (drawer). */
  more = output<void>();

  readonly Ellipsis = Ellipsis;

  openMore() {
    this.tapped();
    this.more.emit();
  }

  tapped() {
    void this.native.tap();
  }
}
