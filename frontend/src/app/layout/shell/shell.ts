import { Component, inject, signal, computed, type Signal } from '@angular/core';
import { NavigationEnd, RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../auth/auth.service';
import { PermissionsService } from '../../auth/permissions.service';
import { AppChromeService } from '../../shared/app-chrome';
import { ConversationsRealtimeService } from '../../shared/conversations-realtime';
import { PushService } from '../../shared/push.service';
import { PushCenterComponent } from '../../shared/push-center';
import {
  LucideAngularModule, Building2, LayoutDashboard, Store, Users, LogOut, ChevronLeft, ChevronRight,
  Zap, ContactRound, Megaphone, Settings, List, MapPin, Gauge, Bot, X, MessagesSquare,
  LayoutTemplate, FileText, Target, LayoutGrid, type LucideIconData,
} from 'lucide-angular';

/** Una entrada del menú. La misma alimenta el lateral, la barra inferior y la hoja "Más". */
interface NavItem {
  key: string;
  label: string;
  /** Etiqueta corta para la barra inferior, donde no caben dos palabras. */
  short?: string;
  icon: LucideIconData;
  route: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Orden de preferencia para la barra inferior del móvil: se cogen las cuatro
 * primeras a las que el usuario tenga acceso y el resto va a "Más".
 */
const TAB_PRIORITY: Record<string, string[]> = {
  SUPERADMIN: ['tenants'],
  IMPULSADOR: ['impulsador-panel', 'inbox', 'events', 'visits', 'my-guests', 'customers'],
  DEFAULT: ['dashboard', 'inbox', 'customers', 'events', 'leads', 'campaigns', 'locals'],
};

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LucideAngularModule, PushCenterComponent],
  template: `
    <div class="shell" [class.immersive]="immersive()">
      <!-- ══ Cabecera móvil ══ -->
      <header class="mobile-topbar" [class.scrolled]="scrolled()">
        <div class="topbar-title">
          <img src="/logo.png" alt="Maya" class="topbar-logo" />
          <h1>{{ currentTitle() }}</h1>
        </div>
        <div class="topbar-actions">
          <app-push-center />
          <button class="avatar-btn" (click)="moreOpen.set(true)" aria-label="Menú y perfil">
            {{ initials() }}
          </button>
        </div>
      </header>

      <!-- ══ Menú lateral (escritorio) ══ -->
      <aside class="sidebar" [class.collapsed]="collapsed()">
        <div class="sidebar-header" [class.collapsed-header]="collapsed()">
          @if (!collapsed()) {
            <div class="logo">
              <img src="/logo.png" alt="Maya" class="logo-img" />
            </div>
          }
          <button class="collapse-btn" (click)="collapsed.set(!collapsed())" [title]="collapsed() ? 'Expandir' : 'Colapsar'">
            <lucide-icon [img]="collapsed() ? ChevronRight : ChevronLeft" [size]="20" [strokeWidth]="2.5"></lucide-icon>
          </button>
        </div>

        <nav class="nav">
          @for (group of navGroups(); track group.label) {
            @if (!collapsed() && group.label) {
              <span class="nav-label">{{ group.label }}</span>
            }
            @for (item of group.items; track item.key) {
              <a class="nav-item" [routerLink]="item.route" routerLinkActive="active">
                <span class="nav-icon"><lucide-icon [img]="item.icon" [size]="18" [strokeWidth]="2.5"></lucide-icon></span>
                @if (!collapsed()) { <span class="nav-text">{{ item.label }}</span> }
                @if (badgeFor(item) > 0) {
                  <span class="nav-badge" [class.dot-only]="collapsed()">{{ badgeLabel(item) }}</span>
                }
              </a>
            }
          }
        </nav>

        <div class="sidebar-footer">
          <div class="footer-top">
            <div class="user-pill">
              <div class="avatar">{{ initials() }}</div>
              @if (!collapsed()) {
                <div class="user-meta">
                  <span class="user-name">{{ user()?.name || user()?.email }}</span>
                  <span class="user-role">{{ user()?.role }}</span>
                </div>
              }
            </div>
            @if (!collapsed()) { <app-push-center /> }
          </div>
          <button class="logout-btn" (click)="logout()" title="Cerrar sesión">
            <span class="nav-icon"><lucide-icon [img]="LogOut" [size]="18" [strokeWidth]="2.5"></lucide-icon></span>
            @if (!collapsed()) { <span>Salir</span> }
          </button>
        </div>
      </aside>

      <main class="main-content" (scroll)="onScroll($event)">
        <router-outlet />
      </main>

      <!-- ══ Barra inferior (móvil) ══ -->
      @if (tabs().length > 0) {
        <nav class="tabbar" aria-label="Navegación principal">
          @for (item of tabs(); track item.key) {
            <a class="tab" [routerLink]="item.route" routerLinkActive="active">
              <span class="tab-icon">
                <lucide-icon [img]="item.icon" [size]="21" [strokeWidth]="2.2"></lucide-icon>
                @if (badgeFor(item) > 0) {
                  <span class="tab-badge">{{ badgeLabel(item) }}</span>
                }
              </span>
              <span class="tab-label">{{ item.short || item.label }}</span>
            </a>
          }
          <button class="tab" [class.active]="moreOpen()" (click)="moreOpen.set(true)">
            <span class="tab-icon">
              <lucide-icon [img]="LayoutGrid" [size]="21" [strokeWidth]="2.2"></lucide-icon>
              @if (hiddenBadge() > 0) { <span class="tab-badge">{{ hiddenBadge() }}</span> }
            </span>
            <span class="tab-label">Más</span>
          </button>
        </nav>
      }

      <!-- ══ Hoja "Más" (móvil) ══ -->
      @if (moreOpen()) {
        <div class="more-overlay" (click)="moreOpen.set(false)">
          <div class="bottom-sheet more-sheet" (click)="$event.stopPropagation()">
            <div class="sheet-grip" aria-hidden="true"></div>
            <div class="more-head">
              <div class="user-pill">
                <div class="avatar">{{ initials() }}</div>
                <div class="user-meta">
                  <span class="user-name">{{ user()?.name || user()?.email }}</span>
                  <span class="user-role">{{ user()?.role }}</span>
                </div>
              </div>
              <button class="btn-icon close-btn" (click)="moreOpen.set(false)" aria-label="Cerrar">
                <lucide-icon [img]="X" [size]="18" [strokeWidth]="2.5"></lucide-icon>
              </button>
            </div>

            <div class="more-body">
              @for (group of navGroups(); track group.label) {
                @if (group.label) { <span class="more-label">{{ group.label }}</span> }
                <div class="more-grid">
                  @for (item of group.items; track item.key) {
                    <a class="more-item" [routerLink]="item.route" routerLinkActive="active" (click)="moreOpen.set(false)">
                      <span class="more-icon">
                        <lucide-icon [img]="item.icon" [size]="20" [strokeWidth]="2.2"></lucide-icon>
                        @if (badgeFor(item) > 0) { <span class="more-badge">{{ badgeLabel(item) }}</span> }
                      </span>
                      <span class="more-text">{{ item.label }}</span>
                    </a>
                  }
                </div>
              }
            </div>

            <div class="more-footer">
              <button class="btn btn-secondary logout-wide" (click)="logout()">
                <lucide-icon [img]="LogOut" [size]="17" [strokeWidth]="2.2"></lucide-icon>
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    :host {
      --sidebar-width: 260px;
      --sidebar-collapsed: 80px;
    }

    * { box-sizing: border-box; }

    .shell {
      display: flex;
      /* 100dvh y no 100vh: en móvil la barra del navegador se contrae al
         hacer scroll y con vh la barra inferior queda fuera de pantalla. */
      height: 100dvh;
      overflow: hidden;
      background-color: var(--color-bg-app);
    }

    /* ── Cabecera móvil ── */
    .mobile-topbar {
      display: none;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      /* El padding superior absorbe el notch / isla dinámica del teléfono. */
      height: calc(var(--app-header-h) + env(safe-area-inset-top, 0px));
      padding: env(safe-area-inset-top, 0px) 16px 0;
      background: var(--color-white);
      border-bottom: 1px solid var(--color-border);
      position: fixed;
      top: 0; left: 0; right: 0;
      /* Por encima de la barra inferior: la hoja de notificaciones se abre
         desde aquí y quedaría tapada por ella con un z-index menor. */
      z-index: 70;
    }

    /* Arriba del todo se ve el logo; al bajar, se cruza con el título de la
       pantalla — así no se repite el H1 que ya pinta cada página. */
    .topbar-title {
      position: relative;
      min-width: 0;
      flex: 1;
      height: 32px;
      display: flex;
      align-items: center;
    }
    .topbar-logo, .topbar-title h1 {
      position: absolute;
      left: 0;
      transition: opacity var(--transition-fast), transform var(--transition-fast);
    }
    .topbar-logo { height: 26px; width: auto; object-fit: contain; }
    .topbar-title h1 {
      margin: 0;
      max-width: 100%;
      font-family: var(--font-heading);
      font-size: 17px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      opacity: 0;
      transform: translateY(6px);
    }
    .mobile-topbar.scrolled .topbar-logo { opacity: 0; transform: translateY(-6px); }
    .mobile-topbar.scrolled .topbar-title h1 { opacity: 1; transform: none; }

    .topbar-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }

    .avatar-btn {
      width: 40px; height: 40px; min-width: 40px;
      border-radius: 50%;
      border: none;
      background: var(--color-brand);
      color: var(--color-white);
      font-family: var(--font-heading);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }

    /* ── Menú lateral ── */
    .sidebar {
      width: var(--sidebar-width);
      min-width: var(--sidebar-width);
      background: var(--color-white);
      border-right: 1px solid var(--color-border);
      display: flex;
      flex-direction: column;
      transition: width var(--transition-smooth), min-width var(--transition-smooth);
      overflow: hidden;
    }

    .sidebar.collapsed {
      width: var(--sidebar-collapsed);
      min-width: var(--sidebar-collapsed);
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 72px;
      padding: 0 20px;
      border-bottom: 1px solid var(--color-border);
      flex-shrink: 0;
    }

    .sidebar-header.collapsed-header { justify-content: center; padding: 0; }

    .logo { display: flex; align-items: center; overflow: hidden; }
    .logo-img { height: 32px; width: auto; object-fit: contain; }

    .collapse-btn {
      background: var(--color-bg-app);
      border: 1px solid var(--color-border);
      cursor: pointer;
      color: var(--color-text-muted);
      width: 32px; height: 32px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      transition: all var(--transition-fast);
      flex-shrink: 0;
    }

    .collapse-btn:hover {
      background: var(--color-white);
      color: var(--color-text-main);
      box-shadow: var(--shadow-sm);
    }

    .nav {
      flex: 1;
      padding: 16px 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .nav::-webkit-scrollbar { width: 4px; }
    .nav::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 4px; }

    .nav-label {
      display: block;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: var(--color-text-muted);
      padding: 16px 12px 8px;
      opacity: 0.7;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-radius: var(--radius-pill);
      color: var(--color-text-muted);
      text-decoration: none;
      font-size: 14px;
      font-weight: 600;
      transition: all var(--transition-fast);
      white-space: nowrap;
      cursor: pointer;
      position: relative;
    }

    .nav-item:hover { background: var(--color-bg-app); color: var(--color-text-main); }
    .nav-item.active { background: var(--color-brand-light); color: var(--color-brand); }
    .nav-item.active .nav-icon { color: var(--color-brand); }
    .nav-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }

    .nav-icon {
      min-width: 24px;
      flex-shrink: 0;
      display: flex;
      justify-content: center;
    }

    .nav-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 20px;
      height: 20px;
      padding: 0 6px;
      border-radius: var(--radius-pill);
      background: var(--color-brand);
      color: var(--color-white);
      font-size: 11px;
      font-weight: 700;
      flex-shrink: 0;
    }

    /* Colapsado no hay sitio para el número: basta un punto sobre el icono. */
    .nav-badge.dot-only {
      position: absolute;
      top: 8px;
      right: 14px;
      min-width: 9px;
      width: 9px;
      height: 9px;
      padding: 0;
      font-size: 0;
      box-shadow: 0 0 0 2px var(--color-white);
    }

    .sidebar-footer {
      border-top: 1px solid var(--color-border);
      padding: 16px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex-shrink: 0;
      background: var(--color-white);
    }

    .footer-top { display: flex; align-items: center; gap: 8px; min-width: 0; }

    .user-pill {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px;
      border-radius: var(--radius-pill);
      background: var(--color-bg-app);
      border: 1px solid var(--color-border);
      min-width: 0;
      flex: 1;
    }

    .avatar {
      width: 36px; height: 36px; min-width: 36px;
      border-radius: 50%;
      background: var(--color-brand);
      color: var(--color-white);
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 600;
      flex-shrink: 0;
    }

    .user-meta { display: flex; flex-direction: column; overflow: hidden; flex: 1; min-width: 0; }
    .user-name {
      font-size: 13px; font-weight: 600; color: var(--color-text-main);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .user-role {
      font-size: 11px; color: var(--color-text-muted);
      text-transform: uppercase; letter-spacing: 0.04em; white-space: nowrap;
    }

    .logout-btn {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-radius: var(--radius-pill);
      color: var(--color-error);
      font-size: 14px;
      font-weight: 600;
      transition: all var(--transition-fast);
      white-space: nowrap;
      cursor: pointer;
      border: none;
      background: transparent;
      text-align: left;
    }

    .logout-btn:hover { background: #FEF2F2; }

    .sidebar.collapsed .nav-item,
    .sidebar.collapsed .logout-btn { padding: 12px; justify-content: center; }
    .sidebar.collapsed .nav-icon { min-width: auto; }

    .main-content {
      flex: 1;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      background: var(--color-bg-app);
      min-width: 0;
    }

    /* ── Barra inferior ── */
    .tabbar { display: none; }

    .tab-badge, .more-badge {
      position: absolute;
      top: -4px;
      right: 4px;
      min-width: 17px;
      height: 17px;
      padding: 0 4px;
      border-radius: var(--radius-pill);
      background: var(--color-brand);
      color: var(--color-white);
      font-size: 10px;
      font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 0 0 2px var(--color-white);
    }

    /* ── Hoja "Más" ── */
    .more-overlay { display: none; }

    /* ══ Móvil (≤968px) ══ */
    @media (max-width: 968px) {
      .shell { flex-direction: column; }

      .mobile-topbar { display: flex; }

      .sidebar { display: none; }

      .main-content {
        width: 100%;
        /* La cabecera es fija y la barra inferior también: el contenido se
           reserva su alto para no quedar por debajo de ninguna de las dos. */
        padding-top: calc(var(--app-header-h) + env(safe-area-inset-top, 0px));
        padding-bottom: calc(var(--app-tabbar-h) + env(safe-area-inset-bottom, 0px));
        /* Sin esto, al llegar al final del scroll el gesto arrastra la página
           entera y en Chrome dispara el "tirar para recargar". */
        overscroll-behavior-y: contain;
      }

      /* Modo inmersivo: la pantalla es toda del contenido (chat abierto). */
      .shell.immersive .mobile-topbar,
      .shell.immersive .tabbar { display: none; }

      .shell.immersive .main-content {
        padding-top: env(safe-area-inset-top, 0px);
        padding-bottom: env(safe-area-inset-bottom, 0px);
      }

      .tabbar {
        position: fixed;
        bottom: 0; left: 0; right: 0;
        z-index: 60;
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: 1fr;
        align-items: stretch;
        height: calc(var(--app-tabbar-h) + env(safe-area-inset-bottom, 0px));
        padding-bottom: env(safe-area-inset-bottom, 0px);
        background: rgba(255, 255, 255, 0.92);
        backdrop-filter: blur(12px);
        border-top: 1px solid var(--color-border);
      }

      .tab {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        border: none;
        background: transparent;
        color: var(--color-text-muted);
        text-decoration: none;
        font-family: var(--font-base);
        font-size: 10.5px;
        font-weight: 600;
        cursor: pointer;
        padding: 6px 2px;
        -webkit-tap-highlight-color: transparent;
        transition: color var(--transition-fast);
      }

      .tab.active { color: var(--color-brand); }
      .tab.active .tab-icon { background: var(--color-brand-light); }

      .tab-icon {
        position: relative;
        display: flex; align-items: center; justify-content: center;
        width: 44px; height: 28px;
        border-radius: var(--radius-pill);
        transition: background var(--transition-fast);
      }

      .tab-label {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .more-overlay {
        display: flex;
        position: fixed;
        inset: 0;
        z-index: 200;
        background: rgba(15, 23, 42, 0.45);
        backdrop-filter: blur(3px);
        align-items: flex-end;
      }

      /* .bottom-sheet (styles.scss) pone el fondo, el radio, la sombra y la
         animación; aquí solo lo que es propio del menú. */
      .more-sheet {
        max-height: 86dvh;
        padding-left: 20px;
        padding-right: 20px;
        padding-bottom: calc(20px + var(--safe-bottom));
        gap: 0;
      }

      .more-head {
        display: flex;
        align-items: center;
        gap: 12px;
        padding-bottom: 14px;
        border-bottom: 1px solid var(--color-border);
      }

      .close-btn {
        border: 1px solid var(--color-border);
        background: var(--color-white);
        color: var(--color-text-muted);
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
        cursor: pointer;
      }

      .more-body { flex: 1; overflow-y: auto; padding: 6px 0 10px; }

      .more-label {
        display: block;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--color-text-muted);
        padding: 16px 4px 10px;
        opacity: 0.7;
      }

      .more-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
        gap: 8px;
      }

      .more-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 14px 6px;
        border-radius: var(--radius-md);
        background: var(--color-bg-app);
        color: var(--color-text-muted);
        text-decoration: none;
        font-size: 11.5px;
        font-weight: 600;
        text-align: center;
        -webkit-tap-highlight-color: transparent;
      }

      .more-item.active { background: var(--color-brand-light); color: var(--color-brand); }

      .more-icon {
        position: relative;
        display: flex; align-items: center; justify-content: center;
        width: 40px; height: 40px;
        border-radius: 50%;
        background: var(--color-white);
        box-shadow: var(--shadow-sm);
      }

      .more-badge { right: -2px; }

      .more-text { line-height: 1.25; }

      .more-footer { padding-top: 12px; border-top: 1px solid var(--color-border); }

      .logout-wide {
        width: 100%;
        gap: 8px;
        color: var(--color-error);
        min-height: 48px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .more-sheet { animation: none; }
    }
  `],
})
export class ShellComponent {
  private auth = inject(AuthService);
  private permissions = inject(PermissionsService);
  private realtime = inject(ConversationsRealtimeService);
  private chrome = inject(AppChromeService);
  private push = inject(PushService);
  private router = inject(Router);

  // Icons
  readonly LogOut = LogOut;
  readonly ChevronLeft = ChevronLeft;
  readonly ChevronRight = ChevronRight;
  readonly LayoutGrid = LayoutGrid;
  readonly X = X;

  collapsed = signal(false);
  moreOpen = signal(false);
  /** Pantalla completa (hilo de chat abierto en móvil): sin cabecera ni pestañas. */
  immersive = this.chrome.immersive;
  user = this.auth.currentUser;

  /** URL actual, para titular la cabecera móvil. */
  private url = signal('');
  /** El contenido ya está desplazado: la cabecera cambia el logo por el título. */
  scrolled = signal(false);

  constructor() {
    // El menú no puede pintarse antes de saber qué módulos tiene el usuario.
    void this.permissions.load();
    // Un solo websocket para toda la sesión: alimenta la insignia del menú y
    // la propia bandeja de entrada.
    this.realtime.connect();
    // Registra el service worker y renueva la suscripción push si ya la había.
    void this.push.init();

    this.url.set(this.router.url);
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(e => {
      this.url.set((e as NavigationEnd).urlAfterRedirects);
      this.moreOpen.set(false);
      this.scrolled.set(false);
    });
  }

  private role = computed(() => this.user()?.role ?? '');

  /**
   * La visibilidad ya no depende del rol sino de los módulos que la empresa le
   * haya configurado. `permissionsReady` fuerza el recálculo en cuanto llegan.
   */
  private permissionsReady = computed(() => this.permissions.ready());
  private can(moduleKey: string): boolean {
    this.permissionsReady();
    return this.permissions.can(moduleKey);
  }

  isSuperAdmin = computed(() => this.role() === 'SUPERADMIN');
  isImpulsador = computed(() => this.role() === 'IMPULSADOR');

  /** Catálogo completo del menú; cada grupo ya viene filtrado por permisos. */
  navGroups: Signal<NavGroup[]> = computed(() => {
    const keep = (items: NavItem[]) => items.filter(i => this.can(i.key));
    const groups: NavGroup[] = [];

    if (this.isSuperAdmin()) {
      return [{
        label: 'PLATAFORMA',
        items: [{ key: 'tenants', label: 'Empresas', icon: Building2, route: '/admin/tenants' }],
      }];
    }

    if (this.isImpulsador()) {
      const mine = keep([
        { key: 'impulsador-panel', label: 'Mi Panel', short: 'Panel', icon: Gauge, route: '/impulsador' },
        { key: 'visits', label: 'Visitas', icon: MapPin, route: '/visitas' },
        { key: 'events', label: 'Eventos', icon: Zap, route: '/events' },
        { key: 'my-guests', label: 'Mis Asistentes', short: 'Asistentes', icon: Users, route: '/mis-asistentes' },
        { key: 'inbox', label: 'Conversaciones', short: 'Chats', icon: MessagesSquare, route: '/inbox' },
      ]);
      const clients = keep([
        { key: 'customers', label: 'Contactos', icon: ContactRound, route: '/customers' },
        { key: 'leads', label: 'Seguimiento', icon: Target, route: '/leads' },
        { key: 'lists', label: 'Listas', icon: List, route: '/lists' },
        { key: 'campaigns', label: 'Campañas', icon: Megaphone, route: '/campaigns' },
      ]);
      if (mine.length) groups.push({ label: 'MI ACTIVIDAD', items: mine });
      if (clients.length) groups.push({ label: 'MIS CLIENTES', items: clients });
      return groups;
    }

    const operations = keep([
      { key: 'dashboard', label: 'Dashboard', short: 'Inicio', icon: LayoutDashboard, route: '/dashboard' },
      { key: 'locals', label: 'Mis Locales', short: 'Locales', icon: Store, route: '/locals' },
      { key: 'events', label: 'Eventos', icon: Zap, route: '/events' },
      { key: 'visits', label: 'Visitas', icon: MapPin, route: '/visitas' },
    ]);
    const clients = keep([
      { key: 'customers', label: 'Clientes', icon: ContactRound, route: '/customers' },
      { key: 'leads', label: 'Seguimiento', short: 'Leads', icon: Target, route: '/leads' },
      { key: 'lists', label: 'Listas', icon: List, route: '/lists' },
      { key: 'forms', label: 'Formularios', short: 'Forms', icon: FileText, route: '/forms' },
      { key: 'campaigns', label: 'Campañas', icon: Megaphone, route: '/campaigns' },
      { key: 'templates', label: 'Plantillas', icon: LayoutTemplate, route: '/plantillas' },
      { key: 'ai-agents', label: 'Agentes IA', short: 'Agentes', icon: Bot, route: '/ai-agents' },
      { key: 'inbox', label: 'Conversaciones', short: 'Chats', icon: MessagesSquare, route: '/inbox' },
    ]);
    const management = keep([
      { key: 'users', label: 'Usuarios', icon: Users, route: '/users' },
      { key: 'settings', label: 'Configuración', short: 'Ajustes', icon: Settings, route: '/settings' },
    ]);

    if (operations.length) groups.push({ label: 'OPERACIONES', items: operations });
    if (clients.length) groups.push({ label: 'CLIENTES', items: clients });
    if (management.length) groups.push({ label: 'GESTIÓN', items: management });
    return groups;
  });

  private allItems = computed(() => this.navGroups().flatMap(g => g.items));

  /** Las cuatro pestañas de la barra inferior, por orden de prioridad del rol. */
  tabs = computed<NavItem[]>(() => {
    const items = this.allItems();
    if (items.length === 0) return [];
    const priority =
      TAB_PRIORITY[this.isSuperAdmin() ? 'SUPERADMIN' : this.isImpulsador() ? 'IMPULSADOR' : 'DEFAULT'];
    const byKey = new Map(items.map(i => [i.key, i]));
    const picked: NavItem[] = [];
    for (const key of priority) {
      const item = byKey.get(key);
      if (item) picked.push(item);
      if (picked.length === 4) break;
    }
    // Si el rol tiene módulos que no están en la lista de prioridad, se
    // completa con los primeros del menú para no dejar huecos.
    for (const item of items) {
      if (picked.length === 4) break;
      if (!picked.some(p => p.key === item.key)) picked.push(item);
    }
    return picked;
  });

  /** Insignia de la entrada: hoy solo Conversaciones tiene contador. */
  badgeFor(item: NavItem): number {
    return item.key === 'inbox' ? this.realtime.unread() : 0;
  }

  badgeLabel(item: NavItem): string {
    const count = this.badgeFor(item);
    return count > 99 ? '99+' : String(count);
  }

  /** Avisos que quedan fuera de la barra inferior: los recoge el botón "Más". */
  hiddenBadge = computed(() => {
    const visible = new Set(this.tabs().map(t => t.key));
    return this.allItems()
      .filter(i => !visible.has(i.key))
      .reduce((total, item) => total + this.badgeFor(item), 0);
  });

  /** Título de la pantalla actual para la cabecera móvil. */
  currentTitle = computed(() => {
    const path = this.url().split('?')[0];
    const match = this.allItems()
      .filter(i => path === i.route || path.startsWith(`${i.route}/`))
      .sort((a, b) => b.route.length - a.route.length)[0];
    return match?.label ?? 'Maya';
  });

  onScroll(event: Event) {
    this.scrolled.set((event.target as HTMLElement).scrollTop > 24);
  }

  initials() {
    const u = this.user();
    if (!u) return '?';
    const src = u.name || u.email;
    return src.substring(0, 2).toUpperCase();
  }

  logout() {
    this.realtime.disconnect();
    // Antes de soltar el token: la baja del dispositivo va autenticada, y sin
    // ella quien sale seguiría recibiendo los avisos de la empresa en su móvil.
    void this.push.detach().finally(() => {
      this.auth.logout();
      void this.router.navigate(['/login']);
    });
  }
}
