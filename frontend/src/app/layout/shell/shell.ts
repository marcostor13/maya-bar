import { Component, inject, signal, computed } from '@angular/core';
import { NavigationStart, RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../auth/auth.service';
import { LucideAngularModule, Building2, LayoutDashboard, Store, UtensilsCrossed, ClipboardList, Users, LogOut, ChevronLeft, ChevronRight, Calendar, ChefHat, Zap, ContactRound, Megaphone, Settings, List, MapPin, Gauge, Bot, Menu, X } from 'lucide-angular';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LucideAngularModule],
  template: `
    <div class="shell">
      <header class="mobile-topbar">
        <button class="mobile-menu-btn" (click)="mobileOpen.set(true)" aria-label="Abrir menú">
          <lucide-icon [img]="Menu" [size]="22" [strokeWidth]="2.5"></lucide-icon>
        </button>
        <img src="/logo.png" alt="BAR" class="mobile-logo-img" />
        <div class="mobile-topbar-spacer"></div>
      </header>

      @if (mobileOpen()) {
        <div class="mobile-backdrop" (click)="mobileOpen.set(false)"></div>
      }

      <aside class="sidebar" [class.collapsed]="collapsed()" [class.mobile-open]="mobileOpen()">
        <div class="sidebar-header" [class.collapsed-header]="collapsed()">
          @if (!collapsed()) {
            <div class="logo">
              <img src="/logo.png" alt="BAR" class="logo-img" />
            </div>
          }
          <button class="collapse-btn desktop-only" (click)="collapsed.set(!collapsed())" [title]="collapsed() ? 'Expandir' : 'Colapsar'">
            <lucide-icon [img]="collapsed() ? ChevronRight : ChevronLeft" [size]="20" [strokeWidth]="2.5"></lucide-icon>
          </button>
          <button class="collapse-btn mobile-only" (click)="mobileOpen.set(false)" title="Cerrar" aria-label="Cerrar menú">
            <lucide-icon [img]="X" [size]="20" [strokeWidth]="2.5"></lucide-icon>
          </button>
        </div>

        <nav class="nav" (click)="mobileOpen.set(false)">
          @if (isSuperAdmin()) {
            @if (!collapsed()) {
              <span class="nav-label">PLATAFORMA</span>
            }
            <a class="nav-item" routerLink="/admin/tenants" routerLinkActive="active">
              <span class="nav-icon"><lucide-icon [img]="Building2" [size]="18" [strokeWidth]="2.5"></lucide-icon></span>
              @if (!collapsed()) { <span>Empresas</span> }
            </a>
          } @else if (isImpulsador()) {
            @if (!collapsed()) {
              <span class="nav-label">MI ACTIVIDAD</span>
            }
            <a class="nav-item" routerLink="/impulsador" routerLinkActive="active">
              <span class="nav-icon"><lucide-icon [img]="Gauge" [size]="18" [strokeWidth]="2.5"></lucide-icon></span>
              @if (!collapsed()) { <span>Mi Panel</span> }
            </a>
            <a class="nav-item" routerLink="/visitas" routerLinkActive="active">
              <span class="nav-icon"><lucide-icon [img]="MapPin" [size]="18" [strokeWidth]="2.5"></lucide-icon></span>
              @if (!collapsed()) { <span>Visitas</span> }
            </a>
            <a class="nav-item" routerLink="/events" routerLinkActive="active">
              <span class="nav-icon"><lucide-icon [img]="Zap" [size]="18" [strokeWidth]="2.5"></lucide-icon></span>
              @if (!collapsed()) { <span>Eventos</span> }
            </a>
            <a class="nav-item" routerLink="/mis-asistentes" routerLinkActive="active">
              <span class="nav-icon"><lucide-icon [img]="Users" [size]="18" [strokeWidth]="2.5"></lucide-icon></span>
              @if (!collapsed()) { <span>Mis Asistentes</span> }
            </a>
            @if (!collapsed()) {
              <span class="nav-label">MIS CLIENTES</span>
            }
            <a class="nav-item" routerLink="/customers" routerLinkActive="active">
              <span class="nav-icon"><lucide-icon [img]="ContactRound" [size]="18" [strokeWidth]="2.5"></lucide-icon></span>
              @if (!collapsed()) { <span>Contactos</span> }
            </a>
            <a class="nav-item" routerLink="/lists" routerLinkActive="active">
              <span class="nav-icon"><lucide-icon [img]="List" [size]="18" [strokeWidth]="2.5"></lucide-icon></span>
              @if (!collapsed()) { <span>Listas</span> }
            </a>
            <a class="nav-item" routerLink="/campaigns" routerLinkActive="active">
              <span class="nav-icon"><lucide-icon [img]="Megaphone" [size]="18" [strokeWidth]="2.5"></lucide-icon></span>
              @if (!collapsed()) { <span>Campañas</span> }
            </a>
          } @else {
            @if (!collapsed()) {
              <span class="nav-label">OPERACIONES</span>
            }
            @if (showDashboard()) {
              <a class="nav-item" routerLink="/dashboard" routerLinkActive="active">
                <span class="nav-icon"><lucide-icon [img]="LayoutDashboard" [size]="18" [strokeWidth]="2.5"></lucide-icon></span>
                @if (!collapsed()) { <span>Dashboard</span> }
              </a>
            }
            @if (showLocals()) {
              <a class="nav-item" routerLink="/locals" routerLinkActive="active">
                <span class="nav-icon"><lucide-icon [img]="Store" [size]="18" [strokeWidth]="2.5"></lucide-icon></span>
                @if (!collapsed()) { <span>Mis Locales</span> }
              </a>
            }
            @if (showMenu()) {
              <a class="nav-item" routerLink="/menu" routerLinkActive="active">
                <span class="nav-icon"><lucide-icon [img]="UtensilsCrossed" [size]="18" [strokeWidth]="2.5"></lucide-icon></span>
                @if (!collapsed()) { <span>Menú</span> }
              </a>
            }
            @if (showReservations()) {
              <a class="nav-item" routerLink="/reservations" routerLinkActive="active">
                <span class="nav-icon"><lucide-icon [img]="Calendar" [size]="18" [strokeWidth]="2.5"></lucide-icon></span>
                @if (!collapsed()) { <span>Reservas</span> }
              </a>
            }
            @if (showOrders()) {
              <a class="nav-item" routerLink="/orders" routerLinkActive="active">
                <span class="nav-icon"><lucide-icon [img]="ClipboardList" [size]="18" [strokeWidth]="2.5"></lucide-icon></span>
                @if (!collapsed()) { <span>Pedidos</span> }
              </a>
            }
            @if (showKds()) {
              <a class="nav-item" routerLink="/kds" routerLinkActive="active">
                <span class="nav-icon"><lucide-icon [img]="ChefHat" [size]="18" [strokeWidth]="2.5"></lucide-icon></span>
                @if (!collapsed()) { <span>KDS</span> }
              </a>
            }
            @if (showEvents()) {
              <a class="nav-item" routerLink="/events" routerLinkActive="active">
                <span class="nav-icon"><lucide-icon [img]="Zap" [size]="18" [strokeWidth]="2.5"></lucide-icon></span>
                @if (!collapsed()) { <span>Eventos</span> }
              </a>
            }
            @if (showCustomers()) {
              @if (!collapsed()) {
                <span class="nav-label">CLIENTES</span>
              }
              <a class="nav-item" routerLink="/customers" routerLinkActive="active">
                <span class="nav-icon"><lucide-icon [img]="ContactRound" [size]="18" [strokeWidth]="2.5"></lucide-icon></span>
                @if (!collapsed()) { <span>Clientes</span> }
              </a>
              <a class="nav-item" routerLink="/lists" routerLinkActive="active">
                <span class="nav-icon"><lucide-icon [img]="List" [size]="18" [strokeWidth]="2.5"></lucide-icon></span>
                @if (!collapsed()) { <span>Listas</span> }
              </a>
              <a class="nav-item" routerLink="/campaigns" routerLinkActive="active">
                <span class="nav-icon"><lucide-icon [img]="Megaphone" [size]="18" [strokeWidth]="2.5"></lucide-icon></span>
                @if (!collapsed()) { <span>Campañas</span> }
              </a>
              <a class="nav-item" routerLink="/ai-agents" routerLinkActive="active">
                <span class="nav-icon"><lucide-icon [img]="Bot" [size]="18" [strokeWidth]="2.5"></lucide-icon></span>
                @if (!collapsed()) { <span>Agentes IA</span> }
              </a>
            }
            @if (showVisitas()) {
              <a class="nav-item" routerLink="/visitas" routerLinkActive="active">
                <span class="nav-icon"><lucide-icon [img]="MapPin" [size]="18" [strokeWidth]="2.5"></lucide-icon></span>
                @if (!collapsed()) { <span>Visitas</span> }
              </a>
            }
            @if (showUsers()) {
              @if (!collapsed()) {
                <span class="nav-label">GESTIÓN</span>
              }
              <a class="nav-item" routerLink="/users" routerLinkActive="active">
                <span class="nav-icon"><lucide-icon [img]="Users" [size]="18" [strokeWidth]="2.5"></lucide-icon></span>
                @if (!collapsed()) { <span>Usuarios</span> }
              </a>
              <a class="nav-item" routerLink="/settings" routerLinkActive="active">
                <span class="nav-icon"><lucide-icon [img]="Settings" [size]="18" [strokeWidth]="2.5"></lucide-icon></span>
                @if (!collapsed()) { <span>Configuración</span> }
              </a>
            }
          }
        </nav>

        <div class="sidebar-footer">
          <div class="user-pill">
            <div class="avatar">{{ initials() }}</div>
            @if (!collapsed()) {
              <div class="user-meta">
                <span class="user-name">{{ user()?.name || user()?.email }}</span>
                <span class="user-role">{{ user()?.role }}</span>
              </div>
            }
          </div>
          <button class="logout-btn" (click)="logout()" title="Cerrar sesión">
            <span class="nav-icon"><lucide-icon [img]="LogOut" [size]="18" [strokeWidth]="2.5"></lucide-icon></span>
            @if (!collapsed()) { <span>Salir</span> }
          </button>
        </div>
      </aside>

      <main class="main-content">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [`
    :host {
      --sidebar-width: 260px;
      --sidebar-collapsed: 80px;
      --mobile-topbar-height: 60px;
    }

    * {
      box-sizing: border-box;
    }

    .desktop-only { display: flex; }
    .mobile-only { display: none; }

    /* ── Mobile top bar ── */
    .mobile-topbar {
      display: none;
      align-items: center;
      gap: 12px;
      height: var(--mobile-topbar-height);
      padding: 0 16px;
      padding-top: env(safe-area-inset-top, 0);
      background: var(--color-white);
      border-bottom: 1px solid var(--color-border);
      position: sticky;
      top: 0;
      z-index: 50;
      flex-shrink: 0;
    }

    .mobile-menu-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      min-width: 40px;
      border-radius: 50%;
      border: 1px solid var(--color-border);
      background: var(--color-bg-app);
      color: var(--color-text-main);
      cursor: pointer;
    }

    .mobile-logo-img {
      height: 28px;
      width: auto;
      object-fit: contain;
    }

    .mobile-topbar-spacer {
      flex: 1;
    }

    .mobile-backdrop {
      display: none;
    }

    .shell {
      display: flex;
      height: 100vh;
      overflow: hidden;
      background-color: var(--color-bg-app);
    }

    /* ── Sidebar ── */
    .sidebar {
      width: var(--sidebar-width);
      min-width: var(--sidebar-width);
      background: var(--color-white);
      border-right: 1px solid var(--color-border);
      display: flex;
      flex-direction: column;
      transition: width var(--transition-smooth), min-width var(--transition-smooth);
      overflow-x: hidden;
      overflow-y: hidden;
    }

    .sidebar.collapsed {
      width: var(--sidebar-collapsed);
      min-width: var(--sidebar-collapsed);
    }

    /* ── Header ── */
    .sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 72px;
      padding: 0 20px;
      border-bottom: 1px solid var(--color-border);
      flex-shrink: 0;
    }

    .sidebar-header.collapsed-header {
      justify-content: center;
      padding: 0;
    }

    .logo {
      display: flex;
      align-items: center;
      overflow: hidden;
    }

    .logo-img {
      height: 32px;
      width: auto;
      object-fit: contain;
    }

    .collapse-btn {
      background: var(--color-bg-app);
      border: 1px solid var(--color-border);
      cursor: pointer;
      color: var(--color-text-muted);
      font-size: 18px;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all var(--transition-fast);
      flex-shrink: 0;
    }

    .collapse-btn:hover {
      background: var(--color-white);
      color: var(--color-text-main);
      box-shadow: var(--shadow-sm);
    }

    /* ── Nav ── */
    .nav {
      flex: 1;
      padding: 16px 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .nav::-webkit-scrollbar {
      width: 4px;
    }
    .nav::-webkit-scrollbar-thumb {
      background: var(--color-border);
      border-radius: 4px;
    }

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
      border: none;
      background: transparent;
      text-align: left;
    }

    .nav-item:hover {
      background: var(--color-bg-app);
      color: var(--color-text-main);
    }

    .nav-item.active {
      background: var(--color-brand-light);
      color: var(--color-brand);
    }

    .nav-item.active .nav-icon {
      color: var(--color-brand);
    }

    .nav-icon {
      font-size: 18px;
      min-width: 24px;
      text-align: center;
      flex-shrink: 0;
      display: flex;
      justify-content: center;
    }

    /* ── Footer / User area ── */
    .sidebar-footer {
      border-top: 1px solid var(--color-border);
      padding: 16px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex-shrink: 0;
      background: var(--color-white);
    }

    .user-pill {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px;
      border-radius: var(--radius-pill);
      background: var(--color-bg-app);
      border: 1px solid var(--color-border);
      min-width: 0;
    }

    .avatar {
      width: 36px;
      height: 36px;
      min-width: 36px;
      border-radius: 50%;
      background: var(--color-brand);
      color: var(--color-white);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 600;
      flex-shrink: 0;
    }

    .user-meta {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      flex: 1;
      min-width: 0;
    }

    .user-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--color-text-main);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .user-role {
      font-size: 11px;
      color: var(--color-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      white-space: nowrap;
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

    .logout-btn:hover {
      background: #FEF2F2;
    }

    .sidebar.collapsed .nav-item,
    .sidebar.collapsed .logout-btn {
      padding: 12px;
      justify-content: center;
    }

    .sidebar.collapsed .nav-icon {
      min-width: auto;
    }

    /* ── Main content ── */
    .main-content {
      flex: 1;
      overflow-y: auto;
      background: var(--color-bg-app);
      min-width: 0;
    }

    /* ── Mobile layout (≤968px) ── */
    @media (max-width: 968px) {
      .desktop-only { display: none; }
      .mobile-only { display: flex; }

      .mobile-topbar {
        display: flex;
      }

      .shell {
        flex-direction: column;
      }

      .sidebar {
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        z-index: 200;
        width: min(300px, 84vw);
        min-width: 0;
        max-width: 300px;
        transform: translateX(-100%);
        box-shadow: var(--shadow-lg);
        padding-top: env(safe-area-inset-top, 0);
      }

      .sidebar.collapsed {
        width: min(300px, 84vw);
        min-width: 0;
      }

      .sidebar.mobile-open {
        transform: translateX(0);
      }

      .sidebar.collapsed:not(.mobile-open) .nav-item span:not(.nav-icon),
      .sidebar.collapsed:not(.mobile-open) .user-meta,
      .sidebar.collapsed:not(.mobile-open) .logout-btn span:not(.nav-icon),
      .sidebar.collapsed:not(.mobile-open) .nav-label {
        display: none;
      }

      .sidebar.mobile-open .nav-item,
      .sidebar.mobile-open .logout-btn {
        padding: 12px 16px;
        justify-content: flex-start;
      }

      .sidebar.mobile-open .nav-icon {
        min-width: 24px;
      }

      .mobile-backdrop {
        display: block;
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.45);
        backdrop-filter: blur(2px);
        z-index: 150;
      }

      .main-content {
        width: 100%;
      }

      .nav-item, .logout-btn {
        min-height: 44px;
      }

      .mobile-menu-btn {
        min-height: 44px;
      }
    }
  `],
})
export class ShellComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  // Icons
  readonly Building2 = Building2;
  readonly LayoutDashboard = LayoutDashboard;
  readonly Store = Store;
  readonly UtensilsCrossed = UtensilsCrossed;
  readonly ClipboardList = ClipboardList;
  readonly Users = Users;
  readonly LogOut = LogOut;
  readonly ChevronLeft = ChevronLeft;
  readonly ChevronRight = ChevronRight;
  readonly Calendar = Calendar;
  readonly ChefHat = ChefHat;
  readonly Zap = Zap;
  readonly ContactRound = ContactRound;
  readonly Megaphone = Megaphone;
  readonly Bot = Bot;
  readonly Settings = Settings;
  readonly List = List;
  readonly MapPin = MapPin;
  readonly Gauge = Gauge;
  readonly Menu = Menu;
  readonly X = X;

  collapsed = signal(false);
  mobileOpen = signal(false);
  user = this.auth.currentUser;

  constructor() {
    this.router.events.pipe(filter(e => e instanceof NavigationStart)).subscribe(() => {
      this.mobileOpen.set(false);
    });
  }

  private role = computed(() => this.user()?.role ?? '');
  isSuperAdmin    = computed(() => this.role() === 'SUPERADMIN');
  isImpulsador    = computed(() => this.role() === 'IMPULSADOR');
  showDashboard   = computed(() => ['TENANT_ADMIN','MANAGER','HOST','SERVER','KITCHEN','BAR','MARKETING'].includes(this.role()));
  showLocals      = computed(() => ['TENANT_ADMIN','MANAGER'].includes(this.role()));
  showMenu        = computed(() => ['TENANT_ADMIN','MANAGER','KITCHEN','BAR'].includes(this.role()));
  showOrders      = computed(() => ['TENANT_ADMIN','MANAGER','HOST','SERVER','KITCHEN','BAR'].includes(this.role()));
  showReservations = computed(() => ['TENANT_ADMIN','MANAGER','HOST'].includes(this.role()));
  showKds          = computed(() => ['TENANT_ADMIN','MANAGER','KITCHEN','BAR'].includes(this.role()));
  showEvents       = computed(() => ['TENANT_ADMIN','MANAGER','MARKETING'].includes(this.role()));
  showCustomers    = computed(() => ['TENANT_ADMIN','MANAGER','MARKETING'].includes(this.role()));
  showVisitas      = computed(() => ['TENANT_ADMIN','MANAGER'].includes(this.role()));
  showUsers       = computed(() => this.role() === 'TENANT_ADMIN');

  initials() {
    const u = this.user();
    if (!u) return '?';
    const src = u.name || u.email;
    return src.substring(0, 2).toUpperCase();
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
