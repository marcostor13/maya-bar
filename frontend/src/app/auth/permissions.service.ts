import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface MyPermissions {
  role: string;
  modules: string[];
  /** módulo → acciones permitidas. Sin entrada = todas. */
  actions?: Record<string, string[]>;
  /** Locales asignados. Vacío = todos. */
  localIds?: string[];
}

/**
 * Matriz de respaldo, idéntica a la que siembra el backend. Solo se usa si
 * `/me/permissions` falla: sin ella, un error de red dejaría al usuario con el
 * menú vacío y sin poder navegar a ningún sitio.
 */
const FALLBACK: Record<string, string[]> = {
  TENANT_ADMIN: [
    'dashboard', 'locals', 'events',
    'customers', 'lists', 'forms', 'campaigns', 'templates', 'ai-agents', 'inbox',
    'visits', 'users', 'settings',
  ],
  MANAGER: [
    'dashboard', 'locals', 'events',
    'customers', 'lists', 'forms', 'campaigns', 'templates', 'ai-agents', 'inbox',
    'visits',
  ],
  MARKETING: [
    'dashboard', 'events', 'customers', 'lists', 'forms', 'campaigns',
    'ai-agents', 'inbox',
  ],
  HOST: ['dashboard'],
  SERVER: ['dashboard'],
  KITCHEN: ['dashboard'],
  BAR: ['dashboard'],
  IMPULSADOR: [
    'impulsador-panel', 'visits', 'events', 'my-guests', 'inbox',
    'customers', 'lists', 'campaigns',
  ],
};

@Injectable({ providedIn: 'root' })
export class PermissionsService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  private modules = signal<string[] | null>(null);
  private actions = signal<Record<string, string[]>>({});
  private locals = signal<string[]>([]);
  private loading: Promise<void> | null = null;

  constructor() {
    // AuthService avisa al entrar y al salir para que no se arrastre el menú
    // del usuario anterior.
    this.auth.permissionsReset = () => this.reset();
  }

  /** true cuando ya se sabe qué puede ver el usuario. */
  readonly ready = computed(() => this.modules() !== null);

  /**
   * Carga los permisos una vez por sesión. Los guards la esperan, así que
   * varias rutas concurrentes comparten la misma petición.
   */
  load(): Promise<void> {
    if (this.modules() !== null) return Promise.resolve();
    if (this.loading) return this.loading;

    this.loading = firstValueFrom(
      this.http.get<MyPermissions>(`${environment.apiUrl}/me/permissions`),
    )
      .then((res) => {
        this.modules.set(res.modules ?? []);
        this.actions.set(res.actions ?? {});
        this.locals.set(res.localIds ?? []);
      })
      .catch(() => {
        // Respaldo local: mejor los permisos de siempre que ninguno.
        this.modules.set(this.fallbackModules());
      })
      .finally(() => {
        this.loading = null;
      });

    return this.loading;
  }

  /** ¿El usuario accede a este módulo? */
  can(moduleKey: string): boolean {
    const mods = this.modules() ?? this.fallbackModules();
    return mods.includes(moduleKey);
  }

  /**
   * ¿Puede ejecutar esta acción en el módulo? Sin restricción configurada se
   * permiten todas, que es como se comportaba la plataforma antes.
   */
  canAct(moduleKey: string, action: 'create' | 'edit' | 'delete'): boolean {
    if (!this.can(moduleKey)) return false;
    const allowed = this.actions()[moduleKey];
    return allowed === undefined ? true : allowed.includes(action);
  }

  /** Locales asignados. Vacío significa todos los de la empresa. */
  assignedLocals(): string[] {
    return this.locals();
  }

  /** Se llama al cambiar de sesión para no arrastrar los permisos del anterior. */
  reset(): void {
    this.modules.set(null);
    this.actions.set({});
    this.locals.set([]);
    this.loading = null;
  }

  /** Fuerza una recarga tras editar la matriz de roles. */
  async refresh(): Promise<void> {
    this.reset();
    await this.load();
  }

  private fallbackModules(): string[] {
    const role = this.auth.currentUser()?.role ?? '';
    if (role === 'SUPERADMIN') return Object.values(FALLBACK).flat();
    return FALLBACK[role] ?? [];
  }
}
